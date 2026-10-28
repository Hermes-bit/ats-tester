// Brique 4 : recherche booléenne (AND, OR, NOT, parenthèses) dans « Mes candidatures »
const loadATS = require("./helpers/load");
const ATS = loadATS();

const APPS = [
  { company: "Alpha Géo", title: "Géomaticien SIG", status: "Envoyée", notes: "Rennes, relance lundi", jdText: "QGIS PostGIS FME. Poste basé à Rennes.", cvText: "QGIS Python" },
  { company: "Beta Carto", title: "Stage SIG", status: "Entretien", notes: "", jdText: "Stage QGIS à Nantes", cvText: "QGIS" },
  { company: "Gamma Data", title: "Data engineer", status: "Refusée", notes: "Lyon", jdText: "Python, Spark, chef de projet data", cvText: "Python SQL", profile: { competences: [{ nom_skill: "Python" }], unparsed_rich_text: "projet Kaggle" } },
];
const find = (q) => APPS.filter(ATS.search.compile(q)).map((a) => a.company.split(" ")[0]);

describe("Recherche booléenne", () => {
  test.each([
    ["", ["Alpha", "Beta", "Gamma"]],
    ["qgis", ["Alpha", "Beta"]],
    ["QGIS AND Rennes", ["Alpha"]],
    ["QGIS Rennes", ["Alpha"]],
    ["QGIS OR Python", ["Alpha", "Beta", "Gamma"]],
    ["QGIS AND NOT stage", ["Alpha"]],
    ["QGIS AND (Rennes OR Nantes) NOT stage", ["Alpha"]],
    ["(Rennes OR Lyon) AND python", ["Alpha", "Gamma"]],
    ["NOT (qgis OR spark)", []],
    ["-stage qgis", ["Alpha"]],
    ["!stage", ["Alpha", "Gamma"]],
  ])("%p", (q, expected) => expect(find(q)).toEqual(expected));

  test("opérateurs en français", () => {
    expect(find("qgis ET nantes")).toEqual(["Beta"]);
    expect(find("lyon OU nantes")).toEqual(["Beta", "Gamma"]);
    expect(find("qgis SAUF stage")).toEqual(["Alpha"]);
  });
  test("expression exacte entre guillemets", () => {
    expect(find('"chef de projet"')).toEqual(["Gamma"]);
    expect(find('"projet chef"')).toEqual([]);
    expect(find("« relance lundi »")).toEqual(["Alpha"]);
  });
  test("champs", () => {
    expect(find("entreprise:beta")).toEqual(["Beta"]);
    expect(find("statut:entretien OR statut:refusee")).toEqual(["Beta", "Gamma"]);
    expect(find('poste:"data engineer"')).toEqual(["Gamma"]);
    expect(find("competences:python")).toEqual(["Gamma"]);
    expect(find("offre:fme")).toEqual(["Alpha"]);
  });
  test("insensible aux accents et aux majuscules", () => {
    expect(find("GEOMATICIEN")).toEqual(["Alpha"]);
    expect(find("refusée")).toEqual(["Gamma"]);
  });
  test("le texte non découpé du CV reste cherchable", () => expect(find("kaggle")).toEqual(["Gamma"]));
  test("requêtes mal formées tolérées", () => {
    expect(find("((qgis")).toEqual(["Alpha", "Beta"]);
    expect(find("qgis))")).toEqual(["Alpha", "Beta"]);
    expect(find("AND OR")).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(find("qgis AND")).toEqual(["Alpha", "Beta"]);
    expect(find('"non fermé')).toEqual([]);
    expect(() => find("(((((")).not.toThrow();
  });
  test("arbre syntaxique : priorité NOT > AND > OR", () => {
    expect(ATS.search.parse("a OR b AND NOT c")).toEqual({
      t: "OR", a: { t: "TERM", value: "a", field: null, phrase: false },
      b: { t: "AND", a: { t: "TERM", value: "b", field: null, phrase: false }, b: { t: "NOT", e: { t: "TERM", value: "c", field: null, phrase: false } } },
    });
  });
});
