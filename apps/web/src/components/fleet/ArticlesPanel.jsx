import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { ARTICLE_KINDS, articleUsage, deleteArticle, nodeName, saveArticle } from '@/lib/fleet/inventory';
import { fleet_norm } from '@/lib/fleet/catalog';
import { NAVY, YELLOW } from './FleetUI';
import { NODE_ICONS } from './NodeIcon';
import ArticlesCatalogView from './ArticlesCatalogView';
import useConfirm from './useConfirm';
import { placeLabel } from './LocationBadge';

/**
 * v1.10.0 Flotte › Articles (admin): the central catalog of crates, machines and materiel.
 * Vans only hold instances of these articles; renaming here renames every instance.
 */
const ArticlesPanel = ({ data, index, onReload }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [dlg, setDlg] = useState(null);

  const usage = useMemo(() => articleUsage(data.nodes, index.tree.byId), [data.nodes, index]);

  const rows = useMemo(() => {
    const q = fleet_norm(query);
    return (data.articles || [])
      .filter((a) => !kind || a.kind === kind)
      .filter((a) => !q || [a.name, a.name_nl, a.name_en].some((n) => fleet_norm(n).includes(q)))
      .sort(
        (x, y) =>
          (x.active === false) - (y.active === false) ||
          ARTICLE_KINDS.indexOf(x.kind) - ARTICLE_KINDS.indexOf(y.kind) ||
          nodeName(x, lang).localeCompare(nodeName(y, lang))
      )
      .map((a) => {
        const u = usage.get(a.id);
        return {
          article: a,
          usage: u
            ? {
                ...u,
                byPlace: [...u.byPlace.entries()]
                  .map(([id, r]) => ({ id, label: placeLabel(r, lang) || '?', qty: r.qty, depot: r.root?.kind === 'depot', inCrate: Boolean(r.crate) }))
                  .sort((p, q2) => p.depot - q2.depot || p.label.localeCompare(q2.label)),
              }
            : null,
        };
      });
  }, [data.articles, query, kind, usage, lang]);

  const totals = useMemo(
    () => ({ articles: (data.articles || []).filter((a) => a.active !== false).length, instances: data.nodes.filter((n) => n.article_id).length }),
    [data.articles, data.nodes]
  );

  return (
    <>
      <ArticlesCatalogView
        t={t}
        rows={rows}
        label={(a) => nodeName(a, lang)}
        query={query}
        onQuery={setQuery}
        kind={kind}
        onKind={setKind}
        totals={totals}
        onNew={() => setDlg({ kind: kind || 'materiel', active: true })}
        onEdit={(a) => setDlg(a)}
      />
      <ArticleDialog value={dlg} usage={dlg?.id ? usage.get(dlg.id) : null} lang={lang} onClose={() => setDlg(null)} onDone={onReload} />
    </>
  );
};

const ArticleDialog = ({ value, usage, lang, onClose, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  useEffect(() => setForm(value || {}), [value]);
  if (!value) return confirmDialog;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inUse = Boolean(usage?.instances);

  const errText = (err) => {
    const m = `${err?.code || ''} ${err?.message || ''}`;
    if (m.includes('23505')) return t('fleet.articles.duplicate');
    if (m.includes('FLEET_ARTICLE_KIND_LOCKED')) return t('fleet.articles.kindLocked');
    if (m.includes('23503') || m.includes('FLEET_ARTICLE_NOT_DELETED')) return t('fleet.articles.cannotDelete');
    return err?.message;
  };

  const submit = async () => {
    setSaving(true);
    try {
      await saveArticle(form);
      toast({ title: t('fleet.articles.saved') });
      onClose();
      onDone();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.articles.failed'), description: errText(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: t('fleet.articles.deleteConfirm', { name: nodeName(value, lang) }), destructive: true }))) return;
    try {
      await deleteArticle(value.id);
      toast({ title: t('fleet.articles.deleted') });
      onClose();
      onDone();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.articles.failed'), description: errText(err) });
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>{value.id ? t('fleet.articles.edit') : t('fleet.articles.new')}</DialogTitle>
            {value.id && (
              <DialogDescription>
                {inUse ? t('fleet.articles.usageLine', { count: usage.qty, instances: usage.instances }) : t('fleet.articles.unused')}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {ARTICLE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={inUse && form.kind !== k}
                  onClick={() => set('kind', k)}
                  className={cn('h-10 rounded-xl border text-xs font-bold disabled:opacity-40', form.kind === k ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700')}
                  style={form.kind === k ? { backgroundColor: NAVY } : undefined}
                >
                  {t(`fleet.kinds.${k}`)}
                </button>
              ))}
            </div>
            {inUse && <p className="text-xs text-gray-500">{t('fleet.articles.kindLockedHint')}</p>}
            <div className="space-y-1.5">
              <Label>{t('fleet.node.name')} (FR)</Label>
              <Input className="h-11 rounded-xl" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input className="h-11 rounded-xl" placeholder="NL" value={form.name_nl || ''} onChange={(e) => set('name_nl', e.target.value)} />
              <Input className="h-11 rounded-xl" placeholder="EN" value={form.name_en || ''} onChange={(e) => set('name_en', e.target.value)} />
            </div>
            {value.id && inUse && <p className="text-xs text-gray-500">{t('fleet.articles.renameHint')}</p>}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(NODE_ICONS).map(([key, Icon]) => (
                <button key={key} type="button" onClick={() => set('icon', form.icon === key ? '' : key)} className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', form.icon === key ? 'border-transparent' : 'border-gray-200 dark:border-gray-700')} style={form.icon === key ? { backgroundColor: NAVY, color: YELLOW } : undefined} aria-label={key}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            {form.kind === 'caisse' && <p className="text-xs text-gray-500">{t('fleet.crate.catalogHint')}</p>}
            <div className="space-y-1.5">
              <Label>{t('fleet.articles.notes')}</Label>
              <Input className="h-11 rounded-xl" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 h-11">
              <span className="text-sm font-semibold">{t('fleet.articles.activeLabel')}</span>
              <Switch checked={form.active !== false} onCheckedChange={(v) => set('active', v)} />
            </label>
            <p className="text-xs text-gray-500">{t('fleet.articles.activeHint')}</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {value.id ? (
              <Button variant="ghost" className="rounded-full text-red-600" disabled={inUse} title={inUse ? t('fleet.articles.cannotDelete') : undefined} onClick={remove}>
                <Trash2 className="h-4 w-4 mr-1" />
                {t('common.delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button className="rounded-full font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} disabled={!String(form.name || '').trim() || !form.kind || saving} onClick={submit}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
};

export default ArticlesPanel;
