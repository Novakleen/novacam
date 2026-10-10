import { supabase } from '@/lib/customSupabaseClient';
import { uploadStorageObject } from '@/lib/mediaStorage';

export const WORDMARK_SRC = '/brand/novakleen-wordmark.svg';

export async function fetchCompanyLogoUrl() {
  try {
    const { data, error } = await supabase
      .from('company_branding')
      .select('logo_url')
      .eq('id', 'default')
      .maybeSingle();
    if (error || !data?.logo_url) return WORDMARK_SRC;
    return data.logo_url;
  } catch {
    return WORDMARK_SRC;
  }
}

export async function saveCompanyLogo(file, userId) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg');
  const path = `branding/logo-${Date.now()}.${ext}`;
  const logoUrl = await uploadStorageObject(path, file, file.type || 'image/png');
  const { data, error } = await supabase
    .from('company_branding')
    .upsert({
      id: 'default',
      logo_url: logoUrl,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    })
    .select('logo_url')
    .single();
  if (error) throw error;
  return data.logo_url;
}

export async function clearCompanyLogo(userId) {
  const { error } = await supabase
    .from('company_branding')
    .upsert({
      id: 'default',
      logo_url: null,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    });
  if (error) throw error;
}
