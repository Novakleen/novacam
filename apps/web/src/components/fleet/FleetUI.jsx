import React from 'react';
import { Truck, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtL, DEFAULT_PRODUCT_COLOR } from '@/lib/fleet/api';

export const NAVY = '#0b1f4d';
export const YELLOW = '#facc15';

export const STATE_STYLES = {
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  low: { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  out: { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', chip: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

/** Coloured jerrycan-style dot for a product. */
export const ProductDot = ({ color, className }) => (
  <span
    className={cn('inline-block h-3 w-3 rounded-[4px] ring-2 ring-white dark:ring-gray-900 shrink-0', className)}
    style={{ backgroundColor: color || DEFAULT_PRODUCT_COLOR }}
  />
);

/** Van pictogram placeholder (NovaKleen navy + yellow lettering). */
export const VanPictogram = ({ photoUrl, depot = false, className }) => {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={cn('h-14 w-14 rounded-2xl object-cover', className)} />;
  }
  const Icon = depot ? Warehouse : Truck;
  return (
    <div
      className={cn('h-14 w-14 rounded-2xl flex items-center justify-center shadow-inner shrink-0', className)}
      style={{ backgroundColor: NAVY }}
    >
      <Icon className="h-8 w-8" style={{ color: YELLOW }} />
    </div>
  );
};

/** Compact gauge row (cards). */
export const MiniGauge = ({ label, color, stock }) => {
  const { litres, min, state } = stock;
  const scale = Math.max(min * 2, litres, 1);
  const pct = Math.min(100, (litres / scale) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 min-w-0">
          <ProductDot color={color} className="h-2.5 w-2.5" />
          <span className="truncate text-gray-600 dark:text-gray-300">{label}</span>
        </span>
        <span className={cn('font-bold tabular-nums', STATE_STYLES[state].text)}>{fmtL(litres)} L</span>
      </div>
      <div className="relative h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', STATE_STYLES[state].bar)} style={{ width: `${pct}%` }} />
        {min > 0 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400/70" style={{ left: `${(min / scale) * 100}%` }} />
        )}
      </div>
    </div>
  );
};

/** Big gauge (van sheet): litres in 36px, threshold marker. */
export const BigGauge = ({ label, color, stock, thresholdLabel, children }) => {
  const { litres, min, state } = stock;
  const scale = Math.max(min * 2, litres, 1);
  const pct = Math.min(100, (litres / scale) * 100);
  return (
    <div className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ProductDot color={color} className="h-4 w-4" />
          <span className="font-semibold truncate">{label}</span>
        </div>
        <div className="text-right">
          <span className={cn('text-4xl font-black tabular-nums leading-none', STATE_STYLES[state].text)}>
            {fmtL(litres)}
          </span>
          <span className="ml-1 text-sm font-semibold text-gray-400">L</span>
        </div>
      </div>
      <div className="relative mt-3 h-4 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', STATE_STYLES[state].bar)} style={{ width: `${pct}%` }} />
        {min > 0 && (
          <div className="absolute top-0 bottom-0 w-1 bg-gray-500/60" style={{ left: `${(min / scale) * 100}%` }} />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
        <span>{thresholdLabel}</span>
        {children}
      </div>
    </div>
  );
};

export const Pill = ({ active, onClick, children, icon: Icon, badge }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'shrink-0 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold transition-all',
      active
        ? 'text-white shadow-md'
        : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800'
    )}
    style={active ? { backgroundColor: NAVY } : undefined}
  >
    {Icon && <Icon className="h-4 w-4" style={active ? { color: YELLOW } : undefined} />}
    {children}
    {badge ? (
      <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] leading-5 text-center">
        {badge}
      </span>
    ) : null}
  </button>
);

export const Avatarish = ({ initials, className }) => (
  <span
    className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0', className)}
    style={{ backgroundColor: YELLOW, color: NAVY }}
  >
    {initials}
  </span>
);

export const SectionCard = ({ title, icon: Icon, action, children, className }) => (
  <section className={cn('rounded-3xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-4 sm:p-5 space-y-4', className)}>
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        {Icon && (
          <span className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: NAVY }}>
            <Icon className="h-4 w-4" style={{ color: YELLOW }} />
          </span>
        )}
        {title}
      </h3>
      {action}
    </div>
    {children}
  </section>
);

export const RoundAction = ({ icon: Icon, label, onClick, variant = 'default', disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex flex-col items-center gap-1.5 disabled:opacity-40"
  >
    <span
      className={cn(
        'h-14 w-14 rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform',
        variant === 'yellow' ? '' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
      )}
      style={variant === 'yellow' ? { backgroundColor: YELLOW, color: NAVY } : undefined}
    >
      <Icon className="h-6 w-6" />
    </span>
    <span className="text-xs font-semibold text-center leading-tight max-w-[5.5rem]">{label}</span>
  </button>
);
