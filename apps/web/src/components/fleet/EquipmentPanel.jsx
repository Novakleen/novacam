import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, Pencil, Plus, Wrench } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { saveTemplate, templateName } from '@/lib/fleet/api';
import { NAVY, SectionCard, VanPictogram, YELLOW } from './FleetUI';
import { EQUIPMENT_ICONS } from './EquipmentChecklist';
import { KitChip } from './FleetOverview';

/** Matériel tab: kit status per van (tap → van sheet) + global template editor (admin). */
const EquipmentPanel = ({ data, index, isAdmin, onOpenVan, onReload }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const [editing, setEditing] = useState(null); // template row or {} for new

  const vans = data.vans.filter((v) => isAdmin || index.locationByVan.get(v.id));

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {vans.map((van) => {
          const items = index.vanEquipment(van.id);
          const issues = index.equipmentIssues(van.id);
          const bad = items.filter((i) => i.status !== 'ok');
          return (
            <button
              key={van.id}
              type="button"
              onClick={() => onOpenVan(van.id)}
              className="text-left rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center gap-3">
                <VanPictogram photoUrl={van.photo_url} className="h-11 w-11" />
                <span className="font-black text-lg flex-1 truncate">{van.name}</span>
                <KitChip count={issues.broken + issues.missing} broken={issues.broken} t={t} />
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </div>
              {bad.length > 0 && (
                <ul className="space-y-1">
                  {bad.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-sm">
                      <span className={cn('h-2.5 w-2.5 rounded-full', i.status === 'broken' ? 'bg-red-500' : 'bg-amber-500')} />
                      <span className="font-medium">{templateName(i.template, lang)}</span>
                      <span className="text-gray-500">· {t(`fleet.equipment.status.${i.status}`)}</span>
                      {i.note && <span className="text-gray-400 italic truncate">« {i.note} »</span>}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {isAdmin && (
        <SectionCard
          title={t('fleet.template.title')}
          icon={Wrench}
          action={
            <Button size="sm" className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => setEditing({})}>
              <Plus className="h-4 w-4 mr-1" />
              {t('fleet.template.add')}
            </Button>
          }
        >
          <p className="text-sm text-gray-500">{t('fleet.template.hint')}</p>
          <div className="space-y-2">
            {data.templates.map((tpl) => {
              const Icon = EQUIPMENT_ICONS[tpl.icon] || Wrench;
              return (
                <div
                  key={tpl.id}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 h-14',
                    tpl.active === false && 'opacity-50'
                  )}
                >
                  <Icon className="h-5 w-5 text-gray-500" />
                  <span className="flex-1 font-medium truncate">{templateName(tpl, lang)}</span>
                  {tpl.is_serialized && (
                    <span className="text-[11px] rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5">{t('fleet.template.serialized')}</span>
                  )}
                  <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setEditing(tpl)} aria-label={t('common.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {editing && (
        <TemplateDialog
          tpl={editing}
          nextSort={(data.templates.reduce((m, x) => Math.max(m, x.sort || 0), 0) || 0) + 10}
          onClose={() => setEditing(null)}
          onDone={onReload}
        />
      )}
    </div>
  );
};

const TemplateDialog = ({ tpl, nextSort, onClose, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name_fr: tpl.name_fr || '',
    name_nl: tpl.name_nl || '',
    name_en: tpl.name_en || '',
    is_serialized: Boolean(tpl.is_serialized),
    active: tpl.active !== false,
    sort: tpl.sort ?? nextSort,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name_fr.trim()) return;
    setSaving(true);
    try {
      await saveTemplate({ ...form, id: tpl.id, icon: tpl.icon });
      toast({ title: t('fleet.template.saved') });
      onClose();
      onDone?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.template.saveFailed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{tpl.id ? t('fleet.template.edit') : t('fleet.template.add')}</DialogTitle>
          <DialogDescription>{t('fleet.template.resyncHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {[
            ['name_fr', 'FR'],
            ['name_nl', 'NL'],
            ['name_en', 'EN'],
          ].map(([k, l]) => (
            <div key={k} className="space-y-1.5">
              <Label>{t('fleet.template.name')} ({l})</Label>
              <Input className="h-11 rounded-xl" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <label className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 px-4 h-12">
            <span className="font-medium">{t('fleet.template.serializedLabel')}</span>
            <Switch checked={form.is_serialized} onCheckedChange={(v) => setForm((f) => ({ ...f, is_serialized: v }))} />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 px-4 h-12">
            <span className="font-medium">{t('fleet.template.active')}</span>
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={saving || !form.name_fr.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EquipmentPanel;
