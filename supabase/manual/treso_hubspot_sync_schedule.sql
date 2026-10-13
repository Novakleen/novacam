-- NOT a migration. Do not apply this file automatically.
-- Schedule for treso-hubspot-sync: every hour from 07:00 to 20:00 Europe/Brussels.
-- Not enabled. Run by hand after the function is deployed and the v1.19.0
-- migration (hubspot_invoices_synced_through) is applied.
--
-- October 2026 is CEST (UTC+2), so 07:00–20:00 Brussels = 05:00–18:00 UTC:
--   minute 0 of hours 5 through 18 UTC.
-- In winter (CET, UTC+1) the same UTC cron runs at 06:00–19:00 Brussels.
-- Switch the expression to '0 6-19 * * *' for the winter window, or leave
-- the CEST expression if a one-hour shift is acceptable.
--
-- Replace <SERVICE_ROLE_KEY> when running. Do not commit the real key.
-- Requires pg_cron and pg_net on the project.

select cron.schedule(
  'treso-hubspot-sync',
  '0 5-18 * * *',
  $$
  select net.http_post(
    url := 'https://ghgfeiwbjjfxozqyjyfb.supabase.co/functions/v1/treso-hubspot-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To disable later:
-- select cron.unschedule('treso-hubspot-sync');
