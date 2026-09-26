/**
 * Fleet (Flotte / Vloot) data layer — v1.7.0.
 *
 * Catalog = public.margin_product_prices (slug is the stable product id used by margins + spray).
 * Stock = stock_locations (1 depot + 1 per van) × stock_balances (litres), changed only by
 * stock_moves (purchase / transfer / adjust from the UI; spray_consume from the spray trigger).
 * RLS: Admin full access; members see their assigned van + the depot.
 */
import { supabase } from '@/lib/customSupabaseClient';
import { invalidateSprayProducts } from '@/lib/sprayProducts';

export const MOVE_TYPES = ['purchase', 'transfer', 'spray_consume', 'adjust'];
export const ADJUST_REASONS = ['breakage', 'measure', 'loss', 'correction'];
export const EQUIPMENT_STATUSES = ['ok', 'missing', 'broken'];
export const DEFAULT_PRODUCT_COLOR = '#1e3a8a';

function throwIf(error) {
  if (error) throw error;
}

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Products: admins read the table (with price); others get the price-less RPC. */
export async function fetchFleetProducts(isAdmin) {
  if (isAdmin) {
    const { data, error } = await supabase.from('margin_product_prices').select('*');
    throwIf(error);
    return sortProducts(data || []);
  }
  const { data, error } = await supabase.rpc('list_spray_products');
  throwIf(error);
  return sortProducts(data || []);
}

export function sortProducts(rows) {
  return [...rows].sort(
    (a, b) =>
      (a.sort ?? 0) - (b.sort ?? 0) ||
      String(a.name || a.slug).localeCompare(String(b.name || b.slug), 'fr', { sensitivity: 'base' })
  );
}

/** Localized product name (name = FR, name_nl / name_en optional). */
export function productName(product, lang) {
  if (!product) return '—';
  if (lang === 'nl' && product.name_nl) return product.name_nl;
  if (lang === 'en' && product.name_en) return product.name_en;
  return product.name || product.slug;
}

export function templateName(tpl, lang) {
  if (!tpl) return '—';
  if (lang === 'nl' && tpl.name_nl) return tpl.name_nl;
  if (lang === 'en' && tpl.name_en) return tpl.name_en;
  return tpl.name_fr;
}

/** Everything the Fleet tab needs in one round of parallel queries. */
export async function fetchFleetData(isAdmin) {
  const [products, vans, assignments, locations, balances, templates, equipment, profiles] =
    await Promise.all([
      fetchFleetProducts(isAdmin),
      supabase.from('fleet_vans').select('*').order('sort').order('name'),
      supabase.from('fleet_assignments').select('*').order('start_at', { ascending: false }),
      supabase.from('stock_locations').select('*'),
      supabase.from('stock_balances').select('*'),
      supabase.from('equipment_templates').select('*').order('sort').order('name_fr'),
      supabase.from('van_equipment').select('*'),
      supabase.from('profiles').select('id, full_name, email, initials, role'),
    ]);
  for (const res of [vans, assignments, locations, balances, templates, equipment]) throwIf(res.error);
  return {
    products,
    vans: vans.data || [],
    assignments: assignments.data || [],
    locations: locations.data || [],
    balances: balances.data || [],
    templates: templates.data || [],
    equipment: equipment.data || [],
    profiles: profiles.error ? [] : profiles.data || [],
  };
}

export async function fetchMoves({ limit = 300, since = null } = {}) {
  let q = supabase
    .from('stock_moves')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (since) q = q.gte('created_at', since);
  const { data, error } = await q;
  throwIf(error);
  const moves = data || [];
  // Chantier labels: app projects by id, spray entries for CompanyCam / manual clients
  const projectIds = [...new Set(moves.map((m) => m.project_id).filter(Boolean))];
  const sprayIds = [...new Set(moves.map((m) => m.spray_entry_id).filter(Boolean))];
  const [projects, sprays] = await Promise.all([
    projectIds.length
      ? supabase.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [] }),
    sprayIds.length
      ? supabase
          .from('spray_entries')
          .select('id, client_name, companycam_project_name')
          .in('id', sprayIds)
      : Promise.resolve({ data: [] }),
  ]);
  const projectName = new Map((projects.data || []).map((p) => [p.id, p.name]));
  const sprayLabel = new Map(
    (sprays.data || []).map((s) => [s.id, s.companycam_project_name || s.client_name || null])
  );
  return moves.map((m) => ({
    ...m,
    chantier: (m.project_id && projectName.get(m.project_id)) || sprayLabel.get(m.spray_entry_id) || null,
  }));
}

/** Friendly error for DB stock guard. */
export function isStockNegativeError(err) {
  return /STOCK_NEGATIVE/.test(String(err?.message || ''));
}

export async function createMove(move) {
  const { data: auth } = await supabase.auth.getUser();
  const payload = {
    move_date: todayISO(),
    ...move,
    user_id: move.user_id || auth?.user?.id,
    qty_litres: Number(move.qty_litres),
    unit_price: move.unit_price === '' || move.unit_price == null ? null : Number(move.unit_price),
  };
  const { data, error } = await supabase.from('stock_moves').insert(payload).select().single();
  throwIf(error);
  return data;
}

export async function reassignVan(vanId, userId, startDate) {
  const { error } = await supabase.rpc('fleet_reassign_van', {
    p_van_id: vanId,
    p_user_id: userId || null,
    p_start: startDate || todayISO(),
  });
  throwIf(error);
}

export async function setEquipmentStatus(id, patch) {
  const { data, error } = await supabase
    .from('van_equipment')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function resyncVanEquipment(vanId) {
  const { data, error } = await supabase.rpc('fleet_resync_van_equipment', { p_van_id: vanId });
  throwIf(error);
  return data || 0;
}

export async function saveVan(van) {
  const payload = {
    name: String(van.name || '').trim(),
    plate: String(van.plate || '').trim() || null,
    active: van.active !== false,
  };
  const q = van.id
    ? supabase.from('fleet_vans').update(payload).eq('id', van.id)
    : supabase.from('fleet_vans').insert({ ...payload, sort: van.sort ?? 0 });
  const { data, error } = await q.select().single();
  throwIf(error);
  return data;
}

export async function setLocationMin(locationId, productSlug, minLitres) {
  const min = minLitres === '' || minLitres == null ? null : Number(minLitres);
  // Row may not exist yet (never moved) → admin may insert a 0-litre row
  const { data: existing } = await supabase
    .from('stock_balances')
    .select('location_id')
    .eq('location_id', locationId)
    .eq('product_slug', productSlug)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from('stock_balances')
        .update({ min_litres: min })
        .eq('location_id', locationId)
        .eq('product_slug', productSlug)
    : await supabase
        .from('stock_balances')
        .insert({ location_id: locationId, product_slug: productSlug, litres: 0, min_litres: min });
  throwIf(error);
}

// ─── Catalog (admin) ─────────────────────────────────────────────────────────
const PRODUCT_FIELDS = [
  'name',
  'name_nl',
  'name_en',
  'price_eur_l',
  'active',
  'color',
  'pack_litres',
  'default_min_depot',
  'default_min_van',
  'sku',
  'sort',
];

function productPayload(p) {
  const out = {};
  for (const k of PRODUCT_FIELDS) {
    if (!(k in p)) continue;
    let v = p[k];
    if (['price_eur_l', 'pack_litres', 'default_min_depot', 'default_min_van', 'sort'].includes(k)) {
      v = v === '' || v == null ? null : Number(v);
    } else if (typeof v === 'string') {
      v = v.trim() || null;
    }
    out[k] = v;
  }
  if ('default_min_depot' in out && out.default_min_depot == null) out.default_min_depot = 25;
  if ('default_min_van' in out && out.default_min_van == null) out.default_min_van = 10;
  if ('sort' in out && out.sort == null) out.sort = 0;
  return out;
}

export async function updateProduct(slug, patch) {
  const { data, error } = await supabase
    .from('margin_product_prices')
    .update({ ...productPayload(patch), updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select()
    .single();
  throwIf(error);
  invalidateSprayProducts();
  return data;
}

export async function createProduct(slug, fields) {
  const { data, error } = await supabase
    .from('margin_product_prices')
    .insert({ slug, unit: 'L', ...productPayload(fields), updated_at: new Date().toISOString() })
    .select()
    .single();
  throwIf(error);
  invalidateSprayProducts();
  return data;
}

// ─── Equipment template (admin) ─────────────────────────────────────────────
export async function saveTemplate(tpl) {
  const payload = {
    name_fr: String(tpl.name_fr || '').trim(),
    name_nl: String(tpl.name_nl || '').trim() || null,
    name_en: String(tpl.name_en || '').trim() || null,
    is_serialized: Boolean(tpl.is_serialized),
    active: tpl.active !== false,
    sort: Number(tpl.sort) || 0,
  };
  const q = tpl.id
    ? supabase.from('equipment_templates').update(payload).eq('id', tpl.id)
    : supabase.from('equipment_templates').insert(payload);
  const { data, error } = await q.select().single();
  throwIf(error);
  return data;
}

// ─── Derived state helpers ───────────────────────────────────────────────────
export function buildFleetIndex(data, lang) {
  const { products, vans, assignments, locations, balances, templates, equipment, profiles } = data;
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const depot = locations.find((l) => l.kind === 'depot') || null;
  const locationByVan = new Map(locations.filter((l) => l.van_id).map((l) => [l.van_id, l]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const vanById = new Map(vans.map((v) => [v.id, v]));
  const balanceKey = (loc, slug) => `${loc}|${slug}`;
  const balanceMap = new Map(balances.map((b) => [balanceKey(b.location_id, b.product_slug), b]));
  const currentAssignment = new Map(
    assignments.filter((a) => !a.end_at).map((a) => [a.van_id, a])
  );
  const activeProducts = products.filter((p) => p.active !== false);
  const templateById = new Map(templates.map((t) => [t.id, t]));

  const stockFor = (location, product) => {
    const b = location ? balanceMap.get(balanceKey(location.id, product.slug)) : null;
    const litres = Number(b?.litres || 0);
    const fallback = location?.kind === 'depot' ? product.default_min_depot : product.default_min_van;
    const min = Number(b?.min_litres ?? fallback ?? 0);
    // red = below threshold (or empty), amber = within 50 % above threshold, green = OK
    const state = litres <= 0 || litres < min ? 'out' : litres < min * 1.5 ? 'low' : 'ok';
    return { litres, min, state, override: b?.min_litres ?? null };
  };

  const locationAlerts = (location) =>
    activeProducts.filter((p) => stockFor(location, p).state === 'out').length;

  const vanEquipment = (vanId) =>
    equipment
      .filter((e) => e.van_id === vanId)
      .map((e) => ({ ...e, template: templateById.get(e.template_id) }))
      .filter((e) => e.template && e.template.active !== false)
      .sort((a, b) => (a.template.sort ?? 0) - (b.template.sort ?? 0));

  const equipmentIssues = (vanId) => {
    const items = vanEquipment(vanId);
    return {
      broken: items.filter((e) => e.status === 'broken').length,
      missing: items.filter((e) => e.status === 'missing').length,
    };
  };

  const locationLabel = (locId) => {
    const loc = locationById.get(locId);
    if (!loc) return '—';
    if (loc.kind === 'depot') return null; // caller translates
    return vanById.get(loc.van_id)?.name || loc.name;
  };

  return {
    lang,
    profileById,
    productBySlug,
    depot,
    locationByVan,
    locationById,
    vanById,
    currentAssignment,
    activeProducts,
    templateById,
    stockFor,
    locationAlerts,
    vanEquipment,
    equipmentIssues,
    locationLabel,
  };
}

export function personName(profile) {
  if (!profile) return '—';
  return profile.full_name || profile.email || '—';
}

export function firstName(profile) {
  const n = personName(profile);
  return n === '—' ? n : n.split(' ')[0];
}

export function initialsOf(profile) {
  if (profile?.initials) return profile.initials;
  const n = personName(profile);
  if (n === '—') return '?';
  return n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

export function fmtL(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}

/**
 * Van stock seen by the spray form (warning only, never blocks).
 * Mirrors the DB trigger: assignment covering `day`, else the current one.
 * Returns null when the user has no van (the trigger then debits the depot + « van inconnu »).
 */
export async function fetchSprayVanStock(userId, day, entryId = null) {
  if (!userId) return null;
  const { data: rows, error } = await supabase
    .from('fleet_assignments')
    .select('van_id, start_at, end_at')
    .eq('user_id', userId)
    .order('start_at', { ascending: false });
  if (error || !rows?.length) return null;
  const d = day || todayISO();
  const covering =
    rows.find((a) => a.start_at <= d && (!a.end_at || a.end_at > d)) || rows.find((a) => !a.end_at);
  if (!covering) return null;
  const [{ data: van }, { data: loc }] = await Promise.all([
    supabase.from('fleet_vans').select('id, name').eq('id', covering.van_id).maybeSingle(),
    supabase.from('stock_locations').select('id').eq('van_id', covering.van_id).maybeSingle(),
  ]);
  if (!loc) return null;
  const [{ data: balances }, prev] = await Promise.all([
    supabase.from('stock_balances').select('product_slug, litres').eq('location_id', loc.id),
    entryId
      ? supabase
          .from('stock_moves')
          .select('product_slug, applied_litres, from_location_id')
          .eq('spray_entry_id', entryId)
      : Promise.resolve({ data: [] }),
  ]);
  const litres = {};
  for (const b of balances || []) litres[b.product_slug] = Number(b.litres || 0);
  // Editing: the entry's current consumption is given back before re-debiting
  for (const m of prev?.data || []) {
    if (m.from_location_id === loc.id) {
      litres[m.product_slug] = (litres[m.product_slug] || 0) + Number(m.applied_litres || 0);
    }
  }
  return { vanName: van?.name || '', locationId: loc.id, litres };
}
