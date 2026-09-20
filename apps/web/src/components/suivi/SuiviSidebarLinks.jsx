import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Droplets, Wallet, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/customSupabaseClient';
import { formatHoursDecimal, sumHours } from '@/lib/timeTracking';
import { formatMoney } from '@/lib/margin/format';
import { fetchHubSpotContactLatestDealSurface } from '@/lib/hubspotService';

function applyProjectFilter(query, projectId, companycamProjectId) {
  if (projectId && companycamProjectId) {
    return query.or(
      `project_id.eq.${projectId},companycam_project_id.eq.${companycamProjectId}`
    );
  }
  if (companycamProjectId) {
    return query.eq('companycam_project_id', companycamProjectId);
  }
  return query.eq('project_id', projectId);
}

const ROW_BTN =
  'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group';

const SuiviSidebarLinks = ({ projectId, companycamProjectId, hubspotContactId = null, onOpenSuivi }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [timeEntries, setTimeEntries] = useState([]);
  const [sprayEntries, setSprayEntries] = useState([]);
  const [expenseEntries, setExpenseEntries] = useState([]);
  const [hsSurfaceM2, setHsSurfaceM2] = useState(null);
  const [hsSurfaceLoading, setHsSurfaceLoading] = useState(false);

  const fetchSummaries = useCallback(async () => {
    if (!projectId && !companycamProjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const timeQuery = applyProjectFilter(
        supabase.from('time_entries').select('start_time, end_time, break_minutes'),
        projectId,
        companycamProjectId
      );
      const sprayQuery = applyProjectFilter(
        supabase
          .from('spray_entries')
          .select('product_quantity, surface_m2, spray_hours'),
        projectId,
        companycamProjectId
      );
      const expenseQuery = applyProjectFilter(
        supabase.from('project_expenses').select('amount_ht'),
        projectId,
        companycamProjectId
      );

      const [timeRes, sprayRes, expenseRes] = await Promise.all([
        timeQuery,
        sprayQuery,
        expenseQuery,
      ]);

      if (timeRes.error || sprayRes.error || expenseRes.error) {
        console.error(
          timeRes.error || sprayRes.error || expenseRes.error
        );
        setError(true);
        setTimeEntries([]);
        setSprayEntries([]);
        setExpenseEntries([]);
        return;
      }

      setTimeEntries(timeRes.data || []);
      setSprayEntries(sprayRes.data || []);
      setExpenseEntries(expenseRes.data || []);
    } catch (err) {
      console.error(err);
      setError(true);
      setTimeEntries([]);
      setSprayEntries([]);
      setExpenseEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, companycamProjectId]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  useEffect(() => {
    let cancelled = false;
    if (!hubspotContactId) {
      setHsSurfaceM2(null);
      setHsSurfaceLoading(false);
      return undefined;
    }
    setHsSurfaceLoading(true);
    (async () => {
      try {
        const res = await fetchHubSpotContactLatestDealSurface(hubspotContactId);
        if (!cancelled) setHsSurfaceM2(res?.surfaceM2 ?? null);
      } catch (err) {
        console.warn('[Suivi] HubSpot surface fetch failed:', err?.message || err);
        if (!cancelled) setHsSurfaceM2(null);
      } finally {
        if (!cancelled) setHsSurfaceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hubspotContactId]);

  const hoursTotal = useMemo(() => sumHours(timeEntries), [timeEntries]);

  const sprayTotals = useMemo(() => {
    let qty = 0;
    let surface = 0;
    let hours = 0;
    sprayEntries.forEach((e) => {
      qty += Number(e.product_quantity) || 0;
      surface += Number(e.surface_m2) || 0;
      hours += Number(e.spray_hours) || 0;
    });
    return { qty, surface, hours };
  }, [sprayEntries]);

  const expenseTotalHt = useMemo(
    () => expenseEntries.reduce((sum, e) => sum + (Number(e.amount_ht) || 0), 0),
    [expenseEntries]
  );

  const metricOrFallback = (value) => {
    if (loading) return t('suivi.loadingSummary');
    if (error) return t('suivi.emptySummary');
    return value;
  };

  const hoursMetric = metricOrFallback(`${formatHoursDecimal(hoursTotal)} h`);
  const hoursSubtitle =
    !loading && !error && timeEntries.length > 0
      ? t('common.entries', { count: timeEntries.length })
      : error
        ? t('suivi.emptySummary')
        : '';

  const sprayMetric = metricOrFallback(
    `${sprayTotals.qty.toLocaleString('fr-BE')} qté · ${sprayTotals.surface.toLocaleString('fr-BE')} m² · ${sprayTotals.hours.toFixed(1)} h`
  );

  const expenseMetric = metricOrFallback(formatMoney(expenseTotalHt));

  return (
    <div className="space-y-0.5">
      <button type="button" onClick={onOpenSuivi} className={ROW_BTN}>
        <span className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 shrink-0">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 truncate">
              {t('suivi.hoursWorked')}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums shrink-0">
              {hoursMetric}
            </p>
          </div>
          {hoursSubtitle ? (
            <p className="text-xs text-gray-400">{hoursSubtitle}</p>
          ) : null}
        </div>
      </button>

      <button type="button" onClick={onOpenSuivi} className={ROW_BTN}>
        <span className="h-8 w-8 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-sky-600 shrink-0">
          <Droplets className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600">
            {t('suivi.sprays')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
            {sprayMetric}
          </p>
        </div>
      </button>

      <button type="button" onClick={onOpenSuivi} className={ROW_BTN}>
        <span className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 shrink-0">
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 truncate">
              {t('suivi.otherExpenses')}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums shrink-0">
              {expenseMetric}
            </p>
          </div>
        </div>
      </button>

      <div className={ROW_BTN.replace('hover:bg-gray-50 dark:hover:bg-gray-800/60', '') + ' cursor-default'}>
        <span className="h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center text-violet-600 shrink-0">
          <Ruler className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {t('suivi.totalSurface')}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums shrink-0">
              {hsSurfaceLoading
                ? t('suivi.loadingSummary')
                : hsSurfaceM2 != null
                  ? `${Number(hsSurfaceM2).toLocaleString('fr-BE')} m²`
                  : t('suivi.emptySummary')}
            </p>
          </div>
          <p className="text-xs text-gray-400">{t('suivi.totalSurfaceHint')}</p>
        </div>
      </div>
    </div>
  );
};

export default SuiviSidebarLinks;
