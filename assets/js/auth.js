/* ATS Tester — espaces personnels (comptes et sessions)
 *
 * Deux modes, choisis par assets/js/config.js :
 *  - « appareil » (config vide) : les comptes sont gardés dans ce navigateur, le mot de passe est
 *    haché (PBKDF2-SHA-256) et n'est jamais stocké en clair. Chaque compte a ses propres candidatures.
 *  - « cloud » (URL et clé Supabase renseignées) : comptes Supabase, candidatures synchronisées
 *    sur tous les appareils (voir storage.js).
 */
window.ATS = window.ATS || {};

(function () {
  const cfg = ATS.config || {};
  const CLOUD = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const BASE = CLOUD ? cfg.supabaseUrl.replace(/\/+$/, "") : "";
  const ACCOUNTS = "atsTester.accounts.v1";
  const SESSION = "atsTester.session.v1";
  const ITERATIONS = 210000;

  class AuthError extends Error {
    constructor(message, code) { super(message); this.code = code || "error"; }
  }

  /* ---------- Stockage tolérant (navigation privée stricte) ---------- */
  function readJSON(store, key) { try { const raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function writeJSON(store, key, v) { try { store.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function drop(store, key) { try { store.removeItem(key); } catch (e) {} }

  function getSession() { return readJSON(localStorage, SESSION) || readJSON(sessionStorage, SESSION); }
  function setSession(s) {
    drop(localStorage, SESSION); drop(sessionStorage, SESSION);
    if (!writeJSON(s.remember ? localStorage : sessionStorage, SESSION, s) && !writeJSON(sessionStorage, SESSION, s)) {
      throw new AuthError("Ton navigateur bloque l'enregistrement de la session (navigation privée ?).", "storage");
    }
    return s;
  }
  function clearSession() { drop(localStorage, SESSION); drop(sessionStorage, SESSION); }

  const normEmail = (e) => String(e || "").trim().toLowerCase();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function checkEmail(email) {
    if (!EMAIL_RE.test(email)) throw new AuthError("Cette adresse e-mail n'est pas valide.", "email");
  }
  function checkPassword(pw) {
    if (String(pw || "").length < 8) throw new AuthError("Ton mot de passe doit faire au moins 8 caractères.", "weak");
  }

  /* ---------- Hachage du mot de passe (mode appareil) ---------- */
  const enc = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  function subtle() {
    if (!window.crypto || !crypto.subtle) throw new AuthError("Ce navigateur ne permet pas de créer un espace sécurisé. Ouvre le site en https avec un navigateur récent.", "crypto");
    return crypto.subtle;
  }
  async function pbkdf2(password, saltHex, iterations) {
    const key = await subtle().importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    return hex(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations }, key, 256));
  }
  async function sha256(s) { return hex(await subtle().digest("SHA-256", enc.encode(s))); }
  function sameHash(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  const device = {
    async signUp({ email, password, firstName, remember }) {
      const accounts = readJSON(localStorage, ACCOUNTS) || {};
      if (accounts[email]) throw new AuthError("Un espace existe déjà avec cet e-mail sur cet appareil : connecte-toi.", "exists");
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const account = {
        id: "dev-" + (await sha256(email)).slice(0, 24), email, firstName: firstName || "",
        salt, iterations: ITERATIONS, hash: await pbkdf2(password, salt, ITERATIONS), createdAt: new Date().toISOString(),
      };
      accounts[email] = account;
      if (!writeJSON(localStorage, ACCOUNTS, accounts)) throw new AuthError("Ton navigateur bloque l'enregistrement (navigation privée ?).", "storage");
      return { user: setSession({ mode: "device", remember, user: { id: account.id, email, firstName: account.firstName } }).user };
    },
    async signIn({ email, password, remember }) {
      const account = (readJSON(localStorage, ACCOUNTS) || {})[email];
      // Même calcul que l'espace existe ou non : la réponse ne trahit pas les e-mails enregistrés
      const hash = await pbkdf2(password, account ? account.salt : "00000000000000000000000000000000", account ? account.iterations : ITERATIONS);
      if (!account || !sameHash(hash, account.hash)) throw new AuthError("E-mail ou mot de passe incorrect.", "credentials");
      return { user: setSession({ mode: "device", remember, user: { id: account.id, email, firstName: account.firstName || "" } }).user };
    },
  };

  /* ---------- Supabase (mode cloud) ---------- */
  const MESSAGES = [
    [/invalid_credentials|invalid login credentials/i, "E-mail ou mot de passe incorrect."],
    [/email_not_confirmed|email not confirmed/i, "Confirme d'abord ton adresse : clique sur le lien reçu par e-mail."],
    [/user_already_exists|already registered|already been registered/i, "Un espace existe déjà avec cet e-mail : connecte-toi."],
    [/weak_password|password should/i, "Mot de passe trop faible : 8 caractères minimum, avec des lettres et des chiffres."],
    [/same_password|different from the old/i, "Choisis un mot de passe différent de l'ancien."],
    [/rate.?limit|too many/i, "Trop de tentatives. Réessaie dans quelques minutes."],
    [/signup.?disabled|signups not allowed/i, "Les inscriptions sont fermées pour le moment."],
    [/email_address_invalid|unable to validate email|invalid.*email/i, "Cette adresse e-mail n'est pas valide."],
    [/otp_expired|expired|invalid.*(link|token)/i, "Ce lien a expiré ou a déjà servi. Demande un nouveau lien."],
  ];
  function cloudError(status, data) {
    const raw = data ? [data.error_code, data.msg, data.error_description, data.message, data.error].filter(Boolean).join(" ") : "";
    const hit = MESSAGES.find(([re]) => re.test(raw));
    if (hit) return new AuthError(hit[1], (data && data.error_code) || "cloud");
    if (status === 401) return new AuthError("Session expirée, reconnecte-toi.", "expired");
    return new AuthError("Le serveur a répondu par une erreur (" + status + "). Réessaie dans un instant.", "cloud");
  }
  async function call(path, opts) {
    opts = opts || {};
    const headers = { apikey: cfg.supabaseKey, "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    if (opts.prefer) headers.Prefer = opts.prefer;
    let res;
    try {
      res = await fetch(BASE + path, { method: opts.method || "POST", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    } catch (e) {
      throw new AuthError("Connexion au serveur impossible. Vérifie ta connexion internet.", "network");
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) throw cloudError(res.status, data);
    return data;
  }
  function cloudSession(data, remember) {
    const u = data.user || {};
    return {
      mode: "cloud", remember,
      user: { id: u.id, email: u.email, firstName: (u.user_metadata && u.user_metadata.first_name) || "" },
      access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    };
  }
  function pageUrl(page) { return new URL(page, location.href).href.split("#")[0].split("?")[0]; }

  const cloud = {
    async signUp({ email, password, firstName, remember }) {
      const data = await call("/auth/v1/signup?redirect_to=" + encodeURIComponent(pageUrl("connexion.html")), {
        body: { email, password, data: { first_name: firstName || "" } },
      });
      if (data && data.access_token) return { user: setSession(cloudSession(data, remember)).user };
      // Adresse déjà inscrite : Supabase renvoie un compte sans identité (pour ne rien révéler)
      if (data && Array.isArray(data.identities) && data.identities.length === 0) {
        throw new AuthError("Un espace existe déjà avec cet e-mail : connecte-toi.", "exists");
      }
      return { pending: true };
    },
    async signIn({ email, password, remember }) {
      const data = await call("/auth/v1/token?grant_type=password", { body: { email, password } });
      return { user: setSession(cloudSession(data, remember)).user };
    },
  };

  let refreshing = null;
  async function token() {
    const s = getSession();
    if (!s || s.mode !== "cloud") throw new AuthError("Session expirée, reconnecte-toi.", "expired");
    if (s.expires_at * 1000 - Date.now() > 60000) return s.access_token;
    if (!refreshing) {
      refreshing = call("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh_token } })
        .then((data) => setSession(cloudSession(data, s.remember)).access_token)
        .catch((e) => {
          if (e.code === "network") throw e;
          clearSession();
          throw new AuthError("Session expirée, reconnecte-toi.", "expired");
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  /* ---------- Interface publique ---------- */
  // Seules les pages du site sont acceptées comme destination après connexion
  function safeNext(next) { return /^[\w-]+\.html(#[\w-]*)?$/.test(next || "") ? next : "analyser.html"; }

  ATS.auth = {
    AuthError,
    mode: CLOUD ? "cloud" : "device",
    user() {
      const s = getSession();
      if (!s || !s.user || !s.user.id) return null;
      if (s.mode !== (CLOUD ? "cloud" : "device")) { clearSession(); return null; } // la configuration a changé
      return s.user;
    },
    displayName(u) {
      u = u || this.user();
      if (!u) return "";
      if (u.firstName) return u.firstName;
      const local = u.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : u.email;
    },
    async signUp({ email, password, firstName, remember }) {
      email = normEmail(email); checkEmail(email); checkPassword(password);
      return (CLOUD ? cloud : device).signUp({ email, password, firstName: String(firstName || "").trim().slice(0, 40), remember: !!remember });
    },
    async signIn({ email, password, remember }) {
      email = normEmail(email); checkEmail(email);
      if (!password) throw new AuthError("Entre ton mot de passe.", "password");
      return (CLOUD ? cloud : device).signIn({ email, password, remember: !!remember });
    },
    async signOut() {
      const s = getSession();
      clearSession();
      if (s && s.mode === "cloud" && s.access_token) {
        try { await call("/auth/v1/logout", { token: s.access_token }); } catch (e) { /* la session locale est déjà fermée */ }
      }
    },
    async resetPassword(email) {
      if (!CLOUD) throw new AuthError("Indisponible en mode appareil.", "device");
      email = normEmail(email); checkEmail(email);
      await call("/auth/v1/recover?redirect_to=" + encodeURIComponent(pageUrl("connexion.html")), { body: { email } });
    },
    async updatePassword(password) {
      checkPassword(password);
      await call("/auth/v1/user", { method: "PUT", token: await token(), body: { password } });
    },
    // Lien reçu par e-mail (confirmation d'inscription, nouveau mot de passe) : #access_token=…&type=…
    async consumeLink() {
      if (!CLOUD || !location.hash) return null;
      const p = new URLSearchParams(location.hash.slice(1));
      if (!p.get("access_token") && !p.get("error_description") && !p.get("error")) return null;
      history.replaceState(null, "", location.pathname + location.search);
      if (!p.get("access_token")) throw cloudError(400, { error_code: p.get("error_code"), error_description: p.get("error_description") || p.get("error") });
      const user = await call("/auth/v1/user", { method: "GET", token: p.get("access_token") });
      setSession(cloudSession({
        user, access_token: p.get("access_token"), refresh_token: p.get("refresh_token"),
        expires_at: Number(p.get("expires_at")) || undefined, expires_in: Number(p.get("expires_in")) || 3600,
      }, true));
      return { type: p.get("type") || "magiclink" };
    },
    token,
    // Appel à la base Supabase avec la session de l'utilisateur
    async rest(path, opts) { return call("/rest/v1/" + path, { ...(opts || {}), token: await token() }); },
    safeNext,
    // À appeler en haut des pages réservées : renvoie vers la connexion si personne n'est connecté
    guard(next) {
      if (this.user()) return true;
      location.replace("connexion.html?next=" + encodeURIComponent(safeNext(next)));
      return false;
    },
  };
})();
