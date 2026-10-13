import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractInvoiceNumbers,
  foldValidatedPayment,
  invoiceIsPaid,
  reconcileBankInvoices,
  splitPayment,
} from './tresoMatch.js'

const BELFIUS = 'acc-belfius'

function invoice(overrides) {
  return {
    id: 'inv-1',
    invoice_number: '2BLX-1001',
    client_name: 'Atelier Nord',
    invoice_date: '2026-09-01',
    amount_ttc: 1000,
    hubspot_invoice_id: 'hs-1',
    excluded_from_cash: false,
    bank_paid_amount: 0,
    paid_at: null,
    ...overrides,
  }
}

function tx(overrides) {
  return {
    id: 'tx-1',
    account_id: BELFIUS,
    booking_date: '2026-10-01',
    amount: 1000,
    counterparty_name: 'Inconnu',
    communication: '',
    match_status: 'aucun',
    match_method: null,
    client_invoice_id: null,
    is_internal_transfer: false,
    excluded_from_cash: false,
    ...overrides,
  }
}

test('invoice number regex: case, spaces, hyphen, BXL → BLX', () => {
  assert.deepEqual(extractInvoiceNumbers('paiement 2blx-2708'), ['2BLX-2708'])
  assert.deepEqual(extractInvoiceNumbers('2BXL 2708'), ['2BLX-2708'])
  assert.deepEqual(extractInvoiceNumbers('2BLX - 2710'), ['2BLX-2710'])
  assert.deepEqual(extractInvoiceNumbers('2BLX2708'), ['2BLX-2708'])
  assert.deepEqual(extractInvoiceNumbers('ref 2BXX2701 et 2BLL-2702'), ['2BXX-2701', '2BLL-2702'])
  assert.deepEqual(extractInvoiceNumbers('2BX-2708'), [])
  assert.deepEqual(extractInvoiceNumbers('2BLX-270'), [])
  assert.deepEqual(extractInvoiceNumbers('2BLX-27089'), [])
  assert.deepEqual(extractInvoiceNumbers('12BLX-2708'), [])
})

test('number in the communication is auto, including a split across two invoices', () => {
  const invoices = [
    invoice({ id: 'a', invoice_number: '2BLX-2708', amount_ttc: 300, hubspot_invoice_id: 'ha' }),
    invoice({ id: 'b', invoice_number: '2BLX-2735', amount_ttc: 100, client_name: 'Autre', hubspot_invoice_id: 'hb' }),
  ]
  const plan = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices,
    transactions: [tx({ amount: 400, communication: 'Factures 2bxl-2708 / 2BLX-2735' })],
  })
  assert.equal(plan.transactionUpdates[0].match_status, 'auto')
  assert.equal(plan.transactionUpdates[0].match_method, 'numero')
  const shares = splitPayment(400, invoices)
  assert.equal(shares[0].amount + shares[1].amount, 400)
  const paidA = plan.invoiceUpdates.find((row) => row.id === 'a')
  const paidB = plan.invoiceUpdates.find((row) => row.id === 'b')
  assert.equal(paidA.bank_paid_amount, 300)
  assert.equal(paidB.bank_paid_amount, 100)
  assert.equal(paidA.paid, true)
  assert.equal(paidB.paid, true)
})

test('exact amount and client name is auto inside the date window', () => {
  const plan = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [invoice({ id: 'n', invoice_number: '2BLX-2002', client_name: 'Menuiserie Démo', amount_ttc: 640, invoice_date: '2026-09-15' })],
    transactions: [tx({
      id: 'tx-name',
      amount: 640,
      booking_date: '2026-10-01',
      counterparty_name: 'MENUISERIE DEMO SRL',
      communication: 'paiement',
    })],
  })
  assert.equal(plan.transactionUpdates.length, 1)
  assert.equal(plan.transactionUpdates[0].match_status, 'auto')
  assert.equal(plan.transactionUpdates[0].match_method, 'montant_nom')
  assert.equal(plan.invoiceUpdates[0].paid, true)
  assert.equal(plan.invoiceUpdates[0].paid_at, '2026-10-01')
})

test('amount and name outside the date window falls back to amount-only', () => {
  const plan = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [invoice({ invoice_date: '2026-01-01', amount_ttc: 640, client_name: 'Menuiserie Demo' })],
    transactions: [tx({
      amount: 640,
      booking_date: '2026-10-01',
      counterparty_name: 'Menuiserie Demo',
    })],
  })
  assert.equal(plan.transactionUpdates[0].match_status, 'a_valider')
  assert.equal(plan.transactionUpdates[0].match_method, 'montant')
  assert.equal(plan.invoiceUpdates.length, 0)
})

test('exact amount only is proposed and does not count as paid', () => {
  const plan = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [invoice({ amount_ttc: 88.5, client_name: 'Studio Exemple', invoice_number: '2BLX-3003' })],
    transactions: [tx({ amount: 88.5, counterparty_name: 'Inconnu', communication: 'virement' })],
  })
  assert.equal(plan.transactionUpdates[0].match_status, 'a_valider')
  assert.equal(plan.invoiceUpdates.length, 0)

  const again = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [invoice({ amount_ttc: 88.5, client_name: 'Studio Exemple' })],
    transactions: [tx({
      amount: 88.52,
      match_status: 'a_valider',
      match_method: 'montant',
      client_invoice_id: 'inv-1',
    })],
  })
  assert.equal(again.transactionUpdates.length, 0)
  assert.equal(again.invoiceUpdates.length, 0)
})

test('amount tolerance is 0.02 euro', () => {
  const close = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [invoice({ amount_ttc: 88.5 })],
    transactions: [tx({ amount: 88.52, counterparty_name: 'Inconnu' })],
  })
  assert.equal(close.transactionUpdates[0].match_status, 'a_valider')
  const far = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [invoice({ amount_ttc: 88.5 })],
    transactions: [tx({ amount: 88.53, counterparty_name: 'Inconnu' })],
  })
  assert.equal(far.transactionUpdates.length, 0)
})

test('partial payments accumulate and the 99% rule sets paid_at on the settling date', () => {
  const invoices = [invoice({ amount_ttc: 1000 })]
  const first = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices,
    transactions: [tx({ id: 'p1', amount: 400, booking_date: '2026-10-01', communication: '2BLX-1001' })],
  })
  assert.equal(first.invoiceUpdates[0].bank_paid_amount, 400)
  assert.equal(first.invoiceUpdates[0].paid, false)
  assert.equal(first.invoiceUpdates[0].paid_at, null)
  assert.equal(invoiceIsPaid(980, 1000), false)
  assert.equal(invoiceIsPaid(990, 1000), true)

  const second = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices: [{ ...invoices[0], bank_paid_amount: 400 }],
    transactions: [
      tx({ id: 'p1', amount: 400, booking_date: '2026-10-01', communication: '2BLX-1001', match_status: 'auto', match_method: 'numero', client_invoice_id: 'inv-1' }),
      tx({ id: 'p2', amount: 590, booking_date: '2026-10-05', communication: '2BLX-1001' }),
    ],
  })
  assert.equal(second.invoiceUpdates[0].bank_paid_amount, 990)
  assert.equal(second.invoiceUpdates[0].paid, true)
  assert.equal(second.invoiceUpdates[0].paid_at, '2026-10-05')

  const short = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices,
    transactions: [
      tx({ id: 'p1', amount: 400, booking_date: '2026-10-01', communication: '2BLX-1001', match_status: 'auto', match_method: 'numero', client_invoice_id: 'inv-1' }),
      tx({ id: 'p2', amount: 580, booking_date: '2026-10-05', communication: '2BLX-1001', match_status: 'auto', match_method: 'numero', client_invoice_id: 'inv-1' }),
    ],
  })
  assert.equal(short.invoiceUpdates[0].bank_paid_amount, 980)
  assert.equal(short.invoiceUpdates[0].paid, false)
})

test('confirming an amount-only match counts it toward the 99% rule', () => {
  const folded = foldValidatedPayment({
    amountTtc: 88.5,
    bankPaidAmount: 0,
    paidAt: null,
    paymentAmount: 88.5,
    paymentDate: '2026-10-03',
  })
  assert.equal(folded.paid, true)
  assert.equal(folded.paid_at, '2026-10-03')
  assert.equal(folded.bank_paid_amount, 88.5)

  const partial = foldValidatedPayment({
    amountTtc: 1000,
    bankPaidAmount: 400,
    paidAt: null,
    paymentAmount: 590,
    paymentDate: '2026-10-05',
  })
  assert.equal(partial.bank_paid_amount, 990)
  assert.equal(partial.paid, true)
  assert.equal(partial.paid_at, '2026-10-05')
})

test('outgoing, visa, internal, excluded and rejected rows are left alone', () => {
  const invoices = [invoice()]
  const plan = reconcileBankInvoices({
    belfiusAccountId: BELFIUS,
    invoices,
    transactions: [
      tx({ id: 'out', amount: -1000, communication: '2BLX-1001' }),
      tx({ id: 'visa', account_id: 'acc-visa', communication: '2BLX-1001' }),
      tx({ id: 'int', is_internal_transfer: true, communication: '2BLX-1001' }),
      tx({ id: 'ex', excluded_from_cash: true, communication: '2BLX-1001' }),
      tx({ id: 'no', match_status: 'rejete', match_method: 'rejete', amount: 1000 }),
    ],
  })
  assert.equal(plan.transactionUpdates.length, 0)
  assert.equal(plan.invoiceUpdates.length, 0)
})
