import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { saveVan } from '@/lib/fleet/api';
import { NAVY, YELLOW } from './FleetUI';

const VanEditDialog = ({ open, onOpenChange, van, nextSort = 0, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', plate: '', active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: van?.name || '', plate: van?.plate || '', active: van ? van.active !== false : true });
  }, [open, van]);

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const saved = await saveVan({ ...form, id: van?.id, sort: nextSort });
      toast({ title: t('fleet.van.saved') });
      onOpenChange(false);
      onDone?.(saved);
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.van.saveFailed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{van ? t('fleet.van.editTitle') : t('fleet.van.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('fleet.van.name')}</Label>
            <Input className="h-11 rounded-xl" value={form.name} placeholder="Van Martin" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fleet.van.plate')}</Label>
            <Input className="h-11 rounded-xl uppercase" value={form.plate} placeholder="1-ABC-123" onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))} />
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 px-4 h-12">
            <span className="font-medium">{t('fleet.van.active')}</span>
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </label>
          {!van && <p className="text-xs text-gray-500">{t('fleet.van.createHint')}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VanEditDialog;
