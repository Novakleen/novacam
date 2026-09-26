-- v1.7.0 fleet: tighten EXECUTE grants (Supabase security advisors 0028/0029)
-- trigger functions: never callable via RPC (triggers fire regardless of EXECUTE)
revoke all on function public.fleet_spray_sync() from public, anon, authenticated;
revoke all on function public.fleet_van_after_write() from public, anon, authenticated;
revoke all on function public.stock_moves_after_write() from public, anon, authenticated;
revoke all on function public.stock_moves_before_insert() from public, anon, authenticated;
revoke all on function public.fleet_resolve_location(uuid, date) from public, anon, authenticated;
-- signed-in only (RLS helpers + RPCs)
revoke all on function public.fleet_is_admin() from public, anon;
revoke all on function public.fleet_my_van_ids() from public, anon;
revoke all on function public.fleet_my_location_ids() from public, anon;
revoke all on function public.fleet_depot_location_id() from public, anon;
revoke all on function public.fleet_reassign_van(uuid, uuid, date) from public, anon;
revoke all on function public.fleet_resync_van_equipment(uuid) from public, anon;
grant execute on function public.fleet_is_admin(), public.fleet_my_van_ids(), public.fleet_my_location_ids(),
  public.fleet_depot_location_id(), public.fleet_reassign_van(uuid, uuid, date),
  public.fleet_resync_van_equipment(uuid) to authenticated;
