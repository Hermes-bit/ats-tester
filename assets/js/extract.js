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

  function pageCanvas(page, targetWidth, maxPixels) {
    const base = page.getViewport({ scale: 1 });
    let scale = targetWidth / base.width;
    if (base.width * base.height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (base.width * base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas, ctx, vp };
  }

  // Lecture par OCR d'une toile (page scannée, image) : case par case si la page est un tableau
  function ocrLayout(canvas, page, pages, onProgress) {
    return ATS.layout.ocrCanvas(canvas, ATS.ocr.recognizeLines, (progress, status) => onProgress && onProgress({ page, pages, progress, status: status || "recognizing text" }));
  }

  // Page PDF scannée : dessinée à ≈ 2 400 px de large, puis lue par OCR
  async function ocrPdfPage(page, n, total, onProgress) {
    const { canvas, ctx, vp } = pageCanvas(page, 2400, 20e6);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    try { return await ocrLayout(canvas, n, total, onProgress); } finally { canvas.width = canvas.height = 0; }
  }

  // Page PDF texte : si elle contient un tableau, le texte est remis dans l'ordre des cases
  async function orderTablePage(page, content) {
    const { canvas, ctx, vp } = pageCanvas(page, 1400, 6e6);
    try {
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const items = content.items.filter((it) => it.str !== undefined).map((it) => {
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const hgt = Math.max(4, Math.hypot(it.transform[2], it.transform[3]) * vp.scale);
        return { str: it.str, hasEOL: it.hasEOL, x: x + 2, y, h: hgt, w: (it.width || 0) * vp.scale };
      });
      return ATS.layout.orderPdfItems(items, canvas);
    } catch (e) { return null; } finally { canvas.width = canvas.height = 0; }
  }

  async function fromPdf(file, opts) {
    if (!window.pdfjsLib) throw new Error("La bibliothèque PDF n'a pas pu être chargée.");
    const data = new Uint8Array(await readAsArrayBuffer(file));
    // isEvalSupported:false = protection contre les PDF malveillants (CVE-2024-4367)
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    } catch (e) {
      if (e && e.name === "PasswordException") throw new Error("Ce PDF est protégé par un mot de passe : ouvre-le, puis enregistre-le sans protection (Imprimer > Enregistrer au format PDF).");
      throw new Error("Ce PDF est endommagé ou illisible. Réenregistre-le (Imprimer > Enregistrer au format PDF) ou colle le texte de l'annonce.");
    }
    let text = "";
    let images = 0;
    const ocr = { pages: 0, confidence: [] };
    let tables = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        pageText += item.str;
        pageText += item.hasEOL ? "\n" : (item.str && !/\s$/.test(item.str) ? " " : "");
      }
      if (opts.ocr && ATS.ocr && ATS.layout && unreadable(pageText)) {
        const r = await ocrPdfPage(page, p, pdf.numPages, opts.onProgress);
        if (letters(r.text) > letters(pageText)) { pageText = r.text; ocr.pages++; ocr.confidence.push(r.confidence); if (r.regions >= 3) tables++; }
      } else if (opts.ocr && ATS.layout) {
        const ordered = await orderTablePage(page, content);
        if (ordered && letters(ordered) >= letters(pageText) * 0.9) { pageText = ordered; tables++; }
      }
      text += pageText + "\n\n";
      // Comptage des images (contrôle « mise en page simple » du CV) : inutile pour la fiche de poste,
      // et coûteux sur un scan (l'image serait décodée une seconde fois)
      if (!opts.ocr) try {
        const ops = await page.getOperatorList();
        for (const fn of ops.fnArray) {
          if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) images++;
        }
      } catch (e) { /* comptage d'images facultatif */ }
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
    const meta = { type: "pdf", pages: pdf.numPages, images, tables: opts.ocr ? tables : null };
    if (ocr.pages) Object.assign(meta, { ocr: true, ocrPages: ocr.pages, confidence: Math.round(ocr.confidence.reduce((a, b) => a + b, 0) / ocr.confidence.length) });
    return { text, meta };
  }

  // Image (capture d'écran, photo) : mise à ≈ 2 400 px de large pour que les lettres soient assez grandes
  async function fromImage(file, opts) {
    if (!ATS.ocr || !ATS.layout) throw new Error("La reconnaissance de texte n'est pas disponible sur cette page.");
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) {
      throw new Error("Cette image n'a pas pu être ouverte. Formats d'image acceptés : PNG, JPG, WebP, BMP.");
    }
    let k = bmp.width < 1600 ? Math.min(2.5, 2400 / bmp.width) : bmp.width > 3200 ? 2400 / bmp.width : 1;
    if (bmp.width * bmp.height * k * k > 20e6) k = Math.sqrt(20e6 / (bmp.width * bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    try {
      const r = await ocrLayout(c, 1, 1, opts.onProgress);
      return { text: r.text, meta: { type: "image", pages: 1, images: 1, tables: r.regions >= 3 ? 1 : 0, ocr: true, ocrPages: 1, confidence: r.confidence } };
    } finally { c.width = c.height = 0; }
  }
  const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "bmp"];

  /* ---------- Documents structurés : Word, OpenDocument, HTML ----------
   * Paragraphes, listes et tableaux parcourus dans l'ordre du document. Les tableaux sont lus avec les
   * règles de layout.js (sections en colonnes, libellé : valeur) au lieu d'être aplatis ligne par ligne.
   * Mêmes noms d'éléments pour le HTML (p, li, table, tr, td) et l'OpenDocument (p, h, list-item, table-row…).
   */
  const BLOCK = new Set(["p", "h", "h1", "h2", "h3", "h4", "h5", "h6", "li", "list-item", "pre", "blockquote", "dt", "dd", "address", "figcaption", "caption", "summary", "legend"]);
  const SKIP = new Set(["script", "style", "noscript", "template", "head", "title", "svg", "button", "select", "nav", "annotation", "tracked-changes", "sequence-decls", "forms", "notes-configuration"]);
  const ROW_GROUPS = new Set(["thead", "tbody", "tfoot", "table-header-rows", "table-rows", "table-row-group"]);
  const CELLS = new Set(["td", "th", "table-cell", "covered-table-cell"]);
  let flatTables = false; // CV et lettre : tableaux aplatis ligne par ligne, comme les lit un ATS
  function tidyBlock(t) {
    return t.split("\n").map((l) => l.replace(/[ \t\u00A0]+/g, " ").trim()).filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trim();
  }
  function inlineText(el) {
    let out = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, " "); continue; }
      if (n.nodeType !== 1) continue;
      const k = n.localName;
      if (SKIP.has(k)) continue;
      if (k === "br" || k === "line-break") out += "\n";
      else if (k === "tab") out += " ";
      else if (k === "s") out += " ".repeat(Math.min(20, Number(n.getAttribute("text:c")) || 1));
      else if (k === "table") out += "\n" + tableText(n) + "\n";
      else if (BLOCK.has(k) || k === "div" || k === "ul" || k === "ol" || k === "list") out += "\n" + structuredText(n) + "\n";
      else out += inlineText(n);
    }
    return out;
  }
  function structuredText(root) {
    const parts = [];
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t) parts.push(t); continue; }
        if (n.nodeType !== 1) continue;
        const k = n.localName;
        if (SKIP.has(k)) continue;
        if (k === "table") { const t = tableText(n); if (t) parts.push(t); continue; }
        if (BLOCK.has(k)) {
          const t = tidyBlock(inlineText(n));
          if (t) parts.push((k === "li" || k === "list-item") && !/^[•\-–*]/.test(t) ? "• " + t : t);
          continue;
        }
        walk(n);
      }
    };
    walk(root);
    return parts.join("\n");
  }
  function tableText(table) {
    const rows = [];
    const collect = (el) => { for (const n of el.children) { const k = n.localName; if (k === "tr" || k === "table-row") rows.push(n); else if (ROW_GROUPS.has(k)) collect(n); } };
    collect(table);
    const grid = rows.map((r) => [...r.children].filter((c) => CELLS.has(c.localName)).map((c) => ({
      text: c.localName === "covered-table-cell" ? "" : tidyBlock(structuredText(c)),
      span: Number(c.getAttribute("colspan") || c.getAttribute("table:number-columns-spanned")) || 1,
    })));
    if (!grid.some((r) => r.length)) return "";
    if (flatTables || !ATS.layout) return grid.map((r) => r.map((c) => c.text).filter(Boolean).join("\n")).filter(Boolean).join("\n");
    return ATS.layout.assembleGrid(grid);
  }

  async function fromDocx(file, opts) {
    if (!window.mammoth) throw new Error("La bibliothèque Word n'a pas pu être chargée.");
    const arrayBuffer = await readAsArrayBuffer(file);
    let tables = 0, images = 0, html = null;
    try {
      html = (await mammoth.convertToHtml({ arrayBuffer })).value;
      tables = (html.match(/<table/g) || []).length;
      images = (html.match(/<img/g) || []).length;
    } catch (e) { html = null; }
    let text;
    if (opts.ocr && html && tables) {
      // Fiche de poste avec tableaux : lue case par case dans l'ordre de lecture
      text = structuredText(new DOMParser().parseFromString(html, "text/html").body);
    } else {
      // CV et lettre : texte brut, dans l'ordre où un ATS le lit
      text = (await mammoth.extractRawText({ arrayBuffer })).value;
    }
    return { text: text.replace(/\n{3,}/g, "\n\n").trim(), meta: { type: "docx", pages: null, images, tables } };
  }

  // Fichier d'une archive ZIP (OpenDocument) : répertoire central, puis décompression native du navigateur
  async function zipEntry(buf, wanted) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder("utf-8");
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("Ce fichier OpenDocument est endommagé.");
    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < count && dv.getUint32(ptr, true) === 0x02014b50; k++) {
      const method = dv.getUint16(ptr + 10, true), size = dv.getUint32(ptr + 20, true);
      const nlen = dv.getUint16(ptr + 28, true), xlen = dv.getUint16(ptr + 30, true), clen = dv.getUint16(ptr + 32, true), off = dv.getUint32(ptr + 42, true);
      if (dec.decode(u8.subarray(ptr + 46, ptr + 46 + nlen)) === wanted) {
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = u8.subarray(start, start + size);
        if (method === 0) return dec.decode(data);
        if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("Ce navigateur ne sait pas ouvrir ce fichier OpenDocument : exporte-le en PDF ou en DOCX.");
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      }
      ptr += 46 + nlen + xlen + clen;
    }
    throw new Error("Contenu introuvable dans ce fichier OpenDocument.");
  }
  async function fromOdt(file, opts) {
    const xml = await zipEntry(await readAsArrayBuffer(file), "content.xml");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Ce fichier OpenDocument est endommagé.");
    const body = doc.getElementsByTagNameNS("*", "text")[0] || doc.documentElement;
    const tables = doc.getElementsByTagNameNS("*", "table").length;
    flatTables = !opts.ocr;
    const text = structuredText(body).replace(/\n{3,}/g, "\n\n").trim();
    flatTables = false;
    return { text, meta: { type: "odt", pages: null, images: doc.getElementsByTagNameNS("*", "image").length, tables } };
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
    if (e === "docx") return fromDocx(file, opts);
    if (e === "doc") throw new Error("Le format .doc (Word 97-2003) n'est pas lu. Enregistre le fichier en .docx ou en PDF.");
    if (e === "odt" || file.type === "application/vnd.oasis.opendocument.text") return fromOdt(file, opts);
    if (e === "html" || e === "htm") {
      const doc = new DOMParser().parseFromString(await readAsText(file), "text/html");
      flatTables = !opts.ocr;
      const text = structuredText(doc.body || doc.documentElement);
      flatTables = false;
      return { text: text.replace(/\n{3,}/g, "\n\n").trim(), meta: { type: "html", pages: null, images: null, tables: doc.querySelectorAll("table").length } };
    }
    if (["txt", "md", "markdown", "text", "rtf", "csv"].includes(e) || (file.type || "").startsWith("text/")) {
      let t = await readAsText(file);
      if (e === "rtf") t = t.replace(/\\par[d]?/g, "\n").replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, "");
      return { text: t.trim(), meta: { type: e || "txt", pages: null, images: null, tables: null } };
    }
    throw new Error("Format non pris en charge (" + (e || file.type || "inconnu") + "). Formats acceptés : PDF, DOCX, ODT, TXT, MD, HTML, RTF" + (opts.ocr ? ", PNG, JPG, WebP." : "."));
  };

  ATS.ACCEPT = ".pdf,.docx,.odt,.txt,.md,.html,.htm,.rtf";
  // Fiche de poste : les images (captures d'écran, photos) sont aussi acceptées, lues par OCR
  ATS.ACCEPT_JD = ATS.ACCEPT + ",.png,.jpg,.jpeg,.webp,.bmp,image/png,image/jpeg,image/webp";
})();
