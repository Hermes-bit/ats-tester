// PDF reconstitué à partir du texte (quand le fichier d'origine n'a pas été gardé)
const loadATS = require("./helpers/load");
const ATS = loadATS();
const P = ATS.pdf;

// Vérifie la table des références croisées : chaque décalage pointe sur « n 0 obj »
function checkXref(pdf) {
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)[1]);
  expect(pdf.slice(start, start + 4)).toBe("xref");
  const [, count] = /^xref\n0 (\d+)\n/.exec(pdf.slice(start));
  const entries = pdf.slice(start).split("\n").slice(3, 3 + Number(count) - 1);
  entries.forEach((e, i) => expect(pdf.slice(Number(e.slice(0, 10)), Number(e.slice(0, 10)) + 12)).toMatch(new RegExp("^" + (i + 1) + " 0 obj")));
  return Number(count) - 1;
}

describe("Structure du fichier", () => {
  test("PDF 1.4 complet, entièrement ASCII, références croisées exactes", () => {
    const { pdf, pages } = P.build("Hermès BARRY\nGéomaticien SIG", { title: "CV - Alpha Géo", footer: "Reconstitué" });
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(pdf)).toBe(true);
    expect(pages).toBe(1);
    expect(checkXref(pdf)).toBeGreaterThanOrEqual(6);
  });
  test("longueur déclarée de chaque flux = longueur réelle", () => {
    const { pdf } = P.build("Ligne 1\nLigne 2 (avec parenthèses) et \\ barre", {});
    const re = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g;
    let m, n = 0;
    while ((m = re.exec(pdf))) { expect(m[2].length).toBe(Number(m[1])); n++; }
    expect(n).toBe(1);
  });
  test("métadonnées : titre et producteur", () => {
    const { pdf } = P.build("x", { title: "Lettre – Gamma" });
    expect(pdf).toContain("/Title (Lettre \\226 Gamma)");
    expect(pdf).toContain("/Producer (ATS Tester)");
  });
});

describe("Caractères", () => {
  test("accents et ponctuation française en Windows-1252", () => {
    const { pdf } = P.build("é è à ç ô œ € ’ « » • –", {});
    ["\\351", "\\350", "\\340", "\\347", "\\364", "\\234", "\\200", "\\222", "\\253", "\\273", "\\225", "\\226"].forEach((c) => expect(pdf).toContain(c));
  });
  test("parenthèses et barres obliques inverses échappées", () => {
    const { pdf } = P.build("f(x) = a\\b", {});
    expect(pdf).toContain("(f\\(x\\) = a\\\\b) Tj");
  });
  test("ligatures, flèches, puces exotiques et emojis remplacés", () => {
    expect(P.toWinAnsi("Shapeﬁle → QGIS ✓ ▪ 🚀 ²")).toBe("Shapefile -> QGIS + • ? ²");
  });
  test("tabulations et fins de ligne Windows", () => {
    expect(P.toWinAnsi("a\tb\r\nc")).toBe("a    b\nc");
  });
});

describe("Mise en page", () => {
  const MAX = 595.28 - 2 * 56;
  test("lignes coupées à la largeur de la page", () => {
    const long = "Administration des bases PostGIS, automatisation des traitements avec Python et FME, production cartographique sous QGIS et ArcGIS Pro pour les collectivités. ".repeat(3);
    const { lines } = P.build(long, {});
    expect(lines.length).toBeGreaterThan(3);
    lines.forEach((l) => expect(P.textWidth(l, 10.5)).toBeLessThanOrEqual(MAX + 0.01));
    expect(lines.join(" ").replace(/\s+/g, " ").trim()).toBe(long.replace(/\s+/g, " ").trim());
  });
  test("mot plus long qu'une ligne découpé sans perte", () => {
    const w = "x".repeat(400);
    const { lines } = P.build(w, {});
    expect(lines.join("")).toBe(w);
    lines.forEach((l) => expect(P.textWidth(l, 10.5)).toBeLessThanOrEqual(MAX + 0.01));
  });
  test("lignes vides et retraits conservés", () => {
    const { lines } = P.build("Titre\n\n  • puce", {});
    expect(lines).toEqual(["Titre", "", "  • puce"]);
  });
  test("pagination : 48 lignes par page, numéro de page en pied", () => {
    const text = Array.from({ length: 200 }, (_, i) => "Ligne " + (i + 1)).join("\n");
    const { pdf, pages } = P.build(text, { footer: "Reconstitué" });
    expect(pages).toBe(5);
    expect(pdf).toContain("/Count 5");
    expect(pdf).toContain("(Reconstitu\\351   \\267   Page 5 / 5) Tj");
    checkXref(pdf);
  });
  test("texte vide : une page blanche valide", () => {
    const { pdf, pages } = P.build("", {});
    expect(pages).toBe(1);
    checkXref(pdf);
  });
});
