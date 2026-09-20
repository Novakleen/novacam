/** Parse "HH:MM" or "HH:MM:SS" to minutes from midnight */
export function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

/** Minutes worked = end - start - break (handles overnight) */
export function computeWorkedMinutes(startTime, endTime, breakMinutes = 0) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  const breakMin = Math.max(0, Number(breakMinutes) || 0);
  return Math.max(0, diff - breakMin);
}

export function minutesToHoursDecimal(minutes) {
  if (minutes == null) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatHoursDecimal(hours) {
  if (hours == null || Number.isNaN(hours)) return '—';
  return Number(hours).toFixed(2);
}

/** Standard day = 8h; overtime = max(0, worked - 8) */
export function computeOvertimeHours(workedMinutes, standardMinutes = 8 * 60) {
  if (workedMinutes == null) return null;
  return minutesToHoursDecimal(Math.max(0, workedMinutes - standardMinutes));
}

export function formatDurationHM(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeDisplay(timeStr) {
  if (!timeStr) return '—';
  const parts = String(timeStr).split(':');
  return `${parts[0]}:${parts[1]}`;
}

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayLabel(dateStr, locale = 'fr') {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const names = locale === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  return names[d.getDay()];
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('-');
  if (!d) return dateStr;
  return `${d}/${m}/${y}`;
}

export function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function enrichEntry(entry) {
  const workedMin = computeWorkedMinutes(entry.start_time, entry.end_time, entry.break_minutes);
  const hours = minutesToHoursDecimal(workedMin);
  const overtime = computeOvertimeHours(workedMin);
  return {
    ...entry,
    _workedMinutes: workedMin,
    _hoursWorked: hours,
    _overtime: overtime,
  };
}

export function sumHours(entries) {
  return entries.reduce((acc, e) => {
    const enriched = e._hoursWorked != null ? e : enrichEntry(e);
    return acc + (enriched._hoursWorked || 0);
  }, 0);
}

/** Sum quantity_done per hubspot_line_item_id (optionally exclude one entry when editing). */
export function sumQuantityDoneByLineItem(entries = [], excludeEntryId = null) {
  const map = {};
  for (const e of entries || []) {
    if (!e?.hubspot_line_item_id) continue;
    if (excludeEntryId && e.id === excludeEntryId) continue;
    const q = Number(e.quantity_done);
    if (!Number.isFinite(q) || q === 0) continue;
    const key = String(e.hubspot_line_item_id);
    map[key] = (map[key] || 0) + q;
  }
  return map;
}

/**
 * Enrich devis line items with fait / reste from logged time entries.
 * remaining = max(0, planned − done).
 */
export function buildQuoteLineItemProgress(lineItems = [], entries = [], excludeEntryId = null) {
  const doneById = sumQuantityDoneByLineItem(entries, excludeEntryId);
  return (Array.isArray(lineItems) ? lineItems : []).map((li) => {
    const id = li?.id != null ? String(li.id) : null;
    const planned =
      li?.quantity != null && Number.isFinite(Number(li.quantity))
        ? Number(li.quantity)
        : 0;
    const done = id ? doneById[id] || 0 : 0;
    const remaining = Math.max(0, Math.round((planned - done) * 1000) / 1000);
    return {
      ...li,
      id,
      planned,
      done,
      remaining,
    };
  });
}

/** Join selected devis postes into a compact task_label (first name, or first + « +N »). */
export function formatQuoteLineItemTaskLabel(items = []) {
  const names = (Array.isArray(items) ? items : [])
    .map((x) => (x?.name || x?.task_label || '').trim())
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

/** Sensible default for quantity_done when picking a poste: remaining (editable). */
export function defaultQuantityDoneForLineItem(progressItem) {
  if (!progressItem) return '';
  const rem = Number(progressItem.remaining);
  if (Number.isFinite(rem) && rem > 0) return rem;
  const planned = Number(progressItem.planned ?? progressItem.quantity);
  if (Number.isFinite(planned) && planned > 0) return planned;
  return 1;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isNovacamProjectUuid(value) {
  return Boolean(value) && UUID_RE.test(String(value));
}

/** Prefer the row that actually holds a devis snapshot (line items > quote id > first). */
export function pickPreferredQuoteProject(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (list.length === 0) return null;
  const withLines = list.find(
    (p) => Array.isArray(p.hubspot_quote_line_items) && p.hubspot_quote_line_items.length > 0
  );
  if (withLines) return withLines;
  const withQuoteId = list.find((p) => p.hubspot_quote_id);
  if (withQuoteId) return withQuoteId;
  return list[0];
}

const QUOTE_SNAPSHOT_COLS =
  'id, name, companycam_project_id, hubspot_contact_id, hubspot_quote_id, hubspot_quote_title, hubspot_quote_line_items';

function emptyQuoteSnapshot() {
  return {
    id: null,
    name: null,
    companycam_project_id: null,
    hubspot_contact_id: null,
    hubspot_quote_id: null,
    hubspot_quote_title: null,
    hubspot_quote_line_items: [],
  };
}

function normalizeQuoteSnapshot(row) {
  if (!row) return emptyQuoteSnapshot();
  return {
    id: row.id || null,
    name: row.name || null,
    companycam_project_id: row.companycam_project_id
      ? String(row.companycam_project_id)
      : null,
    hubspot_contact_id: row.hubspot_contact_id ? String(row.hubspot_contact_id) : null,
    hubspot_quote_id: row.hubspot_quote_id || null,
    hubspot_quote_title: row.hubspot_quote_title || null,
    hubspot_quote_line_items: Array.isArray(row.hubspot_quote_line_items)
      ? row.hubspot_quote_line_items
      : [],
  };
}

function rowHasQuoteSnapshot(row) {
  if (!row) return false;
  if (row.hubspot_quote_id) return true;
  return Array.isArray(row.hubspot_quote_line_items) && row.hubspot_quote_line_items.length > 0;
}

/**
 * Resolve the Novacam `projects` row that holds hubspot_quote_* for a time-entry
 * client / chantier selection.
 *
 * Looks up by Novacam UUID, companycam_project_id, and/or hubspot_contact_id.
 * When several rows match (CC stub vs HubSpot shadow), prefer the one with a
 * devis snapshot; if a CC id is known, prefer matching that CC project.
 */
export async function fetchProjectQuoteSnapshot(
  supabase,
  { projectId = null, companycamProjectId = null, hubspotContactId = null } = {}
) {
  const empty = emptyQuoteSnapshot();
  const pid = projectId ? String(projectId) : '';
  const ccId = companycamProjectId ? String(companycamProjectId) : '';
  const hsId = hubspotContactId ? String(hubspotContactId) : '';
  if (!pid && !ccId && !hsId) return { data: empty, error: null };

  const candidates = [];
  const seen = new Set();
  const pushAll = (rows) => {
    for (const row of rows || []) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      candidates.push(row);
    }
  };

  if (isNovacamProjectUuid(pid)) {
    const { data, error } = await supabase
      .from('projects')
      .select(QUOTE_SNAPSHOT_COLS)
      .eq('id', pid)
      .maybeSingle();
    if (error) return { data: empty, error };
    if (data) pushAll([data]);
  }

  if (ccId) {
    const { data, error } = await supabase
      .from('projects')
      .select(QUOTE_SNAPSHOT_COLS)
      .eq('companycam_project_id', ccId)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (error) return { data: empty, error };
    pushAll(data);
  }

  if (hsId && !candidates.some(rowHasQuoteSnapshot)) {
    const { data, error } = await supabase
      .from('projects')
      .select(QUOTE_SNAPSHOT_COLS)
      .eq('hubspot_contact_id', hsId)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (error) return { data: empty, error };
    pushAll(data);
  }

  let pool = candidates;
  if (ccId) {
    const matchingCc = candidates.filter(
      (p) => String(p.companycam_project_id || '') === ccId
    );
    if (matchingCc.length) pool = matchingCc;
  }

  const preferred = pickPreferredQuoteProject(pool);
  return { data: normalizeQuoteSnapshot(preferred), error: null };
}
