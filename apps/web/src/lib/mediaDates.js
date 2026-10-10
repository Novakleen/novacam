/** Capture-day grouping. Falls back to created_at when EXIF time is missing. */

export function mediaCaptureTime(item) {
  return item?.captured_at || item?.created_at || null;
}

export function captureDayKey(item) {
  const ts = mediaCaptureTime(item);
  if (!ts) return 'unknown';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function groupMediaByCaptureDay(items) {
  const groups = new Map();
  for (const item of items || []) {
    const key = captureDayKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort((a, b) => {
    if (a[0] === 'unknown') return 1;
    if (b[0] === 'unknown') return -1;
    return b[0].localeCompare(a[0]);
  });
}

function intlLocale(language) {
  const code = String(language || 'fr').slice(0, 2).toLowerCase();
  if (code === 'nl') return 'nl';
  if (code === 'en') return 'en';
  return 'fr';
}

export function formatCaptureDay(key, language) {
  if (!key || key === 'unknown') return '';
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatCaptureDateTime(item, language) {
  const ts = mediaCaptureTime(item);
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** One-line short form, e.g. "9 oct. 2026, 08:12". */
export function formatCaptureDateTimeShort(item, language) {
  const ts = mediaCaptureTime(item);
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const locale = intlLocale(language);
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${day}, ${time}`;
}

export function formatCaptureClock(item, language) {
  const ts = mediaCaptureTime(item);
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
