// Fichiers d'origine des candidatures : noms de téléchargement, tailles, encodage pour l'export
const loadATS = require("./helpers/load");
const ATS = loadATS();
const F = ATS.files;

describe("Nom de fichier téléchargé", () => {
  test.each([
    ["Alpha Géo - CV Hermès BARRY.pdf", "Alpha Géo - CV Hermès BARRY.pdf"],
    ['Beta/Carto: "CV" <final>?.docx', "Beta-Carto- -CV- -final-.docx"],
    ["  ..CV.pdf  ", "CV.pdf"],
    ["C:\\Users\\moi\\cv.pdf", "C-Users-moi-cv.pdf"],
    ["CV\u0000\u001F.pdf", "CV-.pdf"],
    ["", "document"],
    [null, "document"],
  ])("%p → %p", (raw, expected) => expect(F.safeName(raw)).toBe(expected));
  test("noms très longs coupés à 150 caractères", () => expect(F.safeName("a".repeat(400) + ".pdf")).toHaveLength(150));
  test("valeur de repli", () => expect(F.safeName("///", "lettre")).toBe("lettre"));
});

describe("Taille lisible", () => {
  test.each([[0, "0 o"], [512, "512 o"], [2048, "2 Ko"], [148480, "145 Ko"], [1572864, "1,5 Mo"], [undefined, ""], [-1, ""]])("%p → %p", (n, out) => expect(F.formatSize(n)).toBe(out));
});

describe("Encodage base64 (export / import des fichiers)", () => {
  test("aller-retour sans perte, y compris octets nuls et accents", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 37, 80, 68, 70, 0, ...Buffer.from("Hermès ✓", "utf8")]);
    const back = new Uint8Array(F.fromBase64(F.toBase64(bytes.buffer)));
    expect([...back]).toEqual([...bytes]);
  });
  test("gros fichier (2 Mo) découpé par blocs sans dépassement de pile", () => {
    const big = new Uint8Array(2 * 1024 * 1024).map((_, i) => i % 251);
    const back = new Uint8Array(F.fromBase64(F.toBase64(big.buffer)));
    expect(back.length).toBe(big.length);
    expect(back[123456]).toBe(big[123456]);
  });
  test("compatible avec l'encodage standard", () => {
    expect(F.toBase64(Buffer.from("CV.pdf"))).toBe(Buffer.from("CV.pdf").toString("base64"));
  });
});
