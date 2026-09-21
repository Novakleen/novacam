import { supabase } from '@/lib/customSupabaseClient';

export const DEFAULT_GOOGLE_CALENDAR_ID = 'hello@novakleen.be';

/**
 * Normalize a Google Calendar event into the shape we persist on projects.
 */
export const normalizeCalendarEvent = (raw, calendarId = DEFAULT_GOOGLE_CALENDAR_ID) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;

  const startRaw = raw.start?.dateTime || raw.start?.date || null;
  const endRaw = raw.end?.dateTime || raw.end?.date || null;

  const attendees = Array.isArray(raw.attendees)
    ? raw.attendees
        .map((a) => ({
          email: a?.email ? String(a.email) : null,
          displayName: a?.displayName ? String(a.displayName) : null,
          responseStatus: a?.responseStatus ? String(a.responseStatus) : null,
          self: Boolean(a?.self),
          organizer: Boolean(a?.organizer),
          resource: Boolean(a?.resource),
        }))
        .filter((a) => a.email || a.displayName)
    : [];

  // Field workers = invited people (exclude resources / calendar self when possible)
  const fieldWorkers = attendees.filter(
    (a) => !a.resource && !a.self && a.email !== calendarId
  );

  return {
    id,
    title: raw.summary ? String(raw.summary) : null,
    start: startRaw ? String(startRaw) : null,
    end: endRaw ? String(endRaw) : null,
    htmlLink: raw.htmlLink ? String(raw.htmlLink) : null,
    calendarId: calendarId || DEFAULT_GOOGLE_CALENDAR_ID,
    attendees: fieldWorkers.length ? fieldWorkers : attendees,
    status: raw.status || null,
    location: raw.location ? String(raw.location) : null,
  };
};

const invokeGoogleCalendarProxy = async (body) => {
  const { data, error } = await supabase.functions.invoke('google-calendar-proxy', {
    body,
  });

  if (error) {
    let ctx = null;
    try {
      if (error.context && typeof error.context.clone === 'function') {
        ctx = await error.context.clone().json();
      } else if (error.context && typeof error.context.json === 'function') {
        ctx = await error.context.json();
      } else if (error.context && typeof error.context === 'object') {
        ctx = error.context;
      }
    } catch {
      ctx = null;
    }
    const msg =
      ctx?.error ||
      (typeof ctx?.message === 'string' ? ctx.message : null) ||
      error.message;
    throw new Error(msg || 'Google Calendar proxy error');
  }

  if (data?.error) {
    throw new Error(
      typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
    );
  }

  return data;
};

/**
 * List upcoming events on hello@novakleen.be (or override calendarId).
 * @param {{ q?: string, maxResults?: number, calendarId?: string, timeMin?: string }} opts
 */
export async function listUpcomingGoogleCalendarEvents(opts = {}) {
  const calendarId = opts.calendarId || DEFAULT_GOOGLE_CALENDAR_ID;
  const data = await invokeGoogleCalendarProxy({
    action: 'list',
    calendarId,
    q: opts.q || undefined,
    maxResults: opts.maxResults || 25,
    timeMin: opts.timeMin || new Date().toISOString(),
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((ev) => normalizeCalendarEvent(ev, calendarId))
    .filter(Boolean);
}

/**
 * Fetch a single event by id.
 */
export async function getGoogleCalendarEvent(eventId, calendarId = DEFAULT_GOOGLE_CALENDAR_ID) {
  if (!eventId) throw new Error('eventId is required');
  const data = await invokeGoogleCalendarProxy({
    action: 'get',
    calendarId,
    eventId: String(eventId),
  });
  return normalizeCalendarEvent(data, calendarId);
}

/**
 * Format event start for display (date + time when available).
 */
export function formatGoogleCalendarStart(start, locale = 'fr-BE') {
  if (!start) return null;
  const s = String(start);
  // All-day events are YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${s}T12:00:00`));
    } catch {
      return s;
    }
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(s));
  } catch {
    return s.slice(0, 16).replace('T', ' ');
  }
}

export function formatGoogleCalendarAttendees(attendees) {
  if (!Array.isArray(attendees) || !attendees.length) return [];
  return attendees.map((a) => a.displayName || a.email).filter(Boolean);
}
