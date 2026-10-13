/**
 * Signed HubSpot deals that are not invoiced yet (v1.23).
 * Quote line amounts are HT; stored cash is TTC = lines × 1.06.
 * The calendar day is the event; cash-in is that day plus collection_delay_days.
 */

import { addDays } from './tresoAccountable.js'

/** Won stages already used by the HubSpot funnel. The invoiced stage is not included. */
export const DEFAULT_SIGNED_STAGE_IDS = ['582811874', '4195566808', '4898287842']
export const QUOTE_TTC_FACTOR = 1.06
const CALENDAR_MAILBOX = 'hello@novakleen.be'

const DEAL_PROPERTIES = ['dealname', 'dealstage', 'closedate']
const QUOTE_PROPERTIES = ['hs_title', 'hs_quote_amount', 'hs_createdate', 'hs_lastmodifieddate']
const LINE_PROPERTIES = ['amount', 'quantity', 'price', 'name']
const CONTACT_PROPERTIES = ['email', 'firstname', 'lastname']

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export function normalizeStageIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/)
  const ids = []
  const seen = new Set()
  for (const item of raw) {
    const id = String(item || '').trim()
    if (!/^\d+$/.test(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids.length ? ids : [...DEFAULT_SIGNED_STAGE_IDS]
}

export function quoteTimestamp(quote) {
  const props = quote?.properties || {}
  const raw = props.hs_createdate || props.createdate || props.hs_lastmodifieddate || ''
  const text = String(raw).trim()
  if (!text) return 0
  if (/^\d{10,}$/.test(text)) {
    const n = Number(text)
    return Number.isFinite(n) ? n : 0
  }
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function pickLatestQuote(quotes) {
  const list = (quotes || []).filter((quote) => quote && (quote.id || quote.properties))
  if (!list.length) return null
  return [...list].sort((a, b) => {
    const delta = quoteTimestamp(b) - quoteTimestamp(a)
    if (delta) return delta
    return String(b.id || '').localeCompare(String(a.id || ''))
  })[0]
}

export function lineItemHt(item) {
  const props = item?.properties || item || {}
  const amount = Number(props.amount)
  if (Number.isFinite(amount)) return amount
  const qty = Number(props.quantity)
  const price = Number(props.price)
  if (Number.isFinite(qty) && Number.isFinite(price)) return qty * price
  return 0
}

/** TTC from HT line items. Returns null when there is nothing to sum. */
export function quoteAmountTtc(lineItems, factor = QUOTE_TTC_FACTOR) {
  let sum = 0
  let any = false
  for (const item of lineItems || []) {
    const ht = lineItemHt(item)
    if (!Number.isFinite(ht) || ht === 0) continue
    sum += ht
    any = true
  }
  if (!any || !(sum > 0)) return null
  const ratio = Number(factor)
  const used = Number.isFinite(ratio) && ratio > 0 ? ratio : QUOTE_TTC_FACTOR
  return Math.round(sum * used * 100) / 100
}

export function attendeeEmails(event) {
  const list = Array.isArray(event?.attendees) ? event.attendees : []
  const out = []
  for (const person of list) {
    if (!person || person.resource) continue
    const email = String(person.email || '').trim().toLowerCase()
    if (!email || email === CALENDAR_MAILBOX) continue
    out.push(email)
  }
  return out
}

export function eventStartDate(event) {
  const start = event?.start
  const raw = start?.dateTime || start?.date || (typeof start === 'string' ? start : null)
  if (!raw) return null
  const text = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function pickEventForEmails(events, emails, asOf) {
  const targets = new Set((emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))
  targets.delete(CALENDAR_MAILBOX)
  if (!targets.size) return null
  const today = String(asOf || '').slice(0, 10)
  const matches = []
  for (const event of events || []) {
    if (!event || event.status === 'cancelled') continue
    if (!attendeeEmails(event).some((email) => targets.has(email))) continue
    const date = eventStartDate(event)
    if (!date) continue
    matches.push({ event, date, id: event.id ? String(event.id) : null })
  }
  if (!matches.length) return null
  const upcoming = matches
    .filter((row) => !today || row.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
  if (upcoming.length) return upcoming[0]
  return matches.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)))[0]
}

export function expectedCashDate(eventDate, delayDays = 8) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(eventDate || '')) ? String(eventDate) : eventStartDate({ start: eventDate })
  if (!iso) return null
  const days = Number(delayDays)
  return addDays(iso, Number.isFinite(days) ? days : 8)
}

function contactName(contact) {
  if (!contact) return null
  const props = contact.properties || {}
  const person = [props.firstname, props.lastname].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  return person || null
}

function mapGet(collection, key) {
  if (!collection) return undefined
  if (typeof collection.get === 'function') return collection.get(key)
  return collection[key]
}

export function buildSignedJobRows({
  deals,
  quotesByDeal,
  lineItemsByQuote,
  emailsByDeal,
  namesByDeal,
  events,
  invoicedDealIds,
  asOf,
}) {
  const invoiced = new Set((invoicedDealIds || []).map((id) => String(id)))
  const rows = []
  for (const deal of deals || []) {
    const id = String(deal?.id || '')
    if (!id || invoiced.has(id)) continue
    const quote = pickLatestQuote(mapGet(quotesByDeal, id) || [])
    const quoteId = quote?.id ? String(quote.id) : null
    const lines = quoteId ? (mapGet(lineItemsByQuote, quoteId) || []) : []
    let amount = quoteAmountTtc(lines)
    if (amount == null && quote) {
      const fallback = Number((quote.properties || {}).hs_quote_amount)
      if (Number.isFinite(fallback) && fallback > 0) {
        amount = Math.round(fallback * QUOTE_TTC_FACTOR * 100) / 100
      }
    }
    const emails = mapGet(emailsByDeal, id) || []
    const picked = pickEventForEmails(events, emails, asOf)
    const name = mapGet(namesByDeal, id) || null
    const label = (deal.properties || {}).dealname || name || id
    rows.push({
      hubspot_deal_id: id,
      label,
      client_name: name || label,
      contact_email: emails[0] || null,
      hubspot_quote_id: quoteId,
      amount_ttc: amount,
      event_date: picked?.date || null,
      google_calendar_event_id: picked?.id || null,
    })
  }
  return rows
}

async function batchAssociation(request, fromType, toType, ids) {
  const map = new Map()
  if (!ids.length) return map
  for (const part of chunk(ids, 100)) {
    const body = await request(`/crm/v4/associations/${fromType}/${toType}/batch/read`, {
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

async function batchRead(request, objectType, ids, properties) {
  const map = new Map()
  if (!ids.length) return map
  for (const part of chunk(ids, 100)) {
    const body = await request(`/crm/v3/objects/${objectType}/batch/read`, {
      method: 'POST',
      body: { properties, inputs: part.map((id) => ({ id })) },
    })
    for (const row of body.results || []) map.set(String(row.id), row)
  }
  return map
}

async function searchSignedDeals(request, stageIds) {
  if (!stageIds.length) return []
  const deals = []
  let after = null
  for (let page = 0; page < 20; page += 1) {
    const payload = {
      filterGroups: [{
        filters: [{ propertyName: 'dealstage', operator: 'IN', values: stageIds }],
      }],
      properties: DEAL_PROPERTIES,
      limit: 100,
    }
    if (after) payload.after = after
    const body = await request('/crm/v3/objects/deals/search', { method: 'POST', body: payload })
    deals.push(...(body.results || []))
    after = body.paging?.next?.after || null
    if (!after) break
  }
  return deals
}

export async function refreshSignedJobs({ db, request, events, asOf }) {
  const stageIds = normalizeStageIds(await db.getSignedStageIds())
  const deals = await searchSignedDeals(request, stageIds)
  const dealIds = deals.map((deal) => String(deal.id || '')).filter(Boolean)
  const invoiceAssocs = await batchAssociation(request, 'deals', 'invoices', dealIds)
  const openIds = dealIds.filter((id) => !invoiceAssocs.has(id))
  const quoteAssocs = await batchAssociation(request, 'deals', 'quotes', openIds)
  const contactAssocs = await batchAssociation(request, 'deals', 'contacts', openIds)
  const quoteIds = [...new Set(openIds.flatMap((id) => quoteAssocs.get(id) || []))]
  const quoteMap = await batchRead(request, 'quotes', quoteIds, QUOTE_PROPERTIES)
  const quotesByDeal = new Map()
  const chosenQuoteIds = []
  for (const dealId of openIds) {
    const quotes = (quoteAssocs.get(dealId) || []).map((id) => quoteMap.get(id)).filter(Boolean)
    quotesByDeal.set(dealId, quotes)
    const latest = pickLatestQuote(quotes)
    if (latest?.id) chosenQuoteIds.push(String(latest.id))
  }
  const lineAssocs = await batchAssociation(request, 'quotes', 'line_items', [...new Set(chosenQuoteIds)])
  const lineIds = [...new Set([...lineAssocs.values()].flat())]
  const lineMap = await batchRead(request, 'line_items', lineIds, LINE_PROPERTIES)
  const lineItemsByQuote = new Map()
  for (const [quoteId, ids] of lineAssocs) {
    lineItemsByQuote.set(quoteId, ids.map((id) => lineMap.get(id)).filter(Boolean))
  }
  const contactIds = [...new Set([...contactAssocs.values()].flat())]
  const contactMap = await batchRead(request, 'contacts', contactIds, CONTACT_PROPERTIES)
  const emailsByDeal = new Map()
  const namesByDeal = new Map()
  for (const [dealId, ids] of contactAssocs) {
    const contacts = ids.map((id) => contactMap.get(id)).filter(Boolean)
    const emails = []
    for (const contact of contacts) {
      const email = String(contact.properties?.email || '').trim().toLowerCase()
      if (email && email !== CALENDAR_MAILBOX && !emails.includes(email)) emails.push(email)
    }
    emailsByDeal.set(dealId, emails)
    const named = contacts.map(contactName).find(Boolean)
    if (named) namesByDeal.set(dealId, named)
  }
  const rows = buildSignedJobRows({
    deals,
    quotesByDeal,
    lineItemsByQuote,
    emailsByDeal,
    namesByDeal,
    events,
    invoicedDealIds: [...invoiceAssocs.keys()],
    asOf,
  })
  await db.replaceSignedJobs(rows)
  return {
    count: rows.length,
    undated: rows.filter((row) => !row.event_date).length,
    excluded_invoiced: invoiceAssocs.size,
    stages: stageIds,
  }
}
