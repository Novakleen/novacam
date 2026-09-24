const moneyFmt = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat('fr-BE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctFmt = new Intl.NumberFormat('fr-BE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return moneyFmt.format(Number(n));
}

export function formatNumber(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('fr-BE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n));
}

export function formatPct(ratio) {
  if (ratio == null || !Number.isFinite(Number(ratio))) return '—';
  return pctFmt.format(Number(ratio));
}

export function formatHours(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${numberFmt.format(Number(n))} h`;
}

export function formatKm(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${numberFmt.format(Number(n))} km`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-BE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/** Format YYYY-MM as "mai 2026" / "mei 2026" / "May 2026" for locale. */
export function formatEntryMonth(monthKey, locale = 'fr') {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(String(monthKey))) return null;
  const [y, m] = String(monthKey).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const loc = locale?.startsWith('nl') ? 'nl-BE' : locale?.startsWith('en') ? 'en-GB' : 'fr-BE';
  const month = new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(d);
  return `${month} ${y}`;
}
