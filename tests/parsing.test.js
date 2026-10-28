// Brique 2 : lecture du CV et normalisation (téléphone E.164, e-mail, intitulés, diplômes, dates, repli « non découpé »)
const loadATS = require("./helpers/load");
const { NOW, CV_OK } = loadATS;
const ATS = loadATS();
const P = ATS.profile;

describe("Téléphone au format E.164", () => {
  test.each([
    ["06 12 34 56 78", "+33612345678"],
    ["06.12.34.56.78", "+33612345678"],
    ["06-12-34-56-78", "+33612345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["+33 (0)6 12 34 56 78", "+33612345678"],
    ["0033 6 12 34 56 78", "+33612345678"],
    ["+330612345678", "+33612345678"],
    ["01 23 45 67 89", "+33123456789"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+1 (415) 555-2671", "+14155552671"],
  ])("%s → %s", (raw, e164) => expect(P.toE164(raw)).toBe(e164));

  test.each(["06 12 34", "+33 6 12 34 56 7", "00 00 00 00 00", "abc", "", null, undefined, "+0 123 456 789"])("refuse %p", (raw) => {
    expect(P.toE164(raw)).toBeNull();
  });

  test("extrait le premier numéro valide d'un texte", () => {
    const found = P.extractPhones("Tél. : 06 12 34 56 78 / bureau +33 2 99 00 00 00");
    expect(found.map((p) => p.e164)).toEqual(["+33612345678", "+33299000000"]);
  });

  test("n'invente pas de numéro à partir de plages de dates", () => {
    expect(P.extractPhones("2019-2020 · 2021 – 2024").filter((p) => p.e164)).toEqual([]);
  });
});

describe("Validation des e-mails", () => {
  test.each(["prenom.nom@example.com", "a+tag@sous.domaine.fr", "x_y-z@ex-ample.io", "O'Neil@example.ie"])("accepte %s", (e) => expect(P.isValidEmail(e)).toBe(true));
  test.each(["jean@@x.fr", "jean@x", "jean.@x.fr", ".jean@x.fr", "je..an@x.fr", "jean@-x.fr", "jean@x.f", "sans-arobase.fr", "a".repeat(65) + "@x.fr", 42, null])("refuse %p", (e) => expect(P.isValidEmail(e)).toBe(false));
  test("extraction : valides en minuscules, invalides à part", () => {
    const r = P.extractEmails("Contact : Prenom.Nom@Example.COM. Ancien : prenom..nom@example.com");
    expect(r.valid).toEqual(["prenom.nom@example.com"]);
    expect(r.invalid).toEqual(["prenom..nom@example.com"]);
  });
});

describe("Normalisation des intitulés de poste", () => {
  test.each(["VP Sales", "Directeur Commercial", "Head of Sales", "directrice commerciale France", "DIRECTEUR DES VENTES", "Sales Director EMEA"])("%s → SALES_DIRECTOR", (t) => {
    expect(P.normalizeJobTitle(t).code).toBe("SALES_DIRECTOR");
  });
  test.each([
    ["Géomaticien", "GIS_ANALYST"], ["Chargée d'études SIG", "GIS_ANALYST"], ["Stage SIG", "GIS_ANALYST"],
    ["Ingénieur SIG senior", "GIS_ENGINEER"], ["Chef de projet SIG", "GIS_PROJECT_MANAGER"], ["Chef de projet", "PROJECT_MANAGER"],
    ["Développeur full stack", "SOFTWARE_DEVELOPER"], ["Data Engineer", "DATA_ENGINEER"], ["Géomètre-topographe", "SURVEYOR"],
  ])("%s → %s", (t, code) => expect(P.normalizeJobTitle(t).code).toBe(code));
  test("la variante la plus précise l'emporte et le niveau est repéré", () => {
    const r = P.normalizeJobTitle("Ingénieur SIG senior");
    expect(r).toMatchObject({ code: "GIS_ENGINEER", family: "GIS", seniority: "SENIOR" });
    expect(P.normalizeJobTitle("Stagiaire géomaticien").seniority).toBe("INTERN");
  });
  test("intitulé inconnu : code null, sans erreur", () => {
    expect(P.normalizeJobTitle("Astronaute lunaire").code).toBeNull();
    expect(P.normalizeJobTitle("").code).toBeNull();
    expect(P.normalizeJobTitle(null).code).toBeNull();
  });
});

describe("Niveau de diplôme normalisé", () => {
  test.each([
    ["Master 2 Géomatique", "Bac+5"], ["MSc GIS", "Bac+5"], ["Diplôme d'ingénieur ENSG", "Bac+5"], ["M1 SIG", "Bac+4"],
    ["BUT Informatique", "Bac+3"], ["Licence pro SIG", "Bac+3"], ["BTS Géomètre", "Bac+2"], ["DUT Informatique", "Bac+2"],
    ["Doctorat en géographie", "Bac+8"], ["Baccalauréat S", "Bac"], ["Bac + 5 en urbanisme", "Bac+5"], ["CAP Menuiserie", "Infra-bac"],
  ])("%s → %s", (t, lvl) => expect(P.normalizeDegree(t)).toBe(lvl));
  test("« maîtrise de QGIS » n'est pas un diplôme", () => expect(P.normalizeDegree("Maîtrise de QGIS")).toBeNull());
});

describe("Dates et durée en mois", () => {
  const d = (s) => P.findDateRange(s, NOW);
  test("mois en toutes lettres", () => expect(d("Janvier 2021 – Mars 2023")).toMatchObject({ start: { y: 2021, m: 1 }, end: { y: 2023, m: 3 }, months: 27, estimated: false }));
  test("abréviations et « à »", () => expect(d("Sept. 2020 à déc. 2022").months).toBe(28));
  test("format MM/AAAA et poste actuel", () => expect(d("06/2024 - Présent")).toMatchObject({ current: true, months: 29, end: null }));
  test("« depuis »", () => expect(d("Depuis mars 2025")).toMatchObject({ current: true, months: 20 }));
  test("« aujourd'hui » avec apostrophe typographique", () => expect(d("2023 – aujourd’hui").current).toBe(true));
  test("années seules : durée estimée", () => expect(d("2019-2021")).toMatchObject({ months: 24, estimated: true }));
  test("année seule + durée entre parenthèses", () => expect(d("Stage – 2019 (6 mois)")).toMatchObject({ months: 6, start: { y: 2019, m: 1 }, end: { y: 2019, m: 6 } }));
  test("anglais", () => expect(d("May 2018 to June 2019").months).toBe(14));
  test("date de fin avant la date de début : durée nulle", () => expect(d("Mars 2023 – Janvier 2021")).toMatchObject({ months: null, invalid: true }));
  test.each(["Géomaticien chez Alpha", "", "Tél. 06 12 34 56 78", "Code postal 35000", "Mois 13/2021 - 14/2022"])("pas de plage dans %p", (s) => expect(d(s)).toBeNull());
  test("périodes qui se chevauchent comptées une fois", () => {
    const exps = [
      { date_debut: "2020-01-01", date_fin: "2020-12-01", duree_mois: 12 },
      { date_debut: "2020-07-01", date_fin: "2021-06-01", duree_mois: 12 },
      { date_debut: "2023-01-01", date_fin: "2023-03-01", duree_mois: 3 },
    ];
    expect(P.mergedMonths(exps, NOW)).toBe(18 + 3);
  });
});

describe("Lecture d'un CV bien structuré", () => {
  const p = P.parseCV(CV_OK, { now: NOW, id: "cv1" });
  test("candidat", () => {
    expect(p.candidat).toMatchObject({
      id: "cv1", nom: "BARRY", prenom: "Hermès", email: "hermes.barry@example.com", telephone: "+33612345678",
      localisation: { ville: "Rennes", code_postal: "35000", pays: "France" }, salaire_souhaite: 38000, date_disponibilite: "2027-01-01",
    });
    expect(p.candidat.cv_texte_brut).toContain("Alpha Géo");
  });
  test("expériences : intitulé, entreprise, dates, durée calculée, poste actuel", () => {
    expect(p.experiences).toHaveLength(3);
    expect(p.experiences[0]).toMatchObject({ id_candidat: "cv1", intitule_poste: "Géomaticien SIG", intitule_normalise: "GIS_ANALYST", entreprise: "Alpha Géo", date_debut: "2023-01-01", date_fin: null, duree_mois: 46, est_poste_actuel: true });
    expect(p.experiences[1]).toMatchObject({ intitule_poste: "Chargé d'études SIG", entreprise: "Beta Conseil", duree_mois: 28, est_poste_actuel: false });
    expect(p.experiences[2]).toMatchObject({ entreprise: "IGN", duree_mois: 6, dates_estimees: true });
    expect(p.experiences[0].description_poste).toContain("PostGIS");
    expect(p.total_experience_mois).toBe(80);
  });
  test("formations : niveau normalisé, établissement, année", () => {
    expect(p.formations).toEqual([
      expect.objectContaining({ nom_diplome: "Master 2 Géomatique", niveau_normalized: "Bac+5", institution: "Université Rennes 2", annee_obtention: 2020 }),
      expect.objectContaining({ nom_diplome: "Licence Géographie", niveau_normalized: "Bac+3", institution: "Université de Nantes", annee_obtention: 2018 }),
    ]);
    expect(p.niveau_max).toBe("Bac+5");
  });
  test("compétences : récence et contexte", () => {
    const by = Object.fromEntries(p.competences.map((c) => [c.nom_skill, c]));
    expect(by.Python).toMatchObject({ recence_annee: 2026, mois_experience: 52 });
    expect(by["ArcGIS Pro"]).toMatchObject({ recence_annee: 2022, mois_experience: 28 });
    expect(by.SQL.recence_annee).toBeNull(); // citée seulement dans la liste
    expect(by.Python.contexte_texte).toContain("Python");
  });
  test("rien de perdu : aucun bloc non découpé", () => {
    expect(p.unparsed_blocks).toEqual([]);
    expect(p.unparsed_rich_text).toBe("");
  });
});

describe("CV mal formaté : repli dans unparsed_rich_text", () => {
  test("aucune rubrique : tout le texte est gardé et cherchable", () => {
    const txt = "jean dupont développeur web 2015-2018 chez acme php mysql et ensuite freelance react";
    const p = P.parseCV(txt, { now: NOW });
    expect(p.unparsed_rich_text).toContain("freelance react");
    expect(p.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["no_sections", "email_missing", "phone_missing"]));
    expect(p.experiences.length).toBeGreaterThanOrEqual(1);
  });
  test("rubrique Expériences sans aucune date : bloc gardé tel quel", () => {
    const p = P.parseCV("Jean Martin\nEXPÉRIENCES\nGéomaticien chez Alpha\nCartographie QGIS\nFORMATION\nMaster SIG 2020", { now: NOW });
    expect(p.experiences).toEqual([]);
    expect(p.unparsed_blocks[0]).toMatchObject({ section: "experience" });
    expect(p.unparsed_rich_text).toContain("Cartographie QGIS");
    expect(p.issues.map((i) => i.code)).toContain("exp_unparsed");
  });
  test("caractères spéciaux : ligatures, espaces insécables, CRLF, tabulations, emojis, titres espacés", () => {
    const txt = "Léa N’GUYEN\r\n💼 E X P É R I E N C E S\r\nCartographe —\tTerra SIG\r\n03/2022 – 05/2024\r\n• Production de ﬁchiers Shapeﬁle\r\n🎓 Formation :\r\nBTS Géomètre 2021";
    const p = P.parseCV(txt, { now: NOW });
    expect(p.experiences[0]).toMatchObject({ intitule_poste: "Cartographe", intitule_normalise: "CARTOGRAPHER", entreprise: "Terra SIG", duree_mois: 27 });
    expect(p.experiences[0].description_poste).toContain("fichiers Shapefile");
    expect(p.formations[0]).toMatchObject({ niveau_normalized: "Bac+2", annee_obtention: 2021 });
    expect(p.candidat).toMatchObject({ nom: "N’GUYEN", prenom: "Léa" });
  });
  test("dates manquantes sur une expérience : les autres restent lues", () => {
    const txt = "EXPÉRIENCES\nGéomaticien – Alpha\nJanvier 2022 – Décembre 2022\nMissions SIG\nTechnicien SIG – Beta\nMissions sans date";
    const p = P.parseCV(txt, { now: NOW });
    expect(p.experiences).toHaveLength(1);
    expect(p.experiences[0].duree_mois).toBe(12);
    expect(p.experiences[0].description_poste).toContain("Missions sans date");
  });
  test("texte vide ou absent : aucun plantage", () => {
    for (const v of ["", null, undefined, "   \n\n "]) {
      const p = P.parseCV(v, { now: NOW });
      expect(p.experiences).toEqual([]);
      expect(p.candidat.email).toBeNull();
    }
  });
});
