import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { WORDMARK_SRC, clearCompanyLogo, fetchCompanyLogoUrl, saveCompanyLogo } from '@/lib/companyBranding';

const CompanyLogoSetting = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState(WORDMARK_SRC);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyLogoUrl().then((url) => {
      if (cancelled) return;
      setLogoUrl(url);
      setCustom(url !== WORDMARK_SRC);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await saveCompanyLogo(file, user?.id);
      setLogoUrl(url);
      setCustom(true);
      toast({ title: t('common.success'), description: t('media.branding.saved') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.branding.failed') });
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    try {
      await clearCompanyLogo(user?.id);
      setLogoUrl(WORDMARK_SRC);
      setCustom(false);
      toast({ title: t('common.success'), description: t('media.branding.saved') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.branding.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('media.branding.title')}</h2>
      <p className="mt-1 text-sm text-gray-500">{t('media.branding.hint')}</p>
      <div className="mt-4 flex items-center gap-4">
        <img src={logoUrl} alt="" className="h-16 w-16 rounded-xl bg-black object-contain" />
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-md bg-[#facc15] px-4 text-sm font-semibold text-black">
            {t('media.branding.upload')}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onFile} disabled={busy} />
          </label>
          {custom && (
            <Button variant="outline" className="h-11" onClick={onClear} disabled={busy}>
              {t('media.branding.remove')}
            </Button>
          )}
        </div>
      </div>
      {!custom && <p className="mt-2 text-xs text-gray-400">{t('media.branding.fallback')}</p>}
    </section>
  );
};

export default CompanyLogoSetting;
