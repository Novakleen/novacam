/**
 * Geocode (Nominatim, Belgium-biased) + driving distance (public OSRM).
 * Results are cached in-memory for the session.
 */

const geocodeCache = new Map();
const routeCache = new Map();

const BELGIUM_VIEWBOX = '2.5,51.55,6.4,49.45';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** Nominatim public API: max 1 req/s. */
let lastNominatimAt = 0;

function normAddress(address) {
  return String(address || '').trim().replace(/\s+/g, ' ');
}

/**
 * Usable postal address for fuel geocoding.
 * Rejects placeholders (—, N/A) and normalizes CC-style " · " separators.
 */
export function normalizeFuelAddress(address) {
  if (address == null) return '';
  let s = String(address).trim();
  if (!s) return '';
  // CompanyCam UI joins with middle-dot; Nominatim prefers commas/spaces
  s = s.replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim();
  const lower = s.toLowerCase();
  if (
    s === '—' ||
    s === '-' ||
    s === '–' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'unknown' ||
    lower === 'inconnu'
  ) {
    return '';
  }
  return s;
}

/**
 * Strip Belgian admin/region tokens that break Nominatim free-text search.
 * CompanyCam often emits "…, Région wallonne, 1457, BE" which returns 0 hits;
 * the same street without the region resolves correctly.
 */
export function stripBelgianAdminNoise(address) {
  let s = normalizeFuelAddress(address);
  if (!s) return '';
  s = s
    .replace(/\bRégion\s+de\s+Bruxelles-Capitale\b/gi, '')
    .replace(/\bRegion\s+de\s+Bruxelles-Capitale\b/gi, '')
    .replace(/\bBruxelles-Capitale\b/gi, '')
    .replace(/\bBrussels-Capital(\s+Region)?\b/gi, '')
    .replace(/\bRégion\s+wallonne\b/gi, '')
    .replace(/\bRegion\s+wallonne\b/gi, '')
    .replace(/\bRégion\s+flamande\b/gi, '')
    .replace(/\bRegion\s+flamande\b/gi, '')
    .replace(/\bVlaams\s+Gewest\b/gi, '')
    .replace(/\bFlanders\b/gi, '')
    .replace(/\bWallonie\b/gi, '')
    .replace(/\bWallonia\b/gi, '')
    .replace(/\bBrabant\s+wallon\b/gi, '')
    .replace(/\bVlaams-Brabant\b/gi, '')
    .replace(/\bWest-Vlaanderen\b/gi, '')
    .replace(/\bOost-Vlaanderen\b/gi, '')
    // collapse leftover empty comma slots
    .replace(/\s*,\s*,+/g, ',')
    .replace(/^,\s*|,\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * Ordered Nominatim query variants (cleaned first — CC region noise first).
 */
export function geocodeQueryVariants(address) {
  const raw = normalizeFuelAddress(address);
  if (!raw) return [];
  const cleaned = stripBelgianAdminNoise(raw);
  const dropCountry = (s) =>
    String(s || '')
      .replace(/,?\s*(BE|Belgique|Belgium|België|Belgie)\s*$/i, '')
      .replace(/\s*,\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const out = [];
  const push = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (!out.some((x) => x.toLowerCase() === k)) out.push(t);
  };

  // Prefer cleaned queries — they succeed for CC "Région wallonne/flamande"
  push(cleaned);
  push(dropCountry(cleaned));
  push(raw);
  push(dropCountry(raw));
  return out;
}

export function clearFuelCaches() {
  geocodeCache.clear();
  routeCache.clear();
}

async function throttleNominatim() {
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
}

/**
 * Single Nominatim lookup (caller handles throttling / variants).
 */
async function nominatimLookup(query) {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: '1',
    addressdetails: '0',
    countrycodes: 'be',
    viewbox: BELGIUM_VIEWBOX,
    bounded: '0',
  });

  try {
    await throttleNominatim();
    lastNominatimAt = Date.now();
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7',
        // Nominatim requires an identifying UA (browsers already send one).
        'User-Agent': 'NovacamMarginFuel/1.5.4 (https://github.com/Novakleen/novacam)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (hit?.lat && hit?.lon) {
      return {
        lat: parseFloat(hit.lat),
        lon: parseFloat(hit.lon),
        displayName: hit.display_name || query,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string} address
 * @returns {Promise<{ lat: number, lon: number, displayName: string }|null>}
 */
export async function geocodeAddress(address) {
  const usable = normalizeFuelAddress(address);
  const key = normAddress(usable).toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  let result = null;
  for (const q of geocodeQueryVariants(usable)) {
    result = await nominatimLookup(q);
    if (result) break;
  }

  geocodeCache.set(key, result);
  return result;
}

/**
 * One-way driving distance in km, or null if routing fails.
 */
export async function routeDistanceKm(from, to) {
  if (!from || !to) return null;
  const key = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  if (routeCache.has(key)) return routeCache.get(key);

  let km = null;
  try {
    const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const meters = data?.routes?.[0]?.distance;
      if (Number.isFinite(meters)) km = meters / 1000;
    }
  } catch {
    km = null;
  }

  routeCache.set(key, km);
  return km;
}

/** First person on a work date who has a usable home address (fallback: first person). */
export function pickDriverForDate(hourLines, date) {
  let fallback = null;
  for (const line of hourLines || []) {
    if (line.work_date !== date) continue;
    for (const person of line.people || []) {
      if (!fallback) fallback = person;
      if (normalizeFuelAddress(person.homeAddress)) return person;
    }
  }
  return fallback;
}

/**
 * For each unique work_date, geocode driver home → client and compute one-way km.
 * @returns {Promise<Record<string, { km: number|null }>>}
 */
export async function resolveFuelByDate({ hourLines = [], clientAddress } = {}) {
  const fuelByDate = {};
  const dates = [];
  const seen = new Set();

  for (const line of hourLines) {
    if (!line.work_date || seen.has(line.work_date)) continue;
    seen.add(line.work_date);
    dates.push(line.work_date);
  }

  const client = normalizeFuelAddress(clientAddress);
  if (!dates.length || !client) {
    for (const date of dates) fuelByDate[date] = { km: null };
    return fuelByDate;
  }

  const clientGeo = await geocodeAddress(client);

  for (const date of dates) {
    const driver = pickDriverForDate(hourLines, date);
    const home = normalizeFuelAddress(driver?.homeAddress);
    if (!home || !clientGeo) {
      fuelByDate[date] = { km: null };
      continue;
    }
    const homeGeo = await geocodeAddress(home);
    if (!homeGeo) {
      fuelByDate[date] = { km: null };
      continue;
    }
    const km = await routeDistanceKm(homeGeo, clientGeo);
    fuelByDate[date] = { km };
  }

  return fuelByDate;
}

/**
 * Resolve fuel distances for many dossiers. Shares geocode/route caches.
 */
export async function resolveFuelForDossiers(dossiers) {
  const map = {};
  for (const d of dossiers || []) {
    map[d.id] = await resolveFuelByDate({
      hourLines: d.hour_lines || d.margin_hour_lines || [],
      clientAddress: d.client_address,
    });
  }
  return map;
}
