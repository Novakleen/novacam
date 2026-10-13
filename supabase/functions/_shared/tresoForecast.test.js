import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceCommitments,
  classifyImportedBill,
  clientInvoiceRemaining,
  formatBrusselsDateTime,
  interpretPaymentTerms,
  isClientInvoiceOpen,
  presentLastImport,
  projectTreasury,
  projectWhatIf,
  resolveSupplierDueDate,
  seasonalityFromHistory,
} from './tresoForecast.js'

const AS_OF = '2026-10-12'

const SETTINGS = {
  collection_delay_days: 8,
  alert_threshold: 0,
  usual_revenue_ht_month: 27446.16,
  ttc_ratio: 1.0588,
  probable_enabled: true,
  probable_start_date: '2026-10-09',
  danny_rate: 0.075,
  danny_day: 13,
  withholding_rate: 0.28,
  withholding_due_day: 6,
  stale_after_business_days: 2,
  supplier_default_due_days: 30,
  horizon_weeks: 13,
  seasonality_coefficients: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
}

function commitment(row) {
  return {
    direction: 'out',
    is_active: true,
    excluded_from_cash: false,
    spread_weekly: false,
    amount_rule: 'fixed',
    end_date: null,
    remaining_occurrences: null,
    match_pattern: null,
    ...row,
  }
}

function prototypeInput(extra = {}) {
  const burghartDue = resolveSupplierDueDate({
    invoiceDate: '2026-09-30',
    paymentTerms: '30 jours fin de mois',
  })
  return {
    asOf: AS_OF,
    settings: SETTINGS,
    accounts: [
      { id: 'belfius', include_in_cash: true, is_active: true },
      { id: 'visa', include_in_cash: true, is_active: true },
    ],
    snapshots: [
      { account_id: 'belfius', balance_date: '2026-10-09', balance: 2651.62, source: 'manuel' },
      { account_id: 'visa', balance_date: '2026-10-09', balance: 0, source: 'manuel' },
    ],
    transactions: [],
    commitments: [
      commitment({ id: 'danny', label: 'Danny variable', counterparty: 'Danny Joosten', category: 'salaires', amount: null, frequency: 'monthly', day_of_month: 13, next_due_date: '2026-11-13', amount_rule: 'danny', match_pattern: 'remuneration danny|rem danny' }),
      commitment({ id: 'secretariat', label: 'Secrétariat social', counterparty: 'Secrétariat social agréé n°924 (SSE Steunt / Secrétariat social)', amount: 2225.23, frequency: 'monthly', day_of_month: 14, next_due_date: '2026-10-14' }),
      commitment({ id: 'martin', label: 'Martin Provoyeur', counterparty: 'Martin Provoyeur', amount: 2057.28, frequency: 'monthly', day_of_month: 5, next_due_date: '2026-11-05' }),
      commitment({ id: 'daniel', label: 'Daniel Pieczko', counterparty: 'Daniel Pieczko', amount: 1799.31, frequency: 'monthly', day_of_month: 5, next_due_date: '2026-11-05' }),
      commitment({ id: 'drivio', label: 'Drivio', counterparty: 'Drivio', amount: 1579.05, frequency: 'monthly', day_of_month: 24, next_due_date: '2026-10-24' }),
      commitment({ id: 'precompte', label: 'Précompte', counterparty: 'SPF Finances', amount: null, frequency: 'quarterly', day_of_month: 6, next_due_date: '2027-01-06', amount_rule: 'precompte', match_pattern: 'precompte' }),
      commitment({ id: 'loan20', label: 'Prêt 20k', counterparty: 'Rémy Gierech', amount: 555, frequency: 'monthly', day_of_month: 10, next_due_date: '2026-10-10', remaining_occurrences: 4, match_pattern: 'pret 20' }),
      commitment({ id: 'sofibel', label: 'Sofibel', counterparty: 'Sofibel', amount: 302.5, frequency: 'monthly', day_of_month: 14, next_due_date: '2026-10-14' }),
      commitment({ id: 'sofibel-year', label: 'Sofibel annuel', counterparty: 'Sofibel', amount: 3025, frequency: 'yearly', day_of_month: 7, next_due_date: '2027-01-07' }),
      commitment({ id: 'danny-fixed', label: 'Danny fixe', counterparty: 'Danny Joosten', amount: 250, frequency: 'monthly', day_of_month: 13, next_due_date: '2026-10-13', match_pattern: 'defraiement' }),
      commitment({ id: 'monizze', label: 'Monizze', counterparty: 'Monizze', amount: 201.33, frequency: 'monthly', day_of_month: 6, next_due_date: '2026-11-06' }),
      commitment({ id: 'openai', label: 'OpenAI', counterparty: 'OpenAI', amount: 155.29, frequency: 'monthly', day_of_month: 16, next_due_date: null, spread_weekly: true }),
      commitment({ id: 'axa-a', label: 'AXA 913851', counterparty: 'AXA', amount: 155.25, frequency: 'monthly', day_of_month: 26, next_due_date: '2026-10-26' }),
      commitment({ id: 'axa-b', label: 'AXA 912671', counterparty: 'AXA', amount: 155.25, frequency: 'monthly', day_of_month: 26, next_due_date: '2026-10-26' }),
      commitment({ id: 'axa-c', label: 'AXA 810811', counterparty: 'AXA', amount: 155.15, frequency: 'monthly', day_of_month: 9, next_due_date: '2026-10-09' }),
      commitment({ id: 'canva', label: 'Canva', counterparty: 'Canva', amount: 136.99, frequency: 'monthly', day_of_month: 24, next_due_date: null, spread_weekly: true }),
      commitment({ id: 'axa-q', label: 'AXA trimestriel', counterparty: 'AXA Belgium', amount: 361.69, frequency: 'quarterly', day_of_month: 25, next_due_date: '2026-11-20' }),
      commitment({ id: 'telenet', label: 'Telenet', counterparty: 'Telenet', amount: 108.72, frequency: 'monthly', day_of_month: 13, next_due_date: '2026-10-13' }),
      commitment({ id: 'cursor', label: 'Cursor', counterparty: 'Cursor', amount: 104.64, frequency: 'monthly', day_of_month: 5, next_due_date: null, spread_weekly: true }),
      commitment({ id: 'companycam', label: 'CompanyCam', counterparty: 'CompanyCam', amount: 84.79, frequency: 'monthly', day_of_month: 11, next_due_date: '2026-10-11' }),
      commitment({ id: 'mensura', label: 'Mensura', counterparty: 'Mensura', amount: 168.75, frequency: 'quarterly', day_of_month: 18, next_due_date: '2026-12-14' }),
      commitment({ id: 'axa-year', label: 'AXA annuel', counterparty: 'AXA Belgium', amount: 383.29, frequency: 'yearly', day_of_month: 20, next_due_date: '2027-03-20' }),
      commitment({ id: 'grok', label: 'Grok', counterparty: 'Grok / xAI', amount: 26.82, frequency: 'monthly', day_of_month: 11, next_due_date: null, spread_weekly: true }),
      commitment({ id: 'tally', label: 'Tally', counterparty: 'Tally', amount: 22.69, frequency: 'monthly', day_of_month: 28, next_due_date: '2026-10-28' }),
      commitment({ id: 'google', label: 'Google', counterparty: 'Google (Google One / Workspace ?)', amount: 21.99, frequency: 'monthly', day_of_month: 8, next_due_date: '2026-10-08' }),
      commitment({ id: 'buffer', label: 'Buffer', counterparty: 'Buffer', amount: 21.26, frequency: 'monthly', day_of_month: 12, next_due_date: '2026-10-12' }),
      commitment({ id: 'vikings', label: 'Mobile Vikings', counterparty: 'Mobile Vikings', amount: 15, frequency: 'monthly', day_of_month: 24, next_due_date: '2026-09-24' }),
      commitment({ id: 'belfius-fee', label: 'Belfius frais', counterparty: 'Belfius', amount: 13.62, frequency: 'monthly', day_of_month: 6, next_due_date: '2026-11-06' }),
      commitment({ id: 'radius', label: 'Radius', counterparty: 'Radius', amount: 2302.27, frequency: 'monthly', day_of_month: 16, next_due_date: '2026-10-12', spread_weekly: true, kind: 'variable' }),
      commitment({ id: 'meta', label: 'Meta', counterparty: 'Meta / Facebook Ads', amount: 1940.18, frequency: 'monthly', day_of_month: 17, next_due_date: '2026-10-12', spread_weekly: true, kind: 'variable' }),
      commitment({ id: 'eurabo', label: 'EURABO', counterparty: 'EURABO (direct + via Mollie 912,23)', amount: 1938.49, frequency: 'monthly', day_of_month: 15, next_due_date: '2026-11-15' }),
      commitment({ id: 'anthony', label: 'Anthony Jarosik', counterparty: 'Anthony Jarosik', amount: 868.36, frequency: 'monthly', day_of_month: 17, next_due_date: '2026-11-17' }),
      commitment({ id: 'burghart', label: 'Burghart', counterparty: 'Bastien Burghart', amount: 778.06, frequency: 'monthly', day_of_month: 8, next_due_date: '2026-10-08' }),
      commitment({ id: 'vm', label: 'V&M', counterparty: 'V & M Collective', amount: 719.63, frequency: 'monthly', day_of_month: 24, next_due_date: '2026-10-24' }),
      commitment({ id: 'loan225', label: 'Prêt 22,5k', counterparty: 'Prêt 22,5k', amount: 625, frequency: 'monthly', day_of_month: 10, next_due_date: '2026-10-10', remaining_occurrences: 36, match_pattern: 'pret 22' }),
    ],
    invoices: [
      { id: 'i1', client_name: 'Client 1', invoice_date: '2026-05-29', amount_ttc: 810.9, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'i2', client_name: 'Client 2', invoice_date: '2026-07-08', amount_ttc: 449.72, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'i3', client_name: 'Client 3', invoice_date: '2026-07-31', amount_ttc: 913.87, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'i4', client_name: 'Client 4', invoice_date: '2026-08-18', amount_ttc: 3079.84, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'i5', client_name: 'Client 5', invoice_date: '2026-08-25', amount_ttc: 513.46, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'i6', client_name: 'Client 6', invoice_date: '2026-09-25', amount_ttc: 1766.04, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'i7', client_name: 'Client 7', invoice_date: '2026-10-07', amount_ttc: 2592, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'q1', client_name: 'Quimesis', invoice_date: '2026-07-09', amount_ttc: 16131.72, excluded_from_cash: true },
      { id: 'q2', client_name: 'Quimesis', invoice_date: '2026-07-09', amount_ttc: 1908.48, excluded_from_cash: true },
    ],
    supplierBills: [
      { id: 'b1', supplier_name: 'Secrétariat social agréé 924', invoice_date: '2026-10-08', due_date: '2026-10-22', amount_ttc: 65.13 },
      { id: 'b2', supplier_name: 'SA Deckers', invoice_date: '2026-10-06', due_date: '2026-10-06', amount_ttc: 428.85 },
      { id: 'b3', supplier_name: 'Secrétariat social agréé 924', invoice_date: '2026-10-02', due_date: '2026-10-16', amount_ttc: 146.56 },
      { id: 'b4', supplier_name: 'Secrétariat social agréé 924', invoice_date: '2026-10-02', due_date: '2026-10-15', amount_ttc: 1069.29 },
      { id: 'b5', supplier_name: 'Belfius', invoice_date: '2026-10-01', due_date: '2026-10-01', amount_ttc: 0.26 },
      { id: 'b6', supplier_name: 'V&M Collective', invoice_date: '2026-10-01', due_date: '2026-10-31', amount_ttc: 997.04 },
      { id: 'b7', supplier_name: 'Sofibel', invoice_date: '2026-10-01', due_date: '2026-10-31', amount_ttc: 302.5 },
      { id: 'b8', supplier_name: 'Bastien Burghart', invoice_date: '2026-09-30', due_date: burghartDue.dueDate, due_date_source: burghartDue.source, amount_ttc: 808.9, payment_terms: '30 jours fin de mois' },
      { id: 'b9', supplier_name: 'Telenet', invoice_date: '2026-09-28', due_date: '2026-10-28', amount_ttc: 108.66 },
      { id: 'b10', supplier_name: 'Mobile Vikings', invoice_date: '2026-09-20', due_date: '2026-10-03', amount_ttc: 25 },
      { id: 'b11', supplier_name: 'Quimesis', invoice_date: '2026-10-01', due_date: '2026-10-12', amount_ttc: 5000, excluded_from_cash: true },
    ],
    jobs: [],
    cashEvents: [],
    ...extra,
  }
}

const EXPECTED_SURE = [8317.49, 5581.49, 1954.39, -3994.01, -13395.43, -15702.29, -19425.97, -24574.33, -30309.57, -36889.71, -40590.71, -41690.21, -53727.87]
const EXPECTED_PROBABLE = [10233.53, 14203.69, 17282.74, 18040.49, 15345.23, 19744.52, 22726.99, 24284.78, 25255.69, 25381.70, 28386.86, 33993.51, 28662.00]

function near(actual, expected, label) {
  const diff = Math.abs(actual - expected)
  const limit = Math.max(Math.abs(expected) * 0.01, 50)
  assert.ok(diff <= limit, `${label}: ${actual} vs ${expected} (écart ${diff.toFixed(2)}, plafond ${limit.toFixed(2)})`)
}

function sumOn(result, predicate) {
  return Math.round(result.flows.filter(predicate).reduce((sum, flow) => sum + flow.amount, 0) * 100) / 100
}

test('payment terms: 30 jours fin de mois and priority', () => {
  assert.equal(interpretPaymentTerms('2026-09-30', '30 jours fin de mois'), '2026-10-31')
  assert.equal(interpretPaymentTerms('2026-09-30', '30 days end of month'), '2026-10-31')
  assert.equal(interpretPaymentTerms('2026-10-02', '15 jours'), '2026-10-17')
  assert.equal(interpretPaymentTerms('2026-10-06', 'comptant'), '2026-10-06')
  assert.equal(interpretPaymentTerms('2026-10-06', 'à réception'), '2026-10-06')
  const manual = resolveSupplierDueDate({
    manualDate: '2026-10-15',
    pdfDate: '2026-10-31',
    invoiceDate: '2026-09-30',
    paymentTerms: '30 jours fin de mois',
  })
  assert.equal(manual.source, 'manuel')
  assert.equal(manual.dueDate, '2026-10-15')
  const estimated = resolveSupplierDueDate({ invoiceDate: '2026-10-01', defaultDays: 30 })
  assert.equal(estimated.source, 'estimee')
  assert.equal(estimated.dueDate, '2026-10-31')
  assert.equal(estimated.estimated, true)
})

test('prototype 13 weeks, Danny, withholding, autonomy, alert, what-if', () => {
  const input = prototypeInput()
  const started = Date.now()
  const result = projectTreasury(input)
  assert.ok(Date.now() - started < 200, 'forecast should be well under 2s')
  assert.equal(result.weeks.length, 13)
  assert.equal(result.weeks[0].week_start, '2026-10-12')
  assert.equal(result.weeks[3].week_start, '2026-11-02')
  assert.equal(result.weeks[12].week_start, '2027-01-04')
  assert.equal(result.weeks[0].in_sure, 10125.83)

  result.weeks.forEach((week, index) => {
    near(week.balance_sure, EXPECTED_SURE[index], `S${index + 1} sûr`)
    near(week.balance_probable, EXPECTED_PROBABLE[index], `S${index + 1} probable`)
  })

  const supplierByWeek = result.weeks.map((week) => sumOn(result, (flow) => (
    flow.source === 'fournisseur' && flow.flow_date >= week.week_start && flow.flow_date <= week.week_end
  )))
  assert.deepEqual(supplierByWeek.slice(0, 3), [-1669.96, -65.13, -2217.1])
  assert.ok(supplierByWeek.slice(3).every((value) => value === 0))

  const danny = (date) => sumOn(result, (flow) => flow.counterparty === 'Danny Joosten' && flow.flow_date === date)
  assert.equal(danny('2026-10-13'), -250)
  assert.equal(danny('2026-11-13'), -2308.46)
  assert.equal(danny('2026-12-13'), -2308.46)

  const withholding = result.flows.find((flow) => flow.rule === 'precompte' || (flow.label === 'Précompte' && flow.flow_date === '2027-01-06'))
  assert.equal(withholding.flow_date, '2027-01-06')
  assert.equal(withholding.amount, -1729.11)

  assert.equal(result.kpis.balance_today, 2651.62)
  assert.equal(result.kpis.balance_date, '2026-10-09')
  assert.equal(result.kpis.is_estimated, false)
  assert.equal(result.kpis.autonomy_weeks, 3)
  assert.equal(result.kpis.overdue_count, 6)
  assert.equal(result.kpis.overdue_amount, 7533.83)
  assert.equal(result.kpis.alert_level, 'orange')
  assert.equal(result.kpis.alert_week, '2026-11-02')
  assert.equal(result.kpis.low_point_probable, result.weeks[0].balance_probable)
  assert.equal(result.kpis.low_point_week, '2026-10-12')
  near(result.kpis.low_point_sure, -53727.87, 'point bas sûr')

  const simulated = projectWhatIf(input, 5000, '2026-10-20')
  assert.equal(simulated.weeks[0].balance_sure, result.weeks[0].balance_sure)
  assert.equal(simulated.weeks[0].balance_probable, result.weeks[0].balance_probable)
  for (let index = 1; index < 13; index += 1) {
    near(simulated.weeks[index].balance_sure, result.weeks[index].balance_sure - 5000, `what-if sûr S${index + 1}`)
    near(simulated.weeks[index].balance_probable, result.weeks[index].balance_probable - 5000, `what-if probable S${index + 1}`)
  }
  assert.equal(input.whatIf, undefined)
  assert.equal(input.cashEvents.length, 0)
})

test('Danny September paid or not, advance ignored, October uses usual revenue', () => {
  const base = {
    asOf: AS_OF,
    settings: SETTINGS,
    accounts: [{ id: 'belfius', include_in_cash: true }],
    snapshots: [{ account_id: 'belfius', balance_date: '2026-10-09', balance: 0, source: 'manuel' }],
    commitments: [
      commitment({ id: 'danny', label: 'Danny variable', counterparty: 'Danny Joosten', amount: null, frequency: 'monthly', day_of_month: 13, next_due_date: '2026-10-13', amount_rule: 'danny', match_pattern: 'remuneration danny|rem danny' }),
      commitment({ id: 'danny-fixed', label: 'Danny fixe', counterparty: 'Danny Joosten', amount: 250, frequency: 'monthly', day_of_month: 13, next_due_date: '2026-10-13', match_pattern: 'defraiement' }),
    ],
    invoices: [{ id: 'sep', client_name: 'Client', invoice_date: '2026-09-15', amount_ht: 28675.31, amount_ttc: 30000, bank_paid_amount: 0 }],
    supplierBills: [],
    jobs: [],
  }
  const unpaid = projectTreasury({ ...base, transactions: [] })
  const on13 = (result) => sumOn(result, (flow) => flow.counterparty === 'Danny Joosten' && flow.flow_date === '2026-10-13')
  assert.equal(on13(unpaid), -2400.65)

  const paid = projectTreasury({
    ...base,
    transactions: [{ id: 'tx-sep', booking_date: '2026-09-30', amount: -2161.9, communication: 'Remuneration Danny September 2026', counterparty_name: 'Danny Joosten' }],
  })
  assert.equal(on13(paid), -250)
  const november = sumOn(paid, (flow) => flow.counterparty === 'Danny Joosten' && flow.flow_date === '2026-11-13')
  assert.equal(november, -2308.46)

  const advance = projectTreasury({
    ...base,
    transactions: [{ id: 'tx-adv', booking_date: '2026-09-21', amount: -450, communication: 'Advance remuneration Danny', counterparty_name: 'Danny Joosten' }],
  })
  assert.equal(on13(advance), -2400.65)
})

test('supplier bill edits: paid, excluded, manual due date, spread weekly not double counted', () => {
  const input = prototypeInput()
  const base = projectTreasury(input)
  const paid = projectTreasury({
    ...input,
    supplierBills: input.supplierBills.map((bill) => (bill.id === 'b2' ? { ...bill, is_paid: true } : bill)),
  })
  assert.equal(paid.weeks[0].balance_sure, Math.round((base.weeks[0].balance_sure + 428.85) * 100) / 100)

  const excluded = projectTreasury({
    ...input,
    invoices: input.invoices.map((invoice) => (invoice.id === 'i7' ? { ...invoice, excluded_from_cash: true } : invoice)),
  })
  assert.equal(excluded.weeks[0].in_sure, 7533.83)
  assert.equal(excluded.kpis.overdue_count, 6)
  assert.equal(excluded.flows.some((flow) => flow.ref_id === 'i7'), false)

  const moved = projectTreasury({
    ...input,
    supplierBills: input.supplierBills.map((bill) => (
      bill.id === 'b8' ? { ...bill, due_date: '2026-10-15', due_date_source: 'manuel' } : bill
    )),
  })
  const supplier = (result, from, to) => sumOn(result, (flow) => (
    flow.source === 'fournisseur' && flow.flow_date >= from && flow.flow_date <= to
  ))
  assert.equal(supplier(moved, '2026-10-12', '2026-10-18'), Math.round((-1669.96 - 808.9) * 100) / 100)
  assert.equal(supplier(moved, '2026-10-26', '2026-11-01'), Math.round((-2217.1 + 808.9) * 100) / 100)

  const withFuel = projectTreasury({
    ...input,
    supplierBills: [
      ...input.supplierBills,
      { id: 'fuel', supplier_name: 'Radius Business Solutions', invoice_date: '2026-10-12', due_date: '2026-10-20', amount_ttc: 480 },
      { id: 'ads', supplier_name: 'Meta Platforms Ireland', invoice_date: '2026-10-12', due_date: '2026-10-18', amount_ttc: 200, replaces_commitment_id: 'meta' },
    ],
  })
  assert.equal(withFuel.weeks[0].balance_sure, base.weeks[0].balance_sure)
  assert.equal(withFuel.flows.some((flow) => flow.ref_id === 'fuel' || flow.ref_id === 'ads'), false)
})

test('signed job replaces usual revenue for that week only', () => {
  const input = prototypeInput()
  const base = projectTreasury(input)
  const withJob = projectTreasury({
    ...input,
    jobs: [{ id: 'job-1', hubspot_deal_id: 'deal-1', end_date: '2026-10-12', amount_ttc: 10000, link_status: 'auto', invoiced: false }],
  })
  assert.equal(withJob.weeks[1].in_sure, 10000)
  assert.equal(withJob.weeks[1].in_probable, 10000)
  assert.equal(withJob.weeks[0].in_probable, base.weeks[0].in_probable)
  const rejected = projectTreasury({
    ...input,
    jobs: [{ id: 'job-2', end_date: '2026-10-12', amount_ttc: 10000, link_status: 'a_valider' }],
  })
  assert.equal(rejected.weeks[1].in_sure, base.weeks[1].in_sure)
})

test('bank match advances a loan and ignores spread weekly', () => {
  const input = prototypeInput()
  const updates = advanceCommitments({
    commitments: input.commitments,
    transactions: [
      { id: 'loan-pay', booking_date: '2026-10-08', amount: -540, communication: 'Remboursement pret 20 octobre', counterparty_name: 'Remy' },
      { id: 'fuel-pay', booking_date: '2026-10-12', amount: -500, communication: 'Radius carburant', counterparty_name: 'Radius' },
    ],
    settings: SETTINGS,
    asOf: AS_OF,
  })
  const loan = updates.find((row) => row.id === 'loan20')
  assert.equal(loan.next_due_date, '2026-11-10')
  assert.equal(loan.remaining_occurrences, 3)
  assert.equal(updates.some((row) => row.id === 'radius'), false)

  const projected = projectTreasury({
    ...input,
    transactions: [{ id: 'loan-pay', account_id: 'belfius', booking_date: '2026-10-08', amount: -540, communication: 'Remboursement pret 20 octobre', counterparty_name: 'Remy' }],
  })
  assert.equal(projected.flows.some((flow) => flow.ref_id === 'loan20' && flow.flow_date === '2026-10-12'), false)
  assert.ok(projected.flows.some((flow) => flow.ref_id === 'loan20' && flow.flow_date === '2026-11-10'))
})

test('seasonality helper and January coefficient', () => {
  assert.deepEqual(seasonalityFromHistory([{ month: 1, amount_ht: 100 }]), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  const coeffs = seasonalityFromHistory([
    { month: 1, amount_ht: 50 },
    { month: 7, amount_ht: 150 },
  ])
  assert.equal(coeffs[0], 0.5)
  assert.equal(coeffs[6], 1.5)
  assert.equal(coeffs[3], 1)

  const input = prototypeInput()
  const base = projectTreasury(input)
  const winter = projectTreasury({
    ...input,
    settings: { ...SETTINGS, seasonality_coefficients: [0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  })
  assert.equal(winter.weeks[0].balance_sure, base.weeks[0].balance_sure)
  assert.ok(winter.weeks[12].in_probable < base.weeks[12].in_probable)
  assert.equal(winter.weeks[12].balance_sure, base.weeks[12].balance_sure)
})

test('last import summary: Brussels clock and Belgian stale rule', () => {
  assert.equal(formatBrusselsDateTime('2026-10-08T07:10:00Z'), '08/10/2026 09:10')
  const fresh = presentLastImport({
    batch: { created_at: '2026-10-09T06:00:00Z', channel: 'ecran', rows_inserted: 4, data_as_of: '2026-10-09' },
    balance: { balance: 2651.62, balance_date: '2026-10-09' },
    today: '2026-10-13',
  })
  assert.equal(fresh.stale, false)
  assert.equal(fresh.channel, 'ecran')
  const stale = presentLastImport({
    batch: { created_at: '2026-10-08T07:10:00Z', channel: 'api', rows_inserted: 42, data_as_of: '2026-10-08' },
    balance: { balance: 2651.62, balance_date: '2026-10-08' },
    today: '2026-10-13',
  })
  assert.equal(stale.stale, true)
  assert.equal(stale.rowsInserted, 42)
  assert.equal(presentLastImport({
    batch: { created_at: '2026-10-09T06:00:00Z', channel: 'api', rows_inserted: 1, data_as_of: '2026-10-09' },
    balance: { balance: 1, balance_date: '2026-10-09' },
    today: '2026-10-14',
  }).stale, true)
})

test('grey alert when the books are above the threshold but the bank data is stale', () => {
  const result = projectTreasury({
    ...prototypeInput(),
    asOf: '2026-10-14',
    settings: { ...SETTINGS, alert_threshold: -100000 },
  })
  assert.equal(result.kpis.data_stale, true)
  assert.equal(result.kpis.alert_level, 'grey')
  assert.equal(result.kpis.alert_week, null)
})

test('client invoices are open only when Accountable status is Envoyé', () => {
  const minDate = '2026-09-01'
  const open = {
    id: 'open',
    invoice_number: '2BLX-2632',
    client_name: 'Client démo',
    invoice_date: '2026-09-01',
    amount_ttc: 1000,
    bank_paid_amount: 225,
    paid_at: '2026-09-20',
    hubspot_status: 'paid',
    accountable_status: 'Envoyé',
  }
  const paid = {
    id: 'paid',
    invoice_number: '2BLX-2700',
    invoice_date: '2026-09-02',
    amount_ttc: 400,
    bank_paid_amount: 0,
    hubspot_status: 'open',
    accountable_status: 'Payé',
  }
  const old = {
    id: 'old',
    invoice_number: '2BLX-1001',
    invoice_date: '2026-01-15',
    amount_ttc: 5000,
    bank_paid_amount: 0,
    hubspot_status: 'open',
  }
  const overpaid = {
    id: 'over',
    invoice_number: '2BLX-2633',
    invoice_date: '2026-09-04',
    amount_ttc: 100,
    bank_paid_amount: 300,
    accountable_status: 'Envoyé',
  }
  assert.equal(isClientInvoiceOpen(open, minDate), true)
  assert.equal(isClientInvoiceOpen(paid, minDate), false)
  assert.equal(isClientInvoiceOpen(old, minDate), false)
  assert.equal(isClientInvoiceOpen({ ...open, invoice_date: '2026-01-01' }, minDate), true)
  assert.equal(clientInvoiceRemaining(open), 775)
  assert.equal(clientInvoiceRemaining(overpaid), 0)

  const result = projectTreasury({
    asOf: AS_OF,
    settings: { ...SETTINGS, probable_enabled: false, horizon_weeks: 4 },
    accounts: [{ id: 'belfius', include_in_cash: true }],
    snapshots: [{ account_id: 'belfius', balance_date: '2026-10-09', balance: 0, source: 'manuel' }],
    commitments: [],
    supplierBills: [],
    jobs: [],
    facturesMinDate: minDate,
    invoices: [open, paid, old, overpaid],
  })
  const flows = result.flows.filter((flow) => flow.source === 'facture')
  assert.deepEqual(flows.map((flow) => flow.ref_id), ['open'])
  assert.equal(flows[0].amount, 775)
  assert.equal(flows[0].rawDate, '2026-09-09')
  assert.equal(flows[0].flow_date, AS_OF)
})

test('classify Quimesis and Radius on import', () => {
  const excluded = classifyImportedBill({
    supplierName: 'QUIMESIS SRL',
    excludedNames: ['Quimesis'],
    commitments: [{ id: 'radius', counterparty: 'Radius', spread_weekly: true, is_active: true }],
  })
  assert.equal(excluded.excluded_from_cash, true)
  const fuel = classifyImportedBill({
    supplierName: 'Radius Business Solutions',
    excludedNames: ['Quimesis'],
    commitments: [{ id: 'radius', counterparty: 'Radius', spread_weekly: true, is_active: true }],
  })
  assert.equal(fuel.excluded_from_cash, false)
  assert.equal(fuel.replaces_commitment_id, 'radius')
  const other = classifyImportedBill({
    supplierName: 'Papeterie Démo',
    excludedNames: ['Quimesis'],
    commitments: [{ id: 'radius', counterparty: 'Radius', spread_weekly: true, is_active: true }],
  })
  assert.equal(other.replaces_commitment_id, null)
})
