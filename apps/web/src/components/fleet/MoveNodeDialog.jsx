import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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
import { isContainer, moveNode, nodeName } from '@/lib/fleet/inventory';
import { NAVY, YELLOW } from './FleetUI';
import NodeIcon from './NodeIcon';

/**
 * Pick a destination container. Members: only their van (server re-checks);
 * admins: every root. The node's own subtree is excluded (no cycles).
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
      out.push({ node: n, depth });
      for (const c of tree.childrenOf(n.id)) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [node, tree, roots]);

  if (!node) return null;
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
        <div className="space-y-1">
          {options.map(({ node: n, depth }) => {
            const current = n.id === node.parent_id;
            return (
              <button
                key={n.id}
                type="button"
                disabled={current}
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
