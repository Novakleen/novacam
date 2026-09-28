import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdSpendRows, fetchCacEntryCache, fetchTeamProfiles, pricesMap } from '@/lib/margin/api';
import { effectiveDiesel } from '@/lib/margin/calculateProjectMargin';
import { resolveCacAdsAmount } from '@/lib/margin/cacAds';
import { SERVICE_CODES, productOptions } from '@/lib/margin/constants';
import { normalizeFuelAddress, resolveFuelByDate } from '@/lib/margin/fuel';
import { minPriceForMa, simulateMargin } from '@/lib/margin/simulator';
import SimulatorView from './SimulatorView';

/**
 * v1.13.0 Marges › Simulateur (Admin + Manager). Purely client-side what-if: nothing is saved.
 * Uses the same calculateProjectMargin as the project Marge tab (see lib/margin/simulator.js).
 */
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function defaultSimForm() {
  return {
    amountHt: '',
    techIds: [],
    days: 1,
    hoursPerDay: 8,
    service: 'sc',
    productLines: [{ product: '', liters: '' }],
    clientAddress: '',
    kmOverride: {},
    closer: '',
    monthKey: currentMonthKey(),
    extras: [],
    targetPct: 30,
  };
}

const SimulatorTab = ({ params, prices }) => {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(defaultSimForm);
  const [profiles, setProfiles] = useState([]);
  const [spendRows, setSpendRows] = useState([]);
  const [cacheRows, setCacheRows] = useState([]);
  const [routing, setRouting] = useState({});
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTeamProfiles().catch(() => []), fetchAdSpendRows().catch(() => []), fetchCacEntryCache().catch(() => [])]).then(
      ([team, spend, cache]) => {
        if (cancelled) return;
        setProfiles(team);
        setSpendRows(spend);
        setCacheRows(cache);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const priceMap = useMemo(() => pricesMap(prices), [prices]);
  const diesel = useMemo(() => effectiveDiesel(params || {}), [params]);
  const techs = useMemo(
    () =>
      profiles
        .filter((p) => form.techIds.includes(p.id))
        .map((p) => ({ id: p.id, name: (p.full_name || p.email || '').trim(), address: p.address || null })),
    [profiles, form.techIds]
  );

  // Routing home → client (one-way km) per technician, debounced; reuses the project fuel logic + caches.
  const routeKey = `${normalizeFuelAddress(form.clientAddress)}|${techs.map((x) => `${x.id}:${x.address || ''}`).join(',')}`;
  useEffect(() => {
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

  const cac = useMemo(() => resolveCacAdsAmount({ monthKey: form.monthKey || null, cacheRows, spendRows }), [form.monthKey, cacheRows, spendRows]);

  const { calc } = useMemo(() => {
    const routedKm = Object.fromEntries(Object.entries(routing).map(([id, r]) => [id, r.status === 'ok' ? r.km : null]));
    return simulateMargin({
      inputs: { ...form, techs, routedKm, closer: form.closer || 'Remy' },
      params: params || {},
      prices: priceMap,
      dieselEurL: diesel,
      cacAdsAmount: cac?.status === 'ok' ? cac.amount : null,
      cacAdsStatus: cac?.status || null,
    });
  }, [form, techs, routing, params, priceMap, diesel, cac]);

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
      services: SERVICE_CODES.map((s) => ({ code: s.code, label: s.label })),
      products: productOptions(prices)
        .filter((p) => p.active)
        .map((p) => ({ ...p, price: priceMap[p.slug] ?? null })),
      closers: [...(params?.commercial_closers || [])].sort(),
    }),
    [profiles, prices, priceMap, params]
  );

  return (
    <SimulatorView
      t={t}
      lang={i18n.language}
      form={form}
      set={set}
      options={options}
      routing={routing}
      cac={cac}
      calc={calc}
      minPrice={minPrice}
      dieselEurL={diesel}
      params={params || {}}
      onReset={() => {
        setForm(defaultSimForm());
        setRouting({});
      }}
    />
  );
};

export default SimulatorTab;
