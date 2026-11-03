/* ATS Tester — mail de candidature
 * Rédige un mail court, prêt à envoyer, à partir de l'offre et du CV analysés : intitulé et référence de
 * l'offre, contact et adresse trouvés dans l'annonce, poste actuel et précédent, diplôme récent,
 * compétences demandées que le CV contient, disponibilité, coordonnées.
 * Pas d'IA : des phrases écrites à la main, choisies selon ce que l'on sait vraiment du candidat.
 * Rien n'est inventé : sans information, la phrase n'est pas écrite. Formulations neutres (ni « ravi »,
 * ni « motivé »…) : le genre du candidat n'est pas connu.
 */
window.ATS = window.ATS || {};

(function () {
  const NUM = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const BOARDS = [
    [/indeed\./, "Indeed"], [/welcometothejungle\./, "Welcome to the Jungle"], [/linkedin\./, "LinkedIn"], [/apec\.fr/, "l'Apec"],
    [/francetravail\.fr|pole-emploi\.fr/, "France Travail"], [/hellowork\./, "HelloWork"], [/emploi-territorial\.fr/, "Emploi Territorial"],
    [/choisirleservicepublic\.gouv\.fr|place-emploi-public\.gouv\.fr/, "Choisir le service public"], [/jobteaser\./, "JobTeaser"],
    [/cadremploi\./, "Cadremploi"], [/meteojob\./, "Meteojob"], [/monster\./, "Monster"], [/glassdoor\./, "Glassdoor"],
  ];
  const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* ---------- Mise en forme ---------- */
  function count(n, one, many) { return (n <= 10 ? NUM[n] : n) + " " + (n > 1 ? many : one); }
  /** Durée dite comme on l'écrirait : « six mois », « plus de deux ans », « près de trois ans ». */
  function duration(m) {
    if (!m || m < 1) return "";
    if (m < 12) return count(m, "mois", "mois");
    const y = Math.floor(m / 12), r = m % 12;
    if (r >= 9) return "près de " + count(y + 1, "an", "ans");
    if (r >= 3) return (y === 1 ? "plus d'" : "plus de ") + count(y, "an", "ans");
    return count(y, "an", "ans");
  }
  function list(items) { return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " et " + items[items.length - 1]; }
  function formatPhone(e164) {
    if (!e164) return "";
    const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
    return fr ? "0" + fr[1] + " " + fr.slice(2).join(" ") : e164;
  }
  // Mot tout en majuscules gardé tel quel s'il est court (SIG, CAO, RH), sinon remis en minuscules
  function smartCase(s) {
    s = String(s || "").trim();
    if (/\p{Ll}/u.test(s)) return s;
    const t = s.split(/\s+/).map((w) => (w.replace(/[^\p{L}]/gu, "").length <= 4 ? w : w.toLowerCase())).join(" ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Minuscule en début d'intitulé dans une phrase (« technicien SIG »), sauf sigle (« QGIS », « DevOps »)
  function lowerFirst(s) {
    const w = s.split(/\s+/)[0] || "";
    if (/\p{Lu}/u.test(w.slice(1))) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  const HF = /\s*[([]?\s*\b[HF]\s*[/-]\s*[FH]\b(?:\s*[/-]\s*[XN]\b)?\s*[)\]]?/g;
  /** Intitulé propre : sans « H/F », sans ponctuation finale, casse raisonnable. */
  function cleanTitle(s) {
    let t = smartCase(String(s || "").replace(HF, " ").replace(/\s+/g, " ").trim()).replace(/[\s.,;:–—-]+$/, "");
    if (t.length > 60) t = t.split(/\s[-–—|]\s|,|\(/)[0].trim();
    return t;
  }
  // Nom d'employeur sans la ville ni le lieu (« Alpha Géo, Rennes » → « Alpha Géo »)
  function cleanCompany(s) { return String(s || "").split(/\s[-–—|·]\s|,|\(/)[0].trim(); }
  function titleCase(w) { return w.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }

  /* ---------- Ce que dit l'annonce ---------- */
  /** Adresse où envoyer la candidature : celle du recrutement d'abord, jamais une adresse « noreply ». */
  function findRecipient(jdText) {
    const all = (String(jdText || "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map((e) => e.replace(/\.+$/, "").toLowerCase());
    const ok = [...new Set(all)].filter((e) => ATS.profile.isValidEmail(e) && !/no-?reply|ne-?pas-?repondre|donotreply/.test(e));
    return ok.find((e) => /recrut|rh|drh|job|emploi|candidat|carriere|career|talent|hr|cv/.test(e.split("@")[0])) || ok[0] || "";
  }

  const PARTICLES = new Set(["le", "la", "de", "du", "des", "van", "von", "mac", "da", "di"]);
  /**
   * Personne à qui écrire, si l'annonce la nomme (« Contact : Mme Sophie MARTIN », « à adresser à Monsieur le Maire »).
   * @returns { salutation: "Madame Martin" | "Monsieur le Maire", formal } ou null
   */
  function findContact(jdText) {
    const text = String(jdText || "");
    const near = (idx) => /contact|attention|aupres|adress|envoy|interlocut|recrut|renseignement|candidature|question/.test(fold(text.slice(Math.max(0, idx - 90), idx)));
    const ROLE = /\b(Madame|Monsieur)\s+(l[ae]\s+(?:Maire|Présidente?|Directeur|Directrice)(?:\s+(?:général|générale|des ressources humaines))?)\b/gu;
    for (const m of text.matchAll(ROLE)) if (near(m.index)) return { salutation: m[1] + " " + m[2], formal: true };
    const PERSON = /\b(Madame|Monsieur|Mme|Mlle|M\.|Mr)\.?\s+(\p{Lu}[\p{L}'’-]+(?:[ ]\p{Lu}[\p{L}'’-]+){0,2})/gu;
    for (const m of text.matchAll(PERSON)) {
      if (!near(m.index)) continue;
      const civ = /^M(me|lle|adame)/.test(m[1]) ? "Madame" : "Monsieur";
      const w = m[2].split(" ");
      const upper = w.filter((x) => x.length > 1 && x === x.toUpperCase());
      let last;
      if (upper.length && upper.length < w.length) last = upper.join(" ");
      else if (w.length === 1 || upper.length === w.length) last = w.join(" ");
      else {
        const p = w.findIndex((x, i) => i > 0 && PARTICLES.has(x.toLowerCase()));
        last = p > 0 ? w.slice(p).join(" ") : w.length === 2 && PARTICLES.has(w[0].toLowerCase()) ? w.join(" ") : w[w.length - 1];
      }
      return { salutation: civ + " " + (last === last.toUpperCase() ? titleCase(last) : last), formal: false };
    }
    return null;
  }

  /** Référence de l'offre (« Réf. : SIG-2026-045 », « Référence de l'offre n° 55401 »). */
  function findRef(jdText) {
    const re = /\b(?:r[ée]f[ée]rence|r[ée]f\.?|offre n°|annonce n°)\s*(?:de l'offre|de l'annonce|du poste|de poste)?\s*(?:n°|no\.?|#)?\s*:?\s*([A-Z0-9][A-Z0-9_/.-]{1,24})/gi;
    for (const m of String(jdText || "").matchAll(re)) {
      const v = m[1].replace(/[.-]+$/, "");
      if (/\d/.test(v) && v.length >= 3) return v;
    }
    return "";
  }
  function boardOf(url) {
    let host = "";
    try { host = new URL(url).hostname; } catch (e) { return ""; }
    const b = BOARDS.find(([re]) => re.test(host));
    return b ? b[1] : "";
  }
  const NOT_A_TITLE = /fiche de poste|offre d'emploi|offre d.emploi|annonce|recrute|recrutement/i;

  /* ---------- Variantes ---------- */
  // Variante 0 : les tournures préférées. « Autre formulation » change l'introduction à coup sûr
  // et redistribue les autres phrases.
  function picker(variant) {
    return (slot, arr) => {
      if (!variant) return arr[0];
      if (slot === 0) return arr[variant % arr.length];
      const h = Math.imul(variant * 7919 + slot * 104729, 2654435761) >>> 0;
      return arr[h % arr.length];
    };
  }

  /**
   * @param r  résultat de ATS.analyze
   * @param o  { title, company, url, jdText, hasLetter, tone: "classic" | "direct", variant, now, fallbackName, fallbackEmail }
   * @returns { to, subject, body, words, contact, notes: [{ level: "info" | "warn", text }] }
   */
  function build(r, o) {
    o = o || {};
    const now = o.now || new Date(), year = now.getFullYear();
    const direct = o.tone === "direct";
    const pick = picker(o.variant || 0);
    const jdText = o.jdText || "";
    const pf = r && r.cv ? r.cv.profile : null;
    const cand = pf ? pf.candidat : {};
    const notes = [];

    // Poste visé
    let title = cleanTitle(o.title);
    if (!title && r && r.offer && r.offer.title && !NOT_A_TITLE.test(r.offer.title) && r.offer.title.length <= 80) title = cleanTitle(r.offer.title);
    const company = cleanCompany(o.company);
    const ref = findRef(jdText), board = boardOf(o.url);
    const refTxt = ref ? " (réf. " + ref + ")" : "";
    const poste = title ? "le poste de " + lowerFirst(title) : "le poste que vous proposez";
    const offre = title ? "votre offre de " + lowerFirst(title) : "votre offre";

    // Candidat
    const first = cand.prenom ? (cand.prenom === cand.prenom.toUpperCase() ? titleCase(cand.prenom) : cand.prenom) : "";
    const name = [first, cand.nom || ""].filter(Boolean).join(" ") || o.fallbackName || "";
    if (!cand.nom) notes.push({ level: "warn", text: "Ton nom n'a pas été trouvé dans le CV : vérifie la signature." });
    const phone = formatPhone(cand.telephone);
    const email = cand.email || o.fallbackEmail || "";
    const cvText = (r && r.cv && r.cv.profile && r.cv.profile.candidat.cv_texte_brut) || "";
    const linkedin = (/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i.exec(cvText) || [""])[0].replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/$/, "");

    // Expériences : poste actuel (ou dernier), puis le précédent, hors stages
    const end = (e) => (e.est_poste_actuel ? "9999" : e.date_fin || e.date_debut || "");
    const byDate = (a, b) => end(b).localeCompare(end(a)) || (b.date_debut || "").localeCompare(a.date_debut || "");
    const isStage = (e) => /^(stage|stagiaire)\b/.test(fold(e.intitule_poste));
    const exps = (pf ? pf.experiences : []).filter((e) => e.intitule_poste && !isStage(e)).sort(byDate);
    const stage = (pf ? pf.experiences : []).filter((e) => e.intitule_poste && isStage(e)).sort(byDate)[0];
    const job = (e) => ({ t: lowerFirst(cleanTitle(e.intitule_poste)), c: cleanCompany(e.entreprise), d: duration(e.duree_mois) });
    const cur = exps[0] ? job(exps[0]) : null, isCurrent = !!(exps[0] && exps[0].est_poste_actuel);
    const prev = exps[1] ? job(exps[1]) : null;
    const at = (x) => (x.c ? " chez " + x.c : "");

    // Diplôme récent (ou parcours encore court)
    const ranks = ATS.profile.LEVEL_RANK || {};
    const deg = (pf ? pf.formations : []).slice().sort((a, b) => (ranks[b.niveau_normalized] || 0) - (ranks[a.niveau_normalized] || 0) || (b.annee_obtention || 0) - (a.annee_obtention || 0))[0];
    const junior = !pf || (pf.total_experience_mois || 0) < 36;
    const degName = deg && deg.nom_diplome && deg.nom_diplome.length <= 70 ? smartCase(deg.nom_diplome) : "";

    // Compétences demandées par l'offre et présentes dans le CV : des outils concrets (QGIS, Python, FME),
    // les plus importants pour l'offre et les plus récents d'abord. Les domaines (« SIG », « cartographie »)
    // ne servent qu'à défaut, et jamais un mot déjà dans l'intitulé du poste.
    let found = r && r.cv ? r.cv.pillars.hard.items.filter((i) => i.found) : [];
    if (!found.length && r && r.letter) found = r.letter.coverage.filter((c) => c.found && ["tools", "tech", "methods", "formats"].includes(c.cat));
    const inTitle = (i) => new RegExp("(^|[^\\p{L}])" + fold(i.label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\p{L}]|$)", "u").test(fold(title));
    found = found.filter((i) => !inTitle(i)).sort((a, b) => b.weight - a.weight || (b.recence_annee || 0) - (a.recence_annee || 0));
    const concrete = found.filter((i) => ["tools", "tech", "formats"].includes(i.cat));
    const tools = concrete.length > 0;
    const skills = (tools ? concrete : found).slice(0, 3);
    const recent = skills.filter((i) => i.recence_annee && i.recence_annee >= year - 1).length >= Math.max(1, Math.ceil(skills.length * 2 / 3));
    const k = list(skills.map((i) => (tools ? i.label : lowerFirst(i.label)))), many = skills.length > 1;

    // Disponibilité
    let dispo = "";
    if (cand.date_disponibilite) {
      const [y, m, d] = cand.date_disponibilite.split("-").map(Number);
      const when = new Date(y, m - 1, d);
      dispo = when <= now ? "immédiatement" : d === 1 ? "à partir de " + MONTHS[m - 1] + " " + y : "à partir du " + d + " " + MONTHS[m - 1] + " " + y;
    }

    // Destinataire et formule d'appel
    const to = findRecipient(jdText);
    const contact = findContact(jdText);
    const hello = contact ? (direct && !contact.formal ? "Bonjour " + contact.salutation + "," : contact.salutation + ",") : direct ? "Bonjour," : "Madame, Monsieur,";

    /* ---------- Rédaction ---------- */
    const P = [];
    // 1. Pourquoi j'écris
    P.push(direct
      ? pick(0, [
        (title ? "Je vous écris au sujet du poste de " + lowerFirst(title) + refTxt + (board ? ", vu sur " + board : "")
          : "Je vous écris au sujet de votre offre" + refTxt + (board ? ", vue sur " + board : "")) + ".",
        (title ? "Le poste de " + lowerFirst(title) : "Le poste") + refTxt + " que vous proposez" + (board ? " sur " + board : "") + " m'intéresse beaucoup, et je souhaite vous envoyer ma candidature.",
      ])
      : pick(0, [
        "Je vous adresse ma candidature pour " + poste + refTxt + (board ? ", découvert sur " + board : "") + ".",
        "J'ai découvert " + offre + refTxt + (board ? " sur " + board : "") + " et je souhaite y répondre.",
        "Je souhaite vous proposer ma candidature pour " + poste + refTxt + (board ? ", repéré sur " + board : "") + ".",
      ]));

    // 2. Qui je suis, ce que je sais faire
    const p2 = [];
    if (cur && isCurrent) {
      p2.push(cur.d
        ? pick(1, [
          "Depuis " + cur.d + ", je suis " + cur.t + at(cur) + (prev ? ", après " + (prev.d ? prev.d + " " : "") + "comme " + prev.t + at(prev) : "") + ".",
          "J'occupe depuis " + cur.d + " le poste de " + cur.t + at(cur) + (prev ? " ; auparavant, j'ai été " + prev.t + at(prev) + (prev.d ? " pendant " + prev.d : "") : "") + ".",
        ])
        : "Je suis actuellement " + cur.t + at(cur) + (prev ? ", après une expérience de " + prev.t + at(prev) : "") + ".");
    } else if (cur) {
      p2.push(pick(1, [
        "Dernièrement, j'ai été " + cur.t + at(cur) + (cur.d ? " pendant " + cur.d : "") + ".",
        "Mon dernier poste : " + cur.t + at(cur) + (cur.d ? ", pendant " + cur.d : "") + ".",
      ]));
    } else if (pf && pf.headline) {
      p2.push("Je suis " + lowerFirst(cleanTitle(pf.headline)) + ".");
    }
    if (degName && (junior || !cur)) {
      const une = /^(licence|maitrise|ecole|formation)/.test(fold(degName));
      const fresh = deg.annee_obtention && deg.annee_obtention >= year - 1;
      p2.push(fresh
        ? "Je viens d'obtenir " + (une ? "ma " : "mon ") + degName + (deg.institution ? " (" + cleanCompany(deg.institution) + ")" : "") + "."
        : "Je suis titulaire d'" + (une ? "une " : "un ") + degName + (deg.institution ? " (" + cleanCompany(deg.institution) + (deg.annee_obtention ? ", " + deg.annee_obtention : "") + ")" : "") + ".");
    }
    // Pas encore d'emploi : le stage le plus récent compte
    if (!cur && stage) {
      const s = job(stage), what = /^stage\b/.test(fold(s.t)) ? s.t : "stage";
      p2.push("J'ai effectué un " + what + (s.d ? " de " + s.d : "") + at(s) + ".");
    }
    if (skills.length && tools) {
      // « Au quotidien » seulement pour quelqu'un en poste qui s'en sert encore
      p2.push(recent && isCurrent
        ? pick(2, [
          "Au quotidien, je travaille avec " + k + ", que votre annonce met en avant.",
          k + (many ? " font" : " fait") + " partie de mon quotidien, et " + (many ? "ce sont" : "c'est") + " justement " + (many ? "les outils" : "l'outil") + " que votre annonce met en avant.",
        ])
        : pick(2, [
          "J'ai déjà travaillé avec " + k + ", que votre annonce met en avant.",
          "Mon parcours m'a permis de pratiquer " + k + ", " + (many ? "des outils" : "un outil") + " que votre annonce met en avant.",
        ]));
    } else if (skills.length) {
      // Domaines et méthodes : cités en liste, sans article à accorder
      p2.push(pick(2, [
        "Je retrouve dans votre annonce ce que je pratique déjà : " + k + ".",
        "Votre annonce met en avant des compétences que j'ai déjà mises en œuvre : " + k + ".",
      ]));
    }
    // Sans lettre de motivation, le mail porte aussi l'envie de rejoindre l'équipe
    if (!o.hasLetter && (cur || skills.length)) {
      const what = cur ? "cette expérience" : "ces compétences";
      p2.push(pick(3, [
        "J'aimerais beaucoup rejoindre " + (company || "votre équipe") + " et y mettre " + what + " à profit.",
        "Rejoindre " + (company || "votre équipe") + " serait pour moi l'occasion de mettre " + what + " à profit dans un nouveau cadre.",
      ]));
    }
    if (p2.length) P.push(p2.join(" "));

    // 3. Pièces jointes et disponibilité
    const docs = o.hasLetter ? "mon CV et ma lettre de motivation" : "mon CV";
    const p3 = [direct
      ? pick(4, ["Je joins " + docs + " à ce message.", "Vous trouverez " + docs + " en pièce jointe."])
      : pick(4, ["Vous trouverez ci-joint " + docs + ".", (o.hasLetter ? "Mon CV et ma lettre de motivation sont joints" : "Mon CV est joint") + " à ce message."])];
    if (dispo) p3.push(pick(5, direct
      ? [dispo === "immédiatement" ? "Je peux commencer dès maintenant." : "Je peux commencer " + dispo + ".", "Je suis disponible " + dispo + "."]
      : ["Je suis disponible " + dispo + ".", "Côté disponibilité, je peux commencer " + (dispo === "immédiatement" ? "dès maintenant" : dispo) + "."]));
    P.push(p3.join(" "));

    // 4. La suite
    P.push(direct
      ? pick(6, [
        phone ? "Le plus simple pour en parler : m'appeler au " + phone + ", ou me répondre ici." : "Je suis à votre écoute pour en parler, par téléphone ou en visio.",
        "Ce serait un plaisir d'en discuter avec vous, par téléphone ou lors d'un entretien.",
      ]) + " " + pick(7, ["Merci pour votre lecture, et à bientôt peut-être.", "Merci d'avance pour votre retour."])
      : pick(6, [
        "Je reste à votre écoute pour convenir d'un entretien.",
        "Un entretien me permettrait de vous en dire davantage sur mon parcours ; je m'adapterai à vos disponibilités.",
      ]) + " " + pick(7, ["Je vous remercie pour l'attention que vous porterez à ma candidature.", "Merci pour votre attention."]));

    const close = direct ? pick(8, ["Bien à vous,", "Belle journée,"]) : pick(8, ["Bien cordialement,", "Cordialement,"]);
    const signature = [name, phone, email, linkedin].filter(Boolean).join("\n");
    const body = [hello, ...P, close + (signature ? "\n\n" + signature : "")].join("\n\n");

    const subject = direct
      ? (title ? pick(9, [title + refTxt + " – candidature" + (name ? " de " + name : ""), "Candidature " + title + refTxt + (name ? " – " + name : "")]) : "Candidature" + (name ? " – " + name : ""))
      : (title ? pick(9, ["Candidature au poste de " + title + refTxt, "Candidature : " + title + refTxt + (name ? " – " + name : "")]) : "Candidature" + (name ? " – " + name : ""));

    if (!to) notes.push({ level: "info", text: "Aucune adresse e-mail dans l'offre : si l'annonce demande de postuler sur un site, colle ce texte dans son formulaire." });
    if (contact) notes.push({ level: "info", text: "Contact trouvé dans l'offre : " + contact.salutation + "." });
    if (r && r.status === "DISQUALIFIED_AUTO") notes.push({ level: "warn", text: "⛔ Un pré-requis bloquant de l'offre n'est pas rempli : vérifie-le avant d'envoyer." });

    const words = (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    return { to, subject, body, words, contact, notes };
  }

  ATS.mail = { build, findRecipient, findContact, findRef, cleanTitle, duration, formatPhone, boardOf };
})();
