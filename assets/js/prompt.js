/* ATS Tester — prompt pour une IA générative
 * Transforme le résultat de l'analyse en consignes prêtes à coller dans ChatGPT, Claude, Gemini, Le Chat…
 * Deux modes :
 *   - "edit"    : retouches de texte précises, à reporter dans le document d'origine sans toucher à sa charte graphique ;
 *   - "rewrite" : réécriture complète du CV et de la lettre en texte structuré.
 * Dans les deux cas, l'IA ne doit rien inventer et pose des questions sur les compétences manquantes.
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
  const pagesOf = (m) => (m && m.pages ? m.pages + " page" + (m.pages > 1 ? "s" : "") : null);

  function describeDoc(meta, words) {
    const m = meta || {};
    const bits = [pagesOf(m), words ? words + " mots" : null].filter(Boolean);
    const src = m.type === "pdf" ? "Texte extrait de mon PDF" : m.type === "docx" ? "Texte extrait de mon fichier Word" : "Texte de mon document";
    return src + (bits.length ? " (" + bits.join(", ") + ")" : "") + "." +
      (m.type === "pdf" ? " L'ordre des lignes peut différer de la mise en page réelle." : "");
  }

  /**
   * @param r     résultat de ATS.analyze
   * @param opts  { title, company, url, jdText, cvText, letterText, cvMeta, letterMeta, target, mode, maskContacts }
   *              target : "both" | "cv" | "letter" | "cv-newletter"
   *              mode   : "edit" (défaut) | "rewrite"
   */
  ATS.buildPrompt = function (r, opts) {
    const o = opts || {};
    const target = o.target || (r.cv && r.letter ? "both" : r.cv ? "cv" : "letter");
    const edit = o.mode !== "rewrite";
    const doCv = target !== "letter";
    const doLetter = target !== "cv";
    const newLetter = target === "cv-newletter";
    const editLetter = doLetter && !newLetter;
    const clean = (t) => (o.maskContacts ? maskContacts(t) : t || "");
    const title = (o.title || "").trim();
    const company = (o.company || "").trim();
    const titleRef = title ? "« " + title + " »" : "l'intitulé du poste";
    const companyRef = company ? "« " + company + " »" : "le nom de l'entreprise";
    const docsRef = doCv && doLetter ? "le CV et la lettre" : doCv ? "le CV" : "la lettre";

    const goal = {
      both: "perfectionner mon CV et ma lettre de motivation",
      cv: "perfectionner mon CV",
      letter: "perfectionner ma lettre de motivation",
      "cv-newletter": "perfectionner mon CV et à rédiger ma lettre de motivation",
    }[target];

    const L = [];
    let intro = "Tu es un recruteur expérimenté, spécialiste des logiciels de tri de candidatures (ATS). Aide-moi à " + goal +
      " pour l'offre ci-dessous, afin de passer le filtre automatique puis de convaincre le recruteur.";
    if (edit) {
      const both = target === "both";
      intro += " " + (both ? "Mon CV et ma lettre sont déjà mis" : target === "letter" ? "Ma lettre est déjà mise" : "Mon CV est déjà mis") +
        " en page et je veux garder " + (both ? "leur" : "sa") + " charte graphique (mise en page, polices, couleurs, rubriques) : " +
        "propose-moi uniquement des modifications de texte précises, que je reporterai moi-même dans " + (both ? "mes fichiers" : "mon fichier") + ".";
    }
    L.push(intro);

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
    if (issues.length) L.push("", "### Problèmes détectés", ...issues);

    // ---- Documents
    L.push("", "## Fiche de poste", quote(o.jdText || ""));
    if (o.maskContacts && (o.cvText || o.letterText)) {
      L.push("", "Mes coordonnées ont été remplacées par [E-MAIL] et [TÉLÉPHONE] : garde ces marqueurs tels quels dans tes propositions.");
    }
    if (edit && (o.cvText || o.letterText)) {
      L.push("", "Si je joins mes fichiers à ce message, appuie-toi dessus pour voir la mise en page et la place disponible dans chaque bloc.");
    }
    if (o.cvText) {
      L.push("", "## Mon CV actuel", describeDoc(o.cvMeta, r.cv && r.cv.words) + (doCv ? "" : " Sers-t'en comme source de faits pour la lettre."),
        quote(clean(o.cvText)));
    }
    if (o.letterText) {
      L.push("", "## Ma lettre de motivation actuelle" + (doLetter ? "" : " (pour contexte)"), describeDoc(o.letterMeta, r.letter && r.letter.words),
        quote(clean(o.letterText)));
    }

    // ---- Règles
    const rules = [
      "N'invente rien : aucune compétence, expérience, diplôme, chiffre ou date absent de mes documents. S'il manque une information, écris [À COMPLÉTER].",
      "N'ajoute une compétence demandée que si mes documents montrent que je l'ai pratiquée, même sous un autre nom. Sinon, garde-la pour tes questions finales.",
      "Reprends les mots exacts de l'offre (orthographe, sigles, intitulés) : un ATS cherche souvent la forme exacte" +
        (title ? ", par exemple " + titleRef : firstMissing ? ", par exemple « " + firstMissing.label + " »" : "") + ".",
    ];
    if (edit) {
      const fit = [];
      if (doCv) fit.push("le CV tienne toujours sur " + (pagesOf(o.cvMeta) || "le même nombre de pages"));
      if (editLetter) fit.push((doCv ? "la lettre sur " : "la lettre tienne toujours sur ") + (pagesOf(o.letterMeta) || "une page"));
      rules.push(
        "Respecte la charte graphique : ne change ni la mise en page, ni les polices, ni les couleurs, ni l'ordre ou le nombre des rubriques. " +
          "Propose seulement de remplacer, d'ajouter ou de supprimer du texte à l'intérieur des blocs existants.",
        "Garde la même longueur : chaque nouveau texte doit faire à peu près la longueur de celui qu'il remplace (±15 %), pour que " + fit.join(" et ") +
          ". Pour ajouter un mot-clé, remplace ou raccourcis un passage moins utile du même bloc.",
        "Garde mes conventions d'écriture : format des dates, majuscules, puces, ponctuation, style (phrases ou style télégraphique) et vocabulaire.",
        "Cite le texte actuel à l'identique, tel qu'il apparaît dans mon document, pour que je le retrouve avec Ctrl+F. " +
          "Si l'extraction a abîmé des mots (ligatures « fi », mots coupés, lignes dans le désordre), reconstitue le texte réel."
      );
      if (doCv) {
        rules.push("Priorités pour le CV : " + titleRef + " en titre sous mon nom, puis les compétences demandées absentes, placées dans les rubriques existantes " +
          "(accroche, compétences, missions), puis le reste. 15 modifications au maximum, les plus utiles d'abord.");
      }
      if (editLetter) {
        rules.push("Pour la lettre : garde le même nombre de paragraphes et la même structure ; ajoute l'objet (« Objet : Candidature au poste de " + (title || "…") +
          " »), la formule d'appel, " + companyRef + " ou la formule de politesse s'ils manquent ; illustre 1 ou 2 compétences demandées par un exemple tiré de mon parcours.");
      }
      rules.push("Si un élément de ma mise en page gêne les ATS (deux colonnes, tableau, icônes à la place du texte, ligatures, coordonnées en en-tête ou pied de page), " +
        "signale-le avec la correction la plus légère possible qui préserve le design, sans l'imposer.");
    } else if (doCv) {
      rules.push("CV : une seule colonne, sans tableau, zone de texte ni image ; " + titleRef + " en titre sous mon nom ; rubriques standards " +
        "(Expériences professionnelles, Formation, Compétences) ; dates au format « Mois AAAA – Mois AAAA » ; verbes d'action et résultats chiffrés " +
        "quand mes documents les donnent ; 1 à 2 pages (300 à 900 mots).");
    }
    if (doLetter && (!edit || newLetter)) {
      rules.push("Lettre : 250 à 450 mots, une page ; ligne « Objet : Candidature au poste de " + (title || "…") + " » ; formule d'appel ; " +
        companyRef + " cité une ou deux fois ; 2 ou 3 exemples concrets tirés de mon parcours et reliés aux missions de l'offre ; " +
        "formule de politesse ; ton sobre et naturel, sans formules toutes faites.");
    }
    rules.push((edit ? "Rédige les nouveaux textes" : "Rédige " + docsRef) + " dans la langue de " +
      (edit ? "mon document" : "la fiche de poste") + " ; le reste de ta réponse en français.");
    L.push("", "## Règles à respecter", ...rules.map((x, i) => i + 1 + ". " + x));

    // ---- Format de réponse
    const out = ["**Diagnostic** : en 5 lignes maximum, ce qui freine le plus ma candidature."];
    if (edit) {
      const editFormat = "\n   - Emplacement : la rubrique et le bloc concernés" +
        "\n   - Action : Remplacer, Ajouter après ou Supprimer" +
        "\n   - Texte actuel : « … » (à l'identique)" +
        "\n   - Nouveau texte : « … »" +
        "\n   - Pourquoi : mot-clé ajouté ou problème corrigé, priorité haute ou moyenne" +
        "\n   - Longueur : nombre de caractères avant → après";
      if (doCv) out.push("**Modifications du CV**, numérotées dans l'ordre du document (de haut en bas). Pour chacune :" + editFormat);
      if (editLetter) out.push("**Modifications de la lettre**, paragraphe par paragraphe, " + (doCv ? "au même format." : "numérotées. Pour chacune :" + editFormat));
      if (newLetter) out.push("**Lettre de motivation rédigée** : la lettre complète, prête à copier dans le même style que mon CV.");
      out.push("**Mise en page** : les éléments de design qui gênent les ATS et la correction la plus légère pour chacun, ou « rien à signaler ».");
      out.push("**Questions** : les compétences demandées que tu n'as pas pu placer faute d'éléments, avec pour chacune une question pour savoir si et où je l'ai pratiquée, " +
        "et la modification prête à appliquer si je confirme (emplacement, texte actuel, nouveau texte).");
    } else {
      if (doCv) out.push("**CV optimisé** : le CV complet, en texte structuré, prêt à copier dans Word ou Google Docs.");
      if (doLetter) out.push("**Lettre de motivation " + (newLetter ? "rédigée" : "optimisée") + "** : la lettre complète, prête à copier.");
      out.push("**Modifications** : un tableau « Avant / Après / Pourquoi » des changements importants, avec les mots-clés ajoutés.");
      out.push("**Questions** : les compétences demandées que tu n'as pas pu placer faute d'éléments, avec pour chacune une question pour savoir si et où je l'ai pratiquée. " +
        "Quand je t'aurai répondu, mets à jour " + docsRef + ".");
    }
    L.push("", "## Format de ta réponse", ...out.map((x, i) => i + 1 + ". " + x));

    return L.join("\n");
  };
})();
