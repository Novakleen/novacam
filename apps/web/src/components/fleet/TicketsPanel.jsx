import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nodeName } from '@/lib/fleet/inventory';
import { firstName } from '@/lib/fleet/api';
import { CondPill, NAVY, YELLOW } from './FleetUI';
import NodeIcon from './NodeIcon';
import CrateBadge from './LocationBadge';
import InventoryDialogs from './InventoryDialogs';

const SEV_RANK = { broken: 3, missing: 2, damaged_usable: 1 };

function ago(iso, t) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return t('fleet.todo.today');
  return t('fleet.todo.daysAgo', { count: days });
}

/** « À traiter »: open damage tickets across every visible van (admin) or my van (member). */
const TicketsPanel = ({ data, index, isAdmin, myRootId, onReload }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const tree = index.tree;
  const [scope, setScope] = useState('open');
  const [rootFilter, setRootFilter] = useState('all');
  const [dialogs, setDialogs] = useState({});

  const roots = useMemo(
    () =>
      [
        ...data.vans.map((v) => tree.byId.get(index.locationByVan.get(v.id)?.id)),
        tree.byId.get(index.depot?.id),
      ].filter(Boolean),
    [data.vans, tree, index]
  );

  const list = useMemo(() => {
    const rows = data.tickets
      .map((tk) => ({ tk, node: tree.byId.get(tk.node_id) }))
      .filter(({ node }) => node)
      .filter(({ tk }) => (scope === 'open' ? tk.status !== 'resolu' : tk.status === 'resolu'))
      .filter(({ node }) => rootFilter === 'all' || node.root_id === rootFilter);
    rows.sort((a, b) =>
      scope === 'open'
        ? (SEV_RANK[b.tk.severity] || 0) - (SEV_RANK[a.tk.severity] || 0) || new Date(a.tk.reported_at) - new Date(b.tk.reported_at)
        : new Date(b.tk.resolved_at || 0) - new Date(a.tk.resolved_at || 0)
    );
    return rows;
  }, [data.tickets, tree, scope, rootFilter]);

  const openCount = data.tickets.filter((tk) => tk.status !== 'resolu' && tree.byId.get(tk.node_id)).length;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1">
          {['open', 'resolved'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn('rounded-full px-4 h-9 text-sm font-semibold', scope === s ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-500')}
            >
              {s === 'open' ? t('fleet.todo.open', { count: openCount }) : t('fleet.todo.resolved')}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {[{ id: 'all', name: t('fleet.filter.all') }, ...roots].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRootFilter(r.id)}
                className={cn('shrink-0 rounded-full px-3 h-9 text-xs font-bold border', rootFilter === r.id ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
                style={rootFilter === r.id ? { backgroundColor: NAVY } : undefined}
              >
                {r.id === 'all' ? r.name : nodeName(r, lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto h-16 w-16 rounded-3xl flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="font-bold">{scope === 'open' ? t('fleet.todo.nothing') : t('fleet.todo.noResolved')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map(({ tk, node }) => {
            const path = tree.path(node.id);
            return (
              <li key={tk.id}>
                <button
                  type="button"
                  onClick={() => setDialogs((d) => ({ ...d, ticket: tk }))}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-2xl border bg-white dark:bg-gray-900 p-3 text-left',
                    tk.severity === 'broken' && tk.status !== 'resolu' ? 'border-red-200 dark:border-red-900' : 'border-gray-100 dark:border-gray-800'
                  )}
                >
                  <NodeIcon node={node} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold truncate">{nodeName(node, lang)}</span>
                      <CondPill condition={tk.status === 'resolu' ? 'ok' : tk.severity} label={t(`fleet.cond.${tk.severity}`)} />
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {path
                        .slice(0, -1)
                        .map((p) => nodeName(p, lang))
                        .join(' › ')}
                    </span>
                    <CrateBadge node={node} byId={tree.byId} lang={lang} t={t} />
                    <span className="block text-xs mt-0.5">
                      <span className="inline-block rounded-full px-2 py-0.5 font-bold mr-1.5" style={{ backgroundColor: NAVY, color: YELLOW }}>
                        {tk.status === 'resolu' ? t(`fleet.resolutions.${tk.resolution}`) : t(`fleet.status.${tk.status}`)}
                      </span>
                      {ago(tk.reported_at, t)} · {firstName(index.profileById.get(tk.reported_by))}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <InventoryDialogs
        state={dialogs}
        setState={setDialogs}
        ctx={{
          tree,
          tickets: data.tickets,
          articles: data.articles,
          isAdmin,
          canActNode: (n) => isAdmin || n.root_id === myRootId,
          canMoveNode: (n) => isAdmin || n.root_id === myRootId,
          moveRoots: isAdmin ? roots : [tree.byId.get(myRootId)].filter(Boolean),
          lang,
          profileById: index.profileById,
          onReload,
        }}
      />
    </div>
  );
};

export default TicketsPanel;
