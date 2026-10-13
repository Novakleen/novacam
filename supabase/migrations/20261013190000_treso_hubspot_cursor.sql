-- v1.19.0 — curseur de sync HubSpot + rejet durable d'un rapprochement.
-- Additif. Ne déploie pas la fonction et n'active pas le cron
-- (voir supabase/manual/treso_hubspot_sync_schedule.sql).

alter table public.treso_settings
  add column if not exists hubspot_invoices_synced_through timestamptz;

comment on column public.treso_settings.hubspot_invoices_synced_through is
  'Dernier hs_lastmodifieddate HubSpot repris (sync incrémentale des factures).';

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'treso_bank_transactions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%match_status%';
  if cname is not null then
    execute format('alter table public.treso_bank_transactions drop constraint %I', cname);
  end if;
end $$;

alter table public.treso_bank_transactions
  add constraint treso_bank_transactions_match_status_check
  check (match_status in ('auto', 'a_valider', 'valide', 'rejete', 'aucun'));
