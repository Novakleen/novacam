/**
 * Spray product catalog (v1.6.21).
 *
 * Source of truth: public.margin_product_prices (managed in Flotte › Produits since v1.7.0).
 * Read for every role via RPC list_spray_products() (no prices; prices stay Admin-only).
 * Rows carry `active`: inactive products stay in the list (history / names) but are hidden
 * from new-spray pickers — use activeSprayProducts().
 * spray_entries.product_slug links an entry to a catalog product (slug is stable on rename);
 * spray_entries.product keeps the name as saved (fallback when the product was deleted / « Autre »).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { PRODUCT_SLUGS, mapSprayProductToSlug } from '@/lib/margin/constants';

let cache = null; // Promise<Array<{slug, name, active, color, ...}>>
const listeners = new Set();

function normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sortProducts(rows) {
  return [...rows].sort((a, b) =>
    String(a.name || a.slug).localeCompare(String(b.name || b.slug), 'fr', { sensitivity: 'base' })
  );
}

function toRow(r) {
  return {
    slug: r.slug,
    name: r.name || r.slug,
    active: r.active !== false,
    color: r.color || null,
    pack_litres: r.pack_litres ?? null,
    default_min_depot: r.default_min_depot ?? null,
    default_min_van: r.default_min_van ?? null,
    name_nl: r.name_nl || null,
    name_en: r.name_en || null,
    sort: r.sort ?? 0,
  };
}

async function loadProducts() {
  // 1) RPC (all signed-in roles)
  try {
    const { data, error } = await supabase.rpc('list_spray_products');
    if (!error && Array.isArray(data)) {
      return sortProducts(data.filter((r) => r?.slug).map(toRow));
    }
    if (error) console.warn('[sprayProducts] rpc failed:', error.message);
  } catch (err) {
    console.warn('[sprayProducts] rpc failed:', err?.message || err);
  }
  // 2) Direct table read (Admin RLS)
  try {
    const { data, error } = await supabase.from('margin_product_prices').select('*');
    if (!error && Array.isArray(data) && data.length) {
      return sortProducts(data.filter((r) => r?.slug).map(toRow));
    }
  } catch {
    /* ignore */
  }
  // 3) Static fallback (offline / migration missing)
  return sortProducts(PRODUCT_SLUGS.map((p) => toRow({ slug: p.slug, name: p.label })));
}

/** Cached catalog fetch. `force` bypasses the cache. */
export function fetchSprayProducts({ force = false } = {}) {
  if (!cache || force) {
    cache = loadProducts().catch((err) => {
      cache = null;
      throw err;
    });
    cache.then((rows) => listeners.forEach((fn) => fn(rows))).catch(() => {});
  }
  return cache;
}

/** Call after product CRUD in margin params so pickers refresh. */
export function invalidateSprayProducts() {
  cache = null;
  if (listeners.size) fetchSprayProducts();
}

/** React hook: { products, loading } — products sorted by name. */
export function useSprayProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const onUpdate = (rows) => {
      if (alive) setProducts(rows);
    };
    listeners.add(onUpdate);
    fetchSprayProducts()
      .then((rows) => {
        if (alive) setProducts(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      listeners.delete(onUpdate);
    };
  }, []);
  return { products, loading };
}

/** Products selectable for a new / edited spray: active ones + the currently linked slug. */
export function activeSprayProducts(products, keepSlug) {
  return (products || []).filter((p) => p.active !== false || (keepSlug && p.slug === keepSlug));
}

/** Catalog product for a slug, or null. */
export function findSprayProduct(slug, products) {
  if (!slug) return null;
  return (products || []).find((p) => p.slug === slug) || null;
}

/**
 * Resolve a catalog slug for an entry (or a bare product name):
 * product_slug → exact name/slug match → legacy keyword heuristics.
 */
export function resolveSprayProductSlug(entryOrName, products) {
  const entry = typeof entryOrName === 'object' && entryOrName ? entryOrName : null;
  const name = entry ? entry.product : entryOrName;
  const list = products || [];
  // Linked slug wins unless it was deleted from the catalog (then fall back to the name)
  if (entry?.product_slug && (!list.length || list.some((p) => p.slug === entry.product_slug))) {
    return entry.product_slug;
  }
  const n = normalize(name);
  if (!n) return null;
  const exact = list.find((p) => normalize(p.name) === n || normalize(p.slug) === n);
  if (exact) return exact.slug;
  const guess = mapSprayProductToSlug(name);
  if (guess && (!list.length || list.some((p) => p.slug === guess))) return guess;
  return null;
}

/**
 * Display name for a spray entry: current catalog name when linked (reflects renames),
 * otherwise the name stored on the entry as-is.
 */
export function sprayProductDisplayName(entry, products) {
  if (!entry) return '—';
  const linked = findSprayProduct(entry.product_slug, products);
  if (linked) return linked.name;
  return entry.product || '—';
}

/** Filter/group key: slug when linked to the catalog, else normalized stored name. */
export function sprayProductKey(entry, products) {
  const slug = resolveSprayProductSlug(entry, products);
  if (slug && findSprayProduct(slug, products)) return `slug:${slug}`;
  const n = normalize(entry?.product);
  return n ? `name:${n}` : '';
}
