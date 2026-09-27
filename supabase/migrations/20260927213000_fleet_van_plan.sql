-- v1.9.0 Editable van plan: zone geometry on the node (cm, relative to the cargo floor's
-- top-left corner; the cab sits at negative y). Custom zones (no zone_key) allowed.
-- Kit items carry the default layout, copied to new vans by fleet_apply_kit_internal.

alter table public.fleet_nodes
  add column if not exists plan_x numeric null,
  add column if not exists plan_y numeric null,
  add column if not exists plan_w numeric null,
  add column if not exists plan_h numeric null;
alter table public.fleet_kit_items
  add column if not exists plan_x numeric null,
  add column if not exists plan_y numeric null,
  add column if not exists plan_w numeric null,
  add column if not exists plan_h numeric null;

alter table public.fleet_nodes drop constraint if exists fleet_nodes_plan_shape;
alter table public.fleet_nodes add constraint fleet_nodes_plan_shape check (
  (plan_x is null and plan_y is null and plan_w is null and plan_h is null)
  or (kind = 'zone' and plan_x is not null and plan_y is not null and plan_w > 0 and plan_h > 0)
);
alter table public.fleet_kit_items drop constraint if exists fleet_kit_items_plan_shape;
alter table public.fleet_kit_items add constraint fleet_kit_items_plan_shape check (
  (plan_x is null and plan_y is null and plan_w is null and plan_h is null)
  or (kind = 'zone' and plan_x is not null and plan_y is not null and plan_w > 0 and plan_h > 0)
);

-- Custom zones: zone_key becomes optional (still only allowed on zones)
alter table public.fleet_nodes drop constraint if exists fleet_nodes_zone_shape;
alter table public.fleet_nodes add constraint fleet_nodes_zone_shape check (zone_key is null or kind = 'zone');
alter table public.fleet_kit_items drop constraint if exists fleet_kit_items_zone;
alter table public.fleet_kit_items add constraint fleet_kit_items_zone check (zone_key is null or kind = 'zone');

-- Default Expert L3 layout (cargo 164 × 286 cm)
with d(zone_key, x, y, w, h) as (values
  ('cab', 8, -91, 148, 78),
  ('bulkhead', 2, 4, 160, 44),
  ('left_shelf', 2, 52, 40, 229),
  ('floor', 46, 52, 72, 229),
  ('right_shelf', 122, 110, 40, 171)
)
update public.fleet_nodes n set plan_x = d.x, plan_y = d.y, plan_w = d.w, plan_h = d.h
  from d where n.kind = 'zone' and n.zone_key = d.zone_key and n.plan_x is null;
with d(zone_key, x, y, w, h) as (values
  ('cab', 8, -91, 148, 78),
  ('bulkhead', 2, 4, 160, 44),
  ('left_shelf', 2, 52, 40, 229),
  ('floor', 46, 52, 72, 229),
  ('right_shelf', 122, 110, 40, 171)
)
update public.fleet_kit_items i set plan_x = d.x, plan_y = d.y, plan_w = d.w, plan_h = d.h
  from d where i.kind = 'zone' and i.zone_key = d.zone_key and i.plan_x is null;

-- Kit apply: same matching as v1.8.0, now copies the zone geometry
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
                                      plan_x, plan_y, plan_w, plan_h)
        values (par, r.kind, r.name, r.name_nl, r.name_en, r.zone_key,
                case when r.kind = 'machine' then 1 else r.qty end, r.icon, r.id, r.sort,
                case when r.kind = 'zone' then r.plan_x end, case when r.kind = 'zone' then r.plan_y end,
                case when r.kind = 'zone' then r.plan_w end, case when r.kind = 'zone' then r.plan_h end)
        returning id into existing;
      created := created + 1;
    end if;
    m := m || jsonb_build_object(r.id::text, existing);
  end loop;
  return created;
end;
$$;
revoke all on function public.fleet_apply_kit_internal(uuid, uuid) from public, anon, authenticated;

-- Zone geometry: admin, or the technician assigned to that van (layout only; structure stays admin).
create or replace function public.fleet_set_zone_geometry(
  p_node uuid, p_x numeric, p_y numeric, p_w numeric, p_h numeric
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  n record;
begin
  select id, kind, root_id into n from public.fleet_nodes where id = p_node;
  if n.id is null then raise exception 'FLEET_NODE_NOT_FOUND'; end if;
  if n.kind <> 'zone' then raise exception 'FLEET_NOT_A_ZONE'; end if;
  if not public.fleet_can_act_root(n.root_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_w is null or p_h is null or p_w < 10 or p_h < 10
     or p_x < -10 or p_x + p_w > 174 or p_y < -100 or p_y + p_h > 290 then
    raise exception 'FLEET_BAD_GEOMETRY';
  end if;
  update public.fleet_nodes
     set plan_x = round(p_x, 1), plan_y = round(p_y, 1), plan_w = round(p_w, 1), plan_h = round(p_h, 1)
   where id = p_node;
end;
$$;
revoke all on function public.fleet_set_zone_geometry(uuid, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.fleet_set_zone_geometry(uuid, numeric, numeric, numeric, numeric) to authenticated;
