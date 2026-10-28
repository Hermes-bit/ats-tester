/* ATS Tester — lecture de l'offre : exigences et questions éliminatoires
 * Repère dans la fiche de poste ce qu'un ATS transforme en filtres :
 *   - années d'expérience demandées (en général ou sur une compétence : « 3 ans d'expérience en Python ») ;
 *   - niveau de diplôme (« Bac+5 exigé ») ;
 *   - permis, autorisation de travail, habilitation, langues, management, certifications.
 * Les critères impératifs deviennent des questions éliminatoires : un « non » fait passer la candidature
 * à DISQUALIFIED_AUTO, comme dans un vrai ATS.
 * Dépend de analyzer.js et profile.js.
 */
window.ATS = window.ATS || {};

(function () {
  const norm = (s) => ATS.norm(s);
  const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10 };
  const REQUIRED = /(minimum|au moins|exige|exigee|obligatoire|imperati|indispensable|requis|requise|necessaire|prerequis|must have|required|mandatory|essentiel)/;
  const NICE = /(un plus|est un plus|serait (?:un )?(?:plus|apprecie)|apprecie|appreciee|idealement|souhaite|souhaitee|souhaitable|nice to have|is a plus|bonus|optionnel|atout|serait un avantage)/;

  function sentences(jd) {
    return (jd || "").split(/\n+|(?<=[.;!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }
  function digits(n) {
    // Deux passes : « trois à cinq ans » → « trois à 5 ans » → « 3 à 5 ans »
    return wordsToDigits(wordsToDigits(n));
  }
  function wordsToDigits(n) {
    return n.replace(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|one|two|three|four|five|seven|eight|nine|ten)\b(?=\s*(?:a\s*\d+\s*)?(?:ans?|annees?|years?)\b)/g, (w) => NUM_WORDS[w]);
  }
  function skillsIn(text, kw) {
    const found = [];
    const pools = [kw ? kw.skills : [], ATS.SKILL_MATCHERS || []];
    for (const pool of pools) {
      for (const s of pool) {
        s.re.lastIndex = 0;
        if (s.re.test(text) && !found.includes(s.label)) found.push(s.label);
      }
      if (found.length) break;
    }
    return found;
  }

  /* ---------- Années d'expérience ---------- */
  const EXP_PATTERNS = [
    /(\d{1,2})\s*(?:\+\s*)?(?:a\s*\d{1,2}\s*)?(?:ans?|annees?)\s+(?:minimum\s+|au moins\s+)?(?:d|de)\s+(?:une\s+)?experiences?((?:\s+(?:minimum|significative|reussie|confirmee|professionnelle|similaire|equivalente|probante|solide))*)(?:\s+(?:en|sur|dans|avec|sous|de|du|des|d|comme|en tant que|au sein d[eu]?)\s+([^,.;:()]{2,80}))?/,
    /experiences?\s+(?:(?:professionnelle|significative|reussie|confirmee|similaire|solide)\s+)*(?:de|d au moins|minimum de|minimum|d une duree de|superieure a|d environ)\s+(\d{1,2})\s*(?:a\s*\d{1,2}\s*)?(?:ans?|annees?)(\s+(?:minimum|au moins))?(?:\s+(?:en|sur|dans|avec|sous|comme|en tant que)\s+([^,.;:()]{2,80}))?/,
    /(\d{1,2})\s*\+?\s*years?\s+(?:of\s+)?(?:professional\s+|relevant\s+|proven\s+)?experience()(?:\s+(?:in|with|on|as)\s+([^,.;:()]{2,80}))?/,
    /(?:minimum|au moins)\s+(\d{1,2})\s*(?:ans?|annees?)(\s+d\s+experiences?)(?:\s+(?:en|sur|dans|avec|comme)\s+([^,.;:()]{2,80}))?/,
  ];
  function experienceReqs(sents, kw) {
    const out = [];
    for (const s of sents) {
      const n = digits(norm(s));
      for (const re of EXP_PATTERNS) {
        const m = re.exec(n);
        if (!m) continue;
        const years = +m[1];
        if (!years || years > 30) break;
        const domain = (m[3] || "").trim();
        const skills = domain ? skillsIn(domain, kw) : [];
        const nice = NICE.test(n);
        const key = years + "|" + skills.join(",");
        if (!out.some((x) => x.key === key)) {
          out.push({ key, years, skills, domain, text: s, knockout: REQUIRED.test(n) && !nice, nice });
        }
        break;
      }
    }
    return out;
  }

  /* ---------- Diplôme ---------- */
  function degreeReq(sents) {
    let best = null;
    for (const s of sents) {
      const n = norm(s);
      const bacs = [...n.matchAll(/bac\s*\+\s*(\d)/g)].map((m) => +m[1]).filter((x) => x >= 2 && x <= 8);
      let rank = bacs.length ? Math.min(...bacs) : null;
      if (rank === null && /(formation|diplome|titulaire|niveau|issue?|cursus|degree|etudes|profil)/.test(n)) {
        const lvl = ATS.profile.normalizeDegree(s);
        if (lvl && lvl !== "Bac" && lvl !== "Infra-bac") rank = ATS.profile.LEVEL_RANK[lvl];
      }
      if (rank === null) continue;
      if (!best || rank < best.rank) {
        const level = Object.keys(ATS.profile.LEVEL_RANK).find((k) => ATS.profile.LEVEL_RANK[k] === rank) || "Bac+" + rank;
        best = { rank, level, text: s, knockout: REQUIRED.test(n) && !NICE.test(n), nice: NICE.test(n) };
      }
    }
    return best;
  }

  /* ---------- Langues et certifications ---------- */
  const LANGS = [["Anglais", /(anglais|english)/], ["Allemand", /(allemand|german)/], ["Espagnol", /(espagnol|spanish)/], ["Italien", /(italien|italian)/], ["Portugais", /(portugais|portuguese)/], ["Néerlandais", /(neerlandais|dutch)/], ["Arabe", /(arabe|arabic)/], ["Chinois", /(chinois|mandarin|chinese)/]];
  const LEVEL_WORDS = /(courant|bilingue|professionnel|operationnel|technique|lu ecrit parle|fluent|native|maternelle|\b[abc][12]\b|toeic\s*\d{3})/;
  function languages(sents) {
    const out = [];
    for (const s of sents) {
      const n = norm(s);
      for (const [lang, re] of LANGS) {
        if (!re.test(n) || out.some((x) => x.lang === lang)) continue;
        if (!LEVEL_WORDS.test(n) && !/(langue|maitrise|niveau|parle|ecrit|pratique)/.test(n)) continue;
        const lv = LEVEL_WORDS.exec(n);
        out.push({ lang, level: lv ? lv[1] : "", text: s, knockout: REQUIRED.test(n) && !NICE.test(n), nice: NICE.test(n), re });
      }
    }
    return out;
  }
  const CERTS = [
    ["PMP", ["pmp"]], ["PRINCE2", ["prince2", "prince 2"]], ["ITIL", ["itil"]],
    ["Scrum Master (PSM / CSM)", ["psm", "csm", "professional scrum master", "certified scrummaster", "scrum master certifie"]],
    ["TOEIC", ["toeic"]], ["TOEFL", ["toefl"]], ["IELTS", ["ielts"]],
    ["AWS Certified", ["aws certified", "certification aws"]], ["Microsoft Azure", ["az 900", "azure fundamentals", "certification azure"]],
    ["Esri Technical Certification", ["esri technical certification", "certification esri", "certifie esri"]],
    ["Télépilote de drone", ["telepilote", "brevet de telepilote", "certificat de telepilote", "pilote de drone"]],
    ["CACES", ["caces"]], ["SST", ["sauveteur secouriste du travail", "sst"]], ["Habilitation électrique", ["habilitation electrique"]],
    ["AIPR", ["aipr"]], ["Certificat Voltaire", ["certificat voltaire", "projet voltaire"]], ["FME Certified", ["fme certified", "certification fme"]],
  ];
  let CERT_RE = null;
  function certMatchers() { if (!CERT_RE) CERT_RE = CERTS.map(([label, aliases]) => ({ label, re: ATS.makeRegex(aliases) })); return CERT_RE; }
  function certifications(sents) {
    const out = [];
    for (const s of sents) {
      for (const c of certMatchers()) {
        c.re.lastIndex = 0;
        if (c.re.test(s) && !out.some((x) => x.label === c.label)) out.push({ label: c.label, re: c.re, text: s, nice: NICE.test(norm(s)) });
      }
    }
    return out;
  }

  const MANAGEMENT_OFFER = /(management d equipe|manager (?:une|l|son) equipe|encadr\w* (?:d une |une |l |d |des )?(?:equipe|collaborateurs|techniciens|personnes|agents)|encadrement|piloter (?:une |l )?equipe|animer (?:une |l )?equipe|chef d equipe|responsable d equipe|team lead|people management|managerial|management hierarchique|management fonctionnel)/;
  const MANAGEMENT_CV = /(encadr|management|manager (?:une |l |d )?equipe|chef d equipe|responsable d equipe|team lead|tutorat|tuteur|tutrice|pilotage d (?:une )?equipe|animation d (?:une )?equipe|supervis|manage(?:d|ment)? a team|coordination d (?:une )?equipe)/;
  const LICENCE = /(permis b\b|permis de conduire|permis vl|driving licen[cs]e|permis auto)/;
  const WORK_AUTH = /(autorisation de travail|permis de travail|titre de sejour|nationalite (?:francaise|europeenne)|ressortissante? (?:de l )?(?:ue|union europeenne)|eligible a travailler|right to work|work permit|visa sponsorship|droit de travailler)/;
  const CLEARANCE = /(habilitation (?:secret |confidentiel |tres secret )?defense|habilitable|eligible a (?:une |l )?habilitation|security clearance|habilitation (?:de )?securite)/;

  /** Exigences de l'offre. */
  ATS.analyzeOffer = function (jdText, title, kw) {
    const sents = sentences(jdText);
    const all = norm(jdText);
    const titleSrc = (title || "").trim() || (jdText || "").split("\n").find((l) => l.trim()) || "";
    const find = (re) => sents.find((s) => re.test(norm(s)));
    const licence = find(LICENCE), auth = find(WORK_AUTH), clearance = find(CLEARANCE);
    return {
      title: titleSrc,
      title_norm: ATS.profile.normalizeJobTitle(titleSrc),
      experience: experienceReqs(sents, kw),
      degree: degreeReq(sents),
      languages: languages(sents),
      certifications: certifications(sents),
      management: MANAGEMENT_OFFER.test(all),
      licence: licence ? { text: licence, knockout: !NICE.test(norm(licence)), nice: NICE.test(norm(licence)) } : null,
      workAuth: auth ? { text: auth } : null,
      clearance: clearance ? { text: clearance } : null,
    };
  };
  ATS.MANAGEMENT_CV = MANAGEMENT_CV;

  /* ---------- Questions éliminatoires ---------- */
  const yrs = (m) => {
    if (m === null || m === undefined) return "?";
    const y = Math.floor(m / 12), r = m % 12;
    return (y ? y + " an" + (y > 1 ? "s" : "") : "") + (y && r ? " " : "") + (r || !y ? r + " mois" : "");
  };
  ATS.formatMonths = yrs;

  /**
   * @param offer    résultat de ATS.analyzeOffer
   * @param profile  résultat de ATS.profile.parseCV (ou null sans CV)
   * @param answers  réponses du candidat { id: true | false }
   * @returns { items, status: "OK" | "DISQUALIFIED_AUTO", failed }
   */
  ATS.evaluateKnockouts = function (offer, profile, cvText, answers) {
    const ans = answers || {};
    const n = norm(cvText || "");
    const items = [];
    const add = (id, question, source, auto, detected) => {
      const answer = ans[id] === true || ans[id] === false ? ans[id] : null;
      const value = answer !== null ? answer : auto;
      items.push({ id, question, source: source || "", auto, detected: detected || "", answer, status: value === true ? "pass" : value === false ? "fail" : "unknown" });
    };

    // Autorisation de travail : posée par presque tous les ATS
    const visa = profile && profile.candidat.statut_visa;
    const visaAuto = visa ? (/(en attente|en cours|sponsor|recherche)/.test(visa) ? null : true) : null;
    add("work_auth", "As-tu le droit de travailler dans le pays du poste (nationalité, titre de séjour ou visa) ?",
      offer.workAuth ? offer.workAuth.text : "Question standard des ATS", visaAuto, visa ? "Trouvé dans ton CV : « " + visa + " »" : "");

    if (offer.licence && offer.licence.knockout) {
      const has = LICENCE.test(n);
      add("licence", "As-tu le permis B ?", offer.licence.text, has ? true : null, has ? "Permis mentionné dans ton CV" : "Permis non mentionné dans ton CV");
    }
    if (offer.clearance) {
      const has = /habilit/.test(n);
      add("clearance", "Peux-tu obtenir une habilitation défense (nationalité requise) ?", offer.clearance.text, has ? true : null, has ? "Habilitation mentionnée dans ton CV" : "");
    }
    if (offer.degree && offer.degree.knockout) {
      const r = profile ? profile.niveau_rang : null;
      add("degree", "As-tu un diplôme de niveau " + offer.degree.level + " ou plus ?", offer.degree.text,
        r === null ? null : r >= offer.degree.rank,
        r === null ? "Aucun diplôme reconnu dans ton CV" : "Plus haut diplôme lu : " + profile.niveau_max);
    }
    for (const req of offer.experience.filter((x) => x.knockout)) {
      const need = req.years * 12;
      let months = null, label = "au total";
      if (req.skills.length && profile) {
        const comps = profile.competences.filter((c) => req.skills.includes(c.nom_skill));
        label = "en " + req.skills.join(" / ");
        if (!comps.length) months = 0;
        else { const m = Math.max(...comps.map((c) => c.mois_experience || 0)); months = m || null; }
      } else if (profile && profile.experiences.some((e) => e.duree_mois)) months = profile.total_experience_mois;
      add("exp_" + req.years + "_" + (req.skills.join("_") || "total"),
        "As-tu au moins " + req.years + " an" + (req.years > 1 ? "s" : "") + " d'expérience " + (req.skills.length ? "en " + req.skills.join(" / ") : req.domain ? "en " + req.domain : "professionnelle") + " ?",
        req.text, months === null ? null : months >= need,
        months === null ? "Durée non vérifiable : dates absentes ou compétence citée hors expériences" : "Lu dans ton CV : " + yrs(months) + " " + label);
    }
    for (const l of offer.languages.filter((x) => x.knockout)) {
      const has = l.re.test(n);
      add("lang_" + l.lang, "Parles-tu " + l.lang.toLowerCase() + (l.level ? " (niveau " + l.level + ")" : "") + " ?", l.text, has ? true : null, has ? l.lang + " mentionné dans ton CV" : l.lang + " non mentionné dans ton CV");
    }
    const failed = items.filter((x) => x.status === "fail");
    return { items, status: failed.length ? "DISQUALIFIED_AUTO" : "OK", failed };
  };
})();
