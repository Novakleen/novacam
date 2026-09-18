import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { VAT_RATES, sumInvoiceCaHt, ttcToHt } from '@/lib/margin/constants';
import { formatMoney } from '@/lib/margin/format';

const emptyInvoice = () => ({ ref: '', caHt: '', vatRate: 0.21, ttc: '' });

const InvoicesEditor = ({ invoices = [], onChange }) => {
  const rows = invoices.length ? invoices : [];

  const update = (index, patch) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const add = () => onChange([...rows, emptyInvoice()]);

  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  const applyTtc = (index, divisorRate) => {
    const row = rows[index];
    const ttc = Number(row.ttc);
    if (!Number.isFinite(ttc)) return;
    const ht = ttcToHt(ttc, divisorRate);
    update(index, { caHt: ht == null ? '' : Math.round(ht * 100) / 100, vatRate: divisorRate });
  };

  const total = sumInvoiceCaHt(rows);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Factures (HTVA)</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter une facture
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune facture. Le CA HT restera vide.</p>
      )}

      <div className="space-y-3">
        {rows.map((inv, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50/50 dark:bg-gray-900/40"
          >
            <div className="md:col-span-3">
              <Label className="text-xs">Réf.</Label>
              <Input
                value={inv.ref || ''}
                onChange={(e) => update(idx, { ref: e.target.value })}
                placeholder="2BLX-…"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">CA HT / HTVA (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={inv.caHt ?? ''}
                onChange={(e) => update(idx, { caHt: e.target.value === '' ? '' : Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">TVA</Label>
              <Select
                value={String(inv.vatRate ?? 0.21)}
                onValueChange={(v) => update(idx, { vatRate: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => (
                    <SelectItem key={r.rate} value={String(r.rate)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">TTC → HT</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="TTC"
                  value={inv.ttc ?? ''}
                  onChange={(e) => update(idx, { ttc: e.target.value })}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => applyTtc(idx, 0.06)}>
                  /1,06
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => applyTtc(idx, 0.21)}>
                  /1,21
                </Button>
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm font-medium">
        Total CA HT (HTVA) : <span className="tabular-nums">{formatMoney(total)}</span>
      </p>
    </div>
  );
};

export default InvoicesEditor;
