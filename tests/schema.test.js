// Brique 1 : le script supabase/schema.sql s'exécute sur un vrai Postgres (PGlite) et les vues
// renvoient le schéma Candidat / Expérience / Formation / Compétence, avec la durée calculée et les règles d'accès.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const loadATS = require("./helpers/load");
const { NOW, CV_OK, JD } = loadATS;
const ATS = loadATS();

const SQL = fs.readFileSync(path.join(__dirname, "..", "supabase", "schema.sql"), "utf8");
const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
jest.setTimeout(120000);

let res;
beforeAll(() => {
  const r = ATS.analyze({ jdText: JD, title: "Géomaticien SIG", cv: { text: CV_OK }, now: NOW });
  const { cv_texte_brut, ...candidat } = r.cv.profile.candidat;
  const mine = { company: "Alpha Géo", title: "Géomaticien SIG", cvText: CV_OK, statusAuto: r.status, profile: { ...r.cv.profile, candidat, unparsed_rich_text: "projet Kaggle de cartographie" } };
  const other = { company: "Autre", profile: { candidat: { nom: "X" }, experiences: [{ intitule_poste: "Y", date_debut: "2020-01-01", date_fin: "2020-12-01" }], formations: [], competences: [] } };
  const as = (uid) => `select set_config('request.jwt.claim.sub', '${uid}', false);`;
  const steps = [
    // Ce que Supabase fournit déjà : schéma auth, auth.uid(), rôle authenticated
    { exec: `create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role authenticated;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${ME}'), ('${OTHER}');` },
    { exec: SQL },
    { exec: SQL }, // relançable sans erreur
    { query: "insert into public.applications (user_id, id, data) values ($1, $2, $3), ($4, $5, $6)", params: [ME, "app1", JSON.stringify(mine), OTHER, "app2", JSON.stringify(other)] },
    // Comme sur Supabase : le schéma extensions est accessible et dans le chemin de recherche
    { exec: "grant usage on schema extensions to authenticated; set role authenticated; set search_path = public, extensions; " + as(ME) },
    { name: "candidats", query: "select * from public.candidats" },
    { name: "experiences", query: "select intitule_poste, intitule_normalise, entreprise, date_fin is null as sans_fin, duree_mois, est_poste_actuel from public.experiences_professionnelles order by rang" },
    { name: "formations", query: "select nom_diplome, niveau_normalized, institution, annee_obtention from public.formations order by rang" },
    { name: "competences", query: "select nom_skill, recence_annee from public.competences where nom_skill in ('Python', 'SQL') order by nom_skill" },
    { name: "fts", query: "select id from public.applications where to_tsvector('french', coalesce(data -> 'profile' ->> 'unparsed_rich_text', '') || ' ' || coalesce(data ->> 'cvText', '')) @@ websearch_to_tsquery('french', 'kaggle -alternance')" },
    { name: "fts_not", query: "select id from public.applications where to_tsvector('french', coalesce(data -> 'profile' ->> 'unparsed_rich_text', '') || ' ' || coalesce(data ->> 'cvText', '')) @@ websearch_to_tsquery('french', 'kaggle -stage')" },
    { name: "trgm", query: "select id from public.applications where (data -> 'profile' ->> 'unparsed_rich_text') % 'projet kagle cartographie'" },
    { name: "indexes", query: "select indexname from pg_indexes where tablename = 'applications' order by indexname" },
    { exec: as(OTHER) },
    { name: "other", query: "select (select count(*)::int from public.candidats where id = 'app1') as candidats, (select count(*)::int from public.experiences_professionnelles where id_candidat = 'app1') as experiences, (select count(*)::int from public.experiences_professionnelles) as les_siennes" },
    { name: "other_write", query: "update public.applications set data = '{}'::jsonb where id = 'app1' returning id" },
  ];
  const raw = execFileSync(process.execPath, [path.join(__dirname, "helpers", "pg-run.mjs")], { input: JSON.stringify({ steps }), encoding: "utf8", timeout: 110000 });
  res = JSON.parse(raw);
});

test("le script s'exécute (deux fois de suite) sans erreur", () => {
  expect(res.error).toBeNull();
  expect(res.out.indexes.map((r) => r.indexname)).toEqual(expect.arrayContaining(["applications_fulltext", "applications_unparsed_trgm"]));
});

test("vue candidats : coordonnées normalisées, CV brut, statut ATS ; uniquement mes lignes", () => {
  const rows = res.out.candidats;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: "app1", nom: "BARRY", prenom: "Hermès", email: "hermes.barry@example.com", telephone: "+33612345678", ville: "Rennes", code_postal: "35000", pays: "France", salaire_souhaite: 38000, statut_ats: "OK" });
  expect(rows[0].cv_texte_brut).toContain("Alpha Géo");
});

test("vue expériences : durée en mois calculée par Postgres, identique au calcul du navigateur", () => {
  const rows = res.out.experiences;
  expect(rows.map((r) => r.intitule_normalise)).toEqual(["GIS_ANALYST", "GIS_ANALYST", "GIS_ANALYST"]);
  expect(rows[1]).toMatchObject({ entreprise: "Beta Conseil", duree_mois: 28, est_poste_actuel: false });
  expect(rows[2].duree_mois).toBe(6);
  expect(rows[0]).toMatchObject({ est_poste_actuel: true, sans_fin: true });
  expect(rows[0].duree_mois).toBeGreaterThanOrEqual(46); // poste actuel : jusqu'à aujourd'hui
});

test("vues formations et compétences", () => {
  expect(res.out.formations[0]).toEqual({ nom_diplome: "Master 2 Géomatique", niveau_normalized: "Bac+5", institution: "Université Rennes 2", annee_obtention: 2020 });
  expect(res.out.competences).toEqual([{ nom_skill: "Python", recence_annee: 2026 }, { nom_skill: "SQL", recence_annee: null }]);
});

test("recherche plein texte et trigrammes sur unparsed_rich_text", () => {
  expect(res.out.fts.map((r) => r.id)).toEqual(["app1"]);
  expect(res.out.fts_not).toEqual([]); // le CV contient « Stage » : exclu par l'opérateur NOT
  expect(res.out.trgm.map((r) => r.id)).toEqual(["app1"]);
});

test("un autre utilisateur ne voit ni ne modifie mes données", () => {
  expect(res.out.other[0]).toEqual({ candidats: 0, experiences: 0, les_siennes: 1 });
  expect(res.out.other_write).toEqual([]);
});
