-- v1.12.0: standard crate contents defined in the catalog, locked in vans.
--  * fleet_article_contents: matériel articles (+ quantity) that make up a caisse article
--  * fleet_nodes.content_id: links a crate item to its catalog line
--  * fleet_sync_crate(): (re)builds a placed crate from the catalog; runs when a crate is placed
--    and whenever the catalog contents change. Item kept → qty/sort updated, tickets & condition
--    untouched. Item removed from the catalog → deleted, unless it has an open ticket: then it is
--    taken out of the crate (put next to it, loose) and a comment is added to the ticket.
--  * lock: outside the sync, nothing can be added to / removed from / moved in or out of a crate,
--    and crate item quantities are fixed. Deleting a crate deletes its contents.
--  * fleet_set_missing(): technicians/admins mark an item missing (open "missing" ticket) or found.
-- Additive: works with the v1.11.0 app (only crate-content edits are now refused: FLEET_CRATE_LOCKED).

-- 1. Catalog contents
create table if not exists public.fleet_article_contents (
  id uuid primary key default gen_random_uuid(),
  crate_article_id uuid not null references public.fleet_articles (id) on delete cascade,
  item_article_id uuid not null references public.fleet_articles (id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 999),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crate_article_id, item_article_id)
);
create index if not exists fleet_article_contents_item_idx on public.fleet_article_contents (item_article_id);

alter table public.fleet_article_contents enable row level security;
drop policy if exists fleet_article_contents_select on public.fleet_article_contents;
create policy fleet_article_contents_select on public.fleet_article_contents
  for select to authenticated using (true);
drop policy if exists fleet_article_contents_admin_write on public.fleet_article_contents;
create policy fleet_article_contents_admin_write on public.fleet_article_contents
  for all to authenticated using (public.fleet_is_admin()) with check (public.fleet_is_admin());
revoke all on public.fleet_article_contents from anon;
grant select, insert, update, delete on public.fleet_article_contents to authenticated;

create or replace function public.fleet_article_contents_check()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.fleet_articles where id = new.crate_article_id and kind = 'caisse') then
    raise exception 'FLEET_CONTENT_CRATE_KIND';
  end if;
  if not exists (select 1 from public.fleet_articles where id = new.item_article_id and kind = 'materiel') then
    raise exception 'FLEET_CONTENT_ITEM_KIND';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;
drop trigger if exists fleet_article_contents_check on public.fleet_article_contents;
create trigger fleet_article_contents_check before insert or update on public.fleet_article_contents
  for each row execute function public.fleet_article_contents_check();

-- 2. Link crate items to their catalog line
alter table public.fleet_nodes add column if not exists content_id uuid
  references public.fleet_article_contents (id) on delete set null;
create index if not exists fleet_nodes_content_idx on public.fleet_nodes (content_id);

-- 3. Sync
create or replace function public.fleet_sync_crate(p_crate uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cr record;
  ln record;
  nid uuid;
  keep uuid[] := '{}';
  prev text := coalesce(current_setting('fleet.crate_sync', true), '');
begin
  select id, kind, article_id, parent_id into cr from public.fleet_nodes where id = p_crate;
  if cr.id is null or cr.kind <> 'caisse' then return; end if;
  perform set_config('fleet.crate_sync', 'on', true);
  for ln in
    select * from public.fleet_article_contents where crate_article_id = cr.article_id order by sort, created_at
  loop
    nid := null;
    select id into nid from public.fleet_nodes where parent_id = p_crate and content_id = ln.id limit 1;
    if nid is null then
      select id into nid from public.fleet_nodes
       where parent_id = p_crate and content_id is null and article_id = ln.item_article_id and not (id = any (keep))
       order by created_at limit 1;
    end if;
    if nid is null then
      insert into public.fleet_nodes (parent_id, kind, name, article_id, qty, content_id, sort)
        values (p_crate, 'materiel', '-', ln.item_article_id, ln.quantity, ln.id, ln.sort)
        returning id into nid;
    else
      update public.fleet_nodes set qty = ln.quantity, content_id = ln.id, sort = ln.sort
       where id = nid and (qty, content_id, sort) is distinct from (ln.quantity, ln.id, ln.sort);
    end if;
    keep := keep || nid;
  end loop;
  -- items no longer in the standard contents
  for nid in select id from public.fleet_nodes where parent_id = p_crate and not (id = any (keep)) loop
    if exists (select 1 from public.fleet_tickets where node_id = nid and status <> 'resolu') then
      update public.fleet_nodes set parent_id = cr.parent_id, content_id = null where id = nid;
      insert into public.fleet_ticket_events (ticket_id, kind, note, created_by)
        select id, 'comment', 'Article retiré du contenu standard de la caisse : sorti de la caisse, ticket conservé.', auth.uid()
          from public.fleet_tickets where node_id = nid and status <> 'resolu';
    else
      delete from public.fleet_nodes where id = nid;
    end if;
  end loop;
  perform set_config('fleet.crate_sync', prev, true);
end;
$function$;

create or replace function public.fleet_sync_crate_article(p_article uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c uuid;
  n integer := 0;
begin
  for c in select id from public.fleet_nodes where kind = 'caisse' and article_id = p_article loop
    perform public.fleet_sync_crate(c);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

create or replace function public.fleet_article_contents_after_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.fleet_sync_crate_article(new.crate_article_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.crate_article_id <> old.crate_article_id) then
    perform public.fleet_sync_crate_article(old.crate_article_id);
  end if;
  return null;
end;
$function$;
drop trigger if exists fleet_article_contents_after_write on public.fleet_article_contents;
create trigger fleet_article_contents_after_write after insert or update or delete on public.fleet_article_contents
  for each row execute function public.fleet_article_contents_after_write();

-- a crate that is placed (or re-pointed to another article) is filled from the catalog
create or replace function public.fleet_nodes_crate_after_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.kind = 'caisse' and (tg_op = 'INSERT' or new.article_id is distinct from old.article_id) then
    perform public.fleet_sync_crate(new.id);
  end if;
  return null;
end;
$function$;
drop trigger if exists fleet_nodes_crate_after_write on public.fleet_nodes;
create trigger fleet_nodes_crate_after_write after insert or update of article_id on public.fleet_nodes
  for each row execute function public.fleet_nodes_crate_after_write();

-- 4. Lock
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
    if (new.qty, new.article_id, new.content_id) is distinct from (old.qty, old.article_id, old.content_id)
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
drop trigger if exists fleet_nodes_crate_lock on public.fleet_nodes;
create trigger fleet_nodes_crate_lock before insert or update or delete on public.fleet_nodes
  for each row execute function public.fleet_nodes_crate_lock();

-- 5. Missing flag (reuses "missing" tickets: visible in À traiter, found = resolved « retrouvé »)
create or replace function public.fleet_set_missing(p_node uuid, p_missing boolean, p_qty integer default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n record;
  tk record;
  q integer;
begin
  select id, root_id, kind, qty into n from public.fleet_nodes where id = p_node;
  if n.id is null then raise exception 'FLEET_NODE_NOT_FOUND'; end if;
  if n.kind in ('depot', 'van', 'zone') then raise exception 'FLEET_NOT_REPORTABLE'; end if;
  if not public.fleet_can_act_root(n.root_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  q := greatest(1, least(coalesce(p_qty, n.qty, 1), greatest(n.qty, 1)));
  if p_missing then
    select * into tk from public.fleet_tickets
     where node_id = p_node and severity = 'missing' and status <> 'resolu' order by reported_at limit 1;
    if tk.id is null then
      perform public.fleet_report_damage(p_node, 'missing', null, q, null);
    elsif tk.qty_affected <> q then
      update public.fleet_tickets set qty_affected = q where id = tk.id;
      insert into public.fleet_ticket_events (ticket_id, kind, note, created_by)
        values (tk.id, 'comment', 'Quantité manquante : ' || q, auth.uid());
    end if;
  else
    for tk in select id from public.fleet_tickets where node_id = p_node and severity = 'missing' and status <> 'resolu' loop
      perform public.fleet_ticket_action(tk.id, 'resolve', 'retrouve', null, null, null);
    end loop;
  end if;
end;
$function$;

revoke all on function public.fleet_sync_crate(uuid) from public, anon, authenticated;
revoke all on function public.fleet_sync_crate_article(uuid) from public, anon, authenticated;
revoke all on function public.fleet_set_missing(uuid, boolean, integer) from public, anon;
grant execute on function public.fleet_set_missing(uuid, boolean, integer) to authenticated;
