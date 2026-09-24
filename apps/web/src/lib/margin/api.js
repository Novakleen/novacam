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


/** mix is NOT NULL in DB — derive from hour-line services or keep existing / autre. */
function resolveMix(dossier, hourLines = []) {
  const existing = String(dossier?.mix || '').trim();
  if (existing) return existing;
  const services = [];
  for (const line of hourLines || []) {
    const s = String(line?.service || '').trim().toLowerCase();
    if (s && !services.includes(s)) services.push(s);
  }
  if (services.length) return services.join('+');
  return 'autre';
}

export async function saveDossier({ dossier, hourLines, productLines, existingId }) {
  const invoices = Array.isArray(dossier.invoices) ? dossier.invoices : [];
  const caHt = sumInvoiceCaHt(invoices);
  const payload = {
    project_id: dossier.project_id || null,
    client_name: dossier.client_name || null,
    mix: resolveMix(dossier, hourLines),
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

/** Load the single margin dossier linked to a Novacam and/or CompanyCam project. */
export async function fetchDossierForProject({ projectId, companycamProjectId } = {}) {
  if (!projectId && !companycamProjectId) return null;

  let dossier = null;
  if (projectId) {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) throw error;
    dossier = data;
  }
  if (!dossier && companycamProjectId) {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .select('*')
      .eq('companycam_project_id', String(companycamProjectId))
      .maybeSingle();
    if (error) throw error;
    dossier = data;
  }
  if (!dossier) return null;

  const [hRes, pRes] = await Promise.all([
    supabase.from('margin_hour_lines').select('*').eq('dossier_id', dossier.id),
    supabase.from('margin_product_lines').select('*').eq('dossier_id', dossier.id),
  ]);
  if (hRes.error) throw hRes.error;
  if (pRes.error) throw pRes.error;

  return {
    ...dossier,
    hour_lines: hRes.data || [],
    product_lines: pRes.data || [],
  };
}

/**
 * Upsert one dossier per project (unique on project_id / companycam_project_id).
 * Also persists snapshot columns (ma, mb, ma_pct, …) and source_fingerprint.
 */
export async function upsertProjectDossier({
  dossier,
  hourLines,
  productLines,
  calc = null,
  fingerprint = null,
  existingId = null,
}) {
  const invoices = Array.isArray(dossier.invoices) ? dossier.invoices : [];
  const caHt = sumInvoiceCaHt(invoices);
  const now = new Date().toISOString();
  const payload = {
    project_id: dossier.project_id || null,
    companycam_project_id: dossier.companycam_project_id
      ? String(dossier.companycam_project_id)
      : null,
    client_name: dossier.client_name || null,
    mix: resolveMix(dossier, hourLines),
    ca_ht: caHt,
    closer: dossier.closer || null,
    exception: dossier.exception ?? false,
    client_address: dossier.client_address || null,
    invoices,
    notes: dossier.notes || null,
    generated_at: now,
    source_fingerprint: fingerprint || dossier.source_fingerprint || null,
    ma: calc?.ma ?? null,
    mb: calc?.mb ?? null,
    ma_pct: calc?.maPct ?? null,
    direct_cost: calc?.direct ?? null,
    person_hours: calc?.personHours ?? null,
  };

  let row;
  let id = existingId;
  if (!id) {
    const existing = await fetchDossierForProject({
      projectId: payload.project_id,
      companycamProjectId: payload.companycam_project_id,
    });
    id = existing?.id || null;
  }

  if (id) {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    row = data;
    const [hDel, pDel] = await Promise.all([
      supabase.from('margin_hour_lines').delete().eq('dossier_id', id),
      supabase.from('margin_product_lines').delete().eq('dossier_id', id),
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

  return { id: dossierId, row };
}

/** Lightweight snapshots for dashboard STATS (keyed by project uuid / CC id). */
export async function fetchMarginSnapshots({ projectIds = [], companycamProjectIds = [] } = {}) {
  const byProject = {};
  const byCc = {};

  const select =
    'id, project_id, companycam_project_id, ma, mb, ma_pct, direct_cost, person_hours, generated_at, source_fingerprint, ca_ht';

  if (projectIds.length) {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .select(select)
      .in('project_id', projectIds);
    if (error) throw error;
    for (const row of data || []) {
      if (row.project_id) byProject[row.project_id] = row;
      if (row.companycam_project_id) byCc[String(row.companycam_project_id)] = row;
    }
  }

  const remainingCc = (companycamProjectIds || [])
    .map(String)
    .filter((id) => id && !byCc[id]);
  if (remainingCc.length) {
    const { data, error } = await supabase
      .from('margin_dossiers')
      .select(select)
      .in('companycam_project_id', remainingCc);
    if (error) throw error;
    for (const row of data || []) {
      if (row.companycam_project_id) byCc[String(row.companycam_project_id)] = row;
      if (row.project_id && !byProject[row.project_id]) byProject[row.project_id] = row;
    }
  }

  return { byProject, byCc };
}

/* ── Ad spend + CAC entry-month cache (v1.6.18) ─────────────────────────── */

export async function fetchAdSpendRows() {
  const { data, error } = await supabase
    .from('margin_ad_spend')
    .select('*')
    .order('month', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertAdSpendRow(row) {
  const payload = {
    month: row.month,
    platform: row.platform || 'Meta',
    spend: Number(row.spend),
    currency: row.currency || 'EUR',
    period_start: row.period_start || row.month || null,
    period_end: row.period_end || null,
    notes: row.notes || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('margin_ad_spend')
    .upsert(payload, { onConflict: 'month,platform' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertAdSpendRows(rows) {
  const results = [];
  for (const row of rows || []) {
    results.push(await upsertAdSpendRow(row));
  }
  return results;
}

export async function deleteAdSpendRow(id) {
  const { error } = await supabase.from('margin_ad_spend').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchCacEntryCache() {
  const { data, error } = await supabase
    .from('margin_cac_entry_cache')
    .select('*')
    .order('month', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertCacEntryCacheRows(rows) {
  if (!rows?.length) return [];
  const payload = rows.map((r) => ({
    month: r.month,
    clients_won: Number(r.clients_won) || 0,
    hubspot_clients_won:
      r.hubspot_clients_won == null ? null : Number(r.hubspot_clients_won),
    spend_total: r.spend_total == null ? null : Number(r.spend_total),
    cac_per_client: r.cac_per_client == null ? null : Number(r.cac_per_client),
    entry_date_source: r.entry_date_source || 'contact.createdate',
    fetched_at: r.fetched_at || new Date().toISOString(),
    notes: r.notes || null,
  }));
  const { data, error } = await supabase
    .from('margin_cac_entry_cache')
    .upsert(payload, { onConflict: 'month' })
    .select();
  if (error) throw error;
  return data || [];
}

/** Load project fields needed to resolve CAC entry month. */
export async function fetchProjectCacContext({ projectId, companycamProjectId }) {
  let query = supabase
    .from('projects')
    .select(
      'id, created_at, hubspot_contact_id, hubspot_deal_id, hubspot_deal_closedate, google_calendar_start, companycam_project_id'
    );
  if (projectId) query = query.eq('id', projectId);
  else if (companycamProjectId) {
    query = query.eq('companycam_project_id', String(companycamProjectId));
  } else {
    return null;
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
