/* ATS Tester — extraction du texte des fichiers (PDF, DOCX, TXT, MD, HTML, images)
 * Tout se passe dans le navigateur : aucun fichier n'est envoyé sur un serveur.
 * Option { ocr: true } (fiche de poste) : les pages sans texte lisible (scan, image, texte vectorisé)
 * et les images sont lues par reconnaissance de caractères (ocr.js). Pas pour le CV ni la lettre :
 * un vrai ATS ne lit pas un CV scanné, l'analyse doit le signaler.
 */
window.ATS = window.ATS || {};

(function () {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdf.worker.min.js";
  }

  function ext(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  const letters = (t) => (String(t).match(/[\p{L}\p{N}]/gu) || []).length;
  // Page sans texte, ou texte inutilisable (police sans correspondance Unicode : symboles privés, « ? »)
  function unreadable(t) {
    const s = t.replace(/\s/g, "");
    if (s.length < 25) return true;
    const pua = (s.match(/[\uE000-\uF8FF\uFFFD]/g) || []).length;
    return letters(s) / s.length < 0.55 || pua / s.length > 0.1;
  }

  // Page PDF dessinée sur une toile blanche (≈ 2 000 px de large), puis lue par OCR
  async function ocrPdfPage(page, n, total, onProgress) {
    const base = page.getViewport({ scale: 1 });
    let scale = Math.min(3, Math.max(1.5, 2000 / base.width));
    if (base.width * base.height * scale * scale > 16e6) scale = Math.sqrt(16e6 / (base.width * base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    try {
      return await ATS.ocr.recognize(canvas, (progress, status) => onProgress && onProgress({ page: n, pages: total, progress, status }));
    } finally { canvas.width = canvas.height = 0; }
  }

  async function fromPdf(file, opts) {
    if (!window.pdfjsLib) throw new Error("La bibliothèque PDF n'a pas pu être chargée.");
    const data = new Uint8Array(await readAsArrayBuffer(file));
    // isEvalSupported:false = protection contre les PDF malveillants (CVE-2024-4367)
    const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    let text = "";
    let images = 0;
    const ocr = { pages: 0, confidence: [] };
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        pageText += item.str;
        pageText += item.hasEOL ? "\n" : (item.str && !/\s$/.test(item.str) ? " " : "");
      }
      if (opts.ocr && ATS.ocr && unreadable(pageText)) {
        const r = await ocrPdfPage(page, p, pdf.numPages, opts.onProgress);
        if (letters(r.text) > letters(pageText)) { pageText = r.text; ocr.pages++; ocr.confidence.push(r.confidence); }
      }
      text += pageText + "\n\n";
      try {
        const ops = await page.getOperatorList();
        for (const fn of ops.fnArray) {
          if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) images++;
        }
      } catch (e) { /* comptage d'images facultatif */ }
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
    const meta = { type: "pdf", pages: pdf.numPages, images, tables: null };
    if (ocr.pages) Object.assign(meta, { ocr: true, ocrPages: ocr.pages, confidence: Math.round(ocr.confidence.reduce((a, b) => a + b, 0) / ocr.confidence.length) });
    return { text, meta };
  }

  // Image (capture d'écran, photo) : agrandie si elle est petite, pour que les lettres soient assez grandes
  async function fromImage(file, opts) {
    if (!ATS.ocr) throw new Error("La reconnaissance de texte n'est pas disponible sur cette page.");
    let source = file;
    try {
      const bmp = await createImageBitmap(file);
      const k = bmp.width < 1600 ? Math.min(2.5, 2400 / bmp.width) : 1;
      if (k > 1.05) {
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        source = c;
      }
      bmp.close();
    } catch (e) {
      throw new Error("Cette image n'a pas pu être ouverte. Formats d'image acceptés : PNG, JPG, WebP, BMP.");
    }
    const r = await ATS.ocr.recognize(source, (progress, status) => opts.onProgress && opts.onProgress({ page: 1, pages: 1, progress, status }));
    if (source !== file) source.width = source.height = 0;
    return { text: r.text, meta: { type: "image", pages: 1, images: 1, tables: null, ocr: true, ocrPages: 1, confidence: r.confidence } };
  }
  const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "bmp"];

  async function fromDocx(file) {
    if (!window.mammoth) throw new Error("La bibliothèque Word n'a pas pu être chargée.");
    const arrayBuffer = await readAsArrayBuffer(file);
    const raw = await mammoth.extractRawText({ arrayBuffer });
    let tables = 0, images = 0;
    try {
      const html = await mammoth.convertToHtml({ arrayBuffer });
      tables = (html.value.match(/<table/g) || []).length;
      images = (html.value.match(/<img/g) || []).length;
    } catch (e) { /* facultatif */ }
    const text = raw.value.replace(/\n{3,}/g, "\n\n").trim();
    return { text, meta: { type: "docx", pages: null, images, tables } };
  }

  function stripHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style").forEach((n) => n.remove());
    return (doc.body ? doc.body.innerText || doc.body.textContent : "") || "";
  }

  /**
   * Extrait le texte d'un fichier. Renvoie { text, meta:{ type, pages, images, tables, ocr?, ocrPages?, confidence? } }
   * @param opts  { ocr: true } pour lire les PDF scannés et les images ; onProgress({ page, pages, progress, status })
   */
  ATS.extractFile = async function (file, opts) {
    opts = opts || {};
    const e = ext(file.name);
    if (e === "pdf" || file.type === "application/pdf") return fromPdf(file, opts);
    if (opts.ocr && (IMAGE_EXT.includes(e) || /^image\/(png|jpeg|webp|bmp)$/.test(file.type || ""))) return fromImage(file, opts);
    if (e === "docx") return fromDocx(file);
    if (e === "doc") throw new Error("Le format .doc (Word 97-2003) n'est pas lu. Enregistre le fichier en .docx ou en PDF.");
    if (e === "odt") throw new Error("Le format .odt n'est pas lu. Exporte le fichier en .docx ou en PDF depuis LibreOffice.");
    if (e === "html" || e === "htm") {
      const t = await readAsText(file);
      return { text: stripHtml(t).trim(), meta: { type: "html", pages: null, images: null, tables: null } };
    }
    if (["txt", "md", "markdown", "text", "rtf", "csv"].includes(e) || (file.type || "").startsWith("text/")) {
      let t = await readAsText(file);
      if (e === "rtf") t = t.replace(/\\par[d]?/g, "\n").replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, "");
      return { text: t.trim(), meta: { type: e || "txt", pages: null, images: null, tables: null } };
    }
    throw new Error("Format non pris en charge (" + (e || file.type || "inconnu") + "). Formats acceptés : PDF, DOCX, TXT, MD, HTML, RTF" + (opts.ocr ? ", PNG, JPG, WebP." : "."));
  };

  ATS.ACCEPT = ".pdf,.docx,.txt,.md,.html,.htm,.rtf";
  // Fiche de poste : les images (captures d'écran, photos) sont aussi acceptées, lues par OCR
  ATS.ACCEPT_JD = ATS.ACCEPT + ",.png,.jpg,.jpeg,.webp,.bmp,image/png,image/jpeg,image/webp";
})();
