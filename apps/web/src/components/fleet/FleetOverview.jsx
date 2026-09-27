import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, HelpCircle, Plus, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { firstName, initialsOf, productName } from '@/lib/fleet/api';
import { Avatarish, CondPill, MiniGauge, NAVY, VanPictogram, YELLOW } from './FleetUI';
import VanSvg from './VanSvg';
import { buildPlanZones } from './VanPlan';
import VanEditDialog from './VanEditDialog';

const MAX_GAUGES = 4;

function sinceLabel(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'en' ? 'en-GB' : 'fr-BE', {
    day: 'numeric',
    month: 'short',
  });
}

const FleetOverview = ({ data, index, isAdmin, unknownVanCount, onOpenVan, onOpenDepot, onOpenTodo, onReload }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const vans = data.vans.filter((v) => isAdmin || index.locationByVan.get(v.id));

  const vanCards = vans.map((van) => {
    const loc = index.locationByVan.get(van.id);
    const alerts = loc ? index.locationAlerts(loc) : 0;
    const counts = loc ? index.conditionCountsForLocation(loc.id) : { broken: 0, damaged_usable: 0, missing: 0 };
    const issues = { ...counts, total: counts.broken + counts.damaged_usable + counts.missing };
    return { van, loc, alerts, issues };
  });
  const depotAlerts = index.depot ? index.locationAlerts(index.depot) : 0;
  const totalStockAlerts = vanCards.reduce((s, c) => s + c.alerts, 0) + depotAlerts;
  const openTickets = index.tree.openTickets.length;
  const openRed = index.tree.openTickets.filter((tk) => tk.severity === 'broken').length;

  const shown =
    filter === 'alerts'
      ? vanCards.filter((c) => c.alerts > 0 || c.issues.total > 0)
      : vanCards;
  const showDepot = index.depot && (filter === 'all' || depotAlerts > 0 || unknownVanCount > 0);

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Counter
          value={totalStockAlerts}
          label={t('fleet.banner.stockAlerts', { count: totalStockAlerts })}
          icon={AlertTriangle}
          tone={totalStockAlerts ? 'red' : 'green'}
        />
        <Counter
          value={openTickets}
          label={t('fleet.banner.todo', { count: openTickets })}
          icon={Wrench}
          tone={openRed ? 'red' : openTickets ? 'amber' : 'green'}
          onClick={onOpenTodo}
        />
        <Counter
          value={unknownVanCount}
          label={t('fleet.banner.unknownVan', { count: unknownVanCount })}
          icon={HelpCircle}
          tone={unknownVanCount ? 'amber' : 'green'}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1">
          {['all', 'alerts'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-4 h-9 text-sm font-semibold',
                filter === f ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white' : 'text-gray-500'
              )}
            >
              {f === 'all' ? t('fleet.filter.all') : t('fleet.filter.alerts')}
            </button>
          ))}
        </div>
        {isAdmin && (
          <Button className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('fleet.van.add')}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ van, loc, alerts, issues }) => {
          const current = index.currentAssignment.get(van.id);
          const driver = current ? index.profileById.get(current.user_id) : null;
          const root = loc ? index.tree.byId.get(loc.id) : null;
          const miniZones = root ? buildPlanZones(root, index.tree, lang, null, { withBlocks: false }) : [];
          return (
            <button
              key={van.id}
              type="button"
              onClick={() => onOpenVan(van.id)}
              className={cn(
                'text-left rounded-3xl bg-white dark:bg-gray-900 border p-4 shadow-sm hover:shadow-md transition-shadow space-y-4',
                alerts || issues.broken ? 'border-red-200 dark:border-red-900' : 'border-gray-100 dark:border-gray-800',
                van.active === false && 'opacity-60'
              )}
            >
              <div className="flex items-center gap-3">
                <VanSvg zones={miniZones} mini title={van.name} className="h-24 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black truncate">{van.name}</p>
                  <p className="text-xs text-gray-500 truncate">{van.plate || t('fleet.van.noPlate')}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </div>
              <div className="flex items-center gap-2 min-h-8">
                {driver ? (
                  <>
                    <Avatarish initials={initialsOf(driver)} />
                    <span className="text-sm">
                      <span className="font-semibold">{firstName(driver)}</span>
                      <span className="text-gray-500"> · {t('fleet.since', { date: sinceLabel(current.start_at, lang) })}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400">{t('fleet.noDriver')}</span>
                )}
              </div>
              {loc && index.presentProducts(loc).length > 0 && (
                <div className="space-y-2.5">
                  {index.presentProducts(loc).slice(0, MAX_GAUGES).map((p) => (
                    <MiniGauge key={p.slug} label={productName(p, lang)} color={p.color} stock={index.stockFor(loc, p)} />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <ConditionChips counts={issues} t={t} />
                {alerts > 0 && (
                  <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-1 text-xs font-bold">
                    {t('fleet.stockAlertChip', { count: alerts })}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {showDepot && (
          <button
            type="button"
            onClick={onOpenDepot}
            className={cn(
              'text-left rounded-3xl border-2 border-dashed p-4 space-y-4 bg-gray-50 dark:bg-gray-900/60',
              depotAlerts ? 'border-red-200 dark:border-red-900' : 'border-gray-200 dark:border-gray-700'
            )}
          >
            <div className="flex items-center gap-3">
              <VanPictogram depot />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black">{t('fleet.depot')}</p>
                <p className="text-xs text-gray-500">{t('fleet.depotSubtitle')}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </div>
            {index.presentProducts(index.depot).length > 0 && (
              <div className="space-y-2.5">
                {index.presentProducts(index.depot).slice(0, MAX_GAUGES).map((p) => (
                  <MiniGauge key={p.slug} label={productName(p, lang)} color={p.color} stock={index.stockFor(index.depot, p)} />
                ))}
              </div>
            )}
            {depotAlerts > 0 && (
              <span className="inline-block rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-1 text-xs font-bold">
                {t('fleet.stockAlertChip', { count: depotAlerts })}
              </span>
            )}
          </button>
        )}
      </div>

      {shown.length === 0 && !showDepot && (
        <p className="text-center text-sm text-gray-500 py-10">{t('fleet.filter.noAlerts')}</p>
      )}

      <VanEditDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        van={null}
        nextSort={(data.vans.reduce((m, v) => Math.max(m, v.sort || 0), 0) || 0) + 10}
        onDone={onReload}
      />
    </div>
  );
};

const TONES = {
  red: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900',
  amber: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
};

const Counter = ({ value, label, icon: Icon, tone, onClick }) => (
  <div
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    className={cn('rounded-3xl border p-3 sm:p-4', onClick && 'cursor-pointer', TONES[tone])}
  >
    <div className="flex items-center justify-between">
      <span className="text-3xl sm:text-4xl font-black tabular-nums leading-none">{value}</span>
      <Icon className="h-5 w-5 opacity-70" />
    </div>
    <p className="mt-1 text-[11px] sm:text-xs font-semibold leading-tight">{label}</p>
  </div>
);

/** « 1 jaune, 1 rouge » style chips; green « Tout OK » when nothing is reported. */
export const ConditionChips = ({ counts, t }) =>
  counts.total === 0 ? (
    <CondPill condition="ok" label={t('fleet.allOk')} />
  ) : (
    <>
      {['broken', 'damaged_usable', 'missing'].map((c) =>
        counts[c] > 0 ? <CondPill key={c} condition={c} label={t(`fleet.condCount.${c}`, { count: counts[c] })} /> : null
      )}
    </>
  );

export default FleetOverview;
