import { DIESEL_CACHE_MS } from './constants';
import { effectiveDiesel } from './calculateProjectMargin';
import { supabase } from '@/lib/customSupabaseClient';

export { effectiveDiesel };

export function isDieselFresh(fetchedAt, now = Date.now()) {
  if (!fetchedAt) return false;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < DIESEL_CACHE_MS;
}

export function dieselSourceLabel(params) {
  const live = Number(params?.diesel_eur_l_live);
  if (Number.isFinite(live) && live > 0) {
    return isDieselFresh(params.diesel_fetched_at) ? 'live' : 'live-stale';
  }
  return 'fallback';
}

/**
 * Admin-only edge function: fetches Belgian B7 max price and writes
 * margin_params.diesel_eur_l_live + diesel_fetched_at.
 * If the function is not deployed, the caller should let the user set live price manually.
 */
export async function refreshDieselPrice() {
  const { data, error } = await supabase.functions.invoke('diesel-price-be', { body: {} });
  if (error) {
    const msg = error.message || 'Échec du rafraîchissement diesel';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
