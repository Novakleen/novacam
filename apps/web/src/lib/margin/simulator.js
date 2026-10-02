import { calculateProjectMargin } from './calculateProjectMargin';
import { SERVICE_BY_CODE, SERVICE_CODES, isCommercialCloser, mapTaskLabelToService, toNumberOrNull } from './constants';
import { normalizeFuelAddress, personFuelKey } from './fuel';

/**
 * v1.14.0 « Simulateur » — what-if margin calculator.
 *
 * The simulation builds a synthetic dossier / hourLines / productLines / fuelByDate and runs the
 * SAME calculateProjectMargin as the project Marge tab, so the numbers match exactly.
 *
 * Hours:
 *   - simple: one line per day (work_date "J01"…), every selected tech gets hoursPerDay
 *   - lines: the same per-day / per-person hour lines as a real dossier (HourLinesEditor)
 * Fuel: one trip per technician per day (routed home → client, or a manual one-way km).
 * Round-trip ×2 is applied inside calculateProjectMargin. Extras (hotel, lift…) are otherExpenses.
 */

export const SIM_MAX_DAYS = 60;
export const SIM_DRAFT_KEY = 'novacam:margin-simulator:draft:v1';
const MANUAL_KM_ADDRESS = 'km manuel';

export function simDates(days) {
  const n = Math.max(0, Math.min(SIM_MAX_DAYS, Math.floor(Number(days) || 0)));
  return Array.from({ length: n }, (_, i) => `J${String(i + 1).padStart(2, '0')}`);
}

function localISODate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function defaultSimForm() {
  return {
    name: '',
    amountHt: '',
    techIds: [],
    days: 1,
    hoursPerDay: 8,
    service: 'sc',
    serviceLabel: '',
    serviceValue: 'sc',
    hoursMode: 'simple',
    hourLines: [],
    productLines: [{ product: '', liters: '' }],
    clientAddress: '',
    kmOverride: {},
    closer: '',
    monthKey: currentMonthKey(),
    extras: [],
    targetPct: 30,
    hubspotContactId: '',
    hubspotContactName: '',
    hubspotDealId: '',
    hubspotDealName: '',
    hubspotQuoteId: '',
    hubspotQuoteTitle: '',
    projectId: '',
    projectName: '',
  };
}

/** Restore a draft / saved payload without letting unknown keys wipe the form shape. */
export function normalizeSimForm(raw) {
  const base = defaultSimForm();
  if (!raw || typeof raw !== 'object') return base;
  const next = { ...base };
  for (const key of Object.keys(base)) {
    if (raw[key] !== undefined && raw[key] !== null) next[key] = raw[key];
  }
  if (!Array.isArray(next.techIds)) next.techIds = [];
  if (!Array.isArray(next.productLines) || !next.productLines.length) next.productLines = base.productLines;
  if (!Array.isArray(next.extras)) next.extras = [];
  if (!Array.isArray(next.hourLines)) next.hourLines = [];
  if (next.hoursMode !== 'lines') next.hoursMode = 'simple';
  if (!next.kmOverride || typeof next.kmOverride !== 'object' || Array.isArray(next.kmOverride)) {
    next.kmOverride = {};
  }
  if (!next.serviceValue) next.serviceValue = next.service || 'sc';
  return next;
}

export function sumExtras(extras) {
  return (extras || []).reduce((s, e) => {
    const n = Number(e?.amount);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
}

/**
 * Map a HubSpot type-of-service label (or a margin service code) to the code
 * calculateProjectMargin / essence_services understand. Same path as dossier hour lines
 * (mapTaskLabelToService, else « autre »).
 */
export function resolveSimulationServiceCode(raw) {
  let value = String(raw || '').trim();
  if (!value) return 'autre';
  if (value.startsWith('hs:')) value = value.slice(3);
  const lower = value.toLowerCase();
  if (SERVICE_BY_CODE[lower]) return lower;
  const pipe = value.split('|||');
  if (pipe.length === 2 && SERVICE_BY_CODE[String(pipe[0]).toLowerCase()]) {
    return String(pipe[0]).toLowerCase();
  }
  return mapTaskLabelToService(value) || 'autre';
}

/**
 * Margin SERVICE_CODES plus every HubSpot `type_of_service` label that is not already listed.
 * `value` is unique; `code` is what the calculator uses.
 */
export function mergeSimulationServices(catalog = [], extraLabels = []) {
  const options = SERVICE_CODES.map((s) => ({
    value: s.code,
    code: s.code,
    label: s.label,
    source: 'margin',
  }));
  const seen = new Set(options.map((o) => o.label.toLowerCase()));

  const addLabel = (label, source) => {
    const name = String(label || '').trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    const code = mapTaskLabelToService(name) || 'autre';
    // Value is the label, not the HubSpot option id, so a saved simulation
    // still matches the dropdown after the catalog is refetched.
    options.push({
      value: `hs:${name}`,
      code,
      label: name,
      source,
    });
  };

  for (const item of catalog || []) {
    addLabel(item?.name || item?.label, item?.source || 'hubspot');
  }
  for (const label of extraLabels || []) addLabel(label, 'hubspot');
  return options;
}

export function servicePatchFromLabels(labels, serviceOptions = []) {
  const label = (labels || []).map((l) => String(l || '').trim()).find(Boolean);
  if (!label) return {};
  const opt =
    serviceOptions.find((s) => s.label.toLowerCase() === label.toLowerCase()) ||
    serviceOptions.find((s) => s.value === `hs:${label}`);
  if (opt) {
    return { service: opt.code, serviceLabel: opt.label, serviceValue: opt.value || opt.code };
  }
  return {
    service: resolveSimulationServiceCode(label),
    serviceLabel: label,
    serviceValue: `hs:${label}`,
  };
}

/** Turn the simple days × hours shortcut into dossier-style hour lines. */
export function seedHourLinesFromSimple(form, profiles = []) {
  const dates = simDates(form?.days || 1);
  const selected = (profiles || []).filter((p) => (form?.techIds || []).includes(p.id));
  const people = (selected.length ? selected : [{ id: null, full_name: '', address: '' }]).map((p) => ({
    name: p.full_name || p.email || '',
    hours: Number(form?.hoursPerDay) || 0,
    homeAddress: p.address || '',
    profileId: p.id || null,
  }));
  const code = resolveSimulationServiceCode(form?.service);
  return dates.map((_, i) => ({
    work_date: localISODate(i),
    service: code,
    serviceLabel: form?.serviceLabel || '',
    serviceValue: form?.serviceValue || code,
    people: people.map((p) => ({ ...p })),
  }));
}

function applyKmOverrides(fuelByDate, kmOverride) {
  const out = {};
  for (const [date, bucket] of Object.entries(fuelByDate || {})) {
    out[date] = {
      ...bucket,
      trips: (bucket?.trips || []).map((tr) => {
        const manual = toNumberOrNull(kmOverride?.[tr.profileId]);
        if (manual != null && manual >= 0) return { ...tr, km: manual };
        return tr;
      }),
    };
  }
  return out;
}

function normalizeHourLines(lines, kmOverride) {
  return (lines || []).map((line) => {
    const service = SERVICE_BY_CODE[String(line?.service || '').toLowerCase()]
      ? String(line.service).toLowerCase()
      : resolveSimulationServiceCode(line?.serviceLabel || line?.serviceValue || line?.service);
    const people = (line?.people || []).map((p) => {
      const manual = toNumberOrNull(kmOverride?.[p.profileId]);
      const home = normalizeFuelAddress(p.homeAddress) || (manual != null ? MANUAL_KM_ADDRESS : null);
      return {
        name: p.name || null,
        hours: Number(p.hours) || 0,
        profileId: p.profileId || null,
        homeAddress: home,
      };
    });
    return { work_date: line?.work_date || '', service, people };
  });
}

function fuelFromLines(hourLines, kmOverride) {
  const fuelByDate = {};
  for (const line of hourLines) {
    const d = line.work_date;
    if (!d) continue;
    if (!fuelByDate[d]) fuelByDate[d] = { trips: [] };
    for (const p of line.people) {
      const key = personFuelKey(p);
      if (fuelByDate[d].trips.some((t) => t.personKey === key)) continue;
      fuelByDate[d].trips.push({
        personKey: key,
        name: p.name,
        homeAddress: p.homeAddress,
        profileId: p.profileId,
        km: (() => {
          const manual = toNumberOrNull(kmOverride?.[p.profileId]);
          return manual != null && manual >= 0 ? manual : null;
        })(),
      });
    }
  }
  return fuelByDate;
}

/**
 * @param {object} inputs
 * @param {number|string} inputs.amountHt potential invoice amount HT (€)
 * @param {'simple'|'lines'} [inputs.hoursMode]
 * @param {Array} [inputs.hourLines] dossier-style lines when hoursMode is 'lines'
 * @param {Record<string, { trips: Array }>} [inputs.fuelByDate] routed fuel (lines mode)
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
    hoursMode = 'simple',
    hourLines: rawHourLines = [],
    fuelByDate: routedFuel = null,
  } = inputs;

  const useLines = hoursMode === 'lines' && Array.isArray(rawHourLines) && rawHourLines.length > 0;
  const dates = useLines ? [] : simDates(days);
  const client = normalizeFuelAddress(clientAddress);

  let hourLines;
  let fuelByDate;
  let mix;

  if (useLines) {
    hourLines = normalizeHourLines(rawHourLines, kmOverride);
    const hasRouted = routedFuel && Object.keys(routedFuel).length > 0;
    fuelByDate = hasRouted ? applyKmOverrides(routedFuel, kmOverride) : fuelFromLines(hourLines, kmOverride);
    const codes = [];
    for (const line of hourLines) {
      if (line.service && !codes.includes(line.service)) codes.push(line.service);
    }
    mix = codes.join('+') || resolveSimulationServiceCode(service);
  } else {
    const code = resolveSimulationServiceCode(service);
    const hours = Number(hoursPerDay) || 0;
    const people = techs.map((t) => {
      const manual = toNumberOrNull(kmOverride?.[t.id]);
      const home = normalizeFuelAddress(t.address) || (manual != null ? MANUAL_KM_ADDRESS : null);
      return { name: t.name || null, hours, profileId: t.id, homeAddress: home };
    });
    hourLines = dates.map((d) => ({ work_date: d, service: code, people: people.map((p) => ({ ...p })) }));

    const kmFor = (id) => {
      const manual = toNumberOrNull(kmOverride?.[id]);
      if (manual != null && manual >= 0) return manual;
      const routed = routedKm?.[id];
      return routed == null ? null : Number(routed);
    };
    fuelByDate = {};
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
    mix = code;
  }

  const anyManual = techs.some((t) => toNumberOrNull(kmOverride?.[t.id]) != null);
  const dossierAddress = client || (anyManual ? MANUAL_KM_ADDRESS : '');
  const productDate = hourLines[0]?.work_date || 'J01';
  const products = (productLines || [])
    .filter((l) => l?.product && Number(l.liters) > 0)
    .map((l) => ({ work_date: productDate, product: l.product, liters: Number(l.liters) }));

  const dossier = {
    ca_ht: toNumberOrNull(amountHt),
    closer: closer || '',
    client_address: useLines ? client || dossierAddress : dossierAddress,
    mix,
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
 * Snapshot stored with a simulation (MA / MB / %, CA HT, and the cost lines).
 * Percents are ratios, same as calculateProjectMargin.
 */
export function simulationSnapshot(calc, { minPrice = null, cac = null } = {}) {
  if (!calc) return {};
  const ca = calc.caHt;
  const mbPct = ca != null && Number(ca) !== 0 && calc.mb != null ? calc.mb / ca : null;
  return {
    caHt: calc.caHt ?? null,
    direct: calc.direct ?? null,
    mo: calc.mo ?? null,
    productCost: calc.productCost ?? null,
    dieselFuel: calc.dieselFuel ?? null,
    essenceFuel: calc.essenceFuel ?? null,
    essenceHours: calc.essenceHours ?? null,
    fuel: calc.fuel ?? null,
    otherExpenses: calc.otherExpenses ?? null,
    personHours: calc.personHours ?? null,
    com: calc.com ?? null,
    ads: calc.ads ?? null,
    mb: calc.mb ?? null,
    ma: calc.ma ?? null,
    mbPct,
    maPct: calc.maPct ?? null,
    commercial: Boolean(calc.commercial),
    minPrice: minPrice ?? null,
    cacStatus: cac?.status || null,
    cacAmount: cac?.status === 'ok' ? cac.amount : null,
    flags: Array.isArray(calc.flags) ? calc.flags : [],
  };
}

/**
 * Minimum invoice amount HT so that MA % ≥ target.
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
