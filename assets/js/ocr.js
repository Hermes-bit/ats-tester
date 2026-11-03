/* ATS Tester — reconnaissance de texte (OCR) pour les fiches de poste scannées ou en image
 * Tesseract.js (Apache 2.0) est hébergé avec le site (assets/vendor/tesseract) et chargé seulement
 * quand un document n'a pas de texte lisible : l'image est lue dans le navigateur, rien n'est envoyé.
 * Modèle de langue français ; les termes techniques anglais (Python, ArcGIS…) sont bien reconnus.
 */
window.ATS = window.ATS || {};

(function () {
  const BASE = typeof document !== "undefined" ? new URL("assets/vendor/tesseract/", document.baseURI).href : "";
  // Petit module WebAssembly de test : valide seulement si le processeur gère les instructions SIMD
  const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  const IDLE_MS = 90000; // le moteur est libéré après 1 min 30 sans lecture
  let libPromise = null, workerPromise = null, idleTimer = null, listener = null;

  function simd() {
    try { return typeof WebAssembly === "object" && WebAssembly.validate(SIMD_TEST); } catch (e) { return false; }
  }

  function loadLib() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = BASE + "tesseract.min.js?v=7.0.0";
        s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Module de reconnaissance de texte indisponible.")));
        s.onerror = () => { libPromise = null; s.remove(); reject(new Error("Impossible de charger le module de reconnaissance de texte. Vérifie ta connexion puis réessaie.")); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  function getWorker() {
    clearTimeout(idleTimer);
    if (!workerPromise) {
      workerPromise = loadLib()
        .then((T) => T.createWorker("fra", 1, {
          workerPath: BASE + "worker.min.js?v=7.0.0",
          // Variante du moteur choisie ici : seules les versions SIMD et standard sont hébergées
          corePath: BASE + (simd() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js"),
          langPath: BASE + "lang",
          logger: (m) => { if (listener) listener(m); },
        }))
        .catch((e) => { workerPromise = null; throw e instanceof Error ? e : new Error(String(e)); });
    }
    return workerPromise;
  }

  function releaseLater() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const p = workerPromise;
      workerPromise = null;
      if (p) p.then((w) => w.terminate()).catch(() => {});
    }, IDLE_MS);
  }

  // Lignes coupées par la mise en page : recollées quand la phrase continue
  function tidy(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()
      .replace(/^[»«•·*▪●◦‣>©®✓✔]\s+/, "• ")); // puces lues comme « », •, © … : uniformisées
    const out = [];
    for (const line of lines) {
      if (!line) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
      const prev = out.length ? out[out.length - 1] : "";
      const isItem = /^([-–—•·*▪●◦‣>»✓✔]|\d+[.)])\s/.test(line);
      const continues = prev && !isItem && /^[\p{Ll}(«"']/u.test(line) && !/[.!?:;]$/.test(prev);
      if (continues && /\p{L}-$/u.test(prev)) out[out.length - 1] = prev.slice(0, -1) + line; // césure : « dévelop- / pement »
      else if (continues) out[out.length - 1] = prev + " " + line;
      else out.push(line);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n");
  }

  /**
   * Reconnaît le texte d'une image (canvas, Blob, File).
   * @param onProgress  fonction(progression 0..1, étape) : étapes « loading… », « recognizing text »
   * @returns { text, confidence (0 à 100) }
   */
  async function recognize(image, onProgress) {
    listener = (m) => { if (onProgress) onProgress(typeof m.progress === "number" ? m.progress : 0, m.status || ""); };
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(image);
      return { text: tidy(data.text), confidence: Math.round(data.confidence || 0) };
    } finally {
      listener = null;
      releaseLater();
    }
  }

  ATS.ocr = { recognize, tidy, simd };
})();
