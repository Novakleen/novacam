/**
 * Treasury forecast (v1.20). Pure: same results on the client and in node:test.
 * Weeks are Monday–Sunday, week 1 is the week of `asOf` in Europe/Brussels.
 * Outflows are known on both curves. Probable adds usual revenue only through
 * max(signed jobs, usual revenue) per week.
 */

import { addDays, isBankDataStale } from './tresoAccountable.js'
import { invoiceIsPaid } from './tresoMatch.js'

const REPLACE_MIN_RATIO = 0.2
const NAME_STOP = new Set('sa nv srl sprl bvba gmbh ltd asbl the and pour avec van den der des les une aux'.split(' '))

const MONTH_WORDS = [
  ['septembre', 9], ['september', 9],
  ['novembre', 11], ['november', 11],
  ['decembre', 12], ['december', 12],
  ['octobre', 10], ['oktober', 10], ['october', 10],
  ['janvier', 1], ['januari', 1], ['january', 1],
  ['fevrier', 2], ['februari', 2], ['february', 2],
  ['augustus', 8], ['aout', 8], ['august', 8],
  ['juillet', 7], ['july', 7], ['juli', 7],
  ['juin', 6], ['juni', 6], ['june', 6],
  ['maart', 3], ['mars', 3], ['march', 3],
  ['avril', 4], ['april', 4],
  ['mei', 5], ['mai', 5], ['may', 5],
]

export function round2(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function todayInBrussels(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function formatBrusselsDateTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value || ''
  return `${pick('day')}/${pick('month')}/${pick('year')} ${pick('hour')}:${pick('minute')}`
}

function formatIso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function asIsoDate(value) {
  if (value == null || value === '') return null
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) return text.slice(0, 10)
    return todayInBrussels(date)
  }
  return null
}

function dayNumber(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

function mondayOf(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const delta = weekday === 0 ? -6 : 1 - weekday
  return addDays(iso, delta)
}

function addMonths(iso, months, dayOfMonth) {
  const year0 = Number(iso.slice(0, 4))
  const month0 = Number(iso.slice(5, 7))
  const index = (month0 - 1) + months
  const year = year0 + Math.floor(index / 12)
  const monthIndex = ((index % 12) + 12) % 12
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const preferred = dayOfMonth || Number(iso.slice(8, 10))
  return formatIso(year, monthIndex + 1, Math.min(preferred, last))
}

function endOfMonth(iso) {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return formatIso(year, month, last)
}

export function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nameTokens(value) {
  return normalizeName(value).split(' ').filter((token) => token.length >= 4 && !NAME_STOP.has(token))
}

export function matchScore(supplierName, commitment) {
  const hay = normalizeName(supplierName)
  const needle = normalizeName(commitment?.counterparty || commitment?.label || '')
  if (!hay || !needle) return 0
  if (hay.length >= 4 && needle.length >= 4 && (hay === needle || hay.includes(needle) || needle.includes(hay))) {
    return 50 + Math.min(hay.length, needle.length)
  }
  const left = new Set(nameTokens(hay))
  const shared = nameTokens(needle).filter((token) => left.has(token))
  if (!shared.length) return 0
  return shared.reduce((sum, token) => sum + token.length, 0)
}

export function namesMatch(left, right) {
  return matchScore(left, { counterparty: right }) > 0
}

function num(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeSettings(settings = {}) {
  const seasonality = Array.isArray(settings.seasonality_coefficients)
    ? settings.seasonality_coefficients.map((value) => num(value, 1))
    : []
  while (seasonality.length < 12) seasonality.push(1)
  return {
    collectionDelayDays: num(settings.collection_delay_days, 8),
    alertThreshold: num(settings.alert_threshold, 0),
    usualHt: num(settings.usual_revenue_ht_month, 27446.16),
    ttcRatio: num(settings.ttc_ratio, 1.0588) || 1.0588,
    probableEnabled: settings.probable_enabled !== false,
    probableStart: asIsoDate(settings.probable_start_date),
    dannyRate: num(settings.danny_rate, 0.075),
    dannyDay: num(settings.danny_day, 13),
    withholdingRate: num(settings.withholding_rate, 0.28),
    withholdingDueDay: num(settings.withholding_due_day, 6),
    staleAfter: num(settings.stale_after_business_days, 2),
    supplierDefaultDueDays: num(settings.supplier_default_due_days, 30),
    horizonWeeks: num(settings.horizon_weeks, 13) || 13,
    seasonality: seasonality.slice(0, 12),
  }
}

export function interpretPaymentTerms(invoiceDate, terms) {
  const invoice = asIsoDate(invoiceDate)
  const text = normalizeName(terms)
  if (!invoice || !text) return null
  if (/(comptant|reception|ontvangst|immediate|onmiddellijk)/.test(text)) return invoice
  const days = text.match(/(\d+)\s*(jour|day|dag)/)
  if (!days) return null
  const base = addDays(invoice, Number(days[1]))
  if (/(fin de mois|fin du mois|end of month|einde maand|einde van de maand|fdm)/.test(text)) {
    return endOfMonth(base)
  }
  return base
}

export function resolveSupplierDueDate({
  manualDate,
  pdfDate,
  exportDate,
  invoiceDate,
  paymentTerms,
  defaultDays = 30,
} = {}) {
  if (manualDate) return { dueDate: String(manualDate).slice(0, 10), source: 'manuel', estimated: false }
  if (pdfDate) return { dueDate: String(pdfDate).slice(0, 10), source: 'pdf', estimated: false }
  if (exportDate) return { dueDate: String(exportDate).slice(0, 10), source: 'export', estimated: false }
  const fromTerms = interpretPaymentTerms(invoiceDate, paymentTerms)
  if (fromTerms) return { dueDate: fromTerms, source: 'pdf', estimated: false }
  const invoice = asIsoDate(invoiceDate)
  if (!invoice) return { dueDate: null, source: 'estimee', estimated: true }
  return { dueDate: addDays(invoice, defaultDays), source: 'estimee', estimated: true }
}

export function seasonalityFromHistory(entries) {
  const sums = Array(12).fill(0)
  const counts = Array(12).fill(0)
  for (const entry of entries || []) {
    const month = Number(entry?.month)
    const amount = Number(entry?.amount_ht)
    if (month < 1 || month > 12 || !Number.isFinite(amount)) continue
    sums[month - 1] += amount
    counts[month - 1] += 1
  }
  const known = []
  for (let i = 0; i < 12; i += 1) if (counts[i]) known.push(sums[i] / counts[i])
  if (known.length < 2) return Array(12).fill(1)
  const global = known.reduce((sum, value) => sum + value, 0) / known.length
  if (!global) return Array(12).fill(1)
  return counts.map((count, index) => (count ? Math.round((sums[index] / count / global) * 10000) / 10000 : 1))
}

function buildWeeks(asOf, count) {
  const start = mondayOf(asOf)
  const weeks = []
  for (let i = 0; i < count; i += 1) {
    const weekStart = addDays(start, i * 7)
    weeks.push({
      index: i + 1,
      week_start: weekStart,
      week_end: addDays(weekStart, 6),
    })
  }
  return weeks
}

function previousMonth(iso) {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

function monthClosed(service, asOf) {
  const year = Number(asOf.slice(0, 4))
  const month = Number(asOf.slice(5, 7))
  return service.year < year || (service.year === year && service.month < month)
}

function seasonCoeff(month, ctx) {
  const value = ctx.seasonality[month - 1]
  return Number.isFinite(value) ? value : 1
}

function invoiceHt(invoice, ratio) {
  if (invoice.amount_ht != null && invoice.amount_ht !== '') return num(invoice.amount_ht, 0)
  if (invoice.amount_ttc == null || invoice.amount_ttc === '') return 0
  return num(invoice.amount_ttc, 0) / ratio
}

function invoicedHt(service, ctx) {
  let sum = 0
  for (const invoice of ctx.invoices) {
    if (invoice.excluded_from_cash) continue
    const iso = asIsoDate(invoice.invoice_date)
    if (!iso) continue
    if (Number(iso.slice(0, 4)) !== service.year || Number(iso.slice(5, 7)) !== service.month) continue
    sum += invoiceHt(invoice, ctx.ttcRatio)
  }
  return sum
}

function usualHtFor(service, ctx) {
  return ctx.usualHt * seasonCoeff(service.month, ctx)
}

function dannyVariable(date, ctx) {
  const service = previousMonth(date)
  const base = monthClosed(service, ctx.asOf) ? invoicedHt(service, ctx) : usualHtFor(service, ctx)
  return base * ctx.dannyRate
}

function quarterMonths(paymentDate) {
  const year = Number(paymentDate.slice(0, 4))
  let best = null
  for (const y of [year - 1, year]) {
    for (const [month, day] of [[3, 31], [6, 30], [9, 30], [12, 31]]) {
      const iso = formatIso(y, month, day)
      if (iso < paymentDate && (!best || iso > best)) best = iso
    }
  }
  if (!best) return []
  const endMonth = Number(best.slice(5, 7))
  const endYear = Number(best.slice(0, 4))
  const months = []
  for (let back = 2; back >= 0; back -= 1) {
    let month = endMonth - back
    let y = endYear
    while (month <= 0) {
      month += 12
      y -= 1
    }
    months.push({ year: y, month })
  }
  return months
}

function precompteAmount(date, ctx) {
  let variable = 0
  for (const service of quarterMonths(date)) {
    const base = monthClosed(service, ctx.asOf) ? invoicedHt(service, ctx) : usualHtFor(service, ctx)
    variable += base * ctx.dannyRate
  }
  return variable * ctx.withholdingRate
}

function stepDate(commitment, iso) {
  const frequency = commitment.frequency || 'monthly'
  const day = commitment.day_of_month ? Number(commitment.day_of_month) : null
  if (frequency === 'weekly') return addDays(iso, 7)
  if (frequency === 'quarterly') return addMonths(iso, 3, day)
  if (frequency === 'yearly') return addMonths(iso, 12, day)
  return addMonths(iso, 1, day)
}

function occurrenceAmount(commitment, date, ctx) {
  if (commitment.amount_rule === 'danny') return dannyVariable(date, ctx)
  if (commitment.amount_rule === 'precompte') return precompteAmount(date, ctx)
  if (commitment.amount == null || commitment.amount === '') return null
  return num(commitment.amount, 0)
}

function txText(tx) {
  return `${tx?.counterparty_name || ''} ${tx?.communication || ''}`
}

function isAdvancePayment(tx) {
  return /(^| )(advance|avance)( |$)/.test(normalizeName(txText(tx)))
}

function patternHits(pattern, tx) {
  if (!pattern) return false
  const hay = normalizeName(txText(tx))
  return String(pattern).split('|').some((part) => {
    const needle = normalizeName(part)
    return needle.length >= 3 && hay.includes(needle)
  })
}

function txKey(tx, index) {
  return tx?.id || tx?.dedup_hash || `${index}:${tx?.booking_date}:${tx?.amount}:${tx?.communication || ''}`
}

function eligibleTx(tx) {
  return tx && !tx.excluded_from_cash && !tx.is_internal_transfer && asIsoDate(tx.booking_date)
}

function parseServiceMonth(text) {
  const norm = normalizeName(text)
  const year = norm.match(/\b(20\d{2})\b/)
  if (!year) return null
  const tokens = new Set(norm.split(' ').filter(Boolean))
  for (const [word, month] of MONTH_WORDS) {
    if (tokens.has(word)) return { year: Number(year[1]), month }
  }
  return null
}

function amountNear(actual, expected) {
  const left = Math.abs(num(actual, NaN))
  const right = Math.abs(num(expected, NaN))
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return false
  return Math.abs(left - right) <= right * 0.2 + 0.001
}

function findMatchingTransaction(commitment, occurrenceDate, transactions, used, ctx) {
  const list = transactions || []
  for (let index = 0; index < list.length; index += 1) {
    const tx = list[index]
    const key = txKey(tx, index)
    if (used.has(key) || !eligibleTx(tx)) continue
    if (commitment.amount_rule === 'danny') {
      if (isAdvancePayment(tx)) continue
      if (!patternHits(commitment.match_pattern || 'danny', tx)) continue
      const named = parseServiceMonth(txText(tx))
      const service = previousMonth(occurrenceDate)
      if (!named || named.year !== service.year || named.month !== service.month) continue
      return { tx, key }
    }
    if (!patternHits(commitment.match_pattern, tx)) continue
    const booking = asIsoDate(tx.booking_date)
    if (Math.abs(dayNumber(booking) - dayNumber(occurrenceDate)) > 10) continue
    const expected = occurrenceAmount(commitment, occurrenceDate, ctx)
    if (expected == null || !amountNear(tx.amount, expected)) continue
    return { tx, key }
  }
  return null
}

function signed(amount, direction) {
  const value = Math.abs(num(amount, 0))
  return direction === 'in' ? value : -value
}

function expandCommitments(commitments, ctx, transactions, used) {
  const horizonEnd = ctx.weeks[ctx.weeks.length - 1].week_end
  const occurrences = []
  for (const commitment of commitments || []) {
    if (commitment.is_active === false || commitment.excluded_from_cash) continue
    if (commitment.spread_weekly) {
      const monthly = occurrenceAmount(commitment, ctx.asOf, ctx)
      if (monthly == null) continue
      const weekly = monthly * 12 / 52
      for (const week of ctx.weeks) {
        if (commitment.end_date && week.week_start > commitment.end_date) continue
        occurrences.push({
          commitmentId: commitment.id,
          label: commitment.label,
          counterparty: commitment.counterparty,
          scheduledDate: week.week_start,
          flowDate: week.week_start,
          rawAmount: weekly,
          signedAmount: signed(weekly, commitment.direction),
          source: 'echeance',
          spread: true,
        })
      }
      continue
    }
    if (!commitment.next_due_date) continue
    let date = asIsoDate(commitment.next_due_date)
    let left = commitment.remaining_occurrences == null || commitment.remaining_occurrences === ''
      ? Infinity
      : Number(commitment.remaining_occurrences)
    let guard = 0
    while (date && date <= horizonEnd && left > 0 && guard < 60) {
      guard += 1
      if (commitment.end_date && date > commitment.end_date) break
      const amount = occurrenceAmount(commitment, date, ctx)
      const paid = amount == null ? null : findMatchingTransaction(commitment, date, transactions, used, ctx)
      if (paid) used.add(paid.key)
      if (!paid && amount != null) {
        const flowDate = date < ctx.asOf ? ctx.asOf : date
        occurrences.push({
          commitmentId: commitment.id,
          label: commitment.label,
          counterparty: commitment.counterparty,
          scheduledDate: date,
          flowDate,
          rawAmount: amount,
          signedAmount: signed(amount, commitment.direction),
          source: 'echeance',
          spread: false,
          rule: commitment.amount_rule || 'fixed',
        })
      }
      if (amount != null || paid) left -= 1
      else break
      date = stepDate(commitment, date)
    }
  }
  return occurrences
}

function findSpreadMatch(bill, commitments) {
  if (bill.replaces_commitment_id) {
    const linked = (commitments || []).find((row) => row.id === bill.replaces_commitment_id)
    if (linked?.spread_weekly && linked.is_active !== false && !linked.excluded_from_cash) return linked
  }
  let best = null
  let score = 0
  for (const commitment of commitments || []) {
    if (!commitment.spread_weekly || commitment.is_active === false || commitment.excluded_from_cash) continue
    const scoreNow = matchScore(bill.supplier_name, commitment)
    if (scoreNow > score) {
      best = commitment
      score = scoreNow
    }
  }
  return best
}

function replacementTargets(bill, commitments) {
  if (bill.replaces_commitment_id) {
    const linked = (commitments || []).find((row) => row.id === bill.replaces_commitment_id)
    if (!linked || linked.spread_weekly || linked.is_active === false || linked.excluded_from_cash) return []
    return [linked]
  }
  return (commitments || []).filter((commitment) => (
    commitment.is_active !== false
    && !commitment.excluded_from_cash
    && !commitment.spread_weekly
    && commitment.amount_rule !== 'danny'
    && commitment.amount_rule !== 'precompte'
    && commitment.amount != null
    && commitment.amount !== ''
    && num(commitment.amount, 0) !== 0
    && matchScore(bill.supplier_name, commitment) > 0
  ))
}

function applySupplierBills(bills, occurrences, commitments) {
  const groups = new Map()
  const counted = []
  for (const bill of bills || []) {
    if (bill.excluded_from_cash || bill.is_paid) continue
    const amount = num(bill.amount_ttc, NaN)
    if (!Number.isFinite(amount) || amount === 0) continue
    if (findSpreadMatch(bill, commitments)) continue
    counted.push(bill)
    const targets = replacementTargets(bill, commitments)
    if (!targets.length) continue
    const month = String(bill.invoice_date || bill.booking_date || bill.due_date || '').slice(0, 7)
    const key = `${targets.map((row) => row.id).sort().join('|')}|${month}`
    const group = groups.get(key) || { targets, total: 0, month }
    group.total += Math.abs(amount)
    groups.set(key, group)
  }
  const removed = new Set()
  const ordered = [...groups.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)))
  for (const group of ordered) {
    const ids = new Set(group.targets.map((row) => row.id))
    const candidate = occurrences
      .filter((row) => !row.spread && !removed.has(row) && ids.has(row.commitmentId))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
    if (!candidate) continue
    const typical = Math.abs(candidate.rawAmount)
    if (!(typical > 0) || group.total + 0.001 < typical * REPLACE_MIN_RATIO) continue
    removed.add(candidate)
  }
  return { counted, kept: occurrences.filter((row) => !removed.has(row)) }
}

function latestSnapshot(snapshots, accountId, asOf) {
  const rows = (snapshots || []).filter((row) => row.account_id === accountId && asIsoDate(row.balance_date) && asIsoDate(row.balance_date) <= asOf)
  rows.sort((a, b) => {
    if (a.balance_date !== b.balance_date) return a.balance_date < b.balance_date ? 1 : -1
    const left = a.created_at || ''
    const right = b.created_at || ''
    if (left !== right) return left < right ? 1 : -1
    if (a.source === 'import' && b.source !== 'import') return -1
    if (b.source === 'import' && a.source !== 'import') return 1
    return 0
  })
  return rows[0] || null
}

function openingBalance(input, asOf) {
  const accounts = (input.accounts || []).filter((row) => row.include_in_cash !== false && row.is_active !== false)
  let total = 0
  let balanceDate = null
  let estimated = false
  for (const account of accounts) {
    const snap = latestSnapshot(input.snapshots, account.id, asOf)
    if (!snap) continue
    total += num(snap.balance, 0)
    const snapDate = asIsoDate(snap.balance_date)
    if (!balanceDate || snapDate > balanceDate) balanceDate = snapDate
    for (const tx of input.transactions || []) {
      if (tx.account_id !== account.id || tx.excluded_from_cash || tx.is_internal_transfer) continue
      const booking = asIsoDate(tx.booking_date)
      if (!booking || booking <= snapDate || booking > asOf) continue
      total += num(tx.amount, 0)
      estimated = true
      if (booking > balanceDate) balanceDate = booking
    }
  }
  return { balance: total, balanceDate, estimated, dataAsOf: balanceDate }
}

function invoiceRemaining(invoice) {
  const total = num(invoice.amount_ttc, NaN)
  if (!Number.isFinite(total)) return 0
  const paid = num(invoice.bank_paid_amount, 0)
  return round2(total - paid)
}

function pushFlow(flows, flow) {
  if (!flow.flow_date || !Number.isFinite(flow.amount) || flow.amount === 0) return
  flows.push(flow)
}

function collapseJobs(jobs) {
  const byDeal = new Map()
  const loose = []
  for (const job of jobs || []) {
    if (job.invoiced || job.excluded_from_cash) continue
    const status = job.link_status || job.status
    if (status && status !== 'auto' && status !== 'valide') continue
    const deal = job.hubspot_deal_id
    if (!deal) {
      loose.push(job)
      continue
    }
    const prev = byDeal.get(deal)
    const end = asIsoDate(job.end_date || job.google_calendar_end) || ''
    const prevEnd = prev ? (asIsoDate(prev.end_date || prev.google_calendar_end) || '') : ''
    if (!prev || end > prevEnd) byDeal.set(deal, job)
  }
  return [...loose, ...byDeal.values()]
}

function jobCash(job, ratio) {
  if (job.amount_ttc != null && job.amount_ttc !== '') return num(job.amount_ttc, 0)
  if (job.amount_ht != null && job.amount_ht !== '') return num(job.amount_ht, 0) * ratio
  return 0
}

function buildContext(input) {
  const settings = normalizeSettings(input.settings)
  const asOf = asIsoDate(input.asOf) || todayInBrussels()
  const weeks = buildWeeks(asOf, input.weeks || settings.horizonWeeks)
  return {
    ...settings,
    asOf,
    weeks,
    invoices: input.invoices || [],
    dannyDay: settings.dannyDay,
  }
}

export function projectTreasury(input = {}) {
  const ctx = buildContext(input)
  const horizonEnd = ctx.weeks[ctx.weeks.length - 1].week_end
  const used = new Set()
  const commitments = input.commitments || []
  const expanded = expandCommitments(commitments, ctx, input.transactions || [], used)
  const { counted, kept } = applySupplierBills(input.supplierBills || input.supplier_bills || [], expanded, commitments)
  const flows = []

  for (const row of kept) {
    pushFlow(flows, {
      flow_date: row.flowDate,
      amount: row.signedAmount,
      label: row.label,
      counterparty: row.counterparty || null,
      source: 'echeance',
      curve: 'both',
      ref_id: row.commitmentId || null,
      rule: row.rule || null,
    })
  }

  for (const bill of counted) {
    const due = asIsoDate(bill.due_date) || asIsoDate(bill.invoice_date)
    if (!due) continue
    const flowDate = due < ctx.asOf ? ctx.asOf : due
    if (flowDate > horizonEnd) continue
    pushFlow(flows, {
      flow_date: flowDate,
      amount: -Math.abs(num(bill.amount_ttc, 0)),
      label: bill.supplier_name,
      counterparty: bill.supplier_name,
      source: 'fournisseur',
      curve: 'both',
      ref_id: bill.id || null,
      estimated: bill.due_date_source === 'estimee',
    })
  }

  for (const invoice of ctx.invoices) {
    if (invoice.excluded_from_cash) continue
    const total = num(invoice.amount_ttc, NaN)
    if (!Number.isFinite(total) || total === 0) continue
    if (invoice.paid_at || invoiceIsPaid(invoice.bank_paid_amount, invoice.amount_ttc)) continue
    const remaining = invoiceRemaining(invoice)
    if (remaining === 0) continue
    const rawDate = asIsoDate(invoice.expected_date_override)
      || (asIsoDate(invoice.invoice_date) ? addDays(asIsoDate(invoice.invoice_date), ctx.collectionDelayDays) : null)
      || asIsoDate(invoice.due_date)
    if (!rawDate) continue
    const flowDate = rawDate < ctx.asOf ? ctx.asOf : rawDate
    if (flowDate > horizonEnd) continue
    pushFlow(flows, {
      flow_date: flowDate,
      amount: remaining,
      label: invoice.client_name || invoice.invoice_number || 'Facture',
      source: 'facture',
      curve: 'both',
      ref_id: invoice.id || invoice.invoice_number || null,
      overdue: rawDate < ctx.asOf && remaining > 0,
      rawDate,
    })
  }

  for (const job of collapseJobs(input.jobs)) {
    const end = asIsoDate(job.end_date || job.google_calendar_end)
    if (!end) continue
    const rawDate = addDays(end, ctx.collectionDelayDays)
    const flowDate = rawDate < ctx.asOf ? ctx.asOf : rawDate
    if (flowDate > horizonEnd) continue
    const amount = jobCash(job, ctx.ttcRatio)
    pushFlow(flows, {
      flow_date: flowDate,
      amount,
      label: job.label || job.hubspot_deal_id || 'Chantier',
      source: 'chantier',
      curve: 'sur',
      ref_id: job.id || job.hubspot_deal_id || null,
    })
  }

  const probableStart = ctx.probableStart || ctx.asOf
  const collectionFrom = addDays(probableStart, ctx.collectionDelayDays)
  if (ctx.probableEnabled) {
    const dailyBase = ctx.usualHt * ctx.ttcRatio * 12 / 52 / 7
    for (const week of ctx.weeks) {
      let amount = 0
      let cursor = week.week_start
      while (cursor <= week.week_end) {
        if (cursor >= collectionFrom) {
          amount += dailyBase * seasonCoeff(Number(cursor.slice(5, 7)), ctx)
        }
        cursor = addDays(cursor, 1)
      }
      if (amount) {
        pushFlow(flows, {
          flow_date: week.week_start < collectionFrom ? collectionFrom : week.week_start,
          amount,
          label: 'CA habituel',
          source: 'ca_habituel',
          curve: 'probable',
          ref_id: null,
        })
      }
    }
  }

  for (const event of input.cashEvents || input.cash_events || []) {
    if (event.excluded_from_cash) continue
    const rawDate = asIsoDate(event.event_date)
    if (!rawDate) continue
    const flowDate = rawDate < ctx.asOf ? ctx.asOf : rawDate
    if (flowDate > horizonEnd) continue
    const magnitude = Math.abs(num(event.amount, 0))
    pushFlow(flows, {
      flow_date: flowDate,
      amount: event.direction === 'in' ? magnitude : -magnitude,
      label: event.label,
      source: 'ponctuel',
      curve: 'both',
      ref_id: event.id || null,
    })
  }

  if (input.whatIf && num(input.whatIf.amount, 0) !== 0 && asIsoDate(input.whatIf.date)) {
    const rawDate = asIsoDate(input.whatIf.date)
    const flowDate = rawDate < ctx.asOf ? ctx.asOf : rawDate
    if (flowDate <= horizonEnd) {
      pushFlow(flows, {
        flow_date: flowDate,
        amount: -Math.abs(num(input.whatIf.amount, 0)),
        label: input.whatIf.label || 'Simulation',
        source: 'what_if',
        curve: 'both',
        ref_id: null,
      })
    }
  }

  const opening = openingBalance(input, ctx.asOf)
  const weeks = ctx.weeks.map((week) => ({
    ...week,
    in_sure: 0,
    in_jobs: 0,
    in_usual: 0,
    out_total: 0,
  }))
  const byStart = new Map(weeks.map((week) => [week.week_start, week]))
  for (const flow of flows) {
    const week = byStart.get(mondayOf(flow.flow_date))
    if (!week) continue
    if (flow.source === 'ca_habituel') week.in_usual += flow.amount
    else if (flow.source === 'chantier') week.in_jobs += flow.amount
    else if (flow.amount > 0) week.in_sure += flow.amount
    else week.out_total += -flow.amount
  }

  let sure = opening.balance
  let probable = opening.balance
  for (const week of weeks) {
    const usualOrJobs = Math.max(week.in_jobs, week.in_usual)
    const inSure = week.in_sure + week.in_jobs
    const inProbable = week.in_sure + usualOrJobs
    sure += inSure - week.out_total
    probable += inProbable - week.out_total
    week.in_sure = round2(inSure)
    week.in_probable = round2(inProbable)
    week.out_total = round2(week.out_total)
    week.balance_sure = round2(sure)
    week.balance_probable = round2(probable)
    delete week.in_jobs
    delete week.in_usual
  }

  const overdue = flows.filter((flow) => flow.source === 'facture' && flow.overdue)
  const lowProbable = weeks.reduce((best, week) => (week.balance_probable < best.balance_probable ? week : best), weeks[0])
  const lowSure = weeks.reduce((best, week) => (week.balance_sure < best.balance_sure ? week : best), weeks[0])
  let autonomy = 0
  for (const week of weeks) {
    if (week.balance_sure + 0.001 >= ctx.alertThreshold) autonomy += 1
    else break
  }
  const probableBreach = weeks.find((week) => week.balance_probable + 0.001 < ctx.alertThreshold)
  const sureBreach = weeks.find((week) => week.balance_sure + 0.001 < ctx.alertThreshold)
  const dataStale = Boolean(opening.dataAsOf && isBankDataStale(opening.dataAsOf, ctx.asOf, ctx.staleAfter))
  let alertLevel = null
  let alertWeek = null
  if (probableBreach) {
    alertLevel = 'red'
    alertWeek = probableBreach.week_start
  } else if (sureBreach && sureBreach.index <= 4) {
    alertLevel = 'orange'
    alertWeek = sureBreach.week_start
  } else if (dataStale) {
    alertLevel = 'grey'
  }

  return {
    as_of: ctx.asOf,
    opening_balance: round2(opening.balance),
    weeks,
    flows: flows.map((flow) => ({
      ...flow,
      amount: round2(flow.amount),
    })),
    kpis: {
      balance_today: round2(opening.balance),
      balance_date: opening.balanceDate,
      is_estimated: opening.estimated,
      data_as_of: opening.dataAsOf,
      data_stale: dataStale,
      low_point_probable: lowProbable?.balance_probable ?? null,
      low_point_week: lowProbable?.week_start ?? null,
      low_point_sure: lowSure?.balance_sure ?? null,
      low_point_sure_week: lowSure?.week_start ?? null,
      autonomy_weeks: autonomy,
      overdue_count: overdue.length,
      overdue_amount: round2(overdue.reduce((sum, flow) => sum + flow.amount, 0)),
      alert_level: alertLevel,
      alert_week: alertWeek,
      alert_threshold: ctx.alertThreshold,
    },
  }
}

export function projectWhatIf(input, amount, date, label) {
  return projectTreasury({ ...input, whatIf: { amount, date, label } })
}

export function advanceCommitments({ commitments, transactions, settings, invoices, asOf } = {}) {
  const ctx = buildContext({ settings, invoices, asOf: asOf || todayInBrussels(), weeks: 1 })
  const used = new Set()
  const updates = []
  for (const commitment of commitments || []) {
    if (commitment.is_active === false || commitment.excluded_from_cash || commitment.spread_weekly) continue
    let date = asIsoDate(commitment.next_due_date)
    if (!date) continue
    let left = commitment.remaining_occurrences == null || commitment.remaining_occurrences === ''
      ? null
      : Number(commitment.remaining_occurrences)
    let steps = 0
    while (date && steps < 36) {
      if (left === 0) break
      const hit = findMatchingTransaction(commitment, date, transactions, used, ctx)
      if (!hit) break
      used.add(hit.key)
      date = stepDate(commitment, date)
      steps += 1
      if (left != null) left -= 1
    }
    if (steps > 0) {
      updates.push({
        id: commitment.id,
        next_due_date: date,
        remaining_occurrences: left,
      })
    }
  }
  return updates
}

export function classifyImportedBill({ supplierName, excludedNames, commitments }) {
  if ((excludedNames || []).some((name) => namesMatch(supplierName, name))) {
    return { excluded_from_cash: true, replaces_commitment_id: null }
  }
  const spread = findSpreadMatch({ supplier_name: supplierName }, commitments || [])
  return {
    excluded_from_cash: false,
    replaces_commitment_id: spread?.id || null,
  }
}

export function presentLastImport({ batch, balance, today, staleAfterBusinessDays = 2 } = {}) {
  const dates = [batch?.data_as_of, balance?.balance_date]
    .map((value) => asIsoDate(value))
    .filter(Boolean)
    .sort()
  const dataDate = dates.length ? dates[dates.length - 1] : null
  return {
    importedAt: batch?.created_at || null,
    channel: batch?.channel || null,
    rowsInserted: batch?.rows_inserted ?? null,
    balance: balance?.balance == null || balance?.balance === '' ? null : num(balance.balance, 0),
    balanceDate: asIsoDate(balance?.balance_date),
    dataDate,
    stale: Boolean(dataDate && today && isBankDataStale(dataDate, today, staleAfterBusinessDays)),
    empty: !batch,
  }
}
