import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { ADMIN_ROLES, requireCaller } from '../_shared/auth.ts'
import { handleTresoImport, supabaseTresoDb } from '../_shared/tresoImportCore.js'
import { corsHeaders } from './cors.ts'

// verify_jwt is false (supabase/config.toml): callers are either an Admin
// user JWT (requireCaller) or the header x-treso-api-key. The anon key alone
// is not enough.
Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return handleTresoImport(req, {
    corsHeaders,
    db: supabaseTresoDb(admin),
    requireCaller: (request) => requireCaller(request, corsHeaders, ADMIN_ROLES),
  })
})
