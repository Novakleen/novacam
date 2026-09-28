import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { AlertTriangle, ChevronRight, GripVertical, Home, Lock, Package, PackageCheck, PackageX, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { canContain, crateError, isContainer, isCrateItem, moveNode, nodeName, setMissing } from '@/lib/fleet/inventory';
import { CondPill } from './FleetUI';
import NodeIcon from './NodeIcon';
import VanPlan, { blockSub } from './VanPlan';
import { DragHandle, DropTarget, fleetCollision, useFleetSensors } from './FleetDnd';

const subLabel = blockSub;

/**
 * Folder-like drill-down of one root (van or depot). For vans, the SVG van is the top level:
 * tap a zone to open it, tap a block (caisse / machine / item) to open it or its sheet.
 * v1.9.0: drag & drop (SVG blocks and list rows → zones, caisses, breadcrumb) + editable plan.
 * v1.11.0: crates are shown as containers with their matériel nested inside; drops follow the nesting rules.
 * v1.12.0: crate contents are locked (catalog standard); items can only be marked missing / found.
 */
const InventoryBrowser = ({ root, tree, isAdmin, canAct, canEditPlan = false, lang, focus, openDialog, onReload }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [cwd, setCwd] = useState(root.id);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [moving, setMoving] = useState(false);
  const lastDrag = useRef(0);
  const sensors = useFleetSensors();
  const canDrag = canAct && !moving;

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

  const zoneNodes = useMemo(
    () => (root.kind === 'van' ? tree.childrenOf(root.id).filter((c) => c.kind === 'zone') : []),
    [root, tree]
  );
  const recentlyDragged = () => Date.now() - lastDrag.current < 350;

  const children = tree.childrenOf(current.id).filter((c) => !issuesOnly || tree.worst(c.id) !== 'ok');
  const issueCount = tree.descendants(current.id).filter((n) => n.condition !== 'ok').length;

  const [missingBusy, setMissingBusy] = useState(null);
  const toggleMissing = async (n) => {
    const missing = tree.missingQty(n.id) > 0;
    setMissingBusy(n.id);
    try {
      await setMissing(n.id, !missing);
      toast({ title: missing ? t('fleet.crate.foundDone', { name: nodeName(n, lang) }) : t('fleet.crate.missingDone', { name: nodeName(n, lang) }) });
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.crate.missingFailed'), description: err.message });
    } finally {
      setMissingBusy(null);
    }
  };

  const openNode = (n) => {
    if (recentlyDragged()) return;
    if (isContainer(n)) setCwd(n.id);
    else openDialog('sheet', n);
  };

  // Drop → the same permission-checked RPC as the move dialog (technicians: own van only)
  const onDragEnd = async ({ active, over }) => {
    lastDrag.current = Date.now();
    setDragId(null);
    const nodeId = active?.data?.current?.nodeId;
    const target = over?.data?.current?.nodeId;
    if (!nodeId || !target) return;
    const node = tree.byId.get(nodeId);
    const dest = tree.byId.get(target);
    if (!node || !dest || target === node.id || target === node.parent_id) return;
    if (isCrateItem(node, tree.byId)) {
      toast({ variant: 'destructive', title: t('fleet.crate.locked') });
      return;
    }
    if (!canContain(dest, node.kind) || tree.descendants(node.id).some((d) => d.id === target)) {
      toast({ variant: 'destructive', title: t('fleet.dnd.invalid') });
      return;
    }
    setMoving(true);
    try {
      await moveNode(nodeId, target);
      toast({ title: t('fleet.dnd.moved', { name: nodeName(node, lang), dest: nodeName(dest, lang) }) });
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.moveNode.failed'), description: crateError(err, t) });
    } finally {
      setMoving(false);
    }
  };
  const dragNode = dragId ? tree.byId.get(dragId) : null;

  const renderRow = (c, { nested = false } = {}) => {
    const worst = tree.worst(c.id);
    const reportable = c.kind !== 'zone';
    const dragNodeKind = dragId ? tree.byId.get(dragId)?.kind : null;
    const locked = isCrateItem(c, tree.byId);
    const missingQ = locked ? tree.missingQty(c.id) : 0;
    const crateMissing = c.kind === 'caisse' ? tree.crateMissing(c.id) : 0;
    return (
      <div className="flex items-center gap-1.5">
        {canDrag && c.kind !== 'zone' && !locked && (
          <DragHandle
            nodeId={c.id}
            label={t('fleet.dnd.handle')}
            className={cn('shrink-0 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-grab active:cursor-grabbing', nested ? 'h-10 w-6' : 'h-12 w-7')}
          >
            <GripVertical className="h-5 w-5" />
          </DragHandle>
        )}
        <DropTarget
          nodeId={c.id}
          scope="row"
          disabled={!dragId || dragId === c.id || !canContain(c, dragNodeKind)}
          className="flex-1 min-w-0 rounded-2xl"
          overClassName="ring-4 ring-yellow-300"
        >
          <button
            type="button"
            onClick={() => openNode(c)}
            className={cn(
              'w-full min-w-0 flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-left active:scale-[0.99] transition',
              nested ? 'p-2' : 'p-2.5'
            )}
          >
            <NodeIcon node={c} className={cn(nested ? 'h-9 w-9' : undefined, missingQ > 0 && 'opacity-40 grayscale')} />
            <span className="flex-1 min-w-0">
              <span className={cn('block font-semibold truncate', missingQ > 0 && 'line-through text-gray-400')}>{nodeName(c, lang)}</span>
              <span className="block text-xs text-gray-500 truncate">
                {c.kind === 'caisse' ? `${t('fleet.kinds.caisse')} · ${subLabel(c, tree, t)}` : subLabel(c, tree, t)}
                {missingQ > 0 && c.qty > 1 && ` · ${t('fleet.crate.missingOf', { count: missingQ, total: c.qty })}`}
              </span>
            </span>
            {crateMissing > 0 && (
              <span className="shrink-0 rounded-full bg-red-600 text-white px-2 py-0.5 text-[11px] font-bold">{t('fleet.crate.missingCount', { count: crateMissing })}</span>
            )}
            {missingQ > 0 ? (
              <span className="shrink-0 rounded-full bg-red-600 text-white px-2 py-0.5 text-[11px] font-bold">{t('fleet.cond.missing')}</span>
            ) : (
              worst !== 'ok' && !(c.kind === 'caisse' && crateMissing > 0 && worst === 'missing') && <CondPill condition={worst} label={t(`fleet.cond.${worst}`)} className="shrink-0" />
            )}
            {isContainer(c) && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
          </button>
        </DropTarget>
        {canAct && locked && (
          <button
            type="button"
            disabled={missingBusy === c.id}
            onClick={() => toggleMissing(c)}
            className={cn(
              'shrink-0 rounded-2xl flex items-center justify-center active:scale-95 disabled:opacity-50 border',
              nested ? 'h-10 w-10' : 'h-12 w-12',
              missingQ > 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-900 dark:border-gray-700'
            )}
            aria-label={missingQ > 0 ? t('fleet.crate.markFound') : t('fleet.crate.markMissing')}
            title={missingQ > 0 ? t('fleet.crate.markFound') : t('fleet.crate.markMissing')}
          >
            {missingQ > 0 ? <PackageCheck className="h-5 w-5" /> : <PackageX className="h-5 w-5" />}
          </button>
        )}
        {canAct && reportable && (
          <button
            type="button"
            onClick={() => openDialog('report', c)}
            className={cn('shrink-0 rounded-2xl bg-yellow-400 text-[#0b1f4d] flex items-center justify-center active:scale-95', nested ? 'h-10 w-10' : 'h-12 w-12')}
            aria-label={t('fleet.report.cta')}
            title={t('fleet.report.cta')}
          >
            <AlertTriangle className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={fleetCollision}
      onDragStart={({ active }) => setDragId(active?.data?.current?.nodeId || null)}
      onDragCancel={() => {
        lastDrag.current = Date.now();
        setDragId(null);
      }}
      onDragEnd={onDragEnd}
    >
    <div className="space-y-3">
      {root.kind === 'van' && (
        <VanPlan
          root={root}
          tree={tree}
          lang={lang}
          selectedZoneId={zoneInPath?.id}
          canDrag={canDrag}
          canEditPlan={canEditPlan}
          isAdmin={isAdmin}
          canPlace={canAct}
          editing={editing}
          onEditingChange={setEditing}
          onZone={(id) => {
            if (!recentlyDragged()) setCwd(id);
          }}
          onBlock={(id) => {
            const n = tree.byId.get(id);
            if (n) openNode(n);
          }}
          onQuickAdd={(zone) => zone && openDialog('edit', { parent: zone })}
          onEditZone={(zone) => openDialog('edit', { node: zone })}
          onReload={onReload}
        />
      )}
      {zoneNodes.length > 0 && !editing && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {zoneNodes.map((z) => {
            const worst = tree.worst(z.id);
            return (
              <DropTarget key={z.id} nodeId={z.id} scope="chip" disabled={!dragId} className="rounded-full" overClassName="ring-4 ring-yellow-300">
                <button
                  type="button"
                  onClick={() => setCwd(z.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-xs font-semibold',
                    zoneInPath?.id === z.id ? 'border-[#0b1f4d] bg-[#0b1f4d] text-white' : 'border-gray-200 dark:border-gray-700'
                  )}
                >
                  {worst !== 'ok' && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: worst === 'broken' ? '#ef4444' : worst === 'missing' ? '#9ca3af' : '#eab308' }} />}
                  {nodeName(z, lang)}
                </button>
              </DropTarget>
            );
          })}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide text-sm">
        {path.map((p, i) => (
          <React.Fragment key={p.id}>
            {i > 0 && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <DropTarget nodeId={p.id} scope="crumb" disabled={!dragId || p.kind === 'van'} className="shrink-0 rounded-full" overClassName="ring-4 ring-yellow-300">
            <button
              type="button"
              onClick={() => setCwd(p.id)}
              className={cn('shrink-0 rounded-full px-2.5 h-8 inline-flex items-center gap-1', i === path.length - 1 ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')}
            >
              {i === 0 && <Home className="h-3.5 w-3.5" />}
              {nodeName(p, lang)}
            </button>
            </DropTarget>
          </React.Fragment>
        ))}
      </nav>

      {/* Current container card (caisse / machine): actions */}
      {['caisse', 'machine'].includes(current.kind) && (
        <div className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 p-3">
          <NodeIcon node={current} />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{nodeName(current, lang)}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <CondPill condition={tree.worst(current.id)} label={t(`fleet.cond.${tree.worst(current.id)}`)} />
              {current.kind === 'caisse' && tree.crateMissing(current.id) > 0 && (
                <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[11px] font-bold">{t('fleet.crate.missingCount', { count: tree.crateMissing(current.id) })}</span>
              )}
            </div>
            {current.kind === 'caisse' && (
              <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {t('fleet.crate.lockedHint')}
              </p>
            )}
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
        {canAct && current.kind !== 'van' && current.kind !== 'caisse' && isContainer(current) && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => openDialog('edit', { parent: current })}>
            <Plus className="h-4 w-4 mr-1" />
            {t('fleet.inv.add')}
          </Button>
        )}
      </div>

      {/* Contents */}
      {children.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{issuesOnly ? t('fleet.inv.noIssues') : t('fleet.inv.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {children.map((c) =>
            c.kind === 'caisse' && current.kind !== 'caisse' ? (
              <li key={c.id} className="rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-1.5 space-y-1.5">
                {renderRow(c)}
                <p className="ml-9 pl-3 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {t('fleet.crate.lockedHint')}
                </p>
                {(() => {
                  const inner = tree.childrenOf(c.id).filter((x) => !issuesOnly || tree.worst(x.id) !== 'ok');
                  return inner.length === 0 ? (
                    <p className="ml-9 pl-3 text-xs text-gray-500 flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {t('fleet.crate.empty')}
                    </p>
                  ) : (
                    <ul className="ml-5 pl-3 border-l-2 border-amber-300 dark:border-amber-700 space-y-1.5" aria-label={t('fleet.crate.contents', { name: nodeName(c, lang) })}>
                      {inner.map((x) => (
                        <li key={x.id}>{renderRow(x, { nested: true })}</li>
                      ))}
                    </ul>
                  );
                })()}
              </li>
            ) : (
              <li key={c.id}>{renderRow(c)}</li>
            )
          )}
        </ul>
      )}
    </div>
      <DragOverlay dropAnimation={null}>
        {dragNode ? (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-2 ring-yellow-400 px-3 py-2 pointer-events-none">
            <NodeIcon node={dragNode} className="h-8 w-8" />
            <span className="font-bold text-sm max-w-[180px] truncate">{nodeName(dragNode, lang)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default InventoryBrowser;
