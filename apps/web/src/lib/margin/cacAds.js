import { roundMoney, toNumberOrNull } from './constants';

/**
 * CAC ads = ad spend of entry-month M / unique closed-won clients who entered in M.
 * Entry date: HubSpot contact createdate (hs_lifecyclestage_lead_date not on portal).
 * Fallback: deal createdate → project created_at / google_calendar_start.
 */

export const CAC_ENTRY_DATE_SOURCE = 'contact.createdate';

export function monthKeyFromDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value).slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : null;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthDateFromKey(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return null;
  return `${key}-01`;
}

/** Sum spend rows for a YYYY-MM key (all platforms). */
export function spendForMonth(spendRows, monthKey) {
  let total = 0;
  let any = false;
  for (const row of spendRows || []) {
    const key = monthKeyFromDate(row.month || row.period_start);
    if (key !== monthKey) continue;
    const n = Number(row.spend);
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  }
  return any ? roundMoney(total) : null;
}

/**
 * Resolve CAC € for a chantier from cached monthly rows.
 * @returns {{ amount: number|null, status: string, monthKey: string|null, source: string|null }}
 */
export function resolveCacAdsAmount({ monthKey, cacheRows, spendRows } = {}) {
  if (!monthKey) {
    return { amount: null, status: 'no_entry_date', monthKey: null, source: null };
  }
  const cache = (cacheRows || []).find((r) => monthKeyFromDate(r.month) === monthKey);
  if (cache) {
    const clients = Number(cache.clients_won);
    const spend =
      cache.spend_total != null
        ? toNumberOrNull(cache.spend_total)
        : spendForMonth(spendRows, monthKey);
    if (spend == null) {
      return { amount: null, status: 'no_spend', monthKey, source: cache.entry_date_source || null };
    }
    if (!Number.isFinite(clients) || clients <= 0) {
      return { amount: null, status: 'zero_clients', monthKey, source: cache.entry_date_source || null };
    }
    const amount =
      cache.cac_per_client != null
        ? roundMoney(Number(cache.cac_per_client))
        : roundMoney(spend / clients);
    return {
      amount,
      status: 'ok',
      monthKey,
      source: cache.entry_date_source || CAC_ENTRY_DATE_SOURCE,
      clientsWon: clients,
      spend,
    };
  }

  const spend = spendForMonth(spendRows, monthKey);
  if (spend == null) {
    return { amount: null, status: 'no_spend', monthKey, source: null };
  }
  return { amount: null, status: 'clients_unknown', monthKey, source: null, spend };
}

/**
 * Pick entry date for a project / linked HubSpot entities.
 * Prefer contact createdate; else deal createdate; else project created_at / calendar start.
 */
export function resolveProjectEntryDate({
  contactCreatedate = null,
  dealCreatedate = null,
  projectCreatedAt = null,
  googleCalendarStart = null,
} = {}) {
  if (contactCreatedate) {
    return { date: contactCreatedate, source: 'contact.createdate' };
  }
  if (dealCreatedate) {
    return { date: dealCreatedate, source: 'deal.createdate' };
  }
  if (projectCreatedAt) {
    return { date: projectCreatedAt, source: 'project.created_at' };
  }
  if (googleCalendarStart) {
    return { date: googleCalendarStart, source: 'google_calendar_start' };
  }
  return { date: null, source: null };
}

/** Parse Meta-style CSV (period_start, spend, platform, …). */
export function parseAdSpendCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxStart = header.indexOf('period_start');
  const idxSpend = header.indexOf('spend');
  const idxPlatform = header.indexOf('platform');
  const idxCurrency = header.indexOf('currency');
  const idxEnd = header.indexOf('period_end');
  if (idxStart < 0 || idxSpend < 0) {
    throw new Error('CSV must include period_start and spend columns');
  }
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const periodStart = (cols[idxStart] || '').trim();
    const spend = Number(String(cols[idxSpend] || '').replace(',', '.'));
    if (!periodStart || !Number.isFinite(spend)) continue;
    const monthKey = monthKeyFromDate(periodStart);
    if (!monthKey) continue;
    rows.push({
      month: monthDateFromKey(monthKey),
      platform: (idxPlatform >= 0 ? cols[idxPlatform] : 'Meta') || 'Meta',
      spend,
      currency: (idxCurrency >= 0 ? cols[idxCurrency] : 'EUR') || 'EUR',
      period_start: periodStart || null,
      period_end: idxEnd >= 0 ? cols[idxEnd] || null : null,
    });
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
