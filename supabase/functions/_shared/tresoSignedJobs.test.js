import test from 'node:test'
import assert from 'node:assert/strict'
import { listHelloCalendarEvents } from './googleCalendarAuth.js'
import { projectTreasury } from './tresoForecast.js'
import {
  DEFAULT_SIGNED_STAGE_IDS,
  buildSignedJobRows,
  expectedCashDate,
  pickEventForEmails,
  pickLatestQuote,
  quoteAmountTtc,
  refreshSignedJobs,
} from './tresoSignedJobs.js'

const AS_OF = '2026-10-13'

function event(id, date, emails, extra = {}) {
  const attendees = emails.map((email) => ({ email }))
  const start = date.includes('T') ? { dateTime: date } : { date }
  return { id, start, attendees, ...extra }
}

test('attendee email matches the deal and ignores the calendar mailbox and other clients', () => {
  const events = [
    event('room', '2026-10-14', ['room@resource.calendar.google.com'], {
      attendees: [{ email: 'room@resource.calendar.google.com', resource: true }],
    }),
    event('other', '2026-10-14', ['other@example.test']),
    event('job', '2026-10-22', ['Client@Example.test'], {
      attendees: [
        { email: 'hello@novakleen.be', self: true },
        { email: 'Client@Example.test' },
        { email: 'van@resource.calendar.google.com', resource: true },
      ],
    }),
    event('organizer-only', '2026-10-15', [], {
      organizer: { email: 'client@example.test' },
      attendees: [{ email: 'hello@novakleen.be', self: true }],
    }),
  ]
  const picked = pickEventForEmails(events, ['client@example.test'], AS_OF)
  assert.equal(picked.id, 'job')
  assert.equal(picked.date, '2026-10-22')
  assert.equal(pickEventForEmails(events, ['hello@novakleen.be'], AS_OF), null)
  assert.equal(pickEventForEmails(events, ['missing@example.test'], AS_OF), null)
})

test('latest quote wins and its line items are stored as TTC', () => {
  const quotes = [
    { id: 'q-old', properties: { hs_createdate: '2026-01-02T00:00:00Z', hs_quote_amount: '9000' } },
    { id: 'q-new', properties: { hs_createdate: '2026-09-01T00:00:00Z', hs_quote_amount: '10' } },
  ]
  assert.equal(pickLatestQuote(quotes).id, 'q-new')
  const lines = [{ amount: '1000' }, { properties: { quantity: '2', price: '250' } }]
  assert.equal(quoteAmountTtc(lines), 1590)
  const rows = buildSignedJobRows({
    deals: [{ id: 'd1', properties: { dealname: 'Chantier démo' } }],
    quotesByDeal: new Map([['d1', quotes]]),
    lineItemsByQuote: new Map([['q-new', lines]]),
    emailsByDeal: new Map([['d1', ['client@example.test']]]),
    namesByDeal: new Map([['d1', 'Client Démo']]),
    events: [event('job', '2026-10-22', ['client@example.test'])],
    invoicedDealIds: [],
    asOf: AS_OF,
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].hubspot_quote_id, 'q-new')
  assert.equal(rows[0].amount_ttc, 1590)
  assert.equal(rows[0].event_date, '2026-10-22')
})

test('a deal with a HubSpot invoice association is excluded', () => {
  const rows = buildSignedJobRows({
    deals: [
      { id: 'open', properties: { dealname: 'Ouvert' } },
      { id: 'invoiced', properties: { dealname: 'Déjà facturé' } },
    ],
    quotesByDeal: new Map([
      ['open', [{ id: 'q1', properties: { hs_createdate: '2026-08-01T00:00:00Z', hs_quote_amount: '100' } }]],
      ['invoiced', [{ id: 'q2', properties: { hs_createdate: '2026-08-01T00:00:00Z', hs_quote_amount: '5000' } }]],
    ]),
    lineItemsByQuote: new Map(),
    emailsByDeal: new Map(),
    namesByDeal: new Map(),
    events: [],
    invoicedDealIds: ['invoiced'],
    asOf: AS_OF,
  })
  assert.deepEqual(rows.map((row) => row.hubspot_deal_id), ['open'])
  assert.equal(rows[0].amount_ttc, 106)
  assert.equal(rows[0].event_date, null)
})

test('date rule: next event, otherwise the most recent, then the payment delay', () => {
  const events = [
    event('older', '2026-08-01', ['a@example.test']),
    event('newer-past', '2026-09-15', ['a@example.test']),
    event('later', '2026-12-01', ['a@example.test']),
    event('next', '2026-10-20T23:30:00Z', ['A@Example.test']),
  ]
  const upcoming = pickEventForEmails(events, ['a@example.test'], AS_OF)
  assert.equal(upcoming.id, 'next')
  assert.equal(upcoming.date, '2026-10-21')
  assert.equal(expectedCashDate(upcoming.date, 8), '2026-10-29')
  assert.equal(expectedCashDate(upcoming.date), '2026-10-29')

  const past = pickEventForEmails(events.filter((row) => row.id === 'older' || row.id === 'newer-past'), ['a@example.test'], AS_OF)
  assert.equal(past.id, 'newer-past')
  assert.equal(expectedCashDate(past.date, 8), '2026-09-23')

  const none = pickEventForEmails([], ['a@example.test'], AS_OF)
  assert.equal(none, null)
  assert.equal(expectedCashDate(null, 8), null)

  const withDate = projectTreasury({
    asOf: AS_OF,
    settings: { collection_delay_days: 8, horizon_weeks: 4, probable_enabled: false },
    accounts: [],
    jobs: [{ id: '1', hubspot_deal_id: '1', label: 'Chantier démo', end_date: upcoming.date, amount_ttc: 1590, invoiced: false }],
  })
  const flow = withDate.flows.find((row) => row.source === 'chantier')
  assert.equal(flow.flow_date, '2026-10-29')
  assert.equal(flow.amount, 1590)

  const undated = projectTreasury({
    asOf: AS_OF,
    settings: { collection_delay_days: 8, horizon_weeks: 4, probable_enabled: false },
    accounts: [],
    jobs: [{ id: '2', hubspot_deal_id: '2', end_date: null, amount_ttc: 500, invoiced: false }],
  })
  assert.equal(undated.flows.some((row) => row.source === 'chantier'), false)
})

test('refresh stores the open deal, drops the invoiced one, and keeps a deal with no event', async () => {
  const calls = []
  const request = async (path, init = {}) => {
    calls.push({ path, body: init.body || null })
    if (path === '/crm/v3/objects/deals/search') {
      return {
        results: [
          { id: 'open', properties: { dealname: 'Chantier démo', dealstage: '582811874' } },
          { id: 'invoiced', properties: { dealname: 'Déjà facturé', dealstage: '582811874' } },
          { id: 'nodate', properties: { dealname: 'Sans rendez-vous', dealstage: '582811874' } },
        ],
      }
    }
    if (path === '/crm/v4/associations/deals/invoices/batch/read') {
      return { results: [{ from: { id: 'invoiced' }, to: [{ toObjectId: 'inv-1' }] }] }
    }
    if (path === '/crm/v4/associations/deals/quotes/batch/read') {
      assert.deepEqual(init.body.inputs.map((row) => row.id).sort(), ['nodate', 'open'])
      return {
        results: [
          { from: { id: 'open' }, to: [{ toObjectId: 'q-old' }, { toObjectId: 'q-new' }] },
          { from: { id: 'nodate' }, to: [{ toObjectId: 'q-flat' }] },
        ],
      }
    }
    if (path === '/crm/v4/associations/deals/contacts/batch/read') {
      return { results: [{ from: { id: 'open' }, to: [{ toObjectId: 'c-1' }] }] }
    }
    if (path === '/crm/v3/objects/quotes/batch/read') {
      return {
        results: [
          { id: 'q-old', properties: { hs_createdate: '2026-01-01T00:00:00Z', hs_quote_amount: '9000' } },
          { id: 'q-new', properties: { hs_createdate: '2026-09-01T00:00:00Z', hs_quote_amount: '1' } },
          { id: 'q-flat', properties: { hs_createdate: '2026-07-01T00:00:00Z', hs_quote_amount: '200' } },
        ],
      }
    }
    if (path === '/crm/v4/associations/quotes/line_items/batch/read') {
      assert.deepEqual(init.body.inputs.map((row) => row.id).sort(), ['q-flat', 'q-new'])
      return { results: [{ from: { id: 'q-new' }, to: [{ toObjectId: 'li-1' }, { toObjectId: 'li-2' }] }] }
    }
    if (path === '/crm/v3/objects/line_items/batch/read') {
      return {
        results: [
          { id: 'li-1', properties: { amount: '1000' } },
          { id: 'li-2', properties: { amount: '500' } },
        ],
      }
    }
    if (path === '/crm/v3/objects/contacts/batch/read') {
      return { results: [{ id: 'c-1', properties: { email: 'Client@Example.test', firstname: 'Client', lastname: 'Démo' } }] }
    }
    throw new Error(`unexpected ${path}`)
  }

  const stored = []
  const result = await refreshSignedJobs({
    db: {
      async getSignedStageIds() { return ['582811874'] },
      async replaceSignedJobs(rows) { stored.splice(0, stored.length, ...rows) },
    },
    request,
    events: [
      event('next', '2026-10-22', ['client@example.test']),
      event('past', '2026-09-01', ['client@example.test']),
      event('stranger', '2026-10-14', ['other@example.test']),
    ],
    asOf: AS_OF,
  })

  const search = calls.find((call) => call.path === '/crm/v3/objects/deals/search')
  assert.equal(search.body.filterGroups[0].filters[0].operator, 'IN')
  assert.deepEqual(search.body.filterGroups[0].filters[0].values, ['582811874'])
  assert.equal(result.excluded_invoiced, 1)
  assert.equal(result.count, 2)
  assert.equal(result.undated, 1)
  const open = stored.find((row) => row.hubspot_deal_id === 'open')
  const quiet = stored.find((row) => row.hubspot_deal_id === 'nodate')
  assert.equal(open.hubspot_quote_id, 'q-new')
  assert.equal(open.amount_ttc, 1590)
  assert.equal(open.event_date, '2026-10-22')
  assert.equal(open.contact_email, 'client@example.test')
  assert.equal(open.client_name, 'Client Démo')
  assert.equal(quiet.event_date, null)
  assert.equal(quiet.amount_ttc, 212)
  assert.equal(stored.some((row) => row.hubspot_deal_id === 'invoiced'), false)
  assert.deepEqual(DEFAULT_SIGNED_STAGE_IDS, ['582811874', '4195566808', '4898287842'])
})

test('calendar listing reuses the Google refresh token and pages events', async () => {
  await assert.rejects(
    () => listHelloCalendarEvents({ env: () => '' }),
    /GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN/,
  )

  const seen = []
  const fetchImpl = async (url, init = {}) => {
    seen.push(String(url))
    if (String(url).includes('oauth2.googleapis.com')) {
      assert.match(String(init.body), /refresh_token=refresh-demo/)
      return { ok: true, json: async () => ({ access_token: 'ya29-demo' }) }
    }
    const parsed = new URL(url)
    assert.equal(parsed.hostname, 'www.googleapis.com')
    assert.match(parsed.pathname, /hello%40novakleen\.be/)
    assert.equal(init.headers.Authorization, 'Bearer ya29-demo')
    assert.equal(parsed.searchParams.get('singleEvents'), 'true')
    if (!parsed.searchParams.get('pageToken')) {
      return { ok: true, json: async () => ({ items: [{ id: 'a' }], nextPageToken: 'p2' }) }
    }
    return { ok: true, json: async () => ({ items: [{ id: 'b' }] }) }
  }

  const items = await listHelloCalendarEvents({
    env: (name) => ({
      GOOGLE_CLIENT_ID: 'client-demo',
      GOOGLE_CLIENT_SECRET: 'secret-demo',
      GOOGLE_REFRESH_TOKEN: 'refresh-demo',
    }[name] || ''),
    fetchImpl,
    now: new Date('2026-10-13T10:00:00Z'),
  })
  assert.deepEqual(items.map((row) => row.id), ['a', 'b'])
  assert.equal(seen.length, 3)
})
