-- Monthly Meta (etc.) ad spend for CAC ads = spend(M) / won clients entered in M.
-- cac_rate on margin_params is retired (kept for migration safety; unused in calc).
-- Already applied on novaquote via Supabase MCP when shipped. Git documents schema.

create table if not exists public.margin_ad_spend (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  platform text not null default 'Meta',
  spend numeric not null check (spend >= 0),
  currency text not null default 'EUR',
  period_start date null,
  period_end date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint margin_ad_spend_month_platform_unique unique (month, platform)
);

comment on table public.margin_ad_spend is
  'Monthly ad spend (Meta etc.) used for CAC ads = spend / won clients by entry month';

create index if not exists margin_ad_spend_month_idx
  on public.margin_ad_spend (month desc);

create table if not exists public.margin_cac_entry_cache (
  month date primary key,
  clients_won integer not null default 0,
  hubspot_clients_won integer null,
  spend_total numeric null,
  cac_per_client numeric null,
  entry_date_source text null,
  fetched_at timestamptz not null default now(),
  notes text null
);

comment on table public.margin_cac_entry_cache is
  'Cached monthly CAC: won clients whose HubSpot entry date falls in month / ad spend';

comment on column public.margin_params.cac_rate is
  'DEPRECATED since 1.6.18 — CAC ads is now a fixed €/client from margin_ad_spend + HubSpot entry-month wins. Kept for migration safety.';

create or replace function public.set_margin_ad_spend_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists margin_ad_spend_set_updated_at on public.margin_ad_spend;
create trigger margin_ad_spend_set_updated_at
  before update on public.margin_ad_spend
  for each row
  execute function public.set_margin_ad_spend_updated_at();

alter table public.margin_ad_spend enable row level security;
alter table public.margin_cac_entry_cache enable row level security;

drop policy if exists "margin_ad_spend_admin_all" on public.margin_ad_spend;
create policy "margin_ad_spend_admin_all"
  on public.margin_ad_spend
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

drop policy if exists "margin_cac_entry_cache_admin_all" on public.margin_cac_entry_cache;
create policy "margin_cac_entry_cache_admin_all"
  on public.margin_cac_entry_cache
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin'));

-- Non-admin authenticated can read spend/cache so margin calc works on project fiche
drop policy if exists "margin_ad_spend_select_authenticated" on public.margin_ad_spend;
create policy "margin_ad_spend_select_authenticated"
  on public.margin_ad_spend
  for select
  to authenticated
  using (true);

drop policy if exists "margin_cac_entry_cache_select_authenticated" on public.margin_cac_entry_cache;
create policy "margin_cac_entry_cache_select_authenticated"
  on public.margin_cac_entry_cache
  for select
  to authenticated
  using (true);

grant select, insert, update, delete on public.margin_ad_spend to authenticated;
grant select, insert, update, delete on public.margin_cac_entry_cache to authenticated;

-- Seed Meta Jan–Aug 2026 (EUR) from Meta monthly export
insert into public.margin_ad_spend (month, platform, spend, currency, period_start, period_end)
values
  ('2026-01-01', 'Meta', 669.88,  'EUR', '2026-01-01', '2026-01-31'),
  ('2026-02-01', 'Meta', 1659.11, 'EUR', '2026-02-01', '2026-02-28'),
  ('2026-03-01', 'Meta', 1573.63, 'EUR', '2026-03-01', '2026-03-31'),
  ('2026-04-01', 'Meta', 1223.47, 'EUR', '2026-04-01', '2026-04-30'),
  ('2026-05-01', 'Meta', 1650.27, 'EUR', '2026-05-01', '2026-05-31'),
  ('2026-06-01', 'Meta', 1403.86, 'EUR', '2026-06-01', '2026-06-30'),
  ('2026-07-01', 'Meta', 914.97,  'EUR', '2026-07-01', '2026-07-31'),
  ('2026-08-01', 'Meta', 2083.46, 'EUR', '2026-08-01', '2026-08-31')
on conflict (month, platform) do update
  set spend = excluded.spend,
      currency = excluded.currency,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      updated_at = now();
