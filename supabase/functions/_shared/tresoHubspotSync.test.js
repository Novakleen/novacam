import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HUBSPOT_INVOICE_PROPERTIES,
  handleTresoHubspotSync,
  mapHubspotInvoice,
  syncHubspotInvoices,
} from './tresoHubspotSync.js'

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

function rawInvoice(overrides = {}) {
  return {
    id: '501',
    properties: {
      hs_number: '2BLX-9001',
      hs_amount_billed: '1250.00',
      hs_amount_billed_pre_tax: '1179.25',
      hs_balance_due: '1250.00',
      hs_amount_paid: '0',
      hs_invoice_status: 'open',
      hs_invoice_date: '2026-10-01',
      hs_due_date: '1761955200000',
      hs_lastmodifieddate: '1760300000000',
      hs_payment_date: '2026-09-01',
      ...overrides,
    },
    associations: {
      companies: { results: [{ id: '9' }] },
      contacts: { results: [{ id: '4' }] },
      deals: { results: [{ id: '77' }] },
    },
  }
}

function memoryDb() {
  const state = { cursor: null, rows: [], plans: 0 }
  return {
    state,
    async getInvoiceCursor() { return state.cursor },
    async setInvoiceCursor(value) { state.cursor = value },
    async upsertInvoices(rows) {
      for (const row of rows) {
        assert.equal('bank_paid_amount' in row, false)
        assert.equal('paid_at' in row, false)
        assert.equal('hs_payment_date' in row, false)
      }
      state.rows.push(...rows)
      return { inserted: rows.length, updated: 0 }
    },
    async loadMatchState() {
      return { transactions: [], invoices: state.rows, belfiusAccountId: 'acc-belfius' }
    },
    async applyMatchPlan() { state.plans += 1 },
  }
}

test('mapped invoice uses billed TTC and pre-tax HT and ignores hs_payment_date', () => {
  const row = mapHubspotInvoice({
    id: '501',
    properties: rawInvoice().properties,
    dealId: '77',
    contactId: '4',
    clientName: 'Atelier Nord',
  })
  assert.equal(row.amount_ttc, 1250)
  assert.equal(row.amount_ht, 1179.25)
  assert.equal(row.hubspot_balance_due, 1250)
  assert.equal(row.invoice_number, '2BLX-9001')
  assert.equal(row.invoice_date, '2026-10-01')
  assert.equal(row.hubspot_deal_id, '77')
  assert.equal(row.client_name, 'Atelier Nord')
  assert.equal(row.hubspot_status, 'open')
  assert.equal('paid_at' in row, false)
  assert.equal(HUBSPOT_INVOICE_PROPERTIES.includes('hs_payment_date'), false)
  assert.equal(HUBSPOT_INVOICE_PROPERTIES.includes('hs_amount_billed'), true)
  assert.equal(HUBSPOT_INVOICE_PROPERTIES.includes('hs_amount_billed_pre_tax'), true)
})

test('incremental sync filters on hs_lastmodifieddate and then matches', async () => {
  const db = memoryDb()
  const calls = []
  const request = async (path, init) => {
    calls.push({ path, body: init?.body || null })
    if (path.startsWith('/crm/v3/objects/invoices?')) {
      return { results: [rawInvoice()], paging: {} }
    }
    if (path === '/crm/v3/objects/companies/batch/read') {
      return { results: [{ id: '9', properties: { name: 'Atelier Nord' } }] }
    }
    if (path === '/crm/v3/objects/contacts/batch/read') {
      return { results: [{ id: '4', properties: { firstname: 'Ada', lastname: 'Nord' } }] }
    }
    if (path === '/crm/v3/objects/invoices/search') {
      return { results: [], paging: {} }
    }
    return { results: [] }
  }

  const first = await syncHubspotInvoices({ db, request, userId: 'admin-1' })
  assert.equal(first.fetched, 1)
  assert.equal(first.inserted, 1)
  assert.equal(db.state.rows[0].client_name, 'Atelier Nord')
  assert.equal(db.state.rows[0].hubspot_deal_id, '77')
  assert.equal(db.state.plans, 1)
  assert.ok(db.state.cursor)
  assert.equal(calls[0].path.includes('hs_payment_date'), false)

  calls.length = 0
  await syncHubspotInvoices({ db, request })
  const search = calls.find((call) => call.path === '/crm/v3/objects/invoices/search')
  assert.ok(search)
  assert.equal(search.body.filterGroups[0].filters[0].propertyName, 'hs_lastmodifieddate')
  assert.equal(search.body.filterGroups[0].filters[0].operator, 'GTE')
  assert.equal(search.body.properties.includes('hs_payment_date'), false)
})

test('non-admin JWT is 403 and does not call HubSpot; service role may sync', async () => {
  let hubspotCalls = 0
  const db = memoryDb()
  const deps = {
    corsHeaders,
    serviceRoleKey: 'service-secret',
    db,
    request: async () => {
      hubspotCalls += 1
      return { results: [], paging: {} }
    },
    requireCaller: async () => new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: corsHeaders,
    }),
  }
  const forbidden = await handleTresoHubspotSync(new Request('http://local/treso-hubspot-sync', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt' },
  }), deps)
  assert.equal(forbidden.status, 403)
  assert.equal(hubspotCalls, 0)
  assert.equal(db.state.rows.length, 0)

  const ok = await handleTresoHubspotSync(new Request('http://local/treso-hubspot-sync', {
    method: 'POST',
    headers: { Authorization: 'Bearer service-secret' },
  }), deps)
  assert.equal(ok.status, 200)
  assert.equal(hubspotCalls, 1)
  const body = await ok.json()
  assert.equal(body.ok, true)
  assert.equal(body.fetched, 0)
  assert.equal(body.signed_jobs.error, 'calendar_not_configured')
})

test('a calendar failure does not fail the invoice sync', async () => {
  const db = memoryDb()
  const res = await handleTresoHubspotSync(new Request('http://local/treso-hubspot-sync', {
    method: 'POST',
    headers: { Authorization: 'Bearer service-secret' },
  }), {
    corsHeaders,
    serviceRoleKey: 'service-secret',
    db,
    request: async () => ({ results: [], paging: {} }),
    requireCaller: async () => ({ userId: 'admin-1' }),
    listCalendarEvents: async () => { throw new Error('calendar down') },
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.fetched, 0)
  assert.equal(body.signed_jobs.error, 'calendar down')
  assert.equal(db.state.rows.length, 0)
})
