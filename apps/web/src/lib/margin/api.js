import { supabase } from '@/lib/customSupabaseClient';
import { MARGIN_PARAMS_ID, sumInvoiceCaHt } from './constants';

export async function fetchMarginParams() {
  const { data, error } = await supabase
    .from('margin_params')
    .select('*')
    .eq('id', MARGIN_PARAMS_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMarginParams(patch) {
  const { data, error } = await supabase
    .from('margin_params')
    .update(patch)
    .eq('id', MARGIN_PARAMS_ID)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchProductPrices() {
  const { data, error } = await supabase
    .from('margin_product_prices')
    .select('*');
  if (error) throw error;
  return (data || []).sort((a, b) =>
    String(a.slug || a.product || '').localeCompare(String(b.slug || b.product || ''))
  );
}

export async function updateProductPrice(row, patch) {
  const payload = { ...patch, updated_at: new Date().toISOString() };
  if ('price' in payload && payload.price_eur_l == null) {
    payload.price_eur_l = payload.price;
    delete payload.price;
  }
  let query = supabase.from('margin_product_prices').update(payload);
  if (row?.id) query = query.eq('id', row.id);
  else query = query.eq('slug', row.slug || row);
  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProductPrice({ slug, name, price_eur_l }) {
  const { data, error } = await supabase
    .from('margin_product_prices')
    .insert({
      slug,
      name,
      price_eur_l: Number(price_eur_l),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProductPrice(slug) {
  const { error } = await supabase.from('margin_product_prices').delete().eq('slug', slug);
  if (error) throw error;
}

/** Soft check: count dossier product lines using this slug. */
export async function countProductUsage(slug) {
  const { count, error } = await supabase
    .from('margin_product_lines')
    .select('*', { count: 'exact', head: true })
    .eq('product', slug);
  if (error) throw error;
  return count || 0;
}

export function pricesMap(rows) {
  const map = {};
  for (const row of rows || []) {
    const slug = row.slug || row.product;
    const price = Number(row.price ?? row.price_eur_l ?? row.eur_l);
    if (slug && Number.isFinite(price)) map[slug] = price;
  }
  return map;
}

export async function fetchDossiers() {
  const { data, error } = await supabase
    .from('margin_dossiers')
    .select(`
      *,
      hour_lines:margin_hour_lines(*),
      product_lines:margin_product_lines(*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    // Fallback if nested embed is not available
    const { data: dossiers, error: dErr } = await supabase
      .from('margin_dossiers')
      .select('*')
      .order('created_at', { ascending: false });
    if (dErr) throw dErr;
    const ids = (dossiers || []).map((d) => d.id);
    let hourLines = [];
    let productLines = [];
    if (ids.length) {
      const [hRes, pRes] = await Promise.all([
        supabase.from('margin_hour_lines').select('*').in('dossier_id', ids),
        supabase.from('margin_product_lines').select('*').in('dossier_id', ids),
      ]);
      if (hRes.error) throw hRes.error;
      if (pRes.error) throw pRes.error;
      hourLines = hRes.data || [];
      productLines = pRes.data || [];
    }
    return (dossiers || []).map((d) => ({
      ...d,
      hour_lines: hourLines.filter((l) => l.dossier_id === d.id),
      product_lines: productLines.filter((l) => l.dossier_id === d.id),
    }));
  }

  return (data || []).map((d) => ({
    ...d,
    hour_lines: d.hour_lines || d.margin_hour_lines || [],
    product_lines: d.product_lines || d.margin_product_lines || [],
  }));
}

export async function fetchProjectsLite() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, address, full_address, is_archived')
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function fetchTeamProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, initials, address, role')
    .order('full_name');
  if (error) throw error;
  return data || [];
}

export async function saveDossier({ dossier, hourLines, productLines, existingId }) {
  const invoices = Array.isArray(dossier.invoices) ? dossier.invoices : [];
  const caHt = sumInvoiceCaHt(invoices);
  const payload = {
    project_id: dossier.project_id || null,
    client_name: dossier.client_name || null,
    mix: dossier.mix || null,
    ca_ht: caHt,
    closer: dossier.closer || null,
    exception: dossier.exception ?? false,
    client_address: dossier.client_address || null,
    invoices,
    notes: dossier.notes || null,
  };

  let row;
  if (existingId) {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .update(payload)
      .eq('id', existingId)
      .select()
      .single();
    if (error) throw error;
    row = data;
    const [hDel, pDel] = await Promise.all([
      supabase.from('margin_hour_lines').delete().eq('dossier_id', existingId),
      supabase.from('margin_product_lines').delete().eq('dossier_id', existingId),
    ]);
    if (hDel.error) throw hDel.error;
    if (pDel.error) throw pDel.error;
  } else {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    row = data;
  }

  const dossierId = row.id;
  const hoursPayload = (hourLines || [])
    .filter((l) => l.work_date)
    .map((l) => ({
      dossier_id: dossierId,
      work_date: l.work_date,
      service: l.service || null,
      people: l.people || [],
    }));
  const productsPayload = (productLines || [])
    .filter((l) => l.work_date && l.product)
    .map((l) => ({
      dossier_id: dossierId,
      work_date: l.work_date,
      product: l.product,
      liters: l.liters === '' || l.liters == null ? null : Number(l.liters),
      m2: l.m2 === '' || l.m2 == null ? null : Number(l.m2),
    }));

  if (hoursPayload.length) {
    const { error } = await supabase.from('margin_hour_lines').insert(hoursPayload);
    if (error) throw error;
  }
  if (productsPayload.length) {
    const { error } = await supabase.from('margin_product_lines').insert(productsPayload);
    if (error) throw error;
  }

  return dossierId;
}

export async function deleteDossier(id) {
  const [hDel, pDel] = await Promise.all([
    supabase.from('margin_hour_lines').delete().eq('dossier_id', id),
    supabase.from('margin_product_lines').delete().eq('dossier_id', id),
  ]);
  if (hDel.error) throw hDel.error;
  if (pDel.error) throw pDel.error;
  const { error } = await supabase.from('margin_dossiers').delete().eq('id', id);
  if (error) throw error;
}
