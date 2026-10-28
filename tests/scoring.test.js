// Brique 3 : score de pertinence (récence, durée cumulée, 3 piliers 50 / 30 / 20)
const loadATS = require("./helpers/load");
const { NOW, CV_OK, JD } = loadATS;
const ATS = loadATS();

const analyze = (jd, cvText, extra) => ATS.analyze({ jdText: jd, title: "Géomaticien SIG", company: "Alpha Géo", cv: cvText === null ? null : { text: cvText, meta: { type: "texte" } }, now: NOW, ...(extra || {}) });

describe("Coefficient de récence", () => {
  test.each([[2026, 1.5], [2025, 1.375], [2024, 1.25], [2022, 1], [2021, 0.5], [2010, 0.5], [null, 1], [2027, 1.5]])("%p → %p", (year, coef) => {
    expect(ATS.profile.recencyCoef(year, NOW)).toBe(coef);
  });
});

describe("Score en 3 piliers", () => {
  const r = analyze(JD, CV_OK);
  const P = r.cv.pillars;

  test("poids : 50 % compétences, 30 % contexte, 20 % atouts", () => {
    expect([P.hard.weight, P.context.weight, P.nice.weight]).toEqual([0.5, 0.3, 0.2]);
    const expected = Math.round((P.hard.score * 0.5 + P.context.score * 0.3 + P.nice.score * 0.2) * 100);
    expect(r.cv.score).toBe(expected);
  });

  test("une compétence de l'année en cours vaut 1,5 ; une compétence de plus de 4 ans 0,5", () => {
    const by = Object.fromEntries(P.hard.items.map((i) => [i.label, i]));
    expect(by.QGIS).toMatchObject({ recence_annee: 2026, coef: 1.5, credit: 1.5 });
    expect(by["ArcGIS Pro"]).toMatchObject({ recence_annee: 2022, coef: 1 });
    const old = analyze("Missions : MapInfo et QGIS.", "EXPÉRIENCES\nCartographe – Gamma\nJanvier 2015 – Décembre 2018\nCartographie QGIS\nCOMPÉTENCES\nQGIS");
    expect(old.cv.pillars.hard.items.find((i) => i.label === "QGIS")).toMatchObject({ recence_annee: 2018, coef: 0.5, credit: 0.5 });
  });

  test("durée cumulée : « 2 ans d'expérience en Python » vérifiée sur la somme des expériences", () => {
    const py = P.hard.items.find((i) => i.label === "Python");
    expect(py).toMatchObject({ required_years: 2, months: 52, durFactor: 1 });
    const short = analyze("Vous avez 3 ans d'expérience en Python. Python, SQL.", "EXPÉRIENCES\nDéveloppeur – A\nJanvier 2025 – Décembre 2025\nPython\nAnalyste – B\nJanvier 2023 – Juin 2023\nPython, SQL");
    const p2 = short.cv.pillars.hard.items.find((i) => i.label === "Python");
    expect(p2.months).toBe(18);
    expect(p2.durFactor).toBeCloseTo(18 / 36, 3);
    expect(p2.credit).toBeCloseTo(p2.coef * 0.5, 3);
    expect(short.recommendations.some((x) => /3 ans d'expérience en Python/.test(x.text))).toBe(true);
    // Plancher : une compétence présente garde au moins 40 % de ses points
    const tiny = analyze("Vous avez 10 ans d'expérience en Python.", "EXPÉRIENCES\nDéveloppeur – A\nJanvier 2026 – Juin 2026\nPython");
    expect(tiny.cv.pillars.hard.items.find((i) => i.label === "Python").durFactor).toBe(0.4);
  });

  test("contexte : intitulé normalisé, management, savoir-être", () => {
    const ids = P.context.parts.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["title", "management", "soft"]));
    expect(P.context.title).toMatchObject({ offer_code: "GIS_ANALYST", score: 1 });
    expect(P.context.parts.find((p) => p.id === "management").score).toBe(0);
  });

  test("même métier normalisé sans l'intitulé exact : crédit partiel", () => {
    const r2 = ATS.analyze({ jdText: "Géomaticien (H/F). QGIS.", title: "Géomaticien", cv: { text: "EXPÉRIENCES\nChargé d'études SIG – A\n2020 – 2024\nQGIS" }, now: NOW });
    expect(r2.cv.pillars.context.title).toMatchObject({ score: 0.85, offer_code: "GIS_ANALYST" });
  });

  test("atouts : compétences « un plus », certifications, langues, diplôme", () => {
    expect(P.nice.bonus.map((b) => b.label)).toContain("ArcGIS Enterprise");
    expect(P.nice.certs).toEqual(expect.arrayContaining([{ label: "Esri Technical Certification", found: false }]));
    expect(P.nice.degree).toEqual({ required: "Bac+5", found: "Bac+5", score: 1 });
  });

  test("pilier sans critère dans l'offre : non applicable, poids réparti", () => {
    const r3 = analyze("Missions : QGIS, PostGIS et Python.", CV_OK);
    expect(r3.cv.pillars.nice.score).toBeNull();
    expect(r3.cv.pillars.hard.effective).toBeCloseTo(0.5 / 0.8, 5);
    expect(r3.cv.pillars.context.effective).toBeCloseTo(0.3 / 0.8, 5);
  });

  test("CV illisible : score plafonné à 10", () => {
    expect(analyze(JD, "QGIS").cv.score).toBeLessThanOrEqual(10);
  });

  test("résultats sérialisables (enregistrement, synchronisation)", () => {
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
    expect(JSON.stringify(r)).not.toContain('"re":');
  });
});

describe("Prompt pour l'IA", () => {
  test("reprend les piliers et ne laisse pas fuiter les coordonnées masquées", () => {
    const r = analyze(JD, CV_OK.replace("06 12 34 56 78", ""));
    const prompt = ATS.buildPrompt(r, { title: "Géomaticien SIG", company: "Alpha Géo", jdText: JD, cvText: CV_OK, maskContacts: true });
    expect(prompt).toContain("3 piliers");
    expect(prompt).not.toContain("hermes.barry@example.com");
  });
});
