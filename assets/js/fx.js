/* ATS Tester — effets visuels
 * Apparition au défilement (.reveal), compteurs ([data-count]), cartes inclinables (.tilt),
 * démo avant / après de l'accueil (#demo) et confettis quand une candidature passe le filtre.
 * Tout est désactivé si l'utilisateur a demandé à réduire les animations.
 */
window.ATS = window.ATS || {};

(function () {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  function countUp(el, to, ms) {
    to = Number(to);
    if (reduce || !isFinite(to)) { el.textContent = to; return; }
    const t0 = performance.now(), d = ms || 1200;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / d);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function confetti(count) {
    const c = document.getElementById("confetti");
    if (!c || reduce) return;
    const dpr = window.devicePixelRatio || 1, ctx = c.getContext("2d");
    const W = (c.width = innerWidth * dpr), H = (c.height = innerHeight * dpr);
    const colors = ["#22D3EE", "#A78BFA", "#F472B6", "#A3E635", "#FBBF24"];
    const parts = Array.from({ length: count || 170 }, (_, i) => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.35, y: H * 0.38,
      vx: (Math.random() - 0.5) * 17 * dpr, vy: (-Math.random() * 15 - 5) * dpr,
      w: (6 + Math.random() * 6) * dpr, h: (3 + Math.random() * 4) * dpr,
      a: Math.random() * 6, va: (Math.random() - 0.5) * 0.35, c: colors[i % colors.length],
    }));
    const t0 = performance.now();
    c.classList.add("is-on");
    const frame = (t) => {
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        p.vy += 0.42 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        if (p.y < H + 40) alive++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (alive && t - t0 < 4500) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); c.classList.remove("is-on"); }
    };
    requestAnimationFrame(frame);
  }

  ATS.fx = { countUp, confetti };

  /* ---------- Apparition au défilement + compteurs ---------- */
  function onVisible(el) {
    el.classList.add("is-in");
    el.querySelectorAll("[data-count]").forEach((n) => countUp(n, n.dataset.count));
  }
  const reveals = [...document.querySelectorAll(".reveal")];
  if (reduce || !("IntersectionObserver" in window)) reveals.forEach(onVisible);
  else {
    // Ce qui est déjà à l’écran apparaît tout de suite ; le reste dès son premier pixel visible
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { onVisible(e.target); io.unobserve(e.target); }
    }), { threshold: 0, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) onVisible(el); else io.observe(el); });
  }

  /* ---------- Cartes inclinables avec halo qui suit la souris ---------- */
  if (hover && !reduce) {
    document.querySelectorAll(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", x * 100 + "%");
        card.style.setProperty("--my", y * 100 + "%");
        card.style.transform = "perspective(900px) rotateX(" + (0.5 - y) * 7 + "deg) rotateY(" + (x - 0.5) * 9 + "deg) translateY(-4px)";
      });
      card.addEventListener("pointerleave", () => { card.style.transform = ""; });
    });
  }

  /* ---------- Démo avant / après de l'accueil ---------- */
  const demo = document.getElementById("demo");
  if (demo) {
    const ring = demo.querySelector(".demo-ring"), num = ring.querySelector("span");
    const set = (mode) => {
      const after = mode === "after";
      demo.dataset.mode = mode;
      demo.querySelectorAll("[data-demo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.demo === mode)));
      const score = after ? 86 : 48;
      ring.style.setProperty("--v", score);
      ring.dataset.tone = after ? "good" : "bad";
      countUp(num, score, 800);
      demo.querySelector(".demo-verdict").textContent = after ? "Bonnes chances de passer le filtre 🚀" : "Risque élevé de rejet automatique 🛠️";
    };
    demo.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => set(b.dataset.demo)));
    set("before");
  }

  /* ---------- Accueil : « Se connecter » devient « Mon espace » quand une session est ouverte ---------- */
  const login = document.getElementById("nav-login");
  const me = login && ATS.auth ? ATS.auth.user() : null;
  if (me) {
    login.querySelector(".avatar").textContent = ATS.auth.displayName(me).charAt(0);
    login.querySelector(".nav-login-text").textContent = "Mon espace";
    login.title = me.email;
  }

  /* ---------- Bouton « Retour » ----------
   * Revient à la page précédente du site. Arrivé directement (favori, lien externe) : page de repli (data-back).
   * Une page peut d'abord gérer le retour elle-même (ATS.onBack, ex. Mes candidatures → Analyser).
   */
  const ref = (() => { try { return document.referrer ? new URL(document.referrer) : null; } catch (e) { return null; } })();
  const fromSite = !!ref && ref.origin === location.origin && ref.pathname !== location.pathname && history.length > 1;
  document.querySelectorAll("[data-back]").forEach((b) => {
    if (b.hasAttribute("data-back-optional")) b.hidden = !fromSite; // accueil : seulement si on vient d'une autre page du site
    b.addEventListener("click", () => {
      if (typeof ATS.onBack === "function" && ATS.onBack()) return;
      if (fromSite) history.back();
      else location.href = b.dataset.back || "index.html";
    });
  });

  /* ---------- Remonter en haut de page ----------
   * Bouton flottant en bas à droite (avec la progression de lecture), et lien « Haut de page » dans le pied de page.
   */
  function goTop() {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    const first = document.querySelector(".topbar .back-btn:not([hidden]), .topbar .brand");
    if (first) first.focus({ preventScroll: true });
  }
  const toTop = document.createElement("button");
  toTop.type = "button";
  toTop.className = "to-top";
  toTop.setAttribute("aria-label", "Remonter en haut de la page");
  toTop.title = "Haut de page";
  toTop.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="tt-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset=".5" stop-color="#A78BFA"/><stop offset="1" stop-color="#F472B6"/></linearGradient></defs><circle class="tt-track" cx="20" cy="20" r="17"/><circle class="tt-prog" cx="20" cy="20" r="17" pathLength="100"/></svg><span aria-hidden="true">↑</span>';
  toTop.addEventListener("click", goTop);
  document.body.appendChild(toTop);
  // Le pied de page a son propre lien « Haut de page » : le bouton flottant s'efface pour ne pas le recouvrir
  let footerVisible = false;
  const footer = document.querySelector(".footer");
  if (footer && "IntersectionObserver" in window) {
    new IntersectionObserver((entries) => { footerVisible = entries[0].isIntersecting; onScroll(); }).observe(footer);
  }
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    toTop.classList.toggle("is-on", scrollY > 400 && !footerVisible);
    toTop.style.setProperty("--p", max > 0 ? Math.min(100, Math.round((scrollY / max) * 100)) : 0);
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();
  document.querySelectorAll("[data-to-top]").forEach((b) => b.addEventListener("click", goTop));

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
