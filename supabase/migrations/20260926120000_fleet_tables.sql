-- v1.7.0 — Flotte / Vloot / Fleet (1/2): tables, catalog columns, RLS, seed.
-- Applied on novaquote via Supabase MCP apply_migration.
--
-- Product catalog: REUSES public.margin_product_prices (slug = stable product id,
-- price_eur_l = price HT/L used by margins). No second product table.

-- ─── Catalog extension ──────────────────────────────────────────────────────
alter table public.margin_product_prices
  add column if not exists active boolean not null default true,
  add column if not exists color text null,
  add column if not exists pack_litres numeric null,
  add column if not exists default_min_depot numeric not null default 25,
  add column if not exists default_min_van numeric not null default 10,
  add column if not exists name_nl text null,
  add column if not exists name_en text null,
  add column if not exists sku text null,
  add column if not exists unit text not null default 'L',
  add column if not exists sort integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

do $$ begin
  alter table public.margin_product_prices
    add constraint margin_product_prices_unit_litre check (unit = 'L');
exception when duplicate_object then null; end $$;

-- Default gauge colours for existing products (editable in Flotte › Produits)
update public.margin_product_prices set color = case slug
    when 'biomix' then '#16a34a'
    when 'algimouss' then '#0ea5e9'
    when 'algivert' then '#65a30d'
    when 'amphiclean' then '#f59e0b'
    when 'kleenkup' then '#8b5cf6'
    else '#1e3a8a' end
 where color is null;

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.fleet_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin');
$$;

-- ─── Vans + assignments ─────────────────────────────────────────────────────
create table if not exists public.fleet_vans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text null,
  photo_url text null,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- start_at / end_at are calendar days (Europe/Brussels). end_at null = current driver.
-- end_at is exclusive: the day the next driver takes over.
create table if not exists public.fleet_assignments (
  id uuid primary key default gen_random_uuid(),
  van_id uuid not null references public.fleet_vans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_at date not null default ((now() at time zone 'Europe/Brussels')::date),
  end_at date null,
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fleet_assignments_dates check (end_at is null or end_at >= start_at)
);
create unique index if not exists fleet_assignments_one_open_per_van
  on public.fleet_assignments (van_id) where end_at is null;
create unique index if not exists fleet_assignments_one_open_per_user
  on public.fleet_assignments (user_id) where end_at is null;
create index if not exists fleet_assignments_user_end_idx
  on public.fleet_assignments (user_id, end_at);

-- Vans the current user drives right now
create or replace function public.fleet_my_van_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select a.van_id from public.fleet_assignments a
   where a.user_id = auth.uid() and a.end_at is null;
$$;

-- ─── Locations / balances / moves ───────────────────────────────────────────
create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('depot', 'van')),
  van_id uuid null unique references public.fleet_vans (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint stock_locations_kind_van check (
    (kind = 'depot' and van_id is null) or (kind = 'van' and van_id is not null)
  )
);
create unique index if not exists stock_locations_single_depot
  on public.stock_locations ((kind)) where kind = 'depot';

create or replace function public.fleet_depot_location_id()
returns uuid
language sql stable security definer
set search_path = public
as $$ select id from public.stock_locations where kind = 'depot' limit 1; $$;

create or replace function public.fleet_my_location_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select l.id from public.stock_locations l
   where l.van_id in (select public.fleet_my_van_ids());
$$;

create table if not exists public.stock_balances (
  location_id uuid not null references public.stock_locations (id) on delete cascade,
  product_slug text not null references public.margin_product_prices (slug)
    on update cascade on delete cascade,
  litres numeric not null default 0 check (litres >= 0),
  min_litres numeric null check (min_litres is null or min_litres >= 0), -- per-location override
  updated_at timestamptz not null default now(),
  primary key (location_id, product_slug)
);

create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('purchase', 'transfer', 'spray_consume', 'adjust')),
  product_slug text not null references public.margin_product_prices (slug)
    on update cascade on delete restrict,
  qty_litres numeric not null check (qty_litres > 0),
  -- litres actually applied to balances (spray_consume is clamped at the available stock)
  applied_litres numeric not null default 0 check (applied_litres >= 0),
  from_location_id uuid null references public.stock_locations (id) on delete restrict,
  to_location_id uuid null references public.stock_locations (id) on delete restrict,
  project_id uuid null references public.projects (id) on delete set null,
  companycam_project_id text null,
  spray_entry_id uuid null, -- spray_entries.id (no FK: sync trigger owns the lifecycle)
  user_id uuid null references public.profiles (id) on delete set null,
  reason text null check (reason is null or reason in ('breakage', 'measure', 'loss', 'correction')),
  note text null,
  unit_price numeric null,
  supplier text null,
  unknown_van boolean not null default false,
  insufficient_stock boolean not null default false,
  move_date date not null default ((now() at time zone 'Europe/Brussels')::date),
  created_by uuid null references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint stock_moves_shape check (
    (type = 'purchase' and to_location_id is not null and from_location_id is null)
    or (type = 'transfer' and to_location_id is not null and from_location_id is not null
        and to_location_id <> from_location_id)
    or (type = 'spray_consume' and from_location_id is not null and to_location_id is null)
    or (type = 'adjust' and ((from_location_id is null) <> (to_location_id is null)) and reason is not null)
  )
);
create index if not exists stock_moves_created_at_idx on public.stock_moves (created_at desc);
create unique index if not exists stock_moves_spray_entry_uniq
  on public.stock_moves (spray_entry_id, product_slug) where spray_entry_id is not null;
create index if not exists stock_moves_spray_entry_idx on public.stock_moves (spray_entry_id);
create index if not exists stock_moves_from_idx on public.stock_moves (from_location_id);
create index if not exists stock_moves_to_idx on public.stock_moves (to_location_id);

-- ─── Equipment ──────────────────────────────────────────────────────────────
create table if not exists public.equipment_templates (
  id uuid primary key default gen_random_uuid(),
  name_fr text not null,
  name_nl text null,
  name_en text null,
  icon text null,
  is_serialized boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.van_equipment (
  id uuid primary key default gen_random_uuid(),
  van_id uuid not null references public.fleet_vans (id) on delete cascade,
  template_id uuid not null references public.equipment_templates (id) on delete cascade,
  status text not null default 'ok' check (status in ('ok', 'missing', 'broken')),
  serial text null,
  note text null,
  updated_by uuid null references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint van_equipment_unique unique (van_id, template_id)
);

-- ─── Triggers: van → location + equipment copy ──────────────────────────────
create or replace function public.fleet_van_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stock_locations (kind, van_id, name) values ('van', new.id, new.name)
      on conflict (van_id) do nothing;
    insert into public.van_equipment (van_id, template_id)
      select new.id, t.id from public.equipment_templates t where t.active
      on conflict (van_id, template_id) do nothing;
  elsif tg_op = 'UPDATE' and new.name is distinct from old.name then
    update public.stock_locations set name = new.name where van_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists fleet_vans_after_write on public.fleet_vans;
create trigger fleet_vans_after_write after insert or update on public.fleet_vans
  for each row execute function public.fleet_van_after_write();

create or replace function public.fleet_touch_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_table_name = 'van_equipment' then new.updated_by = coalesce(auth.uid(), new.updated_by); end if;
  return new;
end;
$$;
drop trigger if exists fleet_vans_touch on public.fleet_vans;
create trigger fleet_vans_touch before update on public.fleet_vans
  for each row execute function public.fleet_touch_updated();
drop trigger if exists van_equipment_touch on public.van_equipment;
create trigger van_equipment_touch before update on public.van_equipment
  for each row execute function public.fleet_touch_updated();

-- ─── Triggers: moves → balances ─────────────────────────────────────────────
-- BEFORE INSERT: compute applied_litres; block manual moves that would go below 0.
create or replace function public.stock_moves_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  avail numeric;
begin
  if new.from_location_id is not null then
    select litres into avail from public.stock_balances
     where location_id = new.from_location_id and product_slug = new.product_slug
     for update;
    avail := coalesce(avail, 0);
    if new.type = 'spray_consume' then
      new.applied_litres := least(new.qty_litres, greatest(avail, 0));
      new.insufficient_stock := new.qty_litres > avail;
    else
      if new.qty_litres > avail then
        raise exception 'STOCK_NEGATIVE: % L disponibles', avail
          using errcode = 'P0001', hint = 'Use an adjustment or a transfer';
      end if;
      new.applied_litres := new.qty_litres;
    end if;
  else
    new.applied_litres := new.qty_litres;
  end if;
  return new;
end;
$$;
drop trigger if exists stock_moves_before_insert on public.stock_moves;
create trigger stock_moves_before_insert before insert on public.stock_moves
  for each row execute function public.stock_moves_before_insert();

create or replace function public.stock_apply_delta(p_location uuid, p_slug text, p_delta numeric)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_location is null or p_delta = 0 then return; end if;
  -- update-then-insert: INSERT .. ON CONFLICT would check litres >= 0 on the
  -- proposed (negative) row before resolving the conflict.
  update public.stock_balances
     set litres = litres + p_delta, updated_at = now()
   where location_id = p_location and product_slug = p_slug;
  if not found then
    insert into public.stock_balances (location_id, product_slug, litres, updated_at)
      values (p_location, p_slug, p_delta, now());
  end if;
exception when check_violation then
  raise exception 'STOCK_NEGATIVE: balance would go below 0' using errcode = 'P0001';
end;
$$;
revoke all on function public.stock_apply_delta(uuid, text, numeric) from public, anon, authenticated;

create or replace function public.stock_moves_after_write()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.from_location_id is not distinct from new.from_location_id
     and old.to_location_id is not distinct from new.to_location_id
     and old.product_slug = new.product_slug
     and old.applied_litres = new.applied_litres then
    return null; -- reference-only change (FK set null / slug cascade)
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    -- reverse old effect (credit source first so a reversal never trips the >= 0 check)
    perform public.stock_apply_delta(old.from_location_id, old.product_slug, old.applied_litres);
    perform public.stock_apply_delta(old.to_location_id, old.product_slug, -old.applied_litres);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.stock_apply_delta(new.to_location_id, new.product_slug, new.applied_litres);
    perform public.stock_apply_delta(new.from_location_id, new.product_slug, -new.applied_litres);
  end if;
  return null;
end;
$$;
drop trigger if exists stock_moves_after_write on public.stock_moves;
create trigger stock_moves_after_write after insert or update or delete on public.stock_moves
  for each row execute function public.stock_moves_after_write();

-- Moves are immutable (corrections = new adjust / spray edit). Spray moves only via sync.
create or replace function public.stock_moves_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- only reference columns may change (FK on delete set null, slug cascade)
    if new.type is distinct from old.type
       or new.qty_litres is distinct from old.qty_litres
       or new.applied_litres is distinct from old.applied_litres
       or new.from_location_id is distinct from old.from_location_id
       or new.to_location_id is distinct from old.to_location_id then
      raise exception 'stock_moves are immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.type = 'spray_consume' and coalesce(current_setting('fleet.spray_sync', true), '') <> 'on'
     and old.spray_entry_id is not null then
    raise exception 'Spray moves are managed from the spray entry' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
drop trigger if exists stock_moves_guard on public.stock_moves;
create trigger stock_moves_guard before update or delete on public.stock_moves
  for each row execute function public.stock_moves_guard();

-- ─── RPCs ───────────────────────────────────────────────────────────────────
-- Reassign a van (admin): closes the van's open row and the user's open row elsewhere.
create or replace function public.fleet_reassign_van(p_van_id uuid, p_user_id uuid, p_start date default null)
returns public.fleet_assignments
language plpgsql security definer
set search_path = public
as $$
declare
  d date := coalesce(p_start, (now() at time zone 'Europe/Brussels')::date);
  r public.fleet_assignments;
begin
  if not public.fleet_is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  update public.fleet_assignments set end_at = greatest(d, start_at)
   where end_at is null and (van_id = p_van_id or (p_user_id is not null and user_id = p_user_id));
  if p_user_id is null then
    return null; -- unassign only
  end if;
  insert into public.fleet_assignments (van_id, user_id, start_at, created_by)
    values (p_van_id, p_user_id, d, auth.uid())
    returning * into r;
  return r;
end;
$$;

-- Add NEW template items to a van without touching existing states.
create or replace function public.fleet_resync_van_equipment(p_van_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  if not (public.fleet_is_admin() or p_van_id in (select public.fleet_my_van_ids())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.van_equipment (van_id, template_id)
    select p_van_id, t.id from public.equipment_templates t where t.active
    on conflict (van_id, template_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Catalog for every signed-in role (no prices). Replaces the v1.6.21 version (extra columns).
drop function if exists public.list_spray_products();
create function public.list_spray_products()
returns table (
  slug text, name text, active boolean, color text, pack_litres numeric,
  default_min_depot numeric, default_min_van numeric, name_nl text, name_en text, sort integer
)
language sql stable security definer
set search_path = public
as $$
  select p.slug, coalesce(nullif(btrim(p.name), ''), p.slug), p.active, p.color, p.pack_litres,
         p.default_min_depot, p.default_min_van, p.name_nl, p.name_en, p.sort
    from public.margin_product_prices p
   where auth.role() = 'authenticated'
   order by p.sort, lower(coalesce(nullif(btrim(p.name), ''), p.slug));
$$;

revoke all on function public.list_spray_products() from public, anon;
grant execute on function public.list_spray_products() to authenticated;
revoke all on function public.fleet_reassign_van(uuid, uuid, date) from public, anon;
grant execute on function public.fleet_reassign_van(uuid, uuid, date) to authenticated;
revoke all on function public.fleet_resync_van_equipment(uuid) from public, anon;
grant execute on function public.fleet_resync_van_equipment(uuid) to authenticated;
revoke all on function public.fleet_is_admin() from public, anon;
grant execute on function public.fleet_is_admin() to authenticated;
revoke all on function public.fleet_my_van_ids() from public, anon;
grant execute on function public.fleet_my_van_ids() to authenticated;
revoke all on function public.fleet_my_location_ids() from public, anon;
grant execute on function public.fleet_my_location_ids() to authenticated;
revoke all on function public.fleet_depot_location_id() from public, anon;
grant execute on function public.fleet_depot_location_id() to authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.fleet_vans enable row level security;
alter table public.fleet_assignments enable row level security;
alter table public.stock_locations enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_moves enable row level security;
alter table public.equipment_templates enable row level security;
alter table public.van_equipment enable row level security;

-- fleet_vans
drop policy if exists fleet_vans_select on public.fleet_vans;
create policy fleet_vans_select on public.fleet_vans for select to authenticated
  using (public.fleet_is_admin() or id in (select public.fleet_my_van_ids()));
drop policy if exists fleet_vans_admin_write on public.fleet_vans;
create policy fleet_vans_admin_write on public.fleet_vans for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

-- fleet_assignments (history of my van + my own rows)
drop policy if exists fleet_assignments_select on public.fleet_assignments;
create policy fleet_assignments_select on public.fleet_assignments for select to authenticated
  using (public.fleet_is_admin() or user_id = auth.uid() or van_id in (select public.fleet_my_van_ids()));
drop policy if exists fleet_assignments_admin_write on public.fleet_assignments;
create policy fleet_assignments_admin_write on public.fleet_assignments for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

-- stock_locations (depot readable by all members for transfers)
drop policy if exists stock_locations_select on public.stock_locations;
create policy stock_locations_select on public.stock_locations for select to authenticated
  using (public.fleet_is_admin() or kind = 'depot' or id in (select public.fleet_my_location_ids()));
drop policy if exists stock_locations_admin_write on public.stock_locations;
create policy stock_locations_admin_write on public.stock_locations for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

-- stock_balances (written by triggers; admin may set min_litres overrides)
drop policy if exists stock_balances_select on public.stock_balances;
create policy stock_balances_select on public.stock_balances for select to authenticated
  using (public.fleet_is_admin()
         or location_id = public.fleet_depot_location_id()
         or location_id in (select public.fleet_my_location_ids()));
drop policy if exists stock_balances_admin_update on public.stock_balances;
create policy stock_balances_admin_update on public.stock_balances for update to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());
drop policy if exists stock_balances_admin_insert on public.stock_balances;
create policy stock_balances_admin_insert on public.stock_balances for insert to authenticated
  with check (public.fleet_is_admin() and litres = 0);

-- stock_moves: members read moves touching their van (or made by them);
-- members insert transfers depot ↔ their van and adjustments of their van.
drop policy if exists stock_moves_select on public.stock_moves;
create policy stock_moves_select on public.stock_moves for select to authenticated
  using (public.fleet_is_admin()
         or user_id = auth.uid()
         or from_location_id in (select public.fleet_my_location_ids())
         or to_location_id in (select public.fleet_my_location_ids()));
drop policy if exists stock_moves_admin_insert on public.stock_moves;
create policy stock_moves_admin_insert on public.stock_moves for insert to authenticated
  with check (public.fleet_is_admin() and type <> 'spray_consume');
drop policy if exists stock_moves_member_insert on public.stock_moves;
create policy stock_moves_member_insert on public.stock_moves for insert to authenticated
  with check (
    not public.fleet_is_admin()
    and user_id = auth.uid()
    and (
      (type = 'transfer'
        and ((from_location_id = public.fleet_depot_location_id()
              and to_location_id in (select public.fleet_my_location_ids()))
          or (to_location_id = public.fleet_depot_location_id()
              and from_location_id in (select public.fleet_my_location_ids()))))
      or (type = 'adjust'
        and (from_location_id in (select public.fleet_my_location_ids())
          or to_location_id in (select public.fleet_my_location_ids())))
    )
  );
drop policy if exists stock_moves_admin_delete on public.stock_moves;
create policy stock_moves_admin_delete on public.stock_moves for delete to authenticated
  using (public.fleet_is_admin());

-- equipment_templates
drop policy if exists equipment_templates_select on public.equipment_templates;
create policy equipment_templates_select on public.equipment_templates for select to authenticated
  using (true);
drop policy if exists equipment_templates_admin_write on public.equipment_templates;
create policy equipment_templates_admin_write on public.equipment_templates for all to authenticated
  using (public.fleet_is_admin()) with check (public.fleet_is_admin());

-- van_equipment
drop policy if exists van_equipment_select on public.van_equipment;
create policy van_equipment_select on public.van_equipment for select to authenticated
  using (public.fleet_is_admin() or van_id in (select public.fleet_my_van_ids()));
drop policy if exists van_equipment_update on public.van_equipment;
create policy van_equipment_update on public.van_equipment for update to authenticated
  using (public.fleet_is_admin() or van_id in (select public.fleet_my_van_ids()))
  with check (public.fleet_is_admin() or van_id in (select public.fleet_my_van_ids()));
drop policy if exists van_equipment_admin_insert on public.van_equipment;
create policy van_equipment_admin_insert on public.van_equipment for insert to authenticated
  with check (public.fleet_is_admin());
drop policy if exists van_equipment_admin_delete on public.van_equipment;
create policy van_equipment_admin_delete on public.van_equipment for delete to authenticated
  using (public.fleet_is_admin());

grant select, insert, update, delete on
  public.fleet_vans, public.fleet_assignments, public.stock_locations, public.stock_balances,
  public.stock_moves, public.equipment_templates, public.van_equipment
  to authenticated;

-- ─── Seed ───────────────────────────────────────────────────────────────────
insert into public.stock_locations (kind, name)
  select 'depot', 'Dépôt' where not exists (select 1 from public.stock_locations where kind = 'depot');

insert into public.equipment_templates (name_fr, name_nl, name_en, icon, is_serialized, sort)
select * from (values
  ('Pompe / machine', 'Pomp / machine', 'Pump / machine', 'pump', true, 10),
  ('Essence machine', 'Benzine machine', 'Machine fuel', 'fuel', false, 20),
  ('Lances', 'Lansen', 'Spray lances', 'spray', false, 30),
  ('Rallonges', 'Verlengstukken', 'Extensions', 'extension', false, 40),
  ('Manchon intercepteur 3D Ø80', 'Opvangmof 3D Ø80', '3D interceptor sleeve Ø80', 'sleeve', false, 50),
  ('Manchon Ø100', 'Mof Ø100', 'Sleeve Ø100', 'sleeve', false, 60),
  ('Joints', 'Dichtingen', 'Seals', 'seal', false, 70),
  ('Barbelé flexible', 'Flexibele prikkeldraad', 'Flexible barbed wire', 'wire', false, 80),
  ('Dragonne', 'Polsriem', 'Wrist strap', 'strap', false, 90),
  ('EPI', 'PBM', 'PPE', 'ppe', false, 100),
  ('Bidons vides', 'Lege jerrycans', 'Empty cans', 'can', false, 110),
  ('Cônes / signalisation', 'Kegels / signalisatie', 'Cones / signage', 'cone', false, 120)
) v(name_fr, name_nl, name_en, icon, is_serialized, sort)
where not exists (select 1 from public.equipment_templates);

insert into public.fleet_vans (name, sort)
select v.name, v.sort from (values ('Van 1', 1), ('Van 2', 2)) v(name, sort)
where not exists (select 1 from public.fleet_vans);

notify pgrst, 'reload schema';
