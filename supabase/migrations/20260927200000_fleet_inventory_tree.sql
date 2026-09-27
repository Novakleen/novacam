-- v1.8.0 Fleet inventory: hierarchical containers/items, damage tickets, photos, kit templates.
-- Litres stay in stock_balances / stock_moves (per depot / van location) — spray trigger untouched.
-- Depot / van nodes reuse the stock_locations ids (fleet_nodes.id = location_id).

-- ─── Tree ────────────────────────────────────────────────────────────────────
create table if not exists public.fleet_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid null references public.fleet_nodes (id) on delete restrict,
  root_id uuid null,                          -- top depot/van node (maintained by trigger)
  location_id uuid null unique references public.stock_locations (id) on delete cascade,
  kind text not null check (kind in ('depot', 'van', 'zone', 'caisse', 'machine', 'materiel')),
  name text not null check (btrim(name) <> ''),
  name_nl text null,
  name_en text null,
  zone_key text null check (zone_key in ('cab', 'bulkhead', 'left_shelf', 'right_shelf', 'floor')),
  qty integer not null default 1 check (qty >= 0),
  serial text null,
  brand text null,
  model text null,
  notes text null,
  icon text null,
  condition text not null default 'ok' check (condition in ('ok', 'damaged_usable', 'broken', 'missing')),
  kit_item_id uuid null,                      -- template item this node came from (resync key)
  sort integer not null default 0,
  active boolean not null default true,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint fleet_nodes_root_shape check ((kind in ('depot', 'van')) = (parent_id is null)),
  constraint fleet_nodes_location_shape check (
    (kind in ('depot', 'van')) = (location_id is not null) and (location_id is null or location_id = id)
  ),
  constraint fleet_nodes_zone_shape check ((kind = 'zone') = (zone_key is not null)),
  constraint fleet_nodes_machine_qty check (kind <> 'machine' or qty = 1)
);
create index if not exists fleet_nodes_parent_idx on public.fleet_nodes (parent_id, sort);
create index if not exists fleet_nodes_root_idx on public.fleet_nodes (root_id);
create index if not exists fleet_nodes_kit_item_idx on public.fleet_nodes (kit_item_id);
create unique index if not exists fleet_nodes_zone_unique on public.fleet_nodes (parent_id, zone_key)
  where zone_key is not null;

-- Parent must be a container; no cycles; root_id follows the parent; condition is derived only.
create or replace function public.fleet_nodes_before_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  p record;
  hit boolean;
begin
  if tg_op = 'UPDATE' and new.condition is distinct from old.condition
     and coalesce(current_setting('fleet.cond_sync', true), '') <> 'on' then
    new.condition := old.condition;   -- condition comes from open tickets
  elsif tg_op = 'INSERT' and coalesce(current_setting('fleet.cond_sync', true), '') <> 'on' then
    new.condition := 'ok';
  end if;
  if new.parent_id is null then
    new.root_id := new.id;
  elsif tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id then
    select id, kind, root_id into p from public.fleet_nodes where id = new.parent_id;
    if p.id is null then raise exception 'FLEET_PARENT_NOT_FOUND'; end if;
    if p.kind = 'materiel' then raise exception 'FLEET_PARENT_NOT_CONTAINER'; end if;
    if new.kind = 'zone' and p.kind not in ('van', 'depot') then
      raise exception 'FLEET_ZONE_PARENT';
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
$$;
drop trigger if exists fleet_nodes_before_write on public.fleet_nodes;
create trigger fleet_nodes_before_write before insert or update on public.fleet_nodes
  for each row execute function public.fleet_nodes_before_write();

-- Moving a container moves its contents: propagate root_id to descendants.
create or replace function public.fleet_nodes_after_move()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.root_id is distinct from old.root_id then
    with recursive d as (
      select id from public.fleet_nodes where parent_id = new.id
      union all
      select n.id from public.fleet_nodes n join d on n.parent_id = d.id
    )
    update public.fleet_nodes set root_id = new.root_id where id in (select id from d);
  end if;
  return null;
end;
$$;
drop trigger if exists fleet_nodes_after_move on public.fleet_nodes;
create trigger fleet_nodes_after_move after update of parent_id on public.fleet_nodes
  for each row execute function public.fleet_nodes_after_move();

-- ─── Kit templates (modèles de kit) ─────────────────────────────────────────
create table if not exists public.fleet_kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_nl text null,
  name_en text null,
  target_kind text not null default 'van' check (target_kind in ('van', 'caisse')),
  is_default boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fleet_kits_single_default on public.fleet_kits (target_kind) where is_default;

create table if not exists public.fleet_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.fleet_kits (id) on delete cascade,
  parent_item_id uuid null references public.fleet_kit_items (id) on delete cascade,
  kind text not null check (kind in ('zone', 'caisse', 'machine', 'materiel')),
  name text not null,
  name_nl text null,
  name_en text null,
  zone_key text null check (zone_key in ('cab', 'bulkhead', 'left_shelf', 'right_shelf', 'floor')),
  qty integer not null default 1 check (qty >= 1),
  icon text null,
  sort integer not null default 0,
  active boolean not null default true,
  constraint fleet_kit_items_zone check ((kind = 'zone') = (zone_key is not null))
);
create index if not exists fleet_kit_items_kit_idx on public.fleet_kit_items (kit_id, parent_item_id, sort);

-- Apply / resync a kit under a node: creates missing expected items, never overwrites.
-- Matching: a descendant created from the same kit item (even if moved elsewhere in the tree),
-- or for zones the zone with the same key directly under the target.
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
    if r.kind = 'zone' then
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
      insert into public.fleet_nodes (parent_id, kind, name, name_nl, name_en, zone_key, qty, icon, kit_item_id, sort)
        values (par, r.kind, r.name, r.name_nl, r.name_en, r.zone_key,
                case when r.kind = 'machine' then 1 else r.qty end, r.icon, r.id, r.sort)
        returning id into existing;
      created := created + 1;
    end if;
    m := m || jsonb_build_object(r.id::text, existing);
  end loop;
  return created;
end;
$$;
revoke all on function public.fleet_apply_kit_internal(uuid, uuid) from public, anon, authenticated;

create or replace function public.fleet_apply_kit(p_node uuid, p_kit uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fleet_is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return public.fleet_apply_kit_internal(p_node, p_kit);
end;
$$;

-- ─── Damage tickets, events, photos ─────────────────────────────────────────
create table if not exists public.fleet_tickets (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.fleet_nodes (id) on delete cascade,
  severity text not null check (severity in ('damaged_usable', 'broken', 'missing')),
  status text not null default 'signale'
    check (status in ('signale', 'vu', 'en_reparation', 'commande', 'resolu')),
  resolution text null check (resolution in ('repare', 'remplace', 'retrouve')),
  qty_affected integer not null default 1 check (qty_affected > 0),
  note text null,
  repair_cost numeric null check (repair_cost is null or repair_cost >= 0),
  reported_by uuid null references public.profiles (id) on delete set null,
  reported_at timestamptz not null default now(),
  resolved_by uuid null references public.profiles (id) on delete set null,
  resolved_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint fleet_tickets_resolution check ((status = 'resolu') = (resolution is not null))
);
create index if not exists fleet_tickets_node_idx on public.fleet_tickets (node_id);
create index if not exists fleet_tickets_open_idx on public.fleet_tickets (status) where status <> 'resolu';

create table if not exists public.fleet_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.fleet_tickets (id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'severity', 'comment', 'photo', 'cost')),
  from_value text null,
  to_value text null,
  note text null,
  photo_path text null,
  cost numeric null,
  created_by uuid null default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fleet_ticket_events_ticket_idx on public.fleet_ticket_events (ticket_id, created_at);

create table if not exists public.fleet_photos (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.fleet_nodes (id) on delete cascade,
  ticket_id uuid null references public.fleet_tickets (id) on delete cascade,
  path text not null unique,
  created_by uuid null default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fleet_photos_node_idx on public.fleet_photos (node_id);

-- Node condition = worst open ticket (broken > missing > damaged_usable), else ok.
create or replace function public.fleet_recompute_condition(p_node uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c text;
begin
  select t.severity into c from public.fleet_tickets t
   where t.node_id = p_node and t.status <> 'resolu'
   order by case t.severity when 'broken' then 3 when 'missing' then 2 else 1 end desc
   limit 1;
  perform set_config('fleet.cond_sync', 'on', true);
  update public.fleet_nodes set condition = coalesce(c, 'ok')
   where id = p_node and condition is distinct from coalesce(c, 'ok');
  perform set_config('fleet.cond_sync', 'off', true);
end;
$$;
revoke all on function public.fleet_recompute_condition(uuid) from public, anon, authenticated;

create or replace function public.fleet_tickets_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.fleet_recompute_condition(new.node_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.node_id <> old.node_id) then
    perform public.fleet_recompute_condition(old.node_id);
  end if;
  return null;
end;
$$;
drop trigger if exists fleet_tickets_after_write on public.fleet_tickets;
create trigger fleet_tickets_after_write after insert or update or delete on public.fleet_tickets
  for each row execute function public.fleet_tickets_after_write();

create or replace function public.fleet_generic_touch()
returns trigger
language plpgsql
set search_path = public
as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists fleet_tickets_touch on public.fleet_tickets;
create trigger fleet_tickets_touch before update on public.fleet_tickets
  for each row execute function public.fleet_generic_touch();
drop trigger if exists fleet_kits_touch on public.fleet_kits;
create trigger fleet_kits_touch before update on public.fleet_kits
  for each row execute function public.fleet_generic_touch();

-- ─── Access helpers ─────────────────────────────────────────────────────────
-- A member "acts" on their assigned van's tree; everyone signed-in may read the depot tree.
create or replace function public.fleet_can_act_root(p_root uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.fleet_is_admin() or p_root in (select public.fleet_my_location_ids());
$$;

create or replace function public.fleet_can_see_root(p_root uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.fleet_can_act_root(p_root) or p_root = public.fleet_depot_location_id();
$$;

create or replace function public.fleet_node_root(p_node uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$ select root_id from public.fleet_nodes where id = p_node; $$;

-- Storage path: nodes/<node_uuid>/<file>. Read = node visible; write = node in my van (or admin).
create or replace function public.fleet_photo_path_ok(p_name text, p_write boolean)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  nid uuid;
  root uuid;
begin
  if public.fleet_is_admin() then return true; end if;
  if array_length(parts, 1) < 3 or parts[1] <> 'nodes' then return false; end if;
  begin
    nid := parts[2]::uuid;
  exception when others then
    return false;
  end;
  root := public.fleet_node_root(nid);
  if root is null then return false; end if;
  return case when p_write then public.fleet_can_act_root(root) else public.fleet_can_see_root(root) end;
end;
$$;

-- ─── RPCs for members (all permission-checked) ──────────────────────────────
create or replace function public.fleet_report_damage(
  p_node uuid, p_severity text, p_note text default null, p_qty integer default 1,
  p_photo_paths text[] default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  n record;
  tid uuid;
  ph text;
begin
  select id, root_id, kind, qty into n from public.fleet_nodes where id = p_node;
  if n.id is null then raise exception 'FLEET_NODE_NOT_FOUND'; end if;
  if n.kind in ('depot', 'van', 'zone') then raise exception 'FLEET_NOT_REPORTABLE'; end if;
  if not public.fleet_can_act_root(n.root_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.fleet_tickets (node_id, severity, qty_affected, note, reported_by)
    values (p_node, p_severity, greatest(1, least(coalesce(p_qty, 1), greatest(n.qty, 1))),
            nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    returning id into tid;
  insert into public.fleet_ticket_events (ticket_id, kind, to_value, note, created_by)
    values (tid, 'created', p_severity, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  foreach ph in array coalesce(p_photo_paths, '{}') loop
    if ph not like 'nodes/' || p_node::text || '/%' then raise exception 'FLEET_BAD_PHOTO_PATH'; end if;
    insert into public.fleet_photos (node_id, ticket_id, path, created_by) values (p_node, tid, ph, auth.uid());
    insert into public.fleet_ticket_events (ticket_id, kind, photo_path, created_by)
      values (tid, 'photo', ph, auth.uid());
  end loop;
  return tid;
end;
$$;

-- actions: comment | photo | escalate (value = severity) | status (value = vu|en_reparation|commande)
--          resolve (value = repare|remplace|retrouve) | reopen | cost (p_cost)
-- Members (own van): comment, photo, escalate upwards, resolve 'retrouve' of a missing item.
create or replace function public.fleet_ticket_action(
  p_ticket uuid, p_action text, p_value text default null, p_note text default null,
  p_cost numeric default null, p_photo_path text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  tk record;
  root uuid;
  adm boolean := public.fleet_is_admin();
  note text := nullif(btrim(coalesce(p_note, '')), '');
  rank_old int;
  rank_new int;
begin
  select * into tk from public.fleet_tickets where id = p_ticket;
  if tk.id is null then raise exception 'FLEET_TICKET_NOT_FOUND'; end if;
  root := public.fleet_node_root(tk.node_id);
  if not public.fleet_can_act_root(root) then raise exception 'Not allowed' using errcode = '42501'; end if;

  if p_action = 'comment' then
    if note is null then raise exception 'FLEET_NOTE_REQUIRED'; end if;
    insert into public.fleet_ticket_events (ticket_id, kind, note, created_by) values (p_ticket, 'comment', note, auth.uid());
  elsif p_action = 'photo' then
    if p_photo_path is null or p_photo_path not like 'nodes/' || tk.node_id::text || '/%' then
      raise exception 'FLEET_BAD_PHOTO_PATH';
    end if;
    insert into public.fleet_photos (node_id, ticket_id, path, created_by) values (tk.node_id, p_ticket, p_photo_path, auth.uid());
    insert into public.fleet_ticket_events (ticket_id, kind, photo_path, note, created_by)
      values (p_ticket, 'photo', p_photo_path, note, auth.uid());
  elsif p_action = 'escalate' then
    if p_value not in ('damaged_usable', 'broken', 'missing') then raise exception 'FLEET_BAD_SEVERITY'; end if;
    if tk.status = 'resolu' then raise exception 'FLEET_TICKET_CLOSED'; end if;
    rank_old := case tk.severity when 'broken' then 3 when 'missing' then 2 else 1 end;
    rank_new := case p_value when 'broken' then 3 when 'missing' then 2 else 1 end;
    if not adm and rank_new <= rank_old then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.fleet_tickets set severity = p_value where id = p_ticket;
    insert into public.fleet_ticket_events (ticket_id, kind, from_value, to_value, note, created_by)
      values (p_ticket, 'severity', tk.severity, p_value, note, auth.uid());
  elsif p_action = 'status' then
    if not adm then raise exception 'Not allowed' using errcode = '42501'; end if;
    if p_value not in ('signale', 'vu', 'en_reparation', 'commande') then raise exception 'FLEET_BAD_STATUS'; end if;
    update public.fleet_tickets set status = p_value, resolution = null, resolved_at = null, resolved_by = null
     where id = p_ticket;
    insert into public.fleet_ticket_events (ticket_id, kind, from_value, to_value, note, created_by)
      values (p_ticket, 'status', tk.status, p_value, note, auth.uid());
  elsif p_action = 'resolve' then
    if p_value not in ('repare', 'remplace', 'retrouve') then raise exception 'FLEET_BAD_RESOLUTION'; end if;
    if not adm and not (p_value = 'retrouve' and tk.severity = 'missing') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    update public.fleet_tickets
       set status = 'resolu', resolution = p_value, resolved_at = now(), resolved_by = auth.uid(),
           repair_cost = coalesce(p_cost, repair_cost)
     where id = p_ticket;
    insert into public.fleet_ticket_events (ticket_id, kind, from_value, to_value, note, cost, created_by)
      values (p_ticket, 'status', tk.status, 'resolu:' || p_value, note, p_cost, auth.uid());
  elsif p_action = 'reopen' then
    if not adm then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.fleet_tickets set status = 'signale', resolution = null, resolved_at = null, resolved_by = null
     where id = p_ticket;
    insert into public.fleet_ticket_events (ticket_id, kind, from_value, to_value, note, created_by)
      values (p_ticket, 'status', tk.status, 'signale', note, auth.uid());
  elsif p_action = 'cost' then
    if not adm then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.fleet_tickets set repair_cost = p_cost where id = p_ticket;
    insert into public.fleet_ticket_events (ticket_id, kind, cost, note, created_by)
      values (p_ticket, 'cost', p_cost, note, auth.uid());
  else
    raise exception 'FLEET_BAD_ACTION';
  end if;
end;
$$;

-- Move a node (with all its contents) under a new container. p_qty < qty splits a materiel group.
-- Members: source in their van or the depot (taking stock), destination in their van.
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
    insert into public.fleet_nodes (parent_id, kind, name, name_nl, name_en, qty, serial, brand, model, notes, icon, kit_item_id, sort)
      values (p_parent, n.kind, n.name, n.name_nl, n.name_en, p_qty, null, n.brand, n.model, null, n.icon, null, n.sort)
      returning id into new_id;
    return new_id;
  end if;
  update public.fleet_nodes set parent_id = p_parent where id = p_node;
  return p_node;
end;
$$;

-- ─── Vans: create location + tree node + default kit (replaces the checklist copy) ───
create or replace function public.fleet_van_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  loc uuid;
  kit uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.stock_locations (kind, van_id, name) values ('van', new.id, new.name)
      on conflict (van_id) do nothing;
    select id into loc from public.stock_locations where van_id = new.id;
    insert into public.fleet_nodes (id, location_id, kind, name, sort)
      values (loc, loc, 'van', new.name, coalesce(new.sort, 0))
      on conflict (id) do nothing;
    select id into kit from public.fleet_kits where target_kind = 'van' and is_default and active limit 1;
    if kit is not null then perform public.fleet_apply_kit_internal(loc, kit); end if;
  elsif tg_op = 'UPDATE' and new.name is distinct from old.name then
    update public.stock_locations set name = new.name where van_id = new.id;
    update public.fleet_nodes set name = new.name where location_id in (select id from public.stock_locations where van_id = new.id);
  end if;
  return null;
end;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.fleet_nodes enable row level security;
alter table public.fleet_kits enable row level security;
alter table public.fleet_kit_items enable row level security;
alter table public.fleet_tickets enable row level security;
alter table public.fleet_ticket_events enable row level security;
alter table public.fleet_photos enable row level security;

drop policy if exists fleet_nodes_select on public.fleet_nodes;
create policy fleet_nodes_select on public.fleet_nodes for select to authenticated
  using (public.fleet_can_see_root(root_id));
drop policy if exists fleet_nodes_admin_write on public.fleet_nodes;
create policy fleet_nodes_admin_write on public.fleet_nodes for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

drop policy if exists fleet_kits_select on public.fleet_kits;
create policy fleet_kits_select on public.fleet_kits for select to authenticated using (true);
drop policy if exists fleet_kits_admin_write on public.fleet_kits;
create policy fleet_kits_admin_write on public.fleet_kits for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());
drop policy if exists fleet_kit_items_select on public.fleet_kit_items;
create policy fleet_kit_items_select on public.fleet_kit_items for select to authenticated using (true);
drop policy if exists fleet_kit_items_admin_write on public.fleet_kit_items;
create policy fleet_kit_items_admin_write on public.fleet_kit_items for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

-- Tickets: members see tickets of their van's items (depot items: admin only)
drop policy if exists fleet_tickets_select on public.fleet_tickets;
create policy fleet_tickets_select on public.fleet_tickets for select to authenticated
  using (public.fleet_can_act_root(public.fleet_node_root(node_id)));
drop policy if exists fleet_tickets_admin_write on public.fleet_tickets;
create policy fleet_tickets_admin_write on public.fleet_tickets for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());
drop policy if exists fleet_ticket_events_select on public.fleet_ticket_events;
create policy fleet_ticket_events_select on public.fleet_ticket_events for select to authenticated
  using (exists (select 1 from public.fleet_tickets t where t.id = ticket_id));
drop policy if exists fleet_ticket_events_admin_write on public.fleet_ticket_events;
create policy fleet_ticket_events_admin_write on public.fleet_ticket_events for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());
drop policy if exists fleet_photos_select on public.fleet_photos;
create policy fleet_photos_select on public.fleet_photos for select to authenticated
  using (public.fleet_can_see_root(public.fleet_node_root(node_id)));
drop policy if exists fleet_photos_admin_write on public.fleet_photos;
create policy fleet_photos_admin_write on public.fleet_photos for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

-- ─── Storage bucket for photos (private) ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fleet-photos', 'fleet-photos', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fleet_photos_obj_select on storage.objects;
create policy fleet_photos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'fleet-photos' and public.fleet_photo_path_ok(name, false));
drop policy if exists fleet_photos_obj_insert on storage.objects;
create policy fleet_photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fleet-photos' and public.fleet_photo_path_ok(name, true));
drop policy if exists fleet_photos_obj_delete on storage.objects;
create policy fleet_photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fleet-photos' and public.fleet_is_admin());

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.fleet_nodes_before_write() from public, anon, authenticated;
revoke all on function public.fleet_nodes_after_move() from public, anon, authenticated;
revoke all on function public.fleet_tickets_after_write() from public, anon, authenticated;
revoke all on function public.fleet_generic_touch() from public, anon, authenticated;
revoke all on function public.fleet_van_after_write() from public, anon, authenticated;
revoke all on function public.fleet_can_act_root(uuid) from public, anon;
revoke all on function public.fleet_can_see_root(uuid) from public, anon;
revoke all on function public.fleet_node_root(uuid) from public, anon;
revoke all on function public.fleet_photo_path_ok(text, boolean) from public, anon;
revoke all on function public.fleet_apply_kit(uuid, uuid) from public, anon;
revoke all on function public.fleet_report_damage(uuid, text, text, integer, text[]) from public, anon;
revoke all on function public.fleet_ticket_action(uuid, text, text, text, numeric, text) from public, anon;
revoke all on function public.fleet_move_node(uuid, uuid, integer) from public, anon;
grant execute on function public.fleet_can_act_root(uuid), public.fleet_can_see_root(uuid),
  public.fleet_node_root(uuid), public.fleet_photo_path_ok(text, boolean),
  public.fleet_apply_kit(uuid, uuid), public.fleet_report_damage(uuid, text, text, integer, text[]),
  public.fleet_ticket_action(uuid, text, text, text, numeric, text),
  public.fleet_move_node(uuid, uuid, integer) to authenticated;
