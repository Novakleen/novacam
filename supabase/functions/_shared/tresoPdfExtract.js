/**
 * Supplier-invoice PDF → due date (v1.22).
 * Pure matching and date rules live here so node:test and the edge function
 * share one implementation. Text extraction and the Admin JWT check are injected.
 *
 * AI fallback (scanned or low-text PDFs), first secret that is set:
 *   OPENAI_API_KEY     (default model gpt-4o-mini, override OPENAI_PDF_MODEL)
 *   ANTHROPIC_API_KEY  (default model claude-3-5-haiku-latest, override ANTHROPIC_PDF_MODEL)
 * If neither secret is set, reading continues and uncertain invoices are queued.
 */

import { addDays, parseIsoDate } from './tresoAccountable.js'
import { interpretPaymentTerms, namesMatch } from './tresoForecast.js'

export const PDF_AI_SECRET_NAMES = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']
export const PDF_CONFIDENCE_MIN = 0.75
export const AMOUNT_TOLERANCE_CENTS = 2
const MAX_FILES = 20
const MAX_BYTES = 15 * 1024 * 1024
const THIN_TEXT = 40

const DUE_RANK = { estimee: 1, export: 2, pdf: 3, manuel: 4 }

const AI_PROMPT = [
  'Lis cette facture fournisseur. Reponds uniquement avec un objet JSON :',
  '{"fournisseur":"","numero":"","date_facture":"YYYY-MM-DD","montant_ttc":0,"echeance":"YYYY-MM-DD","conditions":"","confiance":0}',
  'Laisse une chaine vide si la valeur est absente. montant_ttc est un nombre (TTC). confiance est entre 0 et 1.',
  'conditions reprend le texte de paiement, par exemple "30 jours fin de mois" ou "15 jours".',
].join(' ')

function json(corsHeaders, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cents(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function amountsClose(left, right) {
  const a = cents(left)
  const b = cents(right)
  if (a == null || b == null) return false
  return Math.abs(a - b) <= AMOUNT_TOLERANCE_CENTS
}

export function normalizeInvoiceNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function parseLooseDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const iso = parseIsoDate(text)
  if (iso) return iso
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text)
  if (!dmy) return null
  return parseIsoDate(`${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`)
}

function parseAmountToken(value) {
  let s = String(value || '').trim().replace(/\s/g, '').replace(/€/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (s.includes(',')) s = s.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function firstGroup(text, pattern) {
  const match = pattern.exec(text)
  return match ? match[1].trim() : ''
}

function scoreFields(fields) {
  let score = 0.1
  if (fields.amountTtc != null) score += 0.3
  if (fields.supplierName) score += 0.2
  if (fields.invoiceNumber) score += 0.15
  if (fields.invoiceDate) score += 0.1
  if (fields.dueDate || fields.paymentTerms) score += 0.2
  return Math.round(Math.min(score, 0.95) * 100) / 100
}

export function parseInvoiceText(raw) {
  const original = String(raw || '').replace(/\u0000/g, '')
  const flat = fold(original).toLowerCase()
  const supplierRaw = firstGroup(original, /(?:fournisseur|leverancier|supplier)\s*[:\-]\s*(.+)/i)
  const numberRaw = firstGroup(
    flat,
    /(?:facture\s*n[o°.]*|n[o°.]*\s*(?:de\s*)?facture|factuurnummer|factuurnr|invoice\s*(?:no|number|nr)|numero(?:\s*de\s*facture)?)\s*[:\-]?\s*([a-z0-9][a-z0-9/.\-]{2,})/i,
  )
  const invoiceDate = parseLooseDate(firstGroup(
    flat,
    /(?:date\s*de\s*facture|date\s*facture|factuurdatum|invoice\s*date|datum\s*factuur)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  ))
  const dueDate = parseLooseDate(firstGroup(
    flat,
    /(?:echeance|a\s*payer\s*avant(?:\s*le)?|vervaldag|vervaldatum|due\s*date|date\s*d\s*echeance|te\s*betalen\s*voor)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  ))
  const amountRaw = firstGroup(
    flat,
    /(?:montant\s*ttc|total\s*ttc|total\s*a\s*payer|totaal(?:\s*incl\.?)?|amount\s*due|te\s*betalen)\s*[:\-]?\s*(\d[\d\s.,]*)/i,
  )
  let paymentTerms = ''
  const endOfMonth = flat.match(/(\d+)\s*(?:jours?|days?|dagen?)\s*(?:fin\s*de\s*mois|fin\s*du\s*mois|end\s*of\s*(?:the\s*)?month|einde\s*(?:van\s*de\s*)?maand|fdm)/)
  const plainDays = flat.match(/(\d+)\s*(?:jours?|days?|dagen?)\b/)
  if (endOfMonth) paymentTerms = `${endOfMonth[1]} jours fin de mois`
  else if (/(comptant|a reception|on receipt|contant|bij ontvangst)/.test(flat)) paymentTerms = 'comptant'
  else if (plainDays) paymentTerms = `${plainDays[1]} jours`

  const fields = {
    supplierName: supplierRaw.replace(/\s+/g, ' ').trim() || null,
    invoiceNumber: numberRaw ? numberRaw.toUpperCase() : null,
    invoiceDate,
    dueDate,
    paymentTerms: paymentTerms || null,
    amountTtc: amountRaw ? parseAmountToken(amountRaw) : null,
    rawText: original,
  }
  let confidence = scoreFields(fields)
  if (flat.replace(/\s/g, '').length < THIN_TEXT) confidence = Math.min(confidence, 0.25)
  return { ...fields, confidence }
}

export function proposeDueDate(extraction, defaultDays = 30) {
  const invoiceDate = extraction?.invoiceDate || null
  const terms = extraction?.paymentTerms || null
  if (extraction?.dueDate) {
    return { dueDate: extraction.dueDate, source: 'pdf', paymentTerms: terms }
  }
  const fromTerms = interpretPaymentTerms(invoiceDate, terms)
  if (fromTerms) return { dueDate: fromTerms, source: 'pdf', paymentTerms: terms }
  if (invoiceDate) {
    return { dueDate: addDays(invoiceDate, defaultDays), source: 'estimee', paymentTerms: terms }
  }
  return { dueDate: null, source: 'estimee', paymentTerms: terms }
}

export function matchSupplierBill(extraction, bills) {
  const open = (bills || []).filter((bill) => !bill.is_paid && !bill.excluded_from_cash)
  const number = normalizeInvoiceNumber(extraction?.invoiceNumber)
  if (number.length >= 3) {
    const hits = open.filter((bill) => normalizeInvoiceNumber(bill.invoice_number) === number)
    if (hits.length > 1) return { bill: null, reason: 'unmatched' }
    if (hits.length === 1) {
      const bill = hits[0]
      const amountMismatch = extraction.amountTtc != null
        && bill.amount_ttc != null
        && !amountsClose(extraction.amountTtc, bill.amount_ttc)
      return { bill, amountMismatch }
    }
  }
  if (extraction?.supplierName && extraction.amountTtc != null) {
    const hits = open.filter((bill) => (
      namesMatch(extraction.supplierName, bill.supplier_name)
      && amountsClose(extraction.amountTtc, bill.amount_ttc)
    ))
    if (hits.length === 1) return { bill: hits[0], amountMismatch: false }
  }
  return { bill: null, reason: 'unmatched' }
}

export function canApplySupplierDue(currentSource, nextSource) {
  if (currentSource === 'manuel') return false
  const current = DUE_RANK[currentSource] || 0
  const next = DUE_RANK[nextSource] || 0
  return next >= current && nextSource !== 'manuel'
}

export function decideSupplierPdf({ extraction, bills, defaultDays = 30 }) {
  const proposal = proposeDueDate(extraction, defaultDays)
  const match = matchSupplierBill(extraction, bills)
  const base = { proposal, extraction, bill: match.bill || null }
  if (!match.bill) return { ...base, action: 'queue', reason: 'unmatched' }
  if (match.amountMismatch) return { ...base, action: 'queue', reason: 'amount_mismatch' }
  const confidence = Number(extraction?.confidence)
  if (!Number.isFinite(confidence) || confidence < PDF_CONFIDENCE_MIN) {
    return { ...base, action: 'queue', reason: 'low_confidence' }
  }
  if (!proposal.dueDate) return { ...base, action: 'keep', reason: 'no_date' }
  if (!canApplySupplierDue(match.bill.due_date_source, proposal.source)) {
    return { ...base, action: 'keep', reason: 'locked' }
  }
  return { ...base, action: 'apply', reason: null }
}

export function needsInvoiceAi(text, extraction) {
  const compact = String(text || '').replace(/\s/g, '').length
  if (compact < THIN_TEXT) return true
  return (extraction?.confidence ?? 0) < PDF_CONFIDENCE_MIN
}

export function mergeInvoiceExtraction(primary, extra) {
  if (!extra) return primary
  const merged = {
    supplierName: primary.supplierName || extra.supplierName || null,
    invoiceNumber: primary.invoiceNumber || extra.invoiceNumber || null,
    invoiceDate: primary.invoiceDate || extra.invoiceDate || null,
    dueDate: primary.dueDate || extra.dueDate || null,
    paymentTerms: primary.paymentTerms || extra.paymentTerms || null,
    amountTtc: primary.amountTtc != null ? primary.amountTtc : (extra.amountTtc ?? null),
    rawText: primary.rawText || '',
  }
  const textScore = primary.confidence ?? 0
  const aiScore = Number(extra.confidence)
  const thin = String(primary.rawText || '').replace(/\s/g, '').length < THIN_TEXT
  const confidence = thin
    ? (Number.isFinite(aiScore) ? aiScore : textScore)
    : Math.max(textScore, Number.isFinite(aiScore) ? aiScore : 0)
  return { ...merged, confidence: Math.round(Math.min(Math.max(confidence, 0), 0.99) * 100) / 100 }
}

function parseAiPayload(raw) {
  if (!raw) return null
  const text = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const amount = data.montant_ttc == null || data.montant_ttc === ''
    ? null
    : parseAmountToken(data.montant_ttc)
  const confidence = Number(data.confiance)
  return {
    supplierName: String(data.fournisseur || '').trim() || null,
    invoiceNumber: String(data.numero || '').trim() || null,
    invoiceDate: parseLooseDate(data.date_facture),
    dueDate: parseLooseDate(data.echeance),
    paymentTerms: String(data.conditions || '').trim() || null,
    amountTtc: amount,
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.5,
  }
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function resolvePdfAiProvider(env = {}) {
  const openai = String(env.OPENAI_API_KEY || '').trim()
  if (openai) {
    return {
      provider: 'openai',
      apiKey: openai,
      model: String(env.OPENAI_PDF_MODEL || '').trim() || 'gpt-4o-mini',
    }
  }
  const anthropic = String(env.ANTHROPIC_API_KEY || '').trim()
  if (anthropic) {
    return {
      provider: 'anthropic',
      apiKey: anthropic,
      model: String(env.ANTHROPIC_PDF_MODEL || '').trim() || 'claude-3-5-haiku-latest',
    }
  }
  return null
}

async function readModelText(response) {
  if (!response.ok) {
    const error = new Error(`ai_http_${response.status}`)
    error.status = response.status
    throw error
  }
  const body = await response.json()
  if (body?.choices) return body.choices[0]?.message?.content || ''
  const block = (body?.content || []).find((part) => part?.type === 'text' || part?.text)
  return block?.text || ''
}

export async function callInvoiceAi({ bytes, text, env, fetchImpl = fetch } = {}) {
  const provider = resolvePdfAiProvider(env)
  if (!provider) return { ok: false, reason: 'no_api_key' }
  const thin = String(text || '').replace(/\s/g, '').length < THIN_TEXT
  const prompt = `${AI_PROMPT}${text && !thin ? `\n\nTexte:\n${String(text).slice(0, 12000)}` : ''}`
  try {
    let response
    if (provider.provider === 'openai') {
      const content = []
      if (thin && bytes?.byteLength) {
        content.push({
          type: 'file',
          file: {
            filename: 'invoice.pdf',
            file_data: `data:application/pdf;base64,${bytesToBase64(bytes)}`,
          },
        })
      }
      content.push({ type: 'text', text: prompt })
      response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0,
          messages: [{ role: 'user', content }],
        }),
      })
    } else {
      const content = []
      if (thin && bytes?.byteLength) {
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: bytesToBase64(bytes),
          },
        })
      }
      content.push({ type: 'text', text: prompt })
      response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 800,
          messages: [{ role: 'user', content }],
        }),
      })
    }
    const raw = await readModelText(response)
    const extraction = parseAiPayload(raw)
    if (!extraction) return { ok: false, reason: 'ai_parse', provider: provider.provider }
    return { ok: true, reason: 'used', provider: provider.provider, extraction }
  } catch (error) {
    return { ok: false, reason: 'ai_failed', provider: provider.provider, message: error?.message || 'ai_failed' }
  }
}

function safeStoragePath(value) {
  const path = String(value || '').trim()
  if (!path || path.length > 240 || path.includes('..') || path.startsWith('/')) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9/_\-. ]*$/.test(path)) return null
  return path
}

function billPatch(decision, path) {
  const patch = { pdf_path: path }
  const confidence = decision.extraction?.confidence
  if (confidence != null) patch.extraction_confidence = confidence
  if (decision.extraction?.paymentTerms) patch.payment_terms = decision.extraction.paymentTerms
  if (!decision.bill.invoice_number && decision.extraction?.invoiceNumber) {
    patch.invoice_number = decision.extraction.invoiceNumber
  }
  if (!decision.bill.invoice_date && decision.extraction?.invoiceDate) {
    patch.invoice_date = decision.extraction.invoiceDate
  }
  if (decision.action === 'apply' && decision.proposal.dueDate) {
    patch.due_date = decision.proposal.dueDate
    patch.due_date_source = decision.proposal.source
  }
  return patch
}

function reviewRow(decision, meta, userId) {
  const source = decision.proposal?.source
  return {
    bill_id: decision.bill?.id || null,
    pdf_path: meta.path,
    file_name: meta.fileName || null,
    supplier_name: decision.extraction?.supplierName || null,
    invoice_number: decision.extraction?.invoiceNumber || null,
    invoice_date: decision.extraction?.invoiceDate || null,
    amount_ttc: decision.extraction?.amountTtc ?? null,
    proposed_due_date: decision.proposal?.dueDate || null,
    proposed_source: source === 'pdf' || source === 'estimee' ? source : null,
    payment_terms: decision.extraction?.paymentTerms || null,
    confidence: decision.extraction?.confidence ?? null,
    reason: decision.reason,
    status: 'pending',
    created_by: userId,
  }
}

export async function applyExtractedInvoice({ extraction, bills, db, meta, userId, defaultDays }) {
  const decision = decideSupplierPdf({ extraction, bills, defaultDays })
  if (decision.action === 'queue') {
    await db.insertReview(reviewRow(decision, meta, userId))
    if (decision.bill) await db.updateBill(decision.bill.id, { pdf_path: meta.path })
    return {
      status: 'queued',
      reason: decision.reason,
      bill_id: decision.bill?.id || null,
      proposed_due_date: decision.proposal.dueDate,
      path: meta.path,
    }
  }
  await db.updateBill(decision.bill.id, billPatch(decision, meta.path))
  return {
    status: decision.action,
    reason: decision.reason,
    bill_id: decision.bill.id,
    due_date: decision.action === 'apply' ? decision.proposal.dueDate : decision.bill.due_date,
    due_date_source: decision.action === 'apply' ? decision.proposal.source : decision.bill.due_date_source,
    path: meta.path,
  }
}

async function readPaths(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return { error: 'invalid_body' }
  }
  const list = Array.isArray(body?.paths) ? body.paths : []
  if (!list.length) return { error: 'paths_missing' }
  if (list.length > MAX_FILES) return { error: 'too_many_files' }
  const paths = []
  for (const value of list) {
    const path = safeStoragePath(value)
    if (!path) return { error: 'invalid_path' }
    paths.push(path)
  }
  return { paths }
}

export async function handleTresoPdfExtract(req, deps) {
  const cors = deps.corsHeaders
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(cors, { error: 'Method not allowed' }, 405)

  const caller = await deps.requireCaller(req)
  if (caller instanceof Response) return caller
  if (!caller?.userId) return json(cors, { error: 'Unauthorized' }, 401)

  const payload = await readPaths(req)
  if (payload.error === 'paths_missing') {
    return json(cors, { error: 'paths_missing', message: 'Aucun PDF.' }, 400)
  }
  if (payload.error) return json(cors, { error: payload.error, message: 'Requête illisible.' }, 400)

  try {
    const settings = await deps.db.getSettings()
    const defaultDays = Number(settings?.supplier_default_due_days) || 30
    let bills = await deps.db.listOpenBills()
    const items = []
    for (const path of payload.paths) {
      const fileName = path.split('/').pop() || path
      try {
        const bytes = await deps.download(path)
        if (!bytes?.byteLength) {
          items.push({ path, status: 'error', error: 'empty' })
          continue
        }
        if (bytes.byteLength > MAX_BYTES) {
          items.push({ path, status: 'error', error: 'file_too_large' })
          continue
        }
        const text = await deps.extractText(bytes)
        let extraction = parseInvoiceText(text)
        let ai = 'skipped'
        if (needsInvoiceAi(text, extraction) && deps.callAi) {
          const result = await deps.callAi({ bytes, text })
          ai = result?.reason || 'ai_failed'
          if (result?.ok && result.extraction) {
            extraction = mergeInvoiceExtraction(extraction, result.extraction)
            ai = 'used'
          }
        }
        const item = await applyExtractedInvoice({
          extraction,
          bills,
          db: deps.db,
          meta: { path, fileName },
          userId: caller.userId,
          defaultDays,
        })
        if (item.status === 'apply' && item.bill_id) {
          const current = bills.find((bill) => bill.id === item.bill_id)
          if (current) {
            current.due_date = item.due_date
            current.due_date_source = item.due_date_source
            if (!current.invoice_number && extraction.invoiceNumber) current.invoice_number = extraction.invoiceNumber
          }
        }
        items.push({ ...item, file_name: fileName, ai, confidence: extraction.confidence })
      } catch (error) {
        items.push({ path, status: 'error', error: error?.message || 'extract_failed' })
      }
    }
    return json(cors, {
      ok: true,
      applied: items.filter((item) => item.status === 'apply').length,
      queued: items.filter((item) => item.status === 'queued').length,
      kept: items.filter((item) => item.status === 'keep').length,
      errors: items.filter((item) => item.status === 'error').length,
      items,
    })
  } catch (error) {
    console.error('treso-pdf-extract', error?.message || error)
    return json(cors, { error: 'extract_failed', message: error?.message || 'Lecture impossible.' }, 500)
  }
}

export function supabasePdfDb(admin) {
  return {
    async getSettings() {
      const { data, error } = await admin.from('treso_settings').select('supplier_default_due_days').eq('id', 1).maybeSingle()
      if (error) throw error
      return data
    },
    async listOpenBills() {
      const { data, error } = await admin.from('treso_supplier_bills')
        .select('id, supplier_name, invoice_number, invoice_date, booking_date, amount_ttc, due_date, due_date_source, is_paid, excluded_from_cash, pdf_path')
        .eq('is_paid', false)
      if (error) throw error
      return data || []
    },
    async updateBill(id, patch) {
      const { error } = await admin.from('treso_supplier_bills').update(patch).eq('id', id)
      if (error) throw error
    },
    async insertReview(row) {
      const { error } = await admin.from('treso_supplier_pdf_reviews').insert(row)
      if (error) throw error
    },
  }
}
