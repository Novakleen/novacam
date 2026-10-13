import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewCashflowInput } from './previewFixture.js';
import { buildCashflow, recurringIconKey } from './cashflow.js';

const CASH_KEYS = [
  'cashAsOf', 'historyTitle', 'historyHint', 'grainWeek', 'grainMonth',
  'legendIn', 'legendOut', 'legendBalance', 'projectionTitle', 'projectionHint',
  'agingTitle', 'bucketNotDue', 'bucket030', 'bucket3160', 'bucket60',
  'agingEmpty', 'notLate', 'suppliersEmpty', 'dueUnknown', 'recurringTitle',
  'recurringEmpty', 'freqWeekly', 'freqMonthly', 'freqQuarterly', 'freqYearly',
  'badgeActive', 'badgeInactive',
];

test('cash copy exists in French, Dutch and English', () => {
  for (const lang of ['fr', 'nl', 'en']) {
    const file = readFileSync(new URL(`../../i18n/locales/${lang}.json`, import.meta.url), 'utf8');
    const treso = JSON.parse(file).treso;
    for (const key of CASH_KEYS) assert.equal(typeof treso[key], 'string', `${lang}.${key}`);
  }
});

test('cash dashboard drops the old tableau clutter', () => {
  const page = readFileSync(new URL('../../pages/TresoDashboardPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /data-testid="treso-cash"/);
  assert.match(page, /data-testid="treso-history"/);
  assert.match(page, /data-testid="treso-projection"/);
  assert.match(page, /data-testid="treso-aging"/);
  assert.match(page, /data-testid="treso-suppliers"/);
  assert.match(page, /data-testid="treso-recurring"/);
  assert.equal(page.includes('treso-whatif'), false);
  assert.equal(page.includes('kpiAutonomy'), false);
  assert.equal(page.includes('treso-sans-date'), false);
  assert.equal(page.includes('treso-alert'), false);
  assert.equal(page.includes('TresoChart'), false);
});

test('cash view: balance, history, projection, aging, bills, recurring', () => {
  const input = previewCashflowInput();
  const noisy = previewCashflowInput();
  noisy.settings = { ...noisy.settings, usual_revenue_ht_month: 999999, seasonality_coefficients: Array(12).fill(3) };
  const view = buildCashflow(input);
  const same = buildCashflow(noisy);
  assert.equal(view.cash.amount, 4200);
  assert.equal(view.cash.date, '2026-10-09');
  assert.equal(view.cash.accountName, 'Compte courant');
  assert.deepEqual(same.projection.map((week) => week.balance), view.projection.map((week) => week.balance));

  assert.equal(view.history.week.length, 26);
  assert.equal(view.history.week.at(-1).start, '2026-10-12');
  const may = view.history.month.find((row) => row.key === '2026-05');
  assert.equal(may.cashIn, 2000);
  assert.equal(may.cashOut, 900);
  const october = view.history.month.find((row) => row.key === '2026-10');
  assert.equal(october.cashIn, 0);
  assert.equal(october.cashOut, 0);
  assert.equal(october.balance, 4200);

  assert.equal(view.aging.buckets.notDue, 640);
  assert.equal(view.aging.buckets.d0_30, 940);
  assert.equal(view.aging.buckets.d31_60, 1280);
  assert.equal(view.aging.buckets.d60, 1500);
  assert.equal(view.aging.total, 4360);
  assert.equal(view.aging.list[0].client, 'Maison Bleue');
  assert.equal(view.aging.list[0].number, 'DEMO-1001');
  assert.equal(view.aging.list[0].amount, 1500);
  assert.equal(view.aging.list[0].days, 63);
  assert.equal(view.aging.list.some((row) => row.client === 'Clos Payé'), false);

  assert.equal(view.suppliers.at(-1).unknown, true);
  assert.equal(view.suppliers.at(-1).name, 'Atelier Inconnu');
  assert.equal(view.suppliers[0].dueDate, '2026-10-06');
  assert.equal(view.suppliers.some((row) => row.name === 'Dossier neutre'), false);

  assert.equal(view.projection.length, 12);
  assert.equal(view.projection[0].balance, 6590);
  assert.equal(view.projection[1].inflow, 1500);
  assert.equal(view.projection[1].outflow, 2080);
  assert.equal(view.projectionTotals.jobs, 1500);
  assert.equal(view.projectionTotals.invoices, 4360);
  assert.equal(view.projectionTotals.suppliers, 1405);
  assert.equal(view.projectionTotals.recurring, 22147);
  assert.equal(view.projection.at(-1).balance, -13492);

  const rent = view.recurring.find((row) => row.id === 'loyer');
  const insurance = view.recurring.find((row) => row.id === 'assurance');
  const paused = view.recurring.find((row) => row.id === 'inactif');
  const telecom = view.recurring.find((row) => row.id === 'telecom');
  const software = view.recurring.find((row) => row.id === 'logiciel');
  const tax = view.recurring.find((row) => row.id === 'taxe');
  assert.equal(rent.active, true);
  assert.equal(rent.frequency, 'monthly');
  assert.equal(rent.icon, 'rent');
  assert.equal(insurance.active, false);
  assert.equal(paused.active, false);
  assert.equal(paused.frequency, 'quarterly');
  assert.equal(telecom.icon, 'telecom');
  assert.equal(software.icon, 'software');
  assert.equal(tax.frequency, 'yearly');
  assert.equal(tax.icon, 'tax');
  assert.equal(view.recurring.some((row) => row.id === 'carburant'), false);
  assert.equal(recurringIconKey({ category: 'carburant' }), 'fuel');
});

test('a supplier bill replaces the matching recurrence in that month', () => {
  const input = previewCashflowInput();
  const base = buildCashflow(input);
  input.supplierBills.push({
    id: 'bill-rent',
    supplier_name: 'Loyer atelier',
    due_date: '2026-10-15',
    amount_ttc: 900,
    is_paid: false,
  });
  const next = buildCashflow(input);
  assert.equal(next.projection.at(-1).balance, base.projection.at(-1).balance);
  assert.equal(next.suppliers.some((row) => row.id === 'bill-rent'), true);
});

test('undated signed jobs stay out of the projection', () => {
  const input = previewCashflowInput();
  input.jobs.push({
    id: 'job-extra',
    label: 'Sans calendrier',
    end_date: null,
    amount_ttc: 4000,
    invoiced: false,
  });
  const view = buildCashflow(input);
  assert.equal(view.projectionTotals.jobs, 1500);
});
