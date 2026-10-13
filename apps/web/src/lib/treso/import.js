import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/customSupabaseClient';
import { presentLastImport, todayInBrussels } from '../../../../../supabase/functions/_shared/tresoForecast.js';

async function sha256Text(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function importAccountableFile({
  file,
  balanceBelfius,
  balanceDate,
  balanceVisa,
  visaBalanceDate,
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    const error = new Error('auth');
    error.status = 401;
    throw error;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('balance_belfius', balanceBelfius);
  form.append('balance_date', balanceDate);
  if (String(balanceVisa ?? '').trim() !== '') {
    form.append('balance_visa', balanceVisa);
    form.append('visa_balance_date', visaBalanceDate || balanceDate);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/treso-import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || 'import');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function listTresoApiKeys() {
  const { data, error } = await supabase
    .from('treso_api_keys')
    .select('id, key_prefix, scope, created_at, revoked_at, last_used_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTresoApiKey(userId) {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const plaintext = `nvk_${hex}`;
  const { error } = await supabase.from('treso_api_keys').insert({
    key_hash: await sha256Text(plaintext),
    key_prefix: plaintext.slice(0, 12),
    scope: 'treso-import',
    created_by: userId,
  });
  if (error) throw error;
  return plaintext;
}

export async function revokeTresoApiKey(id) {
  const { error } = await supabase
    .from('treso_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

function pickCurrentAccount(accounts) {
  const rows = accounts || [];
  return rows.find((row) => String(row.iban || '').replace(/\s+/g, '').toUpperCase().endsWith('8482'))
    || rows.find((row) => row.is_active !== false && row.include_in_cash !== false)
    || null;
}

export async function loadLastImportSummary() {
  const { data: batch, error } = await supabase
    .from('treso_import_batches')
    .select('id, created_at, channel, rows_inserted, data_as_of')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const { data: accounts, error: accountsError } = await supabase
    .from('treso_accounts')
    .select('id, iban, kind, is_active, include_in_cash')
    .eq('kind', 'courant');
  if (accountsError) throw accountsError;
  const account = pickCurrentAccount(accounts);

  let balance = null;
  if (account?.id) {
    const { data: snap, error: snapError } = await supabase
      .from('treso_balance_snapshots')
      .select('balance, balance_date, created_at')
      .eq('account_id', account.id)
      .order('balance_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapError) throw snapError;
    balance = snap;
  }

  const { data: settings, error: settingsError } = await supabase
    .from('treso_settings')
    .select('stale_after_business_days')
    .eq('id', 1)
    .maybeSingle();
  if (settingsError) throw settingsError;

  return presentLastImport({
    batch,
    balance,
    today: todayInBrussels(),
    staleAfterBusinessDays: settings?.stale_after_business_days ?? 2,
  });
}
