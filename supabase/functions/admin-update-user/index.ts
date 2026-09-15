import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authHeader } } }
    )
    const { data: callerData, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const callerId = callerData.user.id
    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', callerId).maybeSingle()
    if (!callerProfile || callerProfile.role !== 'Admin') {
      return new Response(JSON.stringify({ error: 'Admin privileges required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { userId, fullName, role, email, password, address } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Update auth user (email + password) if provided
    const adminUpdate: Record<string, unknown> = {}
    if (email) adminUpdate.email = email
    if (password) {
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: 'Password must be at least 6 characters long.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      adminUpdate.password = password
    }
    if (fullName) adminUpdate.user_metadata = { full_name: fullName }

    if (Object.keys(adminUpdate).length > 0) {
      adminUpdate.email_confirm = true
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, adminUpdate)
      if (authError) throw authError
    }

    // 2. Update profile row
    const profileUpdate: Record<string, unknown> = {}
    if (fullName !== undefined) profileUpdate.full_name = fullName
    if (role !== undefined) profileUpdate.role = role
    if (email !== undefined) profileUpdate.email = email
    if (address !== undefined) profileUpdate.address = address
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', userId)
      if (profileError) {
        console.error('Error updating profile:', profileError)
      }
    }

    return new Response(JSON.stringify({ message: 'User updated successfully' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
