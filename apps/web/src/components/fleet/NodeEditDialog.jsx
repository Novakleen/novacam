import React, { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { ITEM_KINDS, crateError, nodeName, saveNode } from '@/lib/fleet/inventory';
import { NAVY, YELLOW } from './FleetUI';
import NodeIcon, { NODE_ICONS } from './NodeIcon';

/**
 * Admin: edit an existing node.
 * v1.10.0: zones keep a free name / icon; caisses, machines and materiel are catalog articles —
 * only their per-instance fields (quantity, serial, brand, model, notes) are editable here.
 * Creating items goes through PlaceArticleDialog (pick from the catalog).
 */
const NodeEditDialog = ({ open, onOpenChange, node, locked = false, lang, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && node) setForm({ ...node });
  }, [open, node]);

  if (!node) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isItem = ITEM_KINDS.includes(node.kind);
  const canSave = isItem || Boolean(String(form.name || '').trim());

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await saveNode(form);
      toast({ title: t('fleet.node.saved') });
      onOpenChange(false);
      onDone?.(saved);
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.node.saveFailed'), description: crateError(err, t) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('fleet.node.editTitle')}</DialogTitle>
          <DialogDescription>{nodeName(node, lang)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isItem ? (
            <div className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 p-3">
              <NodeIcon node={node} />
              <div className="min-w-0">
                <p className="font-bold truncate">{nodeName(node, lang)}</p>
                <p className="text-xs text-gray-500">{t(`fleet.kinds.${node.kind}`)} · {t('fleet.articles.managedInCatalog')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>{t('fleet.node.name')} (FR)</Label>
                <Input className="h-11 rounded-xl" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>NL</Label>
                  <Input className="h-11 rounded-xl" value={form.name_nl || ''} onChange={(e) => set('name_nl', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>EN</Label>
                  <Input className="h-11 rounded-xl" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fleet.node.icon')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(NODE_ICONS).map(([key, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set('icon', form.icon === key ? '' : key)}
                      className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', form.icon === key ? 'border-transparent' : 'border-gray-200 dark:border-gray-700')}
                      style={form.icon === key ? { backgroundColor: NAVY, color: YELLOW } : undefined}
                      aria-label={key}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* v1.12.0: the quantity of a crate item comes from the catalog standard contents */}
          {node.kind === 'materiel' && !locked && (
            <div className="space-y-1.5">
              <Label>{t('fleet.node.qty')}</Label>
              <Input type="number" min={0} className="h-11 rounded-xl" value={form.qty ?? 1} onChange={(e) => set('qty', e.target.value)} />
            </div>
          )}
          {node.kind === 'machine' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>{t('fleet.node.serial')}</Label>
                <Input className="h-11 rounded-xl" value={form.serial || ''} onChange={(e) => set('serial', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fleet.node.brand')}</Label>
                <Input className="h-11 rounded-xl" value={form.brand || ''} onChange={(e) => set('brand', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fleet.node.model')}</Label>
                <Input className="h-11 rounded-xl" value={form.model || ''} onChange={(e) => set('model', e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('fleet.node.notes')}</Label>
            <Textarea rows={2} className="rounded-xl" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={saving || !canSave}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NodeEditDialog;
