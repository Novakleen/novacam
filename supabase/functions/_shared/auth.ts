import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

/** profiles.role values used by the web app. */
export const APP_ROLES = ['Admin', 'Manager', 'Member', 'Viewer'] as const
export type AppRole = (typeof APP_ROLES)[number]

export const ALL_ROLES: readonly AppRole[] = APP_ROLES
/** Margins, HubSpot linking, calendar, Direct7, CompanyCam explorer writes. */
export const OFFICE_ROLES: readonly AppRole[] = ['Admin', 'Manager']
export const ADMIN_ROLES: readonly AppRole[] = ['Admin']

export type Caller = {
  userId: string
  role: AppRole
  token: string
  admin: SupabaseClient
}

export function jsonResponse(
  corsHeaders: Record<string, string>,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Require a real user access token and a profiles.role in `allowedRoles`.
 * The gateway `verify_jwt` check is not enough: the public anon key is a
 * signed JWT and passes it. `auth.getUser(token)` rejects that key.
 *
 * Call this only after the OPTIONS preflight has been answered.
 */
export async function requireCaller(
  req: Request,
  corsHeaders: Record<string, string>,
  allowedRoles: readonly AppRole[],
): Promise<Caller | Response> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(\S+)$/i)
  const token = match?.[1]?.trim() ?? ''
  if (!token) {
    return jsonResponse(corsHeaders, { error: 'Missing or invalid Authorization header' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) {
    return jsonResponse(corsHeaders, { error: 'Server auth configuration is missing' }, 500)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user?.id) {
    return jsonResponse(corsHeaders, { error: 'Unauthorized' }, 401)
  }

  const { data: profile, error: roleError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  if (roleError) {
    return jsonResponse(corsHeaders, { error: 'Failed to verify caller role' }, 400)
  }

  const role = profile?.role
  if (typeof role !== 'string' || !allowedRoles.includes(role as AppRole)) {
    return jsonResponse(corsHeaders, { error: 'Forbidden' }, 403)
  }

  return { userId: data.user.id, role: role as AppRole, token, admin }
}

/** CompanyCam / HubSpot record ids interpolated into upstream URLs. */
export function safeExternalId(value: unknown, max = 64): string | null {
  const id = String(value ?? '').trim()
  if (!id || id.length > max) return null
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null
  return id
}

/** HubSpot CRM object ids are numeric. */
export function safeHubSpotId(value: unknown): string | null {
  const id = String(value ?? '').trim()
  if (!/^[0-9]{1,20}$/.test(id)) return null
  return id
}
