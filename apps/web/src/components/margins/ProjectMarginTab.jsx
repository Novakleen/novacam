import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Fuel,
  Loader2,
  PieChart,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchDossierForProject,
  fetchMarginParams,
  fetchProductPrices,
  fetchTeamProfiles,
  pricesMap,
  upsertProjectDossier,
} from '@/lib/margin/api';
import { calculateProjectMargin, effectiveDiesel } from '@/lib/margin/calculateProjectMargin';
import { importFromProject, computeLiveFingerprint } from '@/lib/margin/importFromProject';
import { resolveFuelByDate } from '@/lib/margin/fuel';
import { formatHours, formatKm, formatMoney, formatPct } from '@/lib/margin/format';
import { productLabel, serviceLabel } from '@/lib/margin/constants';
import MaPercentBadge from './MaPercentBadge';
import CompletenessFlags from './CompletenessFlags';

/**
 * Marge tab on project fiche.
 * Admin: Générer / Régénérer. All roles: view snapshot if present.
 */

async function fetchExpensesHt(projectId, companycamProjectId) {
  let query = supabase.from('project_expenses').select('amount_ht');
  const ccId = companycamProjectId ? String(companycamProjectId) : null;
  if (projectId && ccId) {
    query = query.or(`project_id.eq.${projectId},companycam_project_id.eq.${ccId}`);
  } else if (ccId) {
    query = query.eq('companycam_project_id', ccId);
  } else if (projectId) {
    query = query.eq('project_id', projectId);
  } else {
    return 0;
  }
  const { data, error } = await query;
  if (error) return 0;
  return (data || []).reduce((s, e) => s + (Number(e.amount_ht) || 0), 0);
}

const ProjectMarginTab = ({
  projectId = null,
  companycamProjectId = null,
  projectName = '',
  projectAddress = '',
  isAdmin = false,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dossier, setDossier] = useState(null);
  const [params, setParams] = useState(null);
  const [prices, setPrices] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [fuelByDate, setFuelByDate] = useState({});
  const [fuelLoading, setFuelLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [closer, setCloser] = useState('');
  const [editingCloser, setEditingCloser] = useState(false);
  const [otherExpenses, setOtherExpenses] = useState(0);

  const load = useCallback(async () => {
    if (!projectId && !companycamProjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [d, p, pr, team] = await Promise.all([
        fetchDossierForProject({ projectId, companycamProjectId }),
        fetchMarginParams(),
        fetchProductPrices(),
        fetchTeamProfiles(),
      ]);
      setDossier(d);
      setParams(p);
      setPrices(pr);
      setProfiles(team);
      setCloser(d?.closer || '');

      // Autres dépenses live (incluses dans le coût direct à la génération)
      setOtherExpenses(await fetchExpensesHt(projectId, companycamProjectId));

      if (d?.source_fingerprint) {
        const live = await computeLiveFingerprint(supabase, {
          projectId,
          companycamProjectId,
        });
        setStale(!live.error && live.fingerprint !== d.source_fingerprint);
      } else {
        setStale(false);
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Chargement marge impossible',
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, companycamProjectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!dossier) {
        setFuelByDate({});
        return;
      }
      setFuelLoading(true);
      const fuel = await resolveFuelByDate({
        hourLines: dossier.hour_lines || [],
        clientAddress: dossier.client_address,
      });
      if (!cancelled) {
        setFuelByDate(fuel);
        setFuelLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [dossier]);

  const priceMap = useMemo(() => pricesMap(prices), [prices]);
  const diesel = useMemo(() => effectiveDiesel(params || {}), [params]);

  const calc = useMemo(() => {
    if (!dossier || !params) return null;
    return calculateProjectMargin({
      dossier,
      hourLines: dossier.hour_lines || [],
      productLines: dossier.product_lines || [],
      params,
      prices: priceMap,
      fuelByDate,
      dieselEurL: diesel,
      otherExpenses,
    });
  }, [dossier, params, priceMap, fuelByDate, diesel, otherExpenses]);

  const closerOptions = useMemo(() => {
    const names = new Set(params?.commercial_closers || []);
    profiles.forEach((p) => {
      const first = (p.full_name || '').split(' ')[0];
      if (first) names.add(first);
      if (p.full_name) names.add(p.full_name);
    });
    if (closer) names.add(closer);
    return [...names].filter(Boolean).sort();
  }, [params, profiles, closer]);

  const handleGenerate = async () => {
    if (!isAdmin) return;
    setGenerating(true);
    try {
      const imported = await importFromProject(supabase, {
        projectId,
        companycamProjectId,
        clientAddressHint: projectAddress,
      });
      if (imported.error) throw new Error(imported.error);

      const address =
        imported.client_address || projectAddress || dossier?.client_address || '';
      const name = imported.client_name || projectName || dossier?.client_name || '';
      // Prefer HubSpot contact owner (from import); keep manual override if already set in UI
      const chosenCloser =
        (imported.closer && imported.closer.trim()) ||
        (closer && closer.trim()) ||
        (dossier?.closer && String(dossier.closer).trim()) ||
        '';

      const hourLines = imported.hourLines || [];
      const productLines = imported.productLines || [];
      const invoices = imported.invoices || [];
      const fuel = await resolveFuelByDate({ hourLines, clientAddress: address });

      const draft = {
        project_id: imported.project_id || projectId || null,
        companycam_project_id:
          imported.companycam_project_id ||
          (companycamProjectId ? String(companycamProjectId) : null),
        client_name: name,
        client_address: address,
        closer: chosenCloser || null,
        mix:
          dossier?.mix ||
          [...new Set((hourLines || []).map((l) => String(l.service || '').trim().toLowerCase()).filter(Boolean))].join('+') ||
          'autre',
        exception: dossier?.exception ?? false,
        invoices,
        notes: dossier?.notes || null,
        ca_ht: imported.ca_ht,
        other_expenses: imported.otherExpenses || 0,
      };

      const nextCalc = calculateProjectMargin({
        dossier: draft,
        hourLines,
        productLines,
        params: params || {},
        prices: priceMap,
        fuelByDate: fuel,
        dieselEurL: diesel,
        otherExpenses: imported.otherExpenses || 0,
      });

      await upsertProjectDossier({
        dossier: draft,
        hourLines,
        productLines,
        calc: nextCalc,
        fingerprint: imported.source_fingerprint,
        existingId: dossier?.id || null,
      });

      if (chosenCloser) setCloser(chosenCloser);
      toast({
        title: dossier ? 'Marge régénérée' : 'Marge générée',
        description: imported.ca_ht != null
          ? `CA HT (HTVA) HubSpot : ${formatMoney(imported.ca_ht)}`
          : 'Pas de facture HubSpot liée — CA HT manquant.',
      });
      setEditingCloser(false);
      await load();
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Génération impossible',
        description: err.message,
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveCloser = async () => {
    if (!isAdmin || !dossier?.id) return;
    setGenerating(true);
    try {
      const draft = {
        ...dossier,
        closer: closer || null,
        project_id: dossier.project_id,
        companycam_project_id: dossier.companycam_project_id,
        invoices: Array.isArray(dossier.invoices) ? dossier.invoices : [],
      };
      const nextCalc = calculateProjectMargin({
        dossier: draft,
        hourLines: dossier.hour_lines || [],
        productLines: dossier.product_lines || [],
        params: params || {},
        prices: priceMap,
        fuelByDate,
        dieselEurL: diesel,
        otherExpenses,
      });
      await upsertProjectDossier({
        dossier: draft,
        hourLines: dossier.hour_lines || [],
        productLines: dossier.product_lines || [],
        calc: nextCalc,
        fingerprint: dossier.source_fingerprint,
        existingId: dossier.id,
      });
      toast({ title: 'Closer enregistré' });
      setEditingCloser(false);
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Enregistrement impossible', description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Chargement de la marge…</p>
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center space-y-4">
        <PieChart className="h-10 w-10 text-gray-300 mx-auto" />
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Aucune marge générée</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            La marge se calcule à partir du Suivi (heures, pulvérisation, dépenses) et de la
            facture HubSpot liée. Paramètres globaux dans Admin → Marge chantiers.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <PieChart className="h-4 w-4 mr-1.5" />
            )}
            Générer
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Seul un Admin peut générer la marge.</p>
        )}
      </div>
    );
  }

  const hourLines = dossier.hour_lines || [];
  const productLines = dossier.product_lines || [];

  return (
    <div className="space-y-5">
      {stale && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Marge plus à jour
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Heures, pulvérisation, dépenses ou facture HubSpot ont changé depuis la dernière
                génération.
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 bg-white dark:bg-amber-950"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Régénérer
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MaPercentBadge maPct={calc?.maPct ?? dossier.ma_pct} className="text-sm px-3 py-1" />
          {(calc?.ma != null || dossier.ma != null) && (
            <span className="text-sm text-muted-foreground tabular-nums">
              MA {formatMoney(calc?.ma ?? dossier.ma)}
            </span>
          )}
          {dossier.generated_at && (
            <span className="text-xs text-muted-foreground">
              Générée le{' '}
              {new Date(dossier.generated_at).toLocaleString('fr-BE', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          )}
          {fuelLoading && (
            <span className="text-xs text-muted-foreground">Calcul trajets…</span>
          )}
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Régénérer
          </Button>
        )}
      </div>

      <CompletenessFlags flags={calc?.flags} />

      {isAdmin && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Closer
            </Label>
            {!editingCloser ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditingCloser(true)}
              >
                <Pencil className="h-3 w-3 mr-1" /> Modifier
              </Button>
            ) : null}
          </div>
          {editingCloser ? (
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[160px]">
                <Select value={closer || '__none__'} onValueChange={(v) => setCloser(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Closer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {closerOptions.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                className="max-w-[160px]"
                placeholder="Autre…"
                value={closerOptions.includes(closer) ? '' : closer}
                onChange={(e) => setCloser(e.target.value)}
              />
              <Button size="sm" onClick={handleSaveCloser} disabled={generating}>
                Enregistrer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCloser(dossier.closer || ''); setEditingCloser(false); }}>
                Annuler
              </Button>
            </div>
          ) : (
            <p className="text-sm">{dossier.closer || '— non renseigné'}</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          Décomposition
        </p>
        <Row label="CA HT (HTVA)" value={formatMoney(calc?.caHt ?? dossier.ca_ht)} />
        <Row label="Coût produits" value={formatMoney(calc?.productCost)} muted />
        <Row
          label={`Main d’œuvre (${formatHours(calc?.personHours ?? dossier.person_hours)})`}
          value={formatMoney(calc?.mo)}
          muted
        />
        <Row
          label={
            calc?.fuelIncomplete
              ? `Diesel trajet (adresses manquantes)${calc?.roundTrip !== false ? ' · A/R' : ''}`
              : calc?.fuelRoutingFailed
                ? `Diesel trajet (échec géocode)${calc?.roundTrip !== false ? ' · A/R' : ''}`
                : `Diesel trajet${calc?.roundTrip !== false ? ' (A/R)' : ''}`
          }
          value={
            calc?.dieselFuel != null
              ? formatMoney(calc.dieselFuel)
              : calc?.fuelRoutingFailed
                ? 'échec géocode'
                : calc?.fuelIncomplete
                  ? 'adresses manquantes'
                  : formatMoney(calc?.dieselFuel)
          }
          muted
        />
        <Row
          label={
            calc?.essenceHours
              ? `Essence HP/SC (${formatHours(calc.essenceHours)})`
              : 'Essence HP/SC'
          }
          value={formatMoney(calc?.essenceFuel)}
          muted
        />
        <Row
          label={
            calc?.fuelIncomplete
              ? 'Carburant total (incomplet)'
              : 'Carburant total'
          }
          value={formatMoney(calc?.fuel)}
          muted
        />
        {calc?.otherExpenses > 0 && (
          <Row label="Autres dépenses" value={formatMoney(calc.otherExpenses)} muted />
        )}
        <div className="border-t border-dashed my-1" />
        <Row label="Coût direct" value={formatMoney(calc?.direct ?? dossier.direct_cost)} />
        <Row label="Marge brute (MB)" value={formatMoney(calc?.mb ?? dossier.mb)} />
        <Row
          label={calc?.commercial ? 'Commission closer' : 'Commission (non closer)'}
          value={formatMoney(calc?.com)}
          muted
        />
        <Row label="Acquisition (CAC)" value={formatMoney(calc?.ads)} muted />
        <div className="border-t my-1" />
        <Row label="Marge après acquisition (MA)" value={formatMoney(calc?.ma ?? dossier.ma)} />
        <Row label="MA %" value={formatPct(calc?.maPct ?? dossier.ma_pct)} />
      </div>

      {calc?.fuelDays?.length > 0 && (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
            <Fuel className="h-3.5 w-3.5" /> Trajets diesel
          </p>
          {calc.fuelDays.map((d) => (
            <div key={d.date} className="text-sm flex justify-between gap-2">
              <span className="text-muted-foreground">
                {d.date} · {d.driverName || '—'}
                {d.homeAddress ? (
                  <span className="block text-[11px] opacity-70 truncate max-w-[240px]">
                    {d.homeAddress}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums shrink-0">
                {d.km == null
                  ? d.homeAddress && dossier.client_address
                    ? 'échec géocode'
                    : 'adresses / km indisponible'
                  : `${formatKm(d.km)}${d.roundTrip ? ' A/R' : ''} · ${formatMoney(d.cost)}`}
              </span>
            </div>
          ))}
          {dossier.client_address ? (
            <p className="text-[11px] text-muted-foreground pt-1">
              Client : {dossier.client_address}
            </p>
          ) : null}
        </div>
      )}

      {hourLines.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Heures importées</p>
          {hourLines.map((l) => (
            <div key={l.id || `${l.work_date}-${l.service}`} className="text-sm">
              <span className="font-medium">{l.work_date}</span>
              {' · '}
              {serviceLabel(l.service)}
              <ul className="ml-4 text-muted-foreground">
                {(l.people || []).map((p, i) => (
                  <li key={i}>
                    {p.name} — {formatHours(p.hours)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {productLines.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Produits</p>
          {productLines.map((l) => (
            <div key={l.id || `${l.work_date}-${l.product}`} className="text-sm flex justify-between">
              <span>
                {l.work_date} · {productLabel(l.product, prices)}
              </span>
              <span className="tabular-nums">
                {l.liters} L{l.m2 ? ` · ${l.m2} m²` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(dossier.invoices) && dossier.invoices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Factures</p>
          {dossier.invoices.map((inv, i) => (
            <div key={i} className="text-sm flex justify-between">
              <span>{inv.ref || `Facture ${i + 1}`}</span>
              <span className="tabular-nums">{formatMoney(inv.caHt ?? inv.ca_ht)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, muted }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={muted ? 'text-muted-foreground tabular-nums' : 'font-medium tabular-nums'}>
      {value}
    </span>
  </div>
);

export default ProjectMarginTab;
