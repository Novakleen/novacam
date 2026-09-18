-- Essence (HP / SC) fuel params on margin_params.
-- Already applied on live Supabase. This file documents the schema in git only.
-- Do not re-apply via CLI unless recreating an empty environment.

alter table public.margin_params
  add column if not exists essence_eur_l numeric not null default 1.85,
  add column if not exists essence_l_h numeric not null default 2,
  add column if not exists essence_services text[] not null default array['nettoyage', 'sc']::text[];

comment on column public.margin_params.essence_eur_l is 'Prix essence manuel (€/L) pour nettoyeurs HP / SC';
comment on column public.margin_params.essence_l_h is 'Consommation essence (L/h) des services essence_services';
comment on column public.margin_params.essence_services is 'Codes service (hour lines) qui consomment de l''essence';
