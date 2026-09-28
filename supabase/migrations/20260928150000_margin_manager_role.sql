-- v1.13.0 — Rôle « Manager » : accès complet au module Marges (paramètres, simulateur,
-- onglet Marge des chantiers : générer / régénérer), sans les autres zones admin.
-- Additive only: existing *_admin_all policies are untouched (Admin keeps exactly the same rights);
-- we only ADD *_manager_all policies. Backward-compatible with the live v1.12.0 app.

create or replace function public.margin_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('Admin', 'Manager')
  );
$$;

revoke all on function public.margin_can_manage() from public, anon;
grant execute on function public.margin_can_manage() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'margin_params',
    'margin_product_prices',
    'margin_dossiers',
    'margin_hour_lines',
    'margin_product_lines',
    'margin_ad_spend',
    'margin_cac_entry_cache'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_manager_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.margin_can_manage()) with check (public.margin_can_manage())',
      t || '_manager_all', t
    );
  end loop;
end $$;
