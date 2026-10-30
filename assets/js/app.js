/* ATS Tester — interface */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = ATS.esc;

  const state = {
    docs: { cv: null, letter: null }, // { text, name, meta }
    paste: { cv: false, letter: false },
    result: null,
    ignored: new Set(),
    answers: {}, // réponses aux questions éliminatoires { id: true | false }
    editingId: null,
    rawTab: "cv",
    loading: {}, // lectures de fichiers en cours
    dialogId: null,
  };

  /* ---------- Onglets ---------- */
  // « Mes candidatures » est une sous-vue de l'analyseur : une seule entrée d'historique (#candidatures),
  // que le bouton retour du navigateur ou de la page referme.
  // mode : clic (par défaut), "replace" (démarrage) ou "pop" (retour / avance du navigateur)
  function showView(v, mode) {
    const current = $("#view-history").hidden ? "analyze" : "history";
    if (mode === "pop" && v === current) return;
    $$(".tab").forEach((t) => { const on = t.dataset.view === v; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); });
    $("#view-analyze").hidden = v !== "analyze";
    $("#view-history").hidden = v !== "history";
    if (v === "history") renderHistory();
    if (mode === "replace") history.replaceState(null, "", v === "history" ? "#candidatures" : location.pathname);
    else if (mode !== "pop" && v !== current) {
      if (v === "history") history.pushState({ view: "history" }, "", "#candidatures");
      else if (history.state && history.state.view === "history") history.back(); // l'adresse suit ; la vue est déjà affichée
      else history.replaceState(null, "", location.pathname);
    }
    window.scrollTo({ top: 0 });
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  window.addEventListener("popstate", () => showView(location.hash === "#candidatures" ? "history" : "analyze", "pop"));
  // Bouton « Retour » de la barre du haut : depuis Mes candidatures, revient d'abord à l'analyseur
  ATS.onBack = () => {
    if ($("#view-history").hidden) return false;
    showView("analyze");
    return true;
  };
  // Liens de la page (accroche, méthode, analyseur) : reviennent sur la vue Analyser si besoin
  $$("[data-goto]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    if ($("#view-analyze").hidden) showView("analyze");
    const target = document.getElementById(a.dataset.goto);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  /* ---------- Fiche de poste ---------- */
  const jd = $("#jd");
  function setJdStatus(html, cls) { $("#jd-status").innerHTML = cls ? '<span class="' + cls + '">' + html + "</span>" : html; }
  async function importJd(file) {
    setJdStatus("Lecture de « " + esc(file.name) + " »…");
    try {
      const { text } = await ATS.extractFile(file);
      if (!text.trim()) throw new Error("Aucun texte trouvé dans ce fichier (document scanné ?).");
      jd.value = text;
      setJdStatus("✓ Texte importé depuis « " + esc(file.name) + " ». Tu peux le corriger ci-dessus.");
    } catch (e) { setJdStatus("✗ " + esc(e.message), "error"); }
  }
  $("#jd-file").accept = ATS.ACCEPT;
  $("#jd-file").addEventListener("change", (e) => { if (e.target.files[0]) importJd(e.target.files[0]); e.target.value = ""; });
  dropTarget($("#jd-drop"), importJd);

  /* ---------- Documents ---------- */
  function dropTarget(el, onFile) {
    ["dragenter", "dragover"].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove("is-over"); }));
    el.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }

  ["cv", "letter"].forEach((kind) => {
    const drop = $("#drop-" + kind), input = $("#file-" + kind);
    input.accept = ATS.ACCEPT;
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { if (input.files[0]) loadDoc(kind, input.files[0]); input.value = ""; });
    dropTarget(drop, (f) => loadDoc(kind, f));
  });

  $$("[data-toggle-paste]").forEach((b) => b.addEventListener("click", () => togglePaste(b.dataset.togglePaste)));
  function togglePaste(kind, force) {
    const on = force !== undefined ? force : !state.paste[kind];
    state.paste[kind] = on;
    $("#drop-" + kind).hidden = on;
    $("#paste-" + kind).hidden = !on;
    $('[data-toggle-paste="' + kind + '"]').textContent = on ? "Importer un fichier à la place" : "Coller le texte à la place";
    if (on) $("#paste-" + kind).focus();
    renderDocStatus(kind);
  }
  $$(".paste").forEach((t) => t.addEventListener("input", () => renderDocStatus(t.id.replace("paste-", ""))));

  function loadDoc(kind, file) {
    const p = readDoc(kind, file);
    state.loading[kind] = p;
    p.finally(() => { if (state.loading[kind] === p) delete state.loading[kind]; });
    return p;
  }

  async function readDoc(kind, file) {
    const st = $("#status-" + kind);
    st.innerHTML = "Lecture de « " + esc(file.name) + " »…";
    try {
      const res = await ATS.extractFile(file);
      state.docs[kind] = { text: res.text, name: file.name, meta: res.meta, file };
      renderDocStatus(kind);
    } catch (e) {
      state.docs[kind] = null;
      $("#drop-" + kind).classList.remove("has-file");
      st.innerHTML = '<span class="err">✗ ' + esc(e.message) + "</span>";
    }
  }

  function wc(t) { return (t.match(/[\p{L}\p{N}][\p{L}\p{N}\-]*/gu) || []).length; }

  function renderDocStatus(kind) {
    const st = $("#status-" + kind), drop = $("#drop-" + kind);
    if (state.paste[kind]) {
      const t = $("#paste-" + kind).value.trim();
      st.innerHTML = t ? wc(t) + " mots collés" : "";
      return;
    }
    const d = state.docs[kind];
    drop.classList.toggle("has-file", !!d);
    if (!d) { st.innerHTML = ""; resetDrop(kind); return; }
    const bits = [d.meta.type.toUpperCase()];
    if (d.meta.pages) bits.push(d.meta.pages + " page" + (d.meta.pages > 1 ? "s" : ""));
    bits.push(wc(d.text) + " mots lus");
    const warn = d.text.replace(/\s/g, "").length < 200 ? ' · <span class="err">presque aucun texte lisible</span>' : "";
    st.innerHTML = '<span class="ok">✓ ' + esc(d.name) + "</span> · " + bits.join(" · ") + warn + ' · <button class="link" data-clear="' + kind + '">retirer</button>';
    $('[data-clear="' + kind + '"]', st).addEventListener("click", () => { state.docs[kind] = null; renderDocStatus(kind); });
    drop.querySelector(".drop-text-main").innerHTML = "Fichier chargé : <b>" + esc(d.name) + "</b>";
    drop.querySelector(".drop-text-sub").textContent = "Clique ou glisse un autre fichier pour le remplacer";
  }

  function resetDrop(kind) {
    const d = $("#drop-" + kind);
    d.classList.remove("has-file");
    d.querySelector(".drop-text-main").innerHTML = (kind === "cv" ? "Glisse ton CV ici" : "Glisse ta lettre ici") + " ou <u>clique pour choisir</u>";
    d.querySelector(".drop-text-sub").textContent = kind === "cv" ? "PDF ou DOCX recommandés" : "PDF, DOCX ou TXT";
  }

  function getDoc(kind) {
    if (state.paste[kind]) {
      const t = $("#paste-" + kind).value.trim();
      return t ? { text: t, name: "Texte collé", meta: { type: "texte" } } : null;
    }
    return state.docs[kind];
  }

  /* ---------- Analyse ---------- */
  $("#btn-analyze").addEventListener("click", async () => {
    const btn = $("#btn-analyze");
    const pending = Object.values(state.loading);
    if (pending.length) {
      btn.disabled = true; btn.textContent = "Lecture des fichiers…";
      await Promise.allSettled(pending);
      btn.disabled = false; btn.textContent = "Analyser ma candidature";
    }
    const run = prepare();
    if (!run) return;
    btn.disabled = true;
    await think(run);
    btn.disabled = false;
    show(run, true);
  });
  function prepare() {
    const err = $("#analyze-error");
    err.textContent = "";
    const jdText = jd.value.trim();
    const cv = getDoc("cv"), letter = getDoc("letter");
    if (jdText.length < 80) { err.textContent = "Ajoute la fiche de poste (au moins quelques lignes)."; jd.focus(); return null; }
    if (!cv && !letter) { err.textContent = "Ajoute ton CV et/ou ta lettre de motivation."; return null; }
    const result = ATS.analyze({ jdText, title: $("#title").value, company: $("#company").value, cv, letter, ignored: [...state.ignored], answers: state.answers });
    return { result, ctx: { jdText, cv, letter } };
  }
  function show(run, scroll) {
    state.result = run.result;
    renderResults(run.result, run.ctx);
    $("#results").hidden = false;
    if (scroll) $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    if (scroll && run.result.global >= 75 && run.result.status !== "DISQUALIFIED_AUTO" && ATS.fx) setTimeout(() => ATS.fx.confetti(), 500);
  }
  function runAnalysis(scroll) { const run = prepare(); if (run) show(run, scroll); }

  // Temps de réflexion : les étapes défilent avec les vrais chiffres de l'analyse
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function think({ result: r, ctx }) {
    const main = r.cv || r.letter;
    const docs = ctx.cv && ctx.letter ? "ton CV et ta lettre" : ctx.cv ? "ton CV" : "ta lettre";
    const words = (ctx.cv ? wc(ctx.cv.text) : 0) + (ctx.letter ? wc(ctx.letter.text) : 0);
    const nRecos = r.recommendations.length;
    const pf = r.cv ? r.cv.profile : null;
    const failed = r.knockouts.filter((k) => k.status === "fail").length;
    const steps = [
      ["📄", "Lecture de " + docs, words.toLocaleString("fr-FR") + " mots"],
      pf ? ["🧩", "Découpage du CV : expériences, diplômes", pf.experiences.length + " exp. · " + pf.formations.length + " dipl."]
        : ["🔍", "Repérage des mots-clés de l'offre", (r.keywords.skills.length + r.keywords.others.length) + " trouvés"],
      ["🧮", "Comparaison avec " + (r.cv ? "ton CV" : "ta lettre"), main.coverage.filter((c) => c.found).length + " / " + main.coverage.length + " mots-clés"],
      ["⛔", "Questions éliminatoires", failed ? failed + " non rempli" + (failed > 1 ? "s" : "") : r.knockouts.length + " critère" + (r.knockouts.length > 1 ? "s" : "")],
      ["⚖️", "Calcul des 3 piliers (récence, durée)", r.cv ? "CV " + r.cv.score + "/100" : "Lettre " + r.letter.score + "/100"],
      ["✍️", "Rédaction de tes recommandations", nRecos + " conseil" + (nRecos > 1 ? "s" : "")],
    ];
    const box = $("#think"), list = $("#think-steps"), bar = $("#think-bar"), dots = $("#think .dots");
    list.innerHTML = steps.map(([ic, label, val]) => '<li><span class="st" aria-hidden="true"></span><span>' + ic + " " + esc(label) + '</span><span class="val">' + esc(val) + "</span></li>").join("");
    $("#think-label").textContent = "Analyse en cours"; dots.hidden = false; bar.style.width = "0";
    box.hidden = false; document.body.style.overflow = "hidden";
    const items = $$("li", list);
    for (let i = 0; i < items.length; i++) {
      items[i].classList.add("is-active");
      await wait(reduceMotion ? 60 : 450 + Math.random() * 350);
      items[i].classList.replace("is-active", "is-done");
      $(".st", items[i]).textContent = "✓";
      bar.style.width = ((i + 1) / items.length) * 100 + "%";
    }
    $("#think-label").textContent = "C'est prêt ✨"; dots.hidden = true;
    await wait(reduceMotion ? 50 : 500);
    box.hidden = true; document.body.style.overflow = "";
  }

  function tone(score) { return score === null || score === undefined ? "none" : ATS.verdict(score).tone; }
  function setRing(el, score) {
    el.style.setProperty("--v", score === null ? 0 : score);
    el.dataset.tone = tone(score);
    const span = el.querySelector("span");
    if (score === null) span.textContent = "—";
    else if (ATS.fx) ATS.fx.countUp(span, score, 900);
    else span.textContent = score;
  }

  function renderResults(r, ctx) {
    setRing($("#ring-global"), r.global);
    setRing($("#ring-cv"), r.cv ? r.cv.score : null);
    setRing($("#ring-letter"), r.letter ? r.letter.score : null);
    const v = ATS.verdictFor(r);
    const vEl = $("#verdict"); vEl.textContent = v.label + "\u00A0" + (v.disqualified ? "⛔" : { good: "🚀", mid: "💪", bad: "🛠️" }[v.tone] || ""); vEl.className = "verdict " + v.tone;
    $("#results").classList.toggle("is-disqualified", !!v.disqualified);
    const nSkills = r.keywords.skills.length + r.keywords.others.length;
    const cvFound = r.cv ? r.cv.coverage.filter((c) => c.found).length : 0;
    const cvTot = r.cv ? r.cv.coverage.length : 0;
    $("#summary-line").textContent = nSkills + " mots-clés repérés dans l'offre" + (r.cv ? " · " + cvFound + " / " + cvTot + " présents dans ton CV" : "") + ".";
    const ps = r.cv ? r.cv.pillarScores : null, pv = (x) => (x === null ? "n/a" : x + " %");
    $("#cv-sub").textContent = r.cv ? "Compétences " + pv(ps.hard) + " · Contexte " + pv(ps.context) + " · Atouts " + pv(ps.nice) : "Non fourni";
    renderKnockouts(r);
    renderPillars(r);
    renderProfile(r);
    $("#letter-sub").textContent = r.letter ? "Mots-clés " + r.letter.kwScore + " % · Forme " + r.letter.formatScore + " %" : "Non fournie";

    // Recommandations
    $("#recos").innerHTML = r.recommendations.length
      ? r.recommendations.map((x) => '<li class="' + x.level + '">' + x.text + "</li>").join("")
      : '<li class="none">Rien à signaler : ta candidature couvre bien l\'offre. Relis-la une dernière fois et envoie-la !</li>';

    // Tableau des mots-clés
    const rows = [];
    const cvMap = new Map((r.cv ? r.cv.coverage : []).map((c) => [c.key, c]));
    const lmMap = new Map((r.letter ? r.letter.coverage : []).map((c) => [c.key, c]));
    const groups = [...Object.entries(ATS.CATEGORIES), ["other", "Autres termes fréquents de l'offre"]];
    const all = [...r.keywords.skills, ...r.keywords.others];
    for (const [cat, label] of groups) {
      const items = all.filter((k) => k.cat === cat).sort((a, b) => (b.weight || 0) - (a.weight || 0));
      if (!items.length) continue;
      rows.push('<tr class="cat"><td colspan="4">' + esc(label) + "</td></tr>");
      for (const k of items) {
        const ign = state.ignored.has(k.key);
        const c = cvMap.get(k.key), l = lmMap.get(k.key);
        const cell = (x, provided) => !provided ? '<td class="na">—</td>' : ign ? '<td class="na">ignoré</td>' : x && x.found ? '<td class="yes">✓ ' + (x.found > 1 ? "×" + x.found : "") + "</td>" : '<td class="no">✗</td>';
        rows.push('<tr class="kw' + (ign ? " ignored" : "") + '" data-key="' + esc(k.key) + '" title="' + (ign ? "Cliquer pour réintégrer" : "Cliquer pour ignorer ce mot-clé") + '">' +
          "<td>" + esc(k.label) + (k.bonus ? '<span class="tag">un plus</span>' : "") + "</td>" +
          '<td class="count">×' + (k.count || 1) + "</td>" + cell(c, !!r.cv) + cell(l, !!r.letter) + "</tr>");
      }
    }
    const tbody = $("#kw-table tbody");
    tbody.innerHTML = rows.join("") || '<tr><td colspan="4" class="muted">Aucun mot-clé repéré. La fiche de poste est-elle complète ?</td></tr>';
    $$("tr.kw", tbody).forEach((tr) => tr.addEventListener("click", () => {
      const k = tr.dataset.key;
      state.ignored.has(k) ? state.ignored.delete(k) : state.ignored.add(k);
      runAnalysis(false);
    }));

    // Vérifications
    const checkList = (res, el) => {
      el.innerHTML = !res ? '<li class="muted">Document non fourni.</li>' : res.checks.map((c) =>
        '<li class="' + c.status + '"><span class="ic">' + (c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗") + "</span><div><div class=\"lbl\">" + esc(c.label) + '</div><div class="det">' + esc(c.detail) + "</div></div></li>").join("");
    };
    checkList(r.cv, $("#checks-cv"));
    checkList(r.letter, $("#checks-letter"));

    // Texte brut
    state.rawCtx = ctx;
    renderRaw();

    // Prompt pour une IA générative
    renderPrompt();

    // Formulaire d'enregistrement
    if (!$("#save-date").value) $("#save-date").value = new Date().toISOString().slice(0, 10);
    $("#btn-save").textContent = editingId() ? "Mettre à jour la candidature" : "Enregistrer dans Mes candidatures";
    $("#save-msg").textContent = "";
  }

  $$(".seg-btn").forEach((b) => b.addEventListener("click", () => {
    state.rawTab = b.dataset.raw;
    $$(".seg-btn").forEach((x) => x.classList.toggle("is-active", x === b));
    renderRaw();
  }));
  function renderRaw() {
    const ctx = state.rawCtx, r = state.result;
    if (!ctx || !r) return;
    const doc = state.rawTab === "cv" ? ctx.cv : ctx.letter;
    const res = state.rawTab === "cv" ? r.cv : r.letter;
    if (!doc) { $("#raw-text").innerHTML = '<span class="muted">Document non fourni.</span>'; return; }
    const found = new Set(res.coverage.filter((c) => c.found).map((c) => c.key));
    $("#raw-text").innerHTML = ATS.highlight(doc.text, found, ctx.jdText, $("#title").value) || '<span class="muted">(aucun texte)</span>';
  }

  /* ---------- Prompt pour une IA générative ---------- */
  const AI_TARGETS = { both: "Le CV et la lettre", cv: "Le CV seulement", letter: "La lettre seulement", "cv-newletter": "Le CV + rédiger une lettre" };
  function renderPrompt() {
    const ctx = state.rawCtx, r = state.result;
    if (!ctx || !r) return;
    const sel = $("#ai-target");
    const keys = ctx.cv && ctx.letter ? ["both", "cv", "letter"] : ctx.cv ? ["cv", "cv-newletter"] : ["letter"];
    const prev = sel.value;
    sel.innerHTML = keys.map((k) => '<option value="' + k + '">' + AI_TARGETS[k] + "</option>").join("");
    sel.value = keys.includes(prev) ? prev : keys[0];
    sel.disabled = keys.length < 2;
    const mode = $("#ai-mode").value;
    const prompt = ATS.buildPrompt(r, {
      title: $("#title").value, company: $("#company").value, url: $("#url").value, jdText: ctx.jdText,
      cvText: ctx.cv ? ctx.cv.text : "", letterText: ctx.letter ? ctx.letter.text : "",
      cvMeta: ctx.cv ? ctx.cv.meta : null, letterMeta: ctx.letter ? ctx.letter.meta : null,
      target: sel.value, mode, maskContacts: $("#ai-mask").checked,
    });
    $("#ai-prompt").value = prompt;
    $("#ai-size").textContent = prompt.length.toLocaleString("fr-FR") + " caractères";
    $("#ai-msg").textContent = "";
    const docs = ctx.cv && ctx.letter ? "ton CV et ta lettre" : ctx.cv ? "ton CV" : "ta lettre";
    $("#ai-steps").innerHTML = (mode === "edit" ? [
      "Copie le prompt, ouvre ton IA et <b>joins-lui aussi " + docs + " en PDF</b> : elle verra ta mise en page et la place disponible.",
      "Réponds à ses questions sur les compétences manquantes.",
      "Applique ses modifications dans ton <b>fichier d'origine</b> (Word, Canva, Google Docs…) avec Ctrl+F pour retrouver chaque passage, puis réexporte en PDF. Si tu n'as que le PDF, ouvre-le dans Word (Fichier &gt; Ouvrir) et vérifie la mise en page.",
      "Réimporte ton nouveau PDF ici et relance l'analyse pour mesurer le progrès.",
    ] : [
      "Copie le prompt et colle-le dans ton IA.",
      "Réponds à ses questions sur les compétences manquantes.",
      "Vérifie chaque phrase proposée, puis colle le nouveau texte dans un modèle de CV simple (une colonne) et exporte en PDF.",
      "Réimporte ton nouveau CV ici et relance l'analyse pour mesurer le progrès.",
    ]).map((s) => "<li>" + s + "</li>").join("");
  }
  $("#ai-mode").addEventListener("change", renderPrompt);
  $("#ai-target").addEventListener("change", renderPrompt);
  $("#ai-mask").addEventListener("change", renderPrompt);
  $("#go-ai").addEventListener("click", () => $("#ai-card").scrollIntoView({ behavior: "smooth", block: "start" }));

  function copyText(text) {
    // Copie synchrone d'abord : elle aboutit avant que l'onglet de l'IA ne prenne le focus
    const active = document.activeElement;
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    if (active) active.focus({ preventScroll: true });
    if (ok) return Promise.resolve();
    return navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("Copie impossible"));
  }
  function copyPrompt(aiName) {
    const msg = $("#ai-msg");
    copyText($("#ai-prompt").value).then(
      () => { msg.textContent = "✓ Prompt copié. Colle-le dans " + (aiName || "ton IA") + " (Ctrl+V ou appui long > Coller)."; },
      () => { msg.innerHTML = '<span class="error">Copie impossible : le texte est sélectionné, copie-le à la main (Ctrl+C).</span>'; $("#ai-prompt").select(); });
  }
  $("#btn-copy-prompt").addEventListener("click", () => copyPrompt());
  $$("[data-ai]").forEach((a) => a.addEventListener("click", () => copyPrompt(a.textContent)));

  /* ---------- Enregistrement ---------- */
  const statusSel = $("#save-status"), filterSel = $("#filter-status");
  ATS.store.STATUSES.forEach((s) => { statusSel.add(new Option(s, s)); filterSel.add(new Option(s, s)); });
  filterSel.add(new Option("⛔ Pré-requis bloquant", "__blocked"));
  statusSel.value = "Envoyée";

  // Candidature en cours de modification, seulement si l'offre affichée est toujours la même :
  // une autre offre saisie entre-temps donne une nouvelle candidature, pas une mise à jour
  function editingId() {
    if (!state.editingId) return null;
    const prev = ATS.store.get(state.editingId);
    const same = prev && ATS.norm(prev.company) === ATS.norm($("#company").value) &&
      ATS.norm(prev.title) === ATS.norm($("#title").value.trim() || "Poste sans intitulé");
    if (!same) state.editingId = null;
    return state.editingId;
  }

  $("#btn-save").addEventListener("click", async () => {
    const r = state.result;
    if (!r || $("#btn-save").disabled) return;
    const company = $("#company").value.trim(), title = $("#title").value.trim();
    if (!company) { $("#save-msg").innerHTML = '<span class="error">Indique le nom de l\'entreprise (étape 1).</span>'; $("#company").focus(); return; }
    const cv = getDoc("cv"), letter = getDoc("letter");
    const app = {
      id: editingId() || undefined,
      company, title: title || "Poste sans intitulé", url: $("#url").value.trim(),
      status: statusSel.value, appliedAt: $("#save-date").value, notes: $("#save-notes").value,
      jdText: jd.value, cvText: cv ? cv.text : "", cvName: cv ? cv.name : "", letterText: letter ? letter.text : "", letterName: letter ? letter.name : "",
      scores: { global: r.global, cv: r.cv ? r.cv.score : null, letter: r.letter ? r.letter.score : null },
      missingCv: r.cv ? r.cv.coverage.filter((c) => !c.found && c.cat !== "other").map((c) => c.label) : [],
      ignored: [...state.ignored], analyzedAt: r.date,
      pillars: r.cv ? r.cv.pillarScores : null, profile: r.cv ? profileToSave(r.cv.profile) : null,
      knockouts: r.knockouts.map(({ id, question, status, answer, auto }) => ({ id, question, status, answer, auto })),
      knockoutAnswers: { ...state.answers }, statusAuto: r.status, schema: 2,
    };
    // Critère éliminatoire non rempli : enregistrée normalement (statut choisi, visible dans l'historique)
    // avec l'étiquette « Pré-requis bloquant » ; le webhook éventuel est prévenu
    const disq = r.status === "DISQUALIFIED_AUTO";
    // CV et lettre d'origine : gardés sur cet appareil pour être retéléchargés depuis Mes candidatures
    $("#btn-save").disabled = true;
    const prev = app.id ? ATS.store.get(app.id) : null;
    const fileErrors = [];
    for (const [k, doc] of [["cv", cv], ["letter", letter]]) {
      let ref = null;
      if (doc && doc.file) {
        try { ref = await ATS.files.put(doc.file); } catch (e) { fileErrors.push(e.message); }
      } else if (doc && prev && prev[k + "File"] && (prev[k + "Text"] || "") === doc.text) ref = prev[k + "File"]; // même document rouvert depuis l'historique
      app[k + "File"] = ref;
    }
    $("#btn-save").disabled = false;
    const saved = ATS.store.upsert(app);
    state.editingId = saved.id;
    pruneFiles();
    $("#btn-save").textContent = "Mettre à jour la candidature";
    const kept = [saved.cvFile && "CV", saved.letterFile && "lettre"].filter(Boolean);
    $("#save-msg").textContent = "✓ Enregistrée dans Mes candidatures" + (disq ? " avec l'étiquette « ⛔ Pré-requis bloquant »" + (ATS.store.getWebhook() ? ", webhook prévenu" : "") : "") +
      (kept.length ? " · " + kept.join(" et ") + " d'origine " + (kept.length > 1 ? "gardés" : "gardé") + ", téléchargeable" + (kept.length > 1 ? "s" : "") + " depuis l'historique" : "") +
      (fileErrors.length ? " · " + fileErrors[0] : "");
    if (disq) fireWebhook(saved, r);
    updateCount();
  });

  /* ---------- Téléchargement du CV et de la lettre d'une candidature ---------- */
  const DOC_LABEL = { cv: "CV", letter: "Lettre de motivation" };
  const DL_ICON = '<span class="dl-ic" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3.5 13.5h9"/></svg></span>';
  // Fichiers que plus aucune candidature n'utilise (en mode cloud, seulement une fois la liste à jour)
  function pruneFiles() {
    if (ATS.store.cloud && ATS.store.syncState() !== "ok") return;
    const used = ATS.store.list().flatMap((a) => [a.cvFile, a.letterFile]).filter(Boolean).map((f) => f.hash);
    ATS.files.prune(used).catch(() => {});
  }
  // Le document téléchargé est celui de la dernière analyse enregistrée pour l'offre : le fichier d'origine
  // (PDF, DOCX…). S'il n'a pas été gardé (texte collé, ancienne candidature, autre appareil), un PDF est
  // reconstitué à partir du texte lu, et la fenêtre de détail permet de joindre le PDF d'origine.
  async function downloadDoc(id, kind) {
    const a = ATS.store.get(id);
    if (!a) return;
    const ref = a[kind + "File"], text = a[kind + "Text"];
    if (ref) {
      let f = null;
      try { f = await ATS.files.get(ref.hash); } catch (e) { f = null; }
      if (f) { ATS.files.download(f.blob, a.company + " - " + f.name); return; }
      if (text) toast("Fichier d'origine absent de cet appareil : PDF reconstitué à partir du texte. Ouvre la candidature pour joindre le PDF d'origine.");
    }
    if (!text) { toast("Le fichier d'origine n'est gardé que sur l'appareil où la candidature a été enregistrée."); return; }
    ATS.files.download(ATS.pdf.textToPdf(text, {
      title: DOC_LABEL[kind] + " - " + a.company + (a.title ? " - " + a.title : ""),
      footer: DOC_LABEL[kind] + " envoyé à " + a.company + " · reconstitué par ATS Tester à partir du texte lu (fichier d'origine non conservé)",
    }), a.company + " - " + DOC_LABEL[kind] + " (reconstitué).pdf");
  }
  // Joindre (ou remplacer) le fichier d'origine d'une candidature déjà enregistrée
  async function attachDoc(id, kind, file) {
    if (!file) return;
    try {
      const ref = await ATS.files.put(file);
      ATS.store.upsert({ id, [kind + "File"]: ref, [kind + "Name"]: file.name });
      pruneFiles();
      toast("✓ " + file.name + " joint à la candidature : c'est lui qui sera téléchargé.");
      // Seule la rubrique Documents de la fenêtre est rafraîchie (les autres champs non enregistrés restent)
      const box = $("#dlg-body .dlg-docs");
      if (box && state.dialogId === id) { box.outerHTML = dialogDocs(ATS.store.get(id)); wireDialogDocs(id); }
      if (!$("#view-history").hidden) renderHistory();
    } catch (e) { toast("Impossible de joindre ce fichier : " + e.message); }
  }
  function docButtons(a) {
    const btn = (k) => {
      const ref = a[k + "File"], text = a[k + "Text"];
      if (!ref && !text) return "";
      const what = ref ? ref.name + " · " + ATS.files.formatSize(ref.size) : "PDF reconstitué à partir du texte (fichier d'origine non gardé : ouvre la candidature pour le joindre)";
      return '<button type="button" class="dl-btn' + (ref ? "" : " is-rebuilt") + '" data-dl="' + k + '" title="Télécharger : ' + esc(what) + '" aria-label="Télécharger ' + (k === "cv" ? "le CV" : "la lettre") + " (" + esc(what) + ')">' +
        DL_ICON + (k === "cv" ? "CV" : "Lettre") + (ref ? "" : ' <small>recréé</small>') + "</button>";
    };
    return btn("cv") + btn("letter") || '<span class="muted">—</span>';
  }

  /* ---------- Espace personnel ---------- */
  const me = ATS.auth.user();
  if (me) {
    const name = ATS.auth.displayName(me);
    $("#user-avatar").textContent = $("#hello-avatar").textContent = name.charAt(0);
    $("#user-email").textContent = me.email;
    $("#hello-name").textContent = name;
  }
  const SYNC_LABELS = { off: "Sur cet appareil", idle: "Synchronisé", syncing: "Synchronisation…", ok: "Synchronisé", error: "Hors ligne, en attente", expired: "Session expirée" };
  function renderSync() {
    const st = ATS.store.syncState(), el = $("#sync-state");
    el.dataset.state = st; el.textContent = SYNC_LABELS[st] || "";
  }
  ATS.store.onChange((e) => {
    if (e.type === "state") {
      renderSync();
      if (e.state === "expired") location.replace("connexion.html?next=analyser.html");
    } else if (!$("#view-history").hidden) renderHistory();
    else updateCount();
  });
  $("#btn-logout").addEventListener("click", async () => {
    ATS.store.forget();
    await ATS.auth.signOut();
    location.replace("index.html");
  });

  // Candidatures enregistrées avant les espaces personnels, sur cet appareil
  function renderClaim() {
    const n = ATS.store.legacyCount();
    $("#legacy-claim").hidden = !n;
    if (n) $("#legacy-text").textContent = n + (n > 1 ? " candidatures retrouvées sur cet appareil." : " candidature retrouvée sur cet appareil.");
  }
  $("#btn-claim").addEventListener("click", () => {
    const n = ATS.store.claimLegacy();
    renderClaim();
    showView("history");
    toast("✓ " + n + (n > 1 ? " candidatures ajoutées" : " candidature ajoutée") + " à ton espace.");
  });
  $("#btn-claim-no").addEventListener("click", () => { ATS.store.dismissLegacy(); renderClaim(); });

  const DISQ_STATUS = "Éliminée (auto)";
  // Profil enregistré avec la candidature : tout sauf le texte brut, déjà gardé dans cvText
  function profileToSave(p) {
    const { cv_texte_brut, ...candidat } = p.candidat;
    return { ...p, candidat };
  }
  function fireWebhook(app, r) {
    const url = ATS.store.getWebhook();
    if (!url) return;
    const payload = {
      event: "candidature.disqualified_auto", status: "DISQUALIFIED_AUTO", source: "ats-tester", date: new Date().toISOString(),
      id: app.id, company: app.company, title: app.title, url: app.url || "",
      reasons: r.knockouts.filter((k) => k.status === "fail").map((k) => k.question), scores: app.scores,
    };
    // Envoi simple (text/plain) accepté par Zapier, Make, n8n… sans requête préalable CORS
    try { fetch(url, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(payload) }).catch(() => {}); } catch (e) {}
  }

  /* ---------- Questions éliminatoires ---------- */
  function clip(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function renderKnockouts(r) {
    const items = r.knockouts || [];
    const failed = items.filter((k) => k.status === "fail"), unknown = items.filter((k) => k.status === "unknown");
    const banner = $("#ko-banner");
    banner.className = "ko-banner " + (failed.length ? "fail" : unknown.length ? "unknown" : "pass");
    banner.innerHTML = failed.length
      ? "⛔ <b>Éliminée automatiquement</b> (DISQUALIFIED_AUTO) : " + failed.length + " critère" + (failed.length > 1 ? "s" : "") + " non rempli" + (failed.length > 1 ? "s" : "") + ". Tu peux quand même l'enregistrer : elle sera marquée « Pré-requis bloquant » dans tes candidatures."
      : unknown.length ? "❔ " + unknown.length + " question" + (unknown.length > 1 ? "s" : "") + " sans réponse : l'ATS te les posera au moment de postuler. Réponds pour simuler son tri."
      : "✅ Aucun critère éliminatoire bloquant.";
    $("#ko-list").innerHTML = items.map((k) => {
      const value = k.answer !== null && k.answer !== undefined ? k.answer : k.auto;
      const autoTag = (k.answer === null || k.answer === undefined) && k.auto !== null ? ' <span class="ko-auto">détecté</span>' : "";
      return '<li class="ko ' + k.status + '" data-ko="' + esc(k.id) + '">' +
        '<span class="ko-ic" aria-hidden="true">' + (k.status === "pass" ? "✓" : k.status === "fail" ? "✗" : "?") + "</span>" +
        '<div class="ko-q"><b>' + esc(k.question) + "</b>" +
        (k.source ? '<span class="ko-src">' + (k.source === "Question standard des ATS" ? esc(k.source) : "Offre : « " + esc(clip(k.source, 150)) + " »") + "</span>" : "") +
        (k.detected ? '<span class="ko-det">' + esc(k.detected) + "</span>" : "") + "</div>" +
        '<div class="ko-ans" role="group" aria-label="Ta réponse">' +
        '<button type="button" data-v="1" aria-pressed="' + (value === true) + '">Oui</button>' +
        '<button type="button" data-v="0" aria-pressed="' + (value === false) + '">Non</button>' + autoTag + "</div></li>";
    }).join("");
    $$("#ko-list .ko-ans button").forEach((b) => b.addEventListener("click", () => {
      const id = b.closest("li").dataset.ko, v = b.dataset.v === "1";
      if (state.answers[id] === v) delete state.answers[id]; else state.answers[id] = v;
      runAnalysis(false);
    }));
  }

  /* ---------- Score en 3 piliers ---------- */
  const frNum = (x) => String(x).replace(".", ",");
  function renderPillars(r) {
    const card = $("#pillars-card");
    card.hidden = !r.cv;
    if (!r.cv) return;
    const P = r.cv.pillars, fm = ATS.formatMonths;
    const coefTag = (i) => !i.found ? "" : i.recence_annee
      ? '<em class="tag-coef ' + (i.coef >= 1.25 ? "hi" : i.coef < 1 ? "lo" : "mid") + '" title="Dernier usage lu : ' + i.recence_annee + '">' + i.recence_annee + " · ×" + frNum(i.coef) + "</em>"
      : '<em class="tag-coef na" title="Citée sans expérience datée : récence inconnue">sans date · ×1</em>';
    const durTag = (i) => i.required_years ? '<em class="tag-dur ' + (i.durFactor >= 1 ? "ok" : "ko") + '" title="Durée cumulée des expériences où la compétence apparaît">' + fm(i.months) + " / " + i.required_years + " an" + (i.required_years > 1 ? "s" : "") + "</em>" : "";
    const skillLi = (i) => '<li class="' + (i.found ? "yes" : "no") + '"' + (i.contexte ? ' title="' + esc(i.contexte) + '"' : "") + '><span>' + (i.found ? "✓ " : "✗ ") + esc(i.label) + '</span><span class="tags">' + coefTag(i) + durTag(i) + "</span></li>";
    const col = (key, name, emoji, body) => {
      const p = P[key], s = p.score === null ? null : Math.round(p.score * 100);
      const eff = s !== null && Math.abs(p.effective - p.weight) > 0.001 ? " · " + Math.round(p.effective * 100) + " % ici" : "";
      return '<section class="pillar ' + (s === null ? "na" : tone(s)) + '"><header><span class="pillar-emoji" aria-hidden="true">' + emoji + "</span><div><b>" + name + "</b><small>" + Math.round(p.weight * 100) + " % de la note" + eff + '</small></div><span class="pillar-score">' + (s === null ? "n/a" : s + "<i>%</i>") + "</span></header>" +
        '<div class="pillar-bar"><i style="width:' + (s || 0) + '%"></i></div>' +
        (s === null ? '<p class="muted small">Aucun critère de ce type dans l\'offre : son poids est réparti sur les autres piliers.</p>' : body) + "</section>";
    };
    const hardBody = '<ul class="pillar-list">' + P.hard.items.slice().sort((a, b) => (b.found - a.found) || (b.weight - a.weight)).map(skillLi).join("") + "</ul>";
    const ctxBody = '<ul class="pillar-list">' + P.context.parts.map((p) => '<li class="' + (p.score >= 0.75 ? "yes" : p.score >= 0.4 ? "mid" : "no") + '"><span>' + esc(p.label) + '<small>' + esc(p.detail) + '</small></span><span class="tags"><em class="tag-pct">' + Math.round(p.score * 100) + " %</em></span></li>").join("") + "</ul>";
    const niceBody = '<ul class="pillar-list">' + P.nice.bonus.map(skillLi).join("") +
      P.nice.certs.map((c) => '<li class="' + (c.found ? "yes" : "no") + '"><span>' + (c.found ? "✓ " : "✗ ") + esc(c.label) + "</span></li>").join("") +
      (P.nice.degree ? '<li class="' + (P.nice.degree.score >= 1 ? "yes" : P.nice.degree.score > 0 ? "mid" : "no") + '"><span>Diplôme ' + esc(P.nice.degree.required) + "<small>Lu dans ton CV : " + esc(P.nice.degree.found || "aucun diplôme reconnu") + "</small></span></li>" : "") + "</ul>";
    $("#pillars").innerHTML = col("hard", "Compétences techniques requises", "🛠️", hardBody) + col("context", "Contexte et savoir-être", "🧭", ctxBody) + col("nice", "Atouts et certifications", "🎖️", niceBody);
  }

  /* ---------- Ce que l'ATS a compris du CV ---------- */
  function monthYear(d) { if (!d) return ""; const x = new Date(d + "T12:00:00"); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }); }
  function renderProfile(r) {
    const card = $("#profile-card");
    card.hidden = !r.cv;
    if (!r.cv) return;
    const p = r.cv.profile, c = p.candidat, fm = ATS.formatMonths;
    $("#profile-summary").textContent = p.experiences.length + " expérience" + (p.experiences.length > 1 ? "s" : "") + " · " + fm(p.total_experience_mois) + " d'expérience · " + (p.niveau_max || "diplôme non lu");
    const loc = [c.localisation.code_postal, c.localisation.ville].filter(Boolean).join(" ");
    const rows = [["Nom", c.nom], ["Prénom", c.prenom], ["E-mail", c.email], ["Téléphone (E.164)", c.telephone], ["Ville", loc], ["Pays", c.localisation.pays],
      ["Titre du CV", p.headline ? p.headline + (p.headline_normalise ? " → " + p.headline_normalise : "") : ""], ["Autorisation de travail", c.statut_visa],
      ["Salaire souhaité", c.salaire_souhaite ? c.salaire_souhaite.toLocaleString("fr-FR") + " € / an" : ""], ["Disponibilité", c.date_disponibilite ? fmtDate(c.date_disponibilite) : ""]];
    $("#pf-candidat").innerHTML = rows.map(([k, v]) => "<dt>" + k + "</dt><dd" + (v ? "" : ' class="muted"') + ">" + (v ? esc(v) : "non trouvé") + "</dd>").join("");
    $("#pf-formations").innerHTML = p.formations.length ? p.formations.map((f) => '<div class="pf-edu"><span class="lvl">' + esc(f.niveau_normalized) + "</span><div><b>" + esc(f.nom_diplome) + "</b><small>" + esc([f.institution, f.en_cours ? "en cours" : f.annee_obtention].filter(Boolean).join(" · ") || "établissement et année non lus") + "</small></div></div>").join("") : '<p class="muted small">Aucun diplôme reconnu.</p>';
    $("#pf-experiences tbody").innerHTML = p.experiences.length ? p.experiences.map((e) =>
      "<tr><td class=\"wrap-cell\"><b>" + (e.intitule_poste ? esc(e.intitule_poste) : '<span class="muted">non lu</span>') + "</b></td>" +
      "<td>" + (e.intitule_normalise ? '<code class="code-chip">' + esc(e.intitule_normalise) + "</code>" : '<span class="muted small">non reconnu</span>') + "</td>" +
      '<td class="wrap-cell">' + (e.entreprise ? esc(e.entreprise) : '<span class="muted">—</span>') + "</td>" +
      "<td>" + monthYear(e.date_debut) + "</td><td>" + (e.est_poste_actuel ? "aujourd'hui" : monthYear(e.date_fin)) + "</td>" +
      "<td>" + (e.duree_mois ? (e.dates_estimees ? "≈ " : "") + fm(e.duree_mois) : '<span class="muted">?</span>') + "</td></tr>").join("")
      : '<tr><td colspan="6" class="muted">Aucune expérience datée n\'a pu être découpée.</td></tr>';
    const skills = p.competences.slice().sort((a, b) => (b.recence_annee || 0) - (a.recence_annee || 0));
    $("#pf-skills").innerHTML = skills.length ? skills.map((k) => '<span class="pf-skill' + (k.recence_annee ? "" : " undated") + '" title="' + esc(k.contexte_texte || "") + '">' + esc(k.nom_skill) + " <small>" + (k.recence_annee || "sans date") + (k.mois_experience ? " · " + fm(k.mois_experience) : "") + "</small></span>").join("") : '<p class="muted small">Aucune compétence du dictionnaire repérée.</p>';
    $("#pf-unparsed").innerHTML = p.unparsed_blocks.length ? '<details class="pf-unparsed"><summary>⚠️ Texte non découpé, gardé tel quel et cherchable : ' + p.unparsed_blocks.length + " bloc" + (p.unparsed_blocks.length > 1 ? "s" : "") + "</summary>" +
      p.unparsed_blocks.map((b) => '<div class="blk"><b>' + esc(b.header || "Bloc") + "</b> · " + esc(b.reason) + "<pre>" + esc(b.text) + "</pre></div>").join("") + "</details>" : "";
  }

  /* ---------- Pré-requis du poste : étiquettes ---------- */
  // Critères éliminatoires enregistrés avec la candidature : non remplis (bloquant) ou sans réponse (à vérifier)
  function prereq(a) {
    const ko = Array.isArray(a.knockouts) ? a.knockouts : [];
    const failed = ko.filter((k) => k.status === "fail");
    const unknown = ko.filter((k) => k.status === "unknown" && k.id !== "work_auth");
    return { blocked: failed.length > 0 || (!ko.length && a.statusAuto === "DISQUALIFIED_AUTO"), failed, unknown };
  }
  function prereqTag(a) {
    const p = prereq(a);
    if (p.blocked) return '<span class="tag tag-block" title="' + esc(p.failed.map((k) => k.question).join(" · ") || "Critère éliminatoire non rempli") + '">⛔ Pré-requis bloquant</span>';
    if (p.unknown.length) return '<span class="tag tag-check" title="' + esc(p.unknown.map((k) => k.question).join(" · ")) + '">❔ Pré-requis à vérifier</span>';
    return "";
  }
  const BLOCKED_FILTER = "__blocked";

  /* ---------- Historique ---------- */
  function updateCount() { $("#history-count").textContent = ATS.store.list().length; }
  $("#search").addEventListener("input", renderHistory);
  $("#show-archived").addEventListener("change", renderHistory);
  // Webhook d'archivage automatique (propre à chaque espace)
  $("#hook-url").value = ATS.store.getWebhook();
  $("#hook-save").addEventListener("click", () => {
    const v = $("#hook-url").value.trim(), msg = $("#hook-msg");
    if (v && !/^https:\/\/[^\s]+$/i.test(v)) { msg.innerHTML = '<span class="error">L\'adresse doit commencer par https://</span>'; return; }
    ATS.store.setWebhook(v);
    msg.textContent = v ? "✓ Webhook enregistré : il sera appelé à chaque candidature éliminée automatiquement." : "Webhook désactivé.";
  });
  filterSel.addEventListener("change", renderHistory);

  function fmtDate(d) { if (!d) return "—"; const x = new Date(d.length === 10 ? d + "T12:00:00" : d); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); }
  function pill(score) { return score === null || score === undefined ? '<span class="pill none">—</span>' : '<span class="pill ' + tone(score) + '">' + score + "</span>"; }

  function renderHistory() {
    const all = ATS.store.list();
    const f = filterSel.value, match = ATS.search.compile($("#search").value), showArch = $("#show-archived").checked || f === DISQ_STATUS;
    const list = all.filter((a) => (showArch || !a.archived) && (!f || (f === BLOCKED_FILTER ? prereq(a).blocked : a.status === f)) && match(a));
    const nArch = all.filter((a) => a.archived).length;
    $("#search-info").textContent = (list.length !== all.length ? list.length + " sur " + all.length + " candidature" + (all.length > 1 ? "s" : "") : all.length + " candidature" + (all.length > 1 ? "s" : "")) + (nArch && !showArch ? " · " + nArch + " archivée" + (nArch > 1 ? "s" : "") + " masquée" + (nArch > 1 ? "s" : "") : "");
    const tbody = $("#apps tbody");
    tbody.innerHTML = list.map((a) =>
      '<tr data-id="' + esc(a.id) + '"' + (a.archived ? ' class="is-archived"' : "") + '><td class="c-date" data-label="Date">' + fmtDate(a.appliedAt) + '</td><td class="wrap-cell c-company" data-label="Entreprise"><b>' + esc(a.company) + "</b>" + prereqTag(a) + (a.archived ? ' <span class="tag tag-arch">archivée</span>' : "") + '</td><td class="wrap-cell c-title" data-label="Poste">' + esc(a.title) + "</td>" +
      '<td class="c-status" data-label="Statut"><select data-status aria-label="Statut">' + ATS.store.STATUSES.map((s) => "<option" + (s === a.status ? " selected" : "") + ">" + esc(s) + "</option>").join("") + "</select></td>" +
      '<td class="c-score" data-label="CV">' + pill(a.scores && a.scores.cv) + '</td><td class="c-score" data-label="Lettre">' + pill(a.scores && a.scores.letter) + '</td><td class="docs-cell" data-label="Documents">' + docButtons(a) + '</td><td class="c-open"><button class="btn btn-ghost btn-small" data-open>Ouvrir</button></td></tr>').join("");
    $("#empty").hidden = all.length > 0;
    $("#apps").hidden = all.length === 0;
    $$("tr[data-id]", tbody).forEach((tr) => {
      const id = tr.dataset.id;
      $("[data-status]", tr).addEventListener("change", (e) => { ATS.store.upsert({ id, status: e.target.value }); renderStats(); });
      $("[data-open]", tr).addEventListener("click", () => openDialog(id));
      $$("[data-dl]", tr).forEach((b) => b.addEventListener("click", () => downloadDoc(id, b.dataset.dl)));
    });
    renderStats();
    updateCount();
  }

  function renderStats() {
    const all = ATS.store.list();
    const sent = all.filter((a) => a.status !== "À envoyer" && a.status !== DISQ_STATUS).length;
    const itw = all.filter((a) => a.status === "Entretien" || a.status === "Offre reçue").length;
    const cvScores = all.map((a) => a.scores && a.scores.cv).filter((x) => typeof x === "number");
    const avg = cvScores.length ? Math.round(cvScores.reduce((a, b) => a + b, 0) / cvScores.length) : "—";
    $("#stats").innerHTML = [
      ["Candidatures", all.length], ["Envoyées", sent], ["Entretiens / offres", itw], ["Score CV moyen", avg],
    ].map(([l, v]) => '<div class="stat"><b>' + v + "</b><span>" + l + "</span></div>").join("");
  }

  /* ---------- Fenêtre de détail ---------- */
  const dlg = $("#dlg");
  function openDialog(id) {
    const a = ATS.store.get(id);
    if (!a) return;
    state.dialogId = id;
    $("#dlg-date").textContent = "Candidature du " + fmtDate(a.appliedAt);
    $("#dlg-title").textContent = a.title;
    $("#dlg-company").innerHTML = esc(a.company) + (a.url ? ' · <a href="' + esc(a.url) + '" target="_blank" rel="noopener">voir l\'annonce</a>' : "");
    $("#dlg-body").innerHTML =
      '<div class="scores">' +
        '<div class="mini"><div class="ring" id="d-ring-g"><span></span></div><div><b>Global</b></div></div>' +
        '<div class="mini"><div class="ring" id="d-ring-c"><span></span></div><div><b>CV</b><div class="muted small">' + esc(a.cvName || "") + "</div></div></div>" +
        '<div class="mini"><div class="ring" id="d-ring-l"><span></span></div><div><b>Lettre</b><div class="muted small">' + esc(a.letterName || "") + "</div></div></div>" +
      "</div>" +
      '<div class="fields"><label class="field"><span>Statut</span><select id="d-status">' + ATS.store.STATUSES.map((s) => "<option" + (s === a.status ? " selected" : "") + ">" + esc(s) + "</option>").join("") + '</select></label>' +
      '<label class="field"><span>Date de candidature</span><input id="d-date" type="date" value="' + esc(a.appliedAt || "") + '"></label>' +
      '<label class="field field-wide"><span>Notes</span><textarea id="d-notes" rows="3">' + esc(a.notes || "") + "</textarea></label></div>" +
      dialogPrereq(a) +
      (a.pillars ? '<div class="muted small">Piliers du CV : compétences ' + (a.pillars.hard === null ? "n/a" : a.pillars.hard + " %") + " · contexte " + (a.pillars.context === null ? "n/a" : a.pillars.context + " %") + " · atouts " + (a.pillars.nice === null ? "n/a" : a.pillars.nice + " %") + "</div>" : "") +
      dialogDocs(a) +
      '<label class="check"><input type="checkbox" id="d-archived"' + (a.archived ? " checked" : "") + "> Archivée</label>" +
      (a.missingCv && a.missingCv.length ? '<div><div class="label" style="margin-bottom:6px">Mots-clés absents du CV lors de l\'analyse</div><div class="chips">' + a.missingCv.map((m) => '<span class="chip">' + esc(m) + "</span>").join("") + "</div></div>" : "") +
      "<details><summary>Fiche de poste enregistrée</summary><pre>" + esc(a.jdText || "") + "</pre></details>" +
      (a.cvText ? "<details><summary>Texte du CV envoyé</summary><pre>" + esc(a.cvText) + "</pre></details>" : "") +
      (a.letterText ? "<details><summary>Texte de la lettre envoyée</summary><pre>" + esc(a.letterText) + "</pre></details>" : "");
    wireDialogDocs(id);
    $$("#d-prereq .ko-ans button").forEach((b) => b.addEventListener("click", () => {
      const kid = b.closest("li").dataset.ko, v = b.dataset.v === "1";
      if (dlgAnswers[kid] === v) delete dlgAnswers[kid]; else dlgAnswers[kid] = v;
      refreshDialogPrereq();
    }));
    refreshDialogPrereq();
    setRing($("#d-ring-g"), a.scores ? a.scores.global : null);
    setRing($("#d-ring-c"), a.scores ? a.scores.cv : null);
    setRing($("#d-ring-l"), a.scores ? a.scores.letter : null);
    if (!dlg.open) dlg.showModal();
  }
  // Réponses modifiables dans la fenêtre (enregistrées avec « Enregistrer »)
  let dlgAnswers = {};
  function koValue(k, answers) { const a = answers[k.id]; return a === true || a === false ? a : k.auto; }
  function dialogPrereq(a) {
    const ko = Array.isArray(a.knockouts) ? a.knockouts : [];
    dlgAnswers = { ...(a.knockoutAnswers || {}) };
    if (!ko.length) return "";
    return '<div class="dlg-prereq"><div class="label">Pré-requis du poste <span class="muted small">(critères éliminatoires)</span></div>' +
      '<div class="dlg-prereq-state" id="d-prereq-state"></div><ul class="ko-list" id="d-prereq">' +
      ko.map((k) => '<li class="ko" data-ko="' + esc(k.id) + '"><span class="ko-ic" aria-hidden="true"></span><div class="ko-q"><b>' + esc(k.question) + "</b></div>" +
        '<div class="ko-ans" role="group" aria-label="Ta réponse"><button type="button" data-v="1">Oui</button><button type="button" data-v="0">Non</button></div></li>').join("") + "</ul></div>";
  }
  function refreshDialogPrereq() {
    const a = ATS.store.get(state.dialogId);
    if (!a || !Array.isArray(a.knockouts) || !$("#d-prereq")) return;
    let failed = 0, unknown = 0;
    a.knockouts.forEach((k) => {
      const li = $('#d-prereq [data-ko="' + k.id + '"]'), v = koValue(k, dlgAnswers);
      const st = v === true ? "pass" : v === false ? "fail" : "unknown";
      if (st === "fail") failed++; else if (st === "unknown" && k.id !== "work_auth") unknown++;
      li.className = "ko " + st;
      $(".ko-ic", li).textContent = st === "pass" ? "✓" : st === "fail" ? "✗" : "?";
      $('[data-v="1"]', li).setAttribute("aria-pressed", String(v === true));
      $('[data-v="0"]', li).setAttribute("aria-pressed", String(v === false));
    });
    const box = $("#d-prereq-state");
    box.className = "ko-banner " + (failed ? "fail" : unknown ? "unknown" : "pass");
    box.textContent = failed ? "⛔ Pré-requis bloquant : " + failed + " critère" + (failed > 1 ? "s" : "") + " non rempli" + (failed > 1 ? "s" : "") + "."
      : unknown ? "❔ " + unknown + " pré-requis à vérifier." : "✅ Tous les pré-requis sont remplis.";
  }
  function wireDialogDocs(id) {
    const a = ATS.store.get(id);
    if (!a) return;
    $$("#dlg-body .dlg-docs [data-dl]").forEach((b) => b.addEventListener("click", () => downloadDoc(id, b.dataset.dl)));
    $$("#dlg-body .dlg-docs [data-attach]").forEach((input) => input.addEventListener("change", () => { const f = input.files[0]; input.value = ""; attachDoc(id, input.dataset.attach, f); }));
    // Fichier d'origine présent sur cet appareil ?
    ["cv", "letter"].forEach((k) => {
      const ref = a[k + "File"], st = $("#dlg-body [data-doc-state=" + k + "]");
      if (!ref || !st) return;
      ATS.files.get(ref.hash).then((f) => {
        st.textContent = f ? "Fichier d'origine" : "Fichier d'origine gardé sur un autre appareil : PDF reconstitué en attendant, ou joins-le ici";
        st.classList.toggle("muted", !f);
        const lbl = $("#dlg-body [data-attach-label=" + k + "]");
        if (lbl && !f) lbl.firstChild.textContent = "Joindre le fichier d'origine";
      }).catch(() => {});
    });
  }
  function dialogDocs(a) {
    const row = (k, icon) => {
      const ref = a[k + "File"], text = a[k + "Text"];
      if (!ref && !text) return "";
      return '<div class="dlg-doc' + (ref ? "" : " is-rebuilt") + '"><span class="dlg-doc-ic" aria-hidden="true">' + icon + "</span><div><b>" + DOC_LABEL[k] + "</b>" +
        "<small>" + (ref ? esc(ref.name) + " · " + ATS.files.formatSize(ref.size) + ' · <span data-doc-state="' + k + '">Fichier d\'origine</span>'
          : "Fichier d'origine non gardé : PDF recréé à partir du texte. Joins le PDF d'origine pour retrouver le même document.") + "</small></div>" +
        '<div class="dlg-doc-actions"><button type="button" class="btn btn-primary btn-small" data-dl="' + k + '">' + DL_ICON + (ref ? "Télécharger" : "Télécharger (PDF recréé)") + "</button>" +
        '<label class="btn btn-ghost btn-small file-btn" data-attach-label="' + k + '">' + (ref ? "Remplacer" : "Joindre le PDF d'origine") +
        '<input type="file" accept=".pdf,.docx,application/pdf" data-attach="' + k + '" hidden></label></div></div>';
    };
    const rows = row("cv", "📄") + row("letter", "✉️");
    return rows ? '<div class="dlg-docs"><div class="label">Documents envoyés pour cette offre</div>' + rows + "</div>" : "";
  }
  $("#dlg-save").addEventListener("click", () => {
    const a = ATS.store.get(state.dialogId), patch = { id: state.dialogId, status: $("#d-status").value, appliedAt: $("#d-date").value, notes: $("#d-notes").value, archived: $("#d-archived").checked };
    if (a && Array.isArray(a.knockouts) && a.knockouts.length) {
      patch.knockouts = a.knockouts.map((k) => {
        const answer = dlgAnswers[k.id] === true || dlgAnswers[k.id] === false ? dlgAnswers[k.id] : null, v = answer !== null ? answer : k.auto;
        return { ...k, answer, status: v === true ? "pass" : v === false ? "fail" : "unknown" };
      });
      patch.knockoutAnswers = { ...dlgAnswers };
      patch.statusAuto = patch.knockouts.some((k) => k.status === "fail") ? "DISQUALIFIED_AUTO" : "OK";
    }
    ATS.store.upsert(patch);
    dlg.close(); renderHistory();
  });
  $("#dlg-delete").addEventListener("click", () => {
    const a = ATS.store.get(state.dialogId);
    const btn = $("#dlg-delete");
    if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Confirmer la suppression ?"; return; }
    ATS.store.remove(state.dialogId);
    pruneFiles();
    btn.dataset.confirm = ""; btn.textContent = "Supprimer";
    dlg.close(); renderHistory();
    if (state.editingId === (a && a.id)) state.editingId = null;
  });
  dlg.addEventListener("close", () => { const b = $("#dlg-delete"); b.dataset.confirm = ""; b.textContent = "Supprimer"; });
  $("#dlg-reload").addEventListener("click", async () => {
    const a = ATS.store.get(state.dialogId);
    if (!a) return;
    $("#company").value = a.company; $("#title").value = a.title; $("#url").value = a.url || ""; jd.value = a.jdText || "";
    for (const k of ["cv", "letter"]) {
      const text = k === "cv" ? a.cvText : a.letterText, ref = a[k + "File"];
      state.docs[k] = null;
      let f = null;
      if (ref) { try { f = await ATS.files.get(ref.hash); } catch (e) { f = null; } }
      if (f) {
        $("#paste-" + k).value = ""; togglePaste(k, false);
        await loadDoc(k, new File([f.blob], f.name, { type: f.type }));
      } else {
        togglePaste(k, !!text);
        $("#paste-" + k).value = text || "";
        renderDocStatus(k);
      }
    }
    state.ignored = new Set(a.ignored || []);
    state.answers = { ...(a.knockoutAnswers || {}) };
    state.editingId = a.id;
    statusSel.value = a.status; $("#save-date").value = a.appliedAt || ""; $("#save-notes").value = a.notes || "";
    dlg.close();
    showView("analyze");
    runAnalysis(true);
  });

  /* ---------- Export / import ---------- */
  $("#btn-export").addEventListener("click", async () => {
    const data = JSON.parse(ATS.store.exportJSON());
    try {
      data.files = await ATS.files.exportFiles(data.applications.flatMap((x) => [x.cvFile, x.letterFile]).filter(Boolean).map((x) => x.hash));
    } catch (e) { data.files = {}; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mes-candidatures-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $("#import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const { added, updated } = ATS.store.importJSON(text);
      let nFiles = 0;
      try { const data = JSON.parse(text); if (data && data.files) nFiles = await ATS.files.importFiles(data.files); } catch (e) { nFiles = 0; }
      renderHistory();
      toast(added + " candidature(s) ajoutée(s), " + updated + " mise(s) à jour" + (nFiles ? ", " + nFiles + " fichier(s) CV / lettre restauré(s)" : "") + ".");
    } catch (err) { toast("Import impossible : " + err.message); }
  });
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 4500);
  }

  /* ---------- Réinitialiser ---------- */
  function resetForm(keepCv) {
    ["#company", "#title", "#url", "#save-notes"].forEach((s) => ($(s).value = ""));
    jd.value = ""; setJdStatus("Formats acceptés : texte collé, PDF, DOCX, TXT, MD, HTML, RTF.");
    (keepCv ? ["letter"] : ["cv", "letter"]).forEach((k) => {
      state.docs[k] = null; $("#paste-" + k).value = ""; togglePaste(k, false);
    });
    state.result = null; state.ignored = new Set(); state.answers = {}; state.editingId = null;
    $("#results").hidden = true; $("#analyze-error").textContent = ""; $("#save-date").value = ""; statusSel.value = "Envoyée";
  }
  $("#btn-reset").addEventListener("click", () => resetForm(false));
  // Nouvelle offre : garde le CV (souvent le même d'une candidature à l'autre), efface le reste
  function newOffer() {
    resetForm(true);
    $("#form-top").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#company").focus({ preventScroll: true });
  }
  $("#btn-new-offer").addEventListener("click", newOffer);
  $("#btn-next-offer").addEventListener("click", newOffer);

  /* ---------- Démarrage ---------- */
  resetForm(false);
  window.addEventListener("pageshow", (e) => { if (e.persisted) resetForm(false); });
  if (!ATS.store.isAvailable()) $("#storage-warning").hidden = false;
  $("#history-hint").textContent = ATS.store.cloud
    ? "Tes candidatures sont synchronisées dans ton espace : tu les retrouves sur tous tes appareils. Tu peux aussi les exporter pour en garder une copie. Les fichiers CV et lettre restent sur l'appareil où tu les as importés."
    : "Tes candidatures sont gardées dans ton espace, sur cet appareil. Exporte-les régulièrement pour en garder une copie ou les passer sur un autre appareil : l'export inclut tes fichiers CV et lettre.";
  renderSync();
  renderClaim();
  // Versions précédentes : une candidature bloquée était archivée d'office sous « Éliminée (auto) ».
  // Elle redevient visible (une seule fois : un archivage choisi ensuite est respecté).
  ATS.store.list().filter((a) => !a.schema && a.archived && a.status === DISQ_STATUS && a.statusAuto === "DISQUALIFIED_AUTO")
    .forEach((a) => ATS.store.upsert({ id: a.id, archived: false, schema: 2 }));
  if (location.hash === "#candidatures") showView("history", "replace");
  $("#year").textContent = new Date().getFullYear();
  updateCount();
  if (ATS.store.cloud) ATS.store.sync();
})();
