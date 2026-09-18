import React from 'react';
import { Fuel, Pencil, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { formatHours, formatKm, formatMoney, formatPct } from '@/lib/margin/format';
import { productLabel, serviceLabel } from '@/lib/margin/constants';
import MaPercentBadge from './MaPercentBadge';
import CompletenessFlags from './CompletenessFlags';

const Row = ({ label, value, muted }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={muted ? 'text-muted-foreground tabular-nums' : 'font-medium tabular-nums'}>
      {value}
    </span>
  </div>
);

const DossierDetail = ({
  dossier,
  calc,
  prices,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}) => {
  if (!dossier) return null;
  const hourLines = dossier.hour_lines || [];
  const productLines = dossier.product_lines || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{dossier.client_name || 'Dossier'}</SheetTitle>
          <SheetDescription>
            {dossier.mix || 'Mix non renseigné'}
            {dossier.closer ? ` · ${dossier.closer}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <MaPercentBadge maPct={calc?.maPct} className="text-sm px-3 py-1" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-1" /> Modifier
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Supprimer
              </Button>
            </div>
          </div>

          <CompletenessFlags flags={calc?.flags} />

          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              Décomposition
            </p>
            <Row label="CA HT (HTVA)" value={formatMoney(calc?.caHt)} />
            <Row label="Coût produits" value={formatMoney(calc?.productCost)} muted />
            <Row
              label={`Main d’œuvre (${formatHours(calc?.personHours)})`}
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
              label={calc?.fuelIncomplete ? 'Carburant total (incomplet)' : 'Carburant total'}
              value={formatMoney(calc?.fuel)}
              muted
            />
            <div className="border-t border-dashed my-1" />
            <Row label="Coût direct" value={formatMoney(calc?.direct)} />
            <Row label="Marge brute (MB)" value={formatMoney(calc?.mb)} />
            <Row
              label={calc?.commercial ? 'Commission closer' : 'Commission (non closer)'}
              value={formatMoney(calc?.com)}
              muted
            />
            <Row label="Acquisition (CAC)" value={formatMoney(calc?.ads)} muted />
            <div className="border-t my-1" />
            <Row label="Marge après acquisition (MA)" value={formatMoney(calc?.ma)} />
            <Row label="MA %" value={formatPct(calc?.maPct)} />
          </div>

          {calc?.fuelDays?.length > 0 && (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
                <Fuel className="h-3.5 w-3.5" /> Trajets
              </p>
              {calc.fuelDays.map((d) => (
                <div key={d.date} className="text-sm flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {d.date} · {d.driverName || '—'}
                  </span>
                  <span className="tabular-nums">
                    {d.km == null ? 'km indisponible' : `${formatKm(d.km)}${d.roundTrip ? ' A/R' : ''} · ${formatMoney(d.cost)}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hourLines.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Heures</p>
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

          {dossier.client_address && (
            <p className="text-xs text-muted-foreground">{dossier.client_address}</p>
          )}
          {dossier.notes && <p className="text-sm whitespace-pre-wrap">{dossier.notes}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DossierDetail;
