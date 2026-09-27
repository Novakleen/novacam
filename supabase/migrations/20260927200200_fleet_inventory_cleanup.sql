-- v1.8.0: the daily checklist is gone; its resync RPC is no longer callable from the app.
revoke all on function public.fleet_resync_van_equipment(uuid) from public, anon, authenticated;
comment on function public.fleet_resync_van_equipment(uuid) is 'DEPRECATED v1.8.0 — checklist replaced by fleet_nodes/fleet_tickets; use fleet_apply_kit';
