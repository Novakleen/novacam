import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TresoSubnav from '@/components/treso/TresoSubnav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { saveTreasurySettings } from '@/lib/treso/mutations';
import { normalizeSeasonality, parseAmount } from '@/lib/treso/screen';
import { DEFAULT_SIGNED_STAGE_IDS, normalizeStageIds } from '../../../../supabase/functions/_shared/tresoSignedJobs.js';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const TresoParametresPage = ({ preview = null }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [settings, setSettings] = useState(preview?.settings ?? null);
  const [loading, setLoading] = useState(!preview);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    supabase
      .from('treso_settings')
      .select('alert_threshold, usual_revenue_ht_month, seasonality_coefficients, signed_deal_stage_ids')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setFailed(true);
          return;
        }
        setSettings(data || {});
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const save = async (patch) => {
    if (preview) {
      setSettings((current) => ({ ...current, ...patch }));
      toast({ title: t('treso.saved') });
      return;
    }
    await saveTreasurySettings(patch);
    setSettings((current) => ({ ...current, ...patch }));
    toast({ title: t('treso.saved') });
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.settingsTitle')} - Novakleen</title>
      </Helmet>
      <div className="min-w-0 max-w-xl space-y-4" data-testid="treso-parametres">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Landmark className="h-7 w-7 shrink-0 text-primary" />
            {t('treso.settingsTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('treso.settingsHint')}</p>
        </div>
        <TresoSubnav active="settings" />
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}
        {failed && <p className="text-sm text-red-600">{t('treso.loadFailed')}</p>}
        {settings && <SettingsForm settings={settings} onSave={save} />}
      </div>
    </DashboardLayout>
  );
};

function SettingsForm({ settings, onSave }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [threshold, setThreshold] = useState(settings.alert_threshold ?? 0);
  const [usual, setUsual] = useState(settings.usual_revenue_ht_month ?? '');
  const [coeffs, setCoeffs] = useState(() => normalizeSeasonality(settings.seasonality_coefficients).map(String));
  const [stages, setStages] = useState(() => (settings.signed_deal_stage_ids?.length
    ? settings.signed_deal_stage_ids
    : DEFAULT_SIGNED_STAGE_IDS).join(', '));
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const alertThreshold = parseAmount(threshold);
    const usualRevenue = parseAmount(usual);
    const seasonality = coeffs.map((value) => parseAmount(value));
    if (alertThreshold == null || usualRevenue == null || seasonality.some((value) => value == null)) {
      toast({ variant: 'destructive', title: t('treso.whatIfInvalid') });
      return;
    }
    setBusy(true);
    try {
      await onSave({
        alert_threshold: alertThreshold,
        usual_revenue_ht_month: usualRevenue,
        seasonality_coefficients: seasonality,
        signed_deal_stage_ids: normalizeStageIds(stages),
      });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <label className="block min-w-0 space-y-1 text-sm">
        <span className="text-gray-500">{t('treso.threshold')}</span>
        <Input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} className="min-w-0" />
      </label>
      <label className="block min-w-0 space-y-1 text-sm">
        <span className="text-gray-500">{t('treso.usualRevenue')}</span>
        <Input inputMode="decimal" value={usual} onChange={(event) => setUsual(event.target.value)} className="min-w-0" />
      </label>
      <label className="block min-w-0 space-y-1 text-sm">
        <span className="text-gray-500">{t('treso.signedStages')}</span>
        <Input value={stages} onChange={(event) => setStages(event.target.value)} className="min-w-0" />
        <span className="block text-xs text-gray-400">{t('treso.signedStagesHint')}</span>
      </label>
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium text-gray-900 dark:text-white">{t('treso.seasonality')}</legend>
        <p className="text-sm text-gray-500">{t('treso.seasonalityHint')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MONTHS.map((month, index) => (
            <label key={month} className="min-w-0 space-y-1 text-sm">
              <span className="text-gray-500">{t(`treso.month${month}`)}</span>
              <Input
                inputMode="decimal"
                value={coeffs[index]}
                onChange={(event) => {
                  const next = [...coeffs];
                  next[index] = event.target.value;
                  setCoeffs(next);
                }}
                className="min-w-0"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={busy}>{busy ? t('treso.saving') : t('treso.save')}</Button>
    </form>
  );
}

export default TresoParametresPage;
