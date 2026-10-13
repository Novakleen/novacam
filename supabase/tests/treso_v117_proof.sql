-- Preuves v1.17.0. Rôles : anon, member, manager, admin (voir run_treso_v117.sh).
-- Échoue (ON_ERROR_STOP) si un contrôle ne passe pas.

\set ON_ERROR_STOP on

-- ─── totaux mensuels ────────────────────────────────────────────────────────
-- fixe : amount_rule fixed (mensuel, /3, /12) + danny_rate × CA + withholding × cette part
-- variable : kind variable, mêmes règles de fréquence

select
  round(sum(monthly) filter (where bucket = 'fixe'), 2) as fixe,
  round(sum(monthly) filter (where bucket = 'variable'), 2) as variable
from (
  select
    case when c.kind = 'variable' then 'variable' else 'fixe' end as bucket,
    case c.amount_rule
      when 'danny' then s.danny_rate * s.usual_revenue_ht_month
      when 'precompte' then s.withholding_rate * s.danny_rate * s.usual_revenue_ht_month
      else c.amount * case c.frequency
        when 'weekly' then 52.0 / 12.0
        when 'monthly' then 1
        when 'quarterly' then 1.0 / 3.0
        when 'yearly' then 1.0 / 12.0
      end
    end as monthly
  from public.treso_commitments c
  cross join public.treso_settings s
  where c.is_active
    and not c.excluded_from_cash
    and (c.amount is not null or c.amount_rule <> 'fixed')
) t;

do $$
declare
  fixe numeric;
  variable numeric;
begin
  select
    round(sum(monthly) filter (where bucket = 'fixe'), 2),
    round(sum(monthly) filter (where bucket = 'variable'), 2)
  into fixe, variable
  from (
    select
      case when c.kind = 'variable' then 'variable' else 'fixe' end as bucket,
      case c.amount_rule
        when 'danny' then s.danny_rate * s.usual_revenue_ht_month
        when 'precompte' then s.withholding_rate * s.danny_rate * s.usual_revenue_ht_month
        else c.amount * case c.frequency
          when 'weekly' then 52.0 / 12.0
          when 'monthly' then 1
          when 'quarterly' then 1.0 / 3.0
          when 'yearly' then 1.0 / 12.0
        end
      end as monthly
    from public.treso_commitments c
    cross join public.treso_settings s
    where c.is_active and not c.excluded_from_cash
      and (c.amount is not null or c.amount_rule <> 'fixed')
  ) t;

  if abs(fixe - 13868) / 13868 > 0.01 then
    raise exception 'fixes % hors de 13868 ± 1%%', fixe;
  end if;
  if abs(variable - 8547) / 8547 > 0.01 then
    raise exception 'variables % hors de 8547 ± 1%%', variable;
  end if;
  raise notice 'PASS monthly fixe=% variable=%', fixe, variable;
end $$;

do $$
begin
  if exists (
    select 1 from public.treso_commitments
    where label ~* 'avance|advance'
  ) then
    raise exception 'une échéance d''avance existe';
  end if;
  if (select count(*) from public.treso_commitments where amount_rule = 'danny') <> 1 then
    raise exception 'part Danny variable absente ou dupliquée';
  end if;
  if (select coalesce(sum(amount_ttc), 0) from public.treso_client_invoices
      where client_name = 'Quimesis' and excluded_from_cash) <> 18040.20 then
    raise exception 'Quimesis exclu ≠ 18040.20';
  end if;
  if (select balance from public.treso_balance_snapshots s
      join public.treso_accounts a on a.id = s.account_id
      where a.iban = 'BE25068955038482' and s.balance_date = date '2026-10-09') <> 2651.62 then
    raise exception 'solde Belfius inattendu';
  end if;
  if exists (
    select 1 from public.treso_commitments
    where label ~* 'rechargement|chargement.*visa|top-?up'
  ) then
    raise exception 'un rechargement Visa est une échéance';
  end if;
  raise notice 'PASS danny / quimesis / solde / pas d''avance ni de top-up Visa';
end $$;

-- ─── RLS treso_* : anon erreur, Member 0, Manager 0, Admin lignes ──────────

do $$
declare
  t text;
  n integer;
  tables text[] := array[
    'treso_settings', 'treso_accounts', 'treso_balance_snapshots',
    'treso_import_batches', 'treso_bank_transactions', 'treso_client_invoices',
    'treso_supplier_bills', 'treso_commitments', 'treso_cash_events',
    'treso_calendar_links', 'treso_api_keys'
  ];
begin
  foreach t in array tables loop
    begin
      perform set_config('role', 'anon', true);
      execute format('select count(*) from public.%I', t) into n;
      raise exception 'anon a lu % (% lignes)', t, n;
    exception
      when insufficient_privilege then
        null;
    end;
    execute 'reset role';

    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    perform set_config('role', 'authenticated', true);
    execute format('select count(*) from public.%I', t) into n;
    execute 'reset role';
    if n <> 0 then
      raise exception 'Member voit % lignes sur %', n, t;
    end if;

    perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
    perform set_config('role', 'authenticated', true);
    execute format('select count(*) from public.%I', t) into n;
    execute 'reset role';
    if n <> 0 then
      raise exception 'Manager voit % lignes sur %', n, t;
    end if;

    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    perform set_config('role', 'authenticated', true);
    execute format('select count(*) from public.%I', t) into n;
    execute 'reset role';
    if t in ('treso_settings', 'treso_accounts', 'treso_balance_snapshots', 'treso_commitments', 'treso_client_invoices')
       and n = 0 then
      raise exception 'Admin ne voit rien sur %', t;
    end if;
  end loop;
  raise notice 'PASS RLS treso_* anon=erreur member=0 manager=0 admin=lignes';
end $$;

-- Admin crée et révoque une clé (hash seulement).
do $$
declare
  n integer;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform set_config('role', 'authenticated', true);
  insert into public.treso_api_keys (key_hash, key_prefix, scope, created_by)
  values (repeat('ab', 32), 'treso_ab', 'treso-import', '33333333-3333-3333-3333-333333333333'::uuid);
  update public.treso_api_keys set revoked_at = now() where key_prefix = 'treso_ab';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.treso_api_keys;
  execute 'reset role';
  if n <> 0 then
    raise exception 'Member voit les clés API';
  end if;
  raise notice 'PASS api key hash + revoke';
end $$;

-- NovaQuote : insert direct. Pas de select anon.
-- L'UPDATE email est refusé (il exigerait de lire la ligne) ; le site
-- insère alors une seconde ligne avec l'email. C'est le repli de QuoteResult.

do $$
declare
  n integer;
  saw_update_error boolean := false;
begin
  perform set_config('role', 'anon', true);
  insert into public.phone_submissions (phone_number, address, hubspot_lead_id)
  values ('0470123456', 'Rue du Test 1, 1000 Bruxelles', 'hs-proof');
  begin
    update public.phone_submissions
       set email = 'lead@example.com'
     where phone_number = '0470123456';
    raise exception 'anon a mis à jour phone_submissions';
  exception
    when insufficient_privilege then
      saw_update_error := true;
  end;
  insert into public.phone_submissions (phone_number, address, email)
  values ('0470123456', 'Rue du Test 1, 1000 Bruxelles', 'lead@example.com');
  begin
    perform 1 from public.phone_submissions;
    raise exception 'anon a lu phone_submissions';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
  if not saw_update_error then
    raise exception 'UPDATE anon non refusé';
  end if;

  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.phone_submissions
   where phone_number = '0470123456' and email = 'lead@example.com';
  execute 'reset role';
  if n <> 1 then
    raise exception 'repli email NovaQuote absent (% )', n;
  end if;
  raise notice 'PASS phone_submissions insert, update refusé, repli email, pas de select';
end $$;

-- Manager upsert le cache funnel. anon erreur, Member 0 ligne.
do $$
declare
  n integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform set_config('role', 'authenticated', true);
  insert into public.hubspot_funnel_cache (month, sales_rep_id, leads_count)
  values ('2026-10', 'proof', 1)
  on conflict (month, sales_rep_id) do update set leads_count = excluded.leads_count;
  execute 'reset role';

  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.hubspot_funnel_cache;
    raise exception 'anon a lu hubspot_funnel_cache';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.hubspot_funnel_cache;
  execute 'reset role';
  if n <> 0 then
    raise exception 'Member voit le funnel';
  end if;
  raise notice 'PASS hubspot_funnel_cache';
end $$;

-- spatial_ref_sys : RLS si on possède la table, sinon le fallback est documenté.
do $$
declare
  rls boolean;
begin
  select c.relrowsecurity into rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'spatial_ref_sys';
  if rls then
    raise notice 'PASS spatial_ref_sys RLS enabled';
  else
    raise notice 'spatial_ref_sys RLS off (owner is not the migration role; anon revoke is the fallback)';
  end if;
end $$;

do $$
begin
  begin
    perform set_config('role', 'anon', true);
    perform count(*) from public.spatial_ref_sys;
    raise exception 'anon a lu spatial_ref_sys';
  exception
    when insufficient_privilege then
      raise notice 'PASS anon spatial_ref_sys: permission denied';
  end;
  execute 'reset role';
end $$;
