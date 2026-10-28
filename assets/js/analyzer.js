/* ATS Tester — moteur d'analyse
 * Simule le travail d'un logiciel de tri (ATS) :
 *   1. repère les mots-clés de la fiche de poste (compétences, outils, formats, savoir-être, termes récurrents) ;
 *   2. vérifie leur présence dans le CV et la lettre (insensible aux accents, majuscules et pluriels) ;
 *   3. contrôle la lisibilité et la structure des documents ;
 *   4. calcule un score et des recommandations.
 * C'est une simulation : chaque ATS du marché a ses propres règles.
 */
window.ATS = window.ATS || {};

(function () {
  const ACCENTS = { a: "aàáâäã", c: "cç", e: "eéèêë", i: "iíìîï", o: "oóòôöõ", u: "uúùûü", y: "yÿ", n: "nñ" };

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/œ/g, "oe").replace(/æ/g, "ae")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[’'`´]/g, " ")
      .replace(/[^a-z0-9+#./\-\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  ATS.norm = norm;

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }

  /** Construit une regex insensible aux accents, à la casse et au pluriel, à partir d'un alias normalisé. */
  function aliasPattern(alias) {
    const tokens = norm(alias).split(" ").filter(Boolean);
    const parts = tokens.map((tok) => {
      let base = tok, plural = "";
      if (/[a-z]{4,}$/.test(tok) && /[sx]$/.test(tok)) { base = tok.slice(0, -1); plural = "(?:s|x)?"; }
      else if (/[a-z]{4,}$/.test(tok)) { plural = "(?:s|x)?"; }
      let out = "";
      for (let i = 0; i < base.length; i++) {
        const ch = base[i];
        if (ch === "o" && base[i + 1] === "e") { out += "(?:oe|œ)"; i++; continue; }
        if (ACCENTS[ch]) out += "[" + ACCENTS[ch] + "]";
        else out += escapeRe(ch);
      }
      return out + plural;
    });
    return parts.join("[\\s\\-’'`]+");
  }

  function buildBody(aliases) { return aliases.map(aliasPattern).join("|"); }
  function regexFromBody(body) { return new RegExp("(?<![\\p{L}\\p{N}])(?:" + body + ")(?![\\p{L}\\p{N}])", "giu"); }
  function buildRegex(aliases) { return regexFromBody(buildBody(aliases)); }

  // Compilation unique du dictionnaire
  const COMPILED = ATS.SKILLS.map((s) => { const body = buildBody(s.aliases); return { ...s, body, re: regexFromBody(body) }; });
  // Partagés avec la lecture du CV (profile.js) et de l'offre (offer.js)
  ATS.SKILL_MATCHERS = COMPILED;
  ATS.makeRegex = buildRegex;

  function count(re, text) {
    if (!text) return 0;
    re.lastIndex = 0;
    const m = text.match(re);
    return m ? m.length : 0;
  }

  const BONUS_RE = /(un plus|est un plus|serait (un )?(plus|apprecie)|appreci|idealement|souhaite|souhaitable|nice to have|is a plus|bonus|optionnel)/;

  function words(text) { return (text.match(/[\p{L}\p{N}][\p{L}\p{N}\-]*/gu) || []); }

  /** Mots-clés de la fiche de poste */
  ATS.extractJobKeywords = function (jdText, title) {
    const lines = (jdText || "").split(/\n+/);
    const titleNorm = norm(title || "");
    const skills = [];
    // Découpe chaque ligne en segments (« X et Y est un plus » : seul Y est un atout facultatif)
    const segments = [];
    for (const line of lines) {
      for (const seg of line.split(/\s+(?:et|and|ou)\s+|\s*\+\s*|;/i)) segments.push(seg);
    }
    for (const s of COMPILED) {
      let total = 0, inRequired = 0;
      for (const seg of segments) {
        const c = count(s.re, seg);
        if (!c) continue;
        total += c;
        if (!BONUS_RE.test(norm(seg))) inRequired += c;
      }
      const inTitle = titleNorm && count(s.re, title) > 0;
      if (!total && !inTitle) continue;
      const bonus = total > 0 && inRequired === 0 && !inTitle;
      let weight = 1 + 0.5 * Math.min(Math.max(total - 1, 0), 2) + (inTitle ? 1 : 0);
      if (bonus) weight *= 0.6;
      skills.push({ label: s.label, cat: s.cat, count: total, weight, bonus, re: s.re, body: s.body, key: "s:" + s.label });
    }
    // Supprime les doublons englobés (ex. "ArcGIS" si "ArcGIS Pro" est déjà là et que "ArcGIS" n'apparaît pas seul)
    const labels = new Set(skills.map((s) => s.label));
    const filtered = skills.filter((s) => {
      if (s.label === "FME" && (labels.has("FME Form") || labels.has("FME Flow"))) return s.count > countSub(skills, ["FME Form", "FME Flow"]);
      if (s.label === "ArcGIS" && [...labels].some((l) => l.startsWith("ArcGIS ") )) return s.count > countSub(skills, [...labels].filter((l) => l.startsWith("ArcGIS ")));
      return true;
    });

    // Termes récurrents hors dictionnaire
    let rest = jdText || "";
    for (const s of filtered) { s.re.lastIndex = 0; rest = rest.replace(s.re, " | "); }
    const toks = [];
    for (const w of rest.split(/[|\n.;:!?()•·●\-–—,]+/)) {
      const ws = words(w).map((x) => ({ raw: x.toLowerCase(), n: norm(x) }));
      toks.push(ws, null);
    }
    const uni = new Map(), bi = new Map();
    const ok = (t) => t && t.n.length >= 4 && !ATS.STOPWORDS.has(t.n) && !/^\d+$/.test(t.n);
    for (const seg of toks) {
      if (!seg) continue;
      for (let i = 0; i < seg.length; i++) {
        const t = seg[i];
        if (!ok(t)) continue;
        const u = uni.get(t.n) || { label: t.raw, n: t.n, count: 0 }; u.count++; uni.set(t.n, u);
        const nx = seg[i + 1];
        if (ok(nx)) {
          const key = t.n + " " + nx.n;
          const b = bi.get(key) || { label: t.raw + " " + nx.raw, n: key, count: 0 }; b.count++; bi.set(key, b);
        }
      }
    }
    const others = [];
    const bis = [...bi.values()].filter((b) => b.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6);
    others.push(...bis);
    const usedTok = new Set(bis.flatMap((b) => b.n.split(" ")));
    const unis = [...uni.values()].filter((u) => u.count >= 2 && !usedTok.has(u.n)).sort((a, b) => b.count - a.count);
    for (const u of unis) { if (others.length >= 12) break; others.push(u); }
    for (const o of others) { o.body = buildBody([o.n]); o.re = regexFromBody(o.body); o.key = "o:" + o.n; o.weight = 1; o.cat = "other"; }

    return { skills: filtered, others };
  };

  function countSub(skills, names) {
    return skills.filter((s) => names.includes(s.label)).reduce((a, s) => a + s.count, 0);
  }

  function titleCoverage(title, text) {
    if (!title || !text) return { ratio: 0, exact: false, tokens: [] };
    const toks = norm(title).split(/[\s/]+/).filter((t) => t.length >= 3 && !ATS.STOPWORDS.has(t) && t !== "h/f");
    if (!toks.length) return { ratio: 1, exact: true, tokens: [] };
    const exact = count(buildRegex([norm(title).replace(/\(?h\s*\/\s*f\)?/g, "").replace(/\s*\/\s*/g, " ").trim()]), text.replace(/\s*\/\s*/g, " ")) > 0;
    const found = toks.filter((t) => count(buildRegex([t]), text) > 0);
    return { ratio: found.length / toks.length, exact, tokens: toks, found };
  }

  function wordCount(text) { return words(text || "").length; }

  function check(id, label, status, detail, points, max, advice) {
    return { id, label, status, detail, points, max, advice: status === "ok" ? "" : advice || "" };
  }

  function sum(arr, f) { return arr.reduce((a, x) => a + f(x), 0); }

  /** Couverture des mots-clés pour un texte */
  function coverage(kw, text, ignored) {
    const res = [];
    for (const k of [...kw.skills, ...kw.others]) {
      if (ignored.has(k.key)) continue;
      res.push({ key: k.key, label: k.label, cat: k.cat, weight: k.weight, bonus: !!k.bonus, jdCount: k.count, found: count(k.re, text) });
    }
    return res;
  }

  function ratio(items) {
    const tot = sum(items, (x) => x.weight);
    if (!tot) return null;
    return sum(items.filter((x) => x.found > 0), (x) => x.weight) / tot;
  }

  function blend(parts) { // parts: [[value|null, weight], ...]
    const valid = parts.filter(([v]) => v !== null);
    const w = sum(valid, ([, wt]) => wt);
    return w ? sum(valid, ([v, wt]) => v * wt) / w : 0;
  }

  /* ---------- Score en 3 piliers ----------
   * 1. Compétences techniques requises : 50 %. Chaque compétence trouvée vaut son poids × coefficient de récence
   *    (année en cours 1,5 ; plus de 4 ans 0,5 ; inconnue 1,0) × facteur de durée si l'offre demande X ans.
   * 2. Contexte et savoir-être : 30 % (intitulé de poste normalisé, années d'expérience, management, savoir-être, vocabulaire de l'offre).
   * 3. Atouts et certifications : 20 % (compétences « un plus », certifications, langues, diplôme).
   * Un pilier sans critère dans l'offre est marqué « non applicable » et son poids est réparti sur les autres.
   */
  const HARD_CATS = new Set(["tools", "tech", "formats", "methods"]);
  const PILLAR_WEIGHTS = { hard: 0.5, context: 0.3, nice: 0.2 };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  function cappedCredit(items) {
    const tot = sum(items, (x) => x.weight);
    return tot ? Math.min(1, sum(items, (x) => x.weight * x.credit) / tot) : null;
  }
  function blendNull(parts) {
    const valid = parts.filter(([v]) => v !== null && v !== undefined);
    return valid.length ? blend(valid) : null;
  }

  function scorePillars(cov, profile, offer, text, ctx) {
    const n = norm(text);
    const comp = new Map(profile.competences.map((c) => [c.nom_skill, c]));
    const skillReq = new Map(), general = [];
    for (const r of offer.experience) {
      if (r.skills.length) r.skills.forEach((l) => { if (!skillReq.has(l) || skillReq.get(l).years < r.years) skillReq.set(l, r); });
      else general.push(r);
    }
    const credit = (c) => {
      const k = comp.get(c.label);
      const year = k ? k.recence_annee : null;
      const coef = ATS.profile.recencyCoef(year, ctx.now);
      const req = skillReq.get(c.label);
      const months = k ? k.mois_experience || 0 : 0;
      const durFactor = req ? (months >= req.years * 12 ? 1 : Math.max(0.4, months / (req.years * 12))) : 1;
      return { label: c.label, key: c.key, cat: c.cat, weight: c.weight, found: c.found > 0, recence_annee: year, coef, months,
        required_years: req ? req.years : null, durFactor: r3(durFactor), credit: c.found > 0 ? r3(coef * durFactor) : 0, contexte: k ? k.contexte_texte : "" };
    };

    // Les langues demandées sont notées avec les certifications (pilier 3), pas comme compétences techniques
    const langs = new Set(offer.languages.map((l) => l.lang));
    const technical = cov.filter((c) => HARD_CATS.has(c.cat) && !langs.has(c.label));

    // 1. Compétences techniques requises
    const hardItems = technical.filter((c) => !c.bonus).map(credit);
    const hard = cappedCredit(hardItems);

    // 2. Contexte et savoir-être
    const offerT = offer.title_norm;
    const cvCodes = [...new Set([profile.headline_normalise, ...profile.experiences.map((e) => e.intitule_normalise)].filter(Boolean))];
    const parts = [];
    if (ctx.title || offerT.code) {
      const tc = ctx.title ? titleCoverage(ctx.title, text) : { exact: false, ratio: 0 };
      let s = tc.exact ? 1 : tc.ratio >= 0.8 ? 0.9 : tc.ratio * 0.6, how = tc.exact ? "Intitulé exact présent dans le CV" : Math.round(tc.ratio * 100) + " % des mots de l'intitulé";
      if (offerT.code && cvCodes.includes(offerT.code) && s < 0.85) { s = 0.85; how = "Même métier normalisé (" + offerT.code + ")"; }
      else if (offerT.family && s < 0.6 && cvCodes.some((c) => ATS.profile.familyOf(c) === offerT.family)) { s = 0.6; how = "Même famille de métiers (" + offerT.family + ")"; }
      parts.push({ id: "title", label: "Intitulé du poste", score: s, weight: 0.35, detail: how, offer_code: offerT.code, offer_label: offerT.label, cv_codes: cvCodes });
    }
    const gen = general.sort((a, b) => b.years - a.years)[0];
    if (gen) {
      const dated = profile.experiences.some((e) => e.duree_mois);
      const m = profile.total_experience_mois;
      parts.push({ id: "experience", label: "Années d'expérience (" + gen.years + " an" + (gen.years > 1 ? "s" : "") + " demandés)", weight: 0.25,
        score: dated ? Math.min(1, m / (gen.years * 12)) : 0.5, detail: dated ? ATS.formatMonths(m) + " lus dans ton CV (périodes qui se chevauchent comptées une fois)" : "Durée non calculable : dates des expériences illisibles" });
    }
    if (offer.management) {
      const ok = ATS.MANAGEMENT_CV.test(n);
      parts.push({ id: "management", label: "Management / encadrement", score: ok ? 1 : 0, weight: 0.15, detail: ok ? "Expérience d'encadrement repérée" : "Aucune expérience d'encadrement repérée" });
    }
    const softItems = cov.filter((c) => c.cat === "soft");
    const otherItems = cov.filter((c) => c.cat === "other");
    const sr = ratio(softItems), or = ratio(otherItems);
    if (sr !== null) parts.push({ id: "soft", label: "Savoir-être", score: sr, weight: 0.15, detail: softItems.filter((c) => c.found).length + " / " + softItems.length + " trouvés" });
    if (or !== null) parts.push({ id: "terms", label: "Vocabulaire de l'offre", score: or, weight: 0.1, detail: otherItems.filter((c) => c.found).length + " / " + otherItems.length + " termes trouvés" });
    const context = blendNull(parts.map((p) => [p.score, p.weight]));

    // 3. Atouts et certifications
    const bonusItems = technical.filter((c) => c.bonus).map(credit);
    const bonus = cappedCredit(bonusItems);
    const certItems = offer.certifications.map((c) => { c.re.lastIndex = 0; return { label: c.label, found: c.re.test(text) }; })
      .concat(offer.languages.filter((l) => !l.knockout).map((l) => ({ label: l.lang + (l.level ? " (" + l.level + ")" : ""), found: l.re.test(n) })));
    if (offer.licence && offer.licence.nice) certItems.push({ label: "Permis B", found: /(permis b\b|permis de conduire|driving licen)/.test(n) });
    const certs = certItems.length ? certItems.filter((x) => x.found).length / certItems.length : null;
    let degree = null;
    if (offer.degree) {
      const r = profile.niveau_rang;
      degree = { required: offer.degree.level, found: profile.niveau_max, score: r === null ? 0 : r >= offer.degree.rank ? 1 : r === offer.degree.rank - 1 ? 0.5 : 0 };
    }
    const nice = blendNull([[bonus, 0.5], [certs, 0.3], [degree ? degree.score : null, 0.2]]);

    const scores = { hard, context, nice };
    const active = Object.keys(PILLAR_WEIGHTS).filter((k) => scores[k] !== null);
    const wsum = sum(active, (k) => PILLAR_WEIGHTS[k]);
    const total = active.length ? sum(active, (k) => scores[k] * PILLAR_WEIGHTS[k]) / wsum : 0;
    const eff = (k) => (scores[k] === null ? 0 : PILLAR_WEIGHTS[k] / wsum);
    return {
      total,
      hard: { score: hard, weight: PILLAR_WEIGHTS.hard, effective: eff("hard"), items: hardItems },
      context: { score: context, weight: PILLAR_WEIGHTS.context, effective: eff("context"), parts, title: parts.find((p) => p.id === "title") || null },
      nice: { score: nice, weight: PILLAR_WEIGHTS.nice, effective: eff("nice"), bonus: bonusItems, certs: certItems, degree },
    };
  }

  /* ---------- CV ---------- */
  function analyzeCV(doc, kw, ctx, ignored) {
    const text = doc.text || "";
    const meta = doc.meta || {};
    const checks = [];
    const profile = ATS.profile.parseCV(doc.rawText || text, { now: ctx.now });
    const chars = text.replace(/\s/g, "").length;
    const readable = chars >= 400;
    checks.push(check("readable", "Texte lisible par un ATS", readable ? "ok" : "fail",
      readable ? chars + " caractères extraits" : "Seulement " + chars + " caractères extraits",
      readable ? 15 : 0, 15,
      "Le texte de ton CV est presque illisible pour un ATS. C'est souvent un PDF scanné ou un CV en image : exporte-le depuis Word ou Google Docs en PDF « texte »."));

    const ws = words(text);
    const singles = ws.filter((w) => w.length === 1 && !/^[aàyldjnmstcAÀ0-9]$/i.test(w)).length;
    const frag = ws.length ? singles / ws.length : 0;
    checks.push(check("frag", "Mots non fragmentés", frag <= 0.08 ? "ok" : "warn",
      frag <= 0.08 ? "Pas de lettres isolées détectées" : Math.round(frag * 100) + " % de lettres isolées",
      frag <= 0.08 ? 5 : 0, 5,
      "Des mots semblent coupés lettre par lettre (espacement de caractères, police décorative ou texte vectorisé). Utilise une police standard sans espacement spécial."));

    const rawT = doc.rawText || text;
    const ligChars = rawT.match(/[\uFB00-\uFB06]/g) || [];
    // Ligatures extraites comme un fragment isolé : « Shape fi le », « pro fi l »
    const ligFrags = rawT.match(/\p{L} (?:ffi|ffl|fi|fl|ff|ft) (?=\p{L})/gu) || [];
    const examples = (rawT.match(/\p{L}+ (?:ffi|ffl|fi|fl|ff|ft) \p{L}+|\p{L}*[\uFB00-\uFB06]\p{L}*/gu) || []).slice(0, 3);
    const ligs = [...ligChars, ...ligFrags];
    checks.push(check("ligatures", "Pas de ligatures typographiques (ﬁ, ﬂ…)", ligs.length ? "warn" : "ok",
      ligs.length ? ligs.length + " mot(s) touché(s), lu(s) comme : " + examples.map((e) => "« " + e + " »").join(", ") : "Aucune ligature détectée",
      ligs.length ? 0 : 5, 5,
      "Ton PDF contient des ligatures (« fi » ou « fl » fusionnés en un seul caractère). Certains ATS les lisent mal et « Shapefile » peut devenir « Shape le ». Désactive les ligatures dans ton logiciel (Word : Police > Avancé > Ligatures : Aucune) ou exporte avec une autre police."));

    // Coordonnées : e-mail valide et téléphone convertible au format international E.164
    const cand = profile.candidat;
    const email = !!cand.email, phone = !!cand.telephone;
    const badEmail = profile.issues.find((i) => i.code === "email_invalid"), badPhone = profile.issues.find((i) => i.code === "phone_invalid");
    checks.push(check("contact", "Coordonnées (e-mail et téléphone)", email && phone ? "ok" : email || phone ? "warn" : "fail",
      (email ? "E-mail ✓ " + cand.email : badEmail ? "E-mail invalide « " + badEmail.detail + " »" : "E-mail manquant") + " · " +
      (phone ? "Téléphone ✓ " + cand.telephone : badPhone ? "Téléphone illisible « " + badPhone.detail + " »" : "Téléphone manquant"),
      (email ? 8 : 0) + (phone ? 7 : 0), 15,
      "Écris ton e-mail et ton téléphone complets en texte normal, en haut du CV (06 12 34 56 78 ou +33 6 12 34 56 78), pas dans une image, un en-tête ou un pied de page."));

    // Rubriques : titres réellement reconnus comme en-têtes de section (et non des mots isolés dans le texte)
    const found = new Set(profile.sections.map((s) => s.type));
    const sections = { "Expérience": found.has("experience"), "Formation": found.has("education"), "Compétences": found.has("skills") };
    const nSec = Object.values(sections).filter(Boolean).length;
    checks.push(check("sections", "Rubriques standards repérées", nSec === 3 ? "ok" : nSec >= 2 ? "warn" : "fail",
      Object.entries(sections).map(([k, v]) => (v ? "✓ " : "✗ ") + k).join(" · "),
      nSec * 5, 15,
      "Utilise des titres de rubriques classiques : « Expériences professionnelles », « Formation », « Compétences ». Les ATS s'en servent pour découper ton CV."));

    if (ctx.title) {
      const tc = titleCoverage(ctx.title, text);
      const st = tc.exact || tc.ratio >= 0.8 ? "ok" : tc.ratio >= 0.5 ? "warn" : "fail";
      checks.push(check("title", "Intitulé du poste présent", st,
        tc.exact ? "« " + ctx.title + " » trouvé tel quel" : Math.round(tc.ratio * 100) + " % des mots de l'intitulé trouvés",
        st === "ok" ? 15 : st === "warn" ? 8 : 0, 15,
        "Reprends l'intitulé exact du poste (« " + ctx.title + " ») sous ton nom, en titre du CV. Les recruteurs filtrent souvent par intitulé."));
    }

    const wc = ws.length;
    const lenSt = wc >= 300 && wc <= 900 ? "ok" : wc >= 200 && wc <= 1300 ? "warn" : "fail";
    checks.push(check("length", "Longueur du CV", lenSt, wc + " mots",
      lenSt === "ok" ? 10 : lenSt === "warn" ? 5 : 0, 10,
      wc < 300 ? "Ton CV est court : détaille tes missions avec des verbes d'action et les outils utilisés." : "Ton CV est long : vise 1 à 2 pages et garde ce qui sert l'offre."));

    const exps = profile.experiences, datedExps = exps.filter((e) => e.duree_mois);
    const exact = datedExps.filter((e) => !e.dates_estimees).length;
    const dSt = exps.length && datedExps.length === exps.length ? (exact === datedExps.length ? "ok" : "warn") : exps.length ? "warn" : "fail";
    checks.push(check("dates", "Expériences datées et découpées", dSt,
      exps.length ? exps.length + " expérience(s) découpée(s), " + datedExps.length + " avec une durée calculée" + (exact < datedExps.length ? ", dont " + (datedExps.length - exact) + " sans mois (durée estimée)" : "") : "Aucune expérience datée n'a pu être découpée",
      dSt === "ok" ? 5 : dSt === "warn" ? 3 : 0, 5,
      "Écris les dates de chaque expérience au format « Mois AAAA – Mois AAAA » (ou « depuis Mois AAAA »), sur la ligne de l'intitulé du poste : l'ATS calcule ainsi ta durée d'expérience et la récence de tes compétences."));

    const t = meta.type || "texte";
    const typeOk = ["pdf", "docx", "texte"].includes(t) || t === "txt";
    checks.push(check("filetype", "Format de fichier accepté", typeOk ? "ok" : "warn",
      t === "texte" ? "Texte collé" : t.toUpperCase(), typeOk ? 5 : 2, 5,
      "Envoie ton CV en PDF (texte) ou en DOCX : ce sont les formats les mieux lus."));

    const layoutIssues = [];
    if (meta.tables > 0) layoutIssues.push(meta.tables + " tableau(x)");
    if (meta.images > 3) layoutIssues.push(meta.images + " images");
    checks.push(check("layout", "Mise en page simple", layoutIssues.length ? "warn" : "ok",
      layoutIssues.length ? layoutIssues.join(", ") + " détecté(s)" : meta.type === "pdf" || meta.type === "docx" ? "Pas de tableau ni d'excès d'images" : "Non vérifiable sur du texte collé",
      layoutIssues.length ? 4 : 10, 10,
      "Les tableaux et les zones de texte sont parfois lus dans le désordre. Vérifie dans « Ce que voit l'ATS » que l'ordre du texte reste logique."));

    const fmtMax = sum(checks, (c) => c.max);
    const formatScore = (sum(checks, (c) => c.points) / fmtMax) * 100;

    const cov = coverage(kw, text, ignored);
    const pillars = scorePillars(cov, profile, ctx.offer, text, ctx);
    let score = Math.round(pillars.total * 100);
    if (!readable) score = Math.min(score, 10);
    const pct = (x) => (x === null ? null : Math.round(x * 100));
    return {
      score, kwScore: pct(pillars.hard.score) || 0, formatScore: Math.round(formatScore), checks, coverage: cov, words: wc,
      pillars, pillarScores: { hard: pct(pillars.hard.score), context: pct(pillars.context.score), nice: pct(pillars.nice.score) }, profile,
    };
  }

  /* ---------- Lettre ---------- */
  function analyzeLetter(doc, kw, ctx, ignored) {
    const text = doc.text || "";
    const n = norm(text);
    const checks = [];
    const chars = text.replace(/\s/g, "").length;
    const readable = chars >= 300;
    checks.push(check("readable", "Texte lisible par un ATS", readable ? "ok" : "fail", chars + " caractères extraits", readable ? 10 : 0, 10,
      "Le texte de ta lettre est presque illisible : exporte-la en PDF texte ou en DOCX."));

    if (ctx.company) {
      const c = count(buildRegex([norm(ctx.company)]), text);
      checks.push(check("company", "Nom de l'entreprise cité", c ? "ok" : "fail", c ? "Cité " + c + " fois" : "« " + ctx.company + " » absent", c ? 20 : 0, 20,
        "Cite le nom de l'entreprise (« " + ctx.company + " ») au moins une ou deux fois : ça montre que la lettre est écrite pour elle."));
    }
    if (ctx.title) {
      const tc = titleCoverage(ctx.title, text);
      const st = tc.exact || tc.ratio >= 0.8 ? "ok" : tc.ratio >= 0.5 ? "warn" : "fail";
      checks.push(check("title", "Intitulé du poste cité", st, tc.exact ? "Trouvé tel quel" : Math.round(tc.ratio * 100) + " % des mots trouvés",
        st === "ok" ? 15 : st === "warn" ? 8 : 0, 15,
        "Écris l'intitulé exact du poste dans l'objet et dans le premier paragraphe."));
    }
    const wc = wordCount(text);
    const lenSt = wc >= 220 && wc <= 480 ? "ok" : wc >= 150 && wc <= 600 ? "warn" : "fail";
    checks.push(check("length", "Longueur de la lettre", lenSt, wc + " mots (idéal : 250 à 450)", lenSt === "ok" ? 15 : lenSt === "warn" ? 8 : 0, 15,
      wc < 220 ? "Ta lettre est courte : développe un ou deux exemples concrets liés aux missions." : "Ta lettre est longue : une page suffit, garde l'essentiel."));
    const greet = /(madame|monsieur|bonjour|dear|hello)/.test(n);
    checks.push(check("greeting", "Formule d'appel", greet ? "ok" : "warn", greet ? "Présente" : "Absente", greet ? 10 : 0, 10, "Commence par « Madame, Monsieur, »."));
    const close = /(salutations|agreer|cordialement|sincerely|regards|sentiments)/.test(n);
    checks.push(check("closing", "Formule de politesse", close ? "ok" : "warn", close ? "Présente" : "Absente", close ? 10 : 0, 10,
      "Termine par une formule de politesse (« Je vous prie d'agréer… l'expression de mes salutations distinguées »)."));
    const obj = /(objet|candidature)/.test(n);
    checks.push(check("object", "Objet / mention de candidature", obj ? "ok" : "warn", obj ? "Présent" : "Absent", obj ? 5 : 0, 5, "Ajoute une ligne « Objet : Candidature au poste de … »."));
    const contact = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) || /(?:\+\d{1,3}[\s.]?)?(?:\d[\s.\-]?){8,13}\d/.test(text);
    checks.push(check("contact", "Coordonnées", contact ? "ok" : "warn", contact ? "Présentes" : "Absentes", contact ? 5 : 0, 5, "Mets ton e-mail et ton téléphone en haut de la lettre."));

    const checksScore = (sum(checks, (c) => c.points) / sum(checks, (c) => c.max)) * 100;
    const cov = coverage(kw, text, ignored);
    const hard = cov.filter((c) => c.cat !== "soft" && c.cat !== "other" && !c.bonus);
    const soft = cov.filter((c) => c.cat === "soft");
    const hr = ratio(hard), sr = ratio(soft);
    // Une lettre n'a pas à reprendre tous les mots-clés : 50 % des compétences = score plein
    const kwScore = blend([[hr === null ? null : Math.min(1, hr / 0.5), 0.8], [sr === null ? null : Math.min(1, sr / 0.5), 0.2]]) * 100;
    let score = Math.round(0.5 * kwScore + 0.5 * checksScore);
    if (!readable) score = Math.min(score, 10);
    return { score, kwScore: Math.round(kwScore), formatScore: Math.round(checksScore), checks, coverage: cov, words: wc };
  }

  /* ---------- Recommandations ---------- */
  const PROFILE_ADVICE = {
    no_sections: ["high", "L'ATS n'a repéré <b>aucune rubrique standard</b> : ton CV n'a pas pu être découpé et il est gardé en texte brut. Ajoute des titres de rubriques sur leur propre ligne : « Expériences professionnelles », « Formation », « Compétences »."],
    exp_unparsed: ["high", "Ta rubrique Expériences est là, mais <b>aucune expérience datée</b> n'a pu être découpée. Mets les dates sur la ligne du poste : « Géomaticien SIG – Alpha Géo – Janv. 2021 – Mars 2023 »."],
    no_exp_section: ["mid", "Pas de rubrique « Expériences professionnelles » repérée : l'ATS a cherché tes expériences dans tout le texte. Ajoute ce titre sur sa propre ligne."],
    edu_unparsed: ["mid", "Ta rubrique Formation est là, mais aucun diplôme n'a été reconnu. Écris l'intitulé exact (Master 2, Licence, BUT, BTS…), l'établissement et l'année."],
    exp_invalid_dates: ["mid", "Certaines expériences ont des dates illisibles ou incohérentes (fin avant début) : leur durée n'est pas comptée."],
    dates_estimated: ["low", "Certaines expériences n'ont que des années, sans mois : l'ATS estime leur durée. Écris « Mois AAAA – Mois AAAA » pour un calcul exact."],
    exp_no_title: ["mid", "Certaines expériences n'ont pas d'intitulé de poste lisible : écris l'intitulé sur la même ligne que les dates, ou juste au-dessus."],
    name_missing: ["low", "Ton nom n'a pas été reconnu : écris « Prénom NOM » seul sur la première ligne du CV."],
  };

  function recommendations(kw, cv, lm, ko) {
    const recos = [];
    if (ko) {
      ko.failed.forEach((k) => recos.push({ level: "high", text: "<b>Critère éliminatoire non rempli</b> : " + esc(k.question) + " Un ATS rejette alors la candidature automatiquement (statut DISQUALIFIED_AUTO), quel que soit ton score." }));
      const unknown = ko.items.filter((k) => k.status === "unknown" && k.id !== "work_auth");
      if (unknown.length) recos.push({ level: "mid", text: "Questions éliminatoires sans réponse : " + unknown.map((k) => esc(k.question)).join(" ") + " Réponds-y dans la rubrique dédiée et rends l'information visible dans ton CV." });
    }
    if (cv && cv.pillars) {
      const P = cv.pillars;
      P.hard.items.filter((i) => i.found && i.required_years && i.durFactor < 1).forEach((i) => recos.push({ level: "high",
        text: "L'offre demande <b>" + i.required_years + " an" + (i.required_years > 1 ? "s" : "") + " d'expérience en " + esc(i.label) + "</b> : ton CV en montre " + ATS.formatMonths(i.months) + ". Cite " + esc(i.label) + " dans chaque expérience datée où tu l'as utilisé." }));
      const stale = P.hard.items.filter((i) => i.found && i.coef < 1);
      if (stale.length) recos.push({ level: "mid", text: "Compétences anciennes (dernier usage il y a plus de 4 ans : coefficient 0,5 au lieu de 1,5 pour l'année en cours) : " + stale.map((i) => esc(i.label) + " (" + i.recence_annee + ")").join(", ") + ". Si tu les as utilisées depuis (projet, formation, mission), date-le." });
      const undated = P.hard.items.filter((i) => i.found && !i.recence_annee);
      if (undated.length) recos.push({ level: "low", text: "Ces compétences ne figurent que dans une liste, sans expérience datée : " + undated.map((i) => esc(i.label)).join(", ") + ". L'ATS ne peut calculer ni leur récence ni leur durée : cite-les aussi dans tes expériences." });
      const t = P.context.title;
      if (t && t.offer_code && t.score < 0.6) recos.push({ level: "mid", text: "L'ATS classe l'offre dans le métier <b>" + esc(t.offer_label) + "</b> (" + t.offer_code + ") mais ne le retrouve pas dans tes intitulés (" + (t.cv_codes.length ? t.cv_codes.join(", ") : "aucun intitulé reconnu") + "). Reprends l'intitulé de l'offre en titre de ton CV." });
      const exp = P.context.parts.find((p) => p.id === "experience");
      if (exp && exp.score < 1) recos.push({ level: "mid", text: esc(exp.label) + " : " + esc(exp.detail) + ". Vérifie que toutes tes expériences (stages et alternances compris) sont datées." });
      const mg = P.context.parts.find((p) => p.id === "management");
      if (mg && !mg.score) recos.push({ level: "mid", text: "L'offre parle de management ou d'encadrement. Si tu as encadré des stagiaires, animé une équipe ou piloté des prestataires, écris-le (« encadrement de 2 stagiaires »)." });
      if (P.nice.degree && P.nice.degree.score < 1) recos.push({ level: "mid", text: "Diplôme demandé : " + esc(P.nice.degree.required) + ". Plus haut diplôme lu dans ton CV : " + esc(P.nice.degree.found || "aucun") + ". Écris l'intitulé officiel de ton diplôme (Master 2, diplôme d'ingénieur…)." });
      const certMiss = P.nice.certs.filter((c) => !c.found);
      if (certMiss.length) recos.push({ level: "low", text: "Certifications ou langues citées dans l'offre et absentes de ton CV : " + certMiss.map((c) => esc(c.label)).join(", ") + "." });
    }
    if (cv && cv.profile) cv.profile.issues.forEach((i) => { const a = PROFILE_ADVICE[i.code]; if (a) recos.push({ level: a[0], text: a[1] }); });
    if (cv) {
      const missing = cv.coverage.filter((c) => c.cat !== "other" && c.cat !== "soft" && !c.found && !c.bonus).sort((a, b) => b.weight - a.weight);
      if (missing.length) recos.push({ level: "high", text: "Compétences demandées absentes de ton CV : <b>" + missing.map((m) => esc(m.label)).join(", ") + "</b>. Ajoute-les avec les mots exacts de l'offre, <u>uniquement si tu les maîtrises</u> : un recruteur vérifiera en entretien." });
      const bonusMissing = cv.coverage.filter((c) => c.bonus && !c.found);
      if (bonusMissing.length) recos.push({ level: "mid", text: "Atouts « un plus » non mentionnés : " + bonusMissing.map((m) => esc(m.label)).join(", ") + ". Si tu les as utilisés, même en formation, cite-les." });
      const softMissing = cv.coverage.filter((c) => c.cat === "soft" && !c.found);
      if (softMissing.length) recos.push({ level: "low", text: "Savoir-être cités dans l'offre mais pas dans le CV : " + softMissing.map((m) => esc(m.label)).join(", ") + ". Glisse-les dans ton accroche ou tes « Apports »." });
      if (lm) {
        const onlyLetter = cv.coverage.filter((c) => !c.found && lm.coverage.find((l) => l.key === c.key && l.found));
        if (onlyLetter.length) recos.push({ level: "mid", text: "Présents dans ta lettre mais pas dans ton CV : " + onlyLetter.map((m) => esc(m.label)).join(", ") + ". L'ATS lit surtout le CV : ajoute-les aussi dedans." });
      }
      cv.checks.filter((c) => c.status !== "ok").forEach((c) => recos.push({ level: c.status === "fail" ? "high" : "mid", text: "<b>CV – " + esc(c.label) + "</b> : " + esc(c.advice) }));
    }
    if (lm) {
      const top = lm.coverage.filter((c) => c.cat !== "other" && c.cat !== "soft" && !c.found && !c.bonus).sort((a, b) => b.weight - a.weight).slice(0, 5);
      if (top.length) recos.push({ level: "mid", text: "Pour renforcer ta lettre, illustre par un exemple concret : " + top.map((m) => esc(m.label)).join(", ") + "." });
      lm.checks.filter((c) => c.status !== "ok").forEach((c) => recos.push({ level: c.status === "fail" ? "high" : "mid", text: "<b>Lettre – " + esc(c.label) + "</b> : " + esc(c.advice) }));
    }
    const order = { high: 0, mid: 1, low: 2 };
    return recos.sort((a, b) => order[a.level] - order[b.level]);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  ATS.esc = esc;

  ATS.verdict = function (score) {
    if (score >= 75) return { label: "Bonnes chances de passer le filtre", tone: "good" };
    if (score >= 55) return { label: "Passable, à renforcer", tone: "mid" };
    return { label: "Risque élevé de rejet automatique", tone: "bad" };
  };

  /** Verdict affiché : une candidature éliminée par une question éliminatoire l'est quel que soit son score. */
  ATS.verdictFor = function (r) {
    if (r && r.status === "DISQUALIFIED_AUTO") return { label: "Éliminée automatiquement", tone: "bad", disqualified: true };
    return ATS.verdict(r ? r.global : 0);
  };

  /**
   * Analyse complète.
   * @param answers  réponses aux questions éliminatoires { id: true | false }
   * @param now      date de référence (tests)
   */
  ATS.analyze = function ({ jdText, title, company, cv, letter, ignored, answers, now }) {
    const ign = new Set(ignored || []);
    jdText = (jdText || "").normalize("NFKC");
    const kw = ATS.extractJobKeywords(jdText, title);
    const offer = ATS.analyzeOffer(jdText, title, kw);
    const ctx = { title: (title || "").trim(), company: (company || "").trim(), offer, now: now || new Date() };
    const prep = (d) => d && d.text ? { ...d, rawText: d.text, text: d.text.normalize("NFKC") } : null;
    const cvDoc = prep(cv), lmDoc = prep(letter);
    const cvRes = cvDoc ? analyzeCV(cvDoc, kw, ctx, ign) : null;
    const lmRes = lmDoc ? analyzeLetter(lmDoc, kw, ctx, ign) : null;
    const ko = ATS.evaluateKnockouts(offer, cvRes ? cvRes.profile : null, cvDoc ? cvDoc.text : lmDoc ? lmDoc.text : "", answers);
    let global = null;
    if (cvRes && lmRes) global = Math.round(0.7 * cvRes.score + 0.3 * lmRes.score);
    else if (cvRes) global = cvRes.score;
    else if (lmRes) global = lmRes.score;
    const plain = (list) => list.map(({ re, ...x }) => x);
    return {
      date: new Date().toISOString(),
      keywords: {
        skills: kw.skills.map(({ re, body, ...k }) => k),
        others: kw.others.map(({ re, body, ...k }) => k),
      },
      offer: { ...offer, languages: plain(offer.languages), certifications: plain(offer.certifications) },
      knockouts: ko.items, status: ko.status,
      cv: cvRes, letter: lmRes, global,
      recommendations: recommendations(kw, cvRes, lmRes, ko),
    };
  };

  /** Surligne les mots-clés trouvés dans un texte (HTML échappé). */
  ATS.highlight = function (text, keywordLabels, jdText, title) {
    const kw = ATS.extractJobKeywords((jdText || "").normalize("NFKC"), title);
    text = (text || "").normalize("NFKC");
    const all = [...kw.skills, ...kw.others].filter((k) => keywordLabels.has(k.key));
    let html = esc(text || "");
    if (!all.length) return html;
    const re = regexFromBody(all.map((k) => k.body).join("|"));
    // On applique la regex sur le texte brut puis on reconstruit en échappant
    const src = text || "";
    let out = "", last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    return out + esc(src.slice(last));
  };
})();
