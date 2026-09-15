import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from "./cors.ts";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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

    // 1. Parse Bearer token from Authorization header
    const authHeader = req.headers.get('Authorization') ?? ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    const token = match?.[1]?.trim() ?? ''
    if (!token) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401)
    }

    // 2. Validate caller with service-role client + user JWT (recommended pattern)
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token)
    if (callerError || !callerData?.user) {
      return jsonResponse({
        error: 'Unauthorized',
        details: callerError?.message ?? 'Invalid or expired token',
      }, 401)
    }

    // 3. Admin role check
    const callerId = callerData.user.id
    const { data: callerProfile, error: roleError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .maybeSingle()

    if (roleError) {
      return jsonResponse({ error: 'Failed to verify caller role', details: roleError.message }, 400)
    }
    if (!callerProfile || callerProfile.role !== 'Admin') {
      return jsonResponse({ error: 'Admin privileges required' }, 403)
    }

    const { userId, fullName, role, email, password, address } = await req.json()
    if (!userId) {
      return jsonResponse({ error: 'userId is required' }, 400)
    }

    // Load current auth user so we only update when fields meaningfully change
    const { data: existingUserData, error: existingUserError } =
      await supabaseAdmin.auth.admin.getUserById(userId)
    if (existingUserError || !existingUserData?.user) {
      return jsonResponse({
        error: 'User not found',
        details: existingUserError?.message,
      }, 404)
    }
    const existingUser = existingUserData.user

    // 4. Only call auth.admin.updateUserById for email/password/fullName when provided meaningfully + changed
    const adminUpdate: Record<string, unknown> = {}

    if (typeof email === 'string' && email.trim() && email.trim() !== (existingUser.email ?? '')) {
      adminUpdate.email = email.trim()
      adminUpdate.email_confirm = true
    }

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 6) {
        return jsonResponse({ error: 'Password must be at least 6 characters long.' }, 400)
      }
      adminUpdate.password = password
    }

    if (typeof fullName === 'string' && fullName.trim()) {
      const currentFullName = (existingUser.user_metadata?.full_name as string | undefined) ?? ''
      if (fullName.trim() !== currentFullName) {
        adminUpdate.user_metadata = {
          ...(existingUser.user_metadata ?? {}),
          full_name: fullName.trim(),
        }
      }
    }

    if (Object.keys(adminUpdate).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, adminUpdate)
      if (authError) {
        return jsonResponse({
          error: 'Failed to update auth user',
          details: authError.message,
        }, 400)
      }
    }

    // Always allow profile address update (and other profile fields)
    const profileUpdate: Record<string, unknown> = {}
    if (fullName !== undefined) profileUpdate.full_name = fullName
    if (role !== undefined) profileUpdate.role = role
    if (email !== undefined) profileUpdate.email = email
    if (address !== undefined) profileUpdate.address = address

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      // 5. Don't swallow profile errors
      if (profileError) {
        console.error('Error updating profile:', profileError)
        return jsonResponse({ error: profileError.message || 'Failed to update profile' }, 400)
      }
    }

    return jsonResponse({ message: 'User updated successfully' })
  } catch (error) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 400)
  }
})
