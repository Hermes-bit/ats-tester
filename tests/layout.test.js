// Mise en page des fiches de poste : traits, cases, bandeaux, cases à cocher, ordre de lecture
const loadATS = require("./helpers/load");
const ATS = loadATS();
const L = ATS.layout;

/* ---------- Page synthétique : un tableau comme la fiche de Cannes ---------- */
// 1200 × 1700 px, fond blanc ; traits gris foncé de 3 px ; bandeau bleu granuleux collé aux traits
function makePage() {
  const w = 1200, h = 1700, g = new Uint8Array(w * h).fill(250);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rect = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = typeof v === "function" ? v() : v; };
  const hline = (y, x0, x1) => rect(x0, y, x1, y + 3, 60);
  const vline = (x, y0, y1) => rect(x, y0, x + 3, y1, 60);
  // « Lettres » : petits blocs sombres séparés par des blancs, sur une ligne de texte
  const word = (x, y, n) => { for (let k = 0; k < n; k++) rect(x + k * 14, y, x + k * 14 + 9, y + 18, 30); };
  const T = 200, B = 1300, X0 = 100, XM = 600, X1 = 1100;
  hline(T, X0, X1); hline(B, X0, X1); vline(X0, T, B + 3); vline(X1, T, B + 3);
  // Bandeau de titre (gris-bleu 140 ± 40 de grain) collé au trait du haut, sur les deux colonnes
  rect(X0 + 3, T + 3, X1, T + 60, () => 140 + Math.round((rnd() - 0.5) * 80));
  word(X0 + 150, T + 20, 8); word(XM + 120, T + 20, 10); // « MISSIONS » et « CONDITIONS… » dans le bandeau
  hline(T + 60, X0, X1);
  vline(XM, T + 60, 900); // trait du milieu sous le bandeau
  // Contenu : lignes de texte, dont la première touche le trait sous le bandeau
  for (let r = 0; r < 8; r++) { word(X0 + 20, T + 63 + r * 40, 18); word(XM + 20, T + 70 + r * 40, 16); }
  hline(900, X0, X1);
  // Ligne avec une case à cocher (carré creux) et une croix dedans
  word(X0 + 20, 930, 6);
  rect(400, 920, 440, 923, 40); rect(400, 957, 440, 960, 40); rect(400, 920, 403, 960, 40); rect(437, 920, 440, 960, 40);
  for (let k = 0; k < 24; k++) { rect(410 + k, 928 + k, 413 + k, 931 + k, 40); rect(433 - k, 928 + k, 436 - k, 931 + k, 40); }
  hline(990, X0, X1);
  // Deux lignes « libellé | valeur »
  vline(400, 990, B);
  word(X0 + 20, 1020, 7); word(420, 1020, 20); hline(1080, X0, X1);
  word(X0 + 20, 1110, 7); word(420, 1110, 12);
  // Titre et pied de page hors du tableau
  word(500, 120, 10); word(900, 1550, 8);
  return { g, w, h };
}

describe("Détection des traits et des cases", () => {
  const { g, w, h } = makePage();
  const page = L.analyzePage(g, w, h);
  const find = (x, y) => page.regions.find((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && r.area < 0.25);

  test("un tableau est reconnu", () => expect(page.tableLike).toBe(true));
  test("le bandeau granuleux est une case à part, sans faux traits verticaux", () => {
    const bar = find(700, 230);
    expect(bar).toBeDefined();
    expect(find(300, 230)).toBe(bar);
    expect(bar.x1 - bar.x0).toBeGreaterThan(900); // tout le bandeau, d'un seul tenant
    expect(bar.y1 - bar.y0).toBeLessThan(120); // le trait du bas tient, malgré les lettres collées dessous
  });
  test("les deux colonnes sous le bandeau sont deux cases distinctes, malgré les lettres qui touchent les traits", () => {
    const left = find(300, 500), right = find(800, 500);
    expect(left).toBeDefined(); expect(right).toBeDefined();
    expect(left.id).not.toBe(right.id);
    expect(left.y0).toBeGreaterThanOrEqual(240); // le contenu ne fuit pas dans le bandeau
  });
  test("la case à cocher ne devient pas une case du tableau", () => {
    const row = find(200, 940);
    expect(row).toBeDefined();
    expect(row.x1 - row.x0).toBeGreaterThan(900); // la ligne entière, case à cocher comprise
  });
  test("tableau libellé / valeur : quatre cases", () => {
    const ids = [find(200, 1040), find(800, 1040), find(200, 1130), find(800, 1130)].map((r) => r && r.id);
    expect(new Set(ids).size).toBe(4);
  });
  test("préparation : la case à cocher est effacée, la croix reste ; le grain du bandeau n'est pas de l'encre", () => {
    const row = find(200, 940);
    const [piece] = L.prepareRegion(g, w, h, page, row, false);
    const at = (x, y) => piece.bin[(y - piece.y0) * piece.w + (x - piece.x0)];
    expect(at(401, 940)).toBe(1); // bord du carré effacé
    expect(at(421, 940)).toBe(0); // croix gardée
    const bar = find(700, 230);
    const pieces = L.prepareRegion(g, w, h, page, bar, false);
    const ink = pieces.reduce((a, p) => a + p.bin.reduce((s, v) => s + (v ? 0 : 1), 0), 0);
    expect(ink).toBeGreaterThan(18 * 9 * 18 * 0.9); // les 18 « lettres » du bandeau
    expect(ink).toBeLessThan(18 * 9 * 18 * 1.6); // et presque rien d'autre
  });
});

describe("Cases à cocher", () => {
  test("carré creux effacé, lettre O gardée", () => {
    const w = 200, h = 100, bin = new Uint8Array(w * h).fill(1);
    const set = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bin[y * w + x] = 0; };
    set(20, 20, 60, 23); set(20, 57, 60, 60); set(20, 20, 23, 60); set(57, 20, 60, 60); // carré
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 130, y - 40); if (d >= 14 && d <= 20) bin[y * w + x] = 0; } // « O »
    L.removeBoxes(bin, w, h, 2400);
    expect(bin[21 * w + 40]).toBe(1);
    expect(bin[40 * w + 112]).toBe(0);
  });
  test("lettre C gardée : ouverte d'un côté, ce n'est pas une case", () => {
    // « C » carré de 24 × 29 px au trait fin, comme dans un scan : encre collée au cadre, mais ouvert à droite
    const w = 100, h = 100, bin = new Uint8Array(w * h).fill(1);
    const set = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bin[y * w + x] = 0; };
    set(40, 30, 64, 32); set(40, 57, 64, 59); set(40, 30, 42, 59); set(62, 30, 64, 39); set(62, 50, 64, 59);
    L.removeBoxes(bin, w, h, 2400);
    expect(bin[45 * w + 40]).toBe(0);
  });
});

describe("Ordre de lecture", () => {
  const blk = (text, x0, y0, x1, y1, words) => ({ text, lines: text.split("\n").length, x0, y0, x1, y1, words });
  test("sections en colonnes : titre puis contenu, colonne par colonne", () => {
    const out = L.assemble([
      blk("MISSIONS", 0, 0, 490, 40), blk("CONDITIONS", 500, 0, 1000, 40),
      blk("Gérer PostGIS\nProduire des cartes", 0, 50, 490, 300), blk("Travail en bureau\nDéplacements", 500, 50, 1000, 300),
    ]);
    expect(out).toBe("MISSIONS\nGérer PostGIS\nProduire des cartes\n\nCONDITIONS\nTravail en bureau\nDéplacements");
  });
  test("titre d'un seul tenant sur deux colonnes : redécoupé grâce à la position des mots", () => {
    const words = [{ text: "MISSIONS", x0: 150, x1: 300 }, { text: "CONDITIONS", x0: 620, x1: 800 }, { text: "GÉNÉRALES", x0: 810, x1: 950 }];
    const out = L.assemble([
      blk("MISSIONS CONDITIONS GÉNÉRALES", 0, 0, 1000, 40, words),
      blk("Gérer PostGIS\nProduire des cartes", 0, 50, 490, 300), blk("Travail en bureau\nDéplacements", 500, 50, 1000, 300),
    ]);
    expect(out).toBe("MISSIONS\nGérer PostGIS\nProduire des cartes\n\nCONDITIONS GÉNÉRALES\nTravail en bureau\nDéplacements");
  });
  test("libellé / valeur : « Diplômes : Bac + 3… »", () => {
    const out = L.assemble([blk("Diplômes", 0, 0, 300, 40), blk("Bac + 3 en SIG.", 310, 0, 1000, 40), blk("Concours", 0, 50, 300, 90), blk("Filière technique.", 310, 50, 1000, 90)]);
    expect(out).toBe("Diplômes : Bac + 3 en SIG.\nConcours : Filière technique.");
  });
  test("tableau de données à 3 colonnes : ligne par ligne", () => {
    const out = L.assemble([
      blk("Compétence", 0, 0, 300, 40), blk("Niveau", 310, 0, 600, 40), blk("Requis", 610, 0, 900, 40),
      blk("QGIS", 0, 50, 300, 90), blk("Expert", 310, 50, 600, 90), blk("Oui", 610, 50, 900, 90),
    ]);
    expect(out).toBe("Compétence – Niveau – Requis\nQGIS – Expert – Oui");
  });
  test("case sur deux lignes à gauche (logo) et deux cases empilées à droite : gauche puis droite de haut en bas", () => {
    const out = L.assemble([blk("CANNES\nPAYS DE LÉRINS", 0, 0, 300, 200), blk("DGA RESSOURCES", 312, 0, 1000, 60), blk("SERVICE COMMUN SIG", 305, 70, 1000, 200)]);
    expect(out).toBe("CANNES\nPAYS DE LÉRINS\nDGA RESSOURCES\nSERVICE COMMUN SIG");
  });
  test("grille d'un document Word / OpenDocument / HTML (cellules fusionnées comprises)", () => {
    const out = L.assembleGrid([
      [{ text: "FORMATION ET EXPÉRIENCES", span: 2 }],
      [{ text: "Diplômes" }, { text: "Bac + 3" }],
      [{ text: "MISSIONS" }, { text: "CONDITIONS" }],
      [{ text: "Gérer PostGIS\nProduire des cartes" }, { text: "Travail en bureau\nDéplacements" }],
    ]);
    expect(out).toBe("FORMATION ET EXPÉRIENCES\n\nDiplômes : Bac + 3\n\nMISSIONS\nGérer PostGIS\nProduire des cartes\n\nCONDITIONS\nTravail en bureau\nDéplacements");
  });
});

describe("Mots reconnus et image pour l'OCR", () => {
  test("puce lue « s » ou « « » avec une confiance faible : redevient une puce", () => {
    const wd = (text, confidence, x0, x1, y0, y1) => ({ text, confidence, bbox: { x0, x1, y0, y1 } });
    const [a, b] = L.cleanLines([
      { text: "s Sens du contact", confidence: 86, words: [wd("s", 22, 89, 102, 4764, 4777), wd("Sens", 95, 158, 244, 4754, 4783), wd("du", 96, 257, 298, 4754, 4783), wd("contact", 95, 314, 441, 4755, 4783)] },
      { text: "« Mener des projets", confidence: 83, words: [wd("«", 20, 19, 32, 3067, 3080), wd("Mener", 69, 92, 202, 3056, 3086), wd("des", 96, 217, 276, 3056, 3086), wd("projets", 96, 292, 407, 3056, 3093)] },
    ]);
    expect(a.text).toBe("• Sens du contact");
    expect(b.text).toBe("• Mener des projets");
  });
  test("ligne alignée sur le texte d'une puce : c'est sa suite, même avec une majuscule", () => {
    const ln = (text, x0, y0, x1) => ({ text, bbox: { x0, y0, x1, y1: y0 + 30 }, paragraph: 0, words: text.split(" ").map((t, k) => ({ text: t, bbox: { x0: x0 + (k ? 74 + (k - 1) * 60 : 0), x1: x0 + (k ? 74 + (k - 1) * 60 + 50 : 14), y0, y1: y0 + 30 } })) });
    const out = L.linesText([
      ln("• Echanger pendant la vie du projet", 18, 0, 800),
      ln("SIG", 92, 38, 160),
      ln("• Collecter les données", 18, 92, 600),
      ln("Savoirs :", 18, 150, 200),
      ln("Bases de données", 18, 188, 400),
    ], false);
    expect(out).toBe("• Echanger pendant la vie du projet SIG\n• Collecter les données\nSavoirs :\nBases de données");
  });
  test("vraie lettre en début de ligne (« a pourvoir ») : gardée telle quelle", () => {
    const wd = (text, confidence, x0, x1, y0, y1) => ({ text, confidence, bbox: { x0, x1, y0, y1 } });
    const [l] = L.cleanLines([{ text: "a pourvoir", confidence: 90, words: [wd("a", 90, 90, 108, 3064, 3086), wd("pourvoir", 95, 122, 260, 3056, 3093), wd("vite", 95, 274, 340, 3056, 3086)] }]);
    expect(l.text).toBe("a pourvoir vite");
  });
  test("restes de bordures et mots illisibles retirés", () => {
    const lines = L.cleanLines([
      { text: "Catégorie : A | B", confidence: 80, words: [{ text: "Catégorie", confidence: 92 }, { text: ":", confidence: 88 }, { text: "A", confidence: 90 }, { text: "|", confidence: 60 }, { text: "B", confidence: 91 }] },
      { text: "; | E", confidence: 20, words: [{ text: ";", confidence: 30 }, { text: "|", confidence: 20 }, { text: "E", confidence: 15 }] },
      { text: "[Logiciels", confidence: 70, words: [{ text: "[Logiciels", confidence: 70 }] },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Catégorie : A B", "Logiciels"]);
  });
  test("image PBM : en-tête et pixels noirs au bon endroit", () => {
    const p = { w: 10, h: 2, bin: new Uint8Array(20).fill(1) };
    p.bin[0] = 0; p.bin[9] = 0; p.bin[10 + 8] = 0;
    const pbm = L.toPBM(10, 4, [{ p, y: 1 }]);
    const head = "P4\n10 4\n";
    expect(String.fromCharCode(...pbm.slice(0, head.length))).toBe(head);
    const row = (y) => [...pbm.slice(head.length + y * 2, head.length + y * 2 + 2)];
    expect(row(0)).toEqual([0, 0]);
    expect(row(1)).toEqual([0x80, 0x40]); // pixels 0 et 9
    expect(row(2)).toEqual([0x00, 0x80]); // pixel 8
  });
  test("puces lues « e », « s », « + » devant une majuscule : uniformisées, et ne recollent plus les lignes", () => {
    expect(ATS.ocr.tidy("de documents cartographiques\ne Réalise des études\ns Importer des données\n+ Maîtriser QGIS"))
      .toBe("de documents cartographiques\n• Réalise des études\n• Importer des données\n• Maîtriser QGIS");
    expect(ATS.ocr.tidy("Contribue à la gestion des bases de\ndonnées géolocalisées")).toBe("Contribue à la gestion des bases de données géolocalisées");
  });
});
