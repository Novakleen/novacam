import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, ShoppingCart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { slugifyProductName } from '@/lib/margin/constants';
import {
  createProduct,
  DEFAULT_PRODUCT_COLOR,
  fmtL,
  productName,
  updateProduct,
} from '@/lib/fleet/api';
import { NAVY, ProductDot, STATE_STYLES, YELLOW } from './FleetUI';
import MoveDialog from './MoveDialog';

const PALETTE = ['#16a34a', '#0ea5e9', '#65a30d', '#f59e0b', '#8b5cf6', '#ef4444', '#1e3a8a', '#ec4899', '#14b8a6', '#facc15'];

function totals(product, data, index) {
  let depot = 0;
  let vans = 0;
  const perLocation = [];
  for (const loc of data.locations) {
    const s = index.stockFor(loc, product);
    if (loc.kind === 'depot') depot += s.litres;
    else vans += s.litres;
    perLocation.push({ loc, ...s });
  }
  return { depot, vans, total: depot + vans, perLocation };
}

const ProductsPanel = ({ data, index, onReload }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const [openSlug, setOpenSlug] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const products = data.products.filter((p) => showInactive || p.active !== false);
  const inactiveCount = data.products.filter((p) => p.active === false).length;
  const openProduct = data.products.find((p) => p.slug === openSlug) || null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-gray-500 max-w-xl">{t('fleet.products.intro')}</p>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              {t('fleet.products.showInactive', { count: inactiveCount })}
            </label>
          )}
          <Button className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('fleet.products.create')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => {
          const tt = totals(p, data, index);
          const depotPct = tt.total ? (tt.depot / tt.total) * 100 : 0;
          const depotStock = index.depot ? index.stockFor(index.depot, p) : null;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setOpenSlug(p.slug)}
              className={cn(
                'text-left rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md transition-shadow space-y-3',
                p.active === false && 'opacity-50'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="h-12 w-10 rounded-xl flex items-end justify-center pb-1 shadow-inner" style={{ backgroundColor: p.color || DEFAULT_PRODUCT_COLOR }}>
                  <span className="h-1.5 w-5 rounded-full bg-white/60" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-lg truncate">{productName(p, lang)}</p>
                  <p className="text-xs text-gray-500">
                    {p.pack_litres ? t('fleet.products.pack', { litres: fmtL(p.pack_litres) }) : t('fleet.products.noPack')}
                    {p.active === false && ` · ${t('fleet.products.inactive')}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{t('fleet.products.priceHt')}</p>
                  <p className="font-bold tabular-nums">{Number(p.price_eur_l ?? 0).toFixed(2)} €/L</p>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-4xl font-black tabular-nums">{fmtL(tt.total)}</span>
                  <span className="ml-1 text-sm font-semibold text-gray-400">L {t('fleet.products.total')}</span>
                </div>
                {depotStock && depotStock.state !== 'ok' && (
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', STATE_STYLES[depotStock.state].chip)}>
                    {t('fleet.products.depotLow')}
                  </span>
                )}
              </div>
              <div>
                <div className="h-3 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-800">
                  <div style={{ width: `${depotPct}%`, backgroundColor: NAVY }} />
                  <div style={{ width: `${tt.total ? 100 - depotPct : 0}%`, backgroundColor: YELLOW }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>■ {t('fleet.depot')} {fmtL(tt.depot)} L</span>
                  <span>{t('fleet.products.vans')} {fmtL(tt.vans)} L</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {openProduct && (
        <ProductSheet
          product={openProduct}
          data={data}
          index={index}
          onClose={() => setOpenSlug(null)}
          onReload={onReload}
        />
      )}
      <ProductCreateDialog open={createOpen} onOpenChange={setCreateOpen} existing={data.products} onDone={onReload} />
    </div>
  );
};

const ProductFields = ({ form, setForm, t }) => (
  <div className="grid grid-cols-2 gap-3">
    <div className="space-y-1.5 col-span-2">
      <Label>{t('fleet.products.nameFr')}</Label>
      <Input className="h-11 rounded-xl" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('fleet.products.nameNl')}</Label>
      <Input className="h-11 rounded-xl" value={form.name_nl || ''} onChange={(e) => setForm((f) => ({ ...f, name_nl: e.target.value }))} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('fleet.products.nameEn')}</Label>
      <Input className="h-11 rounded-xl" value={form.name_en || ''} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('fleet.products.priceHtL')}</Label>
      <Input type="number" inputMode="decimal" step="0.001" className="h-11 rounded-xl" value={form.price_eur_l ?? ''} onChange={(e) => setForm((f) => ({ ...f, price_eur_l: e.target.value }))} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('fleet.products.packLitres')}</Label>
      <Input type="number" inputMode="decimal" className="h-11 rounded-xl" value={form.pack_litres ?? ''} onChange={(e) => setForm((f) => ({ ...f, pack_litres: e.target.value }))} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('fleet.products.minDepot')}</Label>
      <Input type="number" inputMode="decimal" className="h-11 rounded-xl" value={form.default_min_depot ?? ''} onChange={(e) => setForm((f) => ({ ...f, default_min_depot: e.target.value }))} />
    </div>
    <div className="space-y-1.5">
      <Label>{t('fleet.products.minVan')}</Label>
      <Input type="number" inputMode="decimal" className="h-11 rounded-xl" value={form.default_min_van ?? ''} onChange={(e) => setForm((f) => ({ ...f, default_min_van: e.target.value }))} />
    </div>
    <div className="space-y-1.5 col-span-2">
      <Label>{t('fleet.products.color')}</Label>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setForm((f) => ({ ...f, color: c }))}
            className={cn('h-9 w-9 rounded-full ring-offset-2', form.color === c && 'ring-2 ring-gray-900 dark:ring-white')}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
    <p className="col-span-2 text-xs text-gray-500">{t('fleet.products.unitHint')}</p>
  </div>
);

const ProductSheet = ({ product, data, index, onClose, onReload }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lang = index.lang;
  const [form, setForm] = useState(product);
  const [saving, setSaving] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  useEffect(() => setForm(product), [product]);

  const tt = totals(product, data, index);

  const save = async () => {
    if (!String(form.name || '').trim()) return;
    if (!Number.isFinite(Number(form.price_eur_l))) {
      toast({ variant: 'destructive', title: t('fleet.products.priceInvalid') });
      return;
    }
    setSaving(true);
    try {
      await updateProduct(product.slug, form);
      toast({ title: t('fleet.products.saved') });
      onReload?.();
      onClose();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.products.saveFailed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const locName = (loc) => (loc.kind === 'depot' ? t('fleet.depot') : index.vanById.get(loc.van_id)?.name || loc.name);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ProductDot color={form.color} className="h-4 w-4" />
              {productName(product, lang)}
            </DialogTitle>
            <DialogDescription>
              {t('fleet.products.slug')}: <code>{product.slug}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <label className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 px-4 h-12">
              <span className="font-medium">{t('fleet.products.active')}</span>
              <Switch checked={form.active !== false} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </label>
            {form.active === false && <p className="text-xs text-amber-600 -mt-3">{t('fleet.products.inactiveHint')}</p>}

            <ProductFields form={form} setForm={setForm} t={t} />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('fleet.products.stockByLocation')}</Label>
                <span className="text-sm font-bold">{fmtL(tt.total)} L</span>
              </div>
              <div className="space-y-1.5">
                {tt.perLocation.map(({ loc, litres, min, state }) => (
                  <div key={loc.id} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 h-10 text-sm">
                    <span className="font-medium">{locName(loc)}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{t('fleet.threshold', { litres: fmtL(min) })}</span>
                      <span className={cn('font-bold tabular-nums', STATE_STYLES[state].text)}>{fmtL(litres)} L</span>
                    </span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full rounded-2xl h-11" onClick={() => setPurchaseOpen(true)} disabled={product.active === false}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                {t('fleet.products.purchaseToDepot')}
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {purchaseOpen && index.depot && (
        <MoveDialog
          open={purchaseOpen}
          onOpenChange={setPurchaseOpen}
          mode="purchase"
          location={index.depot}
          presetSlug={product.slug}
          index={index}
          vans={data.vans}
          isAdmin
          onDone={onReload}
        />
      )}
    </>
  );
};

const EMPTY = {
  name: '',
  name_nl: '',
  name_en: '',
  price_eur_l: '',
  pack_litres: '',
  default_min_depot: 25,
  default_min_van: 10,
  color: PALETTE[0],
  active: true,
};

const ProductCreateDialog = ({ open, onOpenChange, existing, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...EMPTY, color: PALETTE[(existing?.length || 0) % PALETTE.length] });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const slug = slugifyProductName(form.name);
  const duplicate = Boolean(slug) && (existing || []).some((p) => p.slug === slug);

  const submit = async () => {
    if (!slug) {
      toast({ variant: 'destructive', title: t('fleet.products.nameRequired') });
      return;
    }
    if (!Number.isFinite(Number(form.price_eur_l)) || form.price_eur_l === '') {
      toast({ variant: 'destructive', title: t('fleet.products.priceInvalid') });
      return;
    }
    if (duplicate) return;
    setSaving(true);
    try {
      await createProduct(slug, {
        ...form,
        sort: ((existing || []).reduce((m, p) => Math.max(m, p.sort || 0), 0) || 0) + 10,
      });
      toast({ title: t('fleet.products.created'), description: slug });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.products.saveFailed'), description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('fleet.products.create')}</DialogTitle>
          <DialogDescription>
            {t('fleet.products.slug')}: <code>{slug || '—'}</code>
            {duplicate && <span className="text-red-600"> · {t('fleet.products.duplicate')}</span>}
          </DialogDescription>
        </DialogHeader>
        <ProductFields form={form} setForm={setForm} t={t} />
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={saving || duplicate || !slug}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fleet.products.createConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductsPanel;
