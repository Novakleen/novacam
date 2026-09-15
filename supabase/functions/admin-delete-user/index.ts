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

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (userId === callerId) {
      return new Response(JSON.stringify({ error: 'You cannot delete your own account from here.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Clean up child rows that have NO ACTION / restrictive FKs
    await supabaseAdmin.from('bug_attachments').delete().eq('uploaded_by', userId)
    await supabaseAdmin.from('bug_comments').delete().eq('author_id', userId)
    await supabaseAdmin.from('bugs').delete().eq('reported_by', userId)
    await supabaseAdmin.from('portfolios').delete().eq('user_id', userId)
    await supabaseAdmin.from('showcases').delete().eq('created_by', userId)
    await supabaseAdmin.from('spray_entries').delete().eq('user_id', userId)
    await supabaseAdmin.from('oauth_tokens').delete().eq('user_id', userId)
    await supabaseAdmin.from('invitations').delete().eq('created_by', userId)
    await supabaseAdmin.from('upload_logs').delete().eq('user_id', userId)
    await supabaseAdmin.from('project_members').delete().eq('user_id', userId)
    await supabaseAdmin.from('time_entries').delete().eq('user_id', userId)

    // Delete the auth user (profile cascades via FK on delete cascade)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    // Safety: ensure profile row is gone
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    return new Response(JSON.stringify({ message: 'User deleted successfully' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
