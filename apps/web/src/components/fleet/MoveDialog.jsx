import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Loader2, Minus, Plus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  ADJUST_REASONS,
  createMove,
  fmtL,
  isStockNegativeError,
  productName,
  todayISO,
} from '@/lib/fleet/api';
import { NAVY, ProductDot, YELLOW } from './FleetUI';

const STEPS = [5, 10, 25];

/**
 * mode: 'transfer' | 'adjust' | 'purchase'
 * location: the location the sheet was opened from (van or depot).
 */
const MoveDialog = ({ open, onOpenChange, mode: initialMode, location, presetSlug, index, vans, isAdmin, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lang = index.lang;
  const [mode, setMode] = useState(initialMode);
  const [slug, setSlug] = useState(presetSlug || '');
  const [qty, setQty] = useState(10);
  const [custom, setCustom] = useState(false);
  const [direction, setDirection] = useState('in'); // transfer: in = depot→van ; out = van→depot. adjust: in=+ / out=−
  const [targetVanLoc, setTargetVanLoc] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [moveDate, setMoveDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const isDepot = location?.kind === 'depot';
  const depot = index.depot;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSlug(presetSlug || index.activeProducts[0]?.slug || '');
    setQty(initialMode === 'purchase' ? 25 : 10);
    setCustom(false);
    setDirection(initialMode === 'adjust' ? 'out' : 'in');
    setReason('');
    setNote('');
    setSupplier('');
    setMoveDate(todayISO());
    const firstVanLoc = vans.map((v) => index.locationByVan.get(v.id)).find(Boolean);
    setTargetVanLoc(firstVanLoc?.id || '');
    const p = index.productBySlug.get(presetSlug);
    setUnitPrice(p?.price_eur_l ?? '');
  }, [open, initialMode, presetSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'purchase') {
      const p = index.productBySlug.get(slug);
      setUnitPrice(p?.price_eur_l ?? '');
    }
  }, [slug, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const product = index.productBySlug.get(slug);

  // Resolve from / to
  const { fromLoc, toLoc } = useMemo(() => {
    if (!location) return { fromLoc: null, toLoc: null };
    if (mode === 'purchase') return { fromLoc: null, toLoc: location };
    if (mode === 'adjust') {
      return direction === 'in' ? { fromLoc: null, toLoc: location } : { fromLoc: location, toLoc: null };
    }
    // transfer
    if (isDepot) {
      const van = index.locationById.get(targetVanLoc) || null;
      return direction === 'in' ? { fromLoc: depot, toLoc: van } : { fromLoc: van, toLoc: depot };
    }
    return direction === 'in' ? { fromLoc: depot, toLoc: location } : { fromLoc: location, toLoc: depot };
  }, [mode, direction, location, isDepot, depot, targetVanLoc, index]);

  const available = fromLoc && product ? index.stockFor(fromLoc, product).litres : null;
  const q = Number(qty);
  const qtyValid = Number.isFinite(q) && q > 0;
  const overdraw = available != null && qtyValid && q > available + 1e-9;
  const reasonMissing = mode === 'adjust' && !reason;
  const canSave = Boolean(product) && qtyValid && !overdraw && !reasonMissing && (mode !== 'transfer' || (fromLoc && toLoc));

  const locName = (loc) => {
    if (!loc) return '—';
    if (loc.kind === 'depot') return t('fleet.depot');
    return index.vanById.get(loc.van_id)?.name || loc.name;
  };

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createMove({
        type: mode,
        product_slug: slug,
        qty_litres: q,
        from_location_id: fromLoc?.id || null,
        to_location_id: toLoc?.id || null,
        reason: mode === 'adjust' ? reason : null,
        note: note.trim() || null,
        unit_price: mode === 'purchase' ? unitPrice : null,
        supplier: mode === 'purchase' ? supplier.trim() || null : null,
        move_date: moveDate || todayISO(),
      });
      toast({ title: t('fleet.move.saved'), description: `${fmtL(q)} L · ${productName(product, lang)}` });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('fleet.move.failed'),
        description: isStockNegativeError(err) ? t('fleet.move.negativeBlocked') : err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const title = {
    transfer: t('fleet.move.transferTitle'),
    adjust: t('fleet.move.adjustTitle'),
    purchase: t('fleet.move.purchaseTitle'),
  }[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{locName(location)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product chips */}
          <div className="space-y-2">
            <Label>{t('fleet.product')}</Label>
            <div className="flex flex-wrap gap-2">
              {index.activeProducts.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setSlug(p.slug)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 h-10 text-sm font-medium',
                    slug === p.slug
                      ? 'border-transparent text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                  )}
                  style={slug === p.slug ? { backgroundColor: NAVY } : undefined}
                >
                  <ProductDot color={p.color} />
                  {productName(p, lang)}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          {mode === 'transfer' && (
            <div className="space-y-2">
              {isDepot && (
                <div className="space-y-2">
                  <Label>{t('fleet.move.van')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {vans.map((v) => {
                      const loc = index.locationByVan.get(v.id);
                      if (!loc) return null;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setTargetVanLoc(loc.id)}
                          className={cn(
                            'rounded-full border px-3 h-10 text-sm font-medium',
                            targetVanLoc === loc.id
                              ? 'border-transparent text-white'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                          )}
                          style={targetVanLoc === loc.id ? { backgroundColor: NAVY } : undefined}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {['in', 'out'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={cn(
                      'rounded-2xl border h-11 text-sm font-semibold',
                      direction === d ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
                    )}
                    style={direction === d ? { backgroundColor: NAVY } : undefined}
                  >
                    {d === 'in' ? t('fleet.move.depotToVan') : t('fleet.move.vanToDepot')}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                <span>{locName(fromLoc)}</span>
                <ArrowRight className="h-4 w-4" />
                <span>{locName(toLoc)}</span>
              </div>
            </div>
          )}

          {mode === 'adjust' && (
            <div className="grid grid-cols-2 gap-2">
              {[
                ['out', Minus, t('fleet.move.adjustMinus')],
                ['in', Plus, t('fleet.move.adjustPlus')],
              ].map(([d, Icon, label]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={cn(
                    'rounded-2xl border h-11 text-sm font-semibold inline-flex items-center justify-center gap-1.5',
                    direction === d ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
                  )}
                  style={direction === d ? { backgroundColor: NAVY } : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Litres stepper */}
          <div className="space-y-2">
            <Label>{t('fleet.move.litres')}</Label>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                className="h-12 w-12 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center"
                onClick={() => setQty((v) => Math.max(0, Number(v || 0) - 1))}
                aria-label="-1"
              >
                <Minus className="h-5 w-5" />
              </button>
              <div className="text-center min-w-[6rem]">
                <span className="text-5xl font-black tabular-nums" style={{ color: NAVY }}>
                  {qtyValid ? fmtL(q) : 0}
                </span>
                <span className="ml-1 text-lg font-bold text-gray-400">L</span>
              </div>
              <button
                type="button"
                className="h-12 w-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: YELLOW, color: NAVY }}
                onClick={() => setQty((v) => Number(v || 0) + 1)}
                aria-label="+1"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setCustom(false);
                    setQty(s);
                  }}
                  className={cn(
                    'h-11 rounded-2xl border text-sm font-bold',
                    !custom && q === s ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
                  )}
                  style={!custom && q === s ? { backgroundColor: NAVY } : undefined}
                >
                  {s} L
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustom(true)}
                className={cn(
                  'h-11 rounded-2xl border text-sm font-bold',
                  custom ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
                )}
                style={custom ? { backgroundColor: NAVY } : undefined}
              >
                {t('fleet.move.custom')}
              </button>
            </div>
            {custom && (
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                className="h-11 rounded-xl text-center text-lg"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
              />
            )}
            {available != null && (
              <p className="text-xs text-center text-gray-500">
                {t('fleet.move.available', { place: locName(fromLoc), litres: fmtL(available) })}
              </p>
            )}
          </div>

          {overdraw && (
            <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 space-y-2">
              <p className="flex items-start gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {t('fleet.move.overdraw', { place: locName(fromLoc), litres: fmtL(available) })}
              </p>
              <div className="flex flex-wrap gap-2">
                {mode !== 'transfer' && !isDepot && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setMode('transfer'); setDirection('in'); }}>
                    {t('fleet.move.suggestTransfer')}
                  </Button>
                )}
                {mode === 'transfer' && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setMode('adjust'); setDirection('in'); }}>
                    {t('fleet.move.suggestAdjust')}
                  </Button>
                )}
                {mode === 'transfer' && isAdmin && isDepot && fromLoc?.kind === 'depot' && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setMode('purchase'); }}>
                    {t('fleet.move.suggestPurchase')}
                  </Button>
                )}
                {mode !== 'purchase' && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setQty(available)} disabled={!available}>
                    {t('fleet.move.useAvailable', { litres: fmtL(available) })}
                  </Button>
                )}
              </div>
            </div>
          )}

          {mode === 'adjust' && (
            <div className="space-y-2">
              <Label>{t('fleet.move.reason')} *</Label>
              <div className="grid grid-cols-2 gap-2">
                {ADJUST_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      'h-11 rounded-2xl border text-sm font-semibold',
                      reason === r ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
                    )}
                    style={reason === r ? { backgroundColor: NAVY } : undefined}
                  >
                    {t(`fleet.reasons.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'purchase' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('fleet.move.unitPrice')}</Label>
                <Input type="number" inputMode="decimal" step="0.001" className="h-11 rounded-xl" value={unitPrice ?? ''} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fleet.move.date')}</Label>
                <Input type="date" className="h-11 rounded-xl" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>{t('fleet.move.supplier')}</Label>
                <Input className="h-11 rounded-xl" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
              <p className="col-span-2 text-xs text-gray-500">{t('fleet.move.purchasePriceHint')}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('fleet.move.note')}</Label>
            <Textarea rows={2} className="rounded-xl" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            className="rounded-full h-11 px-6 font-bold"
            style={{ backgroundColor: YELLOW, color: NAVY }}
            onClick={submit}
            disabled={!canSave || saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fleet.move.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MoveDialog;
