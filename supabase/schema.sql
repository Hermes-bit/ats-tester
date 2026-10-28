-- ATS Tester : table des candidatures pour la synchronisation entre appareils.
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes (Row Level Security).

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
