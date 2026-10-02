import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  fetchHubSpotContactContext,
  fetchHubSpotQuotesForContactOrDeal,
  fetchHubSpotTypeOfServiceCatalog,
  monthKeyFromHubspotDate,
  resolveQuoteAmountHt,
} from '@/lib/hubspotService';
import { fetchAdSpendRows, fetchCacEntryCache, fetchTeamProfiles, pricesMap } from '@/lib/margin/api';
import { effectiveDiesel } from '@/lib/margin/calculateProjectMargin';
import { resolveCacAdsAmount } from '@/lib/margin/cacAds';
import { productOptions } from '@/lib/margin/constants';
import { normalizeFuelAddress, resolveFuelByDate } from '@/lib/margin/fuel';
import {
  createMarginSimulation,
  deleteMarginSimulation,
  fetchMarginSimulation,
  listMarginSimulations,
  updateMarginSimulation,
} from '@/lib/margin/simulations';
import {
  SIM_DRAFT_KEY,
  defaultSimForm,
  mergeSimulationServices,
  minPriceForMa,
  normalizeSimForm,
  seedHourLinesFromSimple,
  servicePatchFromLabels,
  simulateMargin,
} from '@/lib/margin/simulator';
import SimulatorHistory from './SimulatorHistory';
import SimulatorSource from './SimulatorSource';
import SimulatorView from './SimulatorView';

/**
 * v1.14.0 Marges › Simulateur (Admin + Manager).
 * Draft is kept in localStorage. Saved simulations live in margin_simulations (shared history).
 * Calculation always goes through calculateProjectMargin.
 */
function readDraft() {
  try {
    const raw = localStorage.getItem(SIM_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      form: normalizeSimForm(parsed.form || parsed),
      editingId: parsed.editingId || null,
    };
  } catch {
    return null;
  }
}

const SimulatorTab = ({ params, prices }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState(defaultSimForm);
  const [editingId, setEditingId] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [spendRows, setSpendRows] = useState([]);
  const [cacheRows, setCacheRows] = useState([]);
  const [routing, setRouting] = useState({});
  const [lineFuel, setLineFuel] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [deals, setDeals] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [hsLoading, setHsLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const patch = (partial) => setForm((f) => ({ ...f, ...partial }));

  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setForm(draft.form);
      setEditingId(draft.editingId);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SIM_DRAFT_KEY, JSON.stringify({ form, editingId }));
      } catch {
        /* ignore quota */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [form, editingId, ready]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchTeamProfiles().catch(() => []),
      fetchAdSpendRows().catch(() => []),
      fetchCacEntryCache().catch(() => []),
      fetchHubSpotTypeOfServiceCatalog().catch(() => []),
    ]).then(([team, spend, cache, services]) => {
      if (cancelled) return;
      setProfiles(team);
      setSpendRows(spend);
      setCacheRows(cache);
      setCatalog(Array.isArray(services) ? services : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadHistory = async (query = historyQuery) => {
    setHistoryLoading(true);
    try {
      const rows = await listMarginSimulations({ query });
      setHistory(rows);
    } catch (err) {
      console.warn('[simulator] history', err?.message || err);
      toast({ variant: 'destructive', title: t('margins.sim.historyLoadError'), description: err?.message });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => {
      reloadHistory(historyQuery);
    }, 300);
    return () => clearTimeout(timer);
    // reloadHistory closes over toast/t; query is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQuery, ready]);

  useEffect(() => {
    const id = form.hubspotContactId;
    if (!id) {
      setDeals([]);
      setQuotes([]);
      return undefined;
    }
    let cancelled = false;
    fetchHubSpotContactContext(id)
      .then((ctx) => {
        if (cancelled) return;
        setDeals(ctx.deals || []);
        setQuotes(ctx.quotes || []);
      })
      .catch((err) => console.warn('[simulator] hubspot context', err?.message || err));
    return () => {
      cancelled = true;
    };
  }, [form.hubspotContactId]);

  const priceMap = useMemo(() => pricesMap(prices), [prices]);
  const diesel = useMemo(() => effectiveDiesel(params || {}), [params]);
  const techs = useMemo(
    () =>
      profiles
        .filter((p) => (form.techIds || []).includes(p.id))
        .map((p) => ({ id: p.id, name: (p.full_name || p.email || '').trim(), address: p.address || null })),
    [profiles, form.techIds]
  );

  const selectedDeal = deals.find((d) => String(d.id) === String(form.hubspotDealId)) || null;
  const services = useMemo(
    () => mergeSimulationServices(catalog, selectedDeal?.typeOfServiceLabels || []),
    [catalog, selectedDeal]
  );

  const routeKey = `${normalizeFuelAddress(form.clientAddress)}|${techs.map((x) => `${x.id}:${x.address || ''}`).join(',')}|${form.hoursMode}`;
  useEffect(() => {
    if (form.hoursMode === 'lines') return undefined;
    const client = normalizeFuelAddress(form.clientAddress);
    if (!client || !techs.length) {
      setRouting(Object.fromEntries(techs.map((x) => [x.id, { status: normalizeFuelAddress(x.address) ? 'idle' : 'noaddress' }])));
      return undefined;
    }
    let cancelled = false;
    setRouting(Object.fromEntries(techs.map((x) => [x.id, { status: normalizeFuelAddress(x.address) ? 'loading' : 'noaddress' }])));
    const timer = setTimeout(async () => {
      const people = techs.map((x) => ({ name: x.name, hours: 1, profileId: x.id, homeAddress: x.address }));
      const fuel = await resolveFuelByDate({ hourLines: [{ work_date: 'J01', service: form.service, people }], clientAddress: client });
      if (cancelled) return;
      const trips = fuel.J01?.trips || [];
      setRouting(
        Object.fromEntries(
          techs.map((x) => {
            const trip = trips.find((tr) => tr.profileId === x.id);
            if (!normalizeFuelAddress(x.address)) return [x.id, { status: 'noaddress' }];
            return [x.id, trip?.km != null ? { status: 'ok', km: trip.km } : { status: 'failed' }];
          })
        )
      );
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const linesKey = `${form.hoursMode}|${normalizeFuelAddress(form.clientAddress)}|${JSON.stringify(
    (form.hourLines || []).map((line) => ({
      d: line.work_date,
      people: (line.people || []).map((p) => [p.profileId, p.homeAddress]),
    }))
  )}`;
  useEffect(() => {
    if (form.hoursMode !== 'lines') {
      setLineFuel(null);
      return undefined;
    }
    const client = normalizeFuelAddress(form.clientAddress);
    const lines = form.hourLines || [];
    if (!client || !lines.length) {
      setLineFuel({});
      setRouting({});
      return undefined;
    }
    let cancelled = false;
    const ids = new Set();
    lines.forEach((line) => (line.people || []).forEach((p) => p.profileId && ids.add(p.profileId)));
    setRouting(Object.fromEntries([...ids].map((id) => [id, { status: 'loading' }])));
    const timer = setTimeout(async () => {
      const fuel = await resolveFuelByDate({
        hourLines: lines.map((line) => ({
          work_date: line.work_date,
          service: line.service,
          people: (line.people || []).map((p) => ({
            name: p.name,
            hours: Number(p.hours) || 0,
            profileId: p.profileId,
            homeAddress: p.homeAddress,
          })),
        })),
        clientAddress: client,
      });
      if (cancelled) return;
      setLineFuel(fuel);
      const next = {};
      for (const line of lines) {
        const trips = fuel?.[line.work_date]?.trips || [];
        for (const person of line.people || []) {
          if (!person.profileId || next[person.profileId]) continue;
          const trip = trips.find((tr) => tr.profileId === person.profileId);
          if (!normalizeFuelAddress(person.homeAddress)) next[person.profileId] = { status: 'noaddress' };
          else if (trip?.km != null) next[person.profileId] = { status: 'ok', km: trip.km };
          else next[person.profileId] = { status: 'failed' };
        }
      }
      setRouting(next);
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [linesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cac = useMemo(
    () => resolveCacAdsAmount({ monthKey: form.monthKey || null, cacheRows, spendRows }),
    [form.monthKey, cacheRows, spendRows]
  );

  const { calc } = useMemo(() => {
    const routedKm = Object.fromEntries(Object.entries(routing).map(([id, r]) => [id, r.status === 'ok' ? r.km : null]));
    return simulateMargin({
      inputs: {
        ...form,
        techs,
        routedKm,
        closer: form.closer || 'Remy',
        fuelByDate: form.hoursMode === 'lines' ? lineFuel : null,
      },
      params: params || {},
      prices: priceMap,
      dieselEurL: diesel,
      cacAdsAmount: cac?.status === 'ok' ? cac.amount : null,
      cacAdsStatus: cac?.status || null,
    });
  }, [form, techs, routing, lineFuel, params, priceMap, diesel, cac]);

  const minPrice = useMemo(
    () =>
      minPriceForMa({
        direct: calc?.direct,
        ads: cac?.status === 'ok' ? cac.amount : 0,
        targetPct: (Number(form.targetPct) || 0) / 100,
        closer: form.closer || 'Remy',
        params: params || {},
      }),
    [calc, cac, form.targetPct, form.closer, params]
  );

  const options = useMemo(
    () => ({
      profiles,
      services,
      products: productOptions(prices)
        .filter((p) => p.active)
        .map((p) => ({ ...p, price: priceMap[p.slug] ?? null })),
      closers: [...(params?.commercial_closers || [])].sort(),
    }),
    [profiles, services, prices, priceMap, params]
  );

  const onHoursMode = (mode) => {
    setForm((current) => {
      if (mode === 'lines' && (!current.hourLines || current.hourLines.length === 0)) {
        return { ...current, hoursMode: 'lines', hourLines: seedHourLinesFromSimple(current, profiles) };
      }
      return { ...current, hoursMode: mode };
    });
  };

  const selectContact = async (contact) => {
    const id = String(contact?.id || contact?.hubspot_contact_id || '').trim();
    if (!id) return;
    const fallbackName = `${contact.first_name || contact.firstname || ''} ${contact.last_name || contact.lastname || ''}`.trim();
    setHsLoading(true);
    try {
      const ctx = await fetchHubSpotContactContext(id);
      const nextDeals = ctx.deals || [];
      const deal = nextDeals[0] || null;
      setDeals(nextDeals);
      setQuotes(ctx.quotes || []);
      const labels = deal?.typeOfServiceLabels || [];
      const svc = labels.length ? servicePatchFromLabels(labels, mergeSimulationServices(catalog, labels)) : {};
      let project = null;
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('hubspot_contact_id', id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      project = data;
      const month = monthKeyFromHubspotDate(ctx.createdate);
      setForm((current) => ({
        ...current,
        hubspotContactId: id,
        hubspotContactName: ctx.name || fallbackName,
        hubspotDealId: deal?.id || '',
        hubspotDealName: deal?.name || '',
        hubspotQuoteId: '',
        hubspotQuoteTitle: '',
        clientAddress: ctx.address || current.clientAddress,
        closer: ctx.closer || current.closer,
        monthKey: month || current.monthKey,
        projectId: project?.id || '',
        projectName: project?.name || '',
        ...svc,
      }));
    } catch (err) {
      toast({ variant: 'destructive', title: t('margins.sim.historyLoadError'), description: err?.message });
    } finally {
      setHsLoading(false);
    }
  };

  const selectDeal = async (dealId) => {
    const deal = deals.find((d) => String(d.id) === String(dealId)) || null;
    const labels = deal?.typeOfServiceLabels || [];
    const svc = labels.length ? servicePatchFromLabels(labels, mergeSimulationServices(catalog, labels)) : {};
    setForm((current) => ({
      ...current,
      hubspotDealId: deal?.id || '',
      hubspotDealName: deal?.name || '',
      hubspotQuoteId: '',
      hubspotQuoteTitle: '',
      ...svc,
    }));
    if (!form.hubspotContactId) return;
    try {
      const { quotes: next } = await fetchHubSpotQuotesForContactOrDeal(form.hubspotContactId, {
        dealId: deal?.id || null,
      });
      setQuotes(next || []);
    } catch (err) {
      console.warn('[simulator] quotes', err?.message || err);
    }
  };

  const selectQuote = async (quoteId) => {
    if (!quoteId) {
      patch({ hubspotQuoteId: '', hubspotQuoteTitle: '' });
      return;
    }
    const quote = quotes.find((q) => String(q.id) === String(quoteId));
    patch({
      hubspotQuoteId: String(quoteId),
      hubspotQuoteTitle: quote?.title || quote?.number || '',
    });
    setHsLoading(true);
    try {
      const resolved = await resolveQuoteAmountHt(quoteId, quote?.amount);
      if (resolved.amountHt != null) patch({ amountHt: String(resolved.amountHt) });
    } catch (err) {
      console.warn('[simulator] quote ht', err?.message || err);
    } finally {
      setHsLoading(false);
    }
  };

  const reset = () => {
    const fresh = defaultSimForm();
    setForm(fresh);
    setEditingId(null);
    setRouting({});
    setLineFuel(null);
    setDeals([]);
    setQuotes([]);
    try {
      localStorage.removeItem(SIM_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  const persist = async (asNew) => {
    setSaving(true);
    try {
      const extra = { minPrice, cac };
      const saved = !asNew && editingId
        ? await updateMarginSimulation(editingId, form, calc, extra)
        : await createMarginSimulation(form, calc, extra);
      setEditingId(saved.id);
      toast({ title: !asNew && editingId ? t('margins.sim.saved') : t('margins.sim.savedNew') });
      await reloadHistory(historyQuery);
    } catch (err) {
      toast({ variant: 'destructive', title: t('margins.sim.saveFailed'), description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const openSimulation = async (id) => {
    try {
      const row = await fetchMarginSimulation(id);
      if (!row) return;
      setForm(normalizeSimForm(row.inputs));
      setEditingId(row.id);
      setRouting({});
    } catch (err) {
      toast({ variant: 'destructive', title: t('margins.sim.historyLoadError'), description: err?.message });
    }
  };

  const removeSimulation = async () => {
    if (!editingId) return;
    if (!window.confirm(t('margins.sim.deleteConfirm'))) return;
    setSaving(true);
    try {
      await deleteMarginSimulation(editingId);
      setEditingId(null);
      toast({ title: t('margins.sim.deleted') });
      await reloadHistory(historyQuery);
    } catch (err) {
      toast({ variant: 'destructive', title: t('margins.sim.saveFailed'), description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SimulatorHistory
        t={t}
        lang={i18n.language}
        rows={history}
        query={historyQuery}
        onQuery={setHistoryQuery}
        loading={historyLoading}
        editingId={editingId}
        onOpen={openSimulation}
      />
      <SimulatorView
        t={t}
        lang={i18n.language}
        form={form}
        set={set}
        patch={patch}
        options={options}
        routing={routing}
        cac={cac}
        calc={calc}
        minPrice={minPrice}
        dieselEurL={diesel}
        params={params || {}}
        onReset={reset}
        onHoursMode={onHoursMode}
        saving={saving}
        editingId={editingId}
        onSave={() => persist(false)}
        onSaveNew={() => persist(true)}
        onDelete={removeSimulation}
        sourceSlot={
          <SimulatorSource
            t={t}
            form={form}
            deals={deals}
            quotes={quotes}
            loading={hsLoading}
            onSelectContact={selectContact}
            onSelectDeal={selectDeal}
            onSelectQuote={selectQuote}
            onClearContact={() =>
              patch({
                hubspotContactId: '',
                hubspotContactName: '',
                hubspotDealId: '',
                hubspotDealName: '',
                hubspotQuoteId: '',
                hubspotQuoteTitle: '',
                projectId: '',
                projectName: '',
              })
            }
            onClearProject={() => patch({ projectId: '', projectName: '' })}
          />
        }
      />
    </div>
  );
};

export default SimulatorTab;
