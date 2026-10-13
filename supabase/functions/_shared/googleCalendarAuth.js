/**
 * Google Calendar read for hello@novakleen.be.
 * Same OAuth secrets and token endpoint as supabase/functions/google-calendar-proxy.
 * The Calendar API cannot filter by attendee; callers match emails themselves.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
export const DEFAULT_CALENDAR_ID = 'hello@novakleen.be'

function readEnv(name, env) {
  if (typeof env === 'function') return env(name) || ''
  if (typeof Deno !== 'undefined' && typeof Deno.env?.get === 'function') return Deno.env.get(name) || ''
  if (typeof process !== 'undefined' && process.env) return process.env[name] || ''
  return ''
}

export async function listHelloCalendarEvents({
  env,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const clientId = readEnv('GOOGLE_CLIENT_ID', env)
  const clientSecret = readEnv('GOOGLE_CLIENT_SECRET', env)
  const refreshToken = readEnv('GOOGLE_REFRESH_TOKEN', env)
  const calendarId = (readEnv('GOOGLE_CALENDAR_ID', env) || DEFAULT_CALENDAR_ID).trim()
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)')
  }

  const tokenRes = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const tokenBody = await tokenRes.json()
  if (!tokenRes.ok || !tokenBody.access_token) {
    const message = tokenBody?.error_description || tokenBody?.error || 'Google token refresh failed'
    throw new Error(String(message))
  }

  const timeMin = new Date(now.getTime() - 548 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000).toISOString()
  const items = []
  let pageToken = ''
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      timeMin,
      timeMax,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
        Accept: 'application/json',
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = data?.error?.message || data?.error || `Google Calendar API returned ${response.status}`
      throw new Error(String(message))
    }
    items.push(...(data.items || []))
    pageToken = data.nextPageToken || ''
    if (!pageToken) break
  }
  return items
}
