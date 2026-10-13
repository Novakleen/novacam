/**
 * Minimal cash view for /tresorerie (v1.24).
 * History is actual bank movements. The 12-week line is only:
 * current balance + open client invoices + dated signed jobs
 * − open supplier bills − fixed recurring commitments.
 * No seasonality, no usual revenue, no variable spread.
 */

import {
  clientInvoiceRemaining,
  isClientInvoiceOpen,
  normalizeName,
  todayInBrussels,
} from '../../../../../supabase/functions/_shared/tresoForecast.js';

export const HISTORY_WEEKS = 26;
export const PROJECTION_WEEKS = 12;
export const AGING_LIST_LIMIT = 6;

const FREQUENCY_DAYS = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

const CATEGORY_ICON = {
  carburant: 'fuel',
  assurance: 'insurance',
  leasing: 'leasing',
  salaires: 'salary',
  secretariat_social: 'salary',
  loyer: 'rent',
  tva_impots: 'tax',
  honoraires: 'fees',
  abonnement: 'software',
  pret: 'loan',
  publicite: 'ads',
  matieres: 'materials',
  sous_traitance: 'subcontract',
  frais_bancaires: 'bank',
  autre: 'other',
};

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function isoDate(value) {
  if (value == null || value === '') return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function formatIso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function dayCount(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function addMonths(iso, months, dayOfMonth) {
  const year0 = Number(iso.slice(0, 4));
  const month0 = Number(iso.slice(5, 7));
  const index = (month0 - 1) + months;
  const year = year0 + Math.floor(index / 12);
  const monthIndex = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const preferred = dayOfMonth || Number(iso.slice(8, 10));
  return formatIso(year, monthIndex + 1, Math.min(preferred, last));
}

function endOfMonth(iso) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatIso(year, month, last);
}

function mondayOf(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(iso, delta);
}

function cashAccounts(accounts) {
  return (accounts || []).filter((row) => row.include_in_cash !== false && row.is_active !== false);
}

function latestSnapshot(snapshots, accountId, asOf) {
  const rows = (snapshots || []).filter((row) => row.account_id === accountId && isoDate(row.balance_date) && isoDate(row.balance_date) <= asOf);
  rows.sort((a, b) => {
    if (a.balance_date !== b.balance_date) return a.balance_date < b.balance_date ? 1 : -1;
    const left = a.created_at || '';
    const right = b.created_at || '';
    if (left !== right) return left < right ? 1 : -1;
    if (a.source === 'import' && b.source !== 'import') return -1;
    if (b.source === 'import' && a.source !== 'import') return 1;
    return 0;
  });
  return rows[0] || null;
}

function eligibleTransactions(input, accountIds) {
  const rows = [];
  for (const tx of input.transactions || []) {
    if (!tx || tx.excluded_from_cash || tx.is_internal_transfer) continue;
    const date = isoDate(tx.booking_date);
    const amount = Number(tx.amount);
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    if (accountIds.size && tx.account_id && !accountIds.has(tx.account_id)) continue;
    rows.push({
      id: tx.id,
      accountId: tx.account_id || null,
      date,
      amount,
      name: tx.counterparty_name || '',
      commitmentId: tx.commitment_id || null,
    });
  }
  return rows;
}

function balanceAt(snapshot, txs, end, asOf) {
  const until = end > asOf ? asOf : end;
  if (!snapshot) {
    let total = 0;
    for (const tx of txs) {
      if (tx.date <= until) total += tx.amount;
    }
    return round2(total);
  }
  const snapDate = isoDate(snapshot.balance_date);
  const snap = round2(snapshot.balance);
  if (until < snapDate) {
    let delta = 0;
    for (const tx of txs) {
      if (tx.date > until && tx.date <= snapDate) delta += tx.amount;
    }
    return round2(snap - delta);
  }
  let delta = 0;
  for (const tx of txs) {
    if (tx.date > snapDate && tx.date <= until) delta += tx.amount;
  }
  return round2(snap + delta);
}

function currentCash(input, asOf, accounts, txs) {
  let amount = 0;
  let date = null;
  let any = false;
  for (const account of accounts) {
    const snap = latestSnapshot(input.snapshots, account.id, asOf);
    const own = txs.filter((tx) => !tx.accountId || tx.accountId === account.id);
    if (!snap && !own.length) continue;
    any = true;
    amount += balanceAt(snap, own, asOf, asOf);
    const snapDate = isoDate(snap?.balance_date);
    let known = snapDate;
    for (const tx of own) {
      if (snapDate && tx.date <= snapDate) continue;
      if (tx.date <= asOf && (!known || tx.date > known)) known = tx.date;
    }
    if (known && (!date || known > date)) date = known;
  }
  if (!any && !accounts.length) {
    amount = balanceAt(null, txs, asOf, asOf);
    for (const tx of txs) {
      if (tx.date <= asOf && (!date || tx.date > date)) date = tx.date;
    }
  }
  const courant = accounts.find((row) => row.kind === 'courant') || accounts[0];
  return {
    amount: round2(amount),
    date,
    accountName: courant?.name || '',
  };
}

function weekBuckets(asOf) {
  const endMonday = mondayOf(asOf);
  const startMonday = addDays(endMonday, -(HISTORY_WEEKS - 1) * 7);
  const buckets = [];
  for (let i = 0; i < HISTORY_WEEKS; i += 1) {
    const start = addDays(startMonday, i * 7);
    buckets.push({
      key: start,
      start,
      end: addDays(start, 6),
    });
  }
  return buckets;
}

function monthBuckets(asOf, weeks) {
  const first = `${weeks[0].start.slice(0, 7)}-01`;
  const last = `${asOf.slice(0, 7)}-01`;
  const buckets = [];
  let cursor = first;
  while (cursor <= last && buckets.length < 18) {
    buckets.push({
      key: cursor.slice(0, 7),
      start: cursor,
      end: endOfMonth(cursor),
      month: Number(cursor.slice(5, 7)),
      year: Number(cursor.slice(0, 4)),
    });
    cursor = addMonths(cursor, 1, 1);
  }
  return buckets;
}

function fillHistory(buckets, accounts, snapshots, txs, asOf) {
  return buckets.map((bucket) => {
    let cashIn = 0;
    let cashOut = 0;
    const end = bucket.end > asOf ? asOf : bucket.end;
    for (const tx of txs) {
      if (tx.date < bucket.start || tx.date > end) continue;
      if (tx.amount > 0) cashIn += tx.amount;
      else cashOut += -tx.amount;
    }
    let balance = 0;
    if (accounts.length) {
      for (const account of accounts) {
        const snap = latestSnapshot(snapshots, account.id, asOf);
        const own = txs.filter((tx) => !tx.accountId || tx.accountId === account.id);
        if (!snap && !own.length) continue;
        balance += balanceAt(snap, own, bucket.end, asOf);
      }
    } else {
      balance = balanceAt(null, txs, bucket.end, asOf);
    }
    return {
      ...bucket,
      cashIn: round2(cashIn),
      cashOut: round2(cashOut),
      balance: round2(balance),
    };
  });
}

function isFixedRecurring(row) {
  if (!row || row.excluded_from_cash) return false;
  if (row.spread_weekly) return false;
  if (row.kind === 'variable') return false;
  if (row.amount_rule === 'danny' || row.amount_rule === 'precompte') return false;
  return true;
}

function frequencyOf(row) {
  if (row.frequency === 'weekly' || row.frequency === 'quarterly' || row.frequency === 'yearly') return row.frequency;
  return 'monthly';
}

function frequencyWindowDays(frequency) {
  return Math.round((FREQUENCY_DAYS[frequency] || 30) * 1.5);
}

function stepDate(commitment, iso) {
  const frequency = frequencyOf(commitment);
  const day = commitment.day_of_month ? Number(commitment.day_of_month) : null;
  if (frequency === 'weekly') return addDays(iso, 7);
  if (frequency === 'quarterly') return addMonths(iso, 3, day);
  if (frequency === 'yearly') return addMonths(iso, 12, day);
  return addMonths(iso, 1, day);
}

export function recurringIconKey(commitment) {
  const category = commitment?.category || 'autre';
  if (category === 'abonnement') {
    const text = normalizeName(`${commitment.label || ''} ${commitment.counterparty || ''}`);
    if (/(telecom|telefoon|proximus|mobile|scarlet|orange|telenet)/.test(text)) return 'telecom';
    return 'software';
  }
  return CATEGORY_ICON[category] || 'other';
}

function namesClose(left, right) {
  const hay = normalizeName(left);
  const needle = normalizeName(right);
  if (!hay || !needle || needle.length < 4 || hay.length < 4) return false;
  return hay === needle || hay.includes(needle) || needle.includes(hay);
}

function seenInBank(commitment, txs, asOf) {
  const cutoff = addDays(asOf, -frequencyWindowDays(frequencyOf(commitment)));
  const label = commitment.counterparty || commitment.label || '';
  let latest = null;
  for (const tx of txs) {
    if (tx.date > asOf) continue;
    const linked = commitment.id && tx.commitmentId && String(tx.commitmentId) === String(commitment.id);
    if (!linked && !namesClose(tx.name, label)) continue;
    if (!latest || tx.date > latest) latest = tx.date;
  }
  if (!latest) return null;
  return latest >= cutoff;
}

export function recurringIsActive(commitment, txs, asOf) {
  if (commitment.is_active === false) return false;
  const seen = seenInBank(commitment, txs, asOf);
  if (seen == null) return true;
  return seen;
}

function openBills(bills) {
  const rows = [];
  for (const bill of bills || []) {
    if (!bill || bill.excluded_from_cash || bill.is_paid) continue;
    const amount = Number(bill.amount_ttc);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const dueDate = isoDate(bill.due_date);
    rows.push({
      id: String(bill.id || `${bill.supplier_name}:${dueDate || 'x'}`),
      name: bill.supplier_name || '',
      amount: round2(Math.abs(amount)),
      dueDate,
      unknown: !dueDate,
      replacesId: bill.replaces_commitment_id || null,
    });
  }
  rows.sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    return String(a.dueDate).localeCompare(String(b.dueDate)) || a.name.localeCompare(b.name);
  });
  return rows;
}

function billReplaces(bill, commitment) {
  if (bill.replacesId && commitment.id && String(bill.replacesId) === String(commitment.id)) return true;
  return namesClose(bill.name, commitment.counterparty || commitment.label || '');
}

function datedJobs(jobs) {
  const byDeal = new Map();
  const loose = [];
  for (const job of jobs || []) {
    if (!job || job.invoiced || job.excluded_from_cash) continue;
    const status = job.link_status || job.status;
    if (status && status !== 'auto' && status !== 'valide') continue;
    const date = isoDate(job.end_date || job.event_date || job.google_calendar_end);
    if (!date) continue;
    const amount = Number(job.amount_ttc);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const row = {
      id: String(job.id || job.hubspot_deal_id || date),
      date,
      amount: round2(Math.abs(amount)),
      deal: job.hubspot_deal_id || null,
    };
    if (!row.deal) {
      loose.push(row);
      continue;
    }
    const prev = byDeal.get(row.deal);
    if (!prev || row.date > prev.date) byDeal.set(row.deal, row);
  }
  return [...loose, ...byDeal.values()];
}

function openInvoices(input, asOf) {
  const rows = [];
  for (const invoice of input.invoices || []) {
    if (!isClientInvoiceOpen(invoice, input.facturesMinDate)) continue;
    const remaining = clientInvoiceRemaining(invoice);
    if (remaining <= 0) continue;
    const dueDate = isoDate(invoice.due_date) || isoDate(invoice.expected_date_override) || isoDate(invoice.invoice_date);
    const days = dueDate && dueDate < asOf ? dayCount(dueDate, asOf) : 0;
    let bucket = 'notDue';
    if (dueDate && dueDate <= asOf) {
      if (days <= 30) bucket = 'd0_30';
      else if (days <= 60) bucket = 'd31_60';
      else bucket = 'd60';
    }
    const cashDate = isoDate(invoice.expected_date_override) || isoDate(invoice.due_date) || isoDate(invoice.invoice_date);
    rows.push({
      id: String(invoice.id || invoice.invoice_number || rows.length),
      client: invoice.client_name || '',
      number: invoice.invoice_number || '',
      amount: remaining,
      dueDate,
      days,
      late: days > 0,
      bucket,
      cashDate,
    });
  }
  rows.sort((a, b) => b.days - a.days || b.amount - a.amount || a.client.localeCompare(b.client));
  return rows;
}

function projectWeeks(asOf) {
  const start = mondayOf(asOf);
  const weeks = [];
  for (let i = 0; i < PROJECTION_WEEKS; i += 1) {
    const weekStart = addDays(start, i * 7);
    weeks.push({
      key: weekStart,
      start: weekStart,
      end: addDays(weekStart, 6),
      inflow: 0,
      outflow: 0,
      balance: 0,
    });
  }
  return weeks;
}

function addFlow(weeks, asOf, horizonEnd, date, signedAmount) {
  if (!date || !signedAmount) return;
  const when = date < asOf ? asOf : date;
  if (when > horizonEnd) return;
  const week = weeks.find((row) => when >= row.start && when <= row.end);
  if (!week) return;
  if (signedAmount > 0) week.inflow += signedAmount;
  else week.outflow += -signedAmount;
}

function project(input, asOf, opening, invoices, bills, txs) {
  const weeks = projectWeeks(asOf);
  const horizonEnd = weeks[weeks.length - 1].end;
  let invoiceTotal = 0;
  let jobTotal = 0;
  let supplierTotal = 0;
  let recurringTotal = 0;

  for (const invoice of invoices) {
    if (!invoice.cashDate) continue;
    invoiceTotal += invoice.amount;
    addFlow(weeks, asOf, horizonEnd, invoice.cashDate, invoice.amount);
  }

  for (const job of datedJobs(input.jobs)) {
    jobTotal += job.amount;
    addFlow(weeks, asOf, horizonEnd, job.date, job.amount);
  }

  for (const bill of bills) {
    if (!bill.dueDate) continue;
    supplierTotal += bill.amount;
    addFlow(weeks, asOf, horizonEnd, bill.dueDate, -bill.amount);
  }

  for (const commitment of input.commitments || []) {
    if (!isFixedRecurring(commitment)) continue;
    if (!recurringIsActive(commitment, txs, asOf)) continue;
    const amount = Number(commitment.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    let date = isoDate(commitment.next_due_date);
    if (!date) continue;
    let left = commitment.remaining_occurrences == null || commitment.remaining_occurrences === ''
      ? Infinity
      : Number(commitment.remaining_occurrences);
    const signed = commitment.direction === 'in' ? Math.abs(amount) : -Math.abs(amount);
    let guard = 0;
    while (date && date <= horizonEnd && left > 0 && guard < 60) {
      guard += 1;
      if (commitment.end_date && date > isoDate(commitment.end_date)) break;
      const month = date.slice(0, 7);
      const replaced = bills.some((bill) => bill.dueDate && bill.dueDate.slice(0, 7) === month && billReplaces(bill, commitment));
      if (!replaced) {
        recurringTotal += Math.abs(amount);
        addFlow(weeks, asOf, horizonEnd, date, signed);
      }
      left -= 1;
      date = stepDate(commitment, date);
    }
  }

  let balance = opening;
  for (const week of weeks) {
    week.inflow = round2(week.inflow);
    week.outflow = round2(week.outflow);
    balance = round2(balance + week.inflow - week.outflow);
    week.balance = balance;
  }

  return {
    weeks,
    totals: {
      invoices: round2(invoiceTotal),
      jobs: round2(jobTotal),
      suppliers: round2(supplierTotal),
      recurring: round2(recurringTotal),
    },
  };
}

function recurringCards(commitments, txs, asOf) {
  const cards = [];
  for (const row of commitments || []) {
    if (!isFixedRecurring(row)) continue;
    const amount = Number(row.amount);
    cards.push({
      id: String(row.id || row.label),
      name: row.label || row.counterparty || '',
      amount: Number.isFinite(amount) ? round2(Math.abs(amount)) : 0,
      frequency: frequencyOf(row),
      nextDate: isoDate(row.next_due_date),
      active: recurringIsActive(row, txs, asOf),
      category: row.category || 'autre',
      icon: recurringIconKey(row),
    });
  }
  cards.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return String(a.nextDate || '9999').localeCompare(String(b.nextDate || '9999')) || a.name.localeCompare(b.name);
  });
  return cards;
}

export function buildCashflow(input = {}) {
  const asOf = isoDate(input.asOf) || todayInBrussels();
  const accounts = cashAccounts(input.accounts);
  const accountIds = new Set(accounts.map((row) => row.id));
  const txs = eligibleTransactions(input, accountIds);
  const cash = currentCash(input, asOf, accounts, txs);
  const weeks = weekBuckets(asOf);
  const history = {
    week: fillHistory(weeks, accounts, input.snapshots, txs, asOf),
    month: fillHistory(monthBuckets(asOf, weeks), accounts, input.snapshots, txs, asOf),
  };
  const invoices = openInvoices(input, asOf);
  const buckets = { notDue: 0, d0_30: 0, d31_60: 0, d60: 0 };
  for (const row of invoices) buckets[row.bucket] = round2(buckets[row.bucket] + row.amount);
  const suppliers = openBills(input.supplierBills || input.supplier_bills);
  const projection = project(input, asOf, cash.amount, invoices, suppliers, txs);
  return {
    asOf,
    cash,
    history,
    projection: projection.weeks,
    projectionTotals: projection.totals,
    aging: {
      buckets,
      total: round2(invoices.reduce((sum, row) => sum + row.amount, 0)),
      list: invoices.slice(0, AGING_LIST_LIMIT),
    },
    suppliers,
    recurring: recurringCards(input.commitments, txs, asOf),
  };
}
