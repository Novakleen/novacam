-- v1.23.0 — chantiers signés pas encore facturés.
-- Non appliquée en production par l'agent : à lancer avec le déploiement.
--
-- Le CLI a proposé 20261013132129, qui se trierait avant des migrations déjà
-- livrées (jusqu'à 20261013230000). Le fichier est donc daté juste après.

alter table public.treso_settings
  add column if not exists signed_deal_stage_ids text[] not null
  default array['582811874', '4195566808', '4898287842']::text[];

comment on column public.treso_settings.signed_deal_stage_ids is
  'Ids HubSpot dealstage traités comme signés / gagnés. L''étape facturée 4197112018 n''en fait pas partie.';

create table if not exists public.treso_signed_jobs (
  hubspot_deal_id text primary key,
  label text,
  client_name text,
  contact_email text,
  hubspot_quote_id text,
  amount_ttc numeric(12,2),
  event_date date,
  google_calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.treso_signed_jobs is
  'Deals HubSpot signés sans facture. amount_ttc = postes du devis × 1,06. event_date null = sans date, hors courbe.';

comment on column public.treso_signed_jobs.contact_email is
  'Email du contact du deal, pour rapprocher l''agenda hello@novakleen.be. Lecture Admin seulement.';

drop trigger if exists treso_signed_jobs_set_updated_at on public.treso_signed_jobs;
create trigger treso_signed_jobs_set_updated_at
  before update on public.treso_signed_jobs
  for each row execute function public.treso_set_updated_at();

alter table public.treso_signed_jobs enable row level security;

drop policy if exists treso_signed_jobs_admin_all on public.treso_signed_jobs;
create policy treso_signed_jobs_admin_all
  on public.treso_signed_jobs
  for all to authenticated
  using (public.treso_can_access())
  with check (public.treso_can_access());

revoke all on table public.treso_signed_jobs from public, anon;
grant select, insert, update, delete on table public.treso_signed_jobs to authenticated;
