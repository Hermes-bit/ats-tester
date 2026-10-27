/* ATS Tester — dictionnaires de mots-clés et mots vides (FR / EN)
 * Chaque compétence : label affiché, catégorie, alias (variantes reconnues).
 * Les alias sont normalisés automatiquement (minuscules, sans accents).
 * Ajoute tes propres entrées dans SKILLS pour l'adapter à ton métier.
 */
window.ATS = window.ATS || {};

ATS.CATEGORIES = {
  tools: "Logiciels et outils",
  tech: "Langages et technologies",
  formats: "Formats de données",
  methods: "Méthodes et domaines",
  soft: "Savoir-être",
};

ATS.SKILLS = [
  // --- SIG / géomatique : logiciels
  { label: "ArcGIS", cat: "tools", aliases: ["arcgis"] },
  { label: "ArcGIS Pro", cat: "tools", aliases: ["arcgis pro"] },
  { label: "ArcGIS Enterprise", cat: "tools", aliases: ["arcgis enterprise", "portal for arcgis", "arcgis portal"] },
  { label: "ArcGIS Online", cat: "tools", aliases: ["arcgis online", "agol"] },
  { label: "ArcGIS Server", cat: "tools", aliases: ["arcgis server", "arcgis for server"] },
  { label: "ArcGIS Maritime", cat: "tools", aliases: ["maritime for server", "arcgis maritime"] },
  { label: "ArcGIS Hub", cat: "tools", aliases: ["arcgis hub"] },
  { label: "Experience Builder", cat: "tools", aliases: ["experience builder"] },
  { label: "ArcMap", cat: "tools", aliases: ["arcmap"] },
  { label: "ModelBuilder", cat: "tools", aliases: ["modelbuilder", "model builder"] },
  { label: "Network Analyst", cat: "tools", aliases: ["network analyst"] },
  { label: "Business Analyst", cat: "tools", aliases: ["business analyst"] },
  { label: "QGIS", cat: "tools", aliases: ["qgis"] },
  { label: "QGIS Server", cat: "tools", aliases: ["qgis server"] },
  { label: "Processing Modeler", cat: "tools", aliases: ["processing modeler", "modeleur graphique", "graphical modeler"] },
  { label: "FME", cat: "tools", aliases: ["fme", "feature manipulation engine", "safe software"] },
  { label: "FME Form", cat: "tools", aliases: ["fme form", "fme desktop", "fme workbench"] },
  { label: "FME Flow", cat: "tools", aliases: ["fme flow", "fme server"] },
  { label: "GeoServer", cat: "tools", aliases: ["geoserver"] },
  { label: "MapServer", cat: "tools", aliases: ["mapserver"] },
  { label: "GeoNetwork", cat: "tools", aliases: ["geonetwork"] },
  { label: "Lizmap", cat: "tools", aliases: ["lizmap"] },
  { label: "MapStore", cat: "tools", aliases: ["mapstore"] },
  { label: "Mviewer", cat: "tools", aliases: ["mviewer"] },
  { label: "KNIME", cat: "tools", aliases: ["knime"] },
  { label: "Data Interoperability", cat: "tools", aliases: ["data interoperability"] },
  { label: "AutoCAD", cat: "tools", aliases: ["autocad", "auto cad"] },
  { label: "Covadis", cat: "tools", aliases: ["covadis"] },
  { label: "MicroStation", cat: "tools", aliases: ["microstation"] },
  { label: "Revit", cat: "tools", aliases: ["revit"] },
  { label: "Adobe Illustrator", cat: "tools", aliases: ["illustrator"] },
  { label: "Photoshop", cat: "tools", aliases: ["photoshop"] },
  { label: "InDesign", cat: "tools", aliases: ["indesign"] },
  { label: "Inkscape", cat: "tools", aliases: ["inkscape"] },
  { label: "Excel", cat: "tools", aliases: ["excel"] },
  { label: "Power BI", cat: "tools", aliases: ["power bi", "powerbi"] },
  { label: "Tableau", cat: "tools", aliases: ["tableau software", "tableau desktop"] },
  { label: "SharePoint", cat: "tools", aliases: ["sharepoint"] },
  { label: "Jira", cat: "tools", aliases: ["jira"] },
  { label: "pgAdmin", cat: "tools", aliases: ["pgadmin"] },
  { label: "DBeaver", cat: "tools", aliases: ["dbeaver"] },
  { label: "Git", cat: "tools", aliases: ["git"] },
  { label: "GitLab", cat: "tools", aliases: ["gitlab"] },
  { label: "GitHub", cat: "tools", aliases: ["github"] },
  { label: "Jenkins", cat: "tools", aliases: ["jenkins"] },
  { label: "Docker", cat: "tools", aliases: ["docker"] },
  { label: "Kubernetes", cat: "tools", aliases: ["kubernetes", "k8s"] },

  // --- Langages et technologies
  { label: "Python", cat: "tech", aliases: ["python"] },
  { label: "SQL", cat: "tech", aliases: ["sql"] },
  { label: "PostgreSQL", cat: "tech", aliases: ["postgresql", "postgres"] },
  { label: "PostGIS", cat: "tech", aliases: ["postgis"] },
  { label: "Oracle", cat: "tech", aliases: ["oracle"] },
  { label: "MySQL", cat: "tech", aliases: ["mysql"] },
  { label: "SQLite / SpatiaLite", cat: "tech", aliases: ["sqlite", "spatialite"] },
  { label: "MongoDB", cat: "tech", aliases: ["mongodb"] },
  { label: "JavaScript", cat: "tech", aliases: ["javascript"] },
  { label: "TypeScript", cat: "tech", aliases: ["typescript"] },
  { label: "HTML", cat: "tech", aliases: ["html", "html5"] },
  { label: "CSS", cat: "tech", aliases: ["css", "css3"] },
  { label: "PHP", cat: "tech", aliases: ["php"] },
  { label: "Java", cat: "tech", aliases: ["java"] },
  { label: "C#", cat: "tech", aliases: ["c#", "csharp"] },
  { label: "React", cat: "tech", aliases: ["react", "reactjs"] },
  { label: "Angular", cat: "tech", aliases: ["angular"] },
  { label: "Vue.js", cat: "tech", aliases: ["vue.js", "vuejs"] },
  { label: "Node.js", cat: "tech", aliases: ["node.js", "nodejs"] },
  { label: "OpenLayers", cat: "tech", aliases: ["openlayers"] },
  { label: "Leaflet", cat: "tech", aliases: ["leaflet"] },
  { label: "MapLibre / Mapbox", cat: "tech", aliases: ["maplibre", "mapbox"] },
  { label: "GeoPandas", cat: "tech", aliases: ["geopandas"] },
  { label: "Pandas", cat: "tech", aliases: ["pandas"] },
  { label: "Shapely", cat: "tech", aliases: ["shapely"] },
  { label: "Rasterio", cat: "tech", aliases: ["rasterio"] },
  { label: "GDAL / OGR", cat: "tech", aliases: ["gdal", "ogr", "ogr2ogr"] },
  { label: "ArcPy", cat: "tech", aliases: ["arcpy"] },
  { label: "PyQGIS", cat: "tech", aliases: ["pyqgis"] },
  { label: "API REST", cat: "tech", aliases: ["api rest", "rest api", "api"] },
  { label: "Linux", cat: "tech", aliases: ["linux"] },
  { label: "Windows Server", cat: "tech", aliases: ["windows server"] },
  { label: "CI/CD", cat: "tech", aliases: ["ci/cd", "ci cd", "integration continue", "deploiement continu"] },
  { label: "DevSecOps", cat: "tech", aliases: ["devsecops", "devops"] },
  { label: "WMS", cat: "tech", aliases: ["wms"] },
  { label: "WFS", cat: "tech", aliases: ["wfs"] },
  { label: "WMTS", cat: "tech", aliases: ["wmts"] },
  { label: "Standards OGC", cat: "tech", aliases: ["ogc"] },

  // --- Formats de données
  { label: "DWG", cat: "formats", aliases: ["dwg"] },
  { label: "DXF", cat: "formats", aliases: ["dxf"] },
  { label: "Shapefile", cat: "formats", aliases: ["shapefile", "shp"] },
  { label: "GeoPackage", cat: "formats", aliases: ["geopackage", "gpkg"] },
  { label: "GeoJSON", cat: "formats", aliases: ["geojson"] },
  { label: "KML / KMZ", cat: "formats", aliases: ["kml", "kmz"] },
  { label: "CSV", cat: "formats", aliases: ["csv"] },
  { label: "GeoTIFF", cat: "formats", aliases: ["geotiff", "tiff"] },
  { label: "LAS / LAZ", cat: "formats", aliases: ["las", "laz"] },
  { label: "IFC", cat: "formats", aliases: ["ifc"] },
  { label: "S-57 / S-100", cat: "formats", aliases: ["s-57", "s57", "s-100", "s100"] },

  // --- Méthodes et domaines
  { label: "SIG", cat: "methods", aliases: ["sig", "gis", "systeme d information geographique", "systemes d information geographique"] },
  { label: "Géomatique", cat: "methods", aliases: ["geomatique", "geomaticien", "geomaticienne"] },
  { label: "ETL", cat: "methods", aliases: ["etl", "extract transform load"] },
  { label: "Automatisation", cat: "methods", aliases: ["automatisation", "automatiser", "automatise", "scripts", "script"] },
  { label: "Base de données", cat: "methods", aliases: ["base de donnees", "bases de donnees", "bdd", "sgbd", "sgbdr"] },
  { label: "Analyse spatiale", cat: "methods", aliases: ["analyse spatiale", "analyses spatiales", "spatial analysis"] },
  { label: "Cartographie", cat: "methods", aliases: ["cartographie", "cartographique", "cartographiques", "carte", "cartes"] },
  { label: "Atlas / mise en page", cat: "methods", aliases: ["atlas", "mise en page"] },
  { label: "Sémiologie graphique", cat: "methods", aliases: ["semiologie"] },
  { label: "Webmapping / Web SIG", cat: "methods", aliases: ["webmapping", "web sig", "webservices", "services web", "webservice"] },
  { label: "IDG / catalogage", cat: "methods", aliases: ["idg", "infrastructure de donnees", "infrastructures de donnees", "catalogage", "metadonnees"] },
  { label: "INSPIRE", cat: "methods", aliases: ["inspire"] },
  { label: "Open data", cat: "methods", aliases: ["open data", "opendata", "donnees ouvertes"] },
  { label: "Topographie", cat: "methods", aliases: ["topographie", "topographique", "topographiques", "topographe"] },
  { label: "CAO / DAO", cat: "methods", aliases: ["cao", "dao", "cad"] },
  { label: "BIM", cat: "methods", aliases: ["bim"] },
  { label: "Lidar", cat: "methods", aliases: ["lidar", "nuage de points", "nuages de points"] },
  { label: "Photogrammétrie", cat: "methods", aliases: ["photogrammetrie"] },
  { label: "Télédétection", cat: "methods", aliases: ["teledetection", "imagerie satellite", "remote sensing"] },
  { label: "Cadastre / foncier", cat: "methods", aliases: ["cadastre", "foncier"] },
  { label: "Réseaux (eau, énergie, télécoms)", cat: "methods", aliases: ["detection de reseaux", "reseaux d eau", "assainissement"] },
  { label: "Géocodage", cat: "methods", aliases: ["geocodage", "geocoder"] },
  { label: "Géomarketing", cat: "methods", aliases: ["geomarketing", "geo marketing"] },
  { label: "Zones de chalandise", cat: "methods", aliases: ["zone de chalandise", "zones de chalandise", "chalandise", "isochrone", "isochrones"] },
  { label: "Contrôle qualité des données", cat: "methods", aliases: ["controle qualite", "qualite des donnees", "controler", "controle des donnees"] },
  { label: "Modélisation de données", cat: "methods", aliases: ["modelisation", "modeliser", "mcd", "uml"] },
  { label: "Jumeau numérique", cat: "methods", aliases: ["jumeau numerique", "jumeaux numeriques", "digital twin"] },
  { label: "Intelligence artificielle", cat: "methods", aliases: ["intelligence artificielle", "machine learning", "deep learning"] },
  { label: "Conteneurisation", cat: "methods", aliases: ["conteneurisation", "containerisation"] },
  { label: "AMOA", cat: "methods", aliases: ["amoa", "assistance a maitrise d ouvrage", "assistant a maitrise d ouvrage"] },
  { label: "MOE", cat: "methods", aliases: ["moe", "maitrise d oeuvre"] },
  { label: "Cahier des charges", cat: "methods", aliases: ["cahier des charges", "cahiers des charges", "specifications"] },
  { label: "Recueil des besoins", cat: "methods", aliases: ["recueil des besoins", "formalisation des besoins", "analyse des besoins", "expression des besoins"] },
  { label: "Gestion de projet", cat: "methods", aliases: ["gestion de projet", "pilotage de projet", "chef de projet", "pilotage projet"] },
  { label: "Recette", cat: "methods", aliases: ["recette", "recettes", "tests"] },
  { label: "Documentation technique", cat: "methods", aliases: ["documentation technique", "documentation"] },
  { label: "Veille technologique", cat: "methods", aliases: ["veille technologique", "veille"] },
  { label: "Méthodes agiles", cat: "methods", aliases: ["agile", "agiles", "scrum", "kanban"] },
  { label: "Anglais", cat: "methods", aliases: ["anglais", "english"] },

  // --- Savoir-être
  { label: "Rigueur", cat: "soft", aliases: ["rigueur", "rigoureux", "rigoureuse"] },
  { label: "Autonomie", cat: "soft", aliases: ["autonomie", "autonome"] },
  { label: "Travail en équipe", cat: "soft", aliases: ["travail en equipe", "esprit d equipe", "travailler en equipe", "collaboratif", "collaboration"] },
  { label: "Curiosité", cat: "soft", aliases: ["curiosite", "curieux", "curieuse"] },
  { label: "Organisation", cat: "soft", aliases: ["sens de l organisation", "organise", "organisee", "organisation"] },
  { label: "Logique", cat: "soft", aliases: ["logique"] },
  { label: "Communication", cat: "soft", aliases: ["communication", "communiquer", "relationnel"] },
  { label: "Pédagogie / écoute", cat: "soft", aliases: ["pedagogie", "pedagogue", "ecoute"] },
  { label: "Esprit d'analyse / synthèse", cat: "soft", aliases: ["esprit d analyse", "esprit de synthese", "analytique", "capacite d analyse"] },
  { label: "Adaptabilité", cat: "soft", aliases: ["adaptabilite", "capacite d adaptation", "adaptation"] },
  { label: "Force de proposition", cat: "soft", aliases: ["force de proposition", "proactif", "proactive", "initiative"] },
];

ATS.STOPWORDS = new Set((
  // français
  "a afin ai aie aient aies ait alors as au aucun aucune aupres aura aurai auraient aurais aurait auras aurez auriez aurons auront aussi autre autres aux avaient avais avait avant avec avez aviez avions avoir avons ayant ayez ayons " +
  "bien bon ca car ce ceci cela celle celles celui cependant certain certaine certaines certains ces cet cette ceux chaque chez ci comme comment compris concernant contre d dans de des depuis deja dont du durant " +
  "elle elles en encore entre es est et etaient etais etait etant ete etes etiez etions etre eu eue eues eurent eus eusse eut eux fait faire fois font furent fus fut " +
  "ici il ils j je jusqu jusque l la le les leur leurs lors lui m ma mais me meme memes mes moi mon n ne ni nos notre nous on ont ou par parce pas peu peut peuvent plus plusieurs pour pourquoi pourra pouvez " +
  "qu quand que quel quelle quelles quels qui quoi s sa sans se selon ses si sien soi soient sois soit sommes son sont sous soyez suis sur t ta te tel telle tes toi ton tous tout toute toutes tres tu un une unes uns " +
  "v va vers via voici voila vos votre vous vu y " +
  // vocabulaire d'offre d'emploi sans valeur de compétence
  "poste postes mission missions profil candidat candidate candidature entreprise societe groupe equipe equipes service services client clients projet projets " +
  "vous serez amene amenee amenes ainsi notamment egalement etc type types ex h f cdi cdd stage alternance experience experiences annee annees an ans " +
  "nous recherchons recherche rejoindre rejoignez souhaitez souhaite envie sein cadre niveau bac plus minimum premiere premier bonne bonnes bon solide solides " +
  "connaissance connaissances maitrise maitriser capacite aptitude aptitudes appetence outils outil logiciels logiciel langages langage technologies technologie " +
  "participer participation realiser realisation mettre place mise assurer contribuer developper developpement selon simple simples avancees avance " +
  "base bases technique techniques donnee donnees outil simple divers diverses variees variee sources source contraintes contrainte metier metiers " +
  "diplome diplomee equivalent date salaire remuneration avantages lieu travail temps plein partiel teletravail hebdomadaires " +
  // anglais
  "the and or of to in for on with as by at from an be is are was were this that these those you your we our will can may must have has had it its not but if into " +
  "about over such other more most than then also any all each who whom which what when where why how job role team work working years year"
).split(/\s+/));
