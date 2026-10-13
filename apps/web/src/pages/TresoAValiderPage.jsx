import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { Check, Landmark, X } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TresoSubnav from '@/components/treso/TresoSubnav';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { confirmProposedMatch, listProposedMatches, rejectProposedMatch } from '@/lib/treso/queue';

function formatDay(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatMoney(value, language) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const locale = language?.startsWith('nl') ? 'nl-BE' : language?.startsWith('en') ? 'en-GB' : 'fr-BE';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
}

const TresoAValiderPage = ({ preview = null }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState(preview?.rows ?? []);
  const [loading, setLoading] = useState(!preview);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    listProposedMatches()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((error) => {
        console.error(error);
        toast({ variant: 'destructive', title: t('treso.loadFailed') });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, t, toast]);

  const decide = async (row, action) => {
    setBusyId(row.id);
    try {
      if (preview) {
        setRows((current) => current.filter((item) => item.id !== row.id));
      } else if (action === 'confirm') {
        await confirmProposedMatch(row);
        setRows((current) => current.filter((item) => item.id !== row.id));
      } else {
        await rejectProposedMatch(row);
        setRows((current) => current.filter((item) => item.id !== row.id));
      }
      toast({ title: action === 'confirm' ? t('treso.confirmed') : t('treso.rejected') });
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
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary shrink-0" />
            {t('treso.queueTitle')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">{t('treso.queueSubtitle')}</p>
        </div>
        <TresoSubnav active="queue" />

        {loading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-sm text-gray-500">
            {t('treso.queueEmpty')}
          </p>
        )}

        <ul className="space-y-3">
          {rows.map((row) => {
            const invoice = row.treso_client_invoices;
            return (
              <li key={row.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500">{formatDay(row.booking_date)}</p>
                    <p className="font-medium text-gray-900 dark:text-white truncate">{row.counterparty_name || '—'}</p>
                    {row.communication && (
                      <p className="text-sm text-gray-500 truncate">{row.communication}</p>
                    )}
                  </div>
                  <p className="font-semibold tabular-nums text-gray-900 dark:text-white shrink-0">
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
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={busyId === row.id}
                    onClick={() => decide(row, 'confirm')}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t('treso.confirm')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={busyId === row.id}
                    onClick={() => decide(row, 'reject')}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t('treso.reject')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardLayout>
  );
};

export default TresoAValiderPage;
