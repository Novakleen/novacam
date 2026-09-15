/**
 * Geocode (Nominatim, Belgium-biased) + driving distance (public OSRM).
 * Results are cached in-memory for the session.
 */

const geocodeCache = new Map();
const routeCache = new Map();

const BELGIUM_VIEWBOX = '2.5,51.55,6.4,49.45';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

function normAddress(address) {
  return String(address || '').trim().replace(/\s+/g, ' ');
}

export function clearFuelCaches() {
  geocodeCache.clear();
  routeCache.clear();
}

/**
 * @param {string} address
 * @returns {Promise<{ lat: number, lon: number, displayName: string }|null>}
 */
export async function geocodeAddress(address) {
  const key = normAddress(address).toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const params = new URLSearchParams({
    format: 'json',
    q: key,
    limit: '1',
    addressdetails: '0',
    countrycodes: 'be',
    viewbox: BELGIUM_VIEWBOX,
    bounded: '0',
  });

  let result = null;
  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (hit?.lat && hit?.lon) {
        result = {
          lat: parseFloat(hit.lat),
          lon: parseFloat(hit.lon),
          displayName: hit.display_name || key,
        };
      }
    }
  } catch {
    result = null;
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

  if (!dates.length || !clientAddress) {
    for (const date of dates) fuelByDate[date] = { km: null };
    return fuelByDate;
  }

  const clientGeo = await geocodeAddress(clientAddress);

  for (const date of dates) {
    const driver = hourLines.find((l) => l.work_date === date && (l.people || []).length)?.people?.[0];
    const home = driver?.homeAddress;
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
