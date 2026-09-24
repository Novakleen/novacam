-- hubspot_clients_won + validated Jan–Aug 2026 seed (unique contacts by createdate with ≥1 closed-won).
-- Applied on novaquote via Supabase MCP.

alter table public.margin_cac_entry_cache
  add column if not exists hubspot_clients_won integer null;

comment on column public.margin_cac_entry_cache.clients_won is
  'Effective client count used for CAC (manual override allowed)';
comment on column public.margin_cac_entry_cache.hubspot_clients_won is
  'Last HubSpot-computed unique contact count (createdate month with ≥1 closed-won deal)';

insert into public.margin_cac_entry_cache (month, clients_won, hubspot_clients_won, spend_total, cac_per_client, entry_date_source, fetched_at, notes)
values
  ('2026-01-01', 13, 13, 669.88,  round(669.88/13, 2),  'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-02-01', 28, 28, 1659.11, round(1659.11/28, 2), 'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-03-01', 29, 29, 1573.63, round(1573.63/29, 2), 'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-04-01', 17, 17, 1223.47, round(1223.47/17, 2), 'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-05-01', 14, 14, 1650.27, round(1650.27/14, 2), 'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-06-01', 20, 20, 1403.86, round(1403.86/20, 2), 'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-07-01', 12, 12, 914.97,  round(914.97/12, 2),  'contact.createdate', now(), 'Validated seed v1.6.18'),
  ('2026-08-01', 15, 15, 2083.46, round(2083.46/15, 2), 'contact.createdate', now(), 'Validated seed v1.6.18')
on conflict (month) do update
  set clients_won = excluded.clients_won,
      hubspot_clients_won = excluded.hubspot_clients_won,
      spend_total = excluded.spend_total,
      cac_per_client = excluded.cac_per_client,
      entry_date_source = excluded.entry_date_source,
      fetched_at = excluded.fetched_at,
      notes = excluded.notes;
