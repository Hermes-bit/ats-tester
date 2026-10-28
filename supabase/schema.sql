-- ATS Tester : base Supabase pour la synchronisation entre appareils.
-- À exécuter dans Supabase > SQL Editor > New query > Run (le script peut être relancé sans risque).
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes (Row Level Security).

-- =====================================================================
-- 1. Table des candidatures (une ligne par candidature, document JSON complet : zéro perte)
-- =====================================================================
create table if not exists public.applications (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.applications enable row level security;

drop policy if exists "Lire ses candidatures" on public.applications;
drop policy if exists "Ajouter ses candidatures" on public.applications;
drop policy if exists "Modifier ses candidatures" on public.applications;
drop policy if exists "Supprimer ses candidatures" on public.applications;

create policy "Lire ses candidatures" on public.applications
  for select to authenticated using (auth.uid() = user_id);
create policy "Ajouter ses candidatures" on public.applications
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Modifier ses candidatures" on public.applications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Supprimer ses candidatures" on public.applications
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.applications to authenticated;

-- =====================================================================
-- 2. Schéma ATS normalisé : Candidat, Expérience professionnelle, Formation, Compétence
--    Le CV analysé est enregistré dans data->'profile' ; ces vues l'exposent en tables.
--    security_invoker : les vues appliquent les règles d'accès de la table (chacun ses lignes).
-- =====================================================================
create or replace function public.ats_date(t text) returns date
  language sql stable set search_path = '' as
$$ select case when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date end $$;

create or replace function public.ats_int(t text) returns integer
  language sql stable set search_path = '' as
$$ select case when t ~ '^-?\d{1,9}(\.0+)?$' then t::numeric::integer end $$;

create or replace view public.candidats with (security_invoker = true) as
select
  a.user_id,
  a.id                                              as id,
  p -> 'candidat' ->> 'nom'                         as nom,
  p -> 'candidat' ->> 'prenom'                      as prenom,
  p -> 'candidat' ->> 'email'                       as email,
  p -> 'candidat' ->> 'telephone'                   as telephone,
  p -> 'candidat' -> 'localisation' ->> 'ville'       as ville,
  p -> 'candidat' -> 'localisation' ->> 'code_postal' as code_postal,
  p -> 'candidat' -> 'localisation' ->> 'pays'        as pays,
  p -> 'candidat' ->> 'statut_visa'                 as statut_visa,
  public.ats_int(p -> 'candidat' ->> 'salaire_souhaite')   as salaire_souhaite,
  public.ats_date(p -> 'candidat' ->> 'date_disponibilite') as date_disponibilite,
  a.data ->> 'cvText'                               as cv_texte_brut,
  p ->> 'unparsed_rich_text'                        as unparsed_rich_text,
  a.data ->> 'statusAuto'                           as statut_ats
from public.applications a
cross join lateral (select a.data -> 'profile' as p) x
where jsonb_typeof(a.data -> 'profile') = 'object';

create or replace view public.experiences_professionnelles with (security_invoker = true) as
select
  a.user_id,
  a.id                              as id_candidat,
  e.ord::int                        as rang,
  e.v ->> 'intitule_poste'          as intitule_poste,
  e.v ->> 'intitule_normalise'      as intitule_normalise,
  e.v ->> 'entreprise'              as entreprise,
  d.date_debut,
  d.date_fin,
  case when m.mois > 0 then m.mois end as duree_mois, -- calculée, poste actuel jusqu'à aujourd'hui
  e.v ->> 'description_poste'       as description_poste,
  coalesce((e.v ->> 'est_poste_actuel')::boolean, false) as est_poste_actuel
from public.applications a
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(a.data -> 'profile' -> 'experiences') = 'array' then a.data -> 'profile' -> 'experiences' else '[]'::jsonb end
) with ordinality as e(v, ord)
cross join lateral (select public.ats_date(e.v ->> 'date_debut') as date_debut, public.ats_date(e.v ->> 'date_fin') as date_fin) d
cross join lateral (
  select ((extract(year from coalesce(d.date_fin, current_date)) - extract(year from d.date_debut)) * 12
        + extract(month from coalesce(d.date_fin, current_date)) - extract(month from d.date_debut) + 1)::int as mois
) m;

create or replace view public.formations with (security_invoker = true) as
select
  a.user_id,
  a.id                          as id_candidat,
  f.ord::int                    as rang,
  f.v ->> 'nom_diplome'         as nom_diplome,
  f.v ->> 'niveau_normalized'   as niveau_normalized,
  f.v ->> 'institution'         as institution,
  public.ats_int(f.v ->> 'annee_obtention') as annee_obtention
from public.applications a
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(a.data -> 'profile' -> 'formations') = 'array' then a.data -> 'profile' -> 'formations' else '[]'::jsonb end
) with ordinality as f(v, ord);

create or replace view public.competences with (security_invoker = true) as
select
  a.user_id,
  a.id                          as id_candidat,
  c.v ->> 'nom_skill'           as nom_skill,
  public.ats_int(c.v ->> 'recence_annee') as recence_annee,
  c.v ->> 'contexte_texte'      as contexte_texte
from public.applications a
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(a.data -> 'profile' -> 'competences') = 'array' then a.data -> 'profile' -> 'competences' else '[]'::jsonb end
) as c(v);

grant select on public.candidats, public.experiences_professionnelles, public.formations, public.competences to authenticated;

-- =====================================================================
-- 3. Recherche plein texte sur le texte non découpé (unparsed_rich_text) et le CV brut
--    Trigrammes (recherche approchée, ILIKE '%…%') et index plein texte en français.
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create index if not exists applications_unparsed_trgm on public.applications
  using gin ((data -> 'profile' ->> 'unparsed_rich_text') extensions.gin_trgm_ops);
create index if not exists applications_fulltext on public.applications
  using gin (to_tsvector('french'::regconfig, coalesce(data -> 'profile' ->> 'unparsed_rich_text', '') || ' ' || coalesce(data ->> 'cvText', '')));

-- Exemples :
--   select * from public.experiences_professionnelles where intitule_normalise = 'GIS_ANALYST';
--   select id, company from (select id, data ->> 'company' as company, data from public.applications) a
--     where to_tsvector('french', coalesce(data -> 'profile' ->> 'unparsed_rich_text', '') || ' ' || coalesce(data ->> 'cvText', ''))
--           @@ websearch_to_tsquery('french', 'qgis -stage');
