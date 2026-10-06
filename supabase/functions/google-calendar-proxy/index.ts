import { corsHeaders } from './cors.ts'
import { OFFICE_ROLES, jsonResponse, requireCaller } from '../_shared/auth.ts'

const DEFAULT_CALENDAR_ID = 'hello@novakleen.be'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

type ProxyBody = {
  action?: 'list' | 'get'
  calendarId?: string
  eventId?: string
  q?: string
  timeMin?: string
  timeMax?: string
  maxResults?: number
  attendeeEmail?: string
  path?: string
  method?: string
}

async function refreshAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google OAuth secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)',
    )
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    const msg =
      data?.error_description ||
      data?.error ||
      `Google token refresh failed (${res.status})`
    throw new Error(String(msg))
  }
  return String(data.access_token)
}

function configuredCalendarId(): string {
  return (Deno.env.get('GOOGLE_CALENDAR_ID') || DEFAULT_CALENDAR_ID).trim()
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await requireCaller(req, corsHeaders, OFFICE_ROLES)
    if (caller instanceof Response) return caller

    const payload: ProxyBody = await req.json().catch(() => ({}))

    // The app only lists and gets events. Raw Calendar paths and other methods
    // used to let a caller delete or read any calendar the refresh token can see.
    if (payload.path) {
      return jsonResponse(corsHeaders, { error: 'Raw calendar paths are not allowed' }, 403)
    }
    const requestedMethod = (payload.method || 'GET').toUpperCase()
    if (requestedMethod !== 'GET') {
      return jsonResponse(corsHeaders, { error: 'Only GET is allowed' }, 403)
    }

    const calendarId = configuredCalendarId()
    const requestedCalendar = payload.calendarId ? String(payload.calendarId).trim() : ''
    if (requestedCalendar && requestedCalendar.toLowerCase() !== calendarId.toLowerCase()) {
      return jsonResponse(corsHeaders, { error: 'Calendar is not allowed' }, 403)
    }

    const action = payload.action || (payload.eventId ? 'get' : 'list')
    if (action !== 'list' && action !== 'get') {
      return jsonResponse(corsHeaders, { error: 'Calendar action is not allowed' }, 403)
    }

    const accessToken = await refreshAccessToken()
    const calEnc = encodeURIComponent(calendarId)
    let url: string

    if (action === 'get') {
      const eventId = String(payload.eventId || '').trim()
      if (!/^[A-Za-z0-9_-]{1,1024}$/.test(eventId)) {
        return jsonResponse(corsHeaders, { error: 'eventId is required' }, 400)
      }
      url = `${CALENDAR_API}/calendars/${calEnc}/events/${encodeURIComponent(eventId)}`
    } else {
      const defaultTimeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      const timeMin = payload.timeMin && isIsoDate(payload.timeMin)
        ? payload.timeMin
        : new Date().toISOString()
      const timeMax = payload.timeMax && isIsoDate(payload.timeMax)
        ? payload.timeMax
        : defaultTimeMax
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: String(Math.min(Math.max(Number(payload.maxResults) || 50, 1), 50)),
        timeMin,
        timeMax,
      })
      const q = payload.q ? String(payload.q).trim() : ''
      if (q) {
        if (q.length > 200) {
          return jsonResponse(corsHeaders, { error: 'Search query is too long' }, 400)
        }
        params.set('q', q)
      }
      url = `${CALENDAR_API}/calendars/${calEnc}/events?${params}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (response.status === 204) {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const data = await response.json().catch(() => ({
      error: `Google Calendar API returned ${response.status}`,
    }))

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(corsHeaders, { error: message }, 500)
  }
})
