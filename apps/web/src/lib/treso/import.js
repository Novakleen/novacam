import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/customSupabaseClient';

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
