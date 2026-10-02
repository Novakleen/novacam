import { supabase } from '@/lib/customSupabaseClient';
import { normalizeSimForm, simulationSnapshot } from './simulator';

const LIST_FIELDS =
  'id, name, hubspot_contact_id, hubspot_contact_name, hubspot_deal_id, hubspot_quote_id, project_id, ca_ht, mb, ma, mb_pct, ma_pct, created_at, updated_at, created_by';

function sanitizeSearch(query) {
  return String(query || '')
    .trim()
    .replace(/[%_,()*"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

/**
 * Shared team history (Admin + Manager). Optional filter on name or HubSpot contact.
 */
export async function listMarginSimulations({ query = '' } = {}) {
  let req = supabase
    .from('margin_simulations')
    .select(LIST_FIELDS)
    .order('updated_at', { ascending: false })
    .limit(50);
  const q = sanitizeSearch(query);
  if (q) {
    const pattern = `%${q}%`;
    req = req.or(
      `name.ilike."${pattern}",hubspot_contact_name.ilike."${pattern}",hubspot_contact_id.ilike."${pattern}"`
    );
  }
  const { data, error } = await req;
  if (error) throw error;
  return data || [];
}

export async function fetchMarginSimulation(id) {
  const { data, error } = await supabase
    .from('margin_simulations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, inputs: normalizeSimForm(data.inputs) };
}

function rowFromForm(form, calc, extra) {
  const snapshot = simulationSnapshot(calc, extra);
  const projectId = form.projectId && String(form.projectId).trim() ? String(form.projectId) : null;
  return {
    name: String(form.name || '').trim() || null,
    hubspot_contact_id: form.hubspotContactId ? String(form.hubspotContactId) : null,
    hubspot_contact_name: form.hubspotContactName ? String(form.hubspotContactName) : null,
    hubspot_deal_id: form.hubspotDealId ? String(form.hubspotDealId) : null,
    hubspot_quote_id: form.hubspotQuoteId ? String(form.hubspotQuoteId) : null,
    project_id: projectId,
    inputs: normalizeSimForm(form),
    result: snapshot,
    ca_ht: snapshot.caHt,
    mb: snapshot.mb,
    ma: snapshot.ma,
    mb_pct: snapshot.mbPct,
    ma_pct: snapshot.maPct,
  };
}

/** Insert a simulation. created_by is stamped by the database. */
export async function createMarginSimulation(form, calc, extra) {
  const { data, error } = await supabase
    .from('margin_simulations')
    .insert(rowFromForm(form, calc, extra))
    .select(LIST_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

/** Update the open simulation with the current inputs and a fresh result snapshot. */
export async function updateMarginSimulation(id, form, calc, extra) {
  const { data, error } = await supabase
    .from('margin_simulations')
    .update(rowFromForm(form, calc, extra))
    .eq('id', id)
    .select(LIST_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMarginSimulation(id) {
  const { error } = await supabase.from('margin_simulations').delete().eq('id', id);
  if (error) throw error;
}
