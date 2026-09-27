/**
 * Fleet inventory (v1.8.0): tree of containers / items + damage tickets + photos + kits.
 *
 * fleet_nodes: depot / van (roots, id = stock_locations.id) → zone → caisse / machine → materiel.
 * Litres are NOT in the tree: they stay in stock_balances per depot / van location.
 * Condition is derived server-side from open tickets (worst severity), never written by the UI.
 * Members only write through RPCs (fleet_report_damage / fleet_ticket_action / fleet_move_node /
 * fleet_place_article).
 *
 * v1.10.0: caisse / machine / materiel nodes and kit items reference a catalog article
 * (fleet_articles). Name, translations, icon and kind come from the article (DB trigger);
 * only zones keep free names. Per-instance fields: qty, serial, brand, model, notes.
 */
import { supabase } from '@/lib/customSupabaseClient';

export const CONDITIONS = ['ok', 'damaged_usable', 'broken', 'missing'];
export const SEVERITIES = ['damaged_usable', 'broken', 'missing'];
export const TICKET_STATUSES = ['signale', 'vu', 'en_reparation', 'commande', 'resolu'];
export const RESOLUTIONS = ['repare', 'remplace', 'retrouve'];
export const ZONE_KEYS = ['cab', 'bulkhead', 'left_shelf', 'right_shelf', 'floor'];
export const CONTAINER_KINDS = ['depot', 'van', 'zone', 'caisse', 'machine'];
export const ITEM_KINDS = ['caisse', 'machine', 'materiel'];
export const ARTICLE_KINDS = ITEM_KINDS;
export const PHOTO_BUCKET = 'fleet-photos';

export const CONDITION_COLORS = {
  ok: '#10b981',
  damaged_usable: '#eab308',
  broken: '#ef4444',
  missing: '#9ca3af',
};

const RANK = { ok: 0, damaged_usable: 1, missing: 2, broken: 3 };
export function worseCondition(a, b) {
  return (RANK[b] || 0) > (RANK[a] || 0) ? b : a;
}

function throwIf(error) {
  if (error) throw error;
}

export async function fetchInventory() {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [nodes, tickets, kits, kitItems, articles] = await Promise.all([
    supabase.from('fleet_nodes').select('*').order('sort').order('name'),
    supabase
      .from('fleet_tickets')
      .select('*')
      .or(`status.neq.resolu,resolved_at.gte.${since}`)
      .order('reported_at', { ascending: false }),
    supabase.from('fleet_kits').select('*').order('sort'),
    supabase.from('fleet_kit_items').select('*').order('sort'),
    supabase.from('fleet_articles').select('*').order('sort').order('name'),
  ]);
  throwIf(nodes.error);
  return {
    nodes: nodes.data || [],
    tickets: tickets.error ? [] : tickets.data || [],
    kits: kits.error ? [] : kits.data || [],
    kitItems: kitItems.error ? [] : kitItems.data || [],
    articles: articles.error ? [] : articles.data || [],
  };
}

export async function fetchTicketEvents(ticketId) {
  const { data, error } = await supabase
    .from('fleet_ticket_events')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at');
  throwIf(error);
  return data || [];
}

export async function fetchNodePhotos(nodeId) {
  const { data, error } = await supabase
    .from('fleet_photos')
    .select('*')
    .eq('node_id', nodeId)
    .order('created_at', { ascending: false });
  throwIf(error);
  return data || [];
}

export async function signedPhotoUrls(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list, 3600);
  if (error) return {};
  const out = {};
  for (const row of data || []) if (row?.path && row?.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/** Downscale to max 1600 px JPEG before upload (phones produce 4–12 MB photos). */
async function downscale(file, max = 1600) {
  if (!file?.type?.startsWith('image/') || /heic|heif/i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob || file;
  } catch {
    return file;
  }
}

/** Upload one photo under nodes/<nodeId>/…; returns the storage path. */
export async function uploadNodePhoto(nodeId, file) {
  const blob = await downscale(file);
  const isJpeg = blob.type === 'image/jpeg' || blob !== file;
  const ext = isJpeg ? 'jpg' : (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const rand = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = `nodes/${nodeId}/${rand}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: isJpeg ? 'image/jpeg' : file.type, upsert: false });
  throwIf(error);
  return path;
}

export async function reportDamage({ nodeId, severity, note, qty, photoPaths }) {
  const { data, error } = await supabase.rpc('fleet_report_damage', {
    p_node: nodeId,
    p_severity: severity,
    p_note: note || null,
    p_qty: qty || 1,
    p_photo_paths: photoPaths?.length ? photoPaths : null,
  });
  throwIf(error);
  return data;
}

export async function ticketAction(ticketId, action, { value = null, note = null, cost = null, photoPath = null } = {}) {
  const { error } = await supabase.rpc('fleet_ticket_action', {
    p_ticket: ticketId,
    p_action: action,
    p_value: value,
    p_note: note,
    p_cost: cost === '' || cost == null ? null : Number(cost),
    p_photo_path: photoPath,
  });
  throwIf(error);
}

/** Admin-only: attach a photo to a node without a ticket (machine pictures). */
export async function addNodePhoto(nodeId, path) {
  const { error } = await supabase.from('fleet_photos').insert({ node_id: nodeId, path });
  throwIf(error);
}

export async function moveNode(nodeId, parentId, qty = null) {
  const { data, error } = await supabase.rpc('fleet_move_node', {
    p_node: nodeId,
    p_parent: parentId,
    p_qty: qty ? Number(qty) : null,
  });
  throwIf(error);
  return data;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────
const ZONE_FIELDS = ['parent_id', 'kind', 'name', 'name_nl', 'name_en', 'icon', 'sort', 'active', 'zone_key', 'plan_x', 'plan_y', 'plan_w', 'plan_h'];
// Items: label / icon / kind come from the article (DB trigger) — only per-instance fields are written.
const ITEM_FIELDS = ['parent_id', 'article_id', 'qty', 'serial', 'brand', 'model', 'notes', 'sort', 'active'];

function nodePayload(n) {
  const out = {};
  const isItem = ITEM_KINDS.includes(n.kind) || Boolean(n.article_id);
  for (const k of isItem ? ITEM_FIELDS : ZONE_FIELDS) {
    if (!(k in n)) continue;
    let v = n[k];
    if (k === 'qty' || k === 'sort') v = v === '' || v == null ? (k === 'qty' ? 1 : 0) : Number(v);
    else if (k.startsWith('plan_')) v = v === '' || v == null ? null : Number(v);
    else if (typeof v === 'string') v = v.trim() || null;
    out[k] = v;
  }
  if (n.kind === 'machine') out.qty = 1;
  if (isItem && !n.id) {
    // Insert needs kind + a placeholder name; the trigger replaces both from the article.
    out.kind = n.kind;
    out.name = n.name || '-';
  }
  return out;
}

export async function saveNode(node) {
  const payload = nodePayload(node);
  const q = node.id
    ? supabase.from('fleet_nodes').update(payload).eq('id', node.id)
    : supabase.from('fleet_nodes').insert(payload);
  const { data, error } = await q.select().single();
  throwIf(error);
  return data;
}

/** Zone geometry (cm, cargo coordinates). Admin or the van's technician (RPC-checked). */
export async function setZoneGeometry(nodeId, rect) {
  const { error } = await supabase.rpc('fleet_set_zone_geometry', {
    p_node: nodeId,
    p_x: rect.x,
    p_y: rect.y,
    p_w: rect.w,
    p_h: rect.h,
  });
  throwIf(error);
}

export async function deleteNode(nodeId) {
  const { error } = await supabase.from('fleet_nodes').delete().eq('id', nodeId);
  throwIf(error);
}

export async function applyKit(nodeId, kitId) {
  const { data, error } = await supabase.rpc('fleet_apply_kit', { p_node: nodeId, p_kit: kitId });
  throwIf(error);
  return data || 0;
}

/** v1.10.0: put a catalog article into a container (crate articles are filled with their default kit). */
export async function placeArticle(parentId, articleId, qty = 1) {
  const { data, error } = await supabase.rpc('fleet_place_article', {
    p_parent: parentId,
    p_article: articleId,
    p_qty: Math.max(1, Number(qty) || 1),
  });
  throwIf(error);
  return data;
}

// ─── Catalog (admin) ──────────────────────────────────────────────────────────
export async function saveArticle(a) {
  const payload = {
    kind: a.kind,
    name: String(a.name || '').trim(),
    name_nl: String(a.name_nl || '').trim() || null,
    name_en: String(a.name_en || '').trim() || null,
    icon: a.icon || null,
    default_kit_id: a.kind === 'caisse' ? a.default_kit_id || null : null,
    notes: String(a.notes || '').trim() || null,
    active: a.active !== false,
    sort: Number(a.sort) || 0,
  };
  const q = a.id
    ? supabase.from('fleet_articles').update(payload).eq('id', a.id)
    : supabase.from('fleet_articles').insert(payload);
  const { data, error } = await q.select().single();
  throwIf(error);
  return data;
}

/** Hard delete only works for unused articles (FK restrict); otherwise deactivate. */
export async function deleteArticle(id) {
  const { data, error } = await supabase.from('fleet_articles').delete().eq('id', id).select('id');
  throwIf(error);
  if (!data?.length) {
    const e = new Error('FLEET_ARTICLE_NOT_DELETED');
    e.code = 'FLEET_ARTICLE_NOT_DELETED';
    throw e;
  }
}

/** Fleet-wide usage of each article: instances, quantity, per root, condition counts. */
export function articleUsage(nodes, byId) {
  const out = new Map();
  for (const n of nodes || []) {
    if (!n.article_id) continue;
    let u = out.get(n.article_id);
    if (!u) {
      u = { instances: 0, qty: 0, byRoot: new Map(), damaged_usable: 0, broken: 0, missing: 0 };
      out.set(n.article_id, u);
    }
    const q = n.kind === 'materiel' ? Number(n.qty) || 0 : 1;
    u.instances += 1;
    u.qty += q;
    const root = byId?.get(n.root_id);
    const key = root?.id || n.root_id;
    const r = u.byRoot.get(key) || { root, qty: 0 };
    r.qty += q;
    u.byRoot.set(key, r);
    if (n.condition && n.condition !== 'ok') u[n.condition] = (u[n.condition] || 0) + q;
  }
  return out;
}

export async function saveKit(kit) {
  const payload = {
    name: String(kit.name || '').trim(),
    name_nl: String(kit.name_nl || '').trim() || null,
    name_en: String(kit.name_en || '').trim() || null,
    target_kind: kit.target_kind || 'caisse',
    active: kit.active !== false,
    sort: Number(kit.sort) || 0,
  };
  const q = kit.id
    ? supabase.from('fleet_kits').update(payload).eq('id', kit.id)
    : supabase.from('fleet_kits').insert(payload);
  const { data, error } = await q.select().single();
  throwIf(error);
  return data;
}

export async function saveKitItem(item) {
  const payload = {
    kit_id: item.kit_id,
    parent_item_id: item.parent_item_id || null,
    kind: item.kind,
    // v1.10.0: non-zone kit items are catalog articles (label synced by trigger).
    article_id: item.kind === 'zone' ? null : item.article_id || null,
    name: String(item.name || '').trim() || '-',
    name_nl: String(item.name_nl || '').trim() || null,
    name_en: String(item.name_en || '').trim() || null,
    zone_key: item.kind === 'zone' ? item.zone_key : null,
    qty: item.kind === 'materiel' ? Math.max(1, Number(item.qty) || 1) : 1,
    icon: item.icon || null,
    sort: Number(item.sort) || 0,
    active: item.active !== false,
  };
  if (item.kind === 'zone' && item.plan_w > 0) {
    Object.assign(payload, { plan_x: item.plan_x, plan_y: item.plan_y, plan_w: item.plan_w, plan_h: item.plan_h });
  } else if (item.kind !== 'zone') {
    Object.assign(payload, { plan_x: null, plan_y: null, plan_w: null, plan_h: null });
  }
  const q = item.id
    ? supabase.from('fleet_kit_items').update(payload).eq('id', item.id)
    : supabase.from('fleet_kit_items').insert(payload);
  const { data, error } = await q.select().single();
  throwIf(error);
  return data;
}

/** Admin: copy a van's zone layout into its kit items (new vans start with it). */
export async function saveLayoutAsKitDefault(zones) {
  let n = 0;
  for (const z of zones) {
    if (!z.kit_item_id || !z.rect) continue;
    const { error } = await supabase
      .from('fleet_kit_items')
      .update({ plan_x: z.rect.x, plan_y: z.rect.y, plan_w: z.rect.w, plan_h: z.rect.h })
      .eq('id', z.kit_item_id)
      .eq('kind', 'zone');
    throwIf(error);
    n += 1;
  }
  return n;
}

/**
 * Admin: delete a kit item. Child kit items cascade (FK parent_item_id ON DELETE CASCADE);
 * van items created from it are kept and only unlinked (fleet_nodes.kit_item_id ON DELETE SET NULL).
 * Throws KIT_ITEM_NOT_DELETED when RLS silently matched 0 rows.
 */
export async function deleteKitItem(id) {
  const { data, error } = await supabase.from('fleet_kit_items').delete().eq('id', id).select('id');
  throwIf(error);
  if (!data || data.length === 0) {
    const err = new Error('KIT_ITEM_NOT_DELETED');
    err.code = 'KIT_ITEM_NOT_DELETED';
    throw err;
  }
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────
export function nodeName(node, lang) {
  if (!node) return '—';
  if (lang === 'nl' && node.name_nl) return node.name_nl;
  if (lang === 'en' && node.name_en) return node.name_en;
  return node.name;
}

export function isContainer(node) {
  return Boolean(node) && CONTAINER_KINDS.includes(node.kind);
}

export function buildTree(nodes, tickets) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    if (!children.has(n.parent_id)) children.set(n.parent_id, []);
    children.get(n.parent_id).push(n);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), 'fr'));
  }
  const openTickets = (tickets || []).filter((t) => t.status !== 'resolu');
  const openByNode = new Map();
  for (const t of openTickets) {
    if (!openByNode.has(t.node_id)) openByNode.set(t.node_id, []);
    openByNode.get(t.node_id).push(t);
  }

  const worstCache = new Map();
  const worst = (id) => {
    if (worstCache.has(id)) return worstCache.get(id);
    const n = byId.get(id);
    let w = n?.condition || 'ok';
    for (const c of children.get(id) || []) w = worseCondition(w, worst(c.id));
    worstCache.set(id, w);
    return w;
  };

  const path = (id) => {
    const out = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 50) {
      out.unshift(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return out;
  };

  const descendants = (id) => {
    const out = [];
    const stack = [...(children.get(id) || [])];
    while (stack.length) {
      const n = stack.shift();
      out.push(n);
      stack.unshift(...(children.get(n.id) || []));
    }
    return out;
  };

  /** Non-ok conditions under a root: { damaged_usable, broken, missing } */
  const conditionCounts = (rootId) => {
    const c = { damaged_usable: 0, broken: 0, missing: 0 };
    for (const n of nodes) if (n.root_id === rootId && n.condition !== 'ok' && c[n.condition] != null) c[n.condition] += 1;
    return c;
  };

  return {
    byId,
    childrenOf: (id) => children.get(id) || [],
    worst,
    path,
    descendants,
    conditionCounts,
    openTicketsFor: (id) => openByNode.get(id) || [],
    openTickets,
  };
}
