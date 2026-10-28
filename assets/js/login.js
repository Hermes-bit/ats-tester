/* ATS Tester — page de connexion
 * Écran de lancement (logo animé, chargement jusqu'à 100 %), puis connexion ou création d'espace.
 * Déjà connecté : l'écran de lancement mène directement à l'espace.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  const params = new URLSearchParams(location.search);
  const next = ATS.auth.safeNext(params.get("next"));
  const card = $(".login-card");
  let mode = "signin", redirectTimer = null;

  /* ---------- Écran de lancement ---------- */
  const MESSAGES = [
    [0, "Hermès lace ses sandales ailées 👟"],
    [22, "Échauffement des algorithmes 🧠"],
    [45, "Lustrage des mots-clés ✨"],
    [68, "Ouverture de ton espace 🔐"],
    [92, "Prêt au décollage 🚀"],
  ];
  // Départ rapide, deux petites pauses, sprint final
  const CURVE = [[0, 0], [0.18, 24], [0.3, 31], [0.5, 58], [0.62, 66], [0.8, 88], [0.9, 93], [1, 100]];
  function progressAt(k) {
    for (let i = 1; i < CURVE.length; i++) {
      const [k0, v0] = CURVE[i - 1], [k1, v1] = CURVE[i];
      if (k <= k1) { const t = (k - k0) / (k1 - k0); return v0 + (v1 - v0) * t * t * (3 - 2 * t); }
    }
    return 100;
  }
  let seen = false;
  try { seen = sessionStorage.getItem("atsTester.splash") === "1"; sessionStorage.setItem("atsTester.splash", "1"); } catch (e) {}
  const DURATION = reduce ? 400 : seen ? 1700 : 3200;
  const splash = $("#splash"), bar = $("#splash-bar"), pct = $("#splash-pct"), msg = $("#splash-msg");
  let finished = false, t0 = 0, raf = 0;

  function tick(t) {
    if (!t0) t0 = t;
    const k = Math.min(1, (t - t0) / DURATION), v = Math.round(progressAt(k));
    bar.style.width = v + "%";
    pct.textContent = v;
    const m = MESSAGES.filter(([p]) => v >= p).pop()[1];
    if (msg.textContent !== m) { msg.textContent = m; msg.classList.remove("pop"); void msg.offsetWidth; msg.classList.add("pop"); }
    if (k < 1) raf = requestAnimationFrame(tick); else finish();
  }
  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    bar.style.width = "100%"; pct.textContent = "100"; msg.textContent = MESSAGES[MESSAGES.length - 1][1];
    splash.classList.add("is-done");
    document.body.classList.add("is-ready");
    if (ATS.fx && !reduce) setTimeout(() => ATS.fx.confetti(140), 280);
    setTimeout(afterSplash, reduce ? 0 : 700);
    setTimeout(() => { splash.hidden = true; document.body.classList.remove("is-splashing"); }, reduce ? 0 : 1500);
  }
  $("#splash-skip").addEventListener("click", finish);
  requestAnimationFrame(tick);

  // Lien reçu par e-mail (confirmation, nouveau mot de passe) : true s'il a été traité
  async function handleLink() {
    try {
      const link = await ATS.auth.consumeLink();
      if (link && link.type === "recovery") showReset("update");
      else if (link) welcome(ATS.auth.user(), "Adresse confirmée ✅");
      return !!link;
    } catch (e) { setMode("signin"); showError(e.message); return true; }
  }
  window.addEventListener("hashchange", () => { if (finished) handleLink(); });

  async function afterSplash() {
    if (await handleLink()) return;
    const u = ATS.auth.user();
    if (u) { welcome(u, "Bon retour, " + ATS.auth.displayName(u) + " 👋", true); return; }
    if (hover) $(mode === "signup" ? "#first-name" : "#email").focus({ preventScroll: true });
  }

  /* ---------- Onglets ---------- */
  function setMode(m) {
    mode = m;
    $$(".login-tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === m)));
    $(".login-tabs").dataset.active = m;
    $$("[data-only]").forEach((el) => { el.hidden = el.dataset.only !== m; });
    $("#auth-title").textContent = m === "signup" ? "Crée ton espace ✨" : "Bon retour 👋";
    $("#auth-sub").textContent = m === "signup" ? "Gratuit, en 20 secondes. Tes candidatures t'attendront ici." : "Connecte-toi pour retrouver tes candidatures.";
    $("#password").autocomplete = m === "signup" ? "new-password" : "current-password";
    $("#btn-submit .btn-label").textContent = m === "signup" ? "Créer mon espace 🚀" : "Se connecter";
    $("#form-auth").hidden = false; $("#form-reset").hidden = true;
    clearMsgs();
  }
  $$(".login-tabs [role=tab]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.tab)));

  /* ---------- Champs ---------- */
  $$(".pw-toggle").forEach((b) => b.addEventListener("click", () => {
    const input = document.getElementById(b.dataset.pw), show = input.type === "password";
    input.type = show ? "text" : "password";
    b.setAttribute("aria-pressed", String(show));
    b.textContent = show ? "🙈" : "👁️";
  }));
  const LEVELS = ["Trop court 😬", "Faible 😕", "Correct 🙂", "Solide 💪", "Béton armé 🦾"];
  $("#password").addEventListener("input", () => {
    const pw = $("#password").value;
    let lvl = 0;
    if (pw.length >= 8) {
      lvl = 1 + [pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw) && /[^\w\s]/.test(pw)].filter(Boolean).length;
    }
    $(".pw-meter").dataset.level = pw ? lvl : "";
    $("#pw-fill").style.width = pw ? (lvl + 1) * 20 + "%" : "0";
    $("#pw-label").textContent = pw ? LEVELS[lvl] : "8 caractères minimum";
  });

  function clearMsgs() { ["#auth-error", "#auth-ok", "#reset-error", "#reset-ok"].forEach((s) => ($(s).textContent = "")); }
  function showError(text, el) {
    (el || $("#auth-error")).textContent = text;
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }
  function busy(btn, on) { btn.disabled = on; btn.classList.toggle("is-busy", on); }

  /* ---------- Connexion / inscription ---------- */
  $("#form-auth").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsgs();
    const email = $("#email").value, password = $("#password").value, remember = $("#remember").checked;
    if (mode === "signup" && password !== $("#password2").value) { showError("Les deux mots de passe ne correspondent pas."); return; }
    const btn = $("#btn-submit");
    busy(btn, true);
    try {
      const res = mode === "signup"
        ? await ATS.auth.signUp({ email, password, firstName: $("#first-name").value, remember })
        : await ATS.auth.signIn({ email, password, remember });
      if (res.pending) {
        $("#auth-ok").textContent = "📬 Presque fini ! Clique sur le lien envoyé à " + email.trim() + " pour activer ton espace, puis reviens te connecter.";
        return;
      }
      if (mode === "signup" && ATS.fx) ATS.fx.confetti(120);
      welcome(res.user, (mode === "signup" ? "Bienvenue, " : "Bon retour, ") + ATS.auth.displayName(res.user) + (mode === "signup" ? " 🎉" : " 👋"));
    } catch (err) {
      showError(err.message || "Une erreur est survenue.");
    } finally {
      busy(btn, false);
    }
  });

  function welcome(u, title, returning) {
    $("#form-auth").hidden = true; $("#form-reset").hidden = true; $(".login-tabs").hidden = true;
    $("#login-success").hidden = false;
    $("#success-title").textContent = title || "Bienvenue !";
    $("#btn-switch").hidden = !returning;
    redirectTimer = setTimeout(() => location.replace(next), returning ? 1400 : 1200);
  }
  $("#btn-switch").addEventListener("click", async () => {
    clearTimeout(redirectTimer);
    await ATS.auth.signOut();
    $("#login-success").hidden = true; $(".login-tabs").hidden = false;
    setMode("signin");
    $("#email").focus();
  });

  /* ---------- Mot de passe oublié ---------- */
  function showReset(kind) {
    clearMsgs();
    $("#form-auth").hidden = true; $("#form-reset").hidden = false; $(".login-tabs").hidden = kind === "update";
    $("#form-reset").dataset.kind = kind;
    $("#reset-email-field").hidden = kind !== "request";
    $("#reset-pw-field").hidden = kind !== "update";
    $("#btn-reset-submit").hidden = kind === "device";
    $("#btn-back").hidden = kind === "update";
    $("#reset-title").textContent = kind === "update" ? "Nouveau mot de passe 🔑" : "Mot de passe oublié 🔑";
    $("#reset-sub").textContent = {
      request: "Entre ton e-mail : tu recevras un lien pour choisir un nouveau mot de passe.",
      update: "Choisis ton nouveau mot de passe (8 caractères minimum).",
      device: "Ton espace est enregistré sur cet appareil, sans serveur : personne ne peut réinitialiser ton mot de passe à ta place. Si tu as exporté tes candidatures (fichier JSON), crée un nouvel espace puis importe-les depuis « Mes candidatures ».",
    }[kind];
    $("#btn-reset-submit .btn-label").textContent = kind === "update" ? "Enregistrer" : "Recevoir un lien";
    if (kind === "request") { $("#reset-email").value = $("#email").value; if (hover) $("#reset-email").focus(); }
    if (kind === "update" && hover) $("#reset-pw").focus();
  }
  $("#btn-forgot").addEventListener("click", () => showReset(ATS.auth.mode === "cloud" ? "request" : "device"));
  $("#btn-back").addEventListener("click", () => setMode("signin"));
  $("#form-reset").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsgs();
    const kind = $("#form-reset").dataset.kind, btn = $("#btn-reset-submit");
    busy(btn, true);
    try {
      if (kind === "request") {
        await ATS.auth.resetPassword($("#reset-email").value);
        $("#reset-ok").textContent = "📬 Si un espace existe pour cette adresse, un lien vient d'y être envoyé.";
      } else if (kind === "update") {
        await ATS.auth.updatePassword($("#reset-pw").value);
        welcome(ATS.auth.user(), "Mot de passe changé ✅");
      }
    } catch (err) {
      showError(err.message || "Une erreur est survenue.", $("#reset-error"));
    } finally {
      busy(btn, false);
    }
  });

  /* ---------- Démarrage ---------- */
  $("#login-mode").textContent = ATS.auth.mode === "cloud"
    ? "☁️ Ton espace est synchronisé : retrouve tes candidatures sur tous tes appareils."
    : "💻 Ton espace est enregistré sur cet appareil. Pour le retrouver ailleurs, utilise Exporter / Importer dans « Mes candidatures ».";
  setMode(params.get("mode") === "signup" ? "signup" : "signin");
})();
