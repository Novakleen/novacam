import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessTreasury } from '../roles.js';
import { previewForecastInput } from './previewFixture.js';
import {
  MOVEMENT_PREVIEW_LIMIT,
  autonomyTone,
  buildScreen,
  normalizeSeasonality,
  parseAmount,
} from './screen.js';

test('treasury route is Admin only', () => {
  assert.equal(canAccessTreasury('Admin'), true);
  assert.equal(canAccessTreasury('Manager'), false);
  assert.equal(canAccessTreasury('Member'), false);
  assert.equal(canAccessTreasury('Viewer'), false);
  assert.equal(canAccessTreasury(null), false);
  assert.equal(canAccessTreasury(undefined), false);
  const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/tresorerie"/);
  assert.match(app, /allowedRoles=\{TREASURY_ROLES\}/);
  assert.equal(app.includes("allowedRoles={['Admin', 'Manager']}><Treso"), false);
});

test('dashboard screen: orange alert, lists, what-if does not write', () => {
  const input = previewForecastInput();
  const eventsBefore = input.cashEvents.length;
  const started = Date.now();
  const view = buildScreen(input);
  assert.ok(Date.now() - started < 500, 'screen build stays under half a second');
  assert.ok(view.computeMs < 500);
  assert.equal(view.base.kpis.alert_level, 'orange');
  assert.equal(view.base.kpis.alert_week, '2026-11-02');
  assert.equal(view.base.kpis.autonomy_weeks, 3);
  assert.equal(autonomyTone(view.base.kpis.autonomy_weeks), 'orange');
  assert.equal(autonomyTone(1), 'red');
  assert.equal(view.base.kpis.overdue_count, 2);
  assert.equal(view.base.kpis.is_estimated, false);
  assert.equal(view.footer.clients, 4080);
  assert.equal(view.footer.suppliers, 1405);
  assert.equal(view.footer.net, 2675);
  assert.ok(view.lists.outflows.length > MOVEMENT_PREVIEW_LIMIT);
  const spreadDates = view.lists.outflows.filter((row) => row.kind === 'spread').map((row) => row.date);
  assert.ok(spreadDates.length >= 4);
  assert.equal(new Set(spreadDates).size, spreadDates.length);
  assert.equal(view.lists.inflows[0].overdue, true);
  assert.ok(view.lists.inflows.some((row) => row.origin === 'chantier'));
  assert.equal(view.signedJobs.total, 2300);
  assert.equal(view.signedJobs.count, 2);
  assert.equal(view.signedJobs.undated.length, 1);
  assert.equal(view.signedJobs.undated[0].label, 'Chantier sans date');
  assert.equal(view.signedJobs.undated[0].amount, 800);
  assert.ok(view.lists.inflows.every((row, index, list) => index === 0 || !row.overdue || list[index - 1].overdue));

  const simulated = buildScreen(input, { amount: '5000', date: '2026-10-20', label: 'Achat démo' });
  assert.equal(simulated.simulated.weeks[0].balance_sure, view.base.weeks[0].balance_sure);
  assert.equal(simulated.simulated.weeks[0].balance_probable, view.base.weeks[0].balance_probable);
  for (let index = 1; index < 13; index += 1) {
    const sureDrop = view.base.weeks[index].balance_sure - simulated.simulated.weeks[index].balance_sure;
    const probableDrop = view.base.weeks[index].balance_probable - simulated.simulated.weeks[index].balance_probable;
    assert.ok(Math.abs(sureDrop - 5000) < 0.02, `sûr S${index + 1} baisse de ${sureDrop}`);
    assert.ok(Math.abs(probableDrop - 5000) < 0.02, `probable S${index + 1} baisse de ${probableDrop}`);
  }
  assert.equal(input.cashEvents.length, eventsBefore);
  assert.equal(input.whatIf, undefined);
  assert.equal(simulated.effect.autonomyBefore, 3);
  assert.equal(simulated.effect.autonomyAfter, 1);
  assert.ok(simulated.effect.lowAfter < simulated.effect.lowBefore);
});

test('dashboard client total uses Accountable status, not HubSpot or the bank', () => {
  const input = previewForecastInput();
  input.facturesMinDate = '2026-09-01';
  input.invoices = [
    { id: 'a', invoice_number: '2BLX-2632', invoice_date: '2026-09-02', amount_ttc: 1000, bank_paid_amount: 225, hubspot_status: 'paid', accountable_status: 'Envoyé' },
    { id: 'b', invoice_number: '2BLX-2700', invoice_date: '2026-09-03', amount_ttc: 400, bank_paid_amount: 0, hubspot_status: 'open', accountable_status: 'Payé' },
    { id: 'c', invoice_number: '2BLX-1001', invoice_date: '2026-01-15', amount_ttc: 5000, bank_paid_amount: 0, hubspot_status: 'open' },
  ];
  const view = buildScreen(input);
  assert.equal(view.footer.clients, 775);
});

test('amount parsing and seasonality length', () => {
  assert.equal(parseAmount('5 000,50'), 5000.5);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.deepEqual(normalizeSeasonality([0.5, 2]), [0.5, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
});
