// Nettoyage du texte reconnu par OCR (fiche de poste scannée ou en image)
const loadATS = require("./helpers/load");
const ATS = loadATS();
const tidy = ATS.ocr.tidy;

describe("Texte reconnu : lignes recollées", () => {
  test("phrase coupée par la mise en page : recollée quand la ligne suivante commence en minuscule", () => {
    expect(tidy("Produire des cartes et des\nanalyses spatiales sous QGIS.")).toBe("Produire des cartes et des analyses spatiales sous QGIS.");
  });
  test("ligne suivante en chiffre ou en majuscule : gardée (début possible d'un nouvel élément)", () => {
    expect(tidy("Vous justifiez d'une expérience de\n3 ans minimum en SIG.")).toBe("Vous justifiez d'une expérience de\n3 ans minimum en SIG.");
    expect(tidy("Administrer les bases de données\nPostGIS et garantir la qualité.")).toBe("Administrer les bases de données\nPostGIS et garantir la qualité.");
  });
  test("mot coupé en fin de ligne : recollé sans tiret", () => {
    expect(tidy("Automatiser les traitements géogra-\nphiques avec Python.")).toBe("Automatiser les traitements géographiques avec Python.");
  });
  test("fin de phrase, titres et listes : lignes gardées", () => {
    expect(tidy("Vos missions\n• Cartographie\n• Analyses")).toBe("Vos missions\n• Cartographie\n• Analyses");
    expect(tidy("Permis B obligatoire.\nrigueur demandée")).toBe("Permis B obligatoire.\nrigueur demandée");
    expect(tidy("Profil :\nformation Bac+5")).toBe("Profil :\nformation Bac+5");
  });
  test("puces lues comme », «, ©, * : uniformisées", () => {
    expect(tidy("» Administrer PostGIS\n« Accompagner les services\n© Produire des cartes\n* Rigueur")).toBe("• Administrer PostGIS\n• Accompagner les services\n• Produire des cartes\n• Rigueur");
  });
  test("espaces multiples, insécables et lignes vides en trop", () => {
    expect(tidy("  Géomaticien\u00A0\u00A0SIG  \n\n\n\nAlpha   Géo\n\n")).toBe("Géomaticien SIG\n\nAlpha Géo");
  });
  test("texte vide ou absent", () => {
    expect(tidy("")).toBe("");
    expect(tidy(null)).toBe("");
  });
});
