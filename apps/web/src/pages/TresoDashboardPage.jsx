import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, Landmark } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TresoChart from '@/components/treso/TresoChart';
import TresoSubnav from '@/components/treso/TresoSubnav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { formatBrusselsDateTime, loadForecastInput, presentLastImport } from '@/lib/treso/forecast';
import { loadLastImportSummary } from '@/lib/treso/import';
import { insertCashEvent } from '@/lib/treso/mutations';
import {
  MOVEMENT_PREVIEW_LIMIT,
  autonomyTone,
  buildScreen,
  chartRows,
  formatDay,
  formatEuro,
  formatSignedEuro,
  parseAmount,
} from '@/lib/treso/screen';

function shortImportWhen(iso) {
  const full = formatBrusselsDateTime(iso);
  const match = full.match(/^(\d{2}\/\d{2})\/\d{4}\s+(.+)$/);
  return match ? `${match[1]} ${match[2]}` : full;
}

const ALERT_CLASS = {
  red: 'border-red-200 bg-red-50 text-red-800',
  orange: 'border-orange-200 bg-orange-50 text-orange-900',
  grey: 'border-gray-200 bg-gray-100 text-gray-600',
};

const TONE_CLASS = {
  red: 'text-red-600',
  orange: 'text-orange-600',
  ok: 'text-gray-900 dark:text-white',
};

function MoneyLine({ before, after, language, className }) {
  if (after == null) {
    return <span className={className}>{formatEuro(before, language)}</span>;
  }
  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 ${className || ''}`}>
      <span>{formatEuro(before, language)}</span>
      <span>→ {formatEuro(after, language)}</span>
    </span>
  );
}

const TresoDashboardPage = ({ preview = null, initialWhatIf = null }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const mountRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const [input, setInput] = useState(preview?.input ?? null);
  const [summary, setSummary] = useState(() => (preview?.lastImport ? presentLastImport(preview.lastImport) : null));
  const [loading, setLoading] = useState(!preview);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState(initialWhatIf || { amount: '', date: '', label: '' });
  const [applied, setApplied] = useState(initialWhatIf);
  const [dbWrites, setDbWrites] = useState(0);
  const [paintMs, setPaintMs] = useState(null);
  const [showOverdue, setShowOverdue] = useState(false);
  const [expandOut, setExpandOut] = useState(false);
  const [expandIn, setExpandIn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    Promise.all([loadForecastInput(), loadLastImportSummary()])
      .then(([nextInput, nextSummary]) => {
        if (cancelled) return;
        setInput(nextInput);
        setSummary(nextSummary);
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

  const view = useMemo(() => (input ? buildScreen(input, applied) : null), [input, applied]);

  useEffect(() => {
    if (!view) return undefined;
    setPaintMs(Math.round(performance.now() - mountRef.current));
    return undefined;
  }, [view]);

  const language = i18n.resolvedLanguage || i18n.language;
  const money = (value) => formatEuro(value, language);

  const simulate = (event) => {
    event.preventDefault();
    const amount = parseAmount(draft.amount);
    if (amount == null || amount <= 0 || !draft.date) {
      toast({ variant: 'destructive', title: t('treso.whatIfInvalid') });
      return;
    }
    setApplied({ amount: draft.amount, date: draft.date, label: draft.label });
  };

  const clearSimulation = () => {
    setApplied(null);
    setDraft({ amount: '', date: '', label: '' });
  };

  const addPlanned = async () => {
    const amount = parseAmount(applied?.amount);
    if (!applied || amount == null || amount <= 0) return;
    const row = {
      event_date: applied.date,
      label: applied.label?.trim() || t('treso.plannedLabel'),
      amount: Math.abs(amount),
      direction: 'out',
      category: 'autre',
    };
    setSaving(true);
    try {
      if (preview) {
        toast({ title: t('treso.previewOnly') });
      } else {
        await insertCashEvent(row);
        setDbWrites((count) => count + 1);
        setInput(await loadForecastInput());
        toast({ title: t('treso.plannedAdded') });
      }
      clearSimulation();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const kpis = view?.base.kpis;
  const alert = view?.alert;
  const effect = view?.effect;
  const autonomyWeeks = effect ? effect.autonomyAfter : kpis?.autonomy_weeks;
  const tone = autonomyTone(autonomyWeeks);
  const alertText = !alert?.alert_level ? null : alert.alert_level === 'red'
    ? t('treso.alertRed', { amount: money(alert.alert_threshold), date: formatDay(alert.alert_week) })
    : alert.alert_level === 'orange'
      ? t('treso.alertOrange', { date: formatDay(alert.alert_week) })
      : t('treso.alertGrey', { date: formatDay(alert.data_as_of || alert.balance_date) });

  const outflows = view?.lists.outflows || [];
  const inflows = view?.lists.inflows || [];
  const visibleOut = expandOut ? outflows : outflows.slice(0, MOVEMENT_PREVIEW_LIMIT);
  const visibleIn = expandIn ? inflows : inflows.slice(0, MOVEMENT_PREVIEW_LIMIT);

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.screenTitle')} - Novakleen</title>
      </Helmet>
      <div
        className="min-w-0 space-y-4"
        data-testid="treso-dashboard"
        data-alert={alert?.alert_level || 'none'}
        data-compute-ms={view?.computeMs ?? ''}
        data-paint-ms={paintMs ?? ''}
        data-db-writes={dbWrites}
        data-cash-count={input?.cashEvents?.length ?? 0}
        data-what-if={view?.simulated ? 'on' : 'off'}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
              <Landmark className="h-7 w-7 shrink-0 text-primary" />
              {t('treso.screenTitle')}
            </h1>
            {kpis && (
              <p className="mt-1 text-sm text-gray-500 break-words">
                {t('treso.dataLine', { date: formatDay(kpis.balance_date) })}
                {summary?.importedAt ? ` · ${t('treso.importLine', { when: shortImportWhen(summary.importedAt) })}` : ''}
              </p>
            )}
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/tresorerie/import">{t('treso.importer')}</Link>
          </Button>
        </div>

        <TresoSubnav active="board" />

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}

        {failed && (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{t('treso.loadFailed')}</p>
        )}

        {alertText && (
          <div role="status" data-testid="treso-alert" className={`flex gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${ALERT_CLASS[alert.alert_level]}`}>
            {alert.alert_level === 'grey'
              ? <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
            <p className="min-w-0 break-words">{alertText}</p>
          </div>
        )}

        {view && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className={`rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${kpis.data_stale ? 'text-gray-400' : ''}`}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('treso.kpiBalance')}</h2>
                <p className={`mt-2 text-2xl font-semibold tabular-nums leading-tight ${kpis.data_stale ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                  {money(kpis.balance_today)}
                  {kpis.is_estimated && (
                    <span className="ml-2 align-middle rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{t('treso.estimated')}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-gray-500 break-words">
                  {[view.accountName, formatDay(kpis.balance_date)].filter(Boolean).join(' · ')}
                </p>
              </article>

              <article className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('treso.kpiLow')}</h2>
                <p className="mt-2 text-2xl font-semibold tabular-nums leading-tight text-gray-900 dark:text-white">
                  <MoneyLine
                    before={effect ? effect.lowBefore : kpis.low_point_probable}
                    after={effect ? effect.lowAfter : null}
                    language={language}
                  />
                </p>
                <p className="mt-1 text-sm text-gray-500 break-words">{t('treso.weekOf', { date: formatDay(effect ? view.simulated.kpis.low_point_week : kpis.low_point_week) })}</p>
                <p className="text-xs text-gray-400 break-words">
                  {t('treso.sureLow', {
                    amount: effect
                      ? `${money(effect.sureBefore)} → ${money(effect.sureAfter)}`
                      : money(kpis.low_point_sure),
                  })}
                </p>
              </article>

              <article className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('treso.kpiAutonomy')}</h2>
                <p className={`mt-2 text-2xl font-semibold tabular-nums leading-tight ${TONE_CLASS[tone]}`}>
                  {effect ? (
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span>{t('treso.autonomy', { count: effect.autonomyBefore })}</span>
                      <span>→ {t('treso.autonomy', { count: effect.autonomyAfter })}</span>
                    </span>
                  ) : t('treso.autonomy', { count: kpis.autonomy_weeks })}
                </p>
                <p className="mt-1 text-sm text-gray-500">{t('treso.noNewRevenue')}</p>
              </article>

              <button
                type="button"
                className="rounded-2xl border border-gray-100 bg-white p-4 text-left dark:border-gray-800 dark:bg-gray-900"
                aria-expanded={showOverdue}
                onClick={() => setShowOverdue((open) => !open)}
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('treso.kpiOverdue')}</h2>
                <p className="mt-2 text-2xl font-semibold tabular-nums leading-tight text-gray-900 underline decoration-gray-300 underline-offset-4 dark:text-white">
                  {money(kpis.overdue_amount)}
                </p>
                <p className="mt-1 text-sm text-gray-500">{t('treso.invoiceCount', { count: kpis.overdue_count })}</p>
              </button>
            </div>

            {showOverdue && (
              <section aria-label={t('treso.overdueList')} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-gray-900 dark:text-white">{t('treso.overdueList')}</h2>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowOverdue(false)}>{t('treso.closeList')}</Button>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {view.lists.overdueInvoices.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-gray-900 dark:text-white">{row.client}</p>
                        <p className="text-sm text-gray-500 break-words">
                          {row.number || '—'} · {t('treso.lateDays', { count: row.days })}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums font-medium">{money(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="mb-2 font-semibold text-gray-900 dark:text-white">{t('treso.chartTitle')}</h2>
              <TresoChart
                rows={chartRows(view.base.weeks, view.simulated?.weeks)}
                threshold={kpis.alert_threshold}
                language={language}
                showWhatIf={Boolean(view.simulated)}
              />
              <form onSubmit={simulate} className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800" data-testid="treso-whatif">
                <p className="font-medium text-gray-900 dark:text-white">{t('treso.whatIfPrompt')}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="min-w-0 space-y-1 text-sm">
                    <span className="text-gray-500">{t('treso.whatIfAmount')}</span>
                    <Input
                      inputMode="decimal"
                      value={draft.amount}
                      onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                      className="min-w-0"
                    />
                  </label>
                  <label className="min-w-0 space-y-1 text-sm">
                    <span className="text-gray-500">{t('treso.whatIfDate')}</span>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                      className="min-w-0"
                    />
                  </label>
                  <label className="min-w-0 space-y-1 text-sm">
                    <span className="text-gray-500">{t('treso.whatIfLabel')} ({t('treso.optional')})</span>
                    <Input
                      value={draft.label}
                      onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                      className="min-w-0"
                    />
                  </label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button type="submit" className="w-full sm:w-auto">{t('treso.simulate')}</Button>
                  {applied && (
                    <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={clearSimulation}>
                      {t('treso.clearSim')}
                    </Button>
                  )}
                </div>
                {view.simulated && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-300">{t('treso.notSaved')}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-auto w-full whitespace-normal py-2 sm:w-auto"
                      onClick={addPlanned}
                      disabled={saving}
                    >
                      {saving ? t('treso.saving') : t('treso.addPlanned')}
                    </Button>
                  </div>
                )}
              </form>
            </section>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <MovementList
                title={t('treso.outflowsTitle')}
                rows={visibleOut}
                hidden={outflows.length - visibleOut.length}
                expanded={expandOut}
                onToggle={() => setExpandOut((open) => !open)}
                language={language}
                empty={t('treso.emptyOut')}
                renderLabel={(row) => (row.kind === 'spread' ? t('treso.spreadCosts') : row.label)}
                badge={(row) => (row.overdue ? t('treso.dueBadge') : null)}
              />
              <MovementList
                title={t('treso.inflowsTitle')}
                rows={visibleIn}
                hidden={inflows.length - visibleIn.length}
                expanded={expandIn}
                onToggle={() => setExpandIn((open) => !open)}
                language={language}
                empty={t('treso.emptyIn')}
                renderLabel={(row) => [row.label, row.number].filter(Boolean).join(' · ')}
                badge={(row) => (row.overdue ? t('treso.overdueBadge') : null)}
                detail={(row) => (row.origin === 'chantier' ? t('treso.originJob') : t('treso.originInvoice'))}
              />
            </div>

            <p className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 break-words dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
              {t('treso.footerClients', { amount: money(view.footer.clients) })}
              {' − '}
              {t('treso.footerSuppliers', { amount: money(view.footer.suppliers) })}
              {' = '}
              <strong className="tabular-nums text-gray-900 dark:text-white">{formatSignedEuro(view.footer.net, language)}</strong>
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

function MovementList({ title, rows, hidden, expanded, onToggle, language, empty, renderLabel, badge, detail }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-2 font-semibold text-gray-900 dark:text-white break-words">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-gray-500">{empty}</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((row) => {
          const flag = badge(row);
          return (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 break-words dark:text-white">
                  <span className="tabular-nums text-gray-500">{formatDay(row.date)}</span>
                  {' '}
                  {renderLabel(row)}
                  {flag && (
                    <span className="ml-1 inline-block rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                      {flag}
                    </span>
                  )}
                </p>
                {detail && <p className="text-xs text-gray-400">{detail(row)}</p>}
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">{formatEuro(row.amount, language)}</span>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || expanded) && rows.length > 0 && (
        <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={onToggle}>
          {expanded ? t('treso.seeLess') : t('treso.seeAll')}
        </Button>
      )}
    </section>
  );
}

export default TresoDashboardPage;
