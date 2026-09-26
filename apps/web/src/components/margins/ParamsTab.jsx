import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, RefreshCw, Save, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { SERVICE_CODES, productLabel } from '@/lib/margin/constants';
import { updateMarginParams } from '@/lib/margin/api';
import { dieselSourceLabel, isDieselFresh, refreshDieselPrice } from '@/lib/margin/diesel';
import CacAdsPanel from './CacAdsPanel';
import { formatDateTime, formatNumber } from '@/lib/margin/format';

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const ParamsTab = ({ params, prices, onReload }) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => serialize(params));
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [innerTab, setInnerTab] = useState('couts');

  const [newCloser, setNewCloser] = useState('');

  React.useEffect(() => {
    setForm(serialize(params));
  }, [params]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleEssenceService = (code, checked) => {
    const cur = Array.isArray(form.essence_services) ? form.essence_services : [];
    const next = checked
      ? [...new Set([...cur, code])]
      : cur.filter((c) => c !== code);
    set('essence_services', next);
  };

  const handleSaveParams = async () => {
    setSaving(true);
    try {
      await updateMarginParams({
        eur_h: numOrNull(form.eur_h),
        com_rate: numOrNull(form.com_rate),
        // cac_rate retired in 1.6.18 — CAC ads is monthly €/client (CacAdsPanel)
        consumption_l100: numOrNull(form.consumption_l100),
        diesel_eur_l_fallback: numOrNull(form.diesel_eur_l_fallback),
        diesel_eur_l_live: numOrNull(form.diesel_eur_l_live),
        round_trip: Boolean(form.round_trip),
        essence_eur_l: numOrNull(form.essence_eur_l),
        essence_l_h: numOrNull(form.essence_l_h),
        essence_time_factor: numOrNull(form.essence_time_factor),
        essence_services: Array.isArray(form.essence_services) ? form.essence_services : [],
        commercial_closers: form.commercial_closers,
      });
      toast({ title: 'Paramètres enregistrés' });
      if (onReload) await onReload();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Échec', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshDiesel = async () => {
    setRefreshing(true);
    try {
      const data = await refreshDieselPrice();
      toast({
        title: 'Diesel B7 mis à jour',
        description: data?.price != null ? `${formatNumber(data.price, 3)} €/L (max Belgique)` : 'OK',
      });
      if (onReload) await onReload();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Rafraîchissement diesel impossible',
        description:
          err.message ||
          'Fonction diesel-price-be absente ou CORS. Saisissez le prix live manuellement.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const addCloser = () => {
    const name = newCloser.trim();
    if (!name) return;
    if (form.commercial_closers.includes(name)) return;
    set('commercial_closers', [...form.commercial_closers, name]);
    setNewCloser('');
  };

  const source = dieselSourceLabel(params);
  const fresh = isDieselFresh(params?.diesel_fetched_at);

  return (
    <div className="space-y-6 max-w-4xl">
      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="couts">Coûts &amp; taux</TabsTrigger>
          <TabsTrigger value="cac">CAC ads</TabsTrigger>
          <TabsTrigger value="carburant">Carburant</TabsTrigger>
          <TabsTrigger value="produits">Produits</TabsTrigger>
          <TabsTrigger value="closers">Closers</TabsTrigger>
        </TabsList>

        <TabsContent value="couts" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Coûts &amp; taux</CardTitle>
              <CardDescription>Main d’œuvre et commission closer. CAC ads → onglet dédié.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Taux horaire MO (€/h)" hint="eur_h">
                <Input
                  type="number"
                  step="0.01"
                  value={form.eur_h}
                  onChange={(e) => set('eur_h', e.target.value)}
                />
              </Field>
              <Field label="Taux commission closer" hint="ex. 0,10 = 10 %">
                <Input
                  type="number"
                  step="0.001"
                  value={form.com_rate}
                  onChange={(e) => set('com_rate', e.target.value)}
                />
              </Field>
              <div className="md:col-span-2 text-sm text-muted-foreground rounded-lg border border-dashed p-3">
                CAC / ads n’est plus un pourcentage. Voir l’onglet <strong>CAC ads</strong> :
                coût mensuel = dépense pub ÷ clients gagnés (mois d’entrée lead).
              </div>
            </CardContent>
          </Card>
          <SaveBar saving={saving} onSave={handleSaveParams} />
        </TabsContent>

        <TabsContent value="cac" className="mt-4 space-y-4">
          <CacAdsPanel />
        </TabsContent>

        <TabsContent value="carburant" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Diesel (camionnettes A/R)</CardTitle>
              <CardDescription>
                Live via Statbel (fonction <code>diesel-price-be</code>, cache 24 h). Sinon fallback
                manuel. Consommation et aller-retour pour le coût trajet.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prix live (€/L)">
                <Input
                  type="number"
                  step="0.001"
                  value={form.diesel_eur_l_live}
                  onChange={(e) => set('diesel_eur_l_live', e.target.value)}
                />
              </Field>
              <Field label="Fallback (€/L)">
                <Input
                  type="number"
                  step="0.001"
                  value={form.diesel_eur_l_fallback}
                  onChange={(e) => set('diesel_eur_l_fallback', e.target.value)}
                />
              </Field>
              <Field label="Conso. diesel (L / 100 km)">
                <Input
                  type="number"
                  step="0.1"
                  value={form.consumption_l100}
                  onChange={(e) => set('consumption_l100', e.target.value)}
                />
              </Field>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={Boolean(form.round_trip)}
                  onCheckedChange={(v) => set('round_trip', v)}
                  id="round-trip"
                />
                <Label htmlFor="round-trip">Aller-retour (trajet = 2 × distance route)</Label>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                    source === 'live'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : source === 'live-stale'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}
                >
                  {source === 'live' && 'Live frais'}
                  {source === 'live-stale' && 'Live > 24 h'}
                  {source === 'fallback' && 'Fallback'}
                </span>
                <span className="text-muted-foreground">
                  Dernier fetch : {formatDateTime(params?.diesel_fetched_at)}
                  {fresh ? ' (moins de 24 h)' : ''}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshDiesel}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Rafraîchir le diesel
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Essence (nettoyeurs HP / SC)</CardTitle>
              <CardDescription>
                Coût = heures × facteur temps (3/5) × conso L/h × prix €/L. Seule la part moteur
                compte (~1/5 spray + ~1/5 setup/cleanup exclus).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Prix essence (€/L)" hint="essence_eur_l">
                <Input
                  type="number"
                  step="0.001"
                  value={form.essence_eur_l}
                  onChange={(e) => set('essence_eur_l', e.target.value)}
                />
              </Field>
              <Field label="Conso. essence (L/h)" hint="défaut 2">
                <Input
                  type="number"
                  step="0.1"
                  value={form.essence_l_h}
                  onChange={(e) => set('essence_l_h', e.target.value)}
                />
              </Field>
              <Field
                label="Facteur temps essence"
                hint="défaut 0,6 (= 3/5) — part des heures HP/SC qui font tourner le moteur"
              >
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={form.essence_time_factor}
                  onChange={(e) => set('essence_time_factor', e.target.value)}
                />
              </Field>
              <div className="md:col-span-2 space-y-2">
                <Label>Services qui consomment de l’essence</Label>
                <div className="flex flex-wrap gap-3">
                  {SERVICE_CODES.map((s) => {
                    const checked = (form.essence_services || []).includes(s.code);
                    return (
                      <label
                        key={s.code}
                        className="inline-flex items-center gap-2 text-sm cursor-pointer rounded-lg border px-3 py-1.5"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleEssenceService(s.code, Boolean(v))}
                        />
                        {s.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar saving={saving} onSave={handleSaveParams} />
        </TabsContent>

        <TabsContent value="produits" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('fleet.marginsLink.title')}</CardTitle>
              <CardDescription>{t('fleet.marginsLink.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y rounded-xl border">
                {(prices || [])
                  .filter((row) => row.active !== false)
                  .map((row) => (
                    <div key={row.slug} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-[4px]"
                          style={{ backgroundColor: row.color || '#1e3a8a' }}
                        />
                        {row.name || productLabel(row.slug) || row.slug}
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatNumber(Number(row.price_eur_l ?? row.price ?? 0), 3)} €/L
                      </span>
                    </div>
                  ))}
              </div>
              <Button type="button" onClick={() => navigate('/fleet/products')}>
                <Truck className="h-4 w-4 mr-2" />
                {t('fleet.marginsLink.button')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closers" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Closers commerciaux</CardTitle>
              <CardDescription>
                Commission appliquée seulement si le closer du dossier est dans cette liste.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(form.commercial_closers || []).map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-3 py-1 text-sm"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          'commercial_closers',
                          form.commercial_closers.filter((n) => n !== name)
                        )
                      }
                      className="ml-1 text-blue-500 hover:text-red-500"
                      aria-label={`Retirer ${name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-sm">
                <Input
                  value={newCloser}
                  onChange={(e) => setNewCloser(e.target.value)}
                  placeholder="Prénom"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCloser();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addCloser}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          <SaveBar saving={saving} onSave={handleSaveParams} />
        </TabsContent>
      </Tabs>

    </div>
  );
};

function SaveBar({ saving, onSave }) {
  return (
    <div className="flex justify-end">
      <Button onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Enregistrer le paramétrage
      </Button>
    </div>
  );
}

function serialize(params) {
  return {
    eur_h: params?.eur_h ?? 26,
    com_rate: params?.com_rate ?? 0.1,
    consumption_l100: params?.consumption_l100 ?? 8,
    diesel_eur_l_fallback: params?.diesel_eur_l_fallback ?? 2.47,
    diesel_eur_l_live: params?.diesel_eur_l_live ?? '',
    round_trip: params?.round_trip !== false,
    essence_eur_l: params?.essence_eur_l ?? 1.85,
    essence_l_h: params?.essence_l_h ?? 2,
    essence_time_factor: params?.essence_time_factor ?? 0.6,
    essence_services: Array.isArray(params?.essence_services)
      ? params.essence_services
      : ['nettoyage', 'sc'],
    commercial_closers: Array.isArray(params?.commercial_closers)
      ? params.commercial_closers
      : ['Anthony', 'Bastien', 'Emilie', 'Thibeau'],
  };
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default ParamsTab;
