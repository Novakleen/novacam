-- Fraction of essence-service hours that actually run the HP/SC engine
-- (~1/5 spray + ~1/5 setup/cleanup → ~3/5 billed). Tunable in Admin Marges.
-- Already intended for live Supabase; this file documents the schema in git.

alter table public.margin_params
  add column if not exists essence_time_factor numeric not null default 0.6;

comment on column public.margin_params.essence_time_factor is
  'Facteur heures essence (défaut 0.6 = 3/5) : heures effectives = heures × facteur avant × L/h × €/L';
