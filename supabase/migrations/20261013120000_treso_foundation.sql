-- v1.17.0 — Trésorerie : tables, RLS Admin, bucket PDF, clés d'import.
-- Reprise des chiffres : supabase/seeds/treso_echeancier_v1.sql (manuel, pas en prod).
--
-- spatial_ref_sys est à PostGIS (propriétaire supabase_admin, pas une table métier).
-- ENABLE ROW LEVEL SECURITY n'est tenté que si le rôle de migration possède la
-- table. Sinon on révoque anon. Si les deux échouent, le propriétaire doit lancer :
--   alter table public.spatial_ref_sys enable row level security;
--   revoke all on table public.spatial_ref_sys from anon;

create or replace function public.treso_can_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Admin'
  );
$$;

revoke all on function public.treso_can_access() from public, anon;
grant execute on function public.treso_can_access() to authenticated;

create or replace function public.treso_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── settings (1 ligne) ─────────────────────────────────────────────────────

create table if not exists public.treso_settings (
  id smallint primary key default 1 check (id = 1),
  collection_delay_days integer not null default 8,
  alert_threshold numeric(12,2) not null default 0,
  usual_revenue_ht_month numeric(12,2) not null default 27446.16,
  ttc_ratio numeric(8,4) not null default 1.0588,
  probable_enabled boolean not null default true,
  probable_start_date date,
  danny_rate numeric(6,4) not null default 0.075,
  danny_day integer not null default 13,
  withholding_rate numeric(6,4) not null default 0.28,
  withholding_due_day integer not null default 6,
  stale_after_business_days integer not null default 2,
  supplier_default_due_days integer not null default 30,
  horizon_weeks integer not null default 13,
  seasonality_coefficients numeric(8,4)[] not null
    default '{1,1,1,1,1,1,1,1,1,1,1,1}'::numeric(8,4)[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint treso_settings_seasonality_len check (cardinality(seasonality_coefficients) = 12)
);

comment on column public.treso_settings.seasonality_coefficients is
  'Janvier → décembre. Défaut 1.0, rempli plus tard.';

insert into public.treso_settings (id) values (1) on conflict (id) do nothing;

-- ─── comptes, soldes, imports ───────────────────────────────────────────────

create table if not exists public.treso_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  iban text unique,
  kind text not null check (kind in ('courant', 'carte')),
  include_in_cash boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.treso_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.treso_accounts (id) on delete cascade,
  balance_date date not null,
  balance numeric(12,2) not null,
  source text not null check (source in ('manuel', 'import')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (account_id, balance_date, source)
);

create table if not exists public.treso_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  file_sha256 text not null unique,
  kind text not null check (kind in ('accountable_xlsx', 'supplier_pdf')),
  channel text not null check (channel in ('ecran', 'api')),
  data_as_of date,
  rows_total integer,
  rows_inserted integer,
  rows_duplicate integer,
  date_min date,
  date_max date,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- ─── échéances, factures, banque ────────────────────────────────────────────

create table if not exists public.treso_commitments (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  counterparty text,
  category text not null check (category in (
    'salaires', 'secretariat_social', 'leasing', 'assurance', 'pret',
    'tva_impots', 'abonnement', 'honoraires', 'loyer', 'carburant',
    'publicite', 'matieres', 'sous_traitance', 'frais_bancaires', 'autre'
  )),
  kind text not null check (kind in ('fixe', 'variable')),
  direction text not null default 'out' check (direction in ('out', 'in')),
  amount numeric(12,2),
  frequency text check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  day_of_month integer,
  next_due_date date,
  end_date date,
  remaining_occurrences integer,
  spread_weekly boolean not null default false,
  amount_rule text not null default 'fixed' check (amount_rule in ('fixed', 'danny', 'precompte')),
  match_pattern text,
  is_active boolean not null default true,
  needs_review boolean not null default false,
  excluded_from_cash boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.treso_client_invoices (
  id uuid primary key default gen_random_uuid(),
  hubspot_invoice_id text unique,
  invoice_number text,
  hubspot_deal_id text,
  hubspot_contact_id text,
  client_name text,
  invoice_date date,
  due_date date,
  amount_ttc numeric(12,2),
  amount_ht numeric(12,2),
  hubspot_amount_paid numeric(12,2),
  hubspot_balance_due numeric(12,2),
  hubspot_status text,
  bank_paid_amount numeric(12,2) not null default 0,
  paid_at date,
  expected_date_override date,
  excluded_from_cash boolean not null default false,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.treso_supplier_bills (
  id uuid primary key default gen_random_uuid(),
  supplier_name text,
  booking_date date,
  amount_ttc numeric(12,2),
  accountable_category text,
  is_paid boolean not null default false,
  invoice_date date,
  invoice_number text,
  due_date date not null,
  due_date_source text not null default 'estimee'
    check (due_date_source in ('manuel', 'pdf', 'export', 'estimee')),
  payment_terms text,
  pdf_path text,
  extraction_confidence numeric,
  replaces_commitment_id uuid references public.treso_commitments (id) on delete set null,
  row_hash text not null unique,
  excluded_from_cash boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.treso_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.treso_accounts (id) on delete restrict,
  booking_date date not null,
  amount numeric(12,2) not null,
  counterparty_name text,
  counterparty_iban text,
  communication text,
  dedup_hash text not null unique,
  import_batch_id uuid references public.treso_import_batches (id) on delete set null,
  client_invoice_id uuid references public.treso_client_invoices (id) on delete set null,
  commitment_id uuid references public.treso_commitments (id) on delete set null,
  match_method text,
  match_status text not null default 'aucun'
    check (match_status in ('auto', 'a_valider', 'valide', 'aucun')),
  is_internal_transfer boolean not null default false,
  excluded_from_cash boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.treso_cash_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  label text not null,
  amount numeric(12,2) not null,
  direction text not null check (direction in ('out', 'in')),
  category text not null check (category in (
    'salaires', 'secretariat_social', 'leasing', 'assurance', 'pret',
    'tva_impots', 'tva', 'abonnement', 'honoraires', 'loyer', 'carburant',
    'publicite', 'matieres', 'sous_traitance', 'frais_bancaires', 'autre'
  )),
  excluded_from_cash boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.treso_calendar_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  google_calendar_event_id text,
  hubspot_deal_id text,
  hubspot_quote_id text,
  method text check (method in ('deal_id', 'email', 'nom_adresse', 'manuel')),
  score numeric,
  status text not null check (status in ('auto', 'a_valider', 'valide', 'rejete')),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (google_calendar_event_id, hubspot_deal_id)
);

-- Hash + préfixe seulement. L'edge function treso-import arrive en 1.18.0.
create table if not exists public.treso_api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text not null check (char_length(key_prefix) between 4 and 16),
  scope text not null default 'treso-import' check (scope = 'treso-import'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'treso_settings', 'treso_accounts', 'treso_balance_snapshots',
    'treso_import_batches', 'treso_commitments', 'treso_client_invoices',
    'treso_supplier_bills', 'treso_bank_transactions', 'treso_cash_events',
    'treso_calendar_links', 'treso_api_keys'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.treso_set_updated_at()',
      t || '_set_updated_at', t
    );
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.treso_can_access()) with check (public.treso_can_access())',
      t || '_admin_all', t
    );
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- ─── PDF fournisseurs (bucket privé, Admin) ─────────────────────────────────

insert into storage.buckets (id, name, public)
values ('treso-supplier-invoices', 'treso-supplier-invoices', false)
on conflict (id) do update set public = false, name = excluded.name;

alter table storage.objects enable row level security;

drop policy if exists treso_supplier_invoices_select on storage.objects;
create policy treso_supplier_invoices_select on storage.objects
  for select to authenticated
  using (bucket_id = 'treso-supplier-invoices' and public.treso_can_access());

drop policy if exists treso_supplier_invoices_insert on storage.objects;
create policy treso_supplier_invoices_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'treso-supplier-invoices' and public.treso_can_access());

drop policy if exists treso_supplier_invoices_update on storage.objects;
create policy treso_supplier_invoices_update on storage.objects
  for update to authenticated
  using (bucket_id = 'treso-supplier-invoices' and public.treso_can_access())
  with check (bucket_id = 'treso-supplier-invoices' and public.treso_can_access());

drop policy if exists treso_supplier_invoices_delete on storage.objects;
create policy treso_supplier_invoices_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'treso-supplier-invoices' and public.treso_can_access());

-- ─── phone_submissions ──────────────────────────────────────────────────────
-- NovaQuote (clé anon) insère la ligne. create-hubspot-lead n'écrit pas ici.
-- L'écran fait aussi un UPDATE email, puis un INSERT de repli si ça échoue.
-- Postgres n'applique un UPDATE que si la ligne est lisible : pas de SELECT
-- anon, donc pas d'UPDATE anon. Le repli INSERT (téléphone + adresse + email)
-- reste le chemin qui fonctionne. Admin lit.

create table if not exists public.phone_submissions (
  id bigint generated by default as identity primary key,
  phone_number text not null,
  created_at timestamptz not null default timezone('utc', now()),
  email text,
  address text,
  hubspot_lead_id text
);

alter table public.phone_submissions enable row level security;

drop policy if exists phone_submissions_anon_insert on public.phone_submissions;
create policy phone_submissions_anon_insert on public.phone_submissions
  for insert to anon
  with check (
    phone_number is not null and char_length(btrim(phone_number)) between 8 and 20
    and address is not null and char_length(btrim(address)) > 0
  );

drop policy if exists phone_submissions_anon_update_email on public.phone_submissions;
drop policy if exists phone_submissions_admin_all on public.phone_submissions;
create policy phone_submissions_admin_all on public.phone_submissions
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

revoke all on table public.phone_submissions from public, anon, authenticated;
grant insert on table public.phone_submissions to anon;
grant select, insert, update, delete on table public.phone_submissions to authenticated;

do $$
declare seq text;
begin
  seq := pg_get_serial_sequence('public.phone_submissions', 'id');
  if seq is not null then
    execute format('grant usage, select on sequence %s to anon, authenticated', seq);
  end if;
end $$;

-- ─── hubspot_funnel_cache (Admin + Manager, comme /hubspot-dashboard) ───────

create table if not exists public.hubspot_funnel_cache (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  sales_rep_id text not null,
  leads_count integer default 0,
  opportunities_count integer default 0,
  won_count integer default 0,
  invoiced_count integer default 0,
  lost_count integer default 0,
  en_cours_count integer default 0,
  conversion_rates jsonb default '{}'::jsonb,
  avg_contact_to_deal_days numeric default 0,
  avg_deal_to_closure_days numeric default 0,
  total_revenue numeric default 0,
  last_updated timestamptz default now(),
  unique (month, sales_rep_id)
);

alter table public.hubspot_funnel_cache enable row level security;

drop policy if exists hubspot_funnel_cache_office_all on public.hubspot_funnel_cache;
create policy hubspot_funnel_cache_office_all on public.hubspot_funnel_cache
  for all to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('Admin', 'Manager')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('Admin', 'Manager')
  ));

revoke all on table public.hubspot_funnel_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.hubspot_funnel_cache to authenticated;

-- ─── spatial_ref_sys ────────────────────────────────────────────────────────

do $spatial$
begin
  if to_regclass('public.spatial_ref_sys') is null then
    raise notice 'spatial_ref_sys absent (PostGIS non installé).';
    return;
  end if;

  begin
    execute 'alter table public.spatial_ref_sys enable row level security';
    execute 'drop policy if exists spatial_ref_sys_authenticated_read on public.spatial_ref_sys';
    execute $pol$
      create policy spatial_ref_sys_authenticated_read
        on public.spatial_ref_sys for select to authenticated using (true)
    $pol$;
  exception
    when insufficient_privilege then
      raise notice 'spatial_ref_sys: RLS non activée (table PostGIS, propriétaire supabase_admin). Revoke anon à la place.';
  end;

  begin
    execute 'revoke all on table public.spatial_ref_sys from anon, public';
  exception
    when insufficient_privilege then
      raise notice 'spatial_ref_sys: REVOKE anon refusé. À faire par le propriétaire : revoke all on table public.spatial_ref_sys from anon;';
  end;
end
$spatial$;
