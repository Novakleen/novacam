import { corsHeaders } from './cors.ts';

const DEFAULT_CALENDAR_ID = 'hello@novakleen.be';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

type ProxyBody = {
  action?: 'list' | 'get';
  calendarId?: string;
  eventId?: string;
  q?: string;
  timeMin?: string;
  /** Upper bound for event start (ISO). Default: ~90 days from now. */
  timeMax?: string;
  maxResults?: number;
  /**
   * Client email to match against attendees/organizer.
   * Documented for callers — Google Calendar events.list does not filter by
   * attendee natively; the proxy does not apply this server-side. Prefer
   * client-side filtering after list (see googleCalendarService).
   */
  attendeeEmail?: string;
  /** Optional raw Calendar API path override (must start with /calendars/). */
  path?: string;
  method?: string;
};

async function refreshAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google OAuth secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)'
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    const msg =
      data?.error_description ||
      data?.error ||
      `Google token refresh failed (${res.status})`;
    throw new Error(String(msg));
  }
  return String(data.access_token);
}

function encodeCalendarId(calendarId: string): string {
  return encodeURIComponent(calendarId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: ProxyBody = await req.json().catch(() => ({}));
    const calendarId =
      (payload.calendarId && String(payload.calendarId).trim()) ||
      Deno.env.get('GOOGLE_CALENDAR_ID') ||
      DEFAULT_CALENDAR_ID;

    const accessToken = await refreshAccessToken();

    let url: string;
    const method = (payload.method || 'GET').toUpperCase();

    if (payload.path && String(payload.path).startsWith('/calendars/')) {
      url = `${CALENDAR_API}${payload.path}`;
    } else {
      const action = payload.action || (payload.eventId ? 'get' : 'list');
      const calEnc = encodeCalendarId(calendarId);

      if (action === 'get') {
        if (!payload.eventId) {
          throw new Error('eventId is required for get');
        }
        url = `${CALENDAR_API}/calendars/${calEnc}/events/${encodeURIComponent(
          String(payload.eventId)
        )}`;
      } else {
        const defaultTimeMax = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString();
        const params = new URLSearchParams({
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: String(
            Math.min(Math.max(Number(payload.maxResults) || 50, 1), 50)
          ),
          timeMin: payload.timeMin || new Date().toISOString(),
          timeMax: payload.timeMax || defaultTimeMax,
        });
        if (payload.q && String(payload.q).trim()) {
          params.set('q', String(payload.q).trim());
        }
        // attendeeEmail is accepted for documentation / forward-compat only;
        // Calendar API cannot filter list by attendee — callers filter client-side.
        url = `${CALENDAR_API}/calendars/${calEnc}/events?${params}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 204) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const data = await response.json().catch(() => ({
      error: `Google Calendar API returned ${response.status}`,
    }));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
