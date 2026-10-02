/**
 * Sanity check: the simulator's calculateProjectMargin output matches a direct
 * call with the same synthetic inputs, and matches a real dossier when its
 * hours/products are uniform enough to express as techs × days × h/day.
 *
 * Real dossier: id 356f820a… (SC job, sept. 2026), SC, 2 techs × 7.25 h × 1 day,
 * biomix 20 L, closer Rémy (no commission), CA 1620.
 * Fixed one-way km so diesel is deterministic (no live geocode).
 */
import { calculateProjectMargin } from '../src/lib/margin/calculateProjectMargin.js';
import {
  minPriceForMa,
  normalizeSimForm,
  resolveSimulationServiceCode,
  seedHourLinesFromSimple,
  simulateMargin,
  simulationSnapshot,
} from '../src/lib/margin/simulator.js';
import { resolveCacAdsAmount } from '../src/lib/margin/cacAds.js';

const params = {
  eur_h: 26,
  com_rate: 0.1,
  consumption_l100: 7,
  diesel_eur_l_live: 2.25,
  diesel_eur_l_fallback: 2.47,
  round_trip: true,
  essence_eur_l: 1.85,
  essence_l_h: 2,
  essence_time_factor: 0.6,
  essence_services: ['nettoyage', 'sc'],
  commercial_closers: ['Anthony', 'Bastien', 'Emilie', 'Thibeau'],
};
const prices = { biomix: 4.712 };
const dieselEurL = 2.25;
const cac = resolveCacAdsAmount({
  monthKey: '2026-08',
  cacheRows: [{ month: '2026-08-01', spend_total: 2083.46, clients_won: 15, cac_per_client: 138.9 }],
  spendRows: [],
});

const techs = [
  { id: 'tech-a', name: 'Tech A', address: 'Domicile A, Belgique' },
  { id: 'tech-b', name: 'Tech B', address: 'Domicile B, Belgique' },
];
const km = { [techs[0].id]: 42.5, [techs[1].id]: 18.0 }; // one-way km override

const inputs = {
  amountHt: 1620,
  techs,
  days: 1,
  hoursPerDay: 7.25,
  service: 'sc',
  productLines: [{ product: 'biomix', liters: 20 }],
  clientAddress: 'Adresse client, Belgique',
  routedKm: {},
  kmOverride: km,
  closer: 'Rémy',
  extras: [],
};

const { calc: sim } = simulateMargin({
  inputs,
  params,
  prices,
  dieselEurL,
  cacAdsAmount: cac.status === 'ok' ? cac.amount : null,
  cacAdsStatus: cac.status,
});

// Direct call with the same synthetic payload the simulator builds
const { built } = simulateMargin({ inputs, params, prices, dieselEurL });
const direct = calculateProjectMargin({
  dossier: built.dossier,
  hourLines: built.hourLines,
  productLines: built.productLines,
  params,
  prices,
  fuelByDate: built.fuelByDate,
  dieselEurL,
  otherExpenses: built.otherExpenses,
  cacAdsAmount: cac.status === 'ok' ? cac.amount : null,
  cacAdsStatus: cac.status,
});

const keys = ['personHours', 'mo', 'productCost', 'dieselFuel', 'essenceFuel', 'fuel', 'otherExpenses', 'direct', 'caHt', 'com', 'ads', 'mb', 'ma', 'maPct'];
const diffs = keys.filter((k) => sim[k] !== direct[k]);
const minPrice = minPriceForMa({ direct: sim.direct, ads: sim.ads, targetPct: 0.3, closer: 'Rémy', params });

console.log('=== Sanity: simulateMargin ≡ calculateProjectMargin (same payload) ===');
console.log(JSON.stringify({ match: diffs.length === 0, diffs, sim: Object.fromEntries(keys.map((k) => [k, sim[k]])) }, null, 2));
console.log('minPrice for 30% MA:', minPrice);

// Real dossier snapshot (stored numbers) — diesel differs because we use fixed km;
// compare labour / products / essence / commission which do not depend on routing.
const stored = { person_hours: 14.5, ca_ht: 1620, closer: 'Rémy', product: 'biomix×20' };
const expectedMo = 14.5 * 26; // 377
const expectedProduct = 20 * 4.712; // 94.24
const expectedEssence = 14.5 * 0.6 * 2 * 1.85; // 32.19
console.log('=== Real dossier 356f820a (labour / products / essence) ===');
console.log({
  dossier: '356f820a',
  stored_person_hours: stored.person_hours,
  sim_personHours: sim.personHours,
  hours_match: sim.personHours === stored.person_hours,
  expected_mo: expectedMo,
  sim_mo: sim.mo,
  mo_match: sim.mo === expectedMo,
  expected_product: expectedProduct,
  sim_productCost: sim.productCost,
  product_match: sim.productCost === expectedProduct,
  expected_essence: Math.round(expectedEssence * 100) / 100,
  sim_essenceFuel: sim.essenceFuel,
  essence_match: sim.essenceFuel === Math.round(expectedEssence * 100) / 100,
  expected_com: 0,
  sim_com: sim.com,
  com_match: sim.com === 0,
  note: 'Diesel differs from the stored dossier because we force fixed one-way km (42.5 + 18) instead of live OSRM.',
});

// Full comparison: the real dossier's own hour/product lines (dates, people) through
// calculateProjectMargin, with the same one-way km, vs the simulator.
const realHourLines = [
  {
    work_date: '2026-09-07',
    service: 'sc',
    people: techs.map((x) => ({ name: x.name, hours: 7.25, profileId: x.id, homeAddress: x.address })),
  },
];
const real = calculateProjectMargin({
  dossier: { ca_ht: 1620, closer: 'Rémy', client_address: inputs.clientAddress, mix: 'sc' },
  hourLines: realHourLines,
  productLines: [{ work_date: '2026-09-18', product: 'biomix', liters: 20 }],
  params,
  prices,
  fuelByDate: {
    '2026-09-07': {
      trips: techs.map((x) => ({ personKey: `id:${x.id}`, name: x.name, homeAddress: x.address, profileId: x.id, km: km[x.id] })),
    },
  },
  dieselEurL,
  otherExpenses: 0,
  cacAdsAmount: cac.amount,
  cacAdsStatus: cac.status,
});
const realDiffs = keys.filter((k) => sim[k] !== real[k]);
console.log('=== Real dossier lines → calculateProjectMargin vs simulator ===');
console.log(JSON.stringify({ match: realDiffs.length === 0, realDiffs, real: Object.fromEntries(keys.map((k) => [k, real[k]])) }, null, 2));

if (diffs.length || realDiffs.length) process.exit(1);

const lineInputs = {
  amountHt: 1620,
  hoursMode: 'lines',
  days: 9,
  hoursPerDay: 1,
  service: 'sc',
  techs: [],
  hourLines: [
    {
      work_date: '2026-09-07',
      service: 'sc',
      serviceLabel: 'SC (surface cleaner)',
      people: [
        { name: 'Tech A', hours: 7.25, profileId: 'tech-a', homeAddress: 'Domicile A, Belgique' },
        { name: 'Tech B', hours: 4, profileId: 'tech-b', homeAddress: 'Domicile B, Belgique' },
      ],
    },
  ],
  productLines: [{ product: 'biomix', liters: 20 }],
  clientAddress: inputs.clientAddress,
  kmOverride: {},
  closer: 'Rémy',
  extras: [{ label: 'Hôtel', amount: 90 }],
  fuelByDate: {
    '2026-09-07': {
      trips: techs.map((x) => ({
        personKey: `id:${x.id}`,
        name: x.name,
        homeAddress: x.address,
        profileId: x.id,
        km: km[x.id],
      })),
    },
  },
};
const { calc: lineCalc } = simulateMargin({
  inputs: lineInputs,
  params,
  prices,
  dieselEurL,
  cacAdsAmount: cac.amount,
  cacAdsStatus: cac.status,
});
const snap = simulationSnapshot(lineCalc, { minPrice, cac });
const seeded = seedHourLinesFromSimple({ days: 2, hoursPerDay: 3, service: 'sc', techIds: ['tech-a'], serviceValue: 'sc' }, [
  { id: 'tech-a', full_name: 'Tech A', address: 'Rue 1' },
]);
const linesOk =
  lineCalc.personHours === 11.25 &&
  lineCalc.otherExpenses === 90 &&
  lineCalc.essenceHours === 11.25 &&
  resolveSimulationServiceCode('SC (surface cleaner)') === 'sc' &&
  resolveSimulationServiceCode('hs:Nettoyage toiture') === 'nettoyage' &&
  snap.ma === lineCalc.ma &&
  snap.caHt === 1620 &&
  snap.mbPct != null &&
  normalizeSimForm({ amountHt: '10' }).hoursMode === 'simple' &&
  seeded.length === 2 &&
  seeded[0].people[0].hours === 3;
console.log('=== v1.14 lines mode + service catalog + snapshot ===');
console.log({ linesOk, personHours: lineCalc.personHours, essenceHours: lineCalc.essenceHours, extras: lineCalc.otherExpenses, ma: snap.ma, mbPct: snap.mbPct });
if (!linesOk) process.exit(1);
