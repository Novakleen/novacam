import React, { useEffect, useRef, useState } from 'react';
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
import { createCaisseFromKit, ITEM_KINDS, nodeName, saveNode } from '@/lib/fleet/inventory';
import { NAVY, YELLOW } from './FleetUI';
import { NODE_ICONS } from './NodeIcon';

/** Admin: create a child under `parent`, or edit `node`. */
const NodeEditDialog = ({ open, onOpenChange, node, parent, kits = [], lang, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [kitId, setKitId] = useState('');
  const [saving, setSaving] = useState(false);
  // Values last auto-filled from a kit: only those (or empty fields) get replaced on the next pick.
  const autoFill = useRef({});

  useEffect(() => {
    if (!open) return;
    setKitId('');
    autoFill.current = {};
    setForm(
      node
        ? { ...node }
        : { kind: 'materiel', name: '', name_nl: '', name_en: '', qty: 1, serial: '', brand: '', model: '', notes: '', icon: '' }
    );
  }, [open, node]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const editableKind = !node || ITEM_KINDS.includes(node.kind);
  const caisseKits = kits.filter((k) => k.target_kind === 'caisse' && k.active !== false);
  const selectedKit = !node && form.kind === 'caisse' ? caisseKits.find((k) => k.id === kitId) || null : null;
  const canSave = Boolean(String(form.name || '').trim()) || Boolean(selectedKit);

  const pickKit = (k) => {
    setKitId(k.id);
    const next = k.id ? { name: k.name || '', name_nl: k.name_nl || '', name_en: k.name_en || '', icon: k.icon || '' } : { name: '', name_nl: '', name_en: '', icon: '' };
    const prev = autoFill.current;
    setForm((f) => {
      const out = { ...f };
      for (const key of Object.keys(next)) {
        const cur = f[key] || '';
        if (!cur || (prev[key] && cur === prev[key])) out[key] = next[key];
      }
      return out;
    });
    autoFill.current = next;
  };

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let saved;
      if (selectedKit) {
        const res = await createCaisseFromKit({ parentId: parent?.id, kit: selectedKit, fields: form });
        saved = res.saved;
        toast({ title: t('fleet.node.crateFromKit', { count: res.added, name: nodeName(saved, lang) }) });
      } else {
        saved = await saveNode({ ...form, parent_id: node ? node.parent_id : parent?.id });
        toast({ title: t('fleet.node.saved') });
      }
      onOpenChange(false);
      onDone?.(saved);
    } catch (err) {
      if (err?.code === 'KIT_APPLY_FAILED') {
        toast({ variant: 'destructive', title: t('fleet.node.kitApplyFailed'), description: err.message });
        onOpenChange(false);
        onDone?.(err.crate);
      } else {
        toast({ variant: 'destructive', title: t('fleet.node.saveFailed'), description: err.message });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{node ? t('fleet.node.editTitle') : t('fleet.node.addTitle')}</DialogTitle>
          <DialogDescription>{node ? nodeName(node, lang) : t('fleet.node.addIn', { name: nodeName(parent, lang) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {editableKind && (
            <div className="grid grid-cols-3 gap-2">
              {ITEM_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set('kind', k)}
                  className={cn('h-11 rounded-2xl border text-sm font-bold', form.kind === k ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
                  style={form.kind === k ? { backgroundColor: NAVY } : undefined}
                >
                  {t(`fleet.kinds.${k}`)}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 -mt-2">{t(`fleet.kindHints.${form.kind || 'materiel'}`)}</p>
          <div className="space-y-1.5">
            <Label>{t('fleet.node.name')} (FR)</Label>
            <Input className="h-11 rounded-xl" value={form.name || ''} placeholder={selectedKit ? selectedKit.name : undefined} onChange={(e) => set('name', e.target.value)} />
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
          {form.kind === 'materiel' && (
            <div className="space-y-1.5">
              <Label>{t('fleet.node.qty')}</Label>
              <Input type="number" min={0} className="h-11 rounded-xl" value={form.qty ?? 1} onChange={(e) => set('qty', e.target.value)} />
            </div>
          )}
          {form.kind === 'machine' && (
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
          {!node && form.kind === 'caisse' && caisseKits.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('fleet.node.prefillKit')}</Label>
              <div className="flex flex-wrap gap-2">
                {[{ id: '', name: t('fleet.node.noKit') }, ...caisseKits].map((k) => (
                  <button
                    key={k.id || 'none'}
                    type="button"
                    onClick={() => pickKit(k)}
                    className={cn('rounded-full border px-3 h-9 text-sm font-medium', kitId === k.id ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
                    style={kitId === k.id ? { backgroundColor: NAVY } : undefined}
                  >
                    {k.id ? nodeName(k, lang) : k.name}
                  </button>
                ))}
              </div>
              {selectedKit && <p className="text-xs text-gray-500">{t('fleet.node.kitPrefillHint')}</p>}
            </div>
          )}
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
