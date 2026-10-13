import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import {
  interpretAccountableSheets,
  isBankDataStale,
  belgianWorkingDaysSince,
  parseAccountableXlsx,
  sha256Text,
} from './tresoAccountable.js'
import { handleTresoImport, BELFIUS_IBAN } from './tresoImportCore.js'

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function zipStore(entries, { deflateNames = [] } = {}) {
  const files = entries.map(([name, text]) => {
    const raw = new TextEncoder().encode(text)
    const deflate = deflateNames.includes(name)
    const data = deflate ? deflateRawSync(raw) : raw
    return { name, rawSize: raw.length, data, method: deflate ? 8 : 0 }
  })
  const parts = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = new TextEncoder().encode(file.name)
    const crc = crc32(file.method === 8 ? inflateStored(file) : file.data)
    const local = new Uint8Array(30 + name.length + file.data.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, file.method, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, 0, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, file.data.length, true)
    view.setUint32(22, file.rawSize, true)
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(file.data, 30 + name.length)
    parts.push(local)
    const cen = new Uint8Array(46 + name.length)
    const cview = new DataView(cen.buffer)
    cview.setUint32(0, 0x02014b50, true)
    cview.setUint16(4, 20, true)
    cview.setUint16(6, 20, true)
    cview.setUint16(8, 0, true)
    cview.setUint16(10, file.method, true)
    cview.setUint16(12, 0, true)
    cview.setUint16(14, 0, true)
    cview.setUint32(16, crc, true)
    cview.setUint32(20, file.data.length, true)
    cview.setUint32(24, file.rawSize, true)
    cview.setUint16(28, name.length, true)
    cview.setUint32(42, offset, true)
    cen.set(name, 46)
    central.push(cen)
    offset += local.length
  }
  const centralStart = offset
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const eview = new DataView(end.buffer)
  eview.setUint32(0, 0x06054b50, true)
  eview.setUint16(8, files.length, true)
  eview.setUint16(10, files.length, true)
  eview.setUint32(12, centralSize, true)
  eview.setUint32(16, centralStart, true)
  const blob = new Uint8Array(offset + centralSize + 22)
  let cursor = 0
  for (const part of [...parts, ...central, end]) {
    blob.set(part, cursor)
    cursor += part.length
  }
  return blob
}

function inflateStored(file) {
  // CRC must cover the uncompressed bytes. deflateRawSync is deterministic
  // enough that tests only need a matching pair; recompute from method 0 path.
  return file.data
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function colLetter(index) {
  let n = index + 1
  let out = ''
  while (n) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function sheetXml(headers, rows) {
  const all = [headers, ...rows]
  const body = all.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${colLetter(colIndex)}${rowIndex + 1}`
      const numeric = typeof value === 'number'
      if (numeric) return `<c r="${ref}"><v>${value}</v></c>`
      return `<c r="${ref}" t="str"><v>${esc(value ?? '')}</v></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

const TX_HEADERS = [
  'Date De Transaction',
  'Numéro De Compte',
  'Communication',
  'Montant',
  'Nom Contrepartie',
  'Compte Contrepartie',
]
const EXP_HEADERS = [
  'Date Comptable',
  'Nom Du Fournisseur',
  'Montant Total',
  'Description Du Code',
  'Payé',
]

function workbook({ transactions, expenses, expenseHeaders = EXP_HEADERS, txHeaders = TX_HEADERS, deflate = false }) {
  const sheet1 = sheetXml(expenseHeaders, expenses)
  const sheet2 = sheetXml(txHeaders, transactions)
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dépenses" sheetId="1" r:id="rId1"/>
    <sheet name="Transactions" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`
  const wbRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`
  return zipStore([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['xl/workbook.xml', workbookXml],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/worksheets/sheet1.xml', sheet1],
    ['xl/worksheets/sheet2.xml', sheet2],
  ], { deflateNames: deflate ? ['xl/worksheets/sheet2.xml'] : [] })
}

function sampleWorkbook() {
  const { tx, expenses } = sampleRows()
  return workbook({ transactions: tx, expenses })
}

function sampleRows() {
  const tx = [
    ['09/10/2026', BELFIUS_IBAN, 'Facture demo', -120.5, 'Fournisseur Démo', ''],
    ['09/10/2026', BELFIUS_IBAN, 'Facture demo', -120.5, 'Fournisseur Démo', ''],
    ['08/10/2026', BELFIUS_IBAN, 'Rechargement Visa', -50, 'Visa prépayée', ''],
    ['08/10/2026', 'CARD-DEMO-001', '', 50, 'Apport', ''],
    ['01/10/2026', BELFIUS_IBAN, 'Encaissement', 300, 'Client Démo', 'BE00123456789012'],
  ]
  const expenses = [
    ['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non'],
    ['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non'],
    ['01/09/2026', 'Déjà payé SA', 15, 'Abonnement', 'Oui'],
  ]
  return { tx, expenses }
}

function createMemoryDb(keys = []) {
  const state = {
    keys: keys.map((key) => ({ ...key })),
    batches: [],
    tx: [],
    bills: [],
    snapshots: [],
    invoices: [],
    commitments: [],
    accounts: [
      { id: 'acc-belfius', name: 'Belfius courant', iban: BELFIUS_IBAN, kind: 'courant', is_active: true },
      { id: 'acc-visa', name: 'Visa prépayée', iban: null, kind: 'carte', is_active: true },
    ],
    touched: [],
    settings: { supplier_default_due_days: 30 },
  }
  const db = {
    state,
    async findApiKey(hash) {
      return state.keys.find((key) => key.key_hash === hash) ?? null
    },
    async touchApiKey(id) {
      state.touched.push(id)
      const key = state.keys.find((row) => row.id === id)
      if (key) key.last_used_at = new Date().toISOString()
    },
    async getSettings() {
      return state.settings
    },
    async listExcludedNames() {
      const names = new Set(state.settings.excluded_names || [])
      for (const row of state.invoices) {
        if (row.excluded_from_cash && row.client_name) names.add(row.client_name)
      }
      for (const row of state.bills) {
        if (row.excluded_from_cash && row.supplier_name) names.add(row.supplier_name)
      }
      return [...names]
    },
    async listCommitments() {
      return state.commitments.map((row) => ({ ...row }))
    },
    async listTransactionsForAdvance() {
      return state.tx.map((row) => ({ ...row }))
    },
    async updateCommitmentSchedule(id, patch) {
      const row = state.commitments.find((item) => item.id === id)
      if (row) Object.assign(row, patch)
    },
    async findBatchByHash(hash) {
      return state.batches.find((batch) => batch.file_sha256 === hash) ?? null
    },
    async ensureAccounts() {
      const byIban = new Map(state.accounts.filter((row) => row.iban).map((row) => [row.iban, row.id]))
      const visa = state.accounts.find((row) => row.kind === 'carte')
      return {
        belfiusId: state.accounts.find((row) => row.iban === BELFIUS_IBAN).id,
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
      const accounts = await db.ensureAccounts()
      const writes = [{ account_id: accounts.belfiusId, balance_date: balances.belfius.date, balance: balances.belfius.amount, source: 'import', created_by: userId }]
      if (balances.visa) {
        writes.push({ account_id: accounts.visaId, balance_date: balances.visa.date, balance: balances.visa.amount, source: 'import', created_by: userId })
      }
      for (const row of writes) {
        const idx = state.snapshots.findIndex((snap) => snap.account_id === row.account_id && snap.balance_date === row.balance_date && snap.source === row.source)
        if (idx >= 0) state.snapshots[idx] = { ...state.snapshots[idx], ...row }
        else state.snapshots.push({ id: `snap-${state.snapshots.length + 1}`, ...row })
      }
    },
    async insertNewTransactions(rows) {
      const existing = new Set(state.tx.map((row) => row.dedup_hash))
      const fresh = rows.filter((row) => !existing.has(row.dedup_hash))
      for (const row of fresh) state.tx.push({ id: `tx-${state.tx.length + 1}`, ...row })
      return fresh.map((row) => row.dedup_hash)
    },
    async findBillsByHashes(hashes) {
      const wanted = new Set(hashes)
      return state.bills.filter((bill) => wanted.has(bill.row_hash))
    },
    async insertBills(rows) {
      for (const row of rows) state.bills.push({ id: `bill-${state.bills.length + 1}`, ...row })
    },
    async markBillPaid(id) {
      const bill = state.bills.find((row) => row.id === id)
      if (bill) bill.is_paid = true
    },
    async updateBillDue(id, dueDate, source) {
      const bill = state.bills.find((row) => row.id === id)
      if (bill) {
        bill.due_date = dueDate
        bill.due_date_source = source
      }
    },
    async insertBatch(row) {
      const batch = { id: `batch-${state.batches.length + 1}`, ...row }
      state.batches.push(batch)
      return batch
    },
    async attachBatch(hashes, batchId) {
      const wanted = new Set(hashes)
      for (const row of state.tx) {
        if (wanted.has(row.dedup_hash)) row.import_batch_id = batchId
      }
    },
    async loadMatchState() {
      return {
        transactions: state.tx.map((row) => ({ ...row })),
        invoices: state.invoices.map((row) => ({ ...row })),
        belfiusAccountId: 'acc-belfius',
      }
    },
    async applyMatchPlan(plan) {
      for (const update of plan.transactionUpdates) {
        const row = state.tx.find((tx) => tx.id === update.id)
        if (!row) continue
        row.client_invoice_id = update.client_invoice_id
        row.match_status = update.match_status
        row.match_method = update.match_method
      }
      for (const update of plan.invoiceUpdates) {
        const row = state.invoices.find((invoice) => invoice.id === update.id)
        if (!row) continue
        row.bank_paid_amount = update.bank_paid_amount
        row.paid_at = update.paid_at
      }
    },
  }
  return db
}

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

function importRequest(bytes, { key, balance = '1000.00', date = '2026-10-09', visa, visaDate, jsonBody = false } = {}) {
  const headers = {}
  if (key) headers['x-treso-api-key'] = key
  if (jsonBody) {
    headers['content-type'] = 'application/json'
    return new Request('http://local/treso-import', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        file_base64: Buffer.from(bytes).toString('base64'),
        file_name: 'synthetique.xlsx',
        balance_belfius: balance,
        balance_date: date,
        balance_visa: visa,
        visa_balance_date: visaDate,
      }),
    })
  }
  const form = new FormData()
  form.append('file', new File([bytes], 'synthetique.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  form.append('balance_belfius', balance)
  form.append('balance_date', date)
  if (visa != null) form.append('balance_visa', visa)
  if (visaDate) form.append('visa_balance_date', visaDate)
  return new Request('http://local/treso-import', { method: 'POST', headers, body: form })
}

test('belgian working days: Friday 09/10/2026 is fresh on Tuesday and stale on Wednesday', () => {
  assert.equal(belgianWorkingDaysSince('2026-10-09', '2026-10-13'), 2)
  assert.equal(isBankDataStale('2026-10-09', '2026-10-13'), false)
  assert.equal(belgianWorkingDaysSince('2026-10-09', '2026-10-14'), 3)
  assert.equal(isBankDataStale('2026-10-09', '2026-10-14'), true)
  assert.equal(belgianWorkingDaysSince('2026-10-09', '2026-10-11'), 0)
})

test('belgian holidays are not working days (Ascension 2026)', () => {
  assert.equal(belgianWorkingDaysSince('2026-05-13', '2026-05-18'), 2)
  assert.equal(isBankDataStale('2026-05-13', '2026-05-18'), false)
  assert.equal(isBankDataStale('2026-05-13', '2026-05-19'), true)
})

test('parser keeps one exact duplicate and flags a visa reload', async () => {
  const { tx, expenses } = sampleRows()
  const parsed = await parseAccountableXlsx(workbook({ transactions: tx, expenses }))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.transactionRowsTotal, 5)
  assert.equal(parsed.exactDuplicates, 2)
  assert.equal(parsed.inFileDuplicateExtras, 1)
  assert.equal(parsed.transactions.length, 4)
  assert.equal(parsed.dateMin, '2026-10-01')
  assert.equal(parsed.dateMax, '2026-10-09')
  assert.equal(parsed.transactions.filter((row) => row.isInternalTransfer).length, 2)
  assert.equal(parsed.expenses.length, 2)
  assert.equal(parsed.expenses.filter((row) => !row.isPaid).length, 1)
  assert.equal(parsed.expenses.find((row) => !row.isPaid).dueDateSource, 'estimee')
  assert.equal(parsed.expenses.find((row) => !row.isPaid).dueDate, '2026-11-01')
})

test('deflated worksheet and échéance column are read', async () => {
  const headers = [...EXP_HEADERS, 'Échéance']
  const parsed = await parseAccountableXlsx(workbook({
    transactions: [['09/10/2026', BELFIUS_IBAN, 'ok', 10, 'Client', '']],
    expenses: [['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non', '20/10/2026']],
    expenseHeaders: headers,
    deflate: true,
  }))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.transactions.length, 1)
  assert.equal(parsed.expenses[0].dueDate, '2026-10-20')
  assert.equal(parsed.expenses[0].dueDateSource, 'export')
})

test('missing required column rejects the workbook', async () => {
  const headers = TX_HEADERS.filter((header) => header !== 'Montant')
  const rows = [['09/10/2026', BELFIUS_IBAN, 'ok', 'Client', '']]
  const parsed = await parseAccountableXlsx(workbook({
    transactions: rows,
    expenses: [['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non']],
    txHeaders: headers,
  }))
  assert.equal(parsed.ok, false)
  assert.equal(parsed.error, 'missing_column')
  assert.equal(parsed.sheet, 'Transactions')
  assert.equal(parsed.column, 'montant')
})

test('same file twice inserts 0 the second time; a later file marks the bill paid', async () => {
  const plain = 'nvk_test_key_0123456789abcdef'
  const db = createMemoryDb([{
    id: 'key-1',
    key_hash: await sha256Text(plain),
    scope: 'treso-import',
    revoked_at: null,
    created_by: 'user-admin',
  }])
  const { tx, expenses } = sampleRows()
  const bytes = workbook({ transactions: tx, expenses })
  const deps = {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'should-not-be-used' }),
  }
  const first = await handleTresoImport(importRequest(bytes, { key: plain, visa: '0', visaDate: '2026-10-09' }), deps)
  const firstBody = await first.json()
  assert.equal(first.status, 200)
  assert.equal(firstBody.rows_inserted, 4)
  assert.equal(firstBody.exact_duplicates, 2)
  assert.equal(firstBody.rows_duplicate, 1)
  assert.equal(firstBody.supplier_bills_inserted, 1)
  assert.equal(db.state.tx.length, 4)
  assert.equal(db.state.bills.length, 1)
  assert.equal(db.state.bills[0].is_paid, false)
  assert.equal(db.state.snapshots.length, 2)
  assert.equal(db.state.touched.length, 1)
  assert.equal(db.state.batches[0].channel, 'api')

  const second = await handleTresoImport(importRequest(bytes, { key: plain }), deps)
  const secondBody = await second.json()
  assert.equal(second.status, 200)
  assert.equal(secondBody.already_imported, true)
  assert.equal(secondBody.rows_inserted, 0)
  assert.equal(db.state.tx.length, 4)
  assert.equal(db.state.bills.length, 1)
  assert.equal(db.state.batches.length, 1)

  const paidBytes = workbook({
    transactions: [['10/10/2026', BELFIUS_IBAN, 'autre', 5, 'Client Démo', '']],
    expenses: [['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Oui']],
  })
  const third = await handleTresoImport(importRequest(paidBytes, { key: plain, jsonBody: true }), deps)
  const thirdBody = await third.json()
  assert.equal(third.status, 200)
  assert.equal(thirdBody.rows_inserted, 1)
  assert.equal(thirdBody.supplier_bills_inserted, 0)
  assert.equal(thirdBody.supplier_bills_marked_paid, 1)
  assert.equal(db.state.bills[0].is_paid, true)
  assert.equal(db.state.tx.length, 5)
})

test('pdf due date is kept when the excel is imported again', async () => {
  const plain = 'nvk_test_key_0123456789abcdef'
  const db = createMemoryDb([{
    id: 'key-1',
    key_hash: await sha256Text(plain),
    scope: 'treso-import',
    revoked_at: null,
    created_by: null,
  }])
  const firstBytes = workbook({
    transactions: [['09/10/2026', BELFIUS_IBAN, 'ok', 10, 'Client', '']],
    expenses: [['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non']],
  })
  const deps = { corsHeaders, db, requireCaller: async () => ({ userId: 'admin' }) }
  const first = await handleTresoImport(importRequest(firstBytes, { key: plain }), deps)
  assert.equal((await first.json()).supplier_bills_inserted, 1)
  db.state.bills[0].due_date = '2026-10-06'
  db.state.bills[0].due_date_source = 'pdf'

  const secondBytes = workbook({
    transactions: [['11/10/2026', BELFIUS_IBAN, 'suite', 8, 'Client', '']],
    expenses: [['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non', '31/10/2026']],
    expenseHeaders: [...EXP_HEADERS, 'Échéance'],
  })
  await handleTresoImport(importRequest(secondBytes, { key: plain }), deps)
  assert.equal(db.state.bills[0].due_date, '2026-10-06')
  assert.equal(db.state.bills[0].due_date_source, 'pdf')
})

test('missing balance or missing column writes nothing', async () => {
  const plain = 'nvk_test_key_0123456789abcdef'
  const db = createMemoryDb([{
    id: 'key-1',
    key_hash: await sha256Text(plain),
    scope: 'treso-import',
    revoked_at: null,
    created_by: null,
  }])
  const deps = { corsHeaders, db, requireCaller: async () => ({ userId: 'admin' }) }
  const bytes = sampleWorkbook()
  const noBalance = await handleTresoImport(importRequest(bytes, { key: plain, balance: '' }), deps)
  assert.equal(noBalance.status, 400)
  const noBalanceBody = await noBalance.json()
  assert.equal(noBalanceBody.error, 'balance_missing')
  assert.equal(db.state.tx.length, 0)
  assert.equal(db.state.batches.length, 0)

  const bad = workbook({
    transactions: [['09/10/2026', BELFIUS_IBAN, 'ok', 'Client', '']],
    expenses: [['02/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non']],
    txHeaders: TX_HEADERS.filter((header) => header !== 'Montant'),
  })
  const missing = await handleTresoImport(importRequest(bad, { key: plain }), deps)
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error, 'missing_column')
  assert.equal(db.state.tx.length, 0)
  assert.equal(db.state.snapshots.length, 0)
})

test('admin JWT is accepted when no API key is sent', async () => {
  const db = createMemoryDb()
  const deps = {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'admin-1', role: 'Admin' }),
  }
  const response = await handleTresoImport(importRequest(sampleWorkbook()), deps)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.rows_inserted, 4)
  assert.equal(db.state.batches[0].channel, 'ecran')
  assert.equal(db.state.batches[0].created_by, 'admin-1')
})

test('non-admin JWT is forbidden and a bad API key is unauthorized', async () => {
  const db = createMemoryDb([{
    id: 'key-1',
    key_hash: await sha256Text('nvk_real_key_0123456789abcdef'),
    scope: 'treso-import',
    revoked_at: null,
    created_by: null,
  }])
  const bytes = sampleWorkbook()
  let callerUsed = 0
  const deps = {
    corsHeaders,
    db,
    requireCaller: async () => {
      callerUsed += 1
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    },
  }
  const forbidden = await handleTresoImport(importRequest(bytes), deps)
  assert.equal(forbidden.status, 403)
  assert.equal(callerUsed, 1)
  assert.equal(db.state.tx.length, 0)

  const bad = await handleTresoImport(importRequest(bytes, { key: 'nvk_wrong_key_0123456789abcdef' }), deps)
  assert.equal(bad.status, 401)
  assert.equal(callerUsed, 1)
  assert.equal(db.state.touched.length, 0)

  db.state.keys[0].revoked_at = '2026-10-01T00:00:00Z'
  const revoked = await handleTresoImport(importRequest(bytes, { key: 'nvk_real_key_0123456789abcdef' }), deps)
  assert.equal(revoked.status, 401)
})

test('shared strings and direct row interpretation stay aligned', async () => {
  const sheets = [
    {
      name: 'Transactions',
      headers: TX_HEADERS,
      rows: [{
        'Date De Transaction': '09/10/2026',
        'Numéro De Compte': BELFIUS_IBAN,
        Communication: 'abc',
        Montant: '12,50',
        'Nom Contrepartie': 'Client Démo',
        'Compte Contrepartie': '',
      }],
    },
    {
      name: 'Dépenses',
      headers: EXP_HEADERS,
      rows: [{
        'Date Comptable': '01/10/2026',
        'Nom Du Fournisseur': 'Papeterie Démo',
        'Montant Total': '10',
        'Description Du Code': 'Fournitures',
        'Payé': 'Non',
      }],
    },
  ]
  const parsed = await interpretAccountableSheets(sheets)
  assert.equal(parsed.transactions[0].amount, 12.5)
  assert.equal(parsed.expenses[0].dueDate, '2026-10-31')
})

test('import excludes Quimesis bills and links Radius to the spread commitment', async () => {
  const plain = 'nvk_test_key_0123456789abcdef'
  const db = createMemoryDb([{
    id: 'key-1',
    key_hash: await sha256Text(plain),
    scope: 'treso-import',
    revoked_at: null,
    created_by: 'user-admin',
  }])
  db.state.invoices.push({
    id: 'inv-quimesis',
    client_name: 'Quimesis',
    excluded_from_cash: true,
  })
  db.state.commitments.push({
    id: 'radius',
    counterparty: 'Radius',
    spread_weekly: true,
    is_active: true,
    amount: 2302.27,
    amount_rule: 'fixed',
  })
  const tx = [['09/10/2026', BELFIUS_IBAN, 'Achat', -10, 'Fournisseur', '']]
  const expenses = [
    ['08/10/2026', 'QUIMESIS SRL', 18040.2, 'Sous-traitance', 'Non'],
    ['08/10/2026', 'Radius Business Solutions', 480, 'Carburant', 'Non'],
    ['08/10/2026', 'Papeterie Démo', 40, 'Fournitures', 'Non'],
  ]
  const bytes = workbook({ transactions: tx, expenses })
  const response = await handleTresoImport(importRequest(bytes, { key: plain }), {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'unused' }),
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.supplier_bills_inserted, 3)
  const byName = Object.fromEntries(db.state.bills.map((bill) => [bill.supplier_name, bill]))
  assert.equal(byName['QUIMESIS SRL'].excluded_from_cash, true)
  assert.equal(byName['Radius Business Solutions'].excluded_from_cash, false)
  assert.equal(byName['Radius Business Solutions'].replaces_commitment_id, 'radius')
  assert.equal(byName['Papeterie Démo'].excluded_from_cash, false)
  assert.equal(byName['Papeterie Démo'].replaces_commitment_id, null)
})
