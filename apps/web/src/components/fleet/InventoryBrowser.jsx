import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Home, Plus, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { applyKit, isContainer, nodeName, ZONE_KEYS } from '@/lib/fleet/inventory';
import { CondPill } from './FleetUI';
import NodeIcon from './NodeIcon';
import VanSvg from './VanSvg';

function subLabel(node, tree, t) {
  if (node.kind === 'materiel') return `× ${node.qty}`;
  if (node.kind === 'machine' && node.serial) return `N° ${node.serial}`;
  if (isContainer(node)) {
    const n = tree.childrenOf(node.id).length;
    return t('fleet.inv.itemsCount', { count: n });
  }
  return '';
}

/**
 * Folder-like drill-down of one root (van or depot). For vans, the SVG van is the top level:
 * tap a zone to open it, tap a block (caisse / machine / item) to open it or its sheet.
 */
const InventoryBrowser = ({ root, tree, kits, isAdmin, canAct, lang, focus, openDialog, onReload }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [cwd, setCwd] = useState(root.id);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setCwd(root.id);
  }, [root.id]);

  // Deep link (search result): open the container, or the item's parent + its sheet
  useEffect(() => {
    if (!focus?.id) return;
    const n = tree.byId.get(focus.id);
    if (!n || n.root_id !== root.id) return;
    if (isContainer(n)) setCwd(n.id);
    else {
      setCwd(n.parent_id || root.id);
      openDialog('sheet', n);
    }
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = tree.byId.get(cwd) || root;
  const path = tree.path(current.id);
  const zoneInPath = path.find((p) => p.kind === 'zone');

  const zones = useMemo(() => {
    if (root.kind !== 'van') return null;
    const out = {};
    for (const z of tree.childrenOf(root.id).filter((c) => c.kind === 'zone')) {
      out[z.zone_key] = {
        id: z.id,
        label: nodeName(z, lang),
        worst: tree.worst(z.id),
        blocks: tree.childrenOf(z.id).map((c) => ({
          id: c.id,
          label: nodeName(c, lang),
          sub: subLabel(c, tree, t),
          kind: c.kind,
          condition: tree.worst(c.id),
        })),
      };
    }
    return out;
  }, [root, tree, lang, t]);

  const zoneIdByKey = (key) => zones?.[key]?.id;

  const children = tree.childrenOf(current.id).filter((c) => !issuesOnly || tree.worst(c.id) !== 'ok');
  const issueCount = tree.descendants(current.id).filter((n) => n.condition !== 'ok').length;

  const openNode = (n) => {
    if (isContainer(n)) setCwd(n.id);
    else openDialog('sheet', n);
  };

  const kitTarget = current.kind === 'van' ? 'van' : current.kind === 'caisse' ? 'caisse' : null;
  const applicableKits = kitTarget ? (kits || []).filter((k) => k.target_kind === kitTarget && k.active !== false) : [];
  const resync = async (kit) => {
    setSyncing(true);
    try {
      const n = await applyKit(current.id, kit.id);
      toast({ title: t('fleet.kits.resynced', { count: n }) });
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.kits.failed'), description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-3">
      {zones && (
        <div className="rounded-3xl bg-gradient-to-b from-slate-100 to-white dark:from-gray-900 dark:to-gray-950 p-3 flex justify-center">
          <VanSvg
            zones={zones}
            title={nodeName(root, lang)}
            selectedZone={zoneInPath?.zone_key}
            onZone={(key) => zoneIdByKey(key) && setCwd(zoneIdByKey(key))}
            onBlock={(id) => {
              const n = tree.byId.get(id);
              if (n) openNode(n);
            }}
            className="w-full max-w-[340px] h-auto select-none"
          />
        </div>
      )}
      {zones && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {ZONE_KEYS.filter((k) => zones[k]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCwd(zones[k].id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-xs font-semibold',
                zoneInPath?.zone_key === k ? 'border-[#0b1f4d] bg-[#0b1f4d] text-white' : 'border-gray-200 dark:border-gray-700'
              )}
            >
              {zones[k].worst !== 'ok' && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zones[k].worst === 'broken' ? '#ef4444' : zones[k].worst === 'missing' ? '#9ca3af' : '#eab308' }} />}
              {zones[k].label}
            </button>
          ))}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide text-sm">
        {path.map((p, i) => (
          <React.Fragment key={p.id}>
            {i > 0 && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <button
              type="button"
              onClick={() => setCwd(p.id)}
              className={cn('shrink-0 rounded-full px-2.5 h-8 inline-flex items-center gap-1', i === path.length - 1 ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')}
            >
              {i === 0 && <Home className="h-3.5 w-3.5" />}
              {nodeName(p, lang)}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Current container card (caisse / machine): actions */}
      {['caisse', 'machine'].includes(current.kind) && (
        <div className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 p-3">
          <NodeIcon node={current} />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{nodeName(current, lang)}</p>
            <CondPill condition={tree.worst(current.id)} label={t(`fleet.cond.${tree.worst(current.id)}`)} />
          </div>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => openDialog('sheet', current)}>
            {t('fleet.inv.details')}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setIssuesOnly((v) => !v)}
          className={cn('rounded-full px-3 h-9 text-xs font-bold border', issuesOnly ? 'bg-red-600 border-red-600 text-white' : 'border-gray-200 dark:border-gray-700')}
        >
          {t('fleet.inv.issuesOnly')} {issueCount > 0 && `(${issueCount})`}
        </button>
        <div className="flex-1" />
        {isAdmin && current.kind !== 'van' && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => openDialog('edit', { parent: current })}>
            <Plus className="h-4 w-4 mr-1" />
            {t('fleet.inv.add')}
          </Button>
        )}
        {isAdmin &&
          applicableKits.map((k) => (
            <Button key={k.id} size="sm" variant="outline" className="rounded-full" disabled={syncing} onClick={() => resync(k)}>
              <RefreshCcw className={cn('h-4 w-4 mr-1', syncing && 'animate-spin')} />
              {t('fleet.kits.resyncWith', { name: nodeName(k, lang) })}
            </Button>
          ))}
      </div>

      {/* Contents */}
      {children.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{issuesOnly ? t('fleet.inv.noIssues') : t('fleet.inv.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {children.map((c) => {
            const worst = tree.worst(c.id);
            const reportable = !['zone'].includes(c.kind);
            return (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNode(c)}
                  className="flex-1 min-w-0 flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-2.5 text-left active:scale-[0.99] transition"
                >
                  <NodeIcon node={c} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">{nodeName(c, lang)}</span>
                    <span className="block text-xs text-gray-500 truncate">{subLabel(c, tree, t)}</span>
                  </span>
                  {worst !== 'ok' && <CondPill condition={worst} label={t(`fleet.cond.${worst}`)} className="shrink-0" />}
                  {isContainer(c) && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                </button>
                {canAct && reportable && (
                  <button
                    type="button"
                    onClick={() => openDialog('report', c)}
                    className="h-12 w-12 shrink-0 rounded-2xl bg-yellow-400 text-[#0b1f4d] flex items-center justify-center active:scale-95"
                    aria-label={t('fleet.report.cta')}
                    title={t('fleet.report.cta')}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default InventoryBrowser;
