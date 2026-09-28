import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, Camera, CheckCircle2, Eye, Loader2, MessageSquare, Package, RotateCcw, Wrench } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  fetchTicketEvents,
  nodeName,
  signedPhotoUrls,
  ticketAction,
  uploadNodePhoto,
} from '@/lib/fleet/inventory';
import { firstName } from '@/lib/fleet/api';
import { CondPill, NAVY, YELLOW } from './FleetUI';
import CrateBadge from './LocationBadge';

function when(iso, lang) {
  return new Date(iso).toLocaleString(lang === 'nl' ? 'nl-BE' : lang === 'en' ? 'en-GB' : 'fr-BE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TicketSheet = ({ ticket, node, byId, pathLabel, isAdmin, canAct, profileById, lang, onClose, onChanged }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [urls, setUrls] = useState({});
  const [note, setNote] = useState('');
  const [cost, setCost] = useState(ticket?.repair_cost ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const ev = await fetchTicketEvents(ticket.id);
      setEvents(ev);
      setUrls(await signedPhotoUrls(ev.map((e) => e.photo_path)));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (ticket) {
      setNote('');
      setCost(ticket.repair_cost ?? '');
      load();
    }
  }, [ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket) return null;
  const closed = ticket.status === 'resolu';

  const run = async (action, opts = {}) => {
    setBusy(true);
    try {
      await ticketAction(ticket.id, action, { note: note || null, ...opts });
      setNote('');
      await load();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.ticket.failed'), description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async (file) => {
    setBusy(true);
    try {
      const path = await uploadNodePhoto(ticket.node_id, file);
      await ticketAction(ticket.id, 'photo', { photoPath: path, note: note || null });
      setNote('');
      await load();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.ticket.failed'), description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const eventLabel = (e) => {
    switch (e.kind) {
      case 'created':
        return t('fleet.ticket.ev.created', { sev: t(`fleet.cond.${e.to_value}`) });
      case 'severity':
        return t('fleet.ticket.ev.severity', { from: t(`fleet.cond.${e.from_value}`), to: t(`fleet.cond.${e.to_value}`) });
      case 'status': {
        const [st, res] = String(e.to_value || '').split(':');
        return res ? t('fleet.ticket.ev.resolved', { res: t(`fleet.resolutions.${res}`) }) : t('fleet.ticket.ev.status', { to: t(`fleet.status.${st}`) });
      }
      case 'cost':
        return t('fleet.ticket.ev.cost', { cost: Number(e.cost || 0).toFixed(2) });
      case 'photo':
        return t('fleet.ticket.ev.photo');
      default:
        return t('fleet.ticket.ev.comment');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {nodeName(node, lang)}
            <CondPill condition={ticket.severity} label={t(`fleet.cond.${ticket.severity}`)} />
          </DialogTitle>
          <DialogDescription>
            {pathLabel}
            {ticket.qty_affected > 1 && ` · ${t('fleet.ticket.qty', { count: ticket.qty_affected })}`}
          </DialogDescription>
          <CrateBadge node={node} byId={byId} lang={lang} t={t} className="self-start" />
        </DialogHeader>

        {/* Status track */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {['signale', 'vu', ticket.status === 'commande' ? 'commande' : 'en_reparation', 'resolu'].map((s, i, arr) => {
            const idx = arr.indexOf(ticket.status === 'commande' ? 'commande' : ticket.status);
            const done = i <= idx;
            return (
              <React.Fragment key={s}>
                <span
                  className="shrink-0 rounded-full px-3 h-8 inline-flex items-center text-xs font-bold"
                  style={done ? { backgroundColor: NAVY, color: YELLOW } : { backgroundColor: '#e5e7eb', color: '#6b7280' }}
                >
                  {t(`fleet.status.${s}`)}
                </span>
                {i < arr.length - 1 && <span className="h-0.5 w-3 shrink-0 bg-gray-300" />}
              </React.Fragment>
            );
          })}
        </div>
        {closed && ticket.resolution && (
          <p className="text-sm font-semibold text-emerald-700">
            {t(`fleet.resolutions.${ticket.resolution}`)}
            {ticket.repair_cost != null && ` · ${Number(ticket.repair_cost).toFixed(2)} €`}
          </p>
        )}

        {/* History */}
        <ol className="space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full" style={{ backgroundColor: e.kind === 'status' && String(e.to_value).startsWith('resolu') ? '#10b981' : NAVY }} />
              <p className="text-sm font-semibold">{eventLabel(e)}</p>
              <p className="text-xs text-gray-500">
                {when(e.created_at, lang)} · {firstName(profileById.get(e.created_by))}
              </p>
              {e.note && <p className="text-sm mt-0.5">{e.note}</p>}
              {e.photo_path && urls[e.photo_path] && (
                <a href={urls[e.photo_path]} target="_blank" rel="noreferrer">
                  <img src={urls[e.photo_path]} alt="" className="mt-1.5 h-28 rounded-xl object-cover" />
                </a>
              )}
            </li>
          ))}
        </ol>

        {canAct && (
          <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            <Textarea rows={2} className="rounded-xl" placeholder={t('fleet.ticket.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addPhoto(f);
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy || !note.trim()} onClick={() => run('comment')}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                {t('fleet.ticket.comment')}
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4 mr-1.5" />
                {t('fleet.ticket.addPhoto')}
              </Button>
              {!closed && ticket.severity === 'damaged_usable' && (
                <Button size="sm" className="rounded-full bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={() => run('escalate', { value: 'broken' })}>
                  <ArrowUpCircle className="h-4 w-4 mr-1.5" />
                  {t('fleet.ticket.escalate')}
                </Button>
              )}
              {!closed && !isAdmin && ticket.severity === 'missing' && (
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => run('resolve', { value: 'retrouve' })}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {t('fleet.resolutions.retrouve')}
                </Button>
              )}
            </div>
            {isAdmin && (
              <div className="space-y-2 rounded-2xl bg-gray-50 dark:bg-gray-900/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('fleet.ticket.adminActions')}</p>
                {!closed ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {ticket.status === 'signale' && (
                        <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => run('status', { value: 'vu' })}>
                          <Eye className="h-4 w-4 mr-1.5" />
                          {t('fleet.status.vu')}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="rounded-full" disabled={busy || ticket.status === 'en_reparation'} onClick={() => run('status', { value: 'en_reparation' })}>
                        <Wrench className="h-4 w-4 mr-1.5" />
                        {t('fleet.status.en_reparation')}
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full" disabled={busy || ticket.status === 'commande'} onClick={() => run('status', { value: 'commande' })}>
                        <Package className="h-4 w-4 mr-1.5" />
                        {t('fleet.status.commande')}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input type="number" min={0} step="0.01" placeholder={t('fleet.ticket.cost')} className="h-9 w-32 rounded-xl" value={cost ?? ''} onChange={(e) => setCost(e.target.value)} />
                      {['repare', 'remplace', ...(ticket.severity === 'missing' ? ['retrouve'] : [])].map((r) => (
                        <Button
                          key={r}
                          size="sm"
                          className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={busy}
                          onClick={() => run('resolve', { value: r, cost: cost === '' ? null : cost })}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          {t(`fleet.resolutions.${r}`)}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => run('reopen')}>
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    {t('fleet.ticket.reopen')}
                  </Button>
                )}
              </div>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TicketSheet;
