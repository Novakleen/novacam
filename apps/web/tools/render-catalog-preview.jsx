// Headless preview of Flotte › Articles (v1.10.0), rendered from ArticlesCatalogView with sample data
// (snapshot of the production catalog right after the migration) and the French strings.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ArticlesCatalogView from '../src/components/fleet/ArticlesCatalogView.jsx';
import fr from '../src/i18n/locales/fr.json';

const t = (key, vars = {}) => {
  const get = (k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), fr);
  let s = vars.count != null ? get(`${key}_${vars.count === 1 ? 'one' : 'other'}`) ?? get(key) : get(key);
  if (s == null) s = key;
  return String(s).replace(/\{\{(\w+)\}\}/g, (_, v) => vars[v] ?? '');
};

const M = 'Van Martin';
const D = 'Van Danny';
const R = 'NK01 - Van Remy';
const sample = [
  ['caisse', 'Caisse EPI', 'box', null, { [M]: 1, [D]: 1 }],
  ['caisse', 'Caisse raccords', 'box', null, { [M]: 1, [D]: 1 }],
  ['caisse', 'Spare parts BOX', 'box', 'Spare parts BOX', { [R]: 1 }],
  ['caisse', 'low pressure kit', 'box', 'low pressure kit', {}],
  ['machine', 'Pompe / machine', 'pump', null, { [M]: 1, [D]: 1 }],
  ['machine', 'Pressure washer', 'pump', null, { [R]: 1 }, { broken: 1 }],
  ['materiel', 'Lances', 'spray', null, { [M]: 3, [D]: 2, Dépôt: 4 }, { damaged_usable: 1 }],
  ['materiel', 'Rallonges', 'extension', null, { [M]: 2, [D]: 2 }],
  ['materiel', 'Manchon Ø100', 'sleeve', null, { [M]: 1, [D]: 1 }],
  ['materiel', '+30m long HP hose', 'sleeve', null, { [R]: 1 }],
  ['materiel', 'Cônes / signalisation', 'cone', null, { [M]: 1, [D]: 1 }, { missing: 1 }],
  ['materiel', '1m long low pressure hose', null, null, {}],
];
const rows = sample.map(([kind, name, icon, kitName, where, cond = {}], i) => {
  const byRoot = Object.entries(where).map(([label, qty]) => ({ id: label, label, qty, depot: label === 'Dépôt' }));
  const qty = byRoot.reduce((s, r) => s + r.qty, 0);
  return {
    article: { id: String(i), kind, name, icon, active: true },
    kitName,
    usage: qty ? { instances: byRoot.length, qty, byRoot, damaged_usable: 0, broken: 0, missing: 0, ...cond } : null,
  };
});

const body = renderToStaticMarkup(
  <ArticlesCatalogView t={t} rows={rows} label={(a) => a.name} query="" kind="" totals={{ articles: 24, instances: 52 }} onEdit={() => {}} />
);
/* global process */
process.stdout.write(
  `<!doctype html><html><head><meta charset="utf-8"><!--CSS--></head>` +
    `<body style="margin:0;background:#fff;font-family:Inter,system-ui,sans-serif"><div style="max-width:1100px;margin:0 auto;padding:24px">${body}</div></body></html>`
);
