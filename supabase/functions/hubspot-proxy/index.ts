import { corsHeaders } from './cors.ts'
import { ALL_ROLES, OFFICE_ROLES, jsonResponse, requireCaller } from '../_shared/auth.ts'
import {
  classifyHubSpotRequest,
  sanitizeHubSpotBatchRead,
  sanitizeHubSpotSearchBody,
} from '../_shared/allowlists.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await requireCaller(req, corsHeaders, ALL_ROLES)
    if (caller instanceof Response) return caller

    const { path, method = 'GET', body } = await req.json()
    const decision = classifyHubSpotRequest(method, path)
    if (!decision) {
      return jsonResponse(corsHeaders, { error: 'HubSpot path or method is not allowed' }, 403)
    }
    if (decision.tier === 'office' && !OFFICE_ROLES.includes(caller.role)) {
      return jsonResponse(corsHeaders, { error: 'Forbidden' }, 403)
    }

    const HUBSPOT_ACCESS_TOKEN = Deno.env.get('HUBSPOT_ACCESS_TOKEN')
    if (!HUBSPOT_ACCESS_TOKEN) {
      throw new Error('HUBSPOT_ACCESS_TOKEN is missing')
    }

    let upstreamBody: string | undefined
    if (decision.body === 'batch-read') {
      const sanitized = sanitizeHubSpotBatchRead(body)
      if (!sanitized) {
        return jsonResponse(corsHeaders, { error: 'HubSpot batch/read body is not allowed' }, 400)
      }
      upstreamBody = JSON.stringify(sanitized)
    } else if (decision.body === 'search') {
      const sanitized = sanitizeHubSpotSearchBody(body)
      if (!sanitized) {
        return jsonResponse(corsHeaders, { error: 'HubSpot search body is not allowed' }, 400)
      }
      upstreamBody = JSON.stringify(sanitized)
    }

    const url = `https://api.hubapi.com${decision.path}`
    const options: RequestInit = {
      method: decision.method,
      headers: {
        Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
    if (upstreamBody) options.body = upstreamBody

    const response = await fetch(url, options)

    if (response.status === 204) {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse(corsHeaders, { error: message }, 500)
  }
})
