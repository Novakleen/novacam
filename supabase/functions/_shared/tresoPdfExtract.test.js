import test from 'node:test'
import assert from 'node:assert/strict'
import { supplierDueDateLocked } from './tresoImportCore.js'
import { buildSimplePdf, extractSimplePdfText } from './tresoPdfText.js'
import {
  callInvoiceAi,
  decideSupplierPdf,
  handleTresoPdfExtract,
  needsInvoiceAi,
  parseInvoiceText,
  proposeDueDate,
  resolvePdfAiProvider,
} from './tresoPdfExtract.js'

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

const BURGHART = [
  'Fournisseur: Bastien Burghart',
  'Facture n°: BH-2026-091',
  'Date de facture: 30/09/2026',
  'Montant TTC: 808,90',
  'Conditions: 30 jours fin de mois',
].join('\n')

const DAYS = [
  'Fournisseur: Atelier Nord',
  'Facture n°: AN-15',
  'Date de facture: 02/10/2026',
  'Total TTC: 120,00',
  'Conditions de paiement: 15 jours',
].join('\n')

const NO_DATE = [
  'Fournisseur: Papeterie Demo',
  'Facture n°: P-1',
  'Date de facture: 02/10/2026',
  'Montant TTC: 40,00',
].join('\n')

const MISMATCH = [
  'Fournisseur: Bastien Burghart',
  'Facture n°: BH-2026-091',
  'Date de facture: 30/09/2026',
  'Echeance: 31/10/2026',
  'Montant TTC: 900,00',
].join('\n')

function bill(patch) {
  return {
    id: 'bill-1',
    supplier_name: 'Papeterie Demo',
    invoice_number: null,
    invoice_date: '2026-10-02',
    amount_ttc: 40,
    due_date: '2026-11-01',
    due_date_source: 'estimee',
    is_paid: false,
    ...patch,
  }
}

function memoryDb(bills) {
  const state = { bills: bills.map((row) => ({ ...row })), reviews: [] }
  return {
    state,
    async getSettings() {
      return { supplier_default_due_days: 30 }
    },
    async listOpenBills() {
      return state.bills.filter((row) => !row.is_paid)
    },
    async updateBill(id, patch) {
      const row = state.bills.find((item) => item.id === id)
      if (!row) throw new Error(`missing ${id}`)
      Object.assign(row, patch)
    },
    async insertReview(row) {
      state.reviews.push({ id: `rev-${state.reviews.length + 1}`, ...row })
    },
  }
}

function request(paths) {
  return new Request('https://example.test/treso-pdf-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
}

test('fin de mois is the last day of the month of invoice date plus X days', () => {
  const parsed = parseInvoiceText(BURGHART)
  assert.equal(parsed.invoiceDate, '2026-09-30')
  assert.equal(parsed.paymentTerms, '30 jours fin de mois')
  assert.equal(parsed.amountTtc, 808.9)
  const due = proposeDueDate(parsed, 30)
  assert.equal(due.dueDate, '2026-10-31')
  assert.equal(due.source, 'pdf')
  const january = proposeDueDate({ invoiceDate: '2026-01-31', paymentTerms: '30 jours fin de mois' }, 30)
  assert.equal(january.dueDate, '2026-03-31')
})

test('X jours is invoice date plus X days', () => {
  const parsed = parseInvoiceText(DAYS)
  const due = proposeDueDate(parsed, 30)
  assert.equal(due.dueDate, '2026-10-17')
  assert.equal(due.source, 'pdf')
  const decision = decideSupplierPdf({
    extraction: parsed,
    bills: [bill({
      id: 'nord',
      supplier_name: 'Atelier Nord',
      invoice_number: 'AN-15',
      amount_ttc: 120,
      due_date: '2026-11-01',
      due_date_source: 'estimee',
    })],
  })
  assert.equal(decision.action, 'apply')
  assert.equal(decision.proposal.dueDate, '2026-10-17')
})

test('missing due date becomes invoice date plus 30, source estimee', () => {
  const parsed = parseInvoiceText(NO_DATE)
  assert.equal(parsed.dueDate, null)
  assert.equal(parsed.paymentTerms, null)
  assert.ok(parsed.confidence >= 0.75)
  const decision = decideSupplierPdf({
    extraction: parsed,
    bills: [bill({ supplier_name: 'Papeterie Demo', amount_ttc: 40, due_date_source: 'estimee' })],
  })
  assert.equal(decision.action, 'apply')
  assert.equal(decision.proposal.source, 'estimee')
  assert.equal(decision.proposal.dueDate, '2026-11-01')
})

test('amount mismatch is queued and does not change the bill', async () => {
  const parsed = parseInvoiceText(MISMATCH)
  const rows = [bill({
    id: 'burghart',
    supplier_name: 'Bastien Burghart',
    invoice_number: 'BH-2026-091',
    amount_ttc: 808.9,
    due_date: '2026-11-01',
    due_date_source: 'estimee',
  })]
  const decision = decideSupplierPdf({ extraction: parsed, bills: rows })
  assert.equal(decision.action, 'queue')
  assert.equal(decision.reason, 'amount_mismatch')
  const db = memoryDb(rows)
  const deps = {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'admin-1', role: 'Admin' }),
    download: async () => new TextEncoder().encode('unused'),
    extractText: async () => MISMATCH,
    callAi: async () => {
      throw new Error('ai should not run on a confident text invoice')
    },
  }
  const response = await handleTresoPdfExtract(request(['admin/burghart.pdf']), deps)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.queued, 1)
  assert.equal(body.applied, 0)
  assert.equal(db.state.bills[0].due_date, '2026-11-01')
  assert.equal(db.state.bills[0].due_date_source, 'estimee')
  assert.equal(db.state.reviews[0].reason, 'amount_mismatch')
  assert.equal(db.state.reviews[0].proposed_due_date, '2026-10-31')
})

test('excel re-import keeps a pdf or manual due date', () => {
  assert.equal(supplierDueDateLocked('pdf'), true)
  assert.equal(supplierDueDateLocked('manuel'), true)
  assert.equal(supplierDueDateLocked('export'), false)
  assert.equal(supplierDueDateLocked('estimee'), false)
  const locked = decideSupplierPdf({
    extraction: parseInvoiceText(BURGHART),
    bills: [bill({
      supplier_name: 'Bastien Burghart',
      invoice_number: 'BH-2026-091',
      amount_ttc: 808.9,
      due_date: '2026-10-15',
      due_date_source: 'manuel',
    })],
  })
  assert.equal(locked.action, 'keep')
  assert.equal(locked.bill.due_date, '2026-10-15')
})

test('synthetic pdf text round-trips into due dates', async () => {
  const samples = [
    {
      name: 'burghart.pdf',
      lines: BURGHART.split('\n'),
      bill: bill({
        id: 'burghart',
        supplier_name: 'Bastien Burghart',
        invoice_number: 'BH2026091',
        amount_ttc: 808.9,
        due_date_source: 'export',
        due_date: '2026-10-30',
      }),
      due: '2026-10-31',
      source: 'pdf',
    },
    {
      name: 'atelier.pdf',
      lines: DAYS.split('\n'),
      bill: bill({
        id: 'nord',
        supplier_name: 'Atelier Nord SPRL',
        invoice_number: null,
        amount_ttc: 120,
        due_date_source: 'estimee',
        due_date: '2026-11-01',
      }),
      due: '2026-10-17',
      source: 'pdf',
    },
    {
      name: 'papeterie.pdf',
      lines: NO_DATE.split('\n'),
      bill: bill({
        id: 'paper',
        supplier_name: 'Papeterie Demo',
        amount_ttc: 40.02,
        due_date_source: 'estimee',
        due_date: '2026-10-02',
      }),
      due: '2026-11-01',
      source: 'estimee',
    },
  ]
  const db = memoryDb(samples.map((sample) => sample.bill))
  const texts = new Map(samples.map((sample) => [sample.name, sample.lines.join('\n')]))
  for (const sample of samples) {
    const bytes = buildSimplePdf(sample.lines)
    const text = extractSimplePdfText(bytes)
    assert.equal(text, texts.get(sample.name))
    assert.equal(needsInvoiceAi(text, parseInvoiceText(text)), false)
  }
  const response = await handleTresoPdfExtract(request(samples.map((sample) => `admin/${sample.name}`)), {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'admin-1', role: 'Admin' }),
    download: async (path) => buildSimplePdf(texts.get(path.split('/').pop()).split('\n')),
    extractText: async (bytes) => extractSimplePdfText(bytes),
    callAi: async () => {
      throw new Error('rich text must not call the model')
    },
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.applied, 3)
  assert.equal(body.queued, 0)
  for (const sample of samples) {
    const row = db.state.bills.find((item) => item.id === sample.bill.id)
    assert.equal(row.due_date, sample.due)
    assert.equal(row.due_date_source, sample.source)
    assert.equal(row.pdf_path, `admin/${sample.name}`)
  }
})

test('non-admin receives 403 and nothing is read', async () => {
  let downloads = 0
  const response = await handleTresoPdfExtract(request(['admin/a.pdf']), {
    corsHeaders,
    db: memoryDb([]),
    requireCaller: async () => new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
    download: async () => {
      downloads += 1
      return new Uint8Array()
    },
    extractText: async () => '',
  })
  assert.equal(response.status, 403)
  assert.equal(downloads, 0)
})

test('missing AI secret fails open and a low-text scan is queued', async () => {
  assert.equal(resolvePdfAiProvider({}), null)
  assert.equal(resolvePdfAiProvider({ ANTHROPIC_API_KEY: 'sk-ant' }).provider, 'anthropic')
  assert.equal(resolvePdfAiProvider({ OPENAI_API_KEY: 'sk-o', ANTHROPIC_API_KEY: 'sk-ant' }).provider, 'openai')
  const silent = await callInvoiceAi({ text: '', env: {}, fetchImpl: async () => {
    throw new Error('network')
  } })
  assert.equal(silent.ok, false)
  assert.equal(silent.reason, 'no_api_key')

  const db = memoryDb([bill({
    id: 'scan',
    supplier_name: 'Deckers',
    invoice_number: 'DK-100',
    amount_ttc: 428.85,
    due_date: '2026-11-05',
    due_date_source: 'estimee',
  })])
  const response = await handleTresoPdfExtract(request(['admin/scan.pdf']), {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'admin-1', role: 'Admin' }),
    download: async () => new Uint8Array([1, 2, 3, 4]),
    extractText: async () => '   ',
    callAi: (args) => callInvoiceAi({ ...args, env: {} }),
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.applied, 0)
  assert.equal(body.queued, 1)
  assert.equal(body.items[0].ai, 'no_api_key')
  assert.equal(db.state.bills[0].due_date, '2026-11-05')
  assert.equal(db.state.bills[0].due_date_source, 'estimee')
})

test('AI JSON fills a scanned invoice when a secret is configured', async () => {
  const fetchImpl = async (url, init) => {
    assert.match(String(url), /openai\.com/)
    const payload = JSON.parse(init.body)
    assert.equal(payload.model, 'gpt-4o-mini')
    assert.equal(payload.messages[0].content.some((part) => part.type === 'file'), true)
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: '{"fournisseur":"Deckers","numero":"DK-100","date_facture":"2026-09-06","montant_ttc":428.85,"echeance":"2026-10-06","conditions":"","confiance":0.91}',
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const ai = await callInvoiceAi({
    bytes: new Uint8Array([37, 80, 68, 70]),
    text: '',
    env: { OPENAI_API_KEY: 'sk-test' },
    fetchImpl,
  })
  assert.equal(ai.ok, true)
  assert.equal(ai.extraction.dueDate, '2026-10-06')
  assert.equal(ai.extraction.amountTtc, 428.85)

  const db = memoryDb([bill({
    id: 'deckers',
    supplier_name: 'Deckers',
    invoice_number: 'DK-100',
    amount_ttc: 428.85,
    due_date: '2026-11-05',
    due_date_source: 'estimee',
  })])
  const response = await handleTresoPdfExtract(request(['admin/deckers.pdf']), {
    corsHeaders,
    db,
    requireCaller: async () => ({ userId: 'admin-1', role: 'Admin' }),
    download: async () => new Uint8Array([37, 80, 68, 70]),
    extractText: async () => '',
    callAi: () => Promise.resolve(ai),
  })
  const body = await response.json()
  assert.equal(body.applied, 1)
  assert.equal(db.state.bills[0].due_date, '2026-10-06')
  assert.equal(db.state.bills[0].due_date_source, 'pdf')
})
