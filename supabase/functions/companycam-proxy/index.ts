import { corsHeaders } from './cors.ts'
import { ALL_ROLES, OFFICE_ROLES, jsonResponse, requireCaller } from '../_shared/auth.ts'
import { classifyCompanyCamRequest, sanitizeCompanyCamParams } from '../_shared/allowlists.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await requireCaller(req, corsHeaders, ALL_ROLES)
    if (caller instanceof Response) return caller

    const { endpoint, method = 'GET', data = null, params = {} } = await req.json()
    const decision = classifyCompanyCamRequest(method, endpoint)
    if (!decision) {
      return jsonResponse(corsHeaders, { error: 'CompanyCam path or method is not allowed' }, 403)
    }
    if (decision.tier === 'office' && !OFFICE_ROLES.includes(caller.role)) {
      return jsonResponse(corsHeaders, { error: 'Forbidden' }, 403)
    }

    const query = sanitizeCompanyCamParams(params)
    if (!query) {
      return jsonResponse(corsHeaders, { error: 'CompanyCam query parameters are not allowed' }, 400)
    }

    const token = Deno.env.get('COMPANYCAM_API_TOKEN')
    if (!token) {
      console.error('[CompanyCam Proxy] Error: COMPANYCAM_API_TOKEN is missing in environment variables')
      throw new Error('COMPANYCAM_API_TOKEN is missing in environment variables. Please add it to your Supabase secrets.')
    }

    const url = new URL(`https://api.companycam.com/v2${decision.path}`)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value)
    }

    console.log(`[CompanyCam Proxy] Forwarding to: ${decision.method} ${decision.path}`)

    const options: RequestInit = {
      method: decision.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }

    if (data && ['POST', 'PUT'].includes(decision.method)) {
      options.body = JSON.stringify(data)
    }

    const response = await fetch(url.toString(), options)

    if (response.status === 204) {
      console.log('[CompanyCam Proxy] Success: 204 No Content')
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const responseText = await response.text()
    let responseData: unknown
    try {
      responseData = responseText ? JSON.parse(responseText) : {}
    } catch {
      console.warn('[CompanyCam Proxy] Failed to parse JSON response, returning raw text')
      responseData = { raw: responseText }
    }

    if (!response.ok) {
      console.error(`[CompanyCam Proxy] API Error: ${response.status} ${response.statusText}`, responseData)
      return new Response(JSON.stringify({ error: responseData, status: response.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      })
    }

    console.log(`[CompanyCam Proxy] Success: ${response.status}`)
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error(`[CompanyCam Proxy] Unexpected Error: ${message}`)
    return jsonResponse(corsHeaders, { error: message }, 500)
  }
})
