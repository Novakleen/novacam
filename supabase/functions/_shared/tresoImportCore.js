/**
 * HTTP + persistence for the Accountable import.
 * The database is injected so node tests can use an in-memory port.
 */
import { parseAccountableXlsx, parseIsoDate, sha256Hex } from './tresoAccountable.js'

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
        created_by: userId,
      })
      continue
    }
    billsDuplicate += 1
    if (bill.isPaid && !found.is_paid) {
      await db.markBillPaid(found.id)
      billsMarkedPaid += 1
    }
    const locked = found.due_date_source === 'manuel' || found.due_date_source === 'pdf'
    if (!locked && bill.dueDateSource === 'export' && (found.due_date_source !== 'export' || found.due_date !== bill.dueDate)) {
      await db.updateBillDue(found.id, bill.dueDate, 'export')
    }
  }
  if (toInsert.length) {
    await db.insertBills(toInsert)
    billsInserted = toInsert.length
  }

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
  }
}
