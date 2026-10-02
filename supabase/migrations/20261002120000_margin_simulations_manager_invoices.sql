-- v1.14.0 — Historique partagé du simulateur de marge (Admin + Manager)
-- et liaison des factures HubSpot ouverte aux Managers.
-- Les policies Admin existantes sur project_invoices restent en place (additif).
-- projects (deal, devis, calendrier) est déjà modifiable par tout utilisateur authentifié.
-- profiles_protect_privileged / user-admin / fleet admin ne sont pas touchés.

create table if not exists public.margin_simulations (
  id uuid primary key default gen_random_uuid(),
  name text null,
  created_by uuid null references public.profiles (id) on delete set null,
  updated_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lien pour comparer plus tard la simulation à la marge réelle du même contact / deal.
  hubspot_contact_id text null,
  hubspot_contact_name text null,
  hubspot_deal_id text null,
  hubspot_quote_id text null,
  project_id uuid null references public.projects (id) on delete set null,

  inputs jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,

  ca_ht numeric null,
  mb numeric null,
  ma numeric null,
  mb_pct numeric null,
  ma_pct numeric null
);

comment on table public.margin_simulations is
  'Simulations Marges › Simulateur (Admin + Manager, historique partagé). inputs = formulaire complet, result = snapshot calculateProjectMargin (MA/MB/%, CA HT…). hubspot_* et project_id préparent la comparaison sim vs marge réelle.';

comment on column public.margin_simulations.ma_pct is 'Ratio MA/CA (0.32 = 32 %), identique à calculateProjectMargin.maPct.';
comment on column public.margin_simulations.mb_pct is 'Ratio MB/CA (0.40 = 40 %).';

create index if not exists margin_simulations_updated_at_idx
  on public.margin_simulations (updated_at desc);
create index if not exists margin_simulations_contact_idx
  on public.margin_simulations (hubspot_contact_id);
create index if not exists margin_simulations_deal_idx
  on public.margin_simulations (hubspot_deal_id);
create index if not exists margin_simulations_project_idx
  on public.margin_simulations (project_id);

create or replace function public.set_margin_simulations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists margin_simulations_set_updated_at on public.margin_simulations;
create trigger margin_simulations_set_updated_at
  before update on public.margin_simulations
  for each row
  execute function public.set_margin_simulations_updated_at();

-- Force l'auteur : un Manager ne peut pas écrire created_by à la place d'un autre.
create or replace function public.margin_simulations_stamp_actor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists margin_simulations_stamp_actor on public.margin_simulations;
create trigger margin_simulations_stamp_actor
  before insert or update on public.margin_simulations
  for each row
  execute function public.margin_simulations_stamp_actor();

alter table public.margin_simulations enable row level security;

drop policy if exists margin_simulations_manager_all on public.margin_simulations;
create policy margin_simulations_manager_all
  on public.margin_simulations
  for all
  to authenticated
  using (public.margin_can_manage())
  with check (public.margin_can_manage());

grant select, insert, update, delete on public.margin_simulations to authenticated;
grant execute on function public.set_margin_simulations_updated_at() to authenticated;
grant execute on function public.margin_simulations_stamp_actor() to authenticated;

-- Factures liées au chantier : Admin (policies existantes) + Manager.
drop policy if exists project_invoices_manager_insert on public.project_invoices;
create policy project_invoices_manager_insert
  on public.project_invoices for insert to authenticated
  with check (public.margin_can_manage());

drop policy if exists project_invoices_manager_update on public.project_invoices;
create policy project_invoices_manager_update
  on public.project_invoices for update to authenticated
  using (public.margin_can_manage())
  with check (public.margin_can_manage());

drop policy if exists project_invoices_manager_delete on public.project_invoices;
create policy project_invoices_manager_delete
  on public.project_invoices for delete to authenticated
  using (public.margin_can_manage());

notify pgrst, 'reload schema';
