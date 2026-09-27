-- v1.10.0 Fleet: central article catalog.
-- Admin defines ARTICLES (caisse / machine / materiel) and KITS centrally; only zones stay per-van.
-- Van items (fleet_nodes) and kit items reference an article; name / translations / icon / kind are
-- copied from the article by trigger (denormalised cache, so renaming an article renames it everywhere).
-- Per-instance fields stay on fleet_nodes: qty, serial, brand, model, notes, condition, tickets, photos.

-- ─── 0. Safety copies (not exposed through the API) ─────────────────────────
create table if not exists public.fleet_nodes_backup_v1100 as table public.fleet_nodes;
create table if not exists public.fleet_kit_items_backup_v1100 as table public.fleet_kit_items;
create table if not exists public.fleet_kits_backup_v1100 as table public.fleet_kits;
alter table public.fleet_nodes_backup_v1100 enable row level security;
alter table public.fleet_kit_items_backup_v1100 enable row level security;
alter table public.fleet_kits_backup_v1100 enable row level security;
revoke all on public.fleet_nodes_backup_v1100, public.fleet_kit_items_backup_v1100, public.fleet_kits_backup_v1100
  from anon, authenticated;

-- ─── 1. Name normalisation (case / accent / whitespace insensitive) ─────────
create or replace function public.fleet_norm(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(btrim(translate(coalesce(t, ''),
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇçÑñÝýÿŸ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNnYyyY')), '\s+', ' ', 'g'));
$$;

-- ─── 2. Catalog ─────────────────────────────────────────────────────────────
create table if not exists public.fleet_articles (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('caisse', 'machine', 'materiel')),
  name text not null check (btrim(name) <> ''),
  name_nl text null,
  name_en text null,
  icon text null,
  default_kit_id uuid null references public.fleet_kits (id) on delete set null,
  notes text null,
  active boolean not null default true,
  sort integer not null default 0,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_articles_default_kit_crate check (default_kit_id is null or kind = 'caisse')
);
-- One article per name and kind: no more "Caisse X" / "caisse x" / "Caisse  X" variants.
create unique index if not exists fleet_articles_kind_name_uq on public.fleet_articles (kind, public.fleet_norm(name));

drop trigger if exists fleet_articles_touch on public.fleet_articles;
create trigger fleet_articles_touch before update on public.fleet_articles
  for each row execute function public.fleet_generic_touch();

alter table public.fleet_articles enable row level security;
drop policy if exists fleet_articles_select on public.fleet_articles;
create policy fleet_articles_select on public.fleet_articles for select to authenticated using (true);
drop policy if exists fleet_articles_admin_write on public.fleet_articles;
create policy fleet_articles_admin_write on public.fleet_articles for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

alter table public.fleet_nodes add column if not exists article_id uuid null
  references public.fleet_articles (id) on delete restrict;
alter table public.fleet_kit_items add column if not exists article_id uuid null
  references public.fleet_articles (id) on delete restrict;
create index if not exists fleet_nodes_article_idx on public.fleet_nodes (article_id);
create index if not exists fleet_kit_items_article_idx on public.fleet_kit_items (article_id);

-- ─── 3. Data migration: one article per (kind, normalised name) ─────────────
create temp table _src on commit drop as
  select kind, name, nullif(btrim(name_nl), '') name_nl, nullif(btrim(name_en), '') name_en, icon, true is_node
    from public.fleet_nodes where kind in ('caisse', 'machine', 'materiel')
  union all
  select kind, name, nullif(btrim(name_nl), ''), nullif(btrim(name_en), ''), icon, false
    from public.fleet_kit_items where kind in ('caisse', 'machine', 'materiel');

create temp table _grp on commit drop as
  select kind, public.fleet_norm(name) k,
         mode() within group (order by btrim(name)) filter (where is_node) node_name,
         mode() within group (order by btrim(name)) any_name,
         mode() within group (order by name_nl) filter (where name_nl is not null) name_nl,
         mode() within group (order by name_en) filter (where name_en is not null) name_en,
         mode() within group (order by icon) filter (where icon is not null) icon,
         count(*) filter (where is_node) node_count
    from _src group by kind, public.fleet_norm(name);

-- Stale translations: when a FR name was changed but NL/EN were not, several articles would share
-- the same NL/EN. Keep them only on the article with the most van instances; others fall back to FR.
update _grp g set name_nl = null
  where name_nl is not null and exists (
    select 1 from _grp o where o.name_nl = g.name_nl and (o.kind, o.k) <> (g.kind, g.k)
      and (o.node_count > g.node_count or (o.node_count = g.node_count and o.k < g.k)));
update _grp g set name_en = null
  where name_en is not null and exists (
    select 1 from _grp o where o.name_en = g.name_en and (o.kind, o.k) <> (g.kind, g.k)
      and (o.node_count > g.node_count or (o.node_count = g.node_count and o.k < g.k)));

insert into public.fleet_articles (kind, name, name_nl, name_en, icon)
  select kind, coalesce(node_name, any_name), name_nl, name_en, icon from _grp
  on conflict do nothing;

-- Crate kits become the default kit of the crate article with the same name, or of a new crate article.
update public.fleet_articles a set default_kit_id = k.id
  from public.fleet_kits k
  where k.target_kind = 'caisse' and a.kind = 'caisse' and a.default_kit_id is null
    and public.fleet_norm(a.name) = public.fleet_norm(k.name);
insert into public.fleet_articles (kind, name, name_nl, name_en, default_kit_id)
  select 'caisse', k.name,
         case when exists (select 1 from public.fleet_articles x where x.name_nl = k.name_nl) then null else k.name_nl end,
         case when exists (select 1 from public.fleet_articles x where x.name_en = k.name_en) then null else k.name_en end,
         k.id
    from public.fleet_kits k
   where k.target_kind = 'caisse'
     and not exists (select 1 from public.fleet_articles a
                      where a.kind = 'caisse' and public.fleet_norm(a.name) = public.fleet_norm(k.name))
  on conflict do nothing;

update public.fleet_nodes n set article_id = a.id
  from public.fleet_articles a
  where n.kind in ('caisse', 'machine', 'materiel') and n.article_id is null
    and a.kind = n.kind and public.fleet_norm(a.name) = public.fleet_norm(n.name);
update public.fleet_kit_items i set article_id = a.id
  from public.fleet_articles a
  where i.kind in ('caisse', 'machine', 'materiel') and i.article_id is null
    and a.kind = i.kind and public.fleet_norm(a.name) = public.fleet_norm(i.name);

-- ─── 4. Keep node / kit item labels in sync with their article ───────────────
create or replace function public.fleet_article_sync()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  art public.fleet_articles%rowtype;
begin
  if new.kind = 'zone' or new.kind in ('depot', 'van') then
    new.article_id := null;
    return new;
  end if;
  if new.article_id is null then
    -- Legacy clients (≤ v1.9.4) send a free-text name: map it onto the catalog.
    select * into art from public.fleet_articles
     where kind = new.kind and public.fleet_norm(name) = public.fleet_norm(new.name) limit 1;
    if art.id is null then
      if not public.fleet_is_admin() then raise exception 'FLEET_ARTICLE_REQUIRED'; end if;
      insert into public.fleet_articles (kind, name, name_nl, name_en, icon)
        values (new.kind, btrim(new.name), nullif(btrim(new.name_nl), ''), nullif(btrim(new.name_en), ''), new.icon)
        returning * into art;
    end if;
    new.article_id := art.id;
  else
    select * into art from public.fleet_articles where id = new.article_id;
    if art.id is null then raise exception 'FLEET_ARTICLE_NOT_FOUND'; end if;
  end if;
  new.kind := art.kind;
  new.name := art.name;
  new.name_nl := art.name_nl;
  new.name_en := art.name_en;
  new.icon := art.icon;
  if art.kind = 'machine' then new.qty := 1; end if;
  return new;
end;
$$;
revoke all on function public.fleet_article_sync() from public, anon, authenticated;

drop trigger if exists fleet_nodes_article_sync on public.fleet_nodes;
create trigger fleet_nodes_article_sync before insert or update on public.fleet_nodes
  for each row execute function public.fleet_article_sync();
drop trigger if exists fleet_kit_items_article_sync on public.fleet_kit_items;
create trigger fleet_kit_items_article_sync before insert or update on public.fleet_kit_items
  for each row execute function public.fleet_article_sync();

-- Normalise every existing row through the trigger once (names / icons from the article).
update public.fleet_nodes set article_id = article_id where article_id is not null;
update public.fleet_kit_items set article_id = article_id where article_id is not null;

create or replace function public.fleet_articles_after_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind and (
       exists (select 1 from public.fleet_nodes where article_id = new.id)
       or exists (select 1 from public.fleet_kit_items where article_id = new.id)) then
    raise exception 'FLEET_ARTICLE_KIND_LOCKED';
  end if;
  if (new.name, new.name_nl, new.name_en, new.icon) is distinct from (old.name, old.name_nl, old.name_en, old.icon) then
    update public.fleet_nodes set article_id = article_id where article_id = new.id;
    update public.fleet_kit_items set article_id = article_id where article_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.fleet_articles_after_update() from public, anon, authenticated;
drop trigger if exists fleet_articles_after_update on public.fleet_articles;
create trigger fleet_articles_after_update after update on public.fleet_articles
  for each row execute function public.fleet_articles_after_update();

alter table public.fleet_nodes drop constraint if exists fleet_nodes_article_shape;
alter table public.fleet_nodes add constraint fleet_nodes_article_shape
  check ((kind in ('caisse', 'machine', 'materiel')) = (article_id is not null));
alter table public.fleet_kit_items drop constraint if exists fleet_kit_items_article_shape;
alter table public.fleet_kit_items add constraint fleet_kit_items_article_shape
  check ((kind = 'zone') = (article_id is null));

-- ─── 5. RPCs ────────────────────────────────────────────────────────────────
-- Put a catalog article into a container. Admin anywhere; technicians in their own van
-- (same rule as moves). Materiel merges into an identical healthy group in the same container.
-- A crate article with a default kit is filled with that kit's articles.
create or replace function public.fleet_place_article(p_parent uuid, p_article uuid, p_qty integer default 1)
returns uuid
language plpgsql security definer
set search_path = public
as $$
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
  for i in 1..least(q, 50) loop
    insert into public.fleet_nodes (parent_id, kind, name, article_id, qty)
      values (p_parent, art.kind, art.name, art.id, 1) returning id into new_id;
    if art.kind = 'caisse' and art.default_kit_id is not null then
      perform public.fleet_apply_kit_internal(new_id, art.default_kit_id);
    end if;
    first_id := coalesce(first_id, new_id);
  end loop;
  return first_id;
end;
$$;
revoke all on function public.fleet_place_article(uuid, uuid, integer) from public, anon;
grant execute on function public.fleet_place_article(uuid, uuid, integer) to authenticated;

-- Kit apply: same matching as v1.9.0, now carries the article.
create or replace function public.fleet_apply_kit_internal(p_node uuid, p_kit uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  m jsonb := '{}'::jsonb;
  par uuid;
  existing uuid;
  root uuid;
  created integer := 0;
begin
  select root_id into root from public.fleet_nodes where id = p_node;
  if root is null then raise exception 'FLEET_NODE_NOT_FOUND'; end if;
  for r in
    with recursive t as (
      select i.*, 0 as depth from public.fleet_kit_items i
       where i.kit_id = p_kit and i.parent_item_id is null and i.active
      union all
      select i.*, t.depth + 1 from public.fleet_kit_items i join t on i.parent_item_id = t.id
       where i.active
    ) select * from t order by depth, sort
  loop
    par := case when r.parent_item_id is null then p_node else (m ->> r.parent_item_id::text)::uuid end;
    continue when par is null;
    existing := null;
    if r.kind = 'zone' and r.zone_key is not null then
      select id into existing from public.fleet_nodes where parent_id = par and zone_key = r.zone_key;
    end if;
    if existing is null then
      with recursive d as (
        select id from public.fleet_nodes where id = p_node
        union all
        select n.id from public.fleet_nodes n join d on n.parent_id = d.id
      )
      select n.id into existing from public.fleet_nodes n
       where n.kit_item_id = r.id and n.id in (select id from d) limit 1;
    end if;
    if existing is null then
      insert into public.fleet_nodes (parent_id, kind, name, name_nl, name_en, zone_key, qty, icon, kit_item_id, sort,
                                      plan_x, plan_y, plan_w, plan_h, article_id)
        values (par, r.kind, r.name, r.name_nl, r.name_en, r.zone_key,
                case when r.kind = 'machine' then 1 else r.qty end, r.icon, r.id, r.sort,
                case when r.kind = 'zone' then r.plan_x end, case when r.kind = 'zone' then r.plan_y end,
                case when r.kind = 'zone' then r.plan_w end, case when r.kind = 'zone' then r.plan_h end,
                r.article_id)
        returning id into existing;
      created := created + 1;
    end if;
    m := m || jsonb_build_object(r.id::text, existing);
  end loop;
  return created;
end;
$$;
revoke all on function public.fleet_apply_kit_internal(uuid, uuid) from public, anon, authenticated;

-- Move: a split materiel group keeps its article.
create or replace function public.fleet_move_node(p_node uuid, p_parent uuid, p_qty integer default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
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
    insert into public.fleet_nodes (parent_id, kind, name, name_nl, name_en, qty, serial, brand, model, notes, icon, kit_item_id, sort, article_id)
      values (p_parent, n.kind, n.name, n.name_nl, n.name_en, p_qty, null, n.brand, n.model, null, n.icon, null, n.sort, n.article_id)
      returning id into new_id;
    return new_id;
  end if;
  update public.fleet_nodes set parent_id = p_parent where id = p_node;
  return p_node;
end;
$$;
