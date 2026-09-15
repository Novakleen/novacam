import React, { useState } from 'react';
import { Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { productLabel } from '@/lib/margin/constants';
import { updateMarginParams, updateProductPrice } from '@/lib/margin/api';
import { dieselSourceLabel, isDieselFresh, refreshDieselPrice } from '@/lib/margin/diesel';
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
  const [form, setForm] = useState(() => serialize(params));
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [priceEdits, setPriceEdits] = useState({});
  const [newCloser, setNewCloser] = useState('');

  React.useEffect(() => {
    setForm(serialize(params));
  }, [params]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMarginParams({
        eur_h: numOrNull(form.eur_h),
        com_rate: numOrNull(form.com_rate),
        cac_rate: numOrNull(form.cac_rate),
        consumption_l100: numOrNull(form.consumption_l100),
        diesel_eur_l_fallback: numOrNull(form.diesel_eur_l_fallback),
        diesel_eur_l_live: numOrNull(form.diesel_eur_l_live),
        round_trip: Boolean(form.round_trip),
        commercial_closers: form.commercial_closers,
      });

      for (const row of prices || []) {
        const key = row.id || row.slug;
        if (key in priceEdits) {
          await updateProductPrice(row, { price: Number(priceEdits[key]) });
        }
      }
      setPriceEdits({});
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
      <Card>
        <CardHeader>
          <CardTitle>Coûts &amp; taux</CardTitle>
          <CardDescription>
            Main d’œuvre, commission closer, CAC et consommation carburant.
          </CardDescription>
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
          <Field label="Taux CAC / ads" hint="ex. 0,055 = 5,5 %">
            <Input
              type="number"
              step="0.001"
              value={form.cac_rate}
              onChange={(e) => set('cac_rate', e.target.value)}
            />
          </Field>
          <Field label="Conso. (L / 100 km)">
            <Input
              type="number"
              step="0.1"
              value={form.consumption_l100}
              onChange={(e) => set('consumption_l100', e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3 md:col-span-2 pt-2">
            <Switch
              checked={Boolean(form.round_trip)}
              onCheckedChange={(v) => set('round_trip', v)}
              id="round-trip"
            />
            <Label htmlFor="round-trip">Aller-retour (×2 sur le km one-way)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diesel B7 (Belgique, max TTC)</CardTitle>
          <CardDescription>
            Live via Statbel (fonction <code>diesel-price-be</code>, cache 24 h). Sinon fallback
            manuel. Pas de repli €/h si le trajet est incomplet.
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
            <Button type="button" variant="outline" size="sm" onClick={handleRefreshDiesel} disabled={refreshing}>
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
          <CardTitle>Prix produits (€ / L)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(prices || []).map((row) => (
            <div key={row.id || row.slug} className="grid grid-cols-2 md:grid-cols-3 gap-3 items-center">
              <Label className="font-medium">{productLabel(row.slug || row.product) || row.slug}</Label>
              <Input
                type="number"
                step="0.0001"
                value={priceEdits[row.id || row.slug] ?? row.price ?? row.price_eur_l ?? ''}
                onChange={(e) =>
                  setPriceEdits((prev) => ({ ...prev, [row.id || row.slug]: e.target.value }))
                }
              />
            </div>
          ))}
          {(!prices || !prices.length) && (
            <p className="text-sm text-muted-foreground">Aucun prix produit en base.</p>
          )}
        </CardContent>
      </Card>

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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer le paramétrage
        </Button>
      </div>
    </div>
  );
};

function serialize(params) {
  return {
    eur_h: params?.eur_h ?? 26,
    com_rate: params?.com_rate ?? 0.1,
    cac_rate: params?.cac_rate ?? 0.055,
    consumption_l100: params?.consumption_l100 ?? 8,
    diesel_eur_l_fallback: params?.diesel_eur_l_fallback ?? 2.47,
    diesel_eur_l_live: params?.diesel_eur_l_live ?? '',
    round_trip: params?.round_trip !== false,
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
