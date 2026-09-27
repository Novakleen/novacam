import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { nodeName, reportDamage, SEVERITIES, uploadNodePhoto } from '@/lib/fleet/inventory';
import { NAVY, YELLOW } from './FleetUI';

const SEV_STYLE = {
  damaged_usable: 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200',
  broken: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200',
  missing: 'border-gray-300 bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};
const SEV_DOT = { damaged_usable: 'bg-yellow-400', broken: 'bg-red-500', missing: 'bg-gray-400' };

/** 3 taps: (item already tapped) → severity → send. Photo + note optional. */
const ReportDialog = ({ open, onOpenChange, node, lang, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [severity, setSeverity] = useState('');
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setSeverity('');
      setNote('');
      setQty(1);
      setFiles([]);
    }
  }, [open]);

  if (!node) return null;
  const multi = node.kind === 'materiel' && Number(node.qty) > 1;

  const submit = async () => {
    if (!severity) return;
    setSaving(true);
    try {
      const paths = [];
      for (const f of files) paths.push(await uploadNodePhoto(node.id, f));
      await reportDamage({ nodeId: node.id, severity, note, qty: multi ? qty : 1, photoPaths: paths });
      toast({ title: t('fleet.report.sent'), description: nodeName(node, lang) });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.report.failed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('fleet.report.title')}</DialogTitle>
          <DialogDescription className="font-semibold">{nodeName(node, lang)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border-2 px-4 h-16 text-left transition-all',
                  SEV_STYLE[s],
                  severity === s ? 'ring-4 ring-offset-1 ring-[#0b1f4d]/30 scale-[1.01]' : 'opacity-80'
                )}
              >
                <span className={cn('h-5 w-5 rounded-full shrink-0', SEV_DOT[s])} />
                <span>
                  <span className="block font-black">{t(`fleet.cond.${s}`)}</span>
                  <span className="block text-xs opacity-80">{t(`fleet.report.hint.${s}`)}</span>
                </span>
              </button>
            ))}
          </div>

          {multi && (
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 px-4 h-12">
              <span className="text-sm font-medium">{t('fleet.report.qty', { total: node.qty })}</span>
              <Input
                type="number"
                min={1}
                max={node.qty}
                className="h-9 w-20 rounded-xl text-center"
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(Number(node.qty), Number(e.target.value) || 1)))}
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFiles((prev) => [...prev, f].slice(0, 4));
                e.target.value = '';
              }}
            />
            <Button type="button" variant="outline" className="rounded-full h-11" onClick={() => inputRef.current?.click()}>
              <Camera className="h-4 w-4 mr-2" />
              {t('fleet.report.photo')}
            </Button>
            {files.map((f, i) => (
              <span key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt="" className="h-11 w-11 rounded-xl object-cover" />
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gray-900 text-white flex items-center justify-center"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Textarea rows={2} className="rounded-xl" placeholder={t('fleet.report.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-12 px-6 font-black" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={!severity || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fleet.report.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
