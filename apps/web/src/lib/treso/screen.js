import { openClientReceivableTotal, projectTreasury, projectWhatIf, summarizeSignedJobs } from '../../../../../supabase/functions/_shared/tresoForecast.js';

export const MOVEMENT_PREVIEW_LIMIT = 10;
export const MOVEMENT_HORIZON_DAYS = 30;

function isoDate(value) {
  if (value == null || value === '') return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayCount(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function parseAmount(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function formatEuro(value, language) {
  const amount = Number(value);
  const locale = String(language || '').startsWith('nl')
    ? 'nl-BE'
    : String(language || '').startsWith('en')
      ? 'en-GB'
      : 'fr-BE';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.round(Number.isFinite(amount) ? amount : 0));
}

export function formatSignedEuro(value, language) {
  const amount = Number(value) || 0;
  const text = formatEuro(Math.abs(amount), language);
  if (amount > 0) return `+${text}`;
  if (amount < 0) return formatEuro(amount, language);
  return text;
}

export function formatDay(iso) {
  const date = isoDate(iso);
  if (!date) return '—';
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

export function formatDayLong(iso) {
  const date = isoDate(iso);
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function autonomyTone(weeks) {
  const count = Number(weeks) || 0;
  if (count < 2) return 'red';
  if (count < 4) return 'orange';
  return 'ok';
}

export function cashAccountName(accounts) {
  const rows = (accounts || []).filter((row) => row.include_in_cash !== false && row.is_active !== false);
  const current = rows.find((row) => row.kind === 'courant') || rows[0];
  return current?.name || '';
}

export function openClientTotal(invoices, facturesMinDate) {
  return openClientReceivableTotal(invoices, facturesMinDate).total;
}

export function openSupplierTotal(bills) {
  let sum = 0;
  for (const bill of bills || []) {
    if (bill.excluded_from_cash || bill.is_paid) continue;
    const amount = Number(bill.amount_ttc);
    if (!Number.isFinite(amount) || amount === 0) continue;
    sum += Math.abs(amount);
  }
  return Math.round(sum * 100) / 100;
}

export function normalizeSeasonality(values) {
  const list = Array.isArray(values) ? values.map((value) => Number(value)) : [];
  while (list.length < 12) list.push(1);
  return list.slice(0, 12).map((value) => (Number.isFinite(value) ? value : 1));
}

export function buildMovementLists({
  result,
  commitments = [],
  invoices = [],
  supplierBills = [],
  asOf,
  days = MOVEMENT_HORIZON_DAYS,
} = {}) {
  const start = isoDate(asOf) || result?.as_of;
  const end = start ? addDays(start, days - 1) : null;
  const spreadIds = new Set(
    commitments
      .filter((row) => row.spread_weekly && row.is_active !== false && !row.excluded_from_cash)
      .map((row) => row.id),
  );
  const billsById = new Map(supplierBills.map((bill) => [bill.id, bill]));
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const commitmentsById = new Map(commitments.map((row) => [row.id, row]));
  const inWindow = (date) => Boolean(start && end && date && date >= start && date <= end);

  const spreadGroups = new Map();
  const outflows = [];
  const inflows = [];

  for (const flow of result?.flows || []) {
    if (!flow.flow_date || flow.source === 'what_if' || flow.source === 'ca_habituel') continue;
    if (!inWindow(flow.flow_date)) continue;
    if (flow.amount < 0) {
      if (flow.source === 'echeance' && spreadIds.has(flow.ref_id)) {
        const group = spreadGroups.get(flow.flow_date) || { date: flow.flow_date, amount: 0 };
        group.amount += -flow.amount;
        spreadGroups.set(flow.flow_date, group);
        continue;
      }
      const bill = billsById.get(flow.ref_id);
      const commitment = commitmentsById.get(flow.ref_id);
      const due = isoDate(bill?.due_date) || isoDate(commitment?.next_due_date);
      outflows.push({
        id: `${flow.source}:${flow.ref_id}:${flow.flow_date}:${flow.label}`,
        date: flow.flow_date,
        label: flow.label || flow.counterparty || '',
        amount: Math.round(-flow.amount * 100) / 100,
        overdue: Boolean(due && due < start),
        kind: 'line',
      });
      continue;
    }
    if (flow.amount > 0 && (flow.source === 'facture' || flow.source === 'chantier')) {
      const invoice = invoicesById.get(flow.ref_id);
      inflows.push({
        id: `${flow.source}:${flow.ref_id}:${flow.flow_date}`,
        date: flow.flow_date,
        label: invoice?.client_name || flow.label || '',
        number: invoice?.invoice_number || '',
        amount: flow.amount,
        origin: flow.source === 'chantier' ? 'chantier' : 'facture',
        overdue: Boolean(flow.overdue),
      });
    }
  }

  for (const group of spreadGroups.values()) {
    outflows.push({
      id: `spread:${group.date}`,
      date: group.date,
      labelKey: 'spreadCosts',
      amount: Math.round(group.amount * 100) / 100,
      overdue: false,
      kind: 'spread',
    });
  }

  outflows.sort((a, b) => a.date.localeCompare(b.date) || String(a.label || a.labelKey).localeCompare(String(b.label || b.labelKey)));
  inflows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.date.localeCompare(b.date) || a.label.localeCompare(b.label);
  });

  const overdueInvoices = (result?.flows || [])
    .filter((flow) => flow.source === 'facture' && flow.overdue)
    .map((flow) => {
      const invoice = invoicesById.get(flow.ref_id);
      const raw = isoDate(flow.rawDate) || flow.flow_date;
      return {
        id: String(flow.ref_id || raw),
        client: invoice?.client_name || flow.label || '',
        number: invoice?.invoice_number || '',
        amount: flow.amount,
        days: start && raw ? Math.max(0, dayCount(raw, start)) : 0,
      };
    })
    .sort((a, b) => b.days - a.days || b.amount - a.amount);

  return { outflows, inflows, overdueInvoices };
}

export function chartRows(baseWeeks, simulatedWeeks) {
  return (baseWeeks || []).map((week, index) => {
    const simulated = simulatedWeeks?.[index];
    return {
      label: formatDay(week.week_start),
      weekStart: week.week_start,
      sure: week.balance_sure,
      probable: week.balance_probable,
      inSure: week.in_sure,
      inProbable: week.in_probable,
      out: week.out_total,
      sureIf: simulated ? simulated.balance_sure : null,
      probableIf: simulated ? simulated.balance_probable : null,
    };
  });
}

function activeWhatIf(whatIf) {
  if (!whatIf) return null;
  const amount = parseAmount(whatIf.amount);
  const date = isoDate(whatIf.date);
  if (amount == null || amount === 0 || !date) return null;
  return { amount, date, label: whatIf.label || '' };
}

export function buildScreen(input = {}, whatIf = null) {
  const started = Date.now();
  const base = projectTreasury(input);
  const scenario = activeWhatIf(whatIf);
  const simulated = scenario
    ? projectWhatIf(input, scenario.amount, scenario.date, scenario.label)
    : null;
  const computeMs = Date.now() - started;
  const bills = input.supplierBills || input.supplier_bills || [];
  const clients = openClientTotal(input.invoices, input.facturesMinDate);
  const suppliers = openSupplierTotal(bills);
  const lists = buildMovementLists({
    result: base,
    commitments: input.commitments,
    invoices: input.invoices,
    supplierBills: bills,
    asOf: base.as_of,
  });
  return {
    base,
    simulated,
    computeMs,
    accountName: cashAccountName(input.accounts),
    lists,
    signedJobs: summarizeSignedJobs(input.jobs, input.settings?.ttc_ratio),
    footer: {
      clients,
      suppliers,
      net: Math.round((clients - suppliers) * 100) / 100,
    },
    effect: simulated ? {
      lowBefore: base.kpis.low_point_probable,
      lowAfter: simulated.kpis.low_point_probable,
      sureBefore: base.kpis.low_point_sure,
      sureAfter: simulated.kpis.low_point_sure,
      autonomyBefore: base.kpis.autonomy_weeks,
      autonomyAfter: simulated.kpis.autonomy_weeks,
    } : null,
    alert: (simulated || base).kpis,
  };
}
