import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { Check, Landmark, X } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TresoSubnav from '@/components/treso/TresoSubnav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { confirmProposedMatch, listProposedMatches, rejectProposedMatch } from '@/lib/treso/queue';
import {
  confirmSupplierDueReview,
  dismissSupplierDueReview,
  listOpenSupplierBills,
  listSupplierDueReviews,
} from '@/lib/treso/pdf';

function formatDay(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function isoDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function formatMoney(value, language) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const locale = language?.startsWith('nl') ? 'nl-BE' : language?.startsWith('en') ? 'en-GB' : 'fr-BE';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
}

function reasonKey(reason) {
  if (reason === 'amount_mismatch') return 'reasonAmount';
  if (reason === 'low_confidence') return 'reasonConfidence';
  return 'reasonUnmatched';
}

function SupplierReviewCard({ review, bills, busy, onConfirm, onDismiss }) {
  const { t, i18n } = useTranslation();
  const [due, setDue] = useState(isoDate(review.proposed_due_date));
  const [billId, setBillId] = useState(review.bill_id || '');
  const linked = review.treso_supplier_bills;
  const needsBill = !review.bill_id;

  return (
    <li className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium text-gray-900 dark:text-white">{review.supplier_name || review.file_name || '—'}</p>
          <p className="truncate text-sm text-gray-500">{review.invoice_number || review.file_name || '—'}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          {t(`treso.${reasonKey(review.reason)}`)}
        </span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-200">
        {t('treso.pdfAmount')} : {formatMoney(review.amount_ttc, i18n.language)}
        {linked?.amount_ttc != null ? ` · ${t('treso.billAmount')} : ${formatMoney(linked.amount_ttc, i18n.language)}` : ''}
      </p>
      {review.payment_terms && <p className="text-sm text-gray-500">{review.payment_terms}</p>}
      {needsBill && (
        <label className="block min-w-0 space-y-1 text-sm">
          <span className="text-gray-500">{t('treso.chooseBill')}</span>
          <select
            value={billId}
            onChange={(event) => setBillId(event.target.value)}
            className="flex h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">—</option>
            {bills.map((bill) => (
              <option key={bill.id} value={bill.id}>
                {bill.supplier_name} · {formatMoney(bill.amount_ttc, i18n.language)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block min-w-0 space-y-1 text-sm">
        <span className="text-gray-500">{t('treso.proposedDue')}</span>
        <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="min-w-0" />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={busy || !due || (needsBill && !billId)}
          onClick={() => onConfirm(review, { dueDate: due, billId: billId || review.bill_id })}
        >
          <Check className="mr-1 h-4 w-4" />
          {t('treso.confirm')}
        </Button>
        <Button type="button" size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => onDismiss(review)}>
          <X className="mr-1 h-4 w-4" />
          {t('treso.reject')}
        </Button>
      </div>
    </li>
  );
}

const TresoAValiderPage = ({ preview = null }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState(preview?.rows ?? []);
  const [reviews, setReviews] = useState(preview?.supplierReviews ?? []);
  const [bills, setBills] = useState(preview?.openBills ?? []);
  const [loading, setLoading] = useState(!preview);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    Promise.allSettled([
      listProposedMatches(),
      listSupplierDueReviews(),
      listOpenSupplierBills(),
    ]).then(([matchResult, reviewResult, billResult]) => {
      if (cancelled) return;
      if (matchResult.status === 'fulfilled') setRows(matchResult.value);
      else console.error(matchResult.reason);
      if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value);
      else console.error(reviewResult.reason);
      if (billResult.status === 'fulfilled') setBills(billResult.value);
      else console.error(billResult.reason);
      if (matchResult.status === 'rejected' && reviewResult.status === 'rejected') {
        toast({ variant: 'destructive', title: t('treso.loadFailed') });
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [preview, t, toast]);

  const decide = async (row, action) => {
    setBusyId(row.id);
    try {
      if (!preview) {
        if (action === 'confirm') await confirmProposedMatch(row);
        else await rejectProposedMatch(row);
      }
      setRows((current) => current.filter((item) => item.id !== row.id));
      toast({ title: action === 'confirm' ? t('treso.confirmed') : t('treso.rejected') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.actionFailed') });
    } finally {
      setBusyId(null);
    }
  };

  const confirmReview = async (review, choice) => {
    setBusyId(review.id);
    try {
      if (!preview) await confirmSupplierDueReview({ review, ...choice });
      setReviews((current) => current.filter((item) => item.id !== review.id));
      toast({ title: t('treso.dueConfirmed') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.actionFailed') });
    } finally {
      setBusyId(null);
    }
  };

  const dismissReview = async (review) => {
    setBusyId(review.id);
    try {
      if (!preview) await dismissSupplierDueReview(review.id);
      setReviews((current) => current.filter((item) => item.id !== review.id));
      toast({ title: t('treso.dueDismissed') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.actionFailed') });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.queueTitle')} - Novakleen</title>
      </Helmet>
      <div className="min-w-0 max-w-3xl space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Landmark className="h-7 w-7 shrink-0 text-primary" />
            {t('treso.queueTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('treso.queueSubtitle')}</p>
        </div>
        <TresoSubnav active="queue" />

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        )}

        <section id="supplier-dates" className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('treso.supplierDates')}</h2>
            <p className="text-sm text-gray-500">{t('treso.supplierDatesHint')}</p>
          </div>
          {!loading && reviews.length === 0 && (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700">
              {t('treso.supplierDatesEmpty')}
            </p>
          )}
          <ul className="space-y-3">
            {reviews.map((review) => (
              <SupplierReviewCard
                key={review.id}
                review={review}
                bills={bills}
                busy={busyId === review.id}
                onConfirm={confirmReview}
                onDismiss={dismissReview}
              />
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('treso.paymentsTitle')}</h2>
          {!loading && rows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700">
              {t('treso.queueEmpty')}
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((row) => {
              const invoice = row.treso_client_invoices;
              return (
                <li key={row.id} className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">{formatDay(row.booking_date)}</p>
                      <p className="truncate font-medium text-gray-900 dark:text-white">{row.counterparty_name || '—'}</p>
                      {row.communication && (
                        <p className="truncate text-sm text-gray-500">{row.communication}</p>
                      )}
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatMoney(row.amount, i18n.language)}
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    <span className="text-gray-500">{t('treso.proposed')} : </span>
                    {invoice?.invoice_number || '—'}
                    {invoice?.client_name ? ` · ${invoice.client_name}` : ''}
                    {invoice?.amount_ttc != null ? ` · ${formatMoney(invoice.amount_ttc, i18n.language)}` : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="flex-1" disabled={busyId === row.id} onClick={() => decide(row, 'confirm')}>
                      <Check className="mr-1 h-4 w-4" />
                      {t('treso.confirm')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="flex-1" disabled={busyId === row.id} onClick={() => decide(row, 'reject')}>
                      <X className="mr-1 h-4 w-4" />
                      {t('treso.reject')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default TresoAValiderPage;
