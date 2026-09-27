import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, LayoutTemplate, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { deleteNode, isContainer, nodeName, saveLayoutAsKitDefault, saveNode, setZoneGeometry } from '@/lib/fleet/inventory';
import { NAVY, YELLOW } from './FleetUI';
import VanSvg, { DEFAULT_ZONE_GEOM, nodeRect } from './VanSvg';
import ZoneEditOverlay from './ZoneEditOverlay';
import { DragBlockWrap, DropZoneWrap } from './FleetDnd';
import useConfirm from './useConfirm';

export function blockSub(node, tree, t) {
  if (node.kind === 'materiel') return `× ${node.qty}`;
  if (node.kind === 'machine' && node.serial) return `N° ${node.serial}`;
  if (isContainer(node)) return t('fleet.inv.itemsCount', { count: tree.childrenOf(node.id).length });
  return '';
}

/** Zones (with geometry) of a van node, ready for VanSvg. */
export function buildPlanZones(root, tree, lang, t, { drafts = {}, draggable = false, withBlocks = true } = {}) {
  return tree
    .childrenOf(root.id)
    .filter((c) => c.kind === 'zone')
    .map((z) => ({
      id: z.id,
      key: z.zone_key,
      label: nodeName(z, lang),
      worst: tree.worst(z.id),
      rect: drafts[z.id] || nodeRect(z),
      blocks: withBlocks
        ? tree.childrenOf(z.id).map((c) => ({
            id: c.id,
            label: nodeName(c, lang),
            sub: t ? blockSub(c, tree, t) : '',
            kind: c.kind,
            condition: tree.worst(c.id),
            draggable,
          }))
        : [],
    }));
}

/**
 * Interactive van plan.
 *  view mode: tap zones / blocks; long-press (touch) or drag (mouse) a block onto a zone or caisse
 *  edit mode («Modifier le plan»): move / resize zones on a 5 cm grid; admins also add, rename,
 *            delete zones and quick-add items in a zone.
 */
const VanPlan = ({
  root,
  tree,
  lang,
  selectedZoneId,
  canDrag,
  canEditPlan,
  isAdmin,
  canPlace = isAdmin,
  editing,
  onEditingChange,
  onZone,
  onBlock,
  onQuickAdd,
  onEditZone,
  onReload,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const svgRef = useRef(null);
  const [drafts, setDrafts] = useState({});
  const [editSel, setEditSel] = useState(null);
  const [busy, setBusy] = useState(false);

  // Fresh data from the server replaces local drafts
  useEffect(() => setDrafts({}), [tree]);

  const zones = useMemo(
    () => buildPlanZones(root, tree, lang, t, { drafts, draggable: canDrag && !editing }),
    [root, tree, lang, t, drafts, canDrag, editing]
  );
  const selZone = editing ? zones.find((z) => z.id === editSel) || null : null;
  const selNode = selZone ? tree.byId.get(selZone.id) : null;

  const commit = async (id, rect) => {
    try {
      await setZoneGeometry(id, rect);
      onReload?.();
    } catch (err) {
      setDrafts((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      toast({ variant: 'destructive', title: t('fleet.plan.saveFailed'), description: err.message });
    }
  };

  const addZone = async () => {
    setBusy(true);
    try {
      const z = await saveNode({
        parent_id: root.id,
        kind: 'zone',
        name: t('fleet.plan.newZone'),
        sort: (zones.length + 1) * 10,
        plan_x: 60,
        plan_y: 120,
        plan_w: 40,
        plan_h: 40,
      });
      setEditSel(z.id);
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.plan.saveFailed'), description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const removeZone = async () => {
    if (!selNode) return;
    if (tree.childrenOf(selNode.id).length) {
      toast({ variant: 'destructive', title: t('fleet.plan.zoneNotEmpty') });
      return;
    }
    if (!(await confirm({ title: t('fleet.node.confirmDelete', { name: nodeName(selNode, lang) }) }))) return;
    try {
      await deleteNode(selNode.id);
      setEditSel(null);
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.plan.saveFailed'), description: err.message });
    }
  };

  const resetLayout = async () => {
    if (!(await confirm({ title: t('fleet.plan.resetConfirm'), destructive: false }))) return;
    setBusy(true);
    try {
      for (const z of zones) {
        const def = DEFAULT_ZONE_GEOM[z.key];
        if (def) await setZoneGeometry(z.id, def);
      }
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.plan.saveFailed'), description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const saveAsDefault = async () => {
    if (!(await confirm({ title: t('fleet.plan.saveDefaultConfirm'), destructive: false }))) return;
    setBusy(true);
    try {
      const n = await saveLayoutAsKitDefault(zones.map((z) => ({ rect: z.rect, kit_item_id: tree.byId.get(z.id)?.kit_item_id })));
      toast({ title: t('fleet.plan.savedDefault', { count: n }) });
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.plan.saveFailed'), description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {canEditPlan && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="rounded-full font-bold"
            variant={editing ? 'default' : 'outline'}
            style={editing ? { backgroundColor: NAVY, color: YELLOW } : undefined}
            onClick={() => {
              setEditSel(null);
              onEditingChange(!editing);
            }}
          >
            {editing ? <Check className="h-4 w-4 mr-1.5" /> : <Pencil className="h-4 w-4 mr-1.5" />}
            {editing ? t('fleet.plan.done') : t('fleet.plan.edit')}
          </Button>
        </div>
      )}

      <div
        className={cn(
          'rounded-3xl p-3 flex justify-center',
          editing ? 'bg-yellow-50 ring-2 ring-yellow-300 dark:bg-yellow-950/20' : 'bg-gradient-to-b from-slate-100 to-white dark:from-gray-900 dark:to-gray-950'
        )}
      >
        <VanSvg
          svgRef={svgRef}
          zones={zones}
          title={nodeName(root, lang)}
          selectedZoneId={editing ? null : selectedZoneId}
          grid={editing}
          dimBlocks={editing}
          onZone={editing ? undefined : onZone}
          onBlock={editing ? undefined : onBlock}
          ZoneWrap={editing ? undefined : DropZoneWrap}
          BlockWrap={editing ? undefined : DragBlockWrap}
          className="w-full max-w-[340px] h-auto"
          style={editing ? { touchAction: 'none' } : undefined}
        >
          {editing && (
            <ZoneEditOverlay
              zones={zones}
              selectedId={editSel}
              svgRef={svgRef}
              onSelect={(id) => {
                setEditSel(id);
                onZone?.(id, { silent: true });
              }}
              onChange={(id, rect) => setDrafts((d) => ({ ...d, [id]: rect }))}
              onCommit={commit}
              onQuickAdd={canPlace ? (id) => onQuickAdd?.(tree.byId.get(id)) : undefined}
            />
          )}
        </VanSvg>
      </div>

      {!editing && canDrag && <p className="text-center text-xs text-gray-500">{t('fleet.plan.dragHint')}</p>}

      {editing && (
        <div className="rounded-2xl border border-yellow-200 dark:border-yellow-900 bg-white dark:bg-gray-900 p-3 space-y-3">
          <p className="text-xs text-gray-500">{t('fleet.plan.editHint')}</p>
          {selNode ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold truncate">{nodeName(selNode, lang)}</p>
                <span className="text-xs font-mono text-gray-500">
                  {Math.round(selZone.rect.w)}×{Math.round(selZone.rect.h)} cm
                </span>
              </div>
              {(isAdmin || canPlace) && (
                <div className="flex flex-wrap gap-2">
                  {canPlace && (
                  <Button size="sm" className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => onQuickAdd?.(selNode)}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t('fleet.plan.quickAdd')}
                  </Button>
                  )}
                  {isAdmin && (
                  <>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => onEditZone?.(selNode)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    {t('fleet.plan.rename')}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full text-red-600" onClick={removeZone}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t('fleet.plan.deleteZone')}
                  </Button>
                  </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('fleet.plan.selectZone')}</p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            {isAdmin && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={addZone}>
                <LayoutTemplate className="h-4 w-4 mr-1" />
                {t('fleet.plan.addZone')}
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={resetLayout}>
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('fleet.plan.reset')}
            </Button>
            {isAdmin && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={saveAsDefault}>
                <Save className="h-4 w-4 mr-1" />
                {t('fleet.plan.saveDefault')}
              </Button>
            )}
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
};

export default VanPlan;
