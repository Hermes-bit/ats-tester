// Mail de candidature : ce que l'on trouve dans l'offre, ce que l'on dit du candidat, et le ton
const load = require("./helpers/load");
const ATS = load();
const { NOW, CV_OK, JD } = load;
const M = ATS.mail;

const JD_FULL = JD + "\nRéférence de l'offre : GEO-2026-045. Candidature à adresser à Mme Sophie MARTIN, recrutement@alphageo.fr (ne pas écrire à noreply@alphageo.fr).";
const analyze = (cv, jd) => ATS.analyze({ jdText: jd || JD_FULL, title: "Géomaticien SIG", company: "Alpha Géo", cv: cv ? { text: cv } : null, now: NOW });
const mail = (r, o) => M.build(r, { title: "Géomaticien SIG (H/F)", company: "Alpha Géo", jdText: JD_FULL, now: NOW, ...(o || {}) });

describe("Ce que dit l'annonce", () => {
  test("adresse du recrutement, jamais une adresse « noreply »", () => {
    expect(M.findRecipient("Écrire à noreply@x.fr ou à contact@x.fr, ou mieux à recrutement@x.fr.")).toBe("recrutement@x.fr");
    expect(M.findRecipient("Envoyez votre CV à jean.dupont@mairie.fr.")).toBe("jean.dupont@mairie.fr");
    expect(M.findRecipient("Postulez sur notre site.")).toBe("");
  });
  test("personne à qui écrire", () => {
    expect(M.findContact("Contact : Mme Sophie MARTIN, service RH").salutation).toBe("Madame Martin");
    expect(M.findContact("Candidature à envoyer à M. Jean-Luc Le Goff avant le 30 juin").salutation).toBe("Monsieur Le Goff");
    expect(M.findContact("Lettre à adresser à Monsieur le Maire, Hôtel de Ville")).toEqual({ salutation: "Monsieur le Maire", formal: true });
    expect(M.findContact("Notre directrice, Madame Bovary, a fondé l'entreprise en 1990.")).toBeNull();
  });
  test("référence de l'offre, pas les « références professionnelles »", () => {
    expect(M.findRef("Référence de l'offre : GEO-2026-045.")).toBe("GEO-2026-045");
    expect(M.findRef("Réf. 55401 – Technicien SIG")).toBe("55401");
    expect(M.findRef("Merci de joindre vos références professionnelles.")).toBe("");
  });
  test("intitulé propre, site de l'annonce", () => {
    expect(M.cleanTitle("Technicien SIG (H/F)")).toBe("Technicien SIG");
    expect(M.cleanTitle("CHARGÉ D'ÉTUDES SIG H/F")).toBe("Chargé d'études SIG");
    expect(M.boardOf("https://fr.indeed.com/viewjob?jk=1")).toBe("Indeed");
    expect(M.boardOf("https://www.emploi-territorial.fr/offre/o1")).toBe("Emploi Territorial");
    expect(M.boardOf("pas une adresse")).toBe("");
  });
  test("durées et téléphone écrits comme par une personne", () => {
    expect([6, 12, 15, 30, 45].map(M.duration)).toEqual(["six mois", "un an", "plus d'un an", "plus de deux ans", "près de quatre ans"]);
    expect(M.formatPhone("+33612345678")).toBe("06 12 34 56 78");
    expect(M.formatPhone("+32470123456")).toBe("+32470123456");
  });
});

describe("Le mail", () => {
  const r = analyze(CV_OK);
  test("rédigé à partir du vrai parcours et de l'offre", () => {
    const m = mail(r, { hasLetter: true });
    expect(m.to).toBe("recrutement@alphageo.fr");
    expect(m.subject).toBe("Candidature au poste de Géomaticien SIG (réf. GEO-2026-045)");
    expect(m.body.startsWith("Madame Martin,\n\n")).toBe(true);
    expect(m.body).toContain("le poste de géomaticien SIG (réf. GEO-2026-045)");
    expect(m.body).toContain("je suis géomaticien SIG chez Alpha Géo, après plus de deux ans comme chargé d'études SIG chez Beta Conseil");
    expect(m.body).toContain("Au quotidien, je travaille avec Python, QGIS et FME, que votre annonce met en avant.");
    expect(m.body).toContain("Vous trouverez ci-joint mon CV et ma lettre de motivation.");
    expect(m.body).toContain("Je suis disponible à partir de janvier 2027.");
    expect(m.body.endsWith("Bien cordialement,\n\nHermès BARRY\n06 12 34 56 78\nhermes.barry@example.com")).toBe(true);
  });
  test("des outils concrets, pas les domaines déjà dans l'intitulé (« SIG », « Géomatique »)", () => {
    const skills = mail(r).body.match(/travaille avec ([^,]+(?:, [^,]+)*), que/)[1];
    expect(skills).not.toMatch(/SIG|Géomatique|Cartographie/);
  });
  test("sans lettre de motivation : le mail dit aussi l'envie de rejoindre l'entreprise", () => {
    const m = mail(r, { hasLetter: false });
    expect(m.body).toContain("Vous trouverez ci-joint mon CV.");
    expect(m.body).toContain("rejoindre Alpha Géo et y mettre cette expérience à profit");
  });
  test("ton direct", () => {
    const m = mail(r, { tone: "direct", hasLetter: true });
    expect(m.body.startsWith("Bonjour Madame Martin,")).toBe(true);
    expect(m.body).toContain("m'appeler au 06 12 34 56 78");
    expect(m.body).toMatch(/\n\n(Bien à vous|Belle journée),\n\n/);
    expect(m.subject).toContain("candidature de Hermès BARRY");
  });
  test("« Autre formulation » : un autre texte, les mêmes faits", () => {
    const a = mail(r, { variant: 0 }), b = mail(r, { variant: 1 });
    expect(b.body).not.toBe(a.body);
    expect(b.body.split("\n\n")[1]).not.toBe(a.body.split("\n\n")[1]); // l'introduction change toujours
    for (const m of [a, b]) expect(m.body).toContain("Beta Conseil");
  });
  test("toutes les versions : formulations neutres, rien de vide ni d'inventé, longueur d'un mail", () => {
    const junior = analyze("Léa DURAND\nlea.durand@example.com · 07 11 22 33 44\n\nFORMATION\nMaster Géomatique – Université Rennes 2 – 2026\n\nEXPÉRIENCES PROFESSIONNELLES\nStage SIG - IGN\nMars 2026 – Août 2026\n• QGIS et PostGIS\n\nCOMPÉTENCES\nQGIS, PostGIS, Python");
    const letterOnly = ATS.analyze({ jdText: JD, title: "Géomaticien SIG", letter: { text: "Madame, Monsieur, j'utilise QGIS et Python. Cordialement." }, now: NOW });
    for (const res of [r, junior, letterOnly]) for (const tone of ["classic", "direct"]) for (const hasLetter of [true, false]) for (let variant = 0; variant < 6; variant++) {
      const m = mail(res, { tone, hasLetter, variant, jdText: res === letterOnly ? JD : JD_FULL });
      const all = m.subject + "\n" + m.body;
      expect(all).not.toMatch(/undefined|null|NaN|\[|\]| {2}| [,.]|chez [,.]|\.\./);
      expect(all).not.toMatch(/\b(ravie?|motivée?|heureux|heureuse|intéressée?|diplômée?|prête?|amenée?|convaincue?|passionnée?)\b/i);
      expect(all).not.toMatch(/N'hésitez pas|Je me permets|dynamique/i); // tournures toutes faites
      expect(m.words).toBeGreaterThan(40);
      expect(m.words).toBeLessThan(200);
    }
  });
  test("jeune diplômé : diplôme récent et stage, sans « au quotidien »", () => {
    const m = mail(analyze("Léa DURAND\nlea.durand@example.com · Disponible immédiatement\n\nFORMATION\nMaster Géomatique – Université Rennes 2 – 2026\n\nEXPÉRIENCES PROFESSIONNELLES\nStage SIG - IGN\nMars 2026 – Août 2026\n• QGIS et PostGIS\n\nCOMPÉTENCES\nQGIS, PostGIS, Python"), { hasLetter: false });
    expect(m.body).toContain("Je viens d'obtenir mon Master Géomatique (Université Rennes 2).");
    expect(m.body).toContain("J'ai effectué un stage SIG de six mois chez IGN.");
    expect(m.body).toContain("J'ai déjà travaillé avec");
    expect(m.body).not.toContain("Au quotidien");
    expect(m.body).toContain("Je suis disponible immédiatement.");
  });
  test("avertissements : pas d'adresse dans l'offre, pré-requis bloquant, nom introuvable", () => {
    const res = ATS.analyze({ jdText: JD, title: "Géomaticien SIG", letter: { text: "Madame, Monsieur, je candidate. Cordialement." }, now: NOW });
    const m = M.build(res, { title: "Géomaticien SIG", jdText: JD, now: NOW, fallbackName: "Hermès" });
    const notes = m.notes.map((n) => n.text).join(" | ");
    expect(m.to).toBe("");
    expect(notes).toMatch(/Aucune adresse e-mail/);
    expect(notes).toMatch(/nom n'a pas été trouvé/);
    expect(m.body.startsWith("Madame, Monsieur,")).toBe(true);
    expect(m.body.endsWith("Hermès")).toBe(true);
    const blocked = M.build({ ...r, status: "DISQUALIFIED_AUTO" }, { jdText: JD, now: NOW });
    expect(blocked.notes.some((n) => n.level === "warn" && /pré-requis bloquant/.test(n.text))).toBe(true);
  });
});
