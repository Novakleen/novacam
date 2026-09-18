-- Project-linked margin dossiers: snapshot columns + uniqueness
-- Already applied on novaquote (live Supabase). This file documents the schema in git only.
-- Do not re-apply via CLI unless recreating an empty environment.

alter table public.margin_dossiers
  add column if not exists companycam_project_id text,
  add column if not exists generated_at timestamptz,
  add column if not exists source_fingerprint text,
  add column if not exists ma numeric,
  add column if not exists mb numeric,
  add column if not exists ma_pct numeric,
  add column if not exists direct_cost numeric,
  add column if not exists person_hours numeric;

create unique index if not exists margin_dossiers_project_id_uidx
  on public.margin_dossiers (project_id)
  where project_id is not null;

create unique index if not exists margin_dossiers_companycam_project_id_uidx
  on public.margin_dossiers (companycam_project_id)
  where companycam_project_id is not null;

create index if not exists margin_dossiers_companycam_project_id_idx
  on public.margin_dossiers (companycam_project_id);
