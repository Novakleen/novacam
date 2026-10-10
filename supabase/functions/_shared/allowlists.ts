/**
 * Path/method allowlists for the HubSpot and CompanyCam proxies.
 * Patterns are taken from apps/web call sites (hubspotService.js,
 * ProjectHubSpotAdminPanel.jsx, companycamService.js). Anything else is rejected.
 *
 * tier "field": any logged-in role (project, time, spray, suivi pages).
 * tier "office": Admin and Manager (margins, CRM linking, explorer writes).
 */

export type AccessTier = 'field' | 'office'

export type HubSpotAllowance = {
  tier: AccessTier
  method: 'GET' | 'POST'
  /** Path + original query string, safe to append to https://api.hubapi.com */
  path: string
  body: 'none' | 'batch-read' | 'search'
}

export type CompanyCamAllowance = {
  tier: AccessTier
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
}

const HS_ID = '[0-9]{1,20}'

const FIELD_GET: RegExp[] = [
  new RegExp(`^/crm/v3/objects/deals/${HS_ID}$`),
  new RegExp(`^/crm/v3/objects/contacts/${HS_ID}/associations/deals$`),
  new RegExp(`^/crm/v3/objects/contacts/${HS_ID}/associations/quotes$`),
  new RegExp(`^/crm/v3/objects/contacts/${HS_ID}/associations/invoices$`),
  new RegExp(`^/crm/v3/objects/deals/${HS_ID}/associations/line_items$`),
  new RegExp(`^/crm/v3/objects/quotes/${HS_ID}/associations/line_items$`),
  new RegExp(`^/crm/v3/objects/invoices/${HS_ID}/associations/line_items$`),
  /^\/crm\/v3\/objects\/products$/,
  /^\/crm\/v3\/properties\/deals\/type_of_service$/,
]

const CONTACT_BY_ID = new RegExp(`^/crm/v3/objects/contacts/${HS_ID}$`)

/** Members open the Marge tab, which only reads contact.createdate. Broader contact reads stay office. */
function contactReadTier(query: string): AccessTier {
  const names = new URLSearchParams(query).get('properties')
  if (!names) return 'office'
  const props = names.split(',').map((name) => name.trim()).filter(Boolean)
  if (props.length > 0 && props.every((name) => name === 'createdate')) return 'field'
  return 'office'
}
const OFFICE_GET: RegExp[] = [
  /^\/crm\/v3\/pipelines\/deals$/,
  /^\/crm\/v3\/objects\/contacts$/,
  /^\/crm\/v3\/objects\/deals$/,
  new RegExp(`^/crm/v3/objects/deals/${HS_ID}/associations/quotes$`),
  new RegExp(`^/crm/v3/objects/invoices/${HS_ID}$`),
  new RegExp(`^/crm/v3/owners/${HS_ID}$`),
  new RegExp(`^/crm/v4/objects/contacts/${HS_ID}/associations/invoices$`),
  new RegExp(`^/crm/v4/objects/contacts/${HS_ID}/associations/0-53$`),
]

const FIELD_POST = new Set<string>([
  '/crm/v3/objects/deals/batch/read',
  '/crm/v3/objects/line_items/batch/read',
])

const OFFICE_POST_BATCH = new Set<string>([
  '/crm/v3/objects/quotes/batch/read',
  '/crm/v3/objects/contacts/batch/read',
  '/crm/v3/objects/invoices/batch/read',
])

const OFFICE_POST_SEARCH = new Set<string>([
  '/crm/v3/objects/invoices/search',
])

function queryIsSafe(query: string): boolean {
  if (query.length > 4000) return false
  if (/[\u0000-\u001f\u007f]/.test(query)) return false
  if (query.includes('..') || query.includes('\\') || query.includes('@') || query.includes('#')) return false
  return true
}

function rejectUnsafePath(raw: string): boolean {
  if (!raw.startsWith('/')) return true
  if (raw.length > 4000) return true
  if (/[\u0000-\u001f\u007f]/.test(raw)) return true
  if (raw.includes('..') || raw.includes('\\') || raw.includes('//')) return true
  if (raw.includes('@') || raw.includes('#') || raw.includes(' ')) return true
  return false
}

export function classifyHubSpotRequest(
  methodRaw: unknown,
  pathRaw: unknown,
): HubSpotAllowance | null {
  if (typeof methodRaw !== 'string' || typeof pathRaw !== 'string') return null
  const method = methodRaw.toUpperCase()
  if (method !== 'GET' && method !== 'POST') return null
  if (rejectUnsafePath(pathRaw)) return null

  const qIndex = pathRaw.indexOf('?')
  let pathname = qIndex >= 0 ? pathRaw.slice(0, qIndex) : pathRaw
  const query = qIndex >= 0 ? pathRaw.slice(qIndex + 1) : ''
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
  if (pathname.includes('%')) return null
  if (query && !queryIsSafe(query)) return null

  let tier: AccessTier | null = null
  let body: HubSpotAllowance['body'] = 'none'

  if (method === 'GET') {
    if (CONTACT_BY_ID.test(pathname)) tier = contactReadTier(query)
    else if (FIELD_GET.some((re) => re.test(pathname))) tier = 'field'
    else if (OFFICE_GET.some((re) => re.test(pathname))) tier = 'office'
  } else if (FIELD_POST.has(pathname)) {
    tier = 'field'
    body = 'batch-read'
  } else if (OFFICE_POST_BATCH.has(pathname)) {
    tier = 'office'
    body = 'batch-read'
  } else if (OFFICE_POST_SEARCH.has(pathname)) {
    tier = 'office'
    body = 'search'
  }

  if (!tier) return null
  return {
    tier,
    method,
    path: query ? `${pathname}?${query}` : pathname,
    body,
  }
}

const HS_PROP = /^[A-Za-z][A-Za-z0-9_]{0,79}$/

/** batch/read bodies the app sends: { properties: string[], inputs: [{ id }] }. */
export function sanitizeHubSpotBatchRead(body: unknown): { properties: string[]; inputs: { id: string }[] } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.some((key) => key !== 'properties' && key !== 'inputs')) return null
  if (!Array.isArray(record.properties) || !Array.isArray(record.inputs)) return null
  if (record.properties.length > 40 || record.inputs.length > 100) return null

  const properties: string[] = []
  for (const prop of record.properties) {
    if (typeof prop !== 'string' || !HS_PROP.test(prop)) return null
    properties.push(prop)
  }

  const inputs: { id: string }[] = []
  for (const item of record.inputs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (Object.keys(row).some((key) => key !== 'id')) return null
    const id = String(row.id ?? '')
    if (!/^[0-9]{1,20}$/.test(id)) return null
    inputs.push({ id })
  }
  return { properties, inputs }
}

export function sanitizeHubSpotSearchBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  let serialized: string
  try {
    serialized = JSON.stringify(body)
  } catch {
    return null
  }
  if (!serialized || serialized.length > 20000) return null
  return JSON.parse(serialized) as Record<string, unknown>
}

const CC_ID = '[A-Za-z0-9_-]{1,64}'

const CC_FIELD_GET: RegExp[] = [
  /^\/projects$/,
  new RegExp(`^/projects/${CC_ID}$`),
  new RegExp(`^/projects/${CC_ID}/photos$`),
  new RegExp(`^/projects/${CC_ID}/labels$`),
]

const CC_OFFICE_WRITE: Array<{ method: 'POST' | 'PUT' | 'DELETE'; re: RegExp }> = [
  { method: 'POST', re: /^\/projects$/ },
  { method: 'PUT', re: new RegExp(`^/projects/${CC_ID}$`) },
  { method: 'DELETE', re: new RegExp(`^/projects/${CC_ID}$`) },
]

export function classifyCompanyCamRequest(
  methodRaw: unknown,
  endpointRaw: unknown,
): CompanyCamAllowance | null {
  if (typeof methodRaw !== 'string' || typeof endpointRaw !== 'string') return null
  const method = methodRaw.toUpperCase()
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT' && method !== 'DELETE') return null

  let endpoint = endpointRaw.trim()
  if (!endpoint.startsWith('/')) endpoint = `/${endpoint}`
  if (rejectUnsafePath(endpoint)) return null
  if (endpoint.includes('?') || endpoint.includes('%')) return null
  if (endpoint.length > 1 && endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1)

  if (method === 'GET' && CC_FIELD_GET.some((re) => re.test(endpoint))) {
    return { tier: 'field', method: 'GET', path: endpoint }
  }
  const write = CC_OFFICE_WRITE.find((entry) => entry.method === method && entry.re.test(endpoint))
  if (write) return { tier: 'office', method: write.method, path: endpoint }
  return null
}

const CC_PARAM_KEYS = new Set(['page', 'per_page', 'status', 'query', 'limit'])

export function sanitizeCompanyCamParams(params: unknown): Record<string, string> | null {
  if (params == null) return {}
  if (typeof params !== 'object' || Array.isArray(params)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (!CC_PARAM_KEYS.has(key)) return null
    if (value == null) continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null
    const text = String(value)
    if (!text || text.length > 200) return null
    if (/[\u0000-\u001f\u007f]/.test(text)) return null
    out[key] = text
  }
  return out
}
