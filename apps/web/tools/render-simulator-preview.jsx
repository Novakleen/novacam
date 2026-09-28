// Headless preview of Marges › Simulateur (v1.13.0), rendered from SimulatorView with sample data
// (sample SC job + a « nacelle » extra) and the French strings.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SimulatorView from '../src/components/margins/SimulatorView.jsx';
import { simulateMargin, minPriceForMa } from '../src/lib/margin/simulator.js';
import fr from '../src/i18n/locales/fr.json';

const t = (key, vars = {}) => {
  const get = (k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), fr);
  let s = vars.count != null ? get(`${key}_${vars.count === 1 ? 'one' : 'other'}`) ?? get(key) : get(key);
  if (s == null) s = key;
  return String(s).replace(/\{\{(\w+)\}\}/g, (_, v) => vars[v] ?? '');
};

const params = {
  eur_h: 26,
  com_rate: 0.1,
  consumption_l100: 7,
  diesel_eur_l_live: 2.25,
  round_trip: true,
  essence_eur_l: 1.85,
  essence_l_h: 2,
  essence_time_factor: 0.6,
  essence_services: ['nettoyage', 'sc'],
  commercial_closers: ['Anthony', 'Bastien', 'Emilie', 'Thibeau'],
};
const profiles = [
  { id: 'm', full_name: 'Martin Provoyeur', address: 'Anvaing' },
  { id: 'd', full_name: 'Danny Joosten', address: 'Auderghem' },
  { id: 'r', full_name: 'Remy', address: 'Villers-la-Ville' },
];
const form = {
  amountHt: '1620',
  techIds: ['m', 'd'],
  days: 1,
  hoursPerDay: 7.25,
  service: 'sc',
  productLines: [{ product: 'biomix', liters: 20 }],
  clientAddress: 'Rue de l’Exemple 1, 1000 Bruxelles',
  kmOverride: {},
  closer: 'Bastien',
  monthKey: '2026-08',
  extras: [{ label: 'Nacelle 1 jour', amount: 180 }],
  targetPct: 30,
};
const routing = { m: { status: 'ok', km: 42.5 }, d: { status: 'failed' } };
const kmOverride = { d: 18 };
const cac = { status: 'ok', amount: 138.9, monthKey: '2026-08' };
const techs = profiles.filter((p) => form.techIds.includes(p.id)).map((p) => ({ id: p.id, name: p.full_name, address: p.address }));
const { calc } = simulateMargin({
  inputs: { ...form, techs, routedKm: { m: 42.5, d: null }, kmOverride },
  params,
  prices: { biomix: 4.712 },
  dieselEurL: 2.25,
  cacAdsAmount: cac.amount,
  cacAdsStatus: 'ok',
});
const minPrice = minPriceForMa({ direct: calc.direct, ads: cac.amount, targetPct: 0.3, closer: form.closer, params });

const body = renderToStaticMarkup(
  <div>
    <div className="mb-5">
      <h1 className="text-2xl font-bold text-gray-900">Marge chantiers</h1>
      <p className="text-gray-500">{t('margins.pageSubtitle')}</p>
      <div className="mt-3 inline-flex h-10 items-center rounded-lg bg-gray-100 p-1 text-sm font-medium">
        <span className="rounded-md bg-white px-3 py-1.5 shadow-sm">{t('margins.tabSimulator')}</span>
        <span className="px-3 py-1.5 text-gray-500">{t('margins.tabParams')}</span>
      </div>
    </div>
    <SimulatorView
      t={t}
      lang="fr"
      form={{ ...form, kmOverride }}
      set={() => {}}
      options={{
        profiles,
        services: [
          { code: 'sc', label: 'SC' },
          { code: 'nettoyage', label: 'Nettoyage' },
          { code: 'biomix', label: 'Biomix' },
        ],
        products: [{ slug: 'biomix', label: 'Biomix Pro ATM', price: 4.712 }],
        closers: params.commercial_closers,
      }}
      routing={routing}
      cac={cac}
      calc={calc}
      minPrice={minPrice}
      dieselEurL={2.25}
      params={params}
      onReset={() => {}}
    />
  </div>
);
/* global process */
process.stdout.write(
  `<!doctype html><html><head><meta charset="utf-8"><!--CSS--></head>` +
    `<body style="margin:0;background:#fff;font-family:Inter,system-ui,sans-serif"><div style="max-width:1100px;margin:0 auto;padding:24px">${body}</div></body></html>`
);
