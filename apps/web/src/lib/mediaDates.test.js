import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCaptureDateTimeShort } from './mediaDates.js';

test('short capture datetime is a single line', () => {
  const item = { captured_at: '2026-10-09T08:12:00' };
  const fr = formatCaptureDateTimeShort(item, 'fr');
  const nl = formatCaptureDateTimeShort(item, 'nl');
  const en = formatCaptureDateTimeShort(item, 'en');

  assert.equal(fr, '9 oct. 2026, 08:12');
  assert.equal(nl, '9 okt 2026, 08:12');
  assert.match(en, /2026/);
  assert.equal(en.includes('\n'), false);
  assert.equal(fr.includes('\n'), false);
});
