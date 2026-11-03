// Fiche scannée : solutions de secours quand le navigateur n'arrive pas à dessiner ou à lire une page
const loadATS = require("./helpers/load");
const ATS = loadATS();
const { readScan, pdfJpegs } = ATS.extract;

const TEXT = "MISSIONS Contribue à la gestion des bases de données géolocalisées et réalise des études SIG.";
const ok = (text, extra) => async () => ({ text, confidence: 88, regions: 12, ...(extra || {}) });
const engine = () => { const e = new Error("La lecture automatique ne répond plus."); e.engine = true; return e; };

// Scénario : chaque étape est notée dans « log »
function scenario(over) {
  const log = [];
  const steps = {
    sizes: [2400, 1700, 1200],
    draw: async (s) => { log.push("draw " + s); return { s }; },
    layout: async (c) => { log.push("layout " + c.s); return { text: TEXT, confidence: 90, regions: 12 }; },
    plain: async (c) => { log.push("plain " + c.s); return { text: "", confidence: 0 }; },
    free: (c) => log.push("free " + c.s),
    raw: async () => { log.push("raw"); return { text: "", confidence: 0 }; },
    ...over(log),
  };
  return { log, run: () => readScan(steps) };
}

describe("Page scannée : lecture avec solutions de secours", () => {
  test("cas normal : page dessinée en grand, lue case par case, rien d'autre", async () => {
    const { log, run } = scenario(() => ({}));
    const r = await run();
    expect(r).toMatchObject({ text: TEXT, regions: 12, drawn: true });
    expect(log).toEqual(["draw 2400", "layout 2400", "free 2400"]);
  });
  test("mémoire saturée : page redessinée plus petite jusqu'à ce que le navigateur accepte", async () => {
    const { log, run } = scenario(() => ({ draw: async (s) => { log.push("draw " + s); return s > 1200 ? null : { s }; } }));
    const r = await run();
    expect(r.text).toBe(TEXT);
    expect(log).toEqual(["draw 2400", "draw 1700", "draw 1200", "layout 1200", "free 1200"]);
  });
  test("aucune toile possible : image d'origine lue directement par le moteur", async () => {
    const { log, run } = scenario(() => ({ draw: async () => null, raw: async () => { log.push("raw"); return { text: TEXT, confidence: 80 }; } }));
    const r = await run();
    expect(r).toMatchObject({ text: TEXT, confidence: 80, drawn: false });
    expect(log).toEqual(["raw"]);
  });
  test("page dessinée mais vide (image non affichée) : page entière, puis image d'origine", async () => {
    const { log, run } = scenario((l) => ({
      layout: async (c) => { l.push("layout " + c.s); return { text: "", confidence: 0, regions: 0 }; },
      raw: async () => { l.push("raw"); return { text: TEXT, confidence: 75 }; },
    }));
    const r = await run();
    expect(r).toMatchObject({ text: TEXT, drawn: true });
    expect(log).toEqual(["draw 2400", "layout 2400", "plain 2400", "free 2400", "raw"]);
  });
  test("mise en page non reconnue : la lecture d'un seul tenant est gardée si elle trouve plus de texte", async () => {
    const { log, run } = scenario((l) => ({
      layout: async (c) => { l.push("layout " + c.s); return { text: "SIG", confidence: 40, regions: 3 }; },
      plain: async (c) => { l.push("plain " + c.s); return { text: TEXT, confidence: 85 }; },
    }));
    expect((await run()).text).toBe(TEXT);
    expect(log).not.toContain("raw");
  });
  test("analyse trop lourde à cette taille (RangeError) : réessayée plus petit", async () => {
    const { log, run } = scenario((l) => ({
      layout: async (c) => { l.push("layout " + c.s); if (c.s === 2400) throw new RangeError("Array buffer allocation failed"); return { text: TEXT, confidence: 90 }; },
    }));
    expect((await run()).text).toBe(TEXT);
    expect(log).toEqual(["draw 2400", "layout 2400", "free 2400", "draw 1700", "layout 1700", "free 1700"]);
  });
  test("panne du moteur : arrêt immédiat, sans autre tentative, toile libérée", async () => {
    const { log, run } = scenario((l) => ({ layout: async (c) => { l.push("layout " + c.s); throw engine(); } }));
    await expect(run()).rejects.toMatchObject({ engine: true });
    expect(log).toEqual(["draw 2400", "layout 2400", "free 2400"]);
  });
  test("rien ne marche : texte vide, et on sait si la page a pu être dessinée", async () => {
    const { run } = scenario(() => ({ draw: async () => null, raw: async () => null }));
    expect(await run()).toEqual({ text: "", confidence: 0, regions: 0, drawn: false });
  });
});

// PDF minimal : objets image avec un flux binaire
function pdf(objects) {
  const parts = [Buffer.from("%PDF-1.7\n")];
  objects.forEach((o, i) => {
    parts.push(Buffer.from(`${i + 1} 0 obj\n<<\n/Type /XObject\n/Subtype /Image\n/Width ${o.w}\n/Height ${o.h}\n/Filter ${o.filter}\n/Length ${o.data.length}\n>>\nstream\r\n`));
    parts.push(o.data);
    parts.push(Buffer.from("\r\nendstream\nendobj\n"));
  });
  parts.push(Buffer.from("%%EOF\n"));
  return new Uint8Array(Buffer.concat(parts));
}
const jpeg = (n) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, n, n, 0x65, 0x6e, 0x64, 0xff, 0xd9]); // « end » au milieu : sans effet

describe("Images JPEG d'un PDF scanné, lues sans dessiner la page", () => {
  const page1 = jpeg(1), page2 = jpeg(2);
  const file = pdf([
    { w: 1646, h: 2331, filter: "/DCTDecode", data: page1 },
    { w: 120, h: 60, filter: "/DCTDecode", data: jpeg(9) }, // logo
    { w: 1646, h: 2331, filter: "[/FlateDecode /DCTDecode]", data: jpeg(8) }, // compressé deux fois : ignoré
    { w: 1646, h: 2331, filter: "/DCTDecode", data: page2 },
  ]);
  test("une grande image JPEG par page, dans l'ordre, octets exacts", () => {
    const found = pdfJpegs(file, 2);
    expect(found).toHaveLength(2);
    expect(Buffer.from(found[0]).subarray(0, 12)).toEqual(page1);
    expect(Buffer.from(found[1]).subarray(0, 12)).toEqual(page2);
  });
  test("nombre d'images différent du nombre de pages : rien (pas de page mal attribuée)", () => {
    expect(pdfJpegs(file, 3)).toEqual([]);
    expect(pdfJpegs(pdf([]), 1)).toEqual([]);
  });
});
