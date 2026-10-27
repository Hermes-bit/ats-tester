/* ATS Tester — extraction du texte des fichiers (PDF, DOCX, TXT, MD, HTML)
 * Tout se passe dans le navigateur : aucun fichier n'est envoyé sur un serveur.
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

  async function fromPdf(file) {
    if (!window.pdfjsLib) throw new Error("La bibliothèque PDF n'a pas pu être chargée.");
    const data = new Uint8Array(await readAsArrayBuffer(file));
    // isEvalSupported:false = protection contre les PDF malveillants (CVE-2024-4367)
    const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    let text = "";
    let images = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items) {
        text += item.str;
        text += item.hasEOL ? "\n" : (item.str && !/\s$/.test(item.str) ? " " : "");
      }
      text += "\n\n";
      try {
        const ops = await page.getOperatorList();
        for (const fn of ops.fnArray) {
          if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) images++;
        }
      } catch (e) { /* comptage d'images facultatif */ }
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
    return { text, meta: { type: "pdf", pages: pdf.numPages, images, tables: null } };
  }

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

  /** Extrait le texte d'un fichier. Renvoie { text, meta:{type,pages,images,tables} } */
  ATS.extractFile = async function (file) {
    const e = ext(file.name);
    if (e === "pdf" || file.type === "application/pdf") return fromPdf(file);
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
    throw new Error("Format non pris en charge (" + (e || file.type || "inconnu") + "). Formats acceptés : PDF, DOCX, TXT, MD, HTML, RTF.");
  };

  ATS.ACCEPT = ".pdf,.docx,.txt,.md,.html,.htm,.rtf";
})();
