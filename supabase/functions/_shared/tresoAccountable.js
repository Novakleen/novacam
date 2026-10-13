/**
 * Accountable .xlsx import (v1.18).
 * One module for the edge function and for node:test.
 * No row contents from real exports belong in this file.
 */

import { extractInvoiceNumbers } from './tresoMatch.js'

const TX_SHEET = 'transactions'
const EXPENSE_SHEET = 'depenses'
const FACTURE_SHEET = 'factures'

const TX_COLUMNS = [
  ['date', 'date de transaction'],
  ['account', 'numero de compte'],
  ['communication', 'communication'],
  ['amount', 'montant'],
  ['counterparty', 'nom contrepartie'],
  ['counterpartyAccount', 'compte contrepartie'],
]

const EXPENSE_COLUMNS = [
  ['date', 'date comptable'],
  ['supplier', 'nom du fournisseur'],
  ['amount', 'montant total'],
  ['category', 'description du code'],
  ['paid', 'paye'],
]

const FACTURE_COLUMNS = [
  ['number', 'numero de revenue'],
  ['type', 'facture type'],
  ['status', 'statut'],
  ['date', 'date de facturation'],
  ['due', 'echeance'],
  ['ht', 'montant htva'],
  ['total', 'montant total'],
]

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeAccount(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase()
}

export function canonicalAmount(value) {
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return (Math.round(n * 100) / 100).toFixed(2)
}

export function parseIsoDate(value) {
  const s = String(value ?? '').trim()
  let iso = null
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (dmy) iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s
  else if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Math.round(Number(s))
    if (serial > 20000 && serial < 80000) {
      const utc = Date.UTC(1899, 11, 30) + serial * 86400000
      iso = new Date(utc).toISOString().slice(0, 10)
    }
  }
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return iso
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export async function sha256Hex(bytes) {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Text(text) {
  return sha256Hex(new TextEncoder().encode(text))
}

function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseSharedStrings(xml) {
  const out = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1]))
    out.push(texts.join(''))
  }
  return out
}

function parseSheetRows(xml, sharedStrings) {
  const rows = []
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
  let rm
  while ((rm = rowRe.exec(xml))) {
    const cells = new Map()
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cm
    while ((cm = cellRe.exec(rm[2]))) {
      const attrs = cm[1]
      const body = cm[2] ?? ''
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)
      if (!ref) continue
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? ''
      let value = ''
      if (type === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1])).join('')
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)
        value = v ? decodeXml(v[1]) : ''
        if (type === 's') value = sharedStrings[Number(value)] ?? ''
      }
      cells.set(ref[1], value)
    }
    rows.push({ index: Number(rm[1]), cells })
  }
  return rows
}

function columnIndex(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function sheetToObjects(xml, sharedStrings) {
  const parsed = parseSheetRows(xml, sharedStrings)
  if (!parsed.length) return { headers: [], rows: [] }
  const header = parsed[0]
  const headers = [...header.cells.entries()]
    .sort((a, b) => columnIndex(a[0]) - columnIndex(b[0]))
    .map(([, value]) => String(value ?? '').trim())
  const letters = [...header.cells.keys()]
  const rows = []
  for (const row of parsed.slice(1)) {
    const obj = {}
    let any = false
    for (const letter of letters) {
      const key = String(header.cells.get(letter) ?? '').trim()
      if (!key) continue
      const value = row.cells.get(letter) ?? ''
      obj[key] = value
      if (String(value).trim() !== '') any = true
    }
    if (any) rows.push(obj)
  }
  return { headers, rows }
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const files = new Map()
  let offset = 0
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    let compSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen))
    const dataStart = nameStart + nameLen + extraLen
    if ((flags & 0x8) && compSize === 0) {
      throw new Error('xlsx data descriptor without sizes is not supported')
    }
    const comp = bytes.subarray(dataStart, dataStart + compSize)
    let raw = comp
    if (method === 8) raw = await inflateRaw(comp)
    else if (method !== 0) throw new Error(`unsupported xlsx compression method ${method}`)
    files.set(name.replace(/^\/+/, ''), raw)
    offset = dataStart + compSize
    if (flags & 0x8) {
      if (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x08074b50) offset += 4
      offset += 12
    }
  }
  return files
}

function xmlText(bytes) {
  return new TextDecoder().decode(bytes)
}

function tagAttrs(tag) {
  const out = {}
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

export async function readXlsxSheets(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const zip = await readZip(u8)
  const workbook = zip.get('xl/workbook.xml')
  const rels = zip.get('xl/_rels/workbook.xml.rels')
  if (!workbook || !rels) {
    return { ok: false, error: 'invalid_xlsx', message: 'Fichier Excel illisible.' }
  }
  const relMap = new Map()
  const relXml = xmlText(rels)
  for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = tagAttrs(m[0])
    if (attrs.Id && attrs.Target) relMap.set(attrs.Id, attrs.Target.replace(/^\/+/, ''))
  }
  const shared = zip.get('xl/sharedStrings.xml')
  const sharedStrings = shared ? parseSharedStrings(xmlText(shared)) : []
  const sheets = []
  const wbXml = xmlText(workbook)
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const attrs = tagAttrs(m[0])
    const rid = attrs['r:id'] || attrs.id
    const target = relMap.get(rid)
    if (!attrs.name || !target) continue
    const path = target.startsWith('xl/') ? target : `xl/${target}`
    const sheetBytes = zip.get(path)
    if (!sheetBytes) continue
    const { headers, rows } = sheetToObjects(xmlText(sheetBytes), sharedStrings)
    sheets.push({ name: attrs.name, headers, rows })
  }
  return { ok: true, sheets }
}

function findSheet(sheets, normalizedName) {
  return sheets.find((sheet) => normalizeText(sheet.name) === normalizedName) ?? null
}

function headerMap(headers) {
  const map = new Map()
  headers.forEach((header, index) => {
    const key = normalizeText(header)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

function missingColumn(headers, columns) {
  const map = headerMap(headers)
  for (const [, label] of columns) {
    if (!map.has(label)) return label
  }
  return null
}

function pick(row, headers, label) {
  const wanted = normalizeText(label)
  for (const header of headers) {
    if (normalizeText(header) === wanted) return row[header] ?? ''
  }
  return ''
}

function dueColumn(headers) {
  return headers.find((header) => normalizeText(header).includes('echeance')) ?? null
}

function isBelgianIban(account) {
  return /^BE\d{14}$/.test(normalizeAccount(account))
}

function paidFlag(value) {
  const s = normalizeText(value)
  if (['oui', 'yes', 'true', '1', 'paid', 'paye'].includes(s)) return true
  if (['non', 'no', 'false', '0', 'unpaid', 'impaye'].includes(s)) return false
  return null
}

function factureStatus(value) {
  const s = normalizeText(value)
  if (s === 'paye' || s === 'paid') return 'Payé'
  if (s === 'envoye' || s === 'sent') return 'Envoyé'
  return null
}

function factureType(value) {
  const s = normalizeText(value).replace(/\s+/g, '-')
  if (s === 'invoice' || s === 'facture') return 'invoice'
  if (s === 'credit-note' || s === 'note-de-credit') return 'credit-note'
  return null
}

function parseFactureSheet(sheet) {
  const missing = missingColumn(sheet.headers, FACTURE_COLUMNS)
  if (missing) {
    return {
      ok: false,
      error: 'missing_column',
      sheet: 'Factures',
      column: missing,
      message: `Colonne obligatoire manquante : Factures / ${missing}.`,
    }
  }
  const label = Object.fromEntries(FACTURE_COLUMNS)
  const groups = new Map()
  let skipped = 0
  for (const row of sheet.rows) {
    const numbers = extractInvoiceNumbers(pick(row, sheet.headers, label.number))
    const type = factureType(pick(row, sheet.headers, label.type))
    const status = factureStatus(pick(row, sheet.headers, label.status))
    const invoiceDate = parseIsoDate(pick(row, sheet.headers, label.date))
    const amount = canonicalAmount(pick(row, sheet.headers, label.total))
    const htText = String(pick(row, sheet.headers, label.ht) ?? '').trim()
    let amountHt = 0
    if (htText) {
      const parsedHt = canonicalAmount(htText)
      if (parsedHt == null) {
        skipped += 1
        continue
      }
      amountHt = Number(parsedHt)
    }
    if (!numbers.length || !type || !status || !invoiceDate || amount == null) {
      skipped += 1
      continue
    }
    const dueText = String(pick(row, sheet.headers, label.due) ?? '').trim()
    const dueDate = dueText ? parseIsoDate(dueText) : null
    const key = numbers[0]
    const amountTtc = Number(amount)
    const prev = groups.get(key)
    if (!prev) {
      groups.set(key, {
        invoiceNumber: key,
        type,
        status,
        invoiceDate,
        dueDate,
        amountHt,
        amountTtc,
        lineCount: 1,
      })
      continue
    }
    prev.amountTtc = Math.round((prev.amountTtc + amountTtc) * 100) / 100
    prev.amountHt = Math.round((prev.amountHt + amountHt) * 100) / 100
    prev.lineCount += 1
    if (invoiceDate < prev.invoiceDate) prev.invoiceDate = invoiceDate
    if (!prev.dueDate && dueDate) prev.dueDate = dueDate
    if (type === 'invoice') prev.type = 'invoice'
    if (status === 'Envoyé') prev.status = 'Envoyé'
  }
  const factures = [...groups.values()]
  const dates = factures.map((row) => row.invoiceDate).filter(Boolean).sort()
  return {
    ok: true,
    factures,
    facturesSkipped: skipped,
    facturesDateMin: dates[0] ?? null,
  }
}

/**
 * Rows that share account|date|amount|counterparty|communication are the
 * exact duplicates described in the spec (67 rows sit in such groups in the
 * current export). The first row of each group is kept; the hash includes
 * occurrence rank 1, as specified.
 */
export async function interpretAccountableSheets(sheets, { supplierDefaultDueDays = 30 } = {}) {
  const txSheet = findSheet(sheets, TX_SHEET)
  const expSheet = findSheet(sheets, EXPENSE_SHEET)
  if (!txSheet) {
    return { ok: false, error: 'missing_column', sheet: 'Transactions', column: 'Date De Transaction', message: 'Onglet Transactions manquant.' }
  }
  if (!expSheet) {
    return { ok: false, error: 'missing_column', sheet: 'Dépenses', column: 'Date Comptable', message: 'Onglet Dépenses manquant.' }
  }
  const txMissing = missingColumn(txSheet.headers, TX_COLUMNS)
  if (txMissing) {
    return {
      ok: false,
      error: 'missing_column',
      sheet: 'Transactions',
      column: txMissing,
      message: `Colonne obligatoire manquante : Transactions / ${txMissing}.`,
    }
  }
  const expMissing = missingColumn(expSheet.headers, EXPENSE_COLUMNS)
  if (expMissing) {
    return {
      ok: false,
      error: 'missing_column',
      sheet: 'Dépenses',
      column: expMissing,
      message: `Colonne obligatoire manquante : Dépenses / ${expMissing}.`,
    }
  }

  const factureSheet = findSheet(sheets, FACTURE_SHEET)
  let facturesPresent = false
  let factures = []
  let facturesSkipped = 0
  let facturesDateMin = null
  if (factureSheet) {
    facturesPresent = true
    const parsedFactures = parseFactureSheet(factureSheet)
    if (!parsedFactures.ok) return parsedFactures
    factures = parsedFactures.factures
    facturesSkipped = parsedFactures.facturesSkipped
    facturesDateMin = parsedFactures.facturesDateMin
  }

  const txLabel = Object.fromEntries(TX_COLUMNS)
  let transactionSkipped = 0
  const validTx = []
  for (const row of txSheet.rows) {
    const date = parseIsoDate(pick(row, txSheet.headers, txLabel.date))
    const amount = canonicalAmount(pick(row, txSheet.headers, txLabel.amount))
    const account = normalizeAccount(pick(row, txSheet.headers, txLabel.account))
    if (!date || amount == null || !account) {
      transactionSkipped += 1
      continue
    }
    validTx.push({
      bookingDate: date,
      amount: Number(amount),
      accountNumber: account,
      communication: String(pick(row, txSheet.headers, txLabel.communication) ?? '').trim(),
      counterpartyName: String(pick(row, txSheet.headers, txLabel.counterparty) ?? '').trim(),
      counterpartyIban: normalizeAccount(pick(row, txSheet.headers, txLabel.counterpartyAccount)) || null,
    })
  }

  const groups = new Map()
  for (const row of validTx) {
    const identity = [
      row.accountNumber,
      row.bookingDate,
      canonicalAmount(row.amount),
      normalizeText(row.counterpartyName),
      normalizeText(row.communication),
    ].join('|')
    if (!groups.has(identity)) groups.set(identity, [])
    groups.get(identity).push(row)
  }

  let exactDuplicates = 0
  let inFileDuplicateExtras = 0
  const transactions = []
  for (const [identity, list] of groups) {
    if (list.length > 1) exactDuplicates += list.length
    inFileDuplicateExtras += list.length - 1
    const row = list[0]
    row.dedupHash = await sha256Text(`${identity}|1`)
    row.isInternalTransfer = false
    row.excludedFromCash = false
    transactions.push(row)
  }

  const reloads = []
  for (const row of transactions) {
    const text = normalizeText(`${row.counterpartyName} ${row.communication}`)
    if (text.includes('visa') && row.amount < 0 && isBelgianIban(row.accountNumber)) {
      row.isInternalTransfer = true
      row.excludedFromCash = true
      reloads.push(row)
    }
  }
  for (const row of transactions) {
    if (row.isInternalTransfer || isBelgianIban(row.accountNumber) || !(row.amount > 0)) continue
    const match = reloads.find((reload) => !reload.paired
      && reload.bookingDate === row.bookingDate
      && canonicalAmount(reload.amount) === canonicalAmount(-row.amount))
    if (match) {
      match.paired = true
      row.isInternalTransfer = true
      row.excludedFromCash = true
    }
  }
  for (const row of transactions) delete row.paired

  const dates = validTx.map((row) => row.bookingDate).sort()
  const expLabel = Object.fromEntries(EXPENSE_COLUMNS)
  const echeanceHeader = dueColumn(expSheet.headers)
  let expenseSkipped = 0
  const expenseGroups = new Map()
  for (const row of expSheet.rows) {
    const date = parseIsoDate(pick(row, expSheet.headers, expLabel.date))
    const amount = canonicalAmount(pick(row, expSheet.headers, expLabel.amount))
    const paid = paidFlag(pick(row, expSheet.headers, expLabel.paid))
    const supplier = String(pick(row, expSheet.headers, expLabel.supplier) ?? '').trim()
    if (!date || amount == null || paid == null || !supplier) {
      expenseSkipped += 1
      continue
    }
    const category = String(pick(row, expSheet.headers, expLabel.category) ?? '').trim()
    const dueRaw = echeanceHeader ? row[echeanceHeader] : ''
    const dueDate = dueRaw ? parseIsoDate(dueRaw) : null
    const identity = [
      date,
      normalizeText(supplier),
      amount,
      normalizeText(category),
    ].join('|')
    if (!expenseGroups.has(identity)) expenseGroups.set(identity, [])
    expenseGroups.get(identity).push({
      supplierName: supplier,
      bookingDate: date,
      amountTtc: Number(amount),
      category,
      isPaid: paid,
      dueDate,
    })
  }

  let expenseInFileExtras = 0
  const expenses = []
  for (const [identity, list] of expenseGroups) {
    expenseInFileExtras += list.length - 1
    const unpaid = list.filter((row) => !row.isPaid)
    const chosen = unpaid[0] || list[list.length - 1]
    const dueFromExport = list.map((row) => row.dueDate).find(Boolean) || null
    const dueDate = dueFromExport || addDays(chosen.bookingDate, supplierDefaultDueDays)
    expenses.push({
      supplierName: chosen.supplierName,
      bookingDate: chosen.bookingDate,
      invoiceDate: chosen.bookingDate,
      amountTtc: chosen.amountTtc,
      category: chosen.category,
      isPaid: unpaid.length ? false : true,
      dueDate,
      dueDateSource: dueFromExport ? 'export' : 'estimee',
      rowHash: await sha256Text(`${identity}|1`),
    })
  }

  return {
    ok: true,
    transactions,
    transactionRowsTotal: txSheet.rows.length,
    transactionSkipped,
    exactDuplicates,
    inFileDuplicateExtras,
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
    internalTransfers: transactions.filter((row) => row.isInternalTransfer).length,
    expenses,
    expenseRowsTotal: expSheet.rows.length,
    expenseSkipped,
    expenseInFileExtras,
    factures,
    facturesPresent,
    facturesSkipped,
    facturesDateMin,
  }
}

export async function parseAccountableXlsx(bytes, options) {
  const read = await readXlsxSheets(bytes)
  if (!read.ok) return read
  return interpretAccountableSheets(read.sheets, options)
}

export function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function belgianHolidaySet(year) {
  const easter = easterSunday(year)
  const set = new Set([
    `${year}-01-01`,
    addDays(easter, 1),
    `${year}-05-01`,
    addDays(easter, 39),
    addDays(easter, 50),
    `${year}-07-21`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ])
  return set
}

export function isBelgianWorkingDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return !belgianHolidaySet(y).has(iso)
}

/** Working days after dataIso, up to and including todayIso. */
export function belgianWorkingDaysSince(dataIso, todayIso) {
  if (!dataIso || !todayIso || todayIso <= dataIso) return 0
  let count = 0
  let cursor = addDays(dataIso, 1)
  while (cursor <= todayIso) {
    if (isBelgianWorkingDay(cursor)) count += 1
    cursor = addDays(cursor, 1)
  }
  return count
}

export function isBankDataStale(dataIso, todayIso, staleAfterBusinessDays = 2) {
  return belgianWorkingDaysSince(dataIso, todayIso) > staleAfterBusinessDays
}
