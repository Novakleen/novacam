-- v1.8.0 seed: kit templates + migrate depot / vans into the inventory tree.
-- The 12 former checklist items (equipment_templates) become items grouped in zones / caisses.

do $$
declare
  kv uuid; kr uuid; ke uuid;
  z_cab uuid; z_bulk uuid; z_left uuid; z_right uuid; z_floor uuid;
  c_epi uuid; c_rac uuid;
  loc record;
begin
  if not exists (select 1 from public.fleet_kits where target_kind = 'van' and is_default) then
    insert into public.fleet_kits (name, name_nl, name_en, target_kind, is_default, sort)
      values ('Kit van standard (Expert L3)', 'Standaardkit bestelwagen (Expert L3)', 'Standard van kit (Expert L3)', 'van', true, 10)
      returning id into kv;

    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, zone_key, sort) values
      (kv, 'zone', 'Cabine', 'Cabine', 'Cab', 'cab', 10) returning id into z_cab;
    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, zone_key, sort) values
      (kv, 'zone', 'Zone cloison', 'Zone tussenschot', 'Bulkhead zone', 'bulkhead', 20) returning id into z_bulk;
    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, zone_key, sort) values
      (kv, 'zone', 'Étagères gauche', 'Rekken links', 'Left shelves', 'left_shelf', 30) returning id into z_left;
    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, zone_key, sort) values
      (kv, 'zone', 'Étagères droite', 'Rekken rechts', 'Right shelves', 'right_shelf', 40) returning id into z_right;
    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, zone_key, sort) values
      (kv, 'zone', 'Plancher', 'Laadvloer', 'Floor', 'floor', 50) returning id into z_floor;

    -- Bulkhead: EPI caisse
    insert into public.fleet_kit_items (kit_id, parent_item_id, kind, name, name_nl, name_en, icon, sort) values
      (kv, z_bulk, 'caisse', 'Caisse EPI', 'Kist PBM', 'PPE box', 'box', 10) returning id into c_epi;
    insert into public.fleet_kit_items (kit_id, parent_item_id, kind, name, name_nl, name_en, icon, sort) values
      (kv, c_epi, 'materiel', 'EPI', 'PBM', 'PPE', 'ppe', 10);

    -- Left shelves: lances, rallonges, dragonne
    insert into public.fleet_kit_items (kit_id, parent_item_id, kind, name, name_nl, name_en, icon, sort) values
      (kv, z_left, 'materiel', 'Lances', 'Lansen', 'Spray lances', 'spray', 10),
      (kv, z_left, 'materiel', 'Rallonges', 'Verlengstukken', 'Extensions', 'extension', 20),
      (kv, z_left, 'materiel', 'Dragonne', 'Polsriem', 'Wrist strap', 'strap', 30);

    -- Right shelves: Caisse raccords
    insert into public.fleet_kit_items (kit_id, parent_item_id, kind, name, name_nl, name_en, icon, sort) values
      (kv, z_right, 'caisse', 'Caisse raccords', 'Kist koppelingen', 'Fittings box', 'box', 10) returning id into c_rac;
    insert into public.fleet_kit_items (kit_id, parent_item_id, kind, name, name_nl, name_en, icon, sort) values
      (kv, c_rac, 'materiel', 'Manchon intercepteur 3D Ø80', 'Opvangmof 3D Ø80', '3D interceptor sleeve Ø80', 'sleeve', 10),
      (kv, c_rac, 'materiel', 'Manchon Ø100', 'Mof Ø100', 'Sleeve Ø100', 'sleeve', 20),
      (kv, c_rac, 'materiel', 'Joints', 'Dichtingen', 'Seals', 'seal', 30),
      (kv, c_rac, 'materiel', 'Barbelé flexible', 'Flexibele prikkeldraad', 'Flexible barbed wire', 'wire', 40);

    -- Floor: pump (machine), fuel, empty cans, cones
    insert into public.fleet_kit_items (kit_id, parent_item_id, kind, name, name_nl, name_en, icon, sort) values
      (kv, z_floor, 'machine', 'Pompe / machine', 'Pomp / machine', 'Pump / machine', 'pump', 10),
      (kv, z_floor, 'materiel', 'Essence machine', 'Benzine machine', 'Machine fuel', 'fuel', 20),
      (kv, z_floor, 'materiel', 'Bidons vides', 'Lege jerrycans', 'Empty cans', 'can', 30),
      (kv, z_floor, 'materiel', 'Cônes / signalisation', 'Kegels / signalisatie', 'Cones / signage', 'cone', 40);

    -- Caisse kits (prefill a new caisse)
    insert into public.fleet_kits (name, name_nl, name_en, target_kind, is_default, sort)
      values ('Caisse raccords', 'Kist koppelingen', 'Fittings box', 'caisse', false, 20) returning id into kr;
    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, icon, sort) values
      (kr, 'materiel', 'Manchon intercepteur 3D Ø80', 'Opvangmof 3D Ø80', '3D interceptor sleeve Ø80', 'sleeve', 10),
      (kr, 'materiel', 'Manchon Ø100', 'Mof Ø100', 'Sleeve Ø100', 'sleeve', 20),
      (kr, 'materiel', 'Joints', 'Dichtingen', 'Seals', 'seal', 30),
      (kr, 'materiel', 'Barbelé flexible', 'Flexibele prikkeldraad', 'Flexible barbed wire', 'wire', 40);
    insert into public.fleet_kits (name, name_nl, name_en, target_kind, is_default, sort)
      values ('Caisse EPI', 'Kist PBM', 'PPE box', 'caisse', false, 30) returning id into ke;
    insert into public.fleet_kit_items (kit_id, kind, name, name_nl, name_en, icon, sort) values
      (ke, 'materiel', 'EPI', 'PBM', 'PPE', 'ppe', 10);
  else
    select id into kv from public.fleet_kits where target_kind = 'van' and is_default;
  end if;

  -- Depot + vans → root nodes (same ids as stock_locations), then default kit on each van
  for loc in
    select l.id, l.kind, l.name, v.sort from public.stock_locations l
      left join public.fleet_vans v on v.id = l.van_id
  loop
    insert into public.fleet_nodes (id, location_id, kind, name, sort)
      values (loc.id, loc.id, loc.kind, case when loc.kind = 'depot' then 'Dépôt' else loc.name end, coalesce(loc.sort, 0))
      on conflict (id) do nothing;
    if loc.kind = 'van' then
      perform public.fleet_apply_kit_internal(loc.id, kv);
    end if;
  end loop;
end $$;

comment on table public.equipment_templates is 'DEPRECATED v1.8.0 — replaced by fleet_kits / fleet_kit_items';
comment on table public.van_equipment is 'DEPRECATED v1.8.0 — replaced by fleet_nodes + fleet_tickets';
