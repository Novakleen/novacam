import { corsHeaders } from "./cors.ts";
import { ADMIN_ROLES, requireCaller } from "../_shared/auth.ts";

const ASSIGNABLE_ROLES = new Set(['Admin', 'Manager', 'Member', 'Viewer'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await requireCaller(req, corsHeaders, ADMIN_ROLES)
    if (caller instanceof Response) return caller
    const supabaseAdmin = caller.admin

    const { email, password, fullName, role, address } = await req.json()
    if (role !== undefined && role !== null && !ASSIGNABLE_ROLES.has(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const assignedRole = ASSIGNABLE_ROLES.has(role) ? role : 'Member'

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Create the user in Supabase Auth
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm since admin created it
      user_metadata: {
        full_name: fullName
      }
    })

    if (createError) throw createError

    // 2. Update the profile with the correct role (Profile is auto-created by trigger, but role needs setting)
    // We wait a brief moment to ensure trigger has fired, or we upsert
    // Using upsert ensures we handle the race condition if the trigger is slow/fast
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role: assignedRole, full_name: fullName, ...(address !== undefined ? { address } : {}) })
      .eq('id', userData.user.id)

    if (profileError) {
      console.error('Error updating profile role:', profileError)
      // We don't fail the whole request if just role update fails, but we should log it
    }

    return new Response(
      JSON.stringify({ user: userData.user, message: 'User created successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})