// Charge les scripts du navigateur (window.ATS) dans Node pour les tests
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "assets", "js");
const FILES = ["keywords.js", "analyzer.js", "profile.js", "offer.js", "search.js", "prompt.js", "files.js"];

module.exports = function loadATS() {
  global.window = global;
  FILES.forEach((f) => require(path.join(ROOT, f)));
  return global.ATS;
};

// Date de référence fixe : 28 octobre 2026
module.exports.NOW = new Date(2026, 9, 28);

module.exports.CV_OK = `Hermès BARRY
Géomaticien SIG
35000 Rennes · hermes.barry@example.com · 06 12 34 56 78
Permis B · Disponible à partir de janvier 2027 · Prétentions salariales : 38 k€

PROFIL
Géomaticien rigoureux et autonome.

EXPÉRIENCES PROFESSIONNELLES
Géomaticien SIG — Alpha Géo, Rennes
Janvier 2023 – Aujourd'hui
• Administration des bases PostGIS et scripts Python
• Automatisation FME, cartographie QGIS
Chargé d'études SIG | Beta Conseil
Sept. 2020 à déc. 2022
• Cartographie ArcGIS Pro, analyses spatiales
Stage SIG - IGN
2019 (6 mois)
• Traitements Python, QGIS

FORMATION
Master 2 Géomatique – Université Rennes 2 – 2020
Licence Géographie, Université de Nantes, 2018

COMPÉTENCES
QGIS, ArcGIS Pro, PostGIS, Python, FME, SQL

LANGUES
Anglais : B2`;

module.exports.JD = `Géomaticien SIG (H/F) – Alpha Géo
Missions : administrer les bases PostGIS, automatiser les traitements avec Python et FME, produire des cartes sous QGIS et ArcGIS Pro.
Profil : de formation Bac+5 en géomatique, vous justifiez d'une expérience de 3 ans minimum en SIG.
Vous avez 2 ans d'expérience en Python.
Permis B obligatoire. Anglais courant apprécié. La connaissance d'ArcGIS Enterprise est un plus. Une certification Esri serait un plus.
Vous encadrerez une équipe de 2 techniciens. Rigueur, autonomie.`;
