/* ATS Tester — sauvegarde des candidatures, une liste par espace personnel
 * Mode appareil : la liste reste dans ce navigateur (localStorage).
 * Mode cloud : la même liste sert de cache local et se synchronise avec Supabase
 * (table « applications », une ligne par candidature, protégée par utilisateur).
 * « Exporter » donne toujours une copie (fichier JSON).
 */
window.ATS = window.ATS || {};

(function () {
  const LEGACY = "atsTester.applications.v1"; // candidatures enregistrées avant les espaces personnels
  const DRAFT = "atsTester.draft.v1";
  // Les anciennes versions gardaient un brouillon de l'offre : on le supprime partout
  try { localStorage.removeItem(DRAFT); } catch (e) {}
  try { sessionStorage.removeItem(DRAFT); } catch (e) {}

  const user = ATS.auth ? ATS.auth.user() : null;
  const CLOUD = !!user && ATS.auth.mode === "cloud";
  const KEY = user ? "atsTester.apps." + user.id + ".v1" : null;
  const DELETED = KEY + ".deleted";
  const DISMISSED = KEY + ".legacyDismissed";
  let memory = []; // secours si le stockage est bloqué (navigation privée stricte)
  let available = true;

  function readJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { available = false; return fallback; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; }
    catch (e) { available = false; return false; }
  }
  function load() { return KEY ? readJSON(KEY, null) || (available ? [] : memory) : memory; }
  function save(list) { memory = list; if (KEY) writeJSON(KEY, list); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  // Champs internes de synchronisation (_dirty, _synced) retirés des exports et de la base
  function clean(a) { const o = {}; for (const k in a) if (k.charAt(0) !== "_") o[k] = a[k]; return o; }

  function legacyKeys() {
    const keys = [LEGACY];
    const account = CLOUD ? (readJSON("atsTester.accounts.v1", {}) || {})[user.email] : null;
    if (account && account.id) keys.push("atsTester.apps." + account.id + ".v1");
    return keys;
  }
  function legacyItems(key) {
    const items = readJSON(key, []);
    return Array.isArray(items) ? items.filter((a) => a && a.company) : [];
  }

  /* ---------- Synchronisation (mode cloud) ---------- */
  const listeners = [];
  let syncState = CLOUD ? "idle" : "off", running = false, again = false, timer = null;
  function setState(s) { syncState = s; listeners.forEach((fn) => fn({ type: "state", state: s })); }
  function emitData() { listeners.forEach((fn) => fn({ type: "data" })); }
  function schedule(ms) { if (!CLOUD) return; clearTimeout(timer); timer = setTimeout(sync, ms === undefined ? 500 : ms); }

  async function sync() {
    if (!CLOUD) return;
    if (running) { again = true; return; }
    running = true; setState("syncing");
    try {
      // 1. Suppressions faites ici, à reporter dans la base
      const gone = readJSON(DELETED, []);
      for (const id of gone) await ATS.auth.rest("applications?id=eq." + encodeURIComponent(id), { method: "DELETE" });
      if (gone.length) writeJSON(DELETED, readJSON(DELETED, []).filter((id) => !gone.includes(id)));

      // 2. Ce qui est dans la base (autres appareils compris)
      const rows = await ATS.auth.rest("applications?select=id,data,updated_at", { method: "GET" });

      // 3. Fusion, sans attente : aucune modification faite entre-temps ne peut être perdue
      const list = load(), pendingGone = new Set(readJSON(DELETED, []));
      const byId = new Map(list.map((a) => [a.id, a])), remote = new Set();
      const next = [];
      let changed = false;
      for (const r of rows || []) {
        if (pendingGone.has(r.id)) continue;
        remote.add(r.id);
        const mine = byId.get(r.id), theirs = { ...(r.data || {}), id: r.id, _synced: true };
        if (mine && mine._dirty && (mine.updatedAt || "") >= (theirs.updatedAt || "")) { next.push(mine); continue; }
        if (!mine || JSON.stringify(clean(mine)) !== JSON.stringify(clean(theirs))) changed = true;
        next.push(theirs);
      }
      for (const a of list) {
        if (remote.has(a.id)) continue;
        if (a._synced && !a._dirty) { changed = true; continue; } // supprimée depuis un autre appareil
        next.push(a);
      }
      save(next);
      if (changed) emitData();

      // 4. Envoi de ce qui n'est pas encore dans la base
      const todo = next.filter((a) => a._dirty || !a._synced);
      if (todo.length) {
        await ATS.auth.rest("applications?on_conflict=user_id,id", {
          method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
          body: todo.map((a) => ({ user_id: user.id, id: a.id, data: clean(a), updated_at: a.updatedAt || new Date().toISOString() })),
        });
        const sent = new Map(todo.map((a) => [a.id, a.updatedAt]));
        save(load().map((a) => (sent.has(a.id) && sent.get(a.id) === a.updatedAt ? { ...a, _dirty: false, _synced: true } : a)));
      }
      setState("ok");
    } catch (e) {
      const expired = e && e.code === "expired";
      setState(expired ? "expired" : "error");
      if (!expired) { clearTimeout(timer); timer = setTimeout(sync, 20000); } // nouvel essai plus tard
    } finally {
      running = false;
      if (again) { again = false; schedule(0); }
    }
  }
  if (CLOUD) {
    window.addEventListener("online", () => schedule(0));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(0); });
  }

  ATS.store = {
    STATUSES: ["À envoyer", "Envoyée", "Relancée", "Entretien", "Refusée", "Offre reçue"],
    isAvailable() { load(); return available; },
    list() { return load().sort((a, b) => (b.appliedAt || b.createdAt || "").localeCompare(a.appliedAt || a.createdAt || "")); },
    get(id) { return load().find((a) => a.id === id) || null; },
    upsert(app) {
      const list = load();
      const now = new Date().toISOString();
      let out;
      const i = app.id ? list.findIndex((a) => a.id === app.id) : -1;
      if (i >= 0) { out = list[i] = { ...list[i], ...app, updatedAt: now, _dirty: true }; }
      else { out = { ...app, id: app.id || uid(), createdAt: now, updatedAt: now, _dirty: true }; list.push(out); }
      save(list); schedule();
      return out;
    },
    remove(id) {
      const list = load(), a = list.find((x) => x.id === id);
      save(list.filter((x) => x.id !== id));
      if (CLOUD && a && a._synced) { writeJSON(DELETED, [...new Set([...readJSON(DELETED, []), id])]); schedule(); }
    },
    exportJSON() {
      return JSON.stringify({ app: "ats-tester", version: 1, exportedAt: new Date().toISOString(), applications: load().map(clean) }, null, 2);
    },
    importJSON(text) {
      const data = JSON.parse(text);
      const incoming = Array.isArray(data) ? data : data.applications;
      if (!Array.isArray(incoming)) throw new Error("Fichier non reconnu.");
      const list = load();
      let added = 0, updated = 0;
      for (const raw of incoming) {
        if (!raw || !raw.company) continue;
        const a = { ...clean(raw), _dirty: true };
        const i = list.findIndex((x) => x.id === a.id);
        if (i >= 0) { list[i] = { ...a, _synced: list[i]._synced }; updated++; } else { list.push({ ...a, id: a.id || uid() }); added++; }
      }
      save(list); schedule();
      return { added, updated };
    },

    /* Candidatures retrouvées sur cet appareil : celles d'avant les espaces personnels et,
       en mode cloud, celles de l'espace « appareil » créé avec le même e-mail */
    legacyCount() {
      if (!KEY || readJSON(DISMISSED, false)) return 0;
      return legacyKeys().reduce((n, k) => n + legacyItems(k).length, 0);
    },
    claimLegacy() {
      const list = load(), ids = new Set(list.map((a) => a.id));
      let n = 0;
      for (const k of legacyKeys()) {
        for (const a of legacyItems(k)) {
          const id = a.id && !ids.has(a.id) ? a.id : uid();
          list.push({ ...clean(a), id, _dirty: true }); ids.add(id); n++;
        }
        try { localStorage.removeItem(k); } catch (e) {}
      }
      save(list);
      schedule(0);
      return n;
    },
    dismissLegacy() { writeJSON(DISMISSED, true); },

    /* Synchronisation */
    cloud: CLOUD,
    syncState() { return syncState; },
    sync() { return sync(); },
    onChange(fn) { listeners.push(fn); },
    hasPending() { return load().some((a) => a._dirty || !a._synced) || readJSON(DELETED, []).length > 0; },
    // À la déconnexion en mode cloud : le cache de cet appareil est effacé s'il ne reste rien à envoyer
    forget() { if (CLOUD && !ATS.store.hasPending()) { try { localStorage.removeItem(KEY); localStorage.removeItem(DELETED); } catch (e) {} } },
  };
})();
