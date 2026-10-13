/**
 * Bank ↔ client invoice matching (spec § 5.3).
 * Pure: no I/O. Paid status comes only from counted bank payments.
 * HubSpot hs_payment_date is never an input.
 */

const LOCKED = new Set(['auto', 'a_valider', 'valide', 'rejete'])

const STOP_WORDS = new Set(
  'de du des le la les et ou au aux van den der het een the and for avec pour met sprl srl bvba sarl gmbh ltd asbl'.split(' '),
)

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function toCents(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function invoiceIsPaid(paidAmount, amountTtc) {
  const due = toCents(amountTtc)
  const paid = toCents(paidAmount)
  if (due == null || paid == null || due <= 0) return false
  return paid >= Math.round(due * 0.99)
}

/** Uppercase, collapse spaces, Brussels shorthand BXL → BLX. */
export function normalizeInvoiceText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/BXL/g, 'BLX')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Invoice numbers after normalisation.
 * Pattern: 2B[LX]{2} optional hyphen, then 4 digits. "2BXL-2708" → "2BLX-2708".
 */
export function extractInvoiceNumbers(value) {
  const normalized = normalizeInvoiceText(value)
  const re = /(?<![A-Z0-9])(2B[LX]{2})\s*-?\s*(\d{4})(?!\d)/g
  const found = []
  let match = re.exec(normalized)
  while (match) {
    found.push(`${match[1]}-${match[2]}`)
    match = re.exec(normalized)
  }
  return [...new Set(found)]
}

function nameTokens(value) {
  const folded = String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  return folded.split(/[^a-z0-9]+/).filter((word) => /^[a-z]{3,}$/.test(word) && !STOP_WORDS.has(word))
}

export function sharesClientName(clientName, counterparty, communication) {
  const client = new Set(nameTokens(clientName))
  if (!client.size) return false
  const other = nameTokens(`${counterparty || ''} ${communication || ''}`)
  return other.some((word) => client.has(word))
}

function dayUtc(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function daysFromInvoice(txDate, invoiceDate) {
  const tx = dayUtc(txDate)
  const inv = dayUtc(invoiceDate)
  if (tx == null || inv == null) return null
  return Math.round((tx - inv) / 86400000)
}

function amountClose(a, b) {
  const left = toCents(a)
  const right = toCents(b)
  if (left == null || right == null) return false
  return Math.abs(left - right) <= 2
}

function openInvoices(invoices) {
  return (invoices || []).filter((row) => !row.excluded_from_cash && toCents(row.amount_ttc) != null && toCents(row.amount_ttc) > 0)
}

function indexByNumber(invoices) {
  const byNumber = new Map()
  for (const invoice of invoices || []) {
    if (invoice.excluded_from_cash) continue
    for (const number of extractInvoiceNumbers(invoice.invoice_number)) {
      if (!byNumber.has(number)) byNumber.set(number, invoice)
    }
  }
  return byNumber
}

function invoicesFromNumbers(text, byNumber) {
  const found = []
  const seen = new Set()
  for (const number of extractInvoiceNumbers(text)) {
    const invoice = byNumber.get(number)
    if (!invoice || seen.has(invoice.id)) continue
    seen.add(invoice.id)
    found.push(invoice)
  }
  return found
}

/** Split a payment across several invoices, proportional to TTC. Last share absorbs the remainder. */
export function splitPayment(amount, invoices) {
  const cents = toCents(amount)
  if (cents == null || !invoices.length) return []
  if (invoices.length === 1) return [{ invoice: invoices[0], amount: round2(cents / 100) }]
  const weights = invoices.map((invoice) => Math.max(0, toCents(invoice.amount_ttc) || 0))
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const shares = []
  let used = 0
  for (let i = 0; i < invoices.length; i += 1) {
    let part
    if (i === invoices.length - 1) part = cents - used
    else if (weightSum <= 0) part = Math.floor(cents / invoices.length)
    else part = Math.round((cents * weights[i]) / weightSum)
    shares.push(part)
    used += part
  }
  return invoices.map((invoice, index) => ({ invoice, amount: round2(shares[index] / 100) }))
}

function eligibleTransaction(tx, belfiusAccountId) {
  if (!tx || !belfiusAccountId) return false
  if (tx.account_id !== belfiusAccountId) return false
  if (tx.is_internal_transfer || tx.excluded_from_cash) return false
  if (!(Number(tx.amount) > 0)) return false
  if (LOCKED.has(tx.match_status) || tx.match_method === 'rejete') return false
  return true
}

function pickClosest(tx, candidates) {
  let best = null
  let bestRank = null
  for (const invoice of candidates) {
    const delta = daysFromInvoice(tx.booking_date, invoice.invoice_date)
    const rank = [
      delta == null ? 1 : 0,
      delta == null ? Number.MAX_SAFE_INTEGER : Math.abs(delta),
      String(invoice.id),
    ]
    if (!best || rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1]) || (rank[0] === bestRank[0] && rank[1] === bestRank[1] && rank[2] < bestRank[2])) {
      best = invoice
      bestRank = rank
    }
  }
  return best
}

function inNameWindow(tx, invoice) {
  const delta = daysFromInvoice(tx.booking_date, invoice.invoice_date)
  return delta != null && delta >= -60 && delta <= 120
}

function countedAllocations(tx, byNumber) {
  if (tx.match_status !== 'auto' && tx.match_status !== 'valide') return []
  if (tx.is_internal_transfer || tx.excluded_from_cash) return []
  if (!(Number(tx.amount) > 0)) return []
  if (tx.match_method === 'numero') {
    const found = invoicesFromNumbers(tx.communication, byNumber)
    if (found.length) {
      return splitPayment(tx.amount, found).map((share) => ({
        invoiceId: share.invoice.id,
        amount: share.amount,
        date: tx.booking_date,
        txId: tx.id,
      }))
    }
  }
  if (!tx.client_invoice_id) return []
  return [{
    invoiceId: tx.client_invoice_id,
    amount: round2(tx.amount),
    date: tx.booking_date,
    txId: tx.id,
  }]
}

/**
 * Add one newly validated payment on top of the bank total already counted.
 * paid_at is the date of the payment that crosses 99%.
 */
export function foldValidatedPayment({ amountTtc, bankPaidAmount, paidAt, paymentAmount, paymentDate }) {
  const previous = Number(bankPaidAmount) || 0
  const next = round2(previous + Number(paymentAmount || 0))
  const wasPaid = invoiceIsPaid(previous, amountTtc)
  const paid = invoiceIsPaid(next, amountTtc)
  let nextPaidAt = null
  if (paid) nextPaidAt = wasPaid ? (paidAt || paymentDate || null) : (paymentDate || paidAt || null)
  return {
    bank_paid_amount: next,
    paid_at: nextPaidAt,
    paid,
  }
}

export function reconcileBankInvoices({ transactions = [], invoices = [], belfiusAccountId }) {
  const byNumber = indexByNumber(invoices)
  const pool = openInvoices(invoices)
  const linked = transactions.map((tx) => ({ ...tx }))
  const transactionUpdates = []

  for (const tx of linked) {
    if (!eligibleTransaction(tx, belfiusAccountId)) continue
    const numbered = invoicesFromNumbers(tx.communication, byNumber)
    if (numbered.length) {
      tx.match_status = 'auto'
      tx.match_method = 'numero'
      tx.client_invoice_id = numbered[0].id
      transactionUpdates.push({
        id: tx.id,
        client_invoice_id: tx.client_invoice_id,
        match_status: 'auto',
        match_method: 'numero',
      })
      continue
    }

    const named = pickClosest(tx, pool.filter((invoice) => (
      amountClose(tx.amount, invoice.amount_ttc)
      && sharesClientName(invoice.client_name, tx.counterparty_name, tx.communication)
      && inNameWindow(tx, invoice)
    )))
    if (named) {
      tx.match_status = 'auto'
      tx.match_method = 'montant_nom'
      tx.client_invoice_id = named.id
      transactionUpdates.push({
        id: tx.id,
        client_invoice_id: named.id,
        match_status: 'auto',
        match_method: 'montant_nom',
      })
      continue
    }

    const amountOnly = pickClosest(tx, pool.filter((invoice) => amountClose(tx.amount, invoice.amount_ttc)))
    if (amountOnly) {
      tx.match_status = 'a_valider'
      tx.match_method = 'montant'
      tx.client_invoice_id = amountOnly.id
      transactionUpdates.push({
        id: tx.id,
        client_invoice_id: amountOnly.id,
        match_status: 'a_valider',
        match_method: 'montant',
      })
    }
  }

  const allocations = []
  for (const tx of linked) allocations.push(...countedAllocations(tx, byNumber))
  const byInvoice = new Map()
  for (const allocation of allocations) {
    const list = byInvoice.get(allocation.invoiceId) || []
    list.push(allocation)
    byInvoice.set(allocation.invoiceId, list)
  }

  const invoiceUpdates = []
  for (const invoice of invoices) {
    const payments = (byInvoice.get(invoice.id) || []).slice().sort((a, b) => {
      const date = String(a.date || '').localeCompare(String(b.date || ''))
      if (date !== 0) return date
      return String(a.txId).localeCompare(String(b.txId))
    })
    let running = 0
    let paidAt = null
    for (const payment of payments) {
      running = round2(running + payment.amount)
      if (!paidAt && invoiceIsPaid(running, invoice.amount_ttc)) paidAt = payment.date || null
    }
    const bankPaid = round2(running)
    const paid = invoiceIsPaid(bankPaid, invoice.amount_ttc)
    const previousPaid = round2(Number(invoice.bank_paid_amount) || 0)
    const previousAt = invoice.paid_at || null
    if (bankPaid === previousPaid && (paidAt || null) === previousAt) continue
    invoiceUpdates.push({
      id: invoice.id,
      hubspot_invoice_id: invoice.hubspot_invoice_id || null,
      bank_paid_amount: bankPaid,
      paid_at: paid ? paidAt : null,
      paid,
    })
  }

  return { transactionUpdates, invoiceUpdates }
}

export async function applyBankMatch(db) {
  if (typeof db.loadMatchState !== 'function' || typeof db.applyMatchPlan !== 'function') return null
  const state = await db.loadMatchState()
  const plan = reconcileBankInvoices(state)
  await db.applyMatchPlan(plan)
  return {
    auto: plan.transactionUpdates.filter((row) => row.match_status === 'auto').length,
    a_valider: plan.transactionUpdates.filter((row) => row.match_status === 'a_valider').length,
    invoices_paid: plan.invoiceUpdates.filter((row) => row.paid).length,
  }
}
