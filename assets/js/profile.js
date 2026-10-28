/* ATS Tester — lecture structurée du CV (parsing) et normalisation
 * Découpe le CV comme un ATS : coordonnées, expériences (dates, durée en mois), formations (niveau normalisé),
 * compétences (récence, contexte). Ce qui ne peut pas être découpé proprement est gardé tel quel dans
 * unparsed_rich_text pour rester cherchable : aucune information n'est perdue.
 *
 * Schéma produit (mêmes noms de champs que les vues de supabase/schema.sql) :
 *   candidat    : id, nom, prenom, email, telephone (E.164), localisation { ville, code_postal, pays },
 *                 statut_visa, salaire_souhaite, date_disponibilite, cv_texte_brut
 *   experiences : id_candidat, intitule_poste, intitule_normalise, entreprise, date_debut, date_fin,
 *                 duree_mois (calculée), description_poste, est_poste_actuel
 *   formations  : id_candidat, nom_diplome, niveau_normalized (Bac+3, Bac+5…), institution, annee_obtention
 *   competences : id_candidat, nom_skill, recence_annee, contexte_texte
 *
 * Dépend de analyzer.js (ATS.norm, ATS.makeRegex, ATS.SKILL_MATCHERS), chargé avant.
 */
window.ATS = window.ATS || {};

(function () {
  const norm = (s) => ATS.norm(s);
  const pad = (n) => String(n).padStart(2, "0");
  const BULLET = /^[\-•*▪●◦·‣–—>✓✔➢➤►]\s*/;

  /* ================= Coordonnées : téléphone E.164 et e-mail ================= */

  /** Numéro au format international E.164 (+33612345678), ou null s'il n'est pas valide. */
  function toE164(raw, country) {
    if (raw === null || raw === undefined) return null;
    let s = String(raw).trim().replace(/\(0\)/g, "").replace(/[\s.\-()\/]/g, "");
    if (!/^\+?\d+$/.test(s)) return null;
    if (s.startsWith("00")) s = "+" + s.slice(2);
    if (s.startsWith("+")) {
      const d = s.slice(1);
      if (d.startsWith("33")) {
        const nat = d.slice(2).replace(/^0/, "");
        return /^[1-9]\d{8}$/.test(nat) ? "+33" + nat : null;
      }
      return /^[1-9]\d{7,14}$/.test(d) ? "+" + d : null;
    }
    if ((country || "FR") === "FR" && /^0[1-9]\d{8}$/.test(s)) return "+33" + s.slice(1);
    return null;
  }
  const PHONE_FIND = /(?:\+|00)\d{1,3}[\s.\-]?(?:\(0\)[\s.\-]?)?\d(?:[\s.\-]?\d){6,13}|(?<![\d+])0[1-9](?:[\s.\-]?\d{2}){4}(?!\d)/g;
  /** Tous les numéros trouvés : { raw, e164 } (e164 null si le numéro n'est pas convertible). */
  function extractPhones(text) {
    return ((text || "").match(PHONE_FIND) || []).map((raw) => ({ raw: raw.trim(), e164: toE164(raw) }));
  }

  /** Adresse e-mail valide (forme usuelle de la RFC 5322, sans les cas exotiques). */
  function isValidEmail(e) {
    if (typeof e !== "string" || e.length > 254) return false;
    const m = /^([A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*)@((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63})$/.exec(e);
    return !!m && m[1].length <= 64;
  }
  const EMAIL_FIND = /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
  function extractEmails(text) {
    const all = ((text || "").match(EMAIL_FIND) || []).map((e) => e.replace(/^[.'`]+|[.'`]+$/g, ""));
    return { valid: [...new Set(all.filter(isValidEmail).map((e) => e.toLowerCase()))], invalid: all.filter((e) => !isValidEmail(e)) };
  }

  /* ================= Intitulés de poste normalisés ================= */
  // [code, libellé, famille, variantes] : la variante la plus longue trouvée l'emporte
  const TITLES = [
    ["SALES_DIRECTOR", "Directeur commercial", "SALES", ["vp sales", "vice president sales", "vice president des ventes", "directeur commercial", "directrice commerciale", "head of sales", "sales director", "directeur des ventes", "directrice des ventes", "chief sales officer"]],
    ["SALES_MANAGER", "Responsable commercial", "SALES", ["responsable commercial", "responsable commerciale", "sales manager", "chef des ventes", "responsable des ventes", "key account manager", "responsable grands comptes"]],
    ["SALES_REPRESENTATIVE", "Commercial", "SALES", ["commercial", "commerciale", "attache commercial", "attachee commerciale", "business developer", "charge d affaires", "chargee d affaires", "ingenieur commercial", "technico commercial", "account executive", "sales representative"]],
    ["GIS_ANALYST", "Géomaticien / chargé d'études SIG", "GIS", ["geomaticien", "geomaticienne", "charge d etudes sig", "chargee d etudes sig", "charge d etudes geomatique", "chargee d etudes geomatique", "charge d etudes en geomatique", "analyste sig", "gis analyst", "gis specialist", "specialiste sig", "charge de mission sig", "chargee de mission sig", "charge sig", "chargee sig", "charge de mission geomatique", "chargee de mission geomatique", "stage sig", "stagiaire sig", "stage geomatique", "stagiaire geomatique", "stage en geomatique", "alternant sig", "alternance sig"]],
    ["GIS_ENGINEER", "Ingénieur SIG", "GIS", ["ingenieur sig", "ingenieure sig", "ingenieur geomaticien", "ingenieure geomaticienne", "ingenieur geomatique", "ingenieure geomatique", "gis engineer", "ingenieur d etudes sig", "ingenieure d etudes sig"]],
    ["GIS_TECHNICIAN", "Technicien SIG", "GIS", ["technicien sig", "technicienne sig", "technicien geomatique", "technicienne geomatique", "assistant sig", "assistante sig", "operateur sig", "operatrice sig", "gis technician"]],
    ["GIS_DEVELOPER", "Développeur SIG", "GIS", ["developpeur sig", "developpeuse sig", "developpeur geomatique", "developpeuse geomatique", "gis developer", "developpeur webmapping", "developpeur cartographique"]],
    ["GIS_ADMINISTRATOR", "Administrateur SIG", "GIS", ["administrateur sig", "administratrice sig", "administrateur de donnees geographiques", "administratrice de donnees geographiques", "administrateur de donnees sig", "gis administrator"]],
    ["GIS_PROJECT_MANAGER", "Chef de projet SIG", "GIS", ["chef de projet sig", "cheffe de projet sig", "chef de projet geomatique", "cheffe de projet geomatique", "gis project manager", "charge de projet sig", "chargee de projet sig"]],
    ["GIS_MANAGER", "Responsable SIG", "GIS", ["responsable sig", "responsable du service sig", "responsable geomatique", "head of gis", "gis manager", "directeur sig"]],
    ["GIS_CONSULTANT", "Consultant SIG", "GIS", ["consultant sig", "consultante sig", "consultant geomatique", "consultante geomatique", "gis consultant"]],
    ["CARTOGRAPHER", "Cartographe", "GIS", ["cartographe", "cartographer"]],
    ["SURVEYOR", "Géomètre / topographe", "GIS", ["geometre", "geometre topographe", "geometre expert", "topographe", "technicien geometre", "surveyor", "land surveyor"]],
    ["REMOTE_SENSING_SPECIALIST", "Spécialiste télédétection", "GIS", ["charge d etudes teledetection", "chargee d etudes teledetection", "ingenieur teledetection", "ingenieure teledetection", "photo interprete", "photogrammetre", "remote sensing specialist", "remote sensing engineer"]],
    ["DATA_ANALYST", "Data analyst", "DATA", ["data analyst", "analyste de donnees", "analyste data", "charge d etudes statistiques", "chargee d etudes statistiques", "statisticien", "statisticienne"]],
    ["DATA_ENGINEER", "Data engineer", "DATA", ["data engineer", "ingenieur data", "ingenieure data", "ingenieur donnees", "ingenieure donnees", "ingenieur big data", "developpeur etl"]],
    ["DATA_SCIENTIST", "Data scientist", "DATA", ["data scientist", "scientifique des donnees", "ingenieur machine learning", "machine learning engineer"]],
    ["DATA_MANAGER", "Data manager", "DATA", ["data manager", "gestionnaire de donnees", "administrateur de donnees", "administratrice de donnees", "chief data officer", "responsable data"]],
    ["DATABASE_ADMINISTRATOR", "Administrateur de bases de données", "DATA", ["administrateur de bases de donnees", "administratrice de bases de donnees", "administrateur base de donnees", "dba", "database administrator"]],
    ["SOFTWARE_DEVELOPER", "Développeur", "DEV", ["developpeur", "developpeuse", "developpeur web", "developpeur full stack", "developpeur fullstack", "developpeur front end", "developpeur back end", "software engineer", "software developer", "web developer", "ingenieur logiciel", "ingenieur developpement", "programmeur", "frontend developer", "backend developer", "full stack developer"]],
    ["DEVOPS_ENGINEER", "Ingénieur DevOps", "DEV", ["devops", "ingenieur devops", "site reliability engineer"]],
    ["SYSTEM_ADMINISTRATOR", "Administrateur systèmes", "IT", ["administrateur systeme", "administrateur systemes et reseaux", "administratrice systemes", "sysadmin", "technicien informatique", "technicien support", "support informatique"]],
    ["PROJECT_MANAGER", "Chef de projet", "PM", ["chef de projet", "cheffe de projet", "chef de projets", "project manager", "charge de projet", "chargee de projet", "directeur de projet", "directrice de projet", "responsable de projet", "pmo"]],
    ["PRODUCT_OWNER", "Product owner", "PM", ["product owner", "product manager", "chef de produit", "cheffe de produit"]],
    ["STUDY_OFFICER", "Chargé d'études", "STUDIES", ["charge d etudes", "chargee d etudes", "charge de mission", "chargee de mission"]],
    ["CONSULTANT", "Consultant", "CONSULTING", ["consultant", "consultante"]],
    ["URBAN_PLANNER", "Urbaniste", "URBAN", ["urbaniste", "charge d etudes urbanisme", "chargee d etudes urbanisme", "charge d etudes en urbanisme", "urban planner"]],
    ["ENVIRONMENTAL_ENGINEER", "Ingénieur environnement", "ENV", ["ingenieur environnement", "ingenieure environnement", "charge d etudes environnement", "chargee d etudes environnement", "charge de mission environnement", "chargee de mission environnement", "environmental engineer", "ecologue", "charge d etudes biodiversite"]],
    ["RECRUITER", "Chargé de recrutement", "HR", ["charge de recrutement", "chargee de recrutement", "recruteur", "recruteuse", "talent acquisition", "talent acquisition specialist", "recruiter"]],
    ["HR_MANAGER", "Responsable RH", "HR", ["drh", "rrh", "directeur des ressources humaines", "directrice des ressources humaines", "responsable rh", "responsable ressources humaines", "hr manager", "hr business partner"]],
    ["ACCOUNTANT", "Comptable", "FIN", ["comptable", "accountant", "chef comptable", "expert comptable"]],
    ["FINANCIAL_CONTROLLER", "Contrôleur de gestion", "FIN", ["controleur de gestion", "controleuse de gestion", "financial controller", "analyste financier", "financial analyst"]],
    ["MARKETING_MANAGER", "Responsable marketing", "MKT", ["responsable marketing", "marketing manager", "chef de produit marketing", "directeur marketing", "directrice marketing"]],
    ["COMMUNICATION_OFFICER", "Chargé de communication", "MKT", ["charge de communication", "chargee de communication", "responsable communication", "community manager", "communication officer"]],
    ["EXECUTIVE_ASSISTANT", "Assistant de direction", "ADMIN", ["assistant de direction", "assistante de direction", "office manager", "executive assistant", "secretaire"]],
    ["CEO", "Directeur général", "EXEC", ["directeur general", "directrice generale", "ceo", "chief executive officer", "pdg", "president directeur general"]],
    ["CTO", "Directeur technique", "EXEC", ["cto", "directeur technique", "directrice technique", "chief technology officer"]],
    ["CIO", "Directeur des systèmes d'information", "EXEC", ["dsi", "directeur des systemes d information", "directrice des systemes d information", "cio", "chief information officer"]],
    ["TEACHER", "Enseignant / formateur", "EDU", ["enseignant", "enseignante", "professeur", "formateur", "formatrice", "teacher", "trainer"]],
    ["RESEARCHER", "Chercheur", "RESEARCH", ["chercheur", "chercheuse", "doctorant", "doctorante", "post doctorant", "ingenieur de recherche", "ingenieure de recherche", "researcher", "research engineer", "phd candidate"]],
    ["ENGINEER", "Ingénieur", "ENG", ["ingenieur d etudes", "ingenieure d etudes", "ingenieur", "ingenieure", "engineer"]],
    ["TECHNICIAN", "Technicien", "TECH", ["technicien", "technicienne", "technician"]],
  ];
  let TITLE_RE = null;
  function titleMatchers() {
    if (!TITLE_RE) TITLE_RE = TITLES.map(([code, label, family, aliases]) => ({ code, label, family, re: ATS.makeRegex([...aliases].sort((a, b) => b.length - a.length)) }));
    return TITLE_RE;
  }
  const SENIORITY = [["INTERN", /(stagiaire|stage|alternant|alternante|alternance|apprenti|apprentie|intern|internship)/], ["JUNIOR", /(junior|debutant|debutante|jeune diplome)/], ["LEAD", /(lead|principal|referent|referente|head)/], ["SENIOR", /(senior|confirme|confirmee|experimente|experimentee|expert|experte)/]];

  /** « VP Sales », « Directeur commercial », « Head of Sales » → { code: "SALES_DIRECTOR", … } ; code null si inconnu. */
  function normalizeJobTitle(text) {
    const src = String(text || "").normalize("NFKC");
    let best = null;
    for (const t of titleMatchers()) {
      t.re.lastIndex = 0;
      let m;
      while ((m = t.re.exec(src))) {
        if (!best || m[0].length > best.len) best = { code: t.code, label: t.label, family: t.family, len: m[0].length, match: m[0] };
        if (!m[0].length) t.re.lastIndex++;
      }
    }
    const n = norm(src);
    const sen = SENIORITY.find(([, re]) => re.test(n));
    return best ? { code: best.code, label: best.label, family: best.family, match: best.match, seniority: sen ? sen[0] : null }
      : { code: null, label: null, family: null, match: null, seniority: sen ? sen[0] : null };
  }

  /* ================= Diplômes : niveau normalisé ================= */
  const LEVEL_RANK = { "Infra-bac": 0, Bac: 1, "Bac+2": 2, "Bac+3": 3, "Bac+4": 4, "Bac+5": 5, "Bac+8": 8 };
  const DEGREE_RULES = [
    ["Bac+8", /(doctorat|doctorate|\bphd\b|ph d|these de doctorat|\bdocteur\b)/, /\bPh\.?D\b/],
    ["Bac+4", /(master 1|master i\b|maitrise (?!de |d |des |du )|bac\s*\+\s*4)/, /\bM1\b/],
    ["Bac+5", /(master|mastere|\bmsc\b|m sc\b|\bdess\b|\bdea\b|diplome d ingenieur|titre d ingenieur|ecole d ingenieurs?|cycle ingenieur|ingenieur (?:diplome|en |de l )|\bmba\b|bac\s*\+\s*5)/, /\b(M2|MSc|DESS|DEA)\b/],
    ["Bac+3", /(licence|bachelor|bac\s*\+\s*3)/, /\b(BUT|LP)\b/],
    ["Bac+2", /(\bbts\b|\bdut\b|\bdeug\b|\bdeust\b|bac\s*\+\s*2|classe preparatoire|\bcpge\b)/, /\b(BTS|DUT)\b/],
    ["Bac", /(baccalaureat|\bbac\b(?!\s*\+))/, null],
    ["Infra-bac", /(\bcap\b|\bbep\b|brevet des colleges)/, /\b(CAP|BEP)\b/],
  ];
  /** « Master 2 Géomatique » → "Bac+5", « BUT Informatique » → "Bac+3"… ; null si aucun diplôme reconnu. */
  function normalizeDegree(text) {
    const raw = String(text || ""), n = norm(raw);
    for (const [level, re, reCase] of DEGREE_RULES) if (re.test(n) || (reCase && reCase.test(raw))) return level;
    return null;
  }
  const SCHOOL_RE = /(universite|university|ecole|school|iut|institut|institute|lycee|college|faculte|ensg|insa|polytech|cnam|sorbonne|\bens\b|agrocampus|agroparistech|business school|\bimt\b|\bcesi\b|\bupec\b|\bign\b)/;

  /* ================= Dates ================= */
  const MONTHS = { janvier: 1, january: 1, janv: 1, jan: 1, fevrier: 2, february: 2, fevr: 2, fev: 2, feb: 2, mars: 3, march: 3, mar: 3, avril: 4, april: 4, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, june: 6, jun: 6, juillet: 7, july: 7, juil: 7, jul: 7, aout: 8, august: 8, aug: 8, septembre: 9, september: 9, sept: 9, sep: 9, octobre: 10, october: 10, oct: 10, novembre: 11, november: 11, nov: 11, decembre: 12, december: 12, dec: 12 };
  const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const DATE_TOKEN = new RegExp(
    "(?<![a-z0-9])(?:(\\d{1,2})(?:er)?\\s+)?(" + MONTH_ALT + ")(?![a-z])\\.?\\s*(?:de\\s+)?((?:19|20)\\d{2})(?!\\d)" +
    "|(?<!\\d)(\\d{1,2})\\s*[/.\\-]\\s*(\\d{1,2})\\s*[/.\\-]\\s*((?:19|20)\\d{2})(?!\\d)" +
    "|(?<!\\d)(\\d{1,2})\\s*[/.\\-]\\s*((?:19|20)\\d{2})(?!\\d)" +
    "|(?<!\\d)((?:19|20)\\d{2})(?!\\d)" +
    "|(aujourd\\s?['’]?\\s?hui|a ce jour|ce jour|present|actuel(?:lement)?|en cours|maintenant|now|current|today|to date|ongoing)", "g");
  // Minuscules sans accents, même longueur que l'original (les positions restent valables)
  function fold(s) { let o = ""; for (let i = 0; i < s.length; i++) o += s[i].normalize("NFD").charAt(0).toLowerCase(); return o; }

  function nowParts(now) {
    if (now && now.y && now.d) return now;
    const d = now instanceof Date ? now : new Date(now || Date.now());
    return { y: d.getFullYear(), m: d.getMonth() + 1, d };
  }

  function tokens(line, now) {
    const f = fold(line), out = [];
    DATE_TOKEN.lastIndex = 0;
    let m;
    while ((m = DATE_TOKEN.exec(f))) {
      let t = null;
      if (m[3]) t = { y: +m[3], m: MONTHS[m[2]] };
      else if (m[6]) t = { y: +m[6], m: +m[5] };
      else if (m[8]) t = { y: +m[8], m: +m[7] };
      else if (m[9]) t = { y: +m[9], m: null };
      else if (m[10]) t = { present: true };
      if (t && !t.present && (t.m !== null && (t.m < 1 || t.m > 12) || t.y < 1950 || t.y > now.y + 1)) t = null;
      if (t) out.push({ ...t, start: m.index, end: m.index + m[0].length });
    }
    return { f, toks: out };
  }

  const RANGE_SEP = /^\s*(?:-|–|—|−|a|au|to|->|→|>|\/|jusqu\s?['’]?\s?(?:a|au|en)|until|till)?\s*$/;
  const SINCE = /(depuis|since|des|a partir d[e'’]?|a compter d[e'’]?)\s*(?:le\s+|l['’]\s*)?$/;

  /** Mois de début et de fin retenus : sans mois, début en juillet et fin en juin (milieu d'année), ou janvier à décembre la même année. */
  function settle(s, e) {
    const sameYear = e && s.y === e.y;
    const sm = s.m || (sameYear && !e.m ? 1 : 7);
    const em = e ? e.m || (sameYear ? 12 : 6) : null;
    return { sm, em };
  }
  function build(a, b, current, start, end, now, durationHint) {
    const s = { y: a.y, m: a.m };
    let e = current ? { y: now.y, m: now.m } : b ? { y: b.y, m: b.m } : null;
    if (!e && durationHint) {
      const sm = s.m || 1, idx = s.y * 12 + sm - 1 + durationHint - 1;
      e = { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
      s.m = sm;
    }
    if (!e) return null;
    const { sm, em } = settle(s, current ? null : e);
    const endM = current ? now.m : em;
    const months = e.y * 12 + endM - (s.y * 12 + sm) + 1;
    return {
      start: { y: s.y, m: sm }, end: current ? null : { y: e.y, m: endM }, current: !!current,
      months: months > 0 ? months : null, invalid: months <= 0,
      estimated: !a.m || (!current && !durationHint && !(b && b.m)),
      pos: [start, end],
    };
  }

  /** Plage de dates d'une ligne (« Janv. 2021 – Mars 2023 », « 2019-2020 », « depuis 2023 », « 06/2021 - Présent »…) ou null. */
  function findDateRange(line, now) {
    const N = nowParts(now);
    const { f, toks } = tokens(line, N);
    for (let k = 0; k < toks.length - 1; k++) {
      const a = toks[k], b = toks[k + 1];
      if (a.present) continue;
      if (RANGE_SEP.test(f.slice(a.end, b.start))) return build(a, b.present ? null : b, b.present, a.start, b.end, N);
    }
    for (const a of toks) {
      if (!a.present && SINCE.test(f.slice(Math.max(0, a.start - 16), a.start))) return build(a, null, true, a.start, a.end, N);
    }
    const dur = /(\d{1,2})\s*(?:mois|months?)\b/.exec(f);
    const single = toks.filter((t) => !t.present);
    if (single.length === 1 && dur) return build(single[0], null, false, single[0].start, single[0].end, N, +dur[1]);
    return null;
  }
  /** Toutes les années citées dans une ligne (pour les formations). */
  function yearsIn(line, now) { return tokens(line, nowParts(now)).toks.filter((t) => !t.present).map((t) => t.y); }
  function iso(p) { return p ? p.y + "-" + pad(p.m) + "-01" : null; }

  /** Total de mois en fusionnant les périodes qui se chevauchent (deux postes en même temps ne comptent pas double). */
  function mergedMonths(experiences, now) {
    const N = nowParts(now);
    const iv = experiences.filter((e) => e.duree_mois && e.date_debut).map((e) => {
      const [sy, sm] = e.date_debut.split("-").map(Number);
      const end = e.date_fin ? e.date_fin.split("-").map(Number) : [N.y, N.m];
      return [sy * 12 + sm, end[0] * 12 + end[1]];
    }).sort((a, b) => a[0] - b[0]);
    let total = 0, cur = null;
    for (const [s, e] of iv) {
      if (!cur || s > cur[1] + 1) { if (cur) total += cur[1] - cur[0] + 1; cur = [s, e]; }
      else cur[1] = Math.max(cur[1], e);
    }
    if (cur) total += cur[1] - cur[0] + 1;
    return total;
  }

  /* ================= Rubriques du CV ================= */
  const SECTION_DEFS = [
    ["experience", /^(experiences?|experiences? professionnelles?|experience pro|parcours|parcours professionnel|emplois?|work experience|professional experience|employment|employment history|carriere|historique professionnel)$/],
    ["education", /^(formations?|formation academique|diplomes?|diplomes? et formations?|formations? et diplomes?|education|cursus|cursus universitaire|etudes|parcours academique|parcours scolaire|academic background|qualifications)$/],
    ["skills", /^(competences?|competences? techniques|competences? cles|competences? informatiques|competences? et outils|skills|technical skills|hard skills|savoir faire|outils|logiciels|outils et logiciels|expertises?|informatique|stack technique)$/],
    ["languages", /^(langues?|langues? etrangeres|languages)$/],
    ["certifications", /^(certifications?|certificats?|habilitations?|certifications? et habilitations?)$/],
    ["projects", /^(projets?|projets? personnels|projets? professionnels|projets? academiques|realisations|projects)$/],
    ["summary", /^(profil|profil professionnel|resume|a propos|a propos de moi|about|about me|summary|accroche|objectif|objectif professionnel)$/],
    ["interests", /^(centres? d interets?|loisirs|interets|hobbies|activites|activites extra professionnelles|passions)$/],
    ["volunteering", /^(benevolat|engagements?|engagements? associatifs|vie associative|volunteering)$/],
    ["contact", /^(contact|coordonnees|informations personnelles|infos)$/],
    ["references", /^(references|recommandations)$/],
    ["publications", /^(publications|communications)$/],
  ];
  const SECTION_LABELS = { head: "En-tête", experience: "Expériences", education: "Formation", skills: "Compétences", languages: "Langues", certifications: "Certifications", projects: "Projets", summary: "Profil", interests: "Centres d'intérêt", volunteering: "Engagements", contact: "Coordonnées", references: "Références", publications: "Publications" };

  function headerOf(line) {
    const raw = line.replace(/^[\s\-•*▪●◦·‣–—>#=_|\d.)]+/, "").replace(/[\s:–—\-=_|.]+$/, "");
    if (!raw || raw.length > 48) return null;
    let n = norm(raw).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    if (/^(?:[a-z] )+[a-z]$/.test(n)) n = n.replace(/ /g, ""); // « E X P É R I E N C E S »
    for (const [type, re] of SECTION_DEFS) if (re.test(n) || re.test(n.replace(/ /g, ""))) return type;
    return null;
  }
  function segment(lines) {
    const sections = [{ type: "head", header: "", lines: [] }];
    for (const line of lines) {
      const t = headerOf(line);
      if (t) { sections.push({ type: t, header: line.trim(), lines: [] }); continue; }
      const i = line.indexOf(":");
      if (i > 2 && i < 40) {
        const t2 = headerOf(line.slice(0, i));
        if (t2) { sections.push({ type: t2, header: line.slice(0, i).trim(), lines: [line.slice(i + 1).trim()] }); continue; }
      }
      sections[sections.length - 1].lines.push(line);
    }
    return sections;
  }

  /* ================= Expériences ================= */
  const meaningful = (s) => (s.match(/\p{L}/gu) || []).length >= 2;
  const SPLIT_PARTS = /\s+[–—\-]\s+|\s*\|\s*|\s*[·•]\s*|,\s+|\s+(?:chez|at|@)\s+|\s*\/\s+/i;
  function cleanEdge(s) { return (s || "").replace(/^[\s,;:|–—\-·•()\[\]]+|[\s,;:|–—\-·•()\[\]]+$/g, "").replace(/\s{2,}/g, " ").trim(); }
  function stripRange(text, range) {
    let s = text.slice(0, range.pos[0]) + " " + text.slice(range.pos[1]);
    s = s.replace(/(?:^|\s)(?:depuis|since|de|du|from|des|dès|à partir de)\s*$/i, " ").replace(/^\s*(?:de|du|from)\s+/i, "");
    return cleanEdge(s.replace(/\(\s*\d{1,2}\s*(?:mois|months?)\s*\)/i, " "));
  }
  function pickTitle(parts) {
    const scored = parts.map((p, i) => ({ p, i, t: normalizeJobTitle(p) }));
    const withCode = scored.find((x) => x.t.code);
    return withCode || scored[0];
  }

  function parseExperiences(lines, now, idCandidat) {
    const items = lines.map((text, i) => ({ text: text.trim(), i, bullet: BULLET.test(text.trim()) }));
    items.forEach((it) => { it.range = it.text ? findDateRange(it.text, now) : null; });
    const dated = items.filter((x) => x.range);
    if (!dated.length) return { experiences: [], leftover: items.filter((x) => x.text).map((x) => x.text) };
    const first = items.find((x) => x.text);
    const dateFirst = !!(first && first.range);
    const used = new Set(dated.map((x) => x.i));
    const plan = dated.map((it, k) => {
      const nextI = k + 1 < dated.length ? dated[k + 1].i : items.length;
      const prevI = k > 0 ? dated[k - 1].i : -1;
      let head = stripRange(it.text, it.range), extra = "";
      const colon = head.indexOf(" : ") >= 0 ? head.indexOf(" : ") : head.indexOf(": ");
      if (colon > 0) { extra = head.slice(colon + 1).replace(/^:\s*/, "").trim(); head = cleanEdge(head.slice(0, colon)); }
      let titleLine = null;
      const headHasTitle = meaningful(head) && normalizeJobTitle(head).code;
      if (!headHasTitle) {
        if (dateFirst) {
          const nx = items.slice(it.i + 1, nextI).find((x) => x.text);
          if (nx && !nx.bullet && nx.text.length <= 110 && (!meaningful(head) || normalizeJobTitle(nx.text).code)) titleLine = nx;
        } else {
          for (let j = it.i - 1; j > prevI; j--) {
            const p = items[j];
            if (!p.text) continue;
            if (!p.bullet && p.text.length <= 110 && !used.has(j) && (!meaningful(head) || normalizeJobTitle(p.text).code)) titleLine = p;
            break;
          }
        }
      }
      if (titleLine) used.add(titleLine.i);
      return { it, nextI, head, extra, titleLine };
    });
    const experiences = plan.map(({ it, nextI, head, extra, titleLine }) => {
      const parts = [];
      if (titleLine) cleanEdge(titleLine.text.replace(BULLET, "")).split(SPLIT_PARTS).forEach((p) => p && parts.push(cleanEdge(p)));
      if (meaningful(head)) head.split(SPLIT_PARTS).forEach((p) => p && parts.push(cleanEdge(p)));
      const real = parts.filter(meaningful);
      const t = real.length ? pickTitle(real) : null;
      const company = real.filter((p, i) => !t || i !== t.i).find((p) => !/^\d{5}\b/.test(p)) || "";
      const desc = items.slice(it.i + 1, nextI).filter((x) => x.text && !used.has(x.i)).map((x) => x.text.replace(BULLET, "• "));
      if (extra) desc.unshift(extra);
      const r = it.range;
      return {
        id_candidat: idCandidat,
        intitule_poste: t ? t.p : "",
        intitule_normalise: t && t.t.code ? t.t.code : null,
        entreprise: company,
        date_debut: iso(r.start),
        date_fin: r.current ? null : iso(r.end),
        duree_mois: r.invalid ? null : r.months,
        description_poste: desc.join("\n"),
        est_poste_actuel: r.current,
        dates_estimees: !!r.estimated,
        texte_dates: it.text.slice(r.pos[0], r.pos[1]),
      };
    });
    const firstDated = dated[0].i;
    const leftover = items.filter((x) => x.text && x.i < firstDated && !used.has(x.i)).map((x) => x.text);
    return { experiences, leftover };
  }

  /* ================= Formations ================= */
  function parseFormations(lines, now, idCandidat, strict) {
    const out = [], leftover = [];
    let last = null;
    const items = lines.map((t) => t.trim()).filter(Boolean);
    items.forEach((line, k) => {
      const level = normalizeDegree(line);
      const years = yearsIn(line, now);
      const n = norm(line);
      if (level && (!strict || years.length)) {
        const range = findDateRange(line, now);
        let txt = range ? stripRange(line, range) : line.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, " ");
        const parts = cleanEdge(txt.replace(BULLET, "")).split(SPLIT_PARTS).map(cleanEdge).filter(meaningful);
        const degreeIdx = Math.max(0, parts.findIndex((p) => normalizeDegree(p)));
        const school = parts.find((p, i) => i !== degreeIdx && SCHOOL_RE.test(norm(p))) || parts.find((p, i) => i !== degreeIdx) || "";
        let year = range ? (range.current ? null : range.end.y) : years.length ? Math.max(...years) : null;
        if (year === null && !range) {
          const nb = items[k + 1] && !normalizeDegree(items[k + 1]) ? yearsIn(items[k + 1], now) : [];
          const pb = items[k - 1] && !normalizeDegree(items[k - 1]) ? yearsIn(items[k - 1], now) : [];
          if (pb.length && !findDateRange(items[k - 1], now)) year = Math.max(...pb);
          else if (nb.length) year = Math.max(...nb);
        }
        last = { id_candidat: idCandidat, nom_diplome: parts[degreeIdx] || cleanEdge(txt), niveau_normalized: level, institution: school, annee_obtention: year, en_cours: !!(range && range.current) };
        out.push(last);
      } else if (last && !last.institution && SCHOOL_RE.test(n)) {
        last.institution = cleanEdge(line.replace(BULLET, "").replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, " "));
      } else if (last && last.annee_obtention === null && years.length && line.length < 30) {
        last.annee_obtention = Math.max(...years);
      } else leftover.push(line);
    });
    return { formations: out, leftover };
  }

  /* ================= Candidat ================= */
  const COUNTRIES = ["France", "Belgique", "Suisse", "Luxembourg", "Canada", "Québec", "Maroc", "Algérie", "Tunisie", "Sénégal", "Côte d'Ivoire", "Guinée", "Mali", "Cameroun", "Bénin", "Togo", "Burkina Faso", "Niger", "Gabon", "Congo", "Madagascar", "Haïti", "Allemagne", "Espagne", "Italie", "Portugal", "Royaume-Uni", "Irlande", "Pays-Bas", "États-Unis"];
  const VISA_RE = /(nationalite [a-z]+|citoyen(?:ne)? (?:francais|francaise|europeen|europeenne)|ressortissante? (?:de l )?(?:ue|union europeenne)|titre de sejour[^,.;\n]{0,40}|carte de sejour[^,.;\n]{0,40}|autorisation de travail[^,.;\n]{0,40}|permis de travail[^,.;\n]{0,40}|passeport talent|visa [a-z ]{3,30}|eu citizen|work permit[^,.;\n]{0,30}|right to work[^,.;\n]{0,30})/;

  function parseCandidate(head, all, idCandidat, now) {
    const N = nowParts(now);
    const headText = head.join("\n");
    const zone = head.length ? headText : all.slice(0, 8).join("\n");
    const text = all.join("\n");
    const emails = extractEmails(text);
    const phones = extractPhones(zone).concat(extractPhones(text));
    const phone = phones.find((p) => p.e164);
    // Nom : première ligne courte composée de 2 à 4 mots, sans chiffre ni @
    let nom = "", prenom = "", headline = "";
    const nameLine = (head.length ? head : all.slice(0, 6)).map((l) => l.trim()).find((l) => {
      const w = l.split(/\s+/);
      return w.length >= 2 && w.length <= 4 && l.length <= 45 && !/[\d@:|/]/.test(l) && w.every((x) => /^\p{L}[\p{L}'’\-.]*$/u.test(x)) && !normalizeJobTitle(l).code && !headerOf(l);
    });
    if (nameLine) {
      const w = nameLine.trim().split(/\s+/);
      const upper = w.filter((x) => x.length > 1 && x === x.toUpperCase() && /\p{Lu}/u.test(x));
      if (upper.length && upper.length < w.length) { nom = upper.join(" "); prenom = w.filter((x) => !upper.includes(x)).join(" "); }
      else { prenom = w[0]; nom = w.slice(1).join(" "); }
    }
    const titleLine = (head.length ? head : all.slice(0, 8)).find((l) => normalizeJobTitle(l).code && l.length <= 90);
    if (titleLine) headline = titleLine.trim();
    // Localisation : code postal + ville, ou « Ville (35) »
    let ville = "", code_postal = "", pays = "";
    const pc = /(?<!\d)(\d{5})\s+([\p{Lu}][\p{L}'’\-]+(?:[ \-][\p{L}'’\-]+){0,3})/u.exec(zone) || /(?<!\d)(\d{5})\s+([\p{Lu}][\p{L}'’\-]+(?:[ \-][\p{L}'’\-]+){0,3})/u.exec(text.slice(0, 600));
    if (pc) { code_postal = pc[1]; ville = pc[2].replace(/\s+(France|FR)$/i, "").trim(); pays = "France"; }
    else {
      const dep = /([\p{Lu}][\p{L}'’\-]+(?:[ \-][\p{Lu}][\p{L}'’\-]+)*)\s*\((\d{2,3}|2A|2B)\)/u.exec(zone);
      if (dep) { ville = dep[1]; pays = "France"; }
    }
    const foundCountry = COUNTRIES.find((c) => new RegExp("(^|[^\\p{L}])" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\p{L}]|$)", "u").test(zone));
    if (foundCountry) pays = foundCountry;
    if (!pays && phone && phone.e164.startsWith("+33")) pays = "France";
    const n = norm(text);
    const visa = VISA_RE.exec(n);
    // Prétentions salariales (annuelles, en euros)
    let salaire = null;
    const sal = /(pretentions?(?: salariales?)?|salaire (?:souhaite|attendu|vise)|remuneration souhaitee|salary expectations?)\s*(?:[:\-]|de)?\s*(\d{2,3}(?:[ .]?\d{3})?)\s*(k)?/.exec(n);
    if (sal) { let v = Number(sal[2].replace(/[ .]/g, "")); if (sal[3] || v < 1000) v *= 1000; salaire = v; }
    // Disponibilité
    let dispo = null;
    if (/(disponible immediatement|disponibilite immediate|disponible des maintenant|immediately available)/.test(n)) dispo = N.y + "-" + pad(N.m) + "-" + pad(N.d.getDate());
    else {
      const d = /(?:disponible|disponibilite|available)[^.\n]{0,25}?(?:a partir d[eu]?|des|le|en|a compter d[eu]?|from|:)\s*(?:le\s+)?((?:\d{1,2}(?:er)?\s+)?[a-z]+\.?\s+(?:19|20)\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-](?:19|20)\d{2}|\d{1,2}[/.\-](?:19|20)\d{2})/.exec(n);
      if (d) {
        const t = tokens(d[1], N).toks[0];
        const day = /^(\d{1,2})(?:er)?\s+[a-z]/.exec(d[1]) || /^(\d{1,2})[/.\-]\d{1,2}[/.\-]/.exec(d[1]);
        if (t && !t.present && t.m) dispo = t.y + "-" + pad(t.m) + "-" + pad(day ? Math.min(31, +day[1]) : 1);
      }
      const pre = /preavis (?:de )?(\d{1,2}) mois/.exec(n);
      if (!dispo && pre) { const x = new Date(N.d); x.setMonth(x.getMonth() + +pre[1]); dispo = x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); }
    }
    return {
      candidat: {
        id: idCandidat, nom, prenom, email: emails.valid[0] || null, telephone: phone ? phone.e164 : null,
        localisation: { ville, code_postal, pays }, statut_visa: visa ? visa[1].trim() : null,
        salaire_souhaite: salaire, date_disponibilite: dispo, cv_texte_brut: text,
      },
      headline, emails, phones,
    };
  }

  /* ================= Compétences : récence et contexte ================= */
  function snippet(line) { const s = line.replace(BULLET, "").trim(); return s.length > 160 ? s.slice(0, 157) + "…" : s; }
  function count(re, text) { if (!text) return 0; re.lastIndex = 0; const m = text.match(re); return m ? m.length : 0; }

  function parseSkills(text, experiences, formations, sections, idCandidat, now) {
    const N = nowParts(now);
    const out = [];
    for (const s of ATS.SKILL_MATCHERS || []) {
      if (!count(s.re, text)) continue;
      let recence = null, ctx = "", months = [];
      for (const e of experiences) {
        const body = e.intitule_poste + "\n" + e.description_poste;
        if (!count(s.re, body)) continue;
        const y = e.est_poste_actuel ? N.y : e.date_fin ? +e.date_fin.slice(0, 4) : null;
        if (y && (recence === null || y > recence)) recence = y;
        if (!ctx) {
          const l = e.description_poste.split("\n").find((x) => count(s.re, x));
          ctx = l ? (e.intitule_poste ? e.intitule_poste + " : " : "") + snippet(l) : e.intitule_poste;
        }
        months.push(e);
      }
      for (const f of formations) {
        if (count(s.re, f.nom_diplome + " " + f.institution) && f.annee_obtention && (recence === null || f.annee_obtention > recence)) recence = Math.min(f.annee_obtention, N.y);
      }
      // Ligne datée hors expériences (projets, formations…)
      for (const sec of sections) {
        for (const line of sec.lines) {
          if (!count(s.re, line)) continue;
          const r = findDateRange(line, N);
          if (r) { const y = r.current ? N.y : r.end.y; if (recence === null || y > recence) recence = Math.min(y, N.y); }
          if (!ctx) ctx = snippet(line);
        }
      }
      out.push({ id_candidat: idCandidat, nom_skill: s.label, categorie: s.cat, recence_annee: recence, contexte_texte: ctx, mois_experience: mergedMonths(months, N), experiences: months.length });
    }
    return out;
  }

  /** Coefficient de récence : année en cours 1,5 ; il y a 4 ans 1,0 ; plus de 4 ans 0,5 ; inconnue 1,0. */
  function recencyCoef(year, now) {
    if (!year) return 1;
    const age = nowParts(now).y - year;
    if (age <= 0) return 1.5;
    if (age > 4) return 0.5;
    return Math.round((1.5 - 0.125 * age) * 1000) / 1000;
  }

  /* ================= Lecture complète ================= */
  function cleanText(text) {
    return String(text || "").normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[   ]/g, " ")
      .replace(/[​-‍﻿]/g, "").replace(/\t/g, "  ").replace(/[ ]{3,}/g, "  ");
  }

  /**
   * @param text  texte brut du CV
   * @param opts  { id, now }  (now : date de référence, pour les tests)
   */
  function parseCV(text, opts) {
    const o = opts || {};
    const now = o.now || new Date();
    const id = o.id || null;
    const clean = cleanText(text);
    const lines = clean.split("\n");
    const sections = segment(lines);
    const known = sections.filter((s) => s.type !== "head");
    const unparsed = [];
    const issues = [];
    const keep = (sec, reason, txtLines) => {
      const t = (txtLines || sec.lines).map((l) => l.trim()).filter(Boolean).join("\n");
      if (t && meaningful(t)) unparsed.push({ section: sec.type, header: sec.header || SECTION_LABELS[sec.type] || "", reason, text: t });
    };

    let experiences = [], formations = [];
    const expSecs = known.filter((s) => s.type === "experience" || s.type === "volunteering");
    const eduSecs = known.filter((s) => s.type === "education");
    for (const sec of expSecs) {
      const r = parseExperiences(sec.lines, now, id);
      if (!r.experiences.length) { if (sec.type === "experience") { keep(sec, "Aucune expérience datée n'a pu être découpée"); issues.push({ code: "exp_unparsed", level: "high" }); } }
      else { experiences.push(...r.experiences); if (r.leftover.length) keep(sec, "Lignes non rattachées à une expérience", r.leftover); }
    }
    for (const sec of eduSecs) {
      const r = parseFormations(sec.lines, now, id, false);
      if (!r.formations.length) { keep(sec, "Aucun diplôme reconnu"); issues.push({ code: "edu_unparsed", level: "mid" }); }
      else { formations.push(...r.formations); if (r.leftover.length) keep(sec, "Lignes non rattachées à un diplôme", r.leftover); }
    }
    // Repli : pas de rubrique Expériences ou Formation reconnue → recherche dans tout le texte
    if (!expSecs.some((s) => s.type === "experience") || !eduSecs.length) {
      const pool = sections.filter((s) => !["education", "experience", "volunteering", "skills", "languages", "interests"].includes(s.type));
      const poolLines = pool.flatMap((s) => s.lines);
      if (!eduSecs.length) {
        const fr = parseFormations(poolLines, now, id, true);
        formations.push(...fr.formations);
      }
      if (!expSecs.some((s) => s.type === "experience")) {
        const nonDegree = poolLines.map((l) => (normalizeDegree(l) ? "" : l));
        const r = parseExperiences(nonDegree, now, id);
        experiences.push(...r.experiences);
        issues.push({ code: "no_exp_section", level: "high" });
      }
      if (!known.length) { keep({ type: "head", header: "CV entier", lines }, "Aucune rubrique standard repérée : le CV n'a pas pu être découpé"); issues.push({ code: "no_sections", level: "high" }); }
    }
    const cand = parseCandidate(sections[0].lines.filter((l) => l.trim()), lines.filter((l) => l.trim()), id, now);
    const competences = parseSkills(clean, experiences, formations, sections, id, now);

    if (!cand.emails.valid.length) issues.push({ code: cand.emails.invalid.length ? "email_invalid" : "email_missing", level: "high", detail: cand.emails.invalid[0] });
    if (!cand.candidat.telephone) issues.push({ code: cand.phones.length ? "phone_invalid" : "phone_missing", level: cand.phones.length ? "mid" : "high", detail: cand.phones[0] && cand.phones[0].raw });
    if (!cand.candidat.nom && !cand.candidat.prenom) issues.push({ code: "name_missing", level: "mid" });
    const undated = experiences.filter((e) => !e.duree_mois).length;
    if (undated) issues.push({ code: "exp_invalid_dates", level: "mid", count: undated });
    const est = experiences.filter((e) => e.dates_estimees).length;
    if (est) issues.push({ code: "dates_estimated", level: "low", count: est });
    const noTitle = experiences.filter((e) => !e.intitule_poste).length;
    if (noTitle) issues.push({ code: "exp_no_title", level: "mid", count: noTitle });

    const levels = formations.map((f) => LEVEL_RANK[f.niveau_normalized]).filter((x) => x !== undefined);
    const maxRank = levels.length ? Math.max(...levels) : null;
    return {
      candidat: cand.candidat,
      headline: cand.headline,
      headline_normalise: cand.headline ? normalizeJobTitle(cand.headline).code : null,
      experiences, formations, competences,
      sections: sections.map((s) => ({ type: s.type, header: s.header, lignes: s.lines.filter((l) => l.trim()).length })).filter((s) => s.type !== "head" || s.lignes),
      unparsed_blocks: unparsed,
      unparsed_rich_text: unparsed.map((b) => b.text).join("\n\n"),
      total_experience_mois: mergedMonths(experiences, now),
      niveau_max: maxRank === null ? null : Object.keys(LEVEL_RANK).find((k) => LEVEL_RANK[k] === maxRank),
      niveau_rang: maxRank,
      issues,
    };
  }

  function familyOf(code) { const t = TITLES.find((x) => x[0] === code); return t ? t[2] : null; }

  ATS.profile = {
    parseCV, toE164, extractPhones, isValidEmail, extractEmails, normalizeJobTitle, normalizeDegree, familyOf,
    findDateRange, yearsIn, mergedMonths, recencyCoef, headerOf, LEVEL_RANK, TITLES, SECTION_LABELS,
  };
})();
