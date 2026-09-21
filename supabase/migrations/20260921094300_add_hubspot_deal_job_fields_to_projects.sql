-- HubSpot deal job fields snapshot (surface, type of service, expected timing)
-- Populated when a transaction is linked on the chantier Source panel.

alter table public.projects
  add column if not exists hubspot_deal_surface_m2 numeric,
  add column if not exists hubspot_deal_type_of_service text,
  add column if not exists hubspot_deal_expected_month text,
  add column if not exists hubspot_deal_expected_season text,
  add column if not exists hubspot_deal_expected_year text;

comment on column public.projects.hubspot_deal_surface_m2 is
  'Snapshot of HubSpot deal total_surface_in_m2 when transaction is linked';
comment on column public.projects.hubspot_deal_type_of_service is
  'Snapshot of HubSpot deal type_of_service (semicolon multi-select) when transaction is linked';
comment on column public.projects.hubspot_deal_expected_month is
  'Snapshot of HubSpot deal expected_month_for_the_job when transaction is linked';
comment on column public.projects.hubspot_deal_expected_season is
  'Snapshot of HubSpot deal expected_season_for_the_job when transaction is linked';
comment on column public.projects.hubspot_deal_expected_year is
  'Snapshot of HubSpot deal expected_year_for_the_job when transaction is linked';
