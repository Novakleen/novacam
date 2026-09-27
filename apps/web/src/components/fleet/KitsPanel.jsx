import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { applyKit, deleteKitItem, nodeName, saveKit, saveKitItem, ZONE_KEYS } from '@/lib/fleet/inventory';
import { NAVY, SectionCard, YELLOW } from './FleetUI';
import NodeIcon, { NODE_ICONS } from './NodeIcon';
import useConfirm from './useConfirm';
import { DEFAULT_ZONE_GEOM } from './VanSvg';

const KIT_KINDS = ['zone', 'caisse', 'machine', 'materiel'];

/** Admin: kit templates (prefill a new van / caisse; resync adds missing items only). */
const KitsPanel = ({ data, index, onReload }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lang = index.lang;
  const [kitId, setKitId] = useState(data.kits.find((k) => k.is_default)?.id || data.kits[0]?.id || '');
  const [itemDlg, setItemDlg] = useState(null);
  const [kitDlg, setKitDlg] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const kit = data.kits.find((k) => k.id === kitId) || null;
  const items = useMemo(() => data.kitItems.filter((i) => i.kit_id === kitId), [data.kitItems, kitId]);
  const childrenOf = (pid) => items.filter((i) => (i.parent_item_id || null) === pid).sort((a, b) => a.sort - b.sort);

  const vansRoots = data.vans
    .map((v) => ({ van: v, node: index.tree.byId.get(index.locationByVan.get(v.id)?.id) }))
    .filter((x) => x.node);

  const resyncVan = async (node) => {
    setBusy(node.id);
    try {
      const n = await applyKit(node.id, kit.id);
      toast({ title: t('fleet.kits.resyncedVan', { count: n, name: node.name }) });
      onReload();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.kits.failed'), description: err.message });
    } finally {
      setBusy('');
    }
  };

  const descendantsOf = (id) => {
    const out = [];
    const walk = (pid) => items.filter((i) => i.parent_item_id === pid).forEach((c) => { out.push(c); walk(c.id); });
    walk(id);
    return out;
  };

  const removeItem = async (item) => {
    const name = nodeName(item, lang);
    const children = descendantsOf(item.id);
    const lines = [];
    if (children.length) lines.push(t('fleet.kits.deleteChildren', { count: children.length }));
    lines.push(t('fleet.kits.deleteKeepsVans'));
    const ok = await confirm({ title: t('fleet.kits.confirmDelete', { name }), description: lines.join('\n\n') });
    if (!ok) return;
    try {
      await deleteKitItem(item.id);
      toast({ title: t('fleet.kits.deleted', { name }) });
      onReload();
    } catch (err) {
      const description = err?.code === 'KIT_ITEM_NOT_DELETED' || err?.code === '42501' ? t('fleet.kits.deleteNotAllowed') : err?.message;
      toast({ variant: 'destructive', title: t('fleet.kits.failed'), description });
    }
  };

  const renderItems = (pid, depth) =>
    childrenOf(pid).map((it) => (
      <React.Fragment key={it.id}>
        <div className="flex items-center gap-2 rounded-2xl border border-gray-100 dark:border-gray-800 p-2" style={{ marginLeft: depth * 20 }}>
          <NodeIcon node={it} className="h-9 w-9" />
          <div className="flex-1 min-w-0">
            <p className={cn('font-semibold truncate', it.active === false && 'line-through text-gray-400')}>{nodeName(it, lang)}</p>
            <p className="text-xs text-gray-500">
              {t(`fleet.kinds.${it.kind}`)}
              {it.kind === 'materiel' && ` · × ${it.qty}`}
            </p>
          </div>
          {it.kind !== 'materiel' && (
            <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setItemDlg({ kit_id: kitId, parent_item_id: it.id, kind: 'materiel', qty: 1 })} aria-label={t('fleet.inv.add')}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setItemDlg(it)} aria-label={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="rounded-full text-red-600" onClick={() => removeItem(it)} aria-label={t('common.delete')}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {renderItems(it.id, depth + 1)}
      </React.Fragment>
    ));

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <p className="text-sm text-gray-500">{t('fleet.kits.intro')}</p>
      <div className="flex gap-2 flex-wrap">
        {data.kits.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKitId(k.id)}
            className={cn('rounded-full px-4 h-10 text-sm font-bold border', kitId === k.id ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
            style={kitId === k.id ? { backgroundColor: NAVY } : undefined}
          >
            {nodeName(k, lang)}
            <span className="ml-1.5 text-xs opacity-70">· {t(`fleet.kits.target.${k.target_kind}`)}</span>
          </button>
        ))}
        <Button variant="outline" className="rounded-full h-10" onClick={() => setKitDlg({ target_kind: 'caisse' })}>
          <Plus className="h-4 w-4 mr-1" />
          {t('fleet.kits.new')}
        </Button>
      </div>

      {kit && (
        <SectionCard
          title={nodeName(kit, lang)}
          action={
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setKitDlg(kit)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => setItemDlg({ kit_id: kitId, parent_item_id: null, kind: kit.target_kind === 'van' ? 'zone' : 'materiel', qty: 1 })}>
                <Plus className="h-4 w-4 mr-1" />
                {t('fleet.inv.add')}
              </Button>
            </div>
          }
        >
          {kit.is_default && <p className="text-xs text-gray-500">{t('fleet.kits.defaultHint')}</p>}
          <div className="space-y-1.5">{renderItems(null, 0)}</div>
          {items.length === 0 && <p className="text-sm text-gray-500">{t('fleet.kits.empty')}</p>}
          {kit.target_kind === 'van' && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('fleet.kits.applyToVans')}</p>
              <div className="flex flex-wrap gap-2">
                {vansRoots.map(({ van, node }) => (
                  <Button key={van.id} size="sm" variant="outline" className="rounded-full" disabled={busy === node.id} onClick={() => resyncVan(node)}>
                    {busy === node.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
                    {van.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {kit.target_kind === 'caisse' && <p className="text-xs text-gray-500">{t('fleet.kits.caisseHint')}</p>}
        </SectionCard>
      )}

      {confirmDialog}
      <KitItemDialog value={itemDlg} items={items} lang={lang} onClose={() => setItemDlg(null)} onDone={onReload} />
      <KitDialog value={kitDlg} onClose={() => setKitDlg(null)} onDone={(k) => { if (k?.id) setKitId(k.id); onReload(); }} />
    </div>
  );
};

const KitDialog = ({ value, onClose, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  useEffect(() => setForm(value || {}), [value]);
  if (!value) return null;
  const submit = async () => {
    try {
      const saved = await saveKit(form);
      onClose();
      onDone(saved);
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.kits.failed'), description: err.message });
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{value.id ? t('fleet.kits.edit') : t('fleet.kits.new')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('fleet.node.name')} (FR)</Label>
            <Input className="h-11 rounded-xl" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input className="h-11 rounded-xl" placeholder="NL" value={form.name_nl || ''} onChange={(e) => setForm({ ...form, name_nl: e.target.value })} />
            <Input className="h-11 rounded-xl" placeholder="EN" value={form.name_en || ''} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          </div>
          {!value.id && (
            <div className="grid grid-cols-2 gap-2">
              {['caisse', 'van'].map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, target_kind: k })} className={cn('h-11 rounded-2xl border font-bold text-sm', form.target_kind === k ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')} style={form.target_kind === k ? { backgroundColor: NAVY } : undefined}>
                  {t(`fleet.kits.target.${k}`)}
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} disabled={!String(form.name || '').trim()} onClick={submit}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const KitItemDialog = ({ value, items, lang, onClose, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  useEffect(() => setForm(value || {}), [value]);
  if (!value) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const parents = items.filter((i) => i.kind !== 'materiel' && i.id !== form.id);
  const submit = async () => {
    try {
      const def = form.kind === 'zone' && !(form.plan_w > 0) ? DEFAULT_ZONE_GEOM[form.zone_key] || { x: 60, y: 120, w: 40, h: 40 } : null;
      await saveKitItem(def ? { ...form, plan_x: def.x, plan_y: def.y, plan_w: def.w, plan_h: def.h } : form);
      onClose();
      onDone();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.kits.failed'), description: err.message });
    }
  };
  const valid = String(form.name || '').trim();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{value.id ? t('fleet.kits.editItem') : t('fleet.kits.addItem')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {KIT_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => set('kind', k)} className={cn('h-10 rounded-xl border text-xs font-bold', form.kind === k ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')} style={form.kind === k ? { backgroundColor: NAVY } : undefined}>
                {t(`fleet.kinds.${k}`)}
              </button>
            ))}
          </div>
          {form.kind === 'zone' && (
            <div className="flex flex-wrap gap-1.5">
              {ZONE_KEYS.map((z) => (
                <button key={z} type="button" onClick={() => set('zone_key', form.zone_key === z ? null : z)} className={cn('rounded-full px-3 h-9 text-xs font-semibold border', form.zone_key === z ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')} style={form.zone_key === z ? { backgroundColor: NAVY } : undefined}>
                  {t(`fleet.zones.${z}`)}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('fleet.node.name')} (FR)</Label>
            <Input className="h-11 rounded-xl" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input className="h-11 rounded-xl" placeholder="NL" value={form.name_nl || ''} onChange={(e) => set('name_nl', e.target.value)} />
            <Input className="h-11 rounded-xl" placeholder="EN" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} />
          </div>
          {form.kind === 'materiel' && (
            <div className="space-y-1.5">
              <Label>{t('fleet.node.qty')}</Label>
              <Input type="number" min={1} className="h-11 rounded-xl" value={form.qty ?? 1} onChange={(e) => set('qty', e.target.value)} />
            </div>
          )}
          {form.kind !== 'zone' && parents.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('fleet.kits.parent')}</Label>
              <select className="h-11 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3" value={form.parent_item_id || ''} onChange={(e) => set('parent_item_id', e.target.value || null)}>
                <option value="">{t('fleet.kits.topLevel')}</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nodeName(p, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(NODE_ICONS).map(([key, Icon]) => (
              <button key={key} type="button" onClick={() => set('icon', form.icon === key ? '' : key)} className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', form.icon === key ? 'border-transparent' : 'border-gray-200 dark:border-gray-700')} style={form.icon === key ? { backgroundColor: NAVY, color: YELLOW } : undefined} aria-label={key}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>{t('fleet.kits.sort')}</Label>
            <Input type="number" className="h-11 rounded-xl" value={form.sort ?? 0} onChange={(e) => set('sort', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} disabled={!valid} onClick={submit}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default KitsPanel;
