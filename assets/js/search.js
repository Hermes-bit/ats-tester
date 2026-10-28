/* ATS Tester — recherche booléenne dans « Mes candidatures »
 * Opérateurs : AND / ET, OR / OU, NOT / SAUF (ou -mot), parenthèses, "expression exacte", champ:valeur.
 * Exemples : QGIS AND (Rennes OR Nantes) NOT stage · entreprise:alpha · statut:entretien · "chef de projet"
 * Sans opérateur, les mots sont combinés en AND. La recherche ignore les accents et les majuscules.
 */
window.ATS = window.ATS || {};

(function () {
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
  const OPS = { and: "AND", et: "AND", "&&": "AND", "&": "AND", or: "OR", ou: "OR", "||": "OR", "|": "OR", not: "NOT", sauf: "NOT", "!": "NOT" };
  const FIELDS = { entreprise: "entreprise", company: "entreprise", societe: "entreprise", poste: "poste", title: "poste", intitule: "poste",
    statut: "statut", status: "statut", notes: "notes", note: "notes", offre: "offre", annonce: "offre", jd: "offre", cv: "cv",
    lettre: "lettre", letter: "lettre", competence: "competences", competences: "competences", skill: "competences", skills: "competences",
    ville: "ville", lieu: "ville" };

  function tokenize(q) {
    const out = [];
    const re = /\s*(?:(\()|(\))|([-!])?(?:([a-zà-ÿ]+):)?(?:"([^"]*)"?|«([^»]*)»?|([^\s()"«!]+)))/giy;
    let m, last = -1;
    while (re.lastIndex < q.length && re.lastIndex !== last) {
      last = re.lastIndex;
      m = re.exec(q);
      if (!m) break;
      if (m[1]) { out.push({ t: "(" }); continue; }
      if (m[2]) { out.push({ t: ")" }); continue; }
      const phrase = m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : null;
      const word = m[7];
      const fieldRaw = m[4] ? fold(m[4]) : null;
      const field = fieldRaw && FIELDS[fieldRaw] ? FIELDS[fieldRaw] : null;
      if (!phrase && word !== undefined && !m[3] && !fieldRaw && OPS[word.toLowerCase()]) { out.push({ t: OPS[word.toLowerCase()] }); continue; }
      let value = phrase !== null ? phrase : word || "";
      if (fieldRaw && !field) value = m[4] + ":" + value; // « http://… » ou champ inconnu : texte normal
      value = fold(value.replace(/\*+$/, ""));
      if (!value) continue;
      const term = { t: "TERM", value, field, phrase: phrase !== null };
      if (m[3]) { out.push({ t: "NOT" }); }
      out.push(term);
    }
    return out;
  }

  /** Arbre de la requête (null si vide). Tolère les parenthèses manquantes ou en trop et les opérateurs orphelins. */
  function parse(q) {
    const toks = tokenize(String(q || ""));
    let i = 0;
    const peek = () => toks[i];
    function primary() {
      const t = peek();
      if (!t) return null;
      if (t.t === "(") {
        i++;
        const e = orExpr();
        if (peek() && peek().t === ")") i++;
        return e;
      }
      if (t.t === "TERM") { i++; return t; }
      return null;
    }
    function notExpr() {
      let neg = false;
      while (peek() && peek().t === "NOT") { neg = !neg; i++; }
      const p = primary();
      if (!p) return null;
      return neg ? { t: "NOT", e: p } : p;
    }
    function andExpr() {
      let left = notExpr();
      while (peek() && peek().t !== "OR" && peek().t !== ")") {
        if (peek().t === "AND") i++;
        const right = notExpr();
        if (!right) { if (peek() && peek().t !== "OR" && peek().t !== ")") { i++; continue; } break; }
        left = left ? { t: "AND", a: left, b: right } : right;
      }
      return left;
    }
    function orExpr() {
      let left = andExpr();
      while (peek() && peek().t === "OR") {
        i++;
        const right = andExpr();
        if (right) left = left ? { t: "OR", a: left, b: right } : right;
      }
      return left;
    }
    let tree = null;
    while (i < toks.length) {
      const e = orExpr();
      if (e) tree = tree ? { t: "AND", a: tree, b: e } : e;
      if (peek() && peek().t === ")") i++; // parenthèse fermante en trop
      else if (!e) i++;
    }
    return tree;
  }

  function evaluate(node, doc) {
    if (!node) return true;
    switch (node.t) {
      case "AND": return evaluate(node.a, doc) && evaluate(node.b, doc);
      case "OR": return evaluate(node.a, doc) || evaluate(node.b, doc);
      case "NOT": return !evaluate(node.e, doc);
      default: {
        const hay = node.field ? doc.fields[node.field] || "" : doc.all;
        return hay.includes(node.value);
      }
    }
  }

  /** Index de recherche d'une candidature (textes repliés, sans accents). */
  function indexApplication(a) {
    const p = a.profile || {};
    const fields = {
      entreprise: fold(a.company), poste: fold(a.title), statut: fold(a.status), notes: fold(a.notes), offre: fold(a.jdText),
      cv: fold((a.cvText || "") + " " + (p.unparsed_rich_text || "")), lettre: fold(a.letterText),
      competences: fold((p.competences || []).map((c) => c.nom_skill).join(" ")),
      ville: fold(p.candidat && p.candidat.localisation ? p.candidat.localisation.ville : ""),
    };
    return { fields, all: Object.values(fields).join(" \u0001 ") };
  }

  /** Fonction de filtre prête à l'emploi : ATS.search.compile("QGIS AND NOT stage")(candidature) → true/false */
  function compile(q) {
    const tree = parse(q);
    const cache = new WeakMap();
    return (a) => {
      if (!tree) return true;
      let doc = cache.get(a);
      if (!doc) { doc = indexApplication(a); cache.set(a, doc); }
      return evaluate(tree, doc);
    };
  }

  ATS.search = { tokenize, parse, evaluate, indexApplication, compile, fold };
})();
