import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, KeyRound, Landmark, Upload } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import TresoSubnav from '@/components/treso/TresoSubnav';
import {
  createTresoApiKey,
  importAccountableFile,
  listTresoApiKeys,
  loadLastImportSummary,
  revokeTresoApiKey,
} from '@/lib/treso/import';
import { formatBrusselsDateTime, presentLastImport } from '@/lib/treso/forecast';

function formatDay(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatEuro(value, language) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const locale = String(language || '').startsWith('nl')
    ? 'nl-BE'
    : String(language || '').startsWith('en')
      ? 'en-GB'
      : 'fr-BE';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(Number(value));
}

function LastImportCard({ summary, language }) {
  const { t } = useTranslation();
  const channel = summary.channel === 'api'
    ? t('treso.channelApi')
    : summary.channel === 'ecran'
      ? t('treso.channelManual')
      : '—';
  return (
    <section aria-labelledby="treso-last-import" className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="treso-last-import" className="font-semibold text-gray-900 dark:text-white">{t('treso.lastImport')}</h2>
        {summary.stale && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {t('treso.staleBadge')}
          </span>
        )}
      </div>
      {summary.empty ? (
        <p className="text-sm text-gray-500">{t('treso.noImport')}</p>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-500">{t('treso.importedAt')}</dt>
            <dd className="font-medium tabular-nums text-gray-900 dark:text-white">{formatBrusselsDateTime(summary.importedAt) || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t('treso.channel')}</dt>
            <dd className="font-medium text-gray-900 dark:text-white">{channel}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t('treso.rowsInsertedShort')}</dt>
            <dd className="font-medium tabular-nums text-gray-900 dark:text-white">{summary.rowsInserted ?? 0}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t('treso.lastBalance')}</dt>
            <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
              {formatEuro(summary.balance, language)}
              {summary.balanceDate ? ` · ${formatDay(summary.balanceDate)}` : ''}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

const TresoImportPage = ({ preview = null }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [balanceBelfius, setBalanceBelfius] = useState(preview?.balanceBelfius ?? '');
  const [balanceDate, setBalanceDate] = useState(preview?.balanceDate ?? '');
  const [balanceVisa, setBalanceVisa] = useState(preview?.balanceVisa ?? '');
  const [visaDate, setVisaDate] = useState(preview?.visaDate ?? '');
  const [report, setReport] = useState(preview?.report ?? null);
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState(preview?.keys ?? []);
  const [revealedKey, setRevealedKey] = useState(preview?.revealedKey ?? '');
  const [keyBusy, setKeyBusy] = useState(false);
  const [lastImport, setLastImport] = useState(() => (
    preview?.lastImport ? presentLastImport(preview.lastImport) : undefined
  ));
  const [lastImportError, setLastImportError] = useState(false);

  const onDrop = useCallback((accepted) => {
    setFile(accepted[0] || null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  const loadLastImport = useCallback(async () => {
    if (preview) return;
    try {
      setLastImport(await loadLastImportSummary());
      setLastImportError(false);
    } catch (error) {
      console.error(error);
      setLastImportError(true);
    }
  }, [preview]);

  useEffect(() => {
    loadLastImport();
  }, [loadLastImport]);

  const loadKeys = useCallback(async () => {
    if (preview) return;
    try {
      setKeys(await listTresoApiKeys());
    } catch (error) {
      console.error(error);
    }
  }, [preview]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const importErrorMessage = (error) => {
    const body = error.body || {};
    if (body.error === 'missing_column') {
      return t('treso.missingColumn', { sheet: body.sheet, column: body.column });
    }
    if (body.error === 'balance_missing' || error.status === 400 && !file) {
      return body.message || t('treso.balanceMissing');
    }
    if (error.status === 401 || error.status === 403) return t('treso.forbidden');
    return body.message || t('treso.failed');
  };

  const onImport = async (event) => {
    event.preventDefault();
    if (preview) return;
    if (!file) {
      toast({ variant: 'destructive', title: t('treso.failed'), description: t('treso.drop') });
      return;
    }
    if (!String(balanceBelfius).trim() || !balanceDate) {
      toast({ variant: 'destructive', title: t('treso.balanceMissing') });
      return;
    }
    setBusy(true);
    try {
      const next = await importAccountableFile({
        file,
        balanceBelfius,
        balanceDate,
        balanceVisa,
        visaBalanceDate: visaDate,
      });
      setReport(next);
      await loadLastImport();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.failed'), description: importErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const onCreateKey = async () => {
    if (preview) return;
    setKeyBusy(true);
    try {
      const plaintext = await createTresoApiKey(user?.id ?? null);
      setRevealedKey(plaintext);
      toast({ title: t('treso.keyCreated') });
      await loadKeys();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.failed'), description: error.message });
    } finally {
      setKeyBusy(false);
    }
  };

  const onRevoke = async (id) => {
    if (preview) return;
    if (!window.confirm(t('treso.confirmRevoke'))) return;
    try {
      await revokeTresoApiKey(id);
      toast({ title: t('treso.keyRevoked') });
      await loadKeys();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('treso.failed'), description: error.message });
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(revealedKey);
      toast({ title: t('treso.copied') });
    } catch (error) {
      console.error(error);
    }
  };

  const displayFile = file?.name || preview?.fileName;

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.title')} - Novakleen</title>
      </Helmet>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary shrink-0" />
            {t('treso.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('treso.subtitle')}</p>
        </div>
        <TresoSubnav active="import" />

        {lastImport && <LastImportCard summary={lastImport} language={i18n.language} />}
        {lastImportError && (
          <p className="text-sm text-red-600 dark:text-red-400">{t('treso.lastImportFailed')}</p>
        )}

        <form onSubmit={onImport} className="space-y-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6">
          <div
            {...getRootProps()}
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {isDragActive ? t('treso.dropActive') : t('treso.drop')}
            </p>
            {displayFile && (
              <p className="mt-2 text-sm text-primary flex items-center justify-center gap-1">
                <FileSpreadsheet className="h-4 w-4" />
                {t('treso.fileReady')} : {displayFile}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="balance-belfius">{t('treso.balanceBelfius')}</Label>
              <Input
                id="balance-belfius"
                inputMode="decimal"
                value={balanceBelfius}
                onChange={(event) => setBalanceBelfius(event.target.value)}
                placeholder="1000.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="balance-date">{t('treso.balanceDate')}</Label>
              <Input
                id="balance-date"
                type="date"
                value={balanceDate}
                onChange={(event) => setBalanceDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="balance-visa">
                {t('treso.balanceVisa')}
                <span className="ml-1 font-normal text-gray-400">({t('treso.visaOptional')})</span>
              </Label>
              <Input
                id="balance-visa"
                inputMode="decimal"
                value={balanceVisa}
                onChange={(event) => setBalanceVisa(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visa-date">{t('treso.visaDate')}</Label>
              <Input
                id="visa-date"
                type="date"
                value={visaDate}
                onChange={(event) => setVisaDate(event.target.value)}
              />
            </div>
          </div>

          <Button type="submit" disabled={busy || (!file && !preview)} className="w-full sm:w-auto">
            {busy ? t('treso.importing') : t('treso.import')}
          </Button>
        </form>

        {report && (
          <section className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('treso.report')}</h2>
            {report.already_imported && (
              <p className="text-sm text-amber-700 dark:text-amber-300">{t('treso.already')}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('treso.rowsRead')} value={report.rows_total ?? 0} />
              <Stat label={t('treso.rowsInserted')} value={report.rows_inserted ?? 0} />
              <Stat label={t('treso.rowsDuplicate')} value={report.rows_duplicate ?? 0} />
              <Stat label={t('treso.exactDuplicates')} value={report.exact_duplicates ?? 0} />
              <Stat label={t('treso.rowsSkipped')} value={report.rows_skipped ?? 0} />
              <Stat label={t('treso.internal')} value={report.internal_transfers ?? 0} />
              <Stat label={t('treso.billsInserted')} value={report.supplier_bills_inserted ?? 0} />
              <Stat label={t('treso.billsPaid')} value={report.supplier_bills_marked_paid ?? 0} />
              <Stat label={t('treso.matchesAuto')} value={report.matches_auto ?? 0} />
              <Stat label={t('treso.matchesReview')} value={report.matches_a_valider ?? 0} />
              {report.factures_present && (
                <>
                  <Stat label={t('treso.facturesMatched')} value={report.factures_matched ?? 0} />
                  <Stat label={t('treso.facturesUnmatched')} value={report.factures_unmatched ?? 0} />
                </>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('treso.dateRange')} : {formatDay(report.date_min)} — {formatDay(report.date_max)}
            </p>
          </section>
        )}

        <section id="api-keys" className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 space-y-4">
          <div className="flex items-start gap-2">
            <KeyRound className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('treso.keysTitle')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('treso.keysHint')}</p>
            </div>
          </div>

          {revealedKey && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{t('treso.keyOnce')}</p>
              <code className="block break-all text-xs bg-white dark:bg-gray-900 rounded-lg p-2 border border-amber-200 dark:border-amber-900">
                {revealedKey}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyKey}>{t('treso.copy')}</Button>
            </div>
          )}

          <Button type="button" variant="secondary" onClick={onCreateKey} disabled={keyBusy}>
            {keyBusy ? t('treso.creatingKey') : t('treso.createKey')}
          </Button>

          {keys.length === 0 ? (
            <p className="text-sm text-gray-500">{t('treso.noKeys')}</p>
          ) : (
            <ul className="space-y-2">
              {keys.map((key) => (
                <li key={key.id} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-sm truncate">{key.key_prefix}…</p>
                    <p className="text-xs text-gray-500">
                      {key.revoked_at ? t('treso.revoked') : t('treso.active')}
                      {' · '}
                      {t('treso.lastUsed')} : {key.last_used_at ? formatDay(key.last_used_at) : t('treso.neverUsed')}
                    </p>
                  </div>
                  {!key.revoked_at && (
                    <Button type="button" variant="outline" size="sm" onClick={() => onRevoke(key.id)}>
                      {t('treso.revoke')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
};

export default TresoImportPage;
