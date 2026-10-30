/* ATS Tester — génération d'un PDF à partir d'un texte
 * Sert quand le fichier d'origine d'un CV ou d'une lettre n'a pas été gardé (texte collé, ancienne candidature,
 * autre appareil) : on reconstitue un PDF propre, A4, police Helvetica, avec césure des lignes et pagination.
 * PDF 1.4 entièrement ASCII (caractères accentués en Windows-1252, échappés en octal), sans dépendance.
 */
window.ATS = window.ATS || {};

(function () {
  // Windows-1252 : caractères de 0x80 à 0x9F (le reste de 0xA0 à 0xFF correspond au Latin-1)
  const CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8A, "‹": 0x8B, "Œ": 0x8C, "Ž": 0x8E,
    "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B, "œ": 0x9C, "ž": 0x9E, "Ÿ": 0x9F };
  // Remplacements pour les caractères absents de Windows-1252
  const FALLBACK = { "‐": "-", "‑": "-", "‒": "-", "−": "-", "•": "•", "●": "•", "▪": "•", "◦": "•", "‣": "•", "⁃": "-", "➢": ">", "➤": ">", "►": ">",
    "✓": "+", "✔": "+", "→": "->", "←": "<-", "…": "…", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", "​": "", "﻿": "", "′": "'", "″": "\"" };

  /** Code Windows-1252 d'un caractère, ou null s'il n'existe pas dans ce jeu. */
  function cp(ch) {
    const c = ch.codePointAt(0);
    if (c < 0x80) return c >= 0x20 || c === 0x0A ? c : null;
    if (CP1252[ch] !== undefined) return CP1252[ch];
    if (c >= 0xA0 && c <= 0xFF) return c;
    return null;
  }
  /** Texte ramené aux caractères imprimables avec la police Helvetica standard. */
  function toWinAnsi(text) {
    let out = "";
    for (const ch of String(text || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ")) {
      if (cp(ch) !== null) { out += ch; continue; }
      if (FALLBACK[ch] !== undefined) { out += FALLBACK[ch]; continue; }
      const k = ch.normalize("NFKC"); // ligatures ﬁ → fi, exposants…
      if (k !== ch && [...k].every((x) => cp(x) !== null)) { out += k; continue; }
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && [...base].every((x) => cp(x) !== null) ? base : "?";
    }
    return out;
  }

  // Largeurs Helvetica (1/1000 em) pour la césure des lignes
  const W = {};
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~".split("").forEach((ch, i) => {
    W[ch] = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
      667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
      556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584][i];
  });
  Object.assign(W, { "€": 556, "…": 1000, "‘": 222, "’": 222, "“": 333, "”": 333, "•": 350, "–": 556, "—": 1000, "«": 556, "»": 556, "°": 400, "Œ": 1000, "œ": 944, "Æ": 1000, "æ": 889, "ß": 611, "©": 737, "®": 737, "™": 1000 });
  function width(ch) {
    if (W[ch] !== undefined) return W[ch];
    const base = ch.normalize("NFD").charAt(0);
    return W[base] !== undefined ? W[base] : 556;
  }
  function textWidth(s, size) { let w = 0; for (const ch of s) w += width(ch); return (w * size) / 1000; }

  /** Découpe un paragraphe en lignes d'au plus maxWidth points. */
  function wrap(line, size, maxWidth) {
    if (!line.trim()) return [""];
    const indent = (line.match(/^ */) || [""])[0];
    const words = line.trim().split(/ +/);
    const out = [];
    let cur = indent;
    for (let w of words) {
      const sep = cur.trim() ? " " : "";
      if (textWidth(cur + sep + w, size) <= maxWidth) { cur += sep + w; continue; }
      if (cur.trim()) out.push(cur);
      cur = indent;
      // Mot plus long qu'une ligne : coupé à la largeur disponible
      while (textWidth(cur + w, size) > maxWidth) {
        let n = w.length;
        while (n > 1 && textWidth(cur + w.slice(0, n), size) > maxWidth) n--;
        out.push(cur + w.slice(0, n));
        w = w.slice(n);
        cur = indent;
      }
      cur += w;
    }
    out.push(cur);
    return out;
  }

  /** Chaîne PDF littérale : ASCII imprimable, le reste en octal. */
  function pdfString(s) {
    let out = "(";
    for (const ch of s) {
      const c = cp(ch);
      if (c === null || c === 0x0A) { out += "?"; continue; }
      if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
      else if (c < 0x20 || c > 0x7E) out += "\\" + c.toString(8).padStart(3, "0");
      else out += ch;
    }
    return out + ")";
  }

  /**
   * @param text   texte du document
   * @param opts   { title, footer } : titre des propriétés du PDF, mention en pied de page
   * @returns { pdf: chaîne ASCII du fichier, pages: nombre de pages, lines: lignes mises en page }
   */
  function build(text, opts) {
    const o = opts || {};
    const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 56, TOP = 64, BOTTOM = 70, SIZE = 10.5, LEAD = 14.5;
    const maxWidth = PAGE_W - 2 * MARGIN;
    const lines = [];
    toWinAnsi(text).split("\n").forEach((l) => lines.push(...wrap(l, SIZE, maxWidth)));
    while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();
    const perPage = Math.floor((PAGE_H - TOP - BOTTOM) / LEAD);
    const pages = [];
    for (let i = 0; i < Math.max(lines.length, 1); i += perPage) pages.push(lines.slice(i, i + perPage));
    const footer = toWinAnsi(o.footer || "");

    const objs = []; // contenu des objets, numérotés à partir de 1
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesObj = add(null);
    const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const kids = [];
    pages.forEach((pl, pi) => {
      let c = "BT\n/F1 " + SIZE + " Tf\n" + LEAD + " TL\n" + MARGIN + " " + (PAGE_H - TOP).toFixed(2) + " Td\n";
      pl.forEach((l, li) => { c += (li ? "T* " : "") + pdfString(l) + " Tj\n"; });
      c += "ET\n";
      const foot = (footer ? footer + "   ·   " : "") + "Page " + (pi + 1) + " / " + pages.length;
      c += "BT\n0.45 g\n/F1 7.5 Tf\n" + MARGIN + " 34 Td\n" + pdfString(foot) + " Tj\nET\n";
      const stream = add("<< /Length " + c.length + " >>\nstream\n" + c + "endstream");
      kids.push(add("<< /Type /Page /Parent " + pagesObj + " 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] /Resources << /Font << /F1 " + font + " 0 R >> >> /Contents " + stream + " 0 R >>"));
    });
    objs[catalog - 1] = "<< /Type /Catalog /Pages " + pagesObj + " 0 R >>";
    objs[pagesObj - 1] = "<< /Type /Pages /Kids [" + kids.map((k) => k + " 0 R").join(" ") + "] /Count " + kids.length + " >>";
    const info = add("<< /Title " + pdfString(toWinAnsi(o.title || "Document")) + " /Producer (ATS Tester) >>");

    let pdf = "%PDF-1.4\n";
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(pdf.length); pdf += (i + 1) + " 0 obj\n" + body + "\nendobj\n"; });
    const xref = pdf.length;
    pdf += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("");
    pdf += "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalog + " 0 R /Info " + info + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    return { pdf, pages: pages.length, lines };
  }

  /** Blob PDF prêt à télécharger. */
  function textToPdf(text, opts) {
    return new Blob([build(text, opts).pdf], { type: "application/pdf" });
  }

  ATS.pdf = { build, textToPdf, toWinAnsi, wrap, textWidth };
})();
