/**
 * HTTP + persistence for the Accountable import.
 * The database is injected so node tests can use an in-memory port.
 */
import { parseAccountableXlsx, parseIsoDate, sha256Hex } from './tresoAccountable.js'
import { advanceCommitments, classifyImportedBill } from './tresoForecast.js'
import { applyBankMatch, extractInvoiceNumbers } from './tresoMatch.js'

export const BELFIUS_IBAN = 'BE25068955038482'
const MAX_BYTES = 20 * 1024 * 1024

function json(corsHeaders, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseMoney(value) {
  if (value == null) return null
  let s = String(value).trim().replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function base64ToBytes(value) {
  const cleaned = String(value).replace(/^data:[^,]*,/, '').replace(/\s/g, '')
  const bin = atob(cleaned)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function readPayload(req) {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') return { error: 'file_missing' }
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: (typeof file.name === 'string' && file.name) || String(form.get('file_name') || 'accountable.xlsx'),
      balanceBelfius: form.get('balance_belfius'),
      balanceDate: form.get('balance_date'),
      balanceVisa: form.get('balance_visa'),
      visaBalanceDate: form.get('visa_balance_date'),
    }
  }
  let body
  try {
    body = await req.json()
  } catch {
    return { error: 'invalid_body' }
  }
  const b64 = body.file_base64 || body.xlsx_base64 || body.fileBase64
  if (!b64) return { error: 'file_missing' }
  return {
    bytes: base64ToBytes(b64),
    fileName: body.file_name || body.fileName || 'accountable.xlsx',
    balanceBelfius: body.balance_belfius ?? body.balanceBelfius,
    balanceDate: body.balance_date ?? body.balanceDate,
    balanceVisa: body.balance_visa ?? body.balanceVisa,
    visaBalanceDate: body.visa_balance_date ?? body.visaBalanceDate,
  }
}

/** A PDF or manual due date is never replaced by an Accountable re-import. */
export function supplierDueDateLocked(source) {
  return source === 'manuel' || source === 'pdf'
}

export function readBalances(payload) {
  const belfiusAmount = parseMoney(payload.balanceBelfius)
  const belfiusDate = parseIsoDate(payload.balanceDate)
  if (belfiusAmount == null || !belfiusDate) {
    return {
      error: 'balance_missing',
      message: 'Solde Belfius et sa date sont obligatoires.',
    }
  }
  const visaRaw = payload.balanceVisa
  const visaDateRaw = payload.visaBalanceDate
  const visaProvided = visaRaw != null && String(visaRaw).trim() !== ''
  const visaDateProvided = visaDateRaw != null && String(visaDateRaw).trim() !== ''
  if (visaProvided || visaDateProvided) {
    const visaAmount = parseMoney(visaRaw)
    const visaDate = parseIsoDate(visaDateRaw || payload.balanceDate)
    if (visaAmount == null || !visaDate) {
      return {
        error: 'balance_missing',
        message: 'Solde Visa incomplet : montant et date sont requis ensemble.',
      }
    }
    return {
      belfius: { amount: belfiusAmount, date: belfiusDate },
      visa: { amount: visaAmount, date: visaDate },
    }
  }
  return { belfius: { amount: belfiusAmount, date: belfiusDate }, visa: null }
}

export async function authenticateTreso(req, deps) {
  const apiKey = (req.headers.get('x-treso-api-key') || '').trim()
  if (apiKey) {
    const hash = await sha256Hex(new TextEncoder().encode(apiKey))
    const row = await deps.db.findApiKey(hash)
    if (!row || row.revoked_at || row.scope !== 'treso-import') {
      return { response: json(deps.corsHeaders, { error: 'Unauthorized' }, 401) }
    }
    await deps.db.touchApiKey(row.id)
    return { channel: 'api', userId: row.created_by || null }
  }
  const caller = await deps.requireCaller(req)
  if (caller instanceof Response) return { response: caller }
  if (!caller?.userId) {
    return { response: json(deps.corsHeaders, { error: 'Unauthorized' }, 401) }
  }
  return { channel: 'ecran', userId: caller.userId }
}

function reportFrom(parsed, extra) {
  return {
    ok: true,
    rows_total: parsed.transactionRowsTotal,
    rows_skipped: parsed.transactionSkipped,
    exact_duplicates: parsed.exactDuplicates,
    date_min: parsed.dateMin,
    date_max: parsed.dateMax,
    data_as_of: parsed.dateMax,
    internal_transfers: parsed.internalTransfers,
    supplier_rows_total: parsed.expenseRowsTotal,
    supplier_rows_skipped: parsed.expenseSkipped,
    ...extra,
  }
}

export function planAccountableStatusUpdates(factures, invoices, syncedAt) {
  const byNumber = new Map()
  for (const invoice of invoices || []) {
    for (const number of extractInvoiceNumbers(invoice.invoice_number)) {
      const list = byNumber.get(number) || []
      list.push(invoice)
      byNumber.set(number, list)
    }
  }
  const updates = []
  const seen = new Set()
  let matched = 0
  let unmatched = 0
  for (const facture of factures || []) {
    const hits = byNumber.get(facture.invoiceNumber) || []
    if (!hits.length) {
      unmatched += 1
      continue
    }
    matched += 1
    for (const invoice of hits) {
      if (seen.has(invoice.id)) continue
      seen.add(invoice.id)
      updates.push({
        id: invoice.id,
        accountable_status: facture.status,
        accountable_synced_at: syncedAt,
      })
    }
  }
  return { matched, unmatched, updates }
}

function factureReport(parsed, sync) {
  return {
    factures_present: Boolean(parsed.facturesPresent),
    factures_matched: sync?.matched || 0,
    factures_unmatched: sync?.unmatched || 0,
    factures_skipped: parsed.facturesSkipped || 0,
    factures_date_min: parsed.facturesDateMin || null,
  }
}

async function applyFactureStatuses(db, parsed) {
  const factures = parsed.factures || []
  if (!parsed.facturesPresent || !factures.length) return { matched: 0, unmatched: 0 }
  if (typeof db.listClientInvoiceNumbers !== 'function' || typeof db.updateAccountableStatuses !== 'function') {
    return { matched: 0, unmatched: factures.length }
  }
  const invoices = await db.listClientInvoiceNumbers()
  const plan = planAccountableStatusUpdates(factures, invoices, new Date().toISOString())
  if (plan.updates.length) await db.updateAccountableStatuses(plan.updates)
  return { matched: plan.matched, unmatched: plan.unmatched }
}

async function advanceKnownCommitments(db) {
  if (
    typeof db.listTransactionsForAdvance !== 'function'
    || typeof db.updateCommitmentSchedule !== 'function'
    || typeof db.listCommitments !== 'function'
  ) return 0
  const transactions = await db.listTransactionsForAdvance()
  const current = await db.listCommitments()
  const updates = advanceCommitments({ commitments: current, transactions })
  for (const update of updates) {
    await db.updateCommitmentSchedule(update.id, {
      next_due_date: update.next_due_date,
      remaining_occurrences: update.remaining_occurrences,
    })
  }
  return updates.length
}

export async function applyAccountableImport({
  parsed,
  fileSha256,
  fileName,
  channel,
  userId,
  balances,
  db,
}) {
  await db.upsertBalances({ balances, userId })
  const existing = await db.findBatchByHash(fileSha256)
  if (existing) {
    const factures = await applyFactureStatuses(db, parsed)
    return reportFrom(parsed, {
      already_imported: true,
      file_sha256: fileSha256,
      file_name: fileName,
      channel,
      rows_inserted: 0,
      rows_duplicate: parsed.transactions.length + parsed.inFileDuplicateExtras,
      supplier_bills_inserted: 0,
      supplier_bills_marked_paid: 0,
      supplier_bills_duplicate: parsed.expenses.length,
      commitments_advanced: await advanceKnownCommitments(db),
      ...factureReport(parsed, factures),
    })
  }

  const accounts = await db.ensureAccounts()
  const txRows = []
  let unresolved = 0
  for (const row of parsed.transactions) {
    const accountId = accounts.resolve(row.accountNumber)
    if (!accountId) {
      unresolved += 1
      continue
    }
    txRows.push({
      account_id: accountId,
      booking_date: row.bookingDate,
      amount: row.amount,
      counterparty_name: row.counterpartyName || null,
      counterparty_iban: row.counterpartyIban,
      communication: row.communication || null,
      dedup_hash: row.dedupHash,
      is_internal_transfer: row.isInternalTransfer,
      excluded_from_cash: row.excludedFromCash,
      match_status: 'aucun',
      created_by: userId,
    })
  }

  const insertedHashes = await db.insertNewTransactions(txRows)
  const dbDuplicates = txRows.length - insertedHashes.length

  let billsInserted = 0
  let billsMarkedPaid = 0
  let billsDuplicate = 0
  const excludedNames = typeof db.listExcludedNames === 'function' ? await db.listExcludedNames() : []
  const commitments = typeof db.listCommitments === 'function' ? await db.listCommitments() : []
  const existingBills = await db.findBillsByHashes(parsed.expenses.map((bill) => bill.rowHash))
  const byHash = new Map(existingBills.map((bill) => [bill.row_hash, bill]))
  const toInsert = []
  for (const bill of parsed.expenses) {
    const found = byHash.get(bill.rowHash)
    if (!found) {
      if (bill.isPaid) {
        billsDuplicate += 1
        continue
      }
      const flags = classifyImportedBill({
        supplierName: bill.supplierName,
        excludedNames,
        commitments,
      })
      toInsert.push({
        supplier_name: bill.supplierName,
        booking_date: bill.bookingDate,
        invoice_date: bill.invoiceDate,
        amount_ttc: bill.amountTtc,
        accountable_category: bill.category || null,
        is_paid: false,
        due_date: bill.dueDate,
        due_date_source: bill.dueDateSource,
        row_hash: bill.rowHash,
        excluded_from_cash: flags.excluded_from_cash,
        replaces_commitment_id: flags.replaces_commitment_id,
        created_by: userId,
      })
      continue
    }
    billsDuplicate += 1
    if (bill.isPaid && !found.is_paid) {
      await db.markBillPaid(found.id)
      billsMarkedPaid += 1
    }
    if (!supplierDueDateLocked(found.due_date_source) && bill.dueDateSource === 'export' && (found.due_date_source !== 'export' || found.due_date !== bill.dueDate)) {
      await db.updateBillDue(found.id, bill.dueDate, 'export')
    }
  }
  if (toInsert.length) {
    await db.insertBills(toInsert)
    billsInserted = toInsert.length
  }

  const factures = await applyFactureStatuses(db, parsed)
  const report = reportFrom(parsed, {
    already_imported: false,
    file_sha256: fileSha256,
    file_name: fileName,
    channel,
    rows_inserted: insertedHashes.length,
    rows_duplicate: parsed.inFileDuplicateExtras + dbDuplicates,
    rows_skipped: parsed.transactionSkipped + unresolved,
    supplier_bills_inserted: billsInserted,
    supplier_bills_marked_paid: billsMarkedPaid,
    supplier_bills_duplicate: billsDuplicate,
    ...factureReport(parsed, factures),
  })

  const batch = await db.insertBatch({
    file_name: fileName,
    file_sha256: fileSha256,
    kind: 'accountable_xlsx',
    channel,
    data_as_of: parsed.dateMax,
    rows_total: parsed.transactionRowsTotal,
    rows_inserted: report.rows_inserted,
    rows_duplicate: report.rows_duplicate,
    date_min: parsed.dateMin,
    date_max: parsed.dateMax,
    report,
    created_by: userId,
  })
  if (insertedHashes.length && batch?.id) {
    await db.attachBatch(insertedHashes, batch.id)
  }
  report.commitments_advanced = await advanceKnownCommitments(db)
  return report
}

export async function handleTresoImport(req, deps) {
  const cors = deps.corsHeaders
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(cors, { error: 'Method not allowed' }, 405)

  try {
    const auth = await authenticateTreso(req, deps)
    if (auth.response) return auth.response

    const payload = await readPayload(req)
    if (payload.error === 'file_missing') {
      return json(cors, { error: 'file_missing', message: 'Fichier .xlsx manquant.' }, 400)
    }
    if (payload.error) return json(cors, { error: payload.error, message: 'Requête illisible.' }, 400)
    if (!payload.bytes?.byteLength) {
      return json(cors, { error: 'file_missing', message: 'Fichier .xlsx vide.' }, 400)
    }
    if (payload.bytes.byteLength > MAX_BYTES) {
      return json(cors, { error: 'file_too_large', message: 'Fichier trop volumineux (20 Mo max).' }, 400)
    }

    const balances = readBalances(payload)
    if (balances.error) return json(cors, balances, 400)

    const settings = await deps.db.getSettings()
    const parsed = await parseAccountableXlsx(payload.bytes, {
      supplierDefaultDueDays: settings?.supplier_default_due_days ?? 30,
    })
    if (!parsed.ok) return json(cors, parsed, 400)

    const fileSha256 = await sha256Hex(payload.bytes)
    const report = await applyAccountableImport({
      parsed,
      fileSha256,
      fileName: String(payload.fileName || 'accountable.xlsx').slice(0, 200),
      channel: auth.channel,
      userId: auth.userId,
      balances,
      db: deps.db,
    })
    const match = await applyBankMatch(deps.db)
    if (match) {
      report.matches_auto = match.auto
      report.matches_a_valider = match.a_valider
    }
    return json(cors, report, 200)
  } catch (error) {
    console.error('treso-import', error?.message || error)
    return json(cors, { error: 'import_failed', message: error?.message || 'Import impossible.' }, 500)
  }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export function supabaseTresoDb(admin) {
  return {
    async findApiKey(hash) {
      const { data, error } = await admin.from('treso_api_keys').select('id, key_hash, scope, revoked_at, created_by').eq('key_hash', hash).maybeSingle()
      if (error) throw error
      return data
    },
    async touchApiKey(id) {
      const { error } = await admin.from('treso_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    async getSettings() {
      const { data, error } = await admin.from('treso_settings').select('supplier_default_due_days').eq('id', 1).maybeSingle()
      if (error) throw error
      return data
    },
    async listExcludedNames() {
      const names = new Set()
      const settings = await admin.from('treso_settings').select('excluded_names').eq('id', 1).maybeSingle()
      if (!settings.error && Array.isArray(settings.data?.excluded_names)) {
        for (const name of settings.data.excluded_names) if (name) names.add(String(name))
      }
      const invoices = await admin.from('treso_client_invoices').select('client_name').eq('excluded_from_cash', true)
      if (invoices.error) throw invoices.error
      for (const row of invoices.data || []) if (row.client_name) names.add(row.client_name)
      const bills = await admin.from('treso_supplier_bills').select('supplier_name').eq('excluded_from_cash', true)
      if (bills.error) throw bills.error
      for (const row of bills.data || []) if (row.supplier_name) names.add(row.supplier_name)
      return [...names]
    },
    async listCommitments() {
      const { data, error } = await admin.from('treso_commitments').select('id, label, counterparty, amount, frequency, day_of_month, next_due_date, end_date, remaining_occurrences, spread_weekly, amount_rule, match_pattern, is_active, excluded_from_cash, direction')
      if (error) throw error
      return data || []
    },
    async listTransactionsForAdvance() {
      const { data, error } = await admin.from('treso_bank_transactions').select('id, booking_date, amount, counterparty_name, communication, excluded_from_cash, is_internal_transfer')
      if (error) throw error
      return data || []
    },
    async updateCommitmentSchedule(id, patch) {
      const { error } = await admin.from('treso_commitments').update(patch).eq('id', id)
      if (error) throw error
    },
    async findBatchByHash(hash) {
      const { data, error } = await admin.from('treso_import_batches').select('id, file_sha256').eq('file_sha256', hash).maybeSingle()
      if (error) throw error
      return data
    },
    async ensureAccounts() {
      const { data, error } = await admin.from('treso_accounts').select('id, name, iban, kind, is_active')
      if (error) throw error
      const accounts = data || []
      let belfius = accounts.find((row) => String(row.iban || '').replace(/\s+/g, '').toUpperCase() === BELFIUS_IBAN)
      let visa = accounts.find((row) => row.kind === 'carte' && row.is_active !== false)
      if (!belfius) {
        const inserted = await admin.from('treso_accounts').insert({
          name: 'Belfius courant',
          iban: BELFIUS_IBAN,
          kind: 'courant',
          include_in_cash: true,
          is_active: true,
        }).select('id, iban, kind').single()
        if (inserted.error) throw inserted.error
        belfius = inserted.data
        accounts.push(belfius)
      }
      if (!visa) {
        const inserted = await admin.from('treso_accounts').insert({
          name: 'Visa prépayée',
          iban: null,
          kind: 'carte',
          include_in_cash: true,
          is_active: true,
        }).select('id, iban, kind').single()
        if (inserted.error) throw inserted.error
        visa = inserted.data
        accounts.push(visa)
      }
      const byIban = new Map()
      for (const row of accounts) {
        const iban = String(row.iban || '').replace(/\s+/g, '').toUpperCase()
        if (iban) byIban.set(iban, row.id)
      }
      return {
        belfiusId: belfius.id,
        visaId: visa.id,
        resolve(accountNumber) {
          const iban = String(accountNumber || '').replace(/\s+/g, '').toUpperCase()
          if (byIban.has(iban)) return byIban.get(iban)
          if (/^BE\d{14}$/.test(iban)) return null
          return visa.id
        },
      }
    },
    async upsertBalances({ balances, userId }) {
      const accounts = await this.ensureAccounts()
      const rows = [{
        account_id: accounts.belfiusId,
        balance_date: balances.belfius.date,
        balance: balances.belfius.amount,
        source: 'import',
        note: 'Solde Belfius saisi à l\'import',
        created_by: userId,
      }]
      if (balances.visa) {
        rows.push({
          account_id: accounts.visaId,
          balance_date: balances.visa.date,
          balance: balances.visa.amount,
          source: 'import',
          note: 'Solde Visa saisi à l\'import',
          created_by: userId,
        })
      }
      const { error } = await admin.from('treso_balance_snapshots').upsert(rows, {
        onConflict: 'account_id,balance_date,source',
      })
      if (error) throw error
    },
    async insertNewTransactions(rows) {
      const hashes = rows.map((row) => row.dedup_hash)
      const existing = new Set()
      for (const part of chunk(hashes, 150)) {
        const { data, error } = await admin.from('treso_bank_transactions').select('dedup_hash').in('dedup_hash', part)
        if (error) throw error
        for (const row of data || []) existing.add(row.dedup_hash)
      }
      const fresh = rows.filter((row) => !existing.has(row.dedup_hash))
      for (const part of chunk(fresh, 200)) {
        const { error } = await admin.from('treso_bank_transactions').insert(part)
        if (error) throw error
      }
      return fresh.map((row) => row.dedup_hash)
    },
    async findBillsByHashes(hashes) {
      const found = []
      for (const part of chunk(hashes, 150)) {
        const { data, error } = await admin.from('treso_supplier_bills')
          .select('id, row_hash, is_paid, due_date, due_date_source')
          .in('row_hash', part)
        if (error) throw error
        found.push(...(data || []))
      }
      return found
    },
    async insertBills(rows) {
      for (const part of chunk(rows, 200)) {
        const { error } = await admin.from('treso_supplier_bills').insert(part)
        if (error) throw error
      }
    },
    async markBillPaid(id) {
      const { error } = await admin.from('treso_supplier_bills').update({ is_paid: true }).eq('id', id)
      if (error) throw error
    },
    async updateBillDue(id, dueDate, source) {
      const { error } = await admin.from('treso_supplier_bills').update({
        due_date: dueDate,
        due_date_source: source,
      }).eq('id', id)
      if (error) throw error
    },
    async insertBatch(row) {
      const { data, error } = await admin.from('treso_import_batches').insert(row).select('id').single()
      if (error) throw error
      return data
    },
    async attachBatch(hashes, batchId) {
      for (const part of chunk(hashes, 150)) {
        const { error } = await admin.from('treso_bank_transactions').update({ import_batch_id: batchId }).in('dedup_hash', part)
        if (error) throw error
      }
    },
    async getInvoiceCursor() {
      const { data, error } = await admin.from('treso_settings').select('hubspot_invoices_synced_through').eq('id', 1).maybeSingle()
      if (error) throw error
      return data?.hubspot_invoices_synced_through || null
    },
    async setInvoiceCursor(value) {
      const { error } = await admin.from('treso_settings').update({ hubspot_invoices_synced_through: value }).eq('id', 1)
      if (error) throw error
    },
    async upsertInvoices(rows, { userId } = {}) {
      let inserted = 0
      let updated = 0
      for (const part of chunk(rows, 100)) {
        const ids = part.map((row) => row.hubspot_invoice_id)
        const { data, error } = await admin.from('treso_client_invoices').select('hubspot_invoice_id').in('hubspot_invoice_id', ids)
        if (error) throw error
        const existing = new Set((data || []).map((row) => row.hubspot_invoice_id))
        const fresh = []
        const known = []
        for (const row of part) {
          if (existing.has(row.hubspot_invoice_id)) known.push(row)
          else fresh.push(userId ? { ...row, created_by: userId } : row)
        }
        if (fresh.length) {
          const { error: insertError } = await admin.from('treso_client_invoices').insert(fresh)
          if (insertError) throw insertError
          inserted += fresh.length
        }
        for (const row of known) {
          const { hubspot_invoice_id, ...patch } = row
          const { error: updateError } = await admin.from('treso_client_invoices').update(patch).eq('hubspot_invoice_id', hubspot_invoice_id)
          if (updateError) throw updateError
          updated += 1
        }
      }
      return { inserted, updated }
    },
    async listClientInvoiceNumbers() {
      return selectAll(admin, 'treso_client_invoices', 'id, invoice_number')
    },
    async updateAccountableStatuses(updates) {
      for (const update of updates) {
        const { error } = await admin.from('treso_client_invoices').update({
          accountable_status: update.accountable_status,
          accountable_synced_at: update.accountable_synced_at,
        }).eq('id', update.id)
        if (error) throw error
      }
    },
    async loadMatchState() {
      const accounts = await this.ensureAccounts()
      const transactions = await selectAll(admin, 'treso_bank_transactions', 'id, account_id, booking_date, amount, counterparty_name, communication, match_status, match_method, client_invoice_id, is_internal_transfer, excluded_from_cash', (query) => query.gt('amount', 0))
      const invoices = await selectAll(admin, 'treso_client_invoices', 'id, invoice_number, client_name, invoice_date, amount_ttc, hubspot_invoice_id, excluded_from_cash, bank_paid_amount, paid_at')
      return { transactions, invoices, belfiusAccountId: accounts.belfiusId }
    },
    async applyMatchPlan(plan) {
      for (const update of plan.transactionUpdates) {
        const { error } = await admin.from('treso_bank_transactions').update({
          client_invoice_id: update.client_invoice_id,
          match_status: update.match_status,
          match_method: update.match_method,
        }).eq('id', update.id)
        if (error) throw error
      }
      for (const update of plan.invoiceUpdates) {
        const { error } = await admin.from('treso_client_invoices').update({
          bank_paid_amount: update.bank_paid_amount,
          paid_at: update.paid_at,
        }).eq('id', update.id)
        if (error) throw error
        if (!update.hubspot_invoice_id) continue
        const project = admin.from('project_invoices').update({ status: update.paid ? 'paid' : 'open' }).eq('hubspot_invoice_id', update.hubspot_invoice_id)
        const { error: projectError } = update.paid ? await project : await project.eq('status', 'paid')
        if (projectError) throw projectError
      }
    },
  }
}

async function selectAll(admin, table, columns, refine) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let query = admin.from(table).select(columns).range(from, from + pageSize - 1)
    if (refine) query = refine(query)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}
