import { supabase } from '@/lib/customSupabaseClient';

export async function saveCommitment(id, patch) {
  const { error } = await supabase.from('treso_commitments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function insertCashEvent(row) {
  const { data, error } = await supabase
    .from('treso_cash_events')
    .insert(row)
    .select('id, event_date, label, amount, direction, category, excluded_from_cash')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCashEvent(id, patch) {
  const { error } = await supabase.from('treso_cash_events').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCashEvent(id) {
  const { error } = await supabase.from('treso_cash_events').delete().eq('id', id);
  if (error) throw error;
}

export async function saveTreasurySettings(patch) {
  const { error } = await supabase.from('treso_settings').update(patch).eq('id', 1);
  if (error) throw error;
}
