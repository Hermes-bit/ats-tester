/* ATS Tester — sauvegarde des candidatures
 * Les données restent dans le navigateur (localStorage), sur cet appareil uniquement.
 * Utilise « Exporter » pour garder une copie (fichier JSON) ou passer sur un autre ordinateur.
 */
window.ATS = window.ATS || {};

(function () {
  const KEY = "atsTester.applications.v1";
  const DRAFT = "atsTester.draft.v1";
  let memory = []; // secours si le stockage est bloqué (navigation privée stricte)
  let available = true;
  // Les anciennes versions gardaient un brouillon de l'offre : on le supprime partout
  try { localStorage.removeItem(DRAFT); } catch (e) {}
  try { sessionStorage.removeItem(DRAFT); } catch (e) {}

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { available = false; return memory; }
  }
  function save(list) {
    memory = list;
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { available = false; return false; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  ATS.store = {
    STATUSES: ["À envoyer", "Envoyée", "Relancée", "Entretien", "Refusée", "Offre reçue"],
    isAvailable() { load(); return available; },
    list() { return load().sort((a, b) => (b.appliedAt || b.createdAt || "").localeCompare(a.appliedAt || a.createdAt || "")); },
    get(id) { return load().find((a) => a.id === id) || null; },
    upsert(app) {
      const list = load();
      const now = new Date().toISOString();
      if (app.id) {
        const i = list.findIndex((a) => a.id === app.id);
        if (i >= 0) { list[i] = { ...list[i], ...app, updatedAt: now }; save(list); return list[i]; }
      }
      const created = { ...app, id: app.id || uid(), createdAt: now, updatedAt: now };
      list.push(created); save(list); return created;
    },
    remove(id) { save(load().filter((a) => a.id !== id)); },
    exportJSON() {
      return JSON.stringify({ app: "ats-tester", version: 1, exportedAt: new Date().toISOString(), applications: load() }, null, 2);
    },
    importJSON(text) {
      const data = JSON.parse(text);
      const incoming = Array.isArray(data) ? data : data.applications;
      if (!Array.isArray(incoming)) throw new Error("Fichier non reconnu.");
      const list = load();
      let added = 0, updated = 0;
      for (const a of incoming) {
        if (!a || !a.company) continue;
        const i = list.findIndex((x) => x.id === a.id);
        if (i >= 0) { list[i] = a; updated++; } else { list.push({ ...a, id: a.id || uid() }); added++; }
      }
      save(list);
      return { added, updated };
    },  };
})();
