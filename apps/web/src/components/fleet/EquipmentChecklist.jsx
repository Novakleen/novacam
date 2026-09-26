import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cable,
  CircleDot,
  Container,
  Cylinder,
  Fence,
  Fuel,
  Gauge,
  HardHat,
  Link2,
  Loader2,
  RefreshCw,
  SprayCan,
  TrafficCone,
  Wrench,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { EQUIPMENT_STATUSES, setEquipmentStatus, templateName } from '@/lib/fleet/api';

export const EQUIPMENT_ICONS = {
  pump: Gauge,
  fuel: Fuel,
  spray: SprayCan,
  extension: Cable,
  sleeve: Cylinder,
  seal: CircleDot,
  wire: Fence,
  strap: Link2,
  ppe: HardHat,
  can: Container,
  cone: TrafficCone,
};

const CHIP = {
  ok: 'bg-emerald-500 text-white',
  missing: 'bg-amber-500 text-white',
  broken: 'bg-red-500 text-white',
};

const ROW_TINT = {
  ok: '',
  missing: 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20',
  broken: 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20',
};

/** Van kit checklist: one tap per state; note when broken; serial when serialized. */
const EquipmentChecklist = ({ items, canEdit, lang, onLocalChange, onResync, resyncing }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState(null);

  const save = async (item, patch) => {
    onLocalChange?.({ ...item, ...patch });
    setBusyId(item.id);
    try {
      const saved = await setEquipmentStatus(item.id, patch);
      onLocalChange?.({ ...item, ...saved });
    } catch (err) {
      onLocalChange?.(item); // revert
      toast({ variant: 'destructive', title: t('fleet.equipment.saveFailed'), description: err.message });
    } finally {
      setBusyId(null);
    }
  };

  if (!items.length) {
    return <p className="text-sm text-gray-500">{t('fleet.equipment.empty')}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = EQUIPMENT_ICONS[item.template.icon] || Wrench;
        return (
          <div
            key={item.id}
            className={cn(
              'rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 space-y-2',
              ROW_TINT[item.status]
            )}
          >
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </span>
              <span className="font-semibold flex-1 min-w-0 leading-tight">
                {templateName(item.template, lang)}
                {busyId === item.id && <Loader2 className="inline h-3.5 w-3.5 ml-2 animate-spin text-gray-400" />}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {EQUIPMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => item.status !== s && save(item, { status: s, note: s === 'broken' ? item.note : null })}
                  className={cn(
                    'h-10 rounded-xl text-sm font-bold transition-colors disabled:cursor-default',
                    item.status === s ? CHIP[s] : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  )}
                >
                  {t(`fleet.equipment.status.${s}`)}
                </button>
              ))}
            </div>
            {item.status === 'broken' && (
              <NoteField
                value={item.note || ''}
                placeholder={t('fleet.equipment.notePlaceholder')}
                disabled={!canEdit}
                onCommit={(v) => v !== (item.note || '') && save(item, { note: v || null })}
              />
            )}
            {item.template.is_serialized && (
              <NoteField
                value={item.serial || ''}
                placeholder={t('fleet.equipment.serialPlaceholder')}
                disabled={!canEdit}
                onCommit={(v) => v !== (item.serial || '') && save(item, { serial: v || null })}
              />
            )}
          </div>
        );
      })}
      {canEdit && onResync && (
        <Button variant="outline" className="w-full rounded-2xl h-11" onClick={onResync} disabled={resyncing}>
          {resyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {t('fleet.equipment.resync')}
        </Button>
      )}
    </div>
  );
};

const NoteField = ({ value, placeholder, disabled, onCommit }) => {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <Input
      className="h-10 rounded-xl"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
};

export default EquipmentChecklist;
