/**
 * Incremental HubSpot invoice sync into treso_client_invoices.
 * Paid status is not taken from HubSpot (hs_payment_date is ignored).
 * Amounts follow apps/web/src/lib/hubspotInvoiceAmount.js:
 * TTC = hs_amount_billed, HT = hs_amount_billed_pre_tax.
 */
import { applyBankMatch } from './tresoMatch.js'
import { todayInBrussels } from './tresoForecast.js'
import { refreshSignedJobs } from './tresoSignedJobs.js'

export const HUBSPOT_INVOICE_PROPERTIES = [
  'hs_number',
  'hs_invoice_number',
  'hs_amount_billed',
  'hs_amount_billed_pre_tax',
  'hs_taxes_total',
  'hs_balance_due',
  'hs_amount_paid',
  'hs_invoice_status',
  'hs_invoice_date',
  'hs_due_date',
  'hs_lastmodifieddate',
]

function money(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

/** Same date rule as normalizeHubSpotDate in hubspotInvoiceAmount.js. */
export function normalizeHubSpotDate(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const n = Number(text)
  const date = Number.isFinite(n) ? new Date(n) : new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function hubspotTimestamp(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  const numeric = Number(text)
  const date = /^\d{4}-\d{2}-\d{2}/.test(text) ? new Date(text) : new Date(numeric)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function asIso(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function invoiceAmounts(props) {
  const preTax = money(props.hs_amount_billed_pre_tax)
  const billed = money(props.hs_amount_billed)
  const taxes = money(props.hs_taxes_total)
  let amountHt = preTax
  if (amountHt == null && billed != null && taxes != null && taxes >= 0 && billed >= taxes) {
    amountHt = money(billed - taxes)
  }
  return { amountTtc: billed, amountHt }
}

export function clientNameFromParts({ companyName, contactFirst, contactLast, contactCompany }) {
  const company = String(companyName || '').trim()
  if (company) return company
  const person = [contactFirst, contactLast].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  if (person) return person
  const fallback = String(contactCompany || '').trim()
  return fallback || null
}

function firstAssociationId(raw, type) {
  const results = raw?.associations?.[type]?.results || []
  const id = results[0]?.id ?? results[0]?.toObjectId
  return id == null || id === '' ? null : String(id)
}

export function mapHubspotInvoice(raw) {
  const props = raw?.properties || {}
  const amounts = invoiceAmounts(props)
  return {
    hubspot_invoice_id: String(raw.id),
    invoice_number: props.hs_number || props.hs_invoice_number || null,
    hubspot_deal_id: raw.dealId || null,
    hubspot_contact_id: raw.contactId || null,
    client_name: raw.clientName || null,
    invoice_date: normalizeHubSpotDate(props.hs_invoice_date),
    due_date: normalizeHubSpotDate(props.hs_due_date),
    amount_ttc: amounts.amountTtc,
    amount_ht: amounts.amountHt,
    hubspot_amount_paid: money(props.hs_amount_paid),
    hubspot_balance_due: money(props.hs_balance_due),
    hubspot_status: props.hs_invoice_status || null,
    modifiedAt: hubspotTimestamp(props.hs_lastmodifieddate),
  }
}

export function enrichInvoiceRecord(raw, lookups = {}) {
  const companies = lookups.companies || new Map()
  const contacts = lookups.contacts || new Map()
  const companyId = firstAssociationId(raw, 'companies')
  const contactId = firstAssociationId(raw, 'contacts')
  const dealId = firstAssociationId(raw, 'deals')
  const company = companyId ? companies.get(companyId) : null
  const contact = contactId ? contacts.get(contactId) : null
  return mapHubspotInvoice({
    id: raw.id,
    properties: raw.properties,
    dealId,
    contactId,
    clientName: clientNameFromParts({
      companyName: company?.name,
      contactFirst: contact?.firstname,
      contactLast: contact?.lastname,
      contactCompany: contact?.company,
    }),
  })
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function collectIds(records, type) {
  const ids = []
  for (const raw of records) {
    const id = firstAssociationId(raw, type)
    if (id) ids.push(id)
  }
  return [...new Set(ids)]
}

async function batchAssociations(request, type, ids) {
  const map = new Map()
  for (const part of chunk(ids, 100)) {
    const body = await request(`/crm/v4/associations/invoices/${type}/batch/read`, {
      method: 'POST',
      body: { inputs: part.map((id) => ({ id })) },
    })
    for (const row of body.results || []) {
      const from = String(row.from?.id || '')
      const to = (row.to || []).map((item) => String(item.toObjectId || item.id || '')).filter(Boolean)
      if (from && to.length) map.set(from, to)
    }
  }
  return map
}

async function attachAssociations(request, results) {
  const ids = results.map((row) => String(row.id || '')).filter(Boolean)
  if (!ids.length) return
  for (const type of ['companies', 'contacts', 'deals']) {
    const found = await batchAssociations(request, type, ids)
    for (const raw of results) {
      const list = found.get(String(raw.id)) || []
      raw.associations = raw.associations || {}
      raw.associations[type] = { results: list.map((id) => ({ id })) }
    }
  }
}

async function batchReadObjects(request, objectType, ids, properties) {
  const map = new Map()
  if (!ids.length) return map
  for (const part of chunk(ids, 100)) {
    const body = await request(`/crm/v3/objects/${objectType}/batch/read`, {
      method: 'POST',
      body: { properties, inputs: part.map((id) => ({ id })) },
    })
    for (const row of body.results || []) {
      map.set(String(row.id), row.properties || {})
    }
  }
  return map
}

export async function pullHubspotInvoices({ request, modifiedAfter }) {
  const raws = []
  if (!modifiedAfter) {
    let after = null
    for (let page = 0; page < 50; page += 1) {
      const qs = new URLSearchParams({
        limit: '100',
        properties: HUBSPOT_INVOICE_PROPERTIES.join(','),
        associations: 'contacts,companies,deals',
      })
      if (after) qs.set('after', after)
      const body = await request(`/crm/v3/objects/invoices?${qs}`, { method: 'GET' })
      raws.push(...(body.results || []))
      after = body.paging?.next?.after || null
      if (!after) break
    }
  } else {
    const ms = String(new Date(modifiedAfter).getTime())
    let after = null
    for (let page = 0; page < 50; page += 1) {
      const payload = {
        filterGroups: [{
          filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: ms }],
        }],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
        properties: HUBSPOT_INVOICE_PROPERTIES,
        limit: 100,
      }
      if (after) payload.after = after
      const body = await request('/crm/v3/objects/invoices/search', { method: 'POST', body: payload })
      const results = body.results || []
      await attachAssociations(request, results)
      raws.push(...results)
      after = body.paging?.next?.after || null
      if (!after) break
    }
  }
  const companies = await batchReadObjects(request, 'companies', collectIds(raws, 'companies'), ['name'])
  const contacts = await batchReadObjects(request, 'contacts', collectIds(raws, 'contacts'), ['firstname', 'lastname', 'company'])
  return raws.map((raw) => enrichInvoiceRecord(raw, { companies, contacts }))
}

export async function syncHubspotInvoices({ db, request, userId = null }) {
  const cursor = asIso(await db.getInvoiceCursor())
  const mapped = await pullHubspotInvoices({ request, modifiedAfter: cursor })
  const rows = mapped.map(({ modifiedAt, ...row }) => row)
  const saved = await db.upsertInvoices(rows, { userId })
  let nextCursor = cursor
  for (const row of mapped) {
    if (row.modifiedAt && (!nextCursor || row.modifiedAt > nextCursor)) nextCursor = row.modifiedAt
  }
  if (mapped.length && nextCursor) await db.setInvoiceCursor(nextCursor)
  const match = await applyBankMatch(db)
  return {
    ok: true,
    fetched: mapped.length,
    inserted: saved?.inserted ?? 0,
    updated: saved?.updated ?? 0,
    cursor: nextCursor,
    matches_auto: match?.auto ?? 0,
    matches_a_valider: match?.a_valider ?? 0,
  }
}

function json(corsHeaders, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bearer(req) {
  const match = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)/i)
  return match?.[1]?.trim() ?? ''
}

export async function hubspotRequest(token, path, init = {}) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await response.text()
  let data = {}
  if (text) {
    try { data = JSON.parse(text) } catch { data = { message: text.slice(0, 200) } }
  }
  if (!response.ok) {
    throw new Error(`HubSpot ${response.status}: ${data?.message || data?.error || 'request failed'}`)
  }
  return data
}

/**
 * Admin user JWT, or the service role key (pg_cron / scheduled call).
 * The anon key is not a user and is rejected by requireCaller.
 */
export async function handleTresoHubspotSync(req, deps) {
  const cors = deps.corsHeaders
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(cors, { error: 'Method not allowed' }, 405)

  const token = bearer(req)
  const serviceKey = deps.serviceRoleKey || ''
  let userId = null
  if (!(serviceKey && token && token === serviceKey)) {
    const caller = await deps.requireCaller(req)
    if (caller instanceof Response) return caller
    if (!caller?.userId) return json(cors, { error: 'Unauthorized' }, 401)
    userId = caller.userId
  }

  try {
    const request = deps.request || ((path, init) => {
      if (!deps.hubspotToken) throw new Error('HUBSPOT_ACCESS_TOKEN is missing')
      return hubspotRequest(deps.hubspotToken, path, init)
    })
    const result = await syncHubspotInvoices({ db: deps.db, request, userId })
    let signedJobs = { error: 'calendar_not_configured' }
    if (deps.listCalendarEvents) {
      try {
        const events = await deps.listCalendarEvents()
        signedJobs = await refreshSignedJobs({
          db: deps.db,
          request,
          events,
          asOf: deps.asOf || todayInBrussels(),
        })
      } catch (error) {
        console.error('treso signed jobs', error?.message || error)
        signedJobs = { error: error?.message || 'signed_jobs_failed' }
      }
    }
    return json(cors, { ...result, signed_jobs: signedJobs }, 200)
  } catch (error) {
    console.error('treso-hubspot-sync', error?.message || error)
    return json(cors, { error: 'sync_failed', message: error?.message || 'Sync impossible.' }, 500)
  }
}
