import React from 'react';
import { cn } from '@/lib/utils';
import { maTone } from '@/lib/margin/calculateProjectMargin';
import { formatPct } from '@/lib/margin/format';

const TONE_CLASS = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  warn: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  danger: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
  empty: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

const MaPercentBadge = ({ maPct, className }) => {
  const tone = maTone(maPct);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums',
        TONE_CLASS[tone],
        className
      )}
    >
      {formatPct(maPct)}
    </span>
  );
};

export default MaPercentBadge;
