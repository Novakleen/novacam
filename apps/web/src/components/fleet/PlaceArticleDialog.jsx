import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Minus, Plus, Search } from 'lucide-react';
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
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { ARTICLE_KINDS, canContain, nodeName, placeArticle } from '@/lib/fleet/inventory';
import { fleet_norm } from '@/lib/fleet/catalog';
import { NAVY, YELLOW } from './FleetUI';
import NodeIcon from './NodeIcon';

/**
 * v1.10.0 "Ajouter": pick an article from the central catalog and put it into `parent`
 * (zone, caisse, depot). No free-text names: articles are created in Flotte › Articles.
 * Technicians may place into their own van (checked server-side by fleet_place_article).
 * v1.11.0: only kinds the parent accepts are offered (a caisse only takes matériel); crates start empty.
 */
const PlaceArticleDialog = ({ open, onOpenChange, parent, articles = [], lang, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setKind('');
    setPicked(null);
    setQty(1);
  }, [open, parent?.id]);

  const kinds = useMemo(() => ARTICLE_KINDS.filter((k) => canContain(parent, k)), [parent]);
  const list = useMemo(() => {
    const q = fleet_norm(query);
    return articles
      .filter((a) => a.active !== false && kinds.includes(a.kind))
      .filter((a) => !kind || a.kind === kind)
      .filter((a) => !q || [a.name, a.name_nl, a.name_en].some((n) => fleet_norm(n).includes(q)))
      .sort((a, b) => ARTICLE_KINDS.indexOf(a.kind) - ARTICLE_KINDS.indexOf(b.kind) || nodeName(a, lang).localeCompare(nodeName(b, lang)));
  }, [articles, kinds, query, kind, lang]);

  const submit = async () => {
    if (!picked || !parent) return;
    setSaving(true);
    try {
      await placeArticle(parent.id, picked.id, qty);
      toast({ title: t('fleet.articles.placed', { count: Number(qty) || 1, name: nodeName(picked, lang), dest: nodeName(parent, lang) }) });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      const description = err?.code === '42501' ? t('fleet.articles.placeNotAllowed') : err.message;
      toast({ variant: 'destructive', title: t('fleet.articles.placeFailed'), description });
    } finally {
      setSaving(false);
    }
  };

  const maxQty = picked?.kind === 'materiel' ? 999 : 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] flex flex-col rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t('fleet.articles.placeTitle')}</DialogTitle>
          <DialogDescription>{parent ? t('fleet.node.addIn', { name: nodeName(parent, lang) }) : ''}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            autoFocus
            className="h-11 rounded-xl pl-9"
            placeholder={t('fleet.articles.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {parent?.kind === 'caisse' && <p className="text-xs text-gray-500">{t('fleet.crate.onlyMateriel')}</p>}
        {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {['', ...kinds].map((k) => (
            <button
              key={k || 'all'}
              type="button"
              onClick={() => setKind(k)}
              className={cn('rounded-full px-3 h-8 text-xs font-bold border', kind === k ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
              style={kind === k ? { backgroundColor: NAVY } : undefined}
            >
              {k ? t(`fleet.kinds.${k}`) : t('fleet.articles.allKinds')}
            </button>
          ))}
        </div>
        )}
        <ul className="flex-1 min-h-[180px] overflow-y-auto space-y-1.5 -mx-1 px-1">
          {list.length === 0 && <li className="text-sm text-gray-500 py-6 text-center">{t('fleet.articles.none')}</li>}
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  setPicked(a);
                  setQty(1);
                }}
                className={cn(
                  'w-full flex items-center gap-3 rounded-2xl border p-2.5 text-left',
                  picked?.id === a.id ? 'border-[#0b1f4d] ring-2 ring-[#0b1f4d]/20' : 'border-gray-100 dark:border-gray-800'
                )}
              >
                <NodeIcon node={a} className="h-10 w-10" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{nodeName(a, lang)}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {t(`fleet.kinds.${a.kind}`)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {picked && (
          <div className="flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-3">
            <span className="flex-1 min-w-0 text-sm font-semibold truncate">{nodeName(picked, lang)}</span>
            <span className="text-xs text-gray-500">{t('fleet.node.qty')}</span>
            <Button size="icon" variant="outline" className="rounded-full h-9 w-9" onClick={() => setQty((q) => Math.max(1, Number(q) - 1))} aria-label="-">
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={1}
              max={maxQty}
              className="h-9 w-16 rounded-xl text-center"
              value={qty}
              onChange={(e) => setQty(Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)))}
            />
            <Button size="icon" variant="outline" className="rounded-full h-9 w-9" onClick={() => setQty((q) => Math.min(maxQty, Number(q) + 1))} aria-label="+">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="rounded-full h-11 px-6 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={submit} disabled={saving || !picked}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('fleet.articles.place')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlaceArticleDialog;
