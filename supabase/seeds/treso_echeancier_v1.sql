-- Reprise manuelle. Pas une migration : lancer à la main après
-- 20261013120000_treso_foundation.sql. Idempotent (NOT EXISTS / ON CONFLICT).
--
-- Échéancier v1.4, lignes actives seulement. Équivalent mensuel :
-- fixes 13 868 € (Danny 7,5 % inclus via amount_rule danny, précompte 28 %),
-- variables 8 547 €. Pas d'avance. Pas de Partena. Rémy suspendu : non repris.
-- HubSpot (rythme inconnu) et Lietar (cautions) : pas de montant projeté.
-- Rechargements Visa BE25 → carte : exclus à l'import, pas de lignes ici.

insert into public.treso_settings (
  id, collection_delay_days, alert_threshold, usual_revenue_ht_month, ttc_ratio,
  probable_enabled, probable_start_date, danny_rate, danny_day,
  withholding_rate, withholding_due_day, stale_after_business_days,
  supplier_default_due_days, horizon_weeks, seasonality_coefficients
) values (
  1, 8, 0, 27446.16, 1.0588, true, date '2026-10-09', 0.075, 13,
  0.28, 6, 2, 30, 13, '{1,1,1,1,1,1,1,1,1,1,1,1}'::numeric(8,4)[]
)
on conflict (id) do update
  set probable_start_date = coalesce(public.treso_settings.probable_start_date, excluded.probable_start_date);

insert into public.treso_accounts (name, iban, kind, include_in_cash, is_active)
select 'Belfius courant', 'BE25068955038482', 'courant', true, true
where not exists (select 1 from public.treso_accounts where iban = 'BE25068955038482');

insert into public.treso_accounts (name, iban, kind, include_in_cash, is_active)
select 'Visa prépayée', null, 'carte', true, true
where not exists (select 1 from public.treso_accounts where name = 'Visa prépayée' and kind = 'carte');

insert into public.treso_balance_snapshots (account_id, balance_date, balance, source, note)
select a.id, date '2026-10-09', 2651.62, 'manuel', 'Belfius au 09/10/2026'
from public.treso_accounts a
where a.iban = 'BE25068955038482'
  and not exists (
    select 1 from public.treso_balance_snapshots s
    where s.account_id = a.id and s.balance_date = date '2026-10-09' and s.source = 'manuel'
  );

insert into public.treso_balance_snapshots (account_id, balance_date, balance, source, note)
select a.id, date '2026-10-09', 0, 'manuel', 'Visa prépayée à 0 €'
from public.treso_accounts a
where a.name = 'Visa prépayée' and a.kind = 'carte'
  and not exists (
    select 1 from public.treso_balance_snapshots s
    where s.account_id = a.id and s.balance_date = date '2026-10-09' and s.source = 'manuel'
  );

insert into public.treso_commitments (
  label, counterparty, category, kind, direction, amount, frequency,
  day_of_month, next_due_date, end_date, remaining_occurrences,
  spread_weekly, amount_rule, match_pattern, is_active, needs_review, note
)
select
  v.label, v.counterparty, v.category, v.kind, v.direction,
  nullif(v.amount, '')::numeric, nullif(v.frequency, ''),
  nullif(v.day_of_month, '')::integer, nullif(v.next_due_date, '')::date,
  nullif(v.end_date, '')::date, nullif(v.remaining_occurrences, '')::integer,
  v.spread_weekly::boolean, v.amount_rule, nullif(v.match_pattern, ''),
  v.is_active::boolean, v.needs_review::boolean, nullif(v.note, '')
from (values
  ('Danny Joosten – part variable (7,5 % du CA HT)', 'Danny Joosten', 'salaires', 'fixe', 'out', '', 'monthly', '13', '2026-11-13', '', '', 'false', 'danny', 'remuneration danny|rem danny', 'true', 'false', '7,5 % du CA HT de M, versé vers le 13 de M+1. Septembre déjà payé le 30/09. Pas d''avance.'),
  ('Secrétariat social agréé n°924 (SSE Steunt / Secrétariat social)', 'Secrétariat social agréé n°924 (SSE Steunt / Secrétariat social)', 'secretariat_social', 'fixe', 'out', '2225.23', 'monthly', '14', '2026-10-14', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Martin Provoyeur – salaire', 'Martin Provoyeur', 'salaires', 'fixe', 'out', '2057.28', 'monthly', '5', '2026-11-05', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Daniel Pieczko – salaire', 'Daniel Pieczko', 'salaires', 'fixe', 'out', '1799.31', 'monthly', '5', '2026-11-05', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Drivio – leasing utilitaires (3 contrats × 526,35)', 'Drivio', 'leasing', 'fixe', 'out', '1579.05', 'monthly', '24', '2026-10-24', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('SPF Finances – précompte professionnel', 'SPF Finances', 'tva_impots', 'fixe', 'out', '', 'quarterly', '6', '2027-01-06', '', '', 'false', 'precompte', 'precompte', 'true', 'false', '28 % des parts variables Danny du trimestre, vers le 6 du mois suivant. Prochaine : 06/01/2027.'),
  ('Rémy Gierech – remboursement prêt 20k (555 × 36)', 'Rémy Gierech', 'pret', 'fixe', 'out', '555.00', 'monthly', '10', '2026-10-10', '', '4', 'false', 'fixed', 'pret 20', 'true', 'false', '555 €/mois, 4 échéances restantes, jour 10.'),
  ('Sofibel – comptable', 'Sofibel', 'honoraires', 'fixe', 'out', '302.50', 'monthly', '14', '2026-10-14', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Sofibel – honoraires annuels (clôture)', 'Sofibel', 'honoraires', 'fixe', 'out', '3025.00', 'yearly', '7', '2027-01-07', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Danny Joosten – défraiement bureau & stockage (Kouter 354)', 'Danny Joosten', 'loyer', 'fixe', 'out', '250.00', 'monthly', '13', '2026-10-13', '', '', 'false', 'fixed', 'defraiement', 'true', 'false', '250 € fixes (bureau et stockage), distincts du 7,5 %.'),
  ('Monizze – chèques repas', 'Monizze', 'salaires', 'fixe', 'out', '201.33', 'monthly', '6', '2026-11-06', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('OpenAI', 'OpenAI', 'abonnement', 'fixe', 'out', '155.29', 'monthly', '16', '', '', '', 'true', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('AXA – police 0106250913851 (véhicule ?)', 'AXA', 'assurance', 'fixe', 'out', '155.25', 'monthly', '26', '2026-10-26', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('AXA – police 0106250912671 (véhicule ?)', 'AXA', 'assurance', 'fixe', 'out', '155.25', 'monthly', '26', '2026-10-26', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('AXA – police 0106250810811 / 625081081 (véhicule ?)', 'AXA', 'assurance', 'fixe', 'out', '155.15', 'monthly', '9', '2026-10-09', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Canva', 'Canva', 'abonnement', 'fixe', 'out', '136.99', 'monthly', '24', '', '', '', 'true', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('AXA Belgium – réf. 720278616041', 'AXA Belgium', 'assurance', 'fixe', 'out', '361.69', 'quarterly', '25', '2026-11-20', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Telenet – internet', 'Telenet', 'autre', 'fixe', 'out', '108.72', 'monthly', '13', '2026-10-13', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Cursor', 'Cursor', 'abonnement', 'fixe', 'out', '104.64', 'monthly', '5', '', '', '', 'true', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('CompanyCam', 'CompanyCam', 'abonnement', 'fixe', 'out', '84.79', 'monthly', '11', '2026-10-11', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Mensura – médecine du travail', 'Mensura', 'secretariat_social', 'fixe', 'out', '168.75', 'quarterly', '18', '2026-12-14', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('AXA Belgium – réf. 730663542034 (paiement unique 20/03)', 'AXA Belgium', 'assurance', 'fixe', 'out', '383.29', 'yearly', '20', '2027-03-20', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Grok / xAI', 'Grok / xAI', 'abonnement', 'fixe', 'out', '26.82', 'monthly', '11', '', '', '', 'true', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Tally', 'Tally', 'abonnement', 'fixe', 'out', '22.69', 'monthly', '28', '2026-10-28', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Google (Google One / Workspace ?)', 'Google (Google One / Workspace ?)', 'abonnement', 'fixe', 'out', '21.99', 'monthly', '8', '2026-10-08', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Buffer', 'Buffer', 'abonnement', 'fixe', 'out', '21.26', 'monthly', '12', '2026-10-12', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Mobile Vikings – mobile', 'Mobile Vikings', 'autre', 'fixe', 'out', '15.00', 'monthly', '24', '2026-09-24', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Belfius – frais de compte', 'Belfius', 'frais_bancaires', 'fixe', 'out', '13.62', 'monthly', '6', '2026-11-06', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Radius – cartes carburant', 'Radius', 'carburant', 'variable', 'out', '2302.27', 'monthly', '16', '2026-10-12', '', '', 'true', 'fixed', '', 'true', 'false', ''),
  ('Meta / Facebook Ads', 'Meta / Facebook Ads', 'publicite', 'variable', 'out', '1940.18', 'monthly', '17', '2026-10-12', '', '', 'true', 'fixed', '', 'true', 'false', ''),
  ('EURABO (direct + via Mollie 912,23) – produits', 'EURABO (direct + via Mollie 912,23)', 'matieres', 'variable', 'out', '1938.49', 'monthly', '15', '2026-11-15', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Anthony Jarosik – prestations mensuelles', 'Anthony Jarosik', 'sous_traitance', 'variable', 'out', '868.36', 'monthly', '17', '2026-11-17', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('Bastien Burghart – facture mensuelle (frais administratifs)', 'Bastien Burghart', 'autre', 'variable', 'out', '778.06', 'monthly', '8', '2026-10-08', '', '', 'false', 'fixed', '', 'true', 'false', ''),
  ('V & M Collective – services', 'V & M Collective', 'autre', 'variable', 'out', '719.63', 'monthly', '24', '2026-10-24', '', '', 'false', 'fixed', '', 'true', 'true', 'À vérifier.'),
  ('Prêt 22,5k – remboursement à venir', 'Prêt 22,5k', 'pret', 'fixe', 'out', '625.00', 'monthly', '10', '2026-10-10', '', '36', 'false', 'fixed', 'pret 22', 'true', 'false', '625 €/mois à partir du 10/10/2026, 36 mensualités, jour 10.')
) as v(
  label, counterparty, category, kind, direction, amount, frequency,
  day_of_month, next_due_date, end_date, remaining_occurrences,
  spread_weekly, amount_rule, match_pattern, is_active, needs_review, note
)
where not exists (select 1 from public.treso_commitments c where c.label = v.label);

-- Quimesis 16 131,72 + 1 908,48 = 18 040,20 € au 09/07/2026, hors cash.
-- Le nom exclu sert aussi à l'import des factures fournisseurs (voir treso_settings.excluded_names).
insert into public.treso_client_invoices (
  hubspot_invoice_id, client_name, invoice_date, due_date, amount_ttc, excluded_from_cash
)
select x.hubspot_invoice_id, 'Quimesis', date '2026-07-09', date '2026-07-17', x.amount_ttc, true
from (values
  ('seed:quimesis:16131.72', 16131.72),
  ('seed:quimesis:1908.48', 1908.48)
) as x(hubspot_invoice_id, amount_ttc)
where not exists (
  select 1 from public.treso_client_invoices i where i.hubspot_invoice_id = x.hubspot_invoice_id
);
