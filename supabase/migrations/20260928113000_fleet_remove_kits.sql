-- v1.11.0: remove kit templates (articles are the central catalog now) + nesting rules.
--  * backups: fleet_kits_backup_v1110, fleet_kit_items_backup_v1110,
--             fleet_articles_kit_backup_v1110 (id, default_kit_id), fleet_nodes_kit_backup_v1110 (id, kit_item_id)
--  * drop fleet_articles.default_kit_id, fleet_nodes.kit_item_id, fleet_kit_items, fleet_kits,
--    fleet_apply_kit(), fleet_apply_kit_internal()
--  * new vans get the 5 standard Expert L3 zones (hard-coded, was the default van kit)
--  * nesting: zone → van/depot · caisse/machine → zone/van/depot · materiel → zone/caisse/van/depot
--  * fleet_place_article: crates are created empty

-- 1. Backups (RLS on, no API access)
create table if not exists public.fleet_kits_backup_v1110 as table public.fleet_kits;
create table if not exists public.fleet_kit_items_backup_v1110 as table public.fleet_kit_items;
create table if not exists public.fleet_articles_kit_backup_v1110 as
  select id, default_kit_id from public.fleet_articles where default_kit_id is not null;
create table if not exists public.fleet_nodes_kit_backup_v1110 as
  select id, kit_item_id from public.fleet_nodes where kit_item_id is not null;
do $$
declare t text;
begin
  foreach t in array array['fleet_kits_backup_v1110', 'fleet_kit_items_backup_v1110',
                           'fleet_articles_kit_backup_v1110', 'fleet_nodes_kit_backup_v1110'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 2. Functions that referenced kits
drop function if exists public.fleet_apply_kit(uuid, uuid);
drop function if exists public.fleet_apply_kit_internal(uuid, uuid);

create or replace function public.fleet_van_after_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  loc uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.stock_locations (kind, van_id, name) values ('van', new.id, new.name)
      on conflict (van_id) do nothing;
    select id into loc from public.stock_locations where van_id = new.id;
    insert into public.fleet_nodes (id, location_id, kind, name, sort)
      values (loc, loc, 'van', new.name, coalesce(new.sort, 0))
      on conflict (id) do nothing;
    -- standard Expert L3 zones (customisable per van afterwards)
    if not exists (select 1 from public.fleet_nodes where parent_id = loc) then
      insert into public.fleet_nodes (parent_id, kind, zone_key, name, name_nl, name_en, sort, plan_x, plan_y, plan_w, plan_h) values
        (loc, 'zone', 'cab',         'Cabine',          'Cabine',           'Cab',           10,   8, -91, 148,  78),
        (loc, 'zone', 'bulkhead',    'Zone cloison',    'Zone tussenschot', 'Bulkhead zone', 20,   2,   4, 160,  44),
        (loc, 'zone', 'left_shelf',  'Étagères gauche', 'Rekken links',     'Left shelves',  30,   2,  52,  40, 229),
        (loc, 'zone', 'floor',       'Plancher',        'Laadvloer',        'Floor',         40,  46,  52,  72, 229),
        (loc, 'zone', 'right_shelf', 'Étagères droite', 'Rekken rechts',    'Right shelves', 50, 122, 110,  40, 171);
    end if;
  elsif tg_op = 'UPDATE' and new.name is distinct from old.name then
    update public.stock_locations set name = new.name where van_id = new.id;
    update public.fleet_nodes set name = new.name where location_id in (select id from public.stock_locations where van_id = new.id);
  end if;
  return null;
end;
$function$;

create or replace function public.fleet_articles_after_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.kind is distinct from old.kind and exists (select 1 from public.fleet_nodes where article_id = new.id) then
    raise exception 'FLEET_ARTICLE_KIND_LOCKED';
  end if;
  if (new.name, new.name_nl, new.name_en, new.icon) is distinct from (old.name, old.name_nl, old.name_en, old.icon) then
    update public.fleet_nodes set article_id = article_id where article_id = new.id;
  end if;
  return null;
end;
$function$;

-- Nesting rules (checked on insert and on every parent change)
create or replace function public.fleet_nodes_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p record;
  hit boolean;
begin
  if tg_op = 'UPDATE' and new.condition is distinct from old.condition
     and coalesce(current_setting('fleet.cond_sync', true), '') <> 'on' then
    new.condition := old.condition;
  elsif tg_op = 'INSERT' and coalesce(current_setting('fleet.cond_sync', true), '') <> 'on' then
    new.condition := 'ok';
  end if;
  if new.parent_id is null then
    new.root_id := new.id;
  elsif tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id then
    select id, kind, root_id into p from public.fleet_nodes where id = new.parent_id;
    if p.id is null then raise exception 'FLEET_PARENT_NOT_FOUND'; end if;
    if p.kind = 'materiel' or p.kind = 'machine' then raise exception 'FLEET_PARENT_NOT_CONTAINER'; end if;
    if new.kind = 'zone' and p.kind not in ('van', 'depot') then
      raise exception 'FLEET_ZONE_PARENT';
    end if;
    if new.kind in ('caisse', 'machine') and p.kind not in ('zone', 'van', 'depot') then
      raise exception 'FLEET_NESTING';
    end if;
    if new.kind = 'materiel' and p.kind not in ('zone', 'caisse', 'van', 'depot') then
      raise exception 'FLEET_NESTING';
    end if;
    if tg_op = 'UPDATE' then
      with recursive up as (
        select id, parent_id from public.fleet_nodes where id = new.parent_id
        union all
        select n.id, n.parent_id from public.fleet_nodes n join up on n.id = up.parent_id
      ) select exists (select 1 from up where id = new.id) into hit;
      if hit then raise exception 'FLEET_CYCLE'; end if;
    end if;
    new.root_id := p.root_id;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$function$;

create or replace function public.fleet_move_node(p_node uuid, p_parent uuid, p_qty integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n record;
  dest record;
  adm boolean := public.fleet_is_admin();
  new_id uuid;
begin
  select * into n from public.fleet_nodes where id = p_node;
  select id, kind, root_id into dest from public.fleet_nodes where id = p_parent;
  if n.id is null or dest.id is null then raise exception 'FLEET_NODE_NOT_FOUND'; end if;
  if n.kind in ('depot', 'van', 'zone') then raise exception 'FLEET_NOT_MOVABLE'; end if;
  if not adm then
    if not (n.root_id in (select public.fleet_my_location_ids()) or n.root_id = public.fleet_depot_location_id())
       or dest.root_id not in (select public.fleet_my_location_ids()) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;
  if p_qty is not null and n.kind = 'materiel' and p_qty > 0 and p_qty < n.qty then
    update public.fleet_nodes set qty = qty - p_qty where id = p_node;
    insert into public.fleet_nodes (parent_id, kind, name, name_nl, name_en, qty, serial, brand, model, notes, icon, sort, article_id)
      values (p_parent, n.kind, n.name, n.name_nl, n.name_en, p_qty, null, n.brand, n.model, null, n.icon, n.sort, n.article_id)
      returning id into new_id;
    return new_id;
  end if;
  update public.fleet_nodes set parent_id = p_parent where id = p_node;
  return p_node;
end;
$function$;

create or replace function public.fleet_place_article(p_parent uuid, p_article uuid, p_qty integer default 1)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  dest record;
  art public.fleet_articles%rowtype;
  q integer := greatest(1, least(coalesce(p_qty, 1), 999));
  existing uuid;
  new_id uuid;
  first_id uuid;
begin
  select id, kind, root_id into dest from public.fleet_nodes where id = p_parent;
  if dest.id is null then raise exception 'FLEET_NODE_NOT_FOUND'; end if;
  if not public.fleet_can_act_root(dest.root_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into art from public.fleet_articles where id = p_article and active;
  if art.id is null then raise exception 'FLEET_ARTICLE_NOT_FOUND'; end if;
  if art.kind = 'materiel' then
    select id into existing from public.fleet_nodes
     where parent_id = p_parent and article_id = art.id and condition = 'ok' and serial is null
     order by created_at limit 1;
    if existing is not null then
      update public.fleet_nodes set qty = qty + q where id = existing;
      return existing;
    end if;
    insert into public.fleet_nodes (parent_id, kind, name, article_id, qty)
      values (p_parent, 'materiel', art.name, art.id, q) returning id into new_id;
    return new_id;
  end if;
  -- caisse (created empty) / machine: one instance per unit
  for i in 1..least(q, 50) loop
    insert into public.fleet_nodes (parent_id, kind, name, article_id, qty)
      values (p_parent, art.kind, art.name, art.id, 1) returning id into new_id;
    first_id := coalesce(first_id, new_id);
  end loop;
  return first_id;
end;
$function$;

-- 3. Drop kit columns and tables
alter table public.fleet_articles drop constraint if exists fleet_articles_default_kit_id_fkey;
alter table public.fleet_articles drop column if exists default_kit_id;
alter table public.fleet_nodes drop constraint if exists fleet_nodes_kit_item_id_fkey;
alter table public.fleet_nodes drop column if exists kit_item_id;
drop table if exists public.fleet_kit_items;
drop table if exists public.fleet_kits;
