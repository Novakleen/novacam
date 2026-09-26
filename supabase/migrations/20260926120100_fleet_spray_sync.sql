-- v1.7.0 — Flotte (2/2): spray entries automatically debit the technician's van.
-- Applied on novaquote via Supabase MCP apply_migration.
--
-- One spray_entries row = one product (product_slug) → at most one spray_consume move
-- (unique (spray_entry_id, product_slug)). Idempotent: insert/update/delete re-derive the move.
-- Van = assignment of the spray's user covering work_date, else current assignment,
-- else Depot with unknown_van = true. Never blocks the spray save: if the van lacks
-- stock the move is recorded with applied_litres clamped + insufficient_stock = true.
-- Only catalog products (product_slug present in margin_product_prices) are tracked.
-- Existing spray entries are NOT back-filled (initial stock = 0).

create or replace function public.fleet_resolve_location(p_user uuid, p_day date, out location_id uuid, out unknown_van boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare v uuid;
begin
  select a.van_id into v from public.fleet_assignments a
   where a.user_id = p_user and a.start_at <= p_day and (a.end_at is null or a.end_at > p_day)
   order by a.start_at desc limit 1;
  if v is null then
    select a.van_id into v from public.fleet_assignments a
     where a.user_id = p_user and a.end_at is null limit 1;
  end if;
  if v is not null then
    select l.id into location_id from public.stock_locations l where l.van_id = v;
  end if;
  if location_id is null then
    location_id := public.fleet_depot_location_id();
    unknown_van := true;
  else
    unknown_van := false;
  end if;
end;
$$;
revoke all on function public.fleet_resolve_location(uuid, date) from public, anon;
grant execute on function public.fleet_resolve_location(uuid, date) to authenticated;

create or replace function public.fleet_spray_sync()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  loc record;
  relevant boolean;
begin
  if tg_op = 'UPDATE'
     and new.product_slug is not distinct from old.product_slug
     and new.product_quantity is not distinct from old.product_quantity
     and new.user_id is not distinct from old.user_id
     and new.work_date is not distinct from old.work_date
     and new.project_id is not distinct from old.project_id
     and new.companycam_project_id is not distinct from old.companycam_project_id then
    return null; -- notes / surface / dilution edits: stock untouched
  end if;

  perform set_config('fleet.spray_sync', 'on', true);

  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.stock_moves where spray_entry_id = old.id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    relevant := new.product_slug is not null
      and coalesce(new.product_quantity, 0) > 0
      and exists (select 1 from public.margin_product_prices p where p.slug = new.product_slug)
      and public.fleet_depot_location_id() is not null;
    if relevant then
      select * into loc from public.fleet_resolve_location(new.user_id, coalesce(new.work_date, (now() at time zone 'Europe/Brussels')::date));
      insert into public.stock_moves (
        type, product_slug, qty_litres, from_location_id, project_id, companycam_project_id,
        spray_entry_id, user_id, unknown_van, move_date, created_by
      ) values (
        'spray_consume', new.product_slug, new.product_quantity, loc.location_id, new.project_id,
        new.companycam_project_id, new.id, new.user_id, loc.unknown_van,
        coalesce(new.work_date, (now() at time zone 'Europe/Brussels')::date), coalesce(auth.uid(), new.user_id)
      );
    end if;
  end if;

  perform set_config('fleet.spray_sync', 'off', true);
  return null;
exception when others then
  -- never break the spray save because of stock bookkeeping
  perform set_config('fleet.spray_sync', 'off', true);
  raise warning 'fleet_spray_sync failed for %: %', coalesce(new.id, old.id), sqlerrm;
  return null;
end;
$$;

drop trigger if exists spray_entries_fleet_sync on public.spray_entries;
create trigger spray_entries_fleet_sync
  after insert or update or delete on public.spray_entries
  for each row execute function public.fleet_spray_sync();

notify pgrst, 'reload schema';
