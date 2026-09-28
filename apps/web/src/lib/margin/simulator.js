import { calculateProjectMargin } from './calculateProjectMargin';
import { isCommercialCloser, toNumberOrNull } from './constants';
import { normalizeFuelAddress, personFuelKey } from './fuel';

/**
 * v1.13.0 « Simulateur » — pure what-if margin calculator (nothing is saved).
 *
 * The simulation builds a synthetic dossier / hourLines / productLines / fuelByDate and runs the
 * SAME calculateProjectMargin as the project Marge tab, so the numbers match exactly:
 *   - hourLines: one line per simulated day (work_date "J01", "J02"…), service = chosen service,
 *     people = the assigned technicians, each with `hoursPerDay` hours
 *     → personHours = techs × days × hoursPerDay; essence via params.essence_services / essence_time_factor
 *   - fuelByDate: for every day, one trip per technician with the one-way km (routed home → client,
 *     or the manual override) → diesel A/R per tech per day, like the real chantier
 *   - productLines: product slug + litres, catalog €/L via pricesMap
 *   - otherExpenses: sum of the « frais supplémentaires » lines (HT)
 *   - dossier: ca_ht = potential invoice amount HT, closer (commission via com_rate), client_address
 *   - cacAdsAmount: resolved from the lead entry month (resolveCacAdsAmount)
 */

export const SIM_MAX_DAYS = 60;
const MANUAL_KM_ADDRESS = 'km manuel';

export function simDates(days) {
  const n = Math.max(0, Math.min(SIM_MAX_DAYS, Math.floor(Number(days) || 0)));
  return Array.from({ length: n }, (_, i) => `J${String(i + 1).padStart(2, '0')}`);
}

export function sumExtras(extras) {
  return (extras || []).reduce((s, e) => {
    const n = Number(e?.amount);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
}

/**
 * @param {object} inputs
 * @param {number|string} inputs.amountHt potential invoice amount HT (€); '' → no CA (MB/MA empty)
 * @param {Array<{ id: string, name?: string, address?: string|null }>} inputs.techs assigned technicians
 * @param {number} inputs.days
 * @param {number} inputs.hoursPerDay per technician
 * @param {string} inputs.service service code (SERVICE_CODES)
 * @param {Array<{ product: string, liters: number|string }>} inputs.productLines
 * @param {string} inputs.clientAddress
 * @param {Record<string, number|null>} [inputs.routedKm] profileId → routed one-way km (null = failed)
 * @param {Record<string, number|string>} [inputs.kmOverride] profileId → manual one-way km
 * @param {string} inputs.closer closer name ('' / 'Remy' → no commission unless listed)
 * @param {Array<{ label: string, amount: number|string }>} inputs.extras
 */
export function buildSimulation(inputs = {}) {
  const {
    amountHt = '',
    techs = [],
    days = 1,
    hoursPerDay = 8,
    service = 'sc',
    productLines = [],
    clientAddress = '',
    routedKm = {},
    kmOverride = {},
    closer = '',
    extras = [],
  } = inputs;
  const dates = simDates(days);
  const hours = Number(hoursPerDay) || 0;

  const people = techs.map((t) => {
    const manual = toNumberOrNull(kmOverride?.[t.id]);
    const home = normalizeFuelAddress(t.address) || (manual != null ? MANUAL_KM_ADDRESS : null);
    return { name: t.name || null, hours, profileId: t.id, homeAddress: home };
  });

  const hourLines = dates.map((d) => ({ work_date: d, service, people: people.map((p) => ({ ...p })) }));

  const anyManual = techs.some((t) => toNumberOrNull(kmOverride?.[t.id]) != null);
  const client = normalizeFuelAddress(clientAddress) || (anyManual ? MANUAL_KM_ADDRESS : '');

  const kmFor = (id) => {
    const manual = toNumberOrNull(kmOverride?.[id]);
    if (manual != null && manual >= 0) return manual;
    const routed = routedKm?.[id];
    return routed == null ? null : Number(routed);
  };
  const fuelByDate = {};
  for (const d of dates) {
    fuelByDate[d] = {
      trips: people.map((p) => ({
        personKey: personFuelKey(p),
        name: p.name,
        homeAddress: p.homeAddress,
        profileId: p.profileId,
        km: kmFor(p.profileId),
      })),
    };
  }

  const products = (productLines || [])
    .filter((l) => l?.product && Number(l.liters) > 0)
    .map((l) => ({ work_date: dates[0] || 'J01', product: l.product, liters: Number(l.liters) }));

  const dossier = {
    ca_ht: toNumberOrNull(amountHt),
    closer: closer || '',
    client_address: client,
    mix: service,
  };

  return { dossier, hourLines, productLines: products, fuelByDate, otherExpenses: sumExtras(extras) };
}

/** Run the simulation through calculateProjectMargin (same engine as the project Marge tab). */
export function simulateMargin({ inputs, params = {}, prices = {}, dieselEurL, cacAdsAmount = null, cacAdsStatus = null }) {
  const built = buildSimulation(inputs);
  const calc = calculateProjectMargin({
    dossier: built.dossier,
    hourLines: built.hourLines,
    productLines: built.productLines,
    params,
    prices,
    fuelByDate: built.fuelByDate,
    dieselEurL,
    otherExpenses: built.otherExpenses,
    cacAdsAmount,
    cacAdsStatus,
  });
  return { built, calc };
}

/**
 * Minimum invoice amount HT so that MA % ≥ target.
 *   MA = CA − direct − com − ads, com = CA × com_rate (closer commercial) → CA = (direct + ads) / (1 − target − rate)
 * Returns null when impossible (target + commission rate ≥ 100 %).
 */
export function minPriceForMa({ direct, ads = 0, targetPct, closer, params = {} }) {
  const t = Number(targetPct);
  if (!Number.isFinite(t)) return null;
  const rate = isCommercialCloser(closer, params.commercial_closers) ? Number(params.com_rate) || 0 : 0;
  const denom = 1 - t - rate;
  if (denom <= 0) return null;
  const cost = (Number(direct) || 0) + (Number(ads) || 0);
  return Math.ceil((cost / denom) * 100) / 100;
}
