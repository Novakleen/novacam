-- v1.12.0 fix: let the FK (ON DELETE SET NULL) clear fleet_nodes.content_id when a catalog
-- content line is deleted; the lock previously rejected it (FLEET_CRATE_LOCKED).
create or replace function public.fleet_nodes_crate_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  prev text := coalesce(current_setting('fleet.crate_sync', true), '');
begin
  if prev = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.parent_id is not null and exists (select 1 from public.fleet_nodes where id = new.parent_id and kind = 'caisse') then
      raise exception 'FLEET_CRATE_LOCKED';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.parent_id is distinct from old.parent_id and (
         exists (select 1 from public.fleet_nodes where id = old.parent_id and kind = 'caisse')
         or exists (select 1 from public.fleet_nodes where id = new.parent_id and kind = 'caisse')) then
      raise exception 'FLEET_CRATE_LOCKED';
    end if;
    -- content_id may only be cleared (FK ON DELETE SET NULL when a catalog line is removed)
    if ((new.qty, new.article_id) is distinct from (old.qty, old.article_id)
         or (new.content_id is distinct from old.content_id and new.content_id is not null))
       and exists (select 1 from public.fleet_nodes where id = old.parent_id and kind = 'caisse') then
      raise exception 'FLEET_CRATE_LOCKED';
    end if;
    return new;
  else
    if exists (select 1 from public.fleet_nodes where id = old.parent_id and kind = 'caisse') then
      raise exception 'FLEET_CRATE_LOCKED';
    end if;
    if old.kind = 'caisse' then
      perform set_config('fleet.crate_sync', 'on', true);
      delete from public.fleet_nodes where parent_id = old.id;
      perform set_config('fleet.crate_sync', prev, true);
    end if;
    return old;
  end if;
end;
$function$;
