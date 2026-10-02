import React from 'react';
import { History, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney, formatPct } from '@/lib/margin/format';

const inputCls =
  'h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

function formatWhen(value, lang) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(lang || 'fr', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * Shared Admin + Manager simulation history. Opening a row loads it into the form.
 */
const SimulatorHistory = ({ t, lang = 'fr', rows = [], query, onQuery, loading, editingId, onOpen }) => {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          {t('margins.sim.historyTitle')}
        </p>
        <label className="relative block sm:w-72">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className={cn(inputCls, 'pl-8 h-9')}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('margins.sim.historySearch')}
            aria-label={t('margins.sim.historySearch')}
          />
        </label>
      </div>
      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('margins.sim.historyLoading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('margins.sim.historyEmpty')}</p>
      ) : (
        <ul className="max-h-64 overflow-auto divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => {
            const title = row.name || row.hubspot_contact_name || t('margins.sim.untitled');
            const active = editingId && row.id === editingId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className={cn(
                    'w-full text-left py-2 px-1 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/60 rounded-lg',
                    active && 'bg-primary/5'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{title}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {row.hubspot_contact_name || t('margins.sim.noContact')}
                      {row.hubspot_contact_id ? ` · ${row.hubspot_contact_id}` : ''}
                      {' · '}
                      {formatWhen(row.updated_at || row.created_at, lang)}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-bold tabular-nums">{formatPct(row.ma_pct)}</span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">{formatMoney(row.ca_ht)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SimulatorHistory;
