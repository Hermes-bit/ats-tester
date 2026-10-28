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
    editingId: null,
    rawTab: "cv",
    loading: {}, // lectures de fichiers en cours
    dialogId: null,
  };

  /* ---------- Onglets ---------- */
  function showView(v) {
    $$(".tab").forEach((t) => { const on = t.dataset.view === v; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); });
    $("#view-analyze").hidden = v !== "analyze";
    $("#view-history").hidden = v !== "history";
    if (v === "history") renderHistory();
    history.replaceState(null, "", v === "history" ? "#candidatures" : location.pathname);
    window.scrollTo({ top: 0 });
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
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
      state.docs[kind] = { text: res.text, name: file.name, meta: res.meta };
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
    const result = ATS.analyze({ jdText, title: $("#title").value, company: $("#company").value, cv, letter, ignored: [...state.ignored] });
    return { result, ctx: { jdText, cv, letter } };
  }
  function show(run, scroll) {
    state.result = run.result;
    renderResults(run.result, run.ctx);
    $("#results").hidden = false;
    if (scroll) $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    if (scroll && run.result.global >= 75 && ATS.fx) setTimeout(() => ATS.fx.confetti(), 500);
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
    const steps = [
      ["📄", "Lecture de " + docs, words.toLocaleString("fr-FR") + " mots"],
      ["🔍", "Repérage des mots-clés de l'offre", (r.keywords.skills.length + r.keywords.others.length) + " trouvés"],
      ["🧮", "Comparaison avec " + (r.cv ? "ton CV" : "ta lettre"), main.coverage.filter((c) => c.found).length + " / " + main.coverage.length],
      ["🛡️", "Contrôles ATS : format, rubriques, dates", ((r.cv ? r.cv.checks.length : 0) + (r.letter ? r.letter.checks.length : 0)) + " tests"],
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
    const v = ATS.verdict(r.global);
    const vEl = $("#verdict"); vEl.textContent = v.label + " " + ({ good: "🚀", mid: "💪", bad: "🛠️" }[v.tone] || ""); vEl.className = "verdict " + v.tone;
    const nSkills = r.keywords.skills.length + r.keywords.others.length;
    const cvFound = r.cv ? r.cv.coverage.filter((c) => c.found).length : 0;
    const cvTot = r.cv ? r.cv.coverage.length : 0;
    $("#summary-line").textContent = nSkills + " mots-clés repérés dans l'offre" + (r.cv ? " · " + cvFound + " / " + cvTot + " présents dans ton CV" : "") + ".";
    $("#cv-sub").textContent = r.cv ? "Mots-clés " + r.cv.kwScore + " % · Format " + r.cv.formatScore + " %" : "Non fourni";
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

  $("#btn-save").addEventListener("click", () => {
    const r = state.result;
    if (!r) return;
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
    };
    const saved = ATS.store.upsert(app);
    state.editingId = saved.id;
    $("#btn-save").textContent = "Mettre à jour la candidature";
    $("#save-msg").textContent = "✓ Enregistrée dans Mes candidatures";
    updateCount();
  });

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

  /* ---------- Historique ---------- */
  function updateCount() { $("#history-count").textContent = ATS.store.list().length; }
  $("#search").addEventListener("input", renderHistory);
  filterSel.addEventListener("change", renderHistory);

  function fmtDate(d) { if (!d) return "—"; const x = new Date(d.length === 10 ? d + "T12:00:00" : d); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); }
  function pill(score) { return score === null || score === undefined ? '<span class="pill none">—</span>' : '<span class="pill ' + tone(score) + '">' + score + "</span>"; }

  function renderHistory() {
    const all = ATS.store.list();
    const q = ATS.norm($("#search").value), f = filterSel.value;
    const list = all.filter((a) => (!f || a.status === f) && (!q || ATS.norm(a.company + " " + a.title + " " + (a.notes || "")).includes(q)));
    const tbody = $("#apps tbody");
    tbody.innerHTML = list.map((a) =>
      '<tr data-id="' + esc(a.id) + '"><td>' + fmtDate(a.appliedAt) + '</td><td class="wrap-cell"><b>' + esc(a.company) + '</b></td><td class="wrap-cell">' + esc(a.title) + "</td>" +
      "<td><select data-status>" + ATS.store.STATUSES.map((s) => "<option" + (s === a.status ? " selected" : "") + ">" + esc(s) + "</option>").join("") + "</select></td>" +
      "<td>" + pill(a.scores && a.scores.cv) + "</td><td>" + pill(a.scores && a.scores.letter) + '</td><td><button class="btn btn-ghost btn-small" data-open>Ouvrir</button></td></tr>').join("");
    $("#empty").hidden = all.length > 0;
    $("#apps").hidden = all.length === 0;
    $$("tr[data-id]", tbody).forEach((tr) => {
      const id = tr.dataset.id;
      $("[data-status]", tr).addEventListener("change", (e) => { ATS.store.upsert({ id, status: e.target.value }); renderStats(); });
      $("[data-open]", tr).addEventListener("click", () => openDialog(id));
    });
    renderStats();
    updateCount();
  }

  function renderStats() {
    const all = ATS.store.list();
    const sent = all.filter((a) => a.status !== "À envoyer").length;
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
      (a.missingCv && a.missingCv.length ? '<div><div class="label" style="margin-bottom:6px">Mots-clés absents du CV lors de l\'analyse</div><div class="chips">' + a.missingCv.map((m) => '<span class="chip">' + esc(m) + "</span>").join("") + "</div></div>" : "") +
      "<details><summary>Fiche de poste enregistrée</summary><pre>" + esc(a.jdText || "") + "</pre></details>" +
      (a.cvText ? "<details><summary>Texte du CV envoyé</summary><pre>" + esc(a.cvText) + "</pre></details>" : "") +
      (a.letterText ? "<details><summary>Texte de la lettre envoyée</summary><pre>" + esc(a.letterText) + "</pre></details>" : "");
    setRing($("#d-ring-g"), a.scores ? a.scores.global : null);
    setRing($("#d-ring-c"), a.scores ? a.scores.cv : null);
    setRing($("#d-ring-l"), a.scores ? a.scores.letter : null);
    dlg.showModal();
  }
  $("#dlg-save").addEventListener("click", () => {
    ATS.store.upsert({ id: state.dialogId, status: $("#d-status").value, appliedAt: $("#d-date").value, notes: $("#d-notes").value });
    dlg.close(); renderHistory();
  });
  $("#dlg-delete").addEventListener("click", () => {
    const a = ATS.store.get(state.dialogId);
    const btn = $("#dlg-delete");
    if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Confirmer la suppression ?"; return; }
    ATS.store.remove(state.dialogId);
    btn.dataset.confirm = ""; btn.textContent = "Supprimer";
    dlg.close(); renderHistory();
    if (state.editingId === (a && a.id)) state.editingId = null;
  });
  dlg.addEventListener("close", () => { const b = $("#dlg-delete"); b.dataset.confirm = ""; b.textContent = "Supprimer"; });
  $("#dlg-reload").addEventListener("click", () => {
    const a = ATS.store.get(state.dialogId);
    if (!a) return;
    $("#company").value = a.company; $("#title").value = a.title; $("#url").value = a.url || ""; jd.value = a.jdText || "";
    ["cv", "letter"].forEach((k) => {
      const text = k === "cv" ? a.cvText : a.letterText;
      state.docs[k] = null;
      togglePaste(k, !!text);
      $("#paste-" + k).value = text || "";
      renderDocStatus(k);
    });
    state.ignored = new Set(a.ignored || []);
    state.editingId = a.id;
    statusSel.value = a.status; $("#save-date").value = a.appliedAt || ""; $("#save-notes").value = a.notes || "";
    dlg.close();
    showView("analyze");
    runAnalysis(true);
  });

  /* ---------- Export / import ---------- */
  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([ATS.store.exportJSON()], { type: "application/json" });
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
      const { added, updated } = ATS.store.importJSON(await f.text());
      renderHistory();
      toast(added + " candidature(s) ajoutée(s), " + updated + " mise(s) à jour.");
    } catch (err) { toast("Import impossible : " + err.message); }
  });
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "notice warn"; t.textContent = msg; t.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:50;max-width:90vw";
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  }

  /* ---------- Réinitialiser ---------- */
  function resetForm(keepCv) {
    ["#company", "#title", "#url", "#save-notes"].forEach((s) => ($(s).value = ""));
    jd.value = ""; setJdStatus("Formats acceptés : texte collé, PDF, DOCX, TXT, MD, HTML, RTF.");
    (keepCv ? ["letter"] : ["cv", "letter"]).forEach((k) => {
      state.docs[k] = null; $("#paste-" + k).value = ""; togglePaste(k, false);
    });
    state.result = null; state.ignored = new Set(); state.editingId = null;
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
    ? "Tes candidatures sont synchronisées dans ton espace : tu les retrouves sur tous tes appareils. Tu peux aussi les exporter pour en garder une copie."
    : "Tes candidatures sont gardées dans ton espace, sur cet appareil. Exporte-les régulièrement pour en garder une copie ou les passer sur un autre appareil.";
  renderSync();
  renderClaim();
  if (location.hash === "#candidatures") showView("history");
  $("#year").textContent = new Date().getFullYear();
  updateCount();
  if (ATS.store.cloud) ATS.store.sync();
})();
