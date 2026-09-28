import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Loader2, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { canContain, isContainer, moveNode, nodeName } from '@/lib/fleet/inventory';
import { NAVY, YELLOW } from './FleetUI';
import NodeIcon from './NodeIcon';

/**
 * Pick a destination container. Members: only their van (server re-checks);
 * admins: every root. The node's own subtree is excluded (no cycles).
 * v1.11.0: only containers that accept the node's kind are selectable (matériel → zone or caisse,
 * caisse / machine → zone); quick actions to put a matériel into a crate of its zone or take it out.
 */
const MoveNodeDialog = ({ open, onOpenChange, node, tree, roots, lang, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dest, setDest] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDest('');
      setQty(node?.qty > 1 ? String(node.qty) : '');
    }
  }, [open, node]);

  const options = useMemo(() => {
    if (!node) return [];
    const banned = new Set([node.id, ...tree.descendants(node.id).map((n) => n.id)]);
    const out = [];
    const walk = (n, depth) => {
      if (!isContainer(n) || banned.has(n.id)) return;
      out.push({ node: n, depth, allowed: canContain(n, node.kind) });
      for (const c of tree.childrenOf(n.id)) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [node, tree, roots]);

  if (!node) return null;
  const parent = tree.byId.get(node.parent_id);
  const inCrate = node.kind === 'materiel' && parent?.kind === 'caisse';
  const zoneId = inCrate ? parent.parent_id : node.parent_id;
  const zoneNode = tree.byId.get(zoneId);
  const allowedIds = new Set(options.filter((o) => o.allowed).map((o) => o.node.id));
  const sameZoneCrates =
    node.kind === 'materiel' ? tree.childrenOf(zoneId).filter((c) => c.kind === 'caisse' && c.id !== node.parent_id && allowedIds.has(c.id)) : [];
  const splittable = node.kind === 'materiel' && Number(node.qty) > 1;

  const submit = async () => {
    if (!dest) return;
    setSaving(true);
    try {
      const q = splittable && Number(qty) > 0 && Number(qty) < Number(node.qty) ? Number(qty) : null;
      await moveNode(node.id, dest, q);
      toast({ title: t('fleet.moveNode.done') });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.moveNode.failed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('fleet.moveNode.title')}</DialogTitle>
          <DialogDescription>
            {nodeName(node, lang)}
            {isContainer(node) && tree.descendants(node.id).length > 0 && (
              <> · {t('fleet.moveNode.withContents', { count: tree.descendants(node.id).length })}</>
            )}
          </DialogDescription>
        </DialogHeader>
        {splittable && (
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 px-4 h-12">
            <span className="text-sm font-medium">{t('fleet.moveNode.qty', { total: node.qty })}</span>
            <Input
              type="number"
              min={1}
              max={node.qty}
              className="h-9 w-20 rounded-xl text-center"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        )}
        {(inCrate || sameZoneCrates.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {inCrate && zoneNode && allowedIds.has(zoneNode.id) && (
              <button
                type="button"
                onClick={() => setDest(zoneNode.id)}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-xs font-bold', dest === zoneNode.id ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
                style={dest === zoneNode.id ? { backgroundColor: NAVY } : undefined}
              >
                <LogOut className="h-3.5 w-3.5" />
                {t('fleet.crate.takeOut', { zone: nodeName(zoneNode, lang) })}
              </button>
            )}
            {sameZoneCrates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setDest(c.id)}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-xs font-bold', dest === c.id ? 'border-transparent text-white' : 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800')}
                style={dest === c.id ? { backgroundColor: NAVY } : undefined}
              >
                <Package className="h-3.5 w-3.5" />
                {t('fleet.crate.putIn', { crate: nodeName(c, lang) })}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1">
          {options.map(({ node: n, depth, allowed }) => {
            const current = n.id === node.parent_id;
            return (
              <button
                key={n.id}
                type="button"
                disabled={current || !allowed}
                onClick={() => setDest(n.id)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-2xl border px-2 h-12 text-left disabled:opacity-40',
                  dest === n.id ? 'border-transparent text-white' : 'border-gray-100 dark:border-gray-800'
                )}
                style={{ paddingLeft: 8 + depth * 18, ...(dest === n.id ? { backgroundColor: NAVY } : {}) }}
              >
                <NodeIcon node={n} className="h-8 w-8" />
                <span className="font-semibold truncate">{nodeName(n, lang)}</span>
                {current && <span className="ml-auto text-xs">{t('fleet.moveNode.here')}</span>}
              </button>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={!dest || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fleet.moveNode.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MoveNodeDialog;
