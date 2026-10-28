// Brique 4 : questions éliminatoires (DISQUALIFIED_AUTO) et lecture des exigences de l'offre
const loadATS = require("./helpers/load");
const { NOW, CV_OK, JD } = loadATS;
const ATS = loadATS();

const run = (jd, cvText, answers) => ATS.analyze({ jdText: jd, title: "Géomaticien SIG", cv: cvText ? { text: cvText } : null, answers, now: NOW });
const ko = (r, id) => r.knockouts.find((k) => k.id === id);

describe("Exigences repérées dans l'offre", () => {
  const offer = ATS.analyzeOffer(JD, "Géomaticien SIG", ATS.extractJobKeywords(JD, "Géomaticien SIG"));
  test("années d'expérience, impératives ou non", () => {
    expect(offer.experience.map(({ years, skills, knockout }) => ({ years, skills, knockout }))).toEqual([
      { years: 3, skills: ["SIG"], knockout: true },
      { years: 2, skills: ["Python"], knockout: false },
    ]);
  });
  test("diplôme, permis, langues, certifications, management", () => {
    expect(offer.degree).toMatchObject({ level: "Bac+5", rank: 5 });
    expect(offer.licence).toMatchObject({ knockout: true });
    expect(offer.languages[0]).toMatchObject({ lang: "Anglais", level: "courant", nice: true, knockout: false });
    expect(offer.certifications.map((c) => c.label)).toEqual(["Esri Technical Certification"]);
    expect(offer.management).toBe(true);
    expect(offer.title_norm.code).toBe("GIS_ANALYST");
  });
  test("nombres en lettres et fourchettes", () => {
    const o = ATS.analyzeOffer("Expérience de trois à cinq ans en cartographie exigée.", "", null);
    expect(o.experience[0]).toMatchObject({ years: 3, knockout: true });
    const en = ATS.analyzeOffer("At least 4+ years of experience with Python required.", "", null);
    expect(en.experience[0]).toMatchObject({ years: 4, skills: ["Python"], knockout: true });
  });
  test("« permis B souhaité » n'est pas éliminatoire", () => {
    expect(ATS.analyzeOffer("Permis B souhaité.", "", null).licence).toMatchObject({ knockout: false, nice: true });
  });
});

describe("Questions éliminatoires", () => {
  test("autorisation de travail toujours posée ; « Non » → DISQUALIFIED_AUTO", () => {
    const ok = run("Missions : QGIS.", CV_OK);
    expect(ko(ok, "work_auth").status).toBe("unknown");
    expect(ok.status).toBe("OK");
    const no = run("Missions : QGIS.", CV_OK, { work_auth: false });
    expect(no.status).toBe("DISQUALIFIED_AUTO");
    expect(ATS.verdictFor(no)).toMatchObject({ label: "Éliminée automatiquement", disqualified: true });
    expect(no.recommendations[0].text).toContain("DISQUALIFIED_AUTO");
  });
  test("permis B obligatoire : détecté dans le CV, sinon réponse du candidat", () => {
    expect(ko(run(JD, CV_OK), "licence")).toMatchObject({ status: "pass", auto: true });
    const without = CV_OK.replace("Permis B · ", "");
    expect(ko(run(JD, without), "licence").status).toBe("unknown");
    expect(run(JD, without, { licence: false }).status).toBe("DISQUALIFIED_AUTO");
    expect(run(JD, without, { licence: true }).status).toBe("OK");
  });
  test("diplôme exigé non atteint : élimination automatique (le candidat peut corriger)", () => {
    const cv = CV_OK.replace("Master 2 Géomatique – Université Rennes 2 – 2020\n", "");
    const r = run(JD, cv);
    expect(ko(r, "degree")).toMatchObject({ status: "fail", auto: false });
    expect(r.status).toBe("DISQUALIFIED_AUTO");
    expect(run(JD, cv, { degree: true }).status).toBe("OK");
  });
  test("expérience minimum : durée cumulée lue dans le CV", () => {
    const jd = "Expérience de 10 ans minimum en SIG exigée. QGIS.";
    expect(ko(run(jd, CV_OK), "exp_10_SIG")).toMatchObject({ status: "fail", auto: false });
    expect(ko(run("Expérience de 5 ans minimum en SIG.", CV_OK), "exp_5_SIG").status).toBe("pass");
  });
  test("titre de séjour mentionné dans le CV : réponse pré-remplie", () => {
    const r = run("QGIS.", CV_OK + "\nTitre de séjour valide (autorisation de travail)");
    expect(ko(r, "work_auth")).toMatchObject({ status: "pass", auto: true });
  });
  test("sans CV (lettre seule) : questions posées, rien d'éliminé d'office", () => {
    const r = ATS.analyze({ jdText: JD, title: "Géomaticien SIG", letter: { text: "Madame, Monsieur, je candidate. Cordialement." }, now: NOW });
    expect(r.status).toBe("OK");
    expect(r.knockouts.length).toBeGreaterThan(1);
  });
});
