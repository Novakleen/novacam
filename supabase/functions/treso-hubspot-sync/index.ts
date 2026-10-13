import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { ADMIN_ROLES, requireCaller } from '../_shared/auth.ts'
import { listHelloCalendarEvents } from '../_shared/googleCalendarAuth.js'
import { handleTresoHubspotSync } from '../_shared/tresoHubspotSync.js'
import { supabaseTresoDb } from '../_shared/tresoImportCore.js'
import { corsHeaders } from './cors.ts'

// verify_jwt is false (supabase/config.toml): the anon key is a signed JWT
// and would pass the gateway. Callers are an Admin user JWT (requireCaller)
// or the service role key used by pg_cron. Token: HUBSPOT_ACCESS_TOKEN,
// same secret as hubspot-sync / hubspot-proxy.
// Signed jobs also read hello@novakleen.be with the same Google OAuth secrets
// as google-calendar-proxy (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN, optional GOOGLE_CALENDAR_ID).
Deno.serve((req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return handleTresoHubspotSync(req, {
    corsHeaders,
    serviceRoleKey: serviceKey,
    hubspotToken: Deno.env.get('HUBSPOT_ACCESS_TOKEN') ?? '',
    db: supabaseTresoDb(admin),
    requireCaller: (request) => requireCaller(request, corsHeaders, ADMIN_ROLES),
    listCalendarEvents: () => listHelloCalendarEvents(),
  })
})
