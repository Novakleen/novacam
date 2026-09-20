import {
  isCommercialCloser,
  mixNeedsSpray,
  parseMix,
  roundMoney,
  serviceLabel,
  toNumberOrNull,
} from './constants';
import { distinctWorkersOnDate, normalizeFuelAddress } from './fuel';

/**
 * Pure margin calculation.
 *
 * personHours = sum all people hours
 * productCost = sum liters * price[slug]
 * mo = personHours * eur_h
 * dieselFuel (trip): for each unique work_date × distinct worker:
 *   workers = distinct by profileId (else name+homeAddress); same person multi-service = 1 trip
 *   km = one-way (provided via fuelByDate[date].trips[].km)
 *   if km null → that person-trip adds nothing (flag incomplete / routing failed)
 *   else dieselFuel += tripFactor * km * (consumption_l100/100) * dieselEurL
 *     tripFactor = 2 if round_trip else 1
 * essenceHours = sum person hours on lines whose service ∈ params.essence_services
 * essenceFuel = essenceHours * essence_l_h * essence_eur_l
 * fuel (total) = (dieselFuel||0) + (essenceFuel||0)
 * otherExpenses = sum project_expenses.amount_ht (optional)
 * direct = productCost + mo + fuel + otherExpenses
 * if caHt null: mb/ma null, com=0, ads=0
 * else:
 *   com = closer in commercial_closers ? caHt * com_rate : 0
 *   ads = caHt * cac_rate
 *   mb = caHt - direct
 *   ma = mb - com - ads
 *
 * @param {object} input
 * @param {object} input.dossier
 * @param {Array} input.hourLines
 * @param {Array} input.productLines
 * @param {object} input.params  margin_params row
 * @param {Record<string, number>} input.prices  slug → €/L
 * @param {Record<string, { trips: Array<{ personKey: string, name?: string|null, homeAddress?: string|null, profileId?: string|null, km: number|null }> }>} [input.fuelByDate]
 * @param {number} [input.dieselEurL]
 */
export function calculateProjectMargin({
  dossier = {},
  hourLines = [],
  productLines = [],
  params = {},
  prices = {},
  fuelByDate = {},
  dieselEurL,
  otherExpenses = 0,
} = {}) {
  const personHours = sumPersonHours(hourLines);
  const productCost = sumProductCost(productLines, prices);
  const otherExp = Number(otherExpenses) || Number(dossier.other_expenses) || 0;
  const eurH = Number(params.eur_h) || 0;
  const mo = personHours * eurH;

  const diesel = dieselEurL != null ? Number(dieselEurL) : effectiveDiesel(params);
  const consumption = Number(params.consumption_l100) || 0;
  const tripFactor = params.round_trip === false ? 1 : 2;

  const fuelResult = computeDieselFuel({
    hourLines,
    fuelByDate,
    diesel,
    consumption,
    tripFactor,
    clientAddress: dossier.client_address,
  });

  const dieselFuel = fuelResult.fuel;
  const essenceHours = sumEssenceHours(hourLines, params.essence_services);
  const essenceLh = Number(params.essence_l_h) || 0;
  const essenceEurL = Number(params.essence_eur_l) || 0;
  const essenceFuel = essenceHours * essenceLh * essenceEurL;
  const fuel = (dieselFuel || 0) + (essenceFuel || 0);
  const direct = productCost + mo + fuel + (Number.isFinite(otherExp) ? otherExp : 0);

  const caHt = toNumberOrNull(dossier.ca_ht);
  const closer = dossier.closer || '';
  const commercial = isCommercialCloser(closer, params.commercial_closers);

  let com = 0;
  let ads = 0;
  let mb = null;
  let ma = null;
  let maPct = null;

  if (caHt == null) {
    com = 0;
    ads = 0;
    mb = null;
    ma = null;
    maPct = null;
  } else {
    com = commercial ? caHt * (Number(params.com_rate) || 0) : 0;
    ads = caHt * (Number(params.cac_rate) || 0);
    mb = caHt - direct;
    ma = mb - com - ads;
    maPct = caHt !== 0 ? ma / caHt : null;
  }

  const mixAtoms = parseMix(dossier.mix);
  const flags = buildCompletenessFlags({
    dossier,
    hourLines,
    productLines,
    mixAtoms,
    fuelIncomplete: fuelResult.missingAddresses,
    fuelRoutingFailed: fuelResult.routingFailed,
    caHt,
  });

  return {
    personHours: roundHours(personHours),
    productCost: roundMoney(productCost),
    mo: roundMoney(mo),
    dieselFuel: dieselFuel == null ? null : roundMoney(dieselFuel),
    essenceHours: roundHours(essenceHours),
    essenceFuel: roundMoney(essenceFuel),
    fuel: roundMoney(fuel),
    fuelIncomplete: fuelResult.missingAddresses,
    fuelRoutingFailed: fuelResult.routingFailed,
    fuelDays: fuelResult.days,
    roundTrip: tripFactor === 2,
    otherExpenses: roundMoney(otherExp || 0),
    direct: roundMoney(direct),
    caHt: caHt == null ? null : roundMoney(caHt),
    com: roundMoney(com),
    ads: roundMoney(ads),
    mb: mb == null ? null : roundMoney(mb),
    ma: ma == null ? null : roundMoney(ma),
    maPct,
    commercial,
    mixAtoms,
    flags,
    complete: flags.length === 0,
  };
}

export function sumPersonHours(hourLines) {
  let total = 0;
  for (const line of hourLines || []) {
    for (const person of line.people || []) {
      const h = Number(person.hours);
      if (Number.isFinite(h)) total += h;
    }
  }
  return total;
}

/** Hours on services listed in essence_services (case-insensitive). */
export function sumEssenceHours(hourLines, essenceServices) {
  const set = new Set(
    (Array.isArray(essenceServices) ? essenceServices : ['nettoyage', 'sc']).map((s) =>
      String(s).trim().toLowerCase()
    )
  );
  let total = 0;
  for (const line of hourLines || []) {
    const svc = String(line.service || '')
      .trim()
      .toLowerCase();
    if (!svc || !set.has(svc)) continue;
    for (const person of line.people || []) {
      const h = Number(person.hours);
      if (Number.isFinite(h)) total += h;
    }
  }
  return total;
}

export function sumProductCost(productLines, prices) {
  let total = 0;
  for (const line of productLines || []) {
    const liters = Number(line.liters);
    const slug = line.product || line.slug;
    const unit = Number(prices?.[slug]);
    if (Number.isFinite(liters) && Number.isFinite(unit)) {
      total += liters * unit;
    }
  }
  return total;
}

export function effectiveDiesel(params = {}) {
  const live = toNumberOrNull(params.diesel_eur_l_live);
  if (live != null && live > 0) return live;
  const fallback = toNumberOrNull(params.diesel_eur_l_fallback);
  return fallback != null && fallback > 0 ? fallback : 2.47;
}

function computeDieselFuel({ hourLines, fuelByDate, diesel, consumption, tripFactor, clientAddress }) {
  const dates = uniqueWorkDates(hourLines);
  const days = [];
  let fuelSum = 0;
  let anySuccess = false;
  let missingAddresses = false;
  let routingFailed = false;

  if (!dates.length) {
    return { fuel: null, incomplete: false, missingAddresses: false, routingFailed: false, days };
  }

  const client = normalizeFuelAddress(clientAddress);
  if (!client) {
    missingAddresses = true;
  }

  const litersPerKm = (Number(consumption) || 0) / 100;

  for (const date of dates) {
    const resolved = Boolean(fuelByDate) && Object.prototype.hasOwnProperty.call(fuelByDate, date);
    const entry = resolved ? fuelByDate[date] : null;
    const tripSpecs = resolveTripSpecsForDate(hourLines, date, entry);

    for (const t of tripSpecs) {
      const home = normalizeFuelAddress(t.homeAddress);
      const kmNum = resolved ? toNumberOrNull(t.km) : null;
      const day = {
        date,
        personKey: t.personKey,
        driverName: t.name || null,
        homeAddress: home || null,
        profileId: t.profileId || null,
        oneWayKm: kmNum,
        km: kmNum == null ? null : kmNum * tripFactor, // billed km (A/R if round_trip)
        roundTrip: tripFactor === 2,
        cost: null,
      };

      if (!home || !client) {
        missingAddresses = true;
        days.push(day);
        continue;
      }
      if (!resolved) {
        days.push(day);
        continue;
      }
      if (kmNum == null || kmNum < 0) {
        // Addresses present but geocode/route failed — not "incomplete addresses"
        routingFailed = true;
        days.push(day);
        continue;
      }

      const cost = day.km * litersPerKm * (Number(diesel) || 0);
      day.cost = cost;
      fuelSum += cost;
      anySuccess = true;
      days.push(day);
    }
  }

  return {
    fuel: anySuccess ? fuelSum : null,
    incomplete: missingAddresses,
    missingAddresses,
    routingFailed,
    days,
  };
}

/** Prefer resolved trips; else synthesize person list from hour lines (pre-geocode). */
function resolveTripSpecsForDate(hourLines, date, entry) {
  if (entry?.trips && Array.isArray(entry.trips)) {
    return entry.trips.map((t) => ({
      personKey: t.personKey || personFuelKeyFallback(t),
      name: t.name || null,
      homeAddress: t.homeAddress || null,
      profileId: t.profileId || null,
      km: t.km,
    }));
  }
  // Legacy single-km shape (one driver per date) — treat as one trip if present
  if (entry && Object.prototype.hasOwnProperty.call(entry, 'km') && !entry.trips) {
    const workers = distinctWorkersOnDate(hourLines, date);
    const first = workers[0];
    if (first) {
      return [
        {
          personKey: first.personKey,
          name: first.person?.name || null,
          homeAddress: first.person?.homeAddress || null,
          profileId: first.person?.profileId || null,
          km: entry.km,
        },
      ];
    }
  }
  return distinctWorkersOnDate(hourLines, date).map(({ personKey, person }) => ({
    personKey,
    name: person?.name || null,
    homeAddress: person?.homeAddress || null,
    profileId: person?.profileId || null,
    km: undefined,
  }));
}

function personFuelKeyFallback(t) {
  if (t?.profileId) return `id:${t.profileId}`;
  const name = String(t?.name || '').trim().toLowerCase();
  const addr = normalizeFuelAddress(t?.homeAddress).toLowerCase();
  return `na:${name}|${addr}`;
}

export function uniqueWorkDates(hourLines) {
  const set = new Set();
  for (const line of hourLines || []) {
    if (line.work_date) set.add(line.work_date);
  }
  return [...set].sort();
}

export function firstPersonOnDate(hourLines, date) {
  for (const line of hourLines || []) {
    if (line.work_date !== date) continue;
    const people = line.people || [];
    if (people.length) return people[0];
  }
  return null;
}

export function buildCompletenessFlags({
  dossier,
  hourLines,
  productLines,
  mixAtoms,
  fuelIncomplete,
  fuelRoutingFailed,
  caHt,
}) {
  const flags = [];
  const billed = caHt != null;

  if (!billed) {
    flags.push({ key: 'ca', label: 'CA HT manquant' });
  }

  const hasHours = (hourLines || []).some((l) =>
    (l.people || []).some((p) => Number(p.hours) > 0)
  );
  if (!hasHours) {
    flags.push({ key: 'hours', label: 'Heures manquantes' });
  }

  if (mixNeedsSpray(mixAtoms)) {
    const hasProducts = (productLines || []).some((l) => Number(l.liters) > 0);
    if (!hasProducts) {
      flags.push({ key: 'products', label: 'Produits manquants (mix pulvérisation)' });
    }
  }

  if (billed && !String(dossier.closer || '').trim()) {
    flags.push({ key: 'closer', label: 'Closer manquant' });
  }

  if (fuelIncomplete) {
    flags.push({ key: 'fuel', label: 'Adresses carburant manquantes' });
  } else if (fuelRoutingFailed) {
    flags.push({ key: 'fuel_route', label: 'Échec géocode trajet diesel' });
  }

  const servicesWithHours = new Set();
  for (const line of hourLines || []) {
    const hours = (line.people || []).reduce((acc, p) => acc + (Number(p.hours) || 0), 0);
    if (hours > 0 && line.service) servicesWithHours.add(String(line.service).toLowerCase());
  }
  for (const atom of mixAtoms || []) {
    if (!servicesWithHours.has(atom)) {
      flags.push({
        key: `hours_${atom}`,
        label: `Heures manquantes : ${serviceLabel(atom)}`,
      });
    }
  }

  return flags;
}

function roundHours(n) {
  if (n == null || !Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
}

export function maTone(maPct) {
  if (maPct == null || !Number.isFinite(maPct)) return 'empty';
  if (maPct >= 0.4) return 'ok';
  if (maPct >= 0.2) return 'warn';
  return 'danger';
}
