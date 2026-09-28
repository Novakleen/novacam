// Headless preview of Flotte › Articles (v1.10.0 → v1.12.0), rendered from ArticlesCatalogView with sample data
// (illustrative v1.11.0 data: matériel in crates shows Van › Zone › Caisse) and the French strings.
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

// [kind, name, icon, [[place, qty, inCrate, missing]], conditions, contents]  (place = "Van › Zone › Caisse")
// v1.12.0: crates carry their standard contents; crate items can be flagged missing per place.
const sample = [
  ['caisse', 'Caisse EPI', 'box', [['Van Martin › Zone cloison', 1], ['Van Danny › Zone cloison', 1]], {}, 'Gants ×4 · Lunettes ×2 · Casques ×2'],
  ['caisse', 'Caisse raccords', 'box', [['Van Martin › Étagères droite', 1]], {}, 'Joints ×6 · Manchon Ø100 ×2'],
  ['machine', 'Pompe / machine', 'pump', [['Van Martin › Plancher', 1], ['Van Danny › Plancher', 1]], { broken: 1 }],
  ['materiel', 'Casques', 'helmet', [['Van Martin › Zone cloison › Caisse EPI', 2, true, 2], ['Van Danny › Zone cloison › Caisse EPI', 2, true]], { missing: 2 }],
  ['materiel', 'Lunettes', 'goggles', [['Van Martin › Zone cloison › Caisse EPI', 2, true], ['Van Danny › Zone cloison › Caisse EPI', 2, true, 1]], { damaged_usable: 1, missing: 1 }],
  ['materiel', 'Joints', 'seal', [['Van Martin › Étagères droite › Caisse raccords', 6, true]]],
  ['materiel', 'Rallonges', 'extension', [['Van Martin › Étagères gauche', 2], ['Van Danny › Étagères gauche', 2], ['Dépôt', 4]]],
  ['materiel', 'Cônes / signalisation', 'cone', [['Van Danny › Plancher', 3]]],
];
const rows = sample.map(([kind, name, icon, where, cond = {}, contentsLabel = null], i) => {
  const byPlace = where.map(([label, qty, inCrate, missing = 0], j) => ({ id: `${i}-${j}`, label, qty, missing, depot: label === 'Dépôt', inCrate: Boolean(inCrate) }));
  const qty = byPlace.reduce((s, r) => s + r.qty, 0);
  return {
    article: { id: String(i), kind, name, icon, active: true },
    usage: qty ? { instances: byPlace.length, qty, byPlace, damaged_usable: 0, broken: 0, missing: 0, ...cond } : null,
    contentsLabel,
  };
});

const body = renderToStaticMarkup(
  <ArticlesCatalogView t={t} rows={rows} label={(a) => a.name} query="" kind="" totals={{ articles: 8, instances: 19 }} onEdit={() => {}} />
);
/* global process */
process.stdout.write(
  `<!doctype html><html><head><meta charset="utf-8"><!--CSS--></head>` +
    `<body style="margin:0;background:#fff;font-family:Inter,system-ui,sans-serif"><div style="max-width:1100px;margin:0 auto;padding:24px">${body}</div></body></html>`
);
