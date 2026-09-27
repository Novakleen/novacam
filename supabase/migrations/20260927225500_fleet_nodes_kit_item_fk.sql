-- v1.9.3: deleting a kit item must never delete the real van items created from it,
-- only unlink them. fleet_nodes.kit_item_id had no FK, so deletes left dangling ids.
update public.fleet_nodes n
   set kit_item_id = null
 where kit_item_id is not null
   and not exists (select 1 from public.fleet_kit_items k where k.id = n.kit_item_id);

alter table public.fleet_nodes
  drop constraint if exists fleet_nodes_kit_item_id_fkey;
alter table public.fleet_nodes
  add constraint fleet_nodes_kit_item_id_fkey
  foreign key (kit_item_id) references public.fleet_kit_items(id) on delete set null;

create index if not exists fleet_nodes_kit_item_id_idx on public.fleet_nodes (kit_item_id);
