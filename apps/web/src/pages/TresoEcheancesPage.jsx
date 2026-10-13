import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TresoSubnav from '@/components/treso/TresoSubnav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { deleteCashEvent, insertCashEvent, saveCommitment, updateCashEvent } from '@/lib/treso/mutations';
import { listOpenSupplierBills, openSupplierPdf, saveSupplierDueDate } from '@/lib/treso/pdf';
import { parseAmount } from '@/lib/treso/screen';

const COMMITMENT_COLUMNS = 'id, label, amount, amount_rule, day_of_month, next_due_date, is_active, needs_review, spread_weekly';
const EVENT_COLUMNS = 'id, event_date, label, amount, direction, category, excluded_from_cash';

function iso(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

const TresoEcheancesPage = ({ preview = null }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [commitments, setCommitments] = useState(preview?.commitments ?? []);
  const [events, setEvents] = useState(preview?.events ?? []);
  const [bills, setBills] = useState(preview?.supplierBills ?? []);
  const [loading, setLoading] = useState(!preview);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    Promise.all([
      supabase.from('treso_commitments').select(COMMITMENT_COLUMNS).order('label'),
      supabase.from('treso_cash_events').select(EVENT_COLUMNS).order('event_date'),
      listOpenSupplierBills().catch((error) => {
        console.error(error);
        return [];
      }),
    ]).then(([commitmentResult, eventResult, supplierBills]) => {
      if (cancelled) return;
      if (commitmentResult.error || eventResult.error) {
        setFailed(true);
        return;
      }
      setCommitments(commitmentResult.data || []);
      setEvents(eventResult.data || []);
      setBills(supplierBills);
    }).catch((error) => {
      console.error(error);
      if (!cancelled) setFailed(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const saveRow = async (id, patch) => {
    try {
      if (!preview) await saveCommitment(id, patch);
      setCommitments((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      toast({ title: t('treso.saved') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
    }
  };

  const addEvent = async (row) => {
    try {
      if (preview) {
        setEvents((current) => [...current, { id: `local-${Date.now()}`, category: 'autre', excluded_from_cash: false, ...row }]);
      } else {
        const created = await insertCashEvent({ ...row, category: 'autre' });
        setEvents((current) => [...current, created].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))));
      }
      toast({ title: t('treso.saved') });
      return true;
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
      return false;
    }
  };

  const saveEvent = async (id, patch) => {
    try {
      if (!preview) await updateCashEvent(id, patch);
      setEvents((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      toast({ title: t('treso.saved') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
    }
  };

  const saveBill = async (id, dueDate) => {
    try {
      if (!preview) await saveSupplierDueDate(id, dueDate);
      setBills((rows) => rows.map((row) => (
        row.id === id ? { ...row, due_date: dueDate, due_date_source: 'manuel' } : row
      )));
      toast({ title: t('treso.saved') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
    }
  };

  const openPdf = async (path) => {
    if (preview || !path) {
      toast({ title: t('treso.pdfDemo') });
      return;
    }
    try {
      await openSupplierPdf(path);
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.actionFailed') });
    }
  };

  const removeEvent = async (id) => {
    try {
      if (!preview) await deleteCashEvent(id);
      setEvents((rows) => rows.filter((row) => row.id !== id));
      toast({ title: t('treso.saved') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.saveFailed') });
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.commitmentsTitle')} - Novakleen</title>
      </Helmet>
      <div className="min-w-0 max-w-3xl space-y-4" data-testid="treso-echeances">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Landmark className="h-7 w-7 shrink-0 text-primary" />
            {t('treso.commitmentsTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('treso.commitmentsHint')}</p>
        </div>
        <TresoSubnav active="commitments" />

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}
        {failed && <p className="text-sm text-red-600">{t('treso.loadFailed')}</p>}

        <ul className="space-y-3">
          {commitments.map((row) => (
            <CommitmentEditor key={row.id} row={row} onSave={saveRow} />
          ))}
        </ul>

        <section className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('treso.suppliersTitle')}</h2>
            <p className="text-sm text-gray-500">{t('treso.suppliersHint')}</p>
          </div>
          <ul className="space-y-3">
            {bills.map((row) => (
              <SupplierBillEditor key={row.id} row={row} onSave={saveBill} onOpen={openPdf} />
            ))}
          </ul>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('treso.eventsTitle')}</h2>
            <p className="text-sm text-gray-500">{t('treso.eventsHint')}</p>
          </div>
          <EventCreator onCreate={addEvent} />
          <ul className="space-y-3">
            {events.map((row) => (
              <EventEditor key={row.id} row={row} onSave={saveEvent} onRemove={removeEvent} />
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
};

const SOURCE_KEY = {
  manuel: 'sourceManual',
  pdf: 'sourcePdf',
  export: 'sourceExport',
  estimee: 'sourceEstimated',
};

function SupplierBillEditor({ row, onSave, onOpen }) {
  const { t, i18n } = useTranslation();
  const [due, setDue] = useState(iso(row.due_date));
  const [busy, setBusy] = useState(false);
  const sourceKey = SOURCE_KEY[row.due_date_source] || 'sourceEstimated';
  const amount = Number(row.amount_ttc);
  const locale = i18n.language?.startsWith('nl') ? 'nl-BE' : i18n.language?.startsWith('en') ? 'en-GB' : 'fr-BE';
  const money = Number.isFinite(amount)
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount)
    : '—';

  const save = async () => {
    if (!due) return;
    setBusy(true);
    try {
      await onSave(row.id, due);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words font-medium text-gray-900 dark:text-white">{row.supplier_name || '—'}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {t(`treso.${sourceKey}`)}
        </span>
        <span className="text-sm tabular-nums text-gray-500">{money}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label={t('treso.proposedDue')}>
          <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="min-w-0" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={save} disabled={busy || !due}>
            {busy ? t('treso.saving') : t('treso.save')}
          </Button>
          {row.pdf_path && (
            <Button type="button" size="sm" variant="outline" onClick={() => onOpen(row.pdf_path)}>
              {t('treso.pdfOpen')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function Field({ label, children }) {
  return (
    <label className="min-w-0 space-y-1 text-sm">
      <span className="text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function CommitmentEditor({ row, onSave }) {
  const { t } = useTranslation();
  const computed = row.amount_rule === 'danny' || row.amount_rule === 'precompte';
  const [amount, setAmount] = useState(row.amount ?? '');
  const [day, setDay] = useState(row.day_of_month ?? '');
  const [next, setNext] = useState(iso(row.next_due_date));
  const [active, setActive] = useState(row.is_active !== false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch = {
      day_of_month: day === '' ? null : Number(day),
      next_due_date: next || null,
      is_active: active,
    };
    if (!computed) {
      const parsed = amount === '' ? null : parseAmount(amount);
      if (amount !== '' && parsed == null) return;
      patch.amount = parsed;
    }
    setBusy(true);
    try {
      await onSave(row.id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-2xl border border-gray-100 p-3 dark:border-gray-800 sm:p-4 ${active ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 opacity-80 dark:bg-gray-900/60'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words font-medium text-gray-900 dark:text-white">{row.label}</h3>
        {row.needs_review && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{t('treso.reviewBadge')}</span>
        )}
        {row.spread_weekly && <span className="text-xs text-gray-500">{t('treso.spreadNote')}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t('treso.fieldAmount')}>
          {computed ? (
            <p className="flex h-11 items-center text-sm text-gray-500">{t('treso.computedAmount')}</p>
          ) : (
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0" />
          )}
        </Field>
        <Field label={t('treso.fieldDay')}>
          <Input inputMode="numeric" value={day} onChange={(event) => setDay(event.target.value)} className="min-w-0" />
        </Field>
        <Field label={t('treso.fieldNext')}>
          <Input type="date" value={next} onChange={(event) => setNext(event.target.value)} className="min-w-0" />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <Switch checked={active} onCheckedChange={setActive} aria-label={t('treso.fieldActive')} />
          {t('treso.fieldActive')}
        </label>
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy ? t('treso.saving') : t('treso.save')}
        </Button>
      </div>
    </li>
  );
}

function EventCreator({ onCreate }) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('out');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const parsed = parseAmount(amount);
    if (!date || !label.trim() || parsed == null || parsed === 0) return;
    setBusy(true);
    const ok = await onCreate({
      event_date: date,
      label: label.trim(),
      amount: Math.abs(parsed),
      direction,
    });
    setBusy(false);
    if (ok) {
      setDate('');
      setLabel('');
      setAmount('');
      setDirection('out');
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-dashed border-gray-200 p-3 sm:grid-cols-2 dark:border-gray-700">
      <Field label={t('treso.fieldDate')}>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0" required />
      </Field>
      <Field label={t('treso.fieldLabel')}>
        <Input value={label} onChange={(event) => setLabel(event.target.value)} className="min-w-0" required />
      </Field>
      <Field label={t('treso.fieldAmount')}>
        <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0" required />
      </Field>
      <Field label={t('treso.fieldDirection')}>
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          className="flex h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="out">{t('treso.dirOut')}</option>
          <option value="in">{t('treso.dirIn')}</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? t('treso.saving') : t('treso.add')}</Button>
      </div>
    </form>
  );
}

function EventEditor({ row, onSave, onRemove }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(iso(row.event_date));
  const [label, setLabel] = useState(row.label || '');
  const [amount, setAmount] = useState(row.amount ?? '');
  const [direction, setDirection] = useState(row.direction || 'out');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsed = parseAmount(amount);
    if (!date || !label.trim() || parsed == null) return;
    setBusy(true);
    try {
      await onSave(row.id, {
        event_date: date,
        label: label.trim(),
        amount: Math.abs(parsed),
        direction,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('treso.fieldDate')}>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0" />
        </Field>
        <Field label={t('treso.fieldLabel')}>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} className="min-w-0" />
        </Field>
        <Field label={t('treso.fieldAmount')}>
          <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0" />
        </Field>
        <Field label={t('treso.fieldDirection')}>
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            className="flex h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="out">{t('treso.dirOut')}</option>
            <option value="in">{t('treso.dirIn')}</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={save} disabled={busy}>{busy ? t('treso.saving') : t('treso.save')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(row.id)}>{t('treso.remove')}</Button>
      </div>
    </li>
  );
}

export default TresoEcheancesPage;
