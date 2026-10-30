/* ATS Tester — fichiers d'origine des candidatures (CV, lettre)
 * Les fichiers importés (PDF, DOCX…) sont gardés dans le navigateur (IndexedDB), propres à chaque espace,
 * pour être retéléchargés depuis « Mes candidatures ». Ils ne sont jamais envoyés sur un serveur :
 * en mode cloud, seules leurs références (nom, taille, empreinte) se synchronisent.
 * Un même fichier utilisé pour plusieurs candidatures n'est gardé qu'une fois (empreinte SHA-256).
 */
window.ATS = window.ATS || {};

(function () {
  const DB_NAME = "atsTester", STORE = "files", VERSION = 1;
  const MAX_SIZE = 15 * 1024 * 1024; // un CV dépasse rarement 2 Mo
  let dbPromise = null;

  /* ---------- Utilitaires (sans IndexedDB, testés avec Jest) ---------- */
  /** Nom de fichier sûr sur Windows, macOS et Linux. */
  function safeName(name, fallback) {
    const s = String(name || "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "-").replace(/\s+/g, " ").replace(/^[\s.-]+|[\s.]+$/g, "").trim();
    return (s || fallback || "document").slice(0, 150);
  }
  function formatSize(bytes) {
    if (!(bytes >= 0)) return "";
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mo";
  }
  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  async function sha256(buffer) {
    const h = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- IndexedDB ---------- */
  function open() {
    if (!window.indexedDB) return Promise.reject(new Error("Stockage des fichiers indisponible dans ce navigateur."));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, VERSION);
        r.onupgradeneeded = () => {
          const s = r.result.createObjectStore(STORE, { keyPath: "key" });
          s.createIndex("user", "userId");
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error("Stockage des fichiers bloqué par un autre onglet."));
      }).catch((e) => { dbPromise = null; throw e; });
    }
    return dbPromise;
  }
  // Une transaction par opération : jamais d'attente hors IndexedDB pendant une transaction
  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let result;
      const r = fn(t.objectStore(STORE));
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("Enregistrement du fichier annulé (espace de stockage plein ?)."));
    });
  }
  function userId() {
    const u = ATS.auth && ATS.auth.user();
    if (!u) throw new Error("Aucun espace connecté.");
    return u.id;
  }
  const keyOf = (hash) => userId() + ":" + hash;

  /** Garde un fichier ; renvoie sa référence { hash, name, type, size } à enregistrer avec la candidature. */
  async function put(file) {
    if (!file) return null;
    if (file.size > MAX_SIZE) throw new Error("Fichier trop lourd pour être gardé (" + formatSize(file.size) + ", maximum " + formatSize(MAX_SIZE) + ").");
    const buffer = await file.arrayBuffer();
    const hash = await sha256(buffer);
    const ref = { hash, name: safeName(file.name, "document"), type: file.type || "application/octet-stream", size: file.size };
    const key = keyOf(hash);
    const existing = await run("readonly", (s) => s.getKey(key));
    if (!existing) await run("readwrite", (s) => s.put({ key, userId: userId(), ...ref, data: buffer, addedAt: new Date().toISOString() }));
    return ref;
  }

  /** Fichier gardé sur cet appareil : { name, type, size, blob }, ou null. */
  async function get(hash) {
    if (!hash) return null;
    const rec = await run("readonly", (s) => s.get(keyOf(hash)));
    return rec ? { name: rec.name, type: rec.type, size: rec.size, blob: new Blob([rec.data], { type: rec.type }) } : null;
  }

  /** Empreintes des fichiers gardés pour l'espace connecté. */
  async function list() {
    const keys = await run("readonly", (s) => s.index("user").getAllKeys(userId()));
    return (keys || []).map((k) => String(k).slice(String(k).indexOf(":") + 1));
  }

  /** Supprime les fichiers que plus aucune candidature n'utilise. */
  async function prune(usedHashes) {
    const used = new Set(usedHashes);
    const stale = (await list()).filter((h) => !used.has(h));
    for (const h of stale) await run("readwrite", (s) => s.delete(keyOf(h)));
    return stale.length;
  }

  /** Pour l'export JSON : { empreinte: { name, type, size, data (base64) } } */
  async function exportFiles(hashes) {
    const out = {};
    for (const h of new Set(hashes)) {
      const rec = await run("readonly", (s) => s.get(keyOf(h)));
      if (rec) out[h] = { name: rec.name, type: rec.type, size: rec.size, data: toBase64(rec.data) };
    }
    return out;
  }
  /** Import : remet les fichiers d'un export dans l'espace connecté. */
  async function importFiles(map) {
    let n = 0;
    for (const [hash, f] of Object.entries(map || {})) {
      if (!f || typeof f.data !== "string" || !/^[0-9a-f]{64}$/.test(hash)) continue;
      const data = fromBase64(f.data);
      if (await sha256(data) !== hash) continue; // fichier altéré : ignoré
      await run("readwrite", (s) => s.put({ key: keyOf(hash), userId: userId(), hash, name: safeName(f.name, "document"), type: f.type || "application/octet-stream", size: data.byteLength, data, addedAt: new Date().toISOString() }));
      n++;
    }
    return n;
  }

  /** Lance le téléchargement d'un Blob sous le nom donné. */
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  ATS.files = { put, get, list, prune, exportFiles, importFiles, download, safeName, formatSize, toBase64, fromBase64, MAX_SIZE };
})();
