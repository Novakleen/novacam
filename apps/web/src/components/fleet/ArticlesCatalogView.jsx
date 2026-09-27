import React from 'react';
import { Boxes, Pencil, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVY, YELLOW } from './FleetUI';
import NodeIcon from './NodeIcon';

const KINDS = ['caisse', 'machine', 'materiel'];

/**
 * v1.10.0 presentational catalog list (no data access): used by ArticlesPanel and by
 * tools/render-catalog-preview. rows = [{ article, usage, kitName }].
 * usage = { instances, qty, byRoot: [{ id, label, qty, depot }], damaged_usable, broken, missing } | null
 */
const ArticlesCatalogView = ({ t, rows, label, query, onQuery, kind, onKind, onNew, onEdit, totals }) => (
  <div className="space-y-4">
    <div className="rounded-3xl p-5 text-white space-y-1" style={{ backgroundColor: NAVY }}>
      <h2 className="text-xl font-black flex items-center gap-2">
        <Boxes className="h-5 w-5" style={{ color: YELLOW }} />
        {t('fleet.articles.title')}
      </h2>
      <p className="text-sm text-white/80">{t('fleet.articles.intro')}</p>
      {totals && (
        <p className="text-xs font-semibold pt-1" style={{ color: YELLOW }}>
          {t('fleet.articles.totals', totals)}
        </p>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[12rem]">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="h-10 w-full rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-3 text-sm"
          placeholder={t('fleet.articles.search')}
          value={query}
          onChange={(e) => onQuery?.(e.target.value)}
        />
      </div>
      <button
        type="button"
        onClick={() => onNew?.()}
        className="h-10 rounded-full px-4 inline-flex items-center gap-1 text-sm font-bold"
        style={{ backgroundColor: YELLOW, color: NAVY }}
      >
        <Plus className="h-4 w-4" />
        {t('fleet.articles.new')}
      </button>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {['', ...KINDS].map((k) => (
        <button
          key={k || 'all'}
          type="button"
          onClick={() => onKind?.(k)}
          className={cn('rounded-full px-3 h-8 text-xs font-semibold border', kind === k ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
          style={kind === k ? { backgroundColor: NAVY } : undefined}
        >
          {k ? t(`fleet.kinds.${k}`) : t('fleet.articles.allKinds')}
        </button>
      ))}
    </div>
    {rows.length === 0 && <p className="text-sm text-gray-500 text-center py-10">{t('fleet.articles.none')}</p>}
    <ul className="grid gap-2 md:grid-cols-2">
      {rows.map(({ article: a, usage: u, kitName }) => (
        <li
          key={a.id}
          className={cn('rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 space-y-2', a.active === false && 'opacity-60')}
        >
          <div className="flex items-center gap-3">
            <NodeIcon node={a} className="h-10 w-10" />
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{label(a)}</p>
              <p className="text-xs text-gray-500 truncate">
                {t(`fleet.kinds.${a.kind}`)}
                {kitName ? ` · ${t('fleet.articles.kitBadge', { name: kitName })}` : ''}
                {a.active === false ? ` · ${t('fleet.articles.inactive')}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-black leading-none">{u ? u.qty : 0}</p>
              <p className="text-[11px] text-gray-500">{t('fleet.articles.inFleet')}</p>
            </div>
            {onEdit && (
              <button type="button" className="h-9 w-9 rounded-full inline-flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => onEdit(a)} aria-label={t('common.edit')}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
          {u && u.byRoot.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {u.byRoot.map((r) => (
                <span key={r.id} className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.depot ? 'bg-gray-200 dark:bg-gray-800' : 'bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200')}>
                  {r.label} · {r.qty}
                </span>
              ))}
            </div>
          )}
          {u && (u.damaged_usable > 0 || u.broken > 0 || u.missing > 0) && (
            <div className="flex flex-wrap gap-1 text-[11px] font-bold">
              {u.damaged_usable > 0 && <span className="rounded-full px-2 py-0.5 bg-yellow-100 text-yellow-800">{t('fleet.cond.damaged_usable')} · {u.damaged_usable}</span>}
              {u.broken > 0 && <span className="rounded-full px-2 py-0.5 bg-red-100 text-red-700">{t('fleet.cond.broken')} · {u.broken}</span>}
              {u.missing > 0 && <span className="rounded-full px-2 py-0.5 bg-gray-200 text-gray-700">{t('fleet.cond.missing')} · {u.missing}</span>}
            </div>
          )}
          {!u && <p className="text-[11px] text-gray-400">{t('fleet.articles.unused')}</p>}
        </li>
      ))}
    </ul>
  </div>
);

export default ArticlesCatalogView;
