import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  Briefcase,
  Car,
  Circle,
  Fuel,
  Home,
  Landmark,
  Laptop,
  Megaphone,
  Package,
  Receipt,
  Shield,
  Smartphone,
  Users,
  Wrench,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { CashBars, CashLine } from '@/components/treso/CashflowChart';
import TresoSubnav from '@/components/treso/TresoSubnav';
import { buildCashflow } from '@/lib/treso/cashflow';
import { loadForecastInput } from '@/lib/treso/forecast';
import { formatDay, formatDayLong, formatEuro } from '@/lib/treso/screen';

const ICONS = {
  fuel: Fuel,
  insurance: Shield,
  leasing: Car,
  software: Laptop,
  telecom: Smartphone,
  salary: Users,
  rent: Home,
  tax: Receipt,
  fees: Briefcase,
  loan: Banknote,
  ads: Megaphone,
  materials: Package,
  subcontract: Wrench,
  bank: Landmark,
  other: Circle,
};

const BUCKETS = [
  { key: 'notDue', label: 'bucketNotDue', bar: 'bg-neutral-200' },
  { key: 'd0_30', label: 'bucket030', bar: 'bg-[#facc15]' },
  { key: 'd31_60', label: 'bucket3160', bar: 'bg-neutral-700' },
  { key: 'd60', label: 'bucket60', bar: 'bg-neutral-950' },
];

const FREQ = {
  weekly: 'freqWeekly',
  monthly: 'freqMonthly',
  quarterly: 'freqQuarterly',
  yearly: 'freqYearly',
};

const SHORT_MONTHS = {
  fr: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

function monthLabel(bucket, language) {
  const names = SHORT_MONTHS[String(language || 'fr').slice(0, 2)] || SHORT_MONTHS.fr;
  return names[(bucket.month || 1) - 1];
}

const TresoDashboardPage = ({ preview = null }) => {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState(preview?.input ?? null);
  const [loading, setLoading] = useState(!preview);
  const [failed, setFailed] = useState(false);
  const [grain, setGrain] = useState('month');

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    loadForecastInput()
      .then((next) => {
        if (!cancelled) setInput(next);
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

  const view = useMemo(() => (input ? buildCashflow(input) : null), [input]);
  const language = i18n.resolvedLanguage || i18n.language;
  const money = (value) => formatEuro(value, language);

  const historyRows = (view?.history[grain] || []).map((bucket) => ({
    ...bucket,
    label: grain === 'month' ? monthLabel(bucket, language) : formatDay(bucket.start),
  }));
  const projectionRows = (view?.projection || []).map((week) => ({
    ...week,
    label: formatDay(week.start),
  }));
  const maxBucket = Math.max(1, ...BUCKETS.map((bucket) => view?.aging.buckets[bucket.key] || 0));

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.screenTitle')} - Novakleen</title>
      </Helmet>
      <div className="min-w-0 space-y-10" data-testid="treso-dashboard">
        <header className="space-y-4">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
              {t('treso.screenTitle')}
            </h1>
            {view && (
              <div data-testid="treso-cash" className="mt-3">
                <div className="text-5xl font-semibold tabular-nums tracking-tight text-neutral-950 dark:text-white sm:text-6xl">
                  {money(view.cash.amount)}
                </div>
                <div className="mt-2 text-sm text-neutral-500">
                  {[view.cash.accountName, t('treso.cashAsOf', { date: formatDayLong(view.cash.date) })]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            )}
          </div>
          <TresoSubnav active="board" secondary />
        </header>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-neutral-900" />
          </div>
        )}

        {failed && (
          <div className="rounded-3xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{t('treso.loadFailed')}</div>
        )}

        {view && (
          <>
            <section className="space-y-4" data-testid="treso-history" aria-label={t('treso.historyTitle')}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">{t('treso.historyTitle')}</h2>
                  <div className="text-sm text-neutral-500">{t('treso.historyHint')}</div>
                </div>
                <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-neutral-800" role="group" aria-label={t('treso.historyTitle')}>
                  {['week', 'month'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={grain === key}
                      onClick={() => setGrain(key)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                        grain === key
                          ? 'bg-neutral-950 text-[#facc15]'
                          : 'text-neutral-500'
                      }`}
                    >
                      {t(key === 'week' ? 'treso.grainWeek' : 'treso.grainMonth')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
                <div className={grain === 'week' ? 'min-w-[640px]' : 'min-w-0'}>
                  <CashBars
                    rows={historyRows}
                    language={language}
                    labels={{
                      in: t('treso.legendIn'),
                      out: t('treso.legendOut'),
                      balance: t('treso.legendBalance'),
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4" data-testid="treso-projection" aria-label={t('treso.projectionTitle')}>
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">{t('treso.projectionTitle')}</h2>
                <div className="text-sm text-neutral-500">{t('treso.projectionHint')}</div>
              </div>
              <div className="rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
                <CashLine rows={projectionRows} language={language} />
              </div>
            </section>

            <section className="space-y-4" data-testid="treso-aging" aria-label={t('treso.agingTitle')}>
              <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">{t('treso.agingTitle')}</h2>
              {view.aging.total === 0 ? (
                <div className="text-sm text-neutral-500">{t('treso.agingEmpty')}</div>
              ) : (
                <div className="space-y-6 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {BUCKETS.map((bucket) => {
                      const amount = view.aging.buckets[bucket.key];
                      const height = Math.max(8, Math.round((amount / maxBucket) * 72));
                      return (
                        <div key={bucket.key}>
                          <div className="flex h-20 items-end">
                            <div className={`w-full rounded-t-xl ${bucket.bar}`} style={{ height }} />
                          </div>
                          <div className="mt-2 text-base font-semibold tabular-nums text-neutral-950 dark:text-white">{money(amount)}</div>
                          <div className="text-xs text-neutral-500">{t(`treso.${bucket.label}`)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {view.aging.list.map((row) => (
                      <li key={row.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-neutral-950 dark:text-white">{row.client}</div>
                          <div className="text-sm text-neutral-500">
                            {[row.number, row.late ? t('treso.lateDays', { count: row.days }) : t('treso.notLate')].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="shrink-0 font-medium tabular-nums text-neutral-950 dark:text-white">{money(row.amount)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="space-y-4" data-testid="treso-suppliers" aria-label={t('treso.suppliersTitle')}>
              <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">{t('treso.suppliersTitle')}</h2>
              {view.suppliers.length === 0 ? (
                <div className="text-sm text-neutral-500">{t('treso.suppliersEmpty')}</div>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-3xl border border-neutral-200 bg-white px-4 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
                  {view.suppliers.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-950 dark:text-white">{row.name}</div>
                        <div className="text-sm text-neutral-500">
                          {row.unknown ? t('treso.dueUnknown') : formatDayLong(row.dueDate)}
                        </div>
                      </div>
                      <div className="shrink-0 font-medium tabular-nums text-neutral-950 dark:text-white">{money(row.amount)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-4" data-testid="treso-recurring" aria-label={t('treso.recurringTitle')}>
              <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">{t('treso.recurringTitle')}</h2>
              {view.recurring.length === 0 ? (
                <div className="text-sm text-neutral-500">{t('treso.recurringEmpty')}</div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {view.recurring.map((row) => {
                    const Icon = ICONS[row.icon] || Circle;
                    return (
                      <li key={row.id} className="flex items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-[#facc15]">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate font-medium text-neutral-950 dark:text-white">{row.name}</div>
                            <div className="shrink-0 font-semibold tabular-nums text-neutral-950 dark:text-white">{money(row.amount)}</div>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                            <span>{t(`treso.${FREQ[row.frequency]}`)}</span>
                            {row.nextDate && <span>· {formatDayLong(row.nextDate)}</span>}
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              row.active
                                ? 'bg-[#facc15] text-neutral-950'
                                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
                            }`}
                            >
                              {row.active ? t('treso.badgeActive') : t('treso.badgeInactive')}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TresoDashboardPage;
