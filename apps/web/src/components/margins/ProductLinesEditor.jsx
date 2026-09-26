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
import { productOptions } from '@/lib/margin/constants';
import { todayISODate } from '@/lib/timeTracking';

const emptyLine = (defaultSlug = 'biomix') => ({
  work_date: todayISODate(),
  product: defaultSlug,
  liters: '',
  m2: '',
});

const ProductLinesEditor = ({ lines = [], onChange, prices }) => {
  const allOptions = productOptions(prices);
  // Inactive products (Flotte › Produits) are hidden for new lines but kept on existing ones
  const options = allOptions.filter((p) => p.active !== false);
  const optionsFor = (slug) =>
    allOptions.filter((p) => p.active !== false || p.slug === slug);
  const defaultSlug = options[0]?.slug || allOptions[0]?.slug || 'biomix';
  const update = (index, patch) => {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Lignes produits</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine(defaultSlug)])}>
          <Plus className="h-4 w-4 mr-1" /> Produit
        </Button>
      </div>

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun produit. Requis si le mix inclut une pulvérisation.</p>
      )}

      <div className="space-y-2">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50/50 dark:bg-gray-900/40"
          >
            <div className="md:col-span-3">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={line.work_date || ''}
                onChange={(e) => update(idx, { work_date: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">Produit</Label>
              <Select
                value={line.product || defaultSlug}
                onValueChange={(v) => update(idx, { product: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor(line.product || defaultSlug).map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Litres</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={line.liters ?? ''}
                onChange={(e) =>
                  update(idx, { liters: e.target.value === '' ? '' : Number(e.target.value) })
                }
              />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">m² (optionnel)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={line.m2 ?? ''}
                onChange={(e) =>
                  update(idx, { m2: e.target.value === '' ? '' : Number(e.target.value) })
                }
              />
            </div>
            <div className="md:col-span-1 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(lines.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductLinesEditor;
