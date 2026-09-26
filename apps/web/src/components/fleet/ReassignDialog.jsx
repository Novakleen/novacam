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
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { initialsOf, personName, reassignVan, todayISO } from '@/lib/fleet/api';
import { Avatarish, NAVY, YELLOW } from './FleetUI';

const NONE = '__none__';

const ReassignDialog = ({ open, onOpenChange, van, currentUserId, profiles, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [userId, setUserId] = useState('');
  const [start, setStart] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUserId(currentUserId || '');
      setStart(todayISO());
    }
  }, [open, currentUserId]);

  const people = [...profiles]
    .filter((p) => p.role !== 'Viewer')
    .sort((a, b) => personName(a).localeCompare(personName(b), 'fr'));

  const submit = async () => {
    setSaving(true);
    try {
      await reassignVan(van.id, userId === NONE ? null : userId, start);
      toast({ title: t('fleet.reassign.saved') });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.reassign.failed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const Option = ({ id, children }) => (
    <button
      type="button"
      onClick={() => setUserId(id)}
      className={cn(
        'w-full flex items-center gap-3 rounded-2xl border px-3 h-14 text-left',
        userId === id ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
      )}
      style={userId === id ? { backgroundColor: NAVY } : undefined}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('fleet.reassign.title', { van: van?.name })}</DialogTitle>
          <DialogDescription>{t('fleet.reassign.desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {people.map((p) => (
              <Option key={p.id} id={p.id}>
                <Avatarish initials={initialsOf(p)} />
                <span className="font-semibold truncate">{personName(p)}</span>
                {p.id === currentUserId && (
                  <span className="ml-auto text-xs rounded-full px-2 py-0.5" style={{ backgroundColor: YELLOW, color: NAVY }}>
                    {t('fleet.reassign.current')}
                  </span>
                )}
              </Option>
            ))}
            <Option id={NONE}>
              <span className="font-semibold">{t('fleet.reassign.nobody')}</span>
            </Option>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fleet.reassign.startDate')}</Label>
            <Input type="date" className="h-11 rounded-xl" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            className="rounded-full h-11 px-6 font-bold"
            style={{ backgroundColor: YELLOW, color: NAVY }}
            onClick={submit}
            disabled={saving || !userId || !start || (userId === currentUserId && Boolean(currentUserId))}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fleet.reassign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReassignDialog;
