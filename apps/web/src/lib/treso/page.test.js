import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectAll, TRESO_PAGE_SIZE } from './page.js';

function paged(rows) {
  const calls = [];
  function buildQuery() {
    const state = { orderBy: null };
    return {
      order(column, options = {}) {
        state.orderBy = { column, ascending: options.ascending !== false };
        return this;
      },
      range(from, to) {
        calls.push({ orderBy: state.orderBy, from, to });
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
    };
  }
  return { buildQuery, calls };
}

test('pages with a stable order until a short page', async () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
  const { buildQuery, calls } = paged(rows);
  const result = await selectAll(buildQuery, { pageSize: 2, orderBy: 'id' });
  assert.deepEqual(result, rows);
  assert.deepEqual(calls.map((call) => [call.from, call.to]), [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(calls.map((call) => call.orderBy), [
    { column: 'id', ascending: true },
    { column: 'id', ascending: true },
    { column: 'id', ascending: true },
  ]);
});

test('a full page is not the end of the table', async () => {
  const rows = [{ id: 'a' }, { id: 'b' }];
  const { buildQuery, calls } = paged(rows);
  const result = await selectAll(buildQuery, { pageSize: 2 });
  assert.deepEqual(result, rows);
  assert.deepEqual(calls.map((call) => [call.from, call.to]), [[0, 1], [2, 3]]);
});

test('keeps rows past the PostgREST 1000-row cap', async () => {
  const rows = Array.from({ length: 1090 }, (_, index) => ({ id: index + 1 }));
  const { buildQuery, calls } = paged(rows);
  const result = await selectAll(buildQuery);
  assert.equal(TRESO_PAGE_SIZE, 1000);
  assert.equal(result.length, 1090);
  assert.deepEqual(result.map((row) => row.id), rows.map((row) => row.id));
  assert.deepEqual(calls.map((call) => [call.from, call.to]), [[0, 999], [1000, 1999]]);
});

test('orders by the caller column and throws the page error', async () => {
  const calls = [];
  await assert.rejects(
    () => selectAll(() => ({
      order(column) {
        calls.push(column);
        return this;
      },
      range() {
        return Promise.resolve({ data: null, error: new Error('statement timeout') });
      },
    }), { orderBy: 'hubspot_deal_id' }),
    /statement timeout/,
  );
  assert.deepEqual(calls, ['hubspot_deal_id']);
});

test('forecast load pages treasury tables instead of one capped select', () => {
  const source = readFileSync(new URL('./forecast.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/page\.js'/);
  assert.match(source, /readTable\(client, 'treso_bank_transactions'/);
  assert.match(source, /readTable\(client, 'treso_client_invoices'/);
  assert.match(source, /readTable\(client, 'treso_supplier_bills'/);
  assert.match(source, /readTable\(client, 'treso_signed_jobs', '[^']*', 'hubspot_deal_id'\)/);
  assert.equal(source.includes(".from('treso_bank_transactions')"), false);
});
