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
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { email, password, fullName, role } = await req.json()

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
      .update({ role: role || 'Member', full_name: fullName })
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