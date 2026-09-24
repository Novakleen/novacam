import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, RefreshCw, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  fetchAdSpendRows,
  fetchCacEntryCache,
  upsertAdSpendRow,
  upsertAdSpendRows,
  upsertCacEntryCacheRows,
} from '@/lib/margin/api';
import {
  CAC_ENTRY_DATE_SOURCE,
  monthDateFromKey,
  monthKeyFromDate,
  parseAdSpendCsv,
  spendForMonth,
} from '@/lib/margin/cacAds';
import { formatMoney, formatNumber } from '@/lib/margin/format';
import { fetchWonClientsByEntryMonth } from '@/lib/hubspotService';

/**
 * Paramétrage CAC ads: dépense mensuelle + clients (override manuel) + recalcul HubSpot.
 * CAC = spend(M) / unique contacts créés en M ayant ≥1 deal closed-won.
 */
const CacAdsPanel = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [spendRows, setSpendRows] = useState([]);
  const [cacheRows, setCacheRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  /** drafts[monthKey] = { spend, clients, platform } */
  const [drafts, setDrafts] = useState({});
  const [newMonth, setNewMonth] = useState('');
  const [newSpend, setNewSpend] = useState('');
  const [newClients, setNewClients] = useState('');
  const [newPlatform, setNewPlatform] = useState('Meta');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [spend, cache] = await Promise.all([fetchAdSpendRows(), fetchCacEntryCache()]);
      setSpendRows(spend);
      setCacheRows(cache);
      const keys = new Set();
      for (const r of spend) {
        const k = monthKeyFromDate(r.month);
        if (k) keys.add(k);
      }
      for (const r of cache) {
        const k = monthKeyFromDate(r.month);
        if (k) keys.add(k);
      }
      const next = {};
      for (const monthKey of keys) {
        const spendVal = spendForMonth(spend, monthKey);
        const cacheRow = cache.find((r) => monthKeyFromDate(r.month) === monthKey);
        const platformRow = spend.find((r) => monthKeyFromDate(r.month) === monthKey);
        next[monthKey] = {
          spend: spendVal != null ? String(spendVal) : '',
          clients:
            cacheRow?.clients_won != null ? String(cacheRow.clients_won) : '',
          platform: platformRow?.platform || 'Meta',
        };
      }
      setDrafts(next);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('margins.cacLoadError'),
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const months = useMemo(() => Object.keys(drafts).sort(), [drafts]);

  const setDraft = (monthKey, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [monthKey]: { ...prev[monthKey], ...patch },
    }));
  };

  const liveCac = (monthKey) => {
    const d = drafts[monthKey];
    if (!d) return null;
    const spend = Number(d.spend);
    const clients = Number(d.clients);
    if (!Number.isFinite(spend) || !Number.isFinite(clients) || clients <= 0) return null;
    return Math.round((spend / clients) * 100) / 100;
  };

  const hubspotCount = (monthKey) => {
    const row = cacheRows.find((r) => monthKeyFromDate(r.month) === monthKey);
    return row?.hubspot_clients_won != null ? Number(row.hubspot_clients_won) : null;
  };

  const handleSaveMonth = async (monthKey) => {
    setSaving(true);
    try {
      const d = drafts[monthKey];
      const spend = Number(d.spend);
      const clients = Number(d.clients);
      if (!Number.isFinite(spend) || spend < 0) throw new Error(t('margins.cacInvalidSpend'));
      if (!Number.isFinite(clients) || clients < 0) throw new Error(t('margins.cacInvalidClients'));
      const month = monthDateFromKey(monthKey);
      const cac = clients > 0 ? Math.round((spend / clients) * 100) / 100 : null;
      await upsertAdSpendRow({
        month,
        platform: d.platform || 'Meta',
        spend,
        currency: 'EUR',
        period_start: month,
      });
      const existing = cacheRows.find((r) => monthKeyFromDate(r.month) === monthKey);
      await upsertCacEntryCacheRows([
        {
          month,
          clients_won: clients,
          hubspot_clients_won: existing?.hubspot_clients_won ?? null,
          spend_total: spend,
          cac_per_client: cac,
          entry_date_source: CAC_ENTRY_DATE_SOURCE,
          fetched_at: existing?.fetched_at || new Date().toISOString(),
          notes: existing?.notes || null,
        },
      ]);
      toast({ title: t('margins.cacMonthSaved', { month: monthKey }) });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: t('common.error'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddMonth = async () => {
    const monthKey = String(newMonth || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      toast({ variant: 'destructive', title: t('margins.cacInvalidMonth') });
      return;
    }
    if (drafts[monthKey]) {
      toast({ variant: 'destructive', title: t('margins.cacMonthExists') });
      return;
    }
    const platform = newPlatform || 'Meta';
    const spend = Number(newSpend || 0);
    const clients = Number(newClients || 0);
    setDrafts((prev) => ({
      ...prev,
      [monthKey]: {
        spend: String(Number.isFinite(spend) ? spend : 0),
        clients: String(Number.isFinite(clients) ? clients : 0),
        platform,
      },
    }));
    setNewMonth('');
    setNewSpend('');
    setNewClients('');
    setSaving(true);
    try {
      const month = monthDateFromKey(monthKey);
      const cac = clients > 0 && Number.isFinite(spend) ? Math.round((spend / clients) * 100) / 100 : null;
      await upsertAdSpendRow({
        month,
        platform,
        spend: Number.isFinite(spend) ? spend : 0,
        currency: 'EUR',
        period_start: month,
      });
      await upsertCacEntryCacheRows([
        {
          month,
          clients_won: Number.isFinite(clients) ? clients : 0,
          hubspot_clients_won: null,
          spend_total: Number.isFinite(spend) ? spend : 0,
          cac_per_client: cac,
          entry_date_source: CAC_ENTRY_DATE_SOURCE,
          fetched_at: new Date().toISOString(),
        },
      ]);
      toast({ title: t('margins.cacMonthAdded', { month: monthKey }) });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: t('common.error'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshClients = async () => {
    setRefreshing(true);
    try {
      const result = await fetchWonClientsByEntryMonth({ fromMonth: '2024-01' });
      const fetchedAt = new Date().toISOString();
      const monthKeys = new Set([
        ...Object.keys(result.byMonth || {}),
        ...months,
      ]);
      const rows = [...monthKeys].sort().map((monthKey) => {
        const hsClients = Number(result.byMonth?.[monthKey] || 0);
        const existing = cacheRows.find((r) => monthKeyFromDate(r.month) === monthKey);
        const draft = drafts[monthKey];
        // Keep manual override if present; otherwise adopt HubSpot count
        const hasManual =
          existing &&
          existing.hubspot_clients_won != null &&
          Number(existing.clients_won) !== Number(existing.hubspot_clients_won);
        const clients = hasManual
          ? Number(existing.clients_won)
          : draft?.clients !== '' && draft?.clients != null && existing
            ? Number(draft.clients)
            : hsClients;
        // On first sync or when not overridden, use HubSpot
        const effectiveClients = hasManual ? Number(existing.clients_won) : hsClients;
        const spend =
          draft?.spend !== '' && draft?.spend != null
            ? Number(draft.spend)
            : spendForMonth(spendRows, monthKey);
        const cac =
          spend != null && Number.isFinite(spend) && effectiveClients > 0
            ? Math.round((spend / effectiveClients) * 100) / 100
            : null;
        return {
          month: monthDateFromKey(monthKey),
          clients_won: effectiveClients,
          hubspot_clients_won: hsClients,
          spend_total: spend,
          cac_per_client: cac,
          entry_date_source: result.entryDateSource || CAC_ENTRY_DATE_SOURCE,
          fetched_at: fetchedAt,
          notes: 'hs_lifecyclestage_lead_date unavailable; contact.createdate',
        };
      });
      await upsertCacEntryCacheRows(rows);
      toast({
        title: t('margins.cacClientsRefreshed'),
        description: t('margins.cacClientsRefreshedDesc', {
          deals: result.stats?.deals ?? '—',
          contacts: result.stats?.contactsResolved ?? '—',
        }),
      });
      await load();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('margins.cacRefreshError'),
        description: err.message,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleUseHubspot = (monthKey) => {
    const hs = hubspotCount(monthKey);
    if (hs == null) return;
    setDraft(monthKey, { clients: String(hs) });
  };

  const handleCsv = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseAdSpendCsv(text);
      if (!rows.length) throw new Error(t('margins.cacCsvEmpty'));
      await upsertAdSpendRows(rows);
      toast({
        title: t('margins.cacCsvImported'),
        description: t('margins.cacCsvImportedDesc', { count: rows.length }),
      });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: t('margins.cacCsvError'), description: err.message });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
      </p>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>{t('margins.cacTitle')}</CardTitle>
          <CardDescription>{t('margins.cacDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            {t('margins.cacLagNote')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('margins.cacEntrySource', { source: CAC_ENTRY_DATE_SOURCE })}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshClients}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {t('margins.cacRefreshClients')}
            </Button>
            <label className="inline-flex cursor-pointer">
              <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                {t('margins.cacImportCsv')}
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) handleCsv(f);
                }}
              />
            </label>
          </div>

          <div className="space-y-3">
            {months.map((monthKey) => {
              const d = drafts[monthKey] || { spend: '', clients: '', platform: 'Meta' };
              const cac = liveCac(monthKey);
              const hs = hubspotCount(monthKey);
              const overridden =
                hs != null && d.clients !== '' && Number(d.clients) !== Number(hs);
              return (
                <div
                  key={monthKey}
                  className="rounded-xl border p-3 sm:p-4 space-y-3 bg-white dark:bg-gray-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold tabular-nums text-base">{monthKey}</p>
                      <p className="text-xs text-muted-foreground">{d.platform || 'Meta'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('margins.cacColCac')}
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {cac != null ? formatMoney(cac) : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('margins.cacColSpend')} (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={d.spend}
                        onChange={(e) => setDraft(monthKey, { spend: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('margins.cacColClients')}</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={d.clients}
                        onChange={(e) => setDraft(monthKey, { clients: e.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {t('margins.cacHubspotCount')}:{' '}
                          <span className="tabular-nums font-medium">
                            {hs != null ? formatNumber(hs, 0) : '—'}
                          </span>
                          {overridden && (
                            <span className="ml-1 text-amber-700 dark:text-amber-300">
                              ({t('margins.cacOverridden')})
                            </span>
                          )}
                        </span>
                        {hs != null && (
                          <button
                            type="button"
                            className="underline hover:no-underline text-primary"
                            onClick={() => handleUseHubspot(monthKey)}
                          >
                            {t('margins.cacUseHubspot')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveMonth(monthKey)}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      {t('common.save')}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!months.length && (
              <p className="text-sm text-muted-foreground">{t('margins.cacEmpty')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('margins.cacAddMonth')}</CardTitle>
          <CardDescription>{t('margins.cacAddMonthDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs">{t('margins.cacColMonth')} (YYYY-MM)</Label>
              <Input
                placeholder="2026-09"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Platform</Label>
              <Input value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">{t('margins.cacColSpend')}</Label>
              <Input
                type="number"
                step="0.01"
                value={newSpend}
                onChange={(e) => setNewSpend(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">{t('margins.cacColClients')}</Label>
              <Input
                type="number"
                step="1"
                value={newClients}
                onChange={(e) => setNewClients(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="button" onClick={handleAddMonth} disabled={saving}>
                <Plus className="h-4 w-4 mr-1" />
                {t('margins.cacAddMonth')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CacAdsPanel;
