/* ATS Tester — prompt pour une IA générative
 * Transforme le résultat de l'analyse en consignes prêtes à coller dans ChatGPT, Claude, Gemini, Le Chat…
 * L'IA réécrit le CV et la lettre à partir des seuls faits fournis, puis pose des questions
 * sur les compétences manquantes au lieu de les inventer.
 */
window.ATS = window.ATS || {};

(function () {
  const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  // Numéros internationaux (+33 6 12…, 0033…) et français (06 12 34 56 78) ; épargne les plages de dates « 2019-2021 »
  const PHONE_RE = /(?:\+|00)\d{1,3}[\s.\-]?(?:\(0\)[\s.\-]?)?\d(?:[\s.\-]?\d){7,11}|(?<!\d)0[1-9](?:[\s.\-]?\d{2}){4}(?!\d)/g;

  function maskContacts(text) {
    return (text || "").replace(EMAIL_RE, "[E-MAIL]").replace(PHONE_RE, "[TÉLÉPHONE]");
  }
  ATS.maskContacts = maskContacts;

  const HARD = (c) => c.cat !== "soft" && c.cat !== "other";
  const byWeight = (a, b) => (b.weight || 0) - (a.weight || 0);
  const labels = (items) => items.map((c) => c.label).join(", ");
  const quote = (text) => '"""\n' + text.trim() + '\n"""';

  /**
   * @param r     résultat de ATS.analyze
   * @param opts  { title, company, url, jdText, cvText, letterText, target, maskContacts }
   *              target : "both" | "cv" | "letter" | "cv-newletter"
   */
  ATS.buildPrompt = function (r, opts) {
    const o = opts || {};
    const target = o.target || (r.cv && r.letter ? "both" : r.cv ? "cv" : "letter");
    const doCv = target !== "letter";
    const doLetter = target !== "cv";
    const newLetter = target === "cv-newletter";
    const clean = (t) => (o.maskContacts ? maskContacts(t) : t || "");
    const title = (o.title || "").trim();
    const company = (o.company || "").trim();
    const titleRef = title ? "« " + title + " »" : "l'intitulé du poste";
    const companyRef = company ? "« " + company + " »" : "le nom de l'entreprise";

    const goal = {
      both: "perfectionner mon CV et ma lettre de motivation",
      cv: "perfectionner mon CV",
      letter: "perfectionner ma lettre de motivation",
      "cv-newletter": "perfectionner mon CV et rédiger ma lettre de motivation",
    }[target];

    const L = [];
    L.push("Tu es un recruteur expérimenté, spécialiste des logiciels de tri de candidatures (ATS). Aide-moi à " + goal +
      " pour l'offre ci-dessous, afin de passer le filtre automatique puis de convaincre le recruteur.");

    L.push("", "## Le poste");
    L.push("- Intitulé : " + (title || "(non précisé)"));
    L.push("- Entreprise : " + (company || "(non précisée)"));
    if ((o.url || "").trim()) L.push("- Annonce : " + o.url.trim());

    // ---- Résultats de l'analyse
    L.push("", "## Résultat de mon test ATS", "J'ai passé ma candidature dans un simulateur d'ATS. Voici ses conclusions :");
    if (r.global !== null && r.global !== undefined) L.push("- Indice global : " + r.global + "/100 (" + ATS.verdict(r.global).label + ")");
    if (r.cv) L.push("- CV : " + r.cv.score + "/100 (mots-clés " + r.cv.kwScore + " %, format " + r.cv.formatScore + " %)");
    if (r.letter) L.push("- Lettre : " + r.letter.score + "/100 (mots-clés " + r.letter.kwScore + " %, forme " + r.letter.formatScore + " %)");

    let firstMissing = null;
    if (doCv && r.cv) {
      const cov = r.cv.coverage;
      const required = cov.filter((c) => HARD(c) && !c.bonus && !c.found).sort(byWeight);
      const bonus = cov.filter((c) => HARD(c) && c.bonus && !c.found).sort(byWeight);
      const soft = cov.filter((c) => c.cat === "soft" && !c.found);
      const other = cov.filter((c) => c.cat === "other" && !c.found);
      const present = cov.filter((c) => c.found).sort(byWeight);
      firstMissing = required[0] || null;
      L.push("", "### Mots-clés de l'offre absents de mon CV");
      if (!required.length && !bonus.length && !soft.length && !other.length) L.push("Aucun : tous les mots-clés repérés sont déjà présents.");
      if (required.length) L.push("- Compétences demandées (prioritaires) : " + labels(required));
      if (bonus.length) L.push("- Atouts « un plus » : " + labels(bonus));
      if (soft.length) L.push("- Savoir-être : " + labels(soft));
      if (other.length) L.push("- Autres termes fréquents de l'offre : " + labels(other));
      if (present.length) L.push("", "### Mots-clés déjà présents dans mon CV (à conserver)", labels(present));
    }
    if (doLetter && r.letter) {
      const missing = r.letter.coverage.filter((c) => HARD(c) && !c.bonus && !c.found).sort(byWeight).slice(0, 8);
      if (missing.length) {
        L.push("", "### Compétences demandées absentes de ma lettre",
          labels(missing) + " (une lettre n'a pas à tout reprendre : illustre les plus importantes par un exemple).");
      }
    }

    const issues = [];
    const addIssues = (res, name) => {
      if (!res) return;
      res.checks.filter((c) => c.status !== "ok").forEach((c) => issues.push("- " + name + " – " + c.label + " : " + c.detail + ". " + c.advice));
    };
    if (doCv) addIssues(r.cv, "CV");
    if (doLetter) addIssues(r.letter, "Lettre");
    if (issues.length) L.push("", "### Problèmes de forme détectés", ...issues);

    // ---- Documents
    L.push("", "## Fiche de poste", quote(o.jdText || ""));
    if (o.maskContacts && (o.cvText || o.letterText)) {
      L.push("", "Mes coordonnées ont été remplacées par [E-MAIL] et [TÉLÉPHONE] : garde ces marqueurs tels quels dans tes propositions.");
    }
    if (o.cvText) {
      L.push("", "## Mon CV actuel", "Texte brut tel que l'ATS l'a extrait (la mise en page d'origine est perdue)" +
        (doCv ? "." : ". Sers-t'en comme source de faits pour la lettre."), quote(clean(o.cvText)));
    }
    if (o.letterText) {
      L.push("", "## Ma lettre de motivation actuelle" + (doLetter ? "" : " (pour contexte)"), quote(clean(o.letterText)));
    }

    // ---- Règles
    const rules = [
      "N'invente rien : aucune compétence, expérience, diplôme, chiffre ou date absent de mes documents. S'il manque une information, écris [À COMPLÉTER].",
      "N'ajoute une compétence demandée que si mes documents montrent que je l'ai pratiquée, même sous un autre nom. Sinon, garde-la pour tes questions finales.",
      "Reprends les mots exacts de l'offre (orthographe, sigles, intitulés) : un ATS cherche souvent la forme exacte" +
        (title ? ", par exemple " + titleRef : firstMissing ? ", par exemple « " + firstMissing.label + " »" : "") + ".",
    ];
    if (doCv) {
      rules.push("CV : une seule colonne, sans tableau, zone de texte ni image ; " + titleRef + " en titre sous mon nom ; rubriques standards " +
        "(Expériences professionnelles, Formation, Compétences) ; dates au format « Mois AAAA – Mois AAAA » ; verbes d'action et résultats chiffrés " +
        "quand mes documents les donnent ; 1 à 2 pages (300 à 900 mots).");
    }
    if (doLetter) {
      rules.push("Lettre : 250 à 450 mots, une page ; ligne « Objet : Candidature au poste de " + (title || "…") + " » ; formule d'appel ; " +
        companyRef + " cité une ou deux fois ; 2 ou 3 exemples concrets tirés de mon parcours et reliés aux missions de l'offre ; " +
        "formule de politesse ; ton sobre et naturel, sans formules toutes faites.");
    }
    rules.push("Rédige " + (doCv && doLetter ? "le CV et la lettre" : doCv ? "le CV" : "la lettre") +
      " dans la langue de la fiche de poste ; le reste de ta réponse en français.");
    L.push("", "## Règles à respecter", ...rules.map((x, i) => i + 1 + ". " + x));

    // ---- Format de réponse
    const out = ["**Diagnostic** : en 5 lignes maximum, ce qui freine le plus ma candidature."];
    if (doCv) out.push("**CV optimisé** : le CV complet, en texte structuré, prêt à copier dans Word ou Google Docs.");
    if (doLetter) out.push("**Lettre de motivation " + (newLetter ? "rédigée" : "optimisée") + "** : la lettre complète, prête à copier.");
    out.push("**Modifications** : un tableau « Avant / Après / Pourquoi » des changements importants, avec les mots-clés ajoutés.");
    out.push("**Questions** : les compétences demandées que tu n'as pas pu placer faute d'éléments, avec pour chacune une question pour savoir si et où je l'ai pratiquée. Quand je t'aurai répondu, mets à jour " +
      (doCv && doLetter ? "le CV et la lettre" : doCv ? "le CV" : "la lettre") + ".");
    L.push("", "## Format de ta réponse", ...out.map((x, i) => i + 1 + ". " + x));

    return L.join("\n");
  };
})();
