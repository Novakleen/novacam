-- v1.22.1 — statut Accountable des factures clients.
-- Non appliquée en production par l'agent : à lancer avec le déploiement.

alter table public.treso_client_invoices
  add column if not exists accountable_status text,
  add column if not exists accountable_synced_at timestamptz;

comment on column public.treso_client_invoices.accountable_status is
  'Statut Accountable : Payé ou Envoyé. Une facture passée est ouverte ssi Envoyé.';

comment on column public.treso_client_invoices.accountable_synced_at is
  'Horodatage du dernier rapprochement avec l''onglet Factures Accountable.';
