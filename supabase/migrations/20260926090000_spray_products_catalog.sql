-- v1.6.21 — Spray product pickers use the margin product catalog
-- (public.margin_product_prices, managed in Admin → Marge chantiers → Paramètres).
-- Applied on novaquote via Supabase MCP apply_migration.
--
-- 1) spray_entries.product_slug: stable link to margin_product_prices.slug
--    (slug never changes on rename). spray_entries.product keeps the name as
--    typed/picked at entry time (fallback display when the product is deleted).
--    No FK on purpose: deleting a product in the catalog must not be blocked.
-- 2) list_spray_products(): slug + name for every signed-in user. The catalog
--    table itself stays Admin-only under RLS (it holds €/L prices).
-- 3) Backfill product_slug for existing entries (exact name/slug, then the same
--    keyword heuristics as mapSprayProductToSlug()).

alter table public.spray_entries
  add column if not exists product_slug text null;

create index if not exists spray_entries_product_slug_idx
  on public.spray_entries (product_slug);

create or replace function public.list_spray_products()
returns table (slug text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.slug, coalesce(nullif(btrim(p.name), ''), p.slug) as name
    from public.margin_product_prices p
   where auth.role() = 'authenticated'
   order by lower(coalesce(nullif(btrim(p.name), ''), p.slug));
$$;

revoke all on function public.list_spray_products() from public;
revoke all on function public.list_spray_products() from anon;
grant execute on function public.list_spray_products() to authenticated;

-- Backfill without touching updated_at (margin « plus à jour » fingerprints use it)
alter table public.spray_entries disable trigger update_spray_entries_updated_at;

-- Backfill: exact (case-insensitive) name or slug match first
update public.spray_entries e
   set product_slug = p.slug
  from public.margin_product_prices p
 where e.product_slug is null
   and e.product is not null
   and (lower(btrim(e.product)) = lower(btrim(p.name))
     or lower(btrim(e.product)) = lower(p.slug));

-- Then keyword heuristics (same as mapSprayProductToSlug), only for existing slugs
update public.spray_entries e
   set product_slug = m.slug
  from (
    select id,
           case
             when lower(product) like '%biomix%' then 'biomix'
             when lower(product) like '%algimouss%' then 'algimouss'
             when lower(product) like '%algivert%' then 'algivert'
             when lower(product) like '%kleenku%' then 'kleenkup'
             when lower(product) like '%amphi%' then 'amphiclean'
           end as slug
      from public.spray_entries
     where product_slug is null and product is not null
  ) m
 where e.id = m.id
   and m.slug is not null
   and exists (select 1 from public.margin_product_prices p where p.slug = m.slug);

alter table public.spray_entries enable trigger update_spray_entries_updated_at;

notify pgrst, 'reload schema';
