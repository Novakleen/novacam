import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { ARTICLE_KINDS, articleUsage, deleteArticle, nodeName, saveArticle, saveArticleContents } from '@/lib/fleet/inventory';
import { fleet_norm } from '@/lib/fleet/catalog';
import { NAVY, YELLOW } from './FleetUI';
import { NODE_ICONS } from './NodeIcon';
import ArticlesCatalogView from './ArticlesCatalogView';
import useConfirm from './useConfirm';
import { placeLabel } from './LocationBadge';

/**
 * v1.10.0 Flotte › Articles (admin): the central catalog of crates, machines and materiel.
 * Vans only hold instances of these articles; renaming here renames every instance.
 * v1.12.0: a caisse article defines its « Contenu standard » (matériel × qty); every placed crate
 * of that article is filled / re-synced from it (server-side), and its contents are locked in the vans.
 */
const ArticlesPanel = ({ data, index, onReload }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [dlg, setDlg] = useState(null);

  const usage = useMemo(() => articleUsage(data.nodes, index.tree.byId, index.tree.openTicketsFor), [data.nodes, index]);
  const articleById = useMemo(() => new Map((data.articles || []).map((a) => [a.id, a])), [data.articles]);
  const contentsOf = useMemo(() => {
    const m = new Map();
    for (const c of [...(data.contents || [])].sort((x, y) => (x.sort || 0) - (y.sort || 0))) {
      if (!m.has(c.crate_article_id)) m.set(c.crate_article_id, []);
      m.get(c.crate_article_id).push(c);
    }
    return m;
  }, [data.contents]);

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
                  .map(([id, r]) => ({ id, label: placeLabel(r, lang) || '?', qty: r.qty, missing: r.missing || 0, depot: r.root?.kind === 'depot', inCrate: Boolean(r.crate) }))
                  .sort((p, q2) => p.depot - q2.depot || p.label.localeCompare(q2.label)),
              }
            : null,
          contentsLabel:
            a.kind === 'caisse'
              ? (contentsOf.get(a.id) || []).map((c) => `${nodeName(articleById.get(c.item_article_id), lang)} ×${c.quantity}`).join(' · ') || t('fleet.crate.noContents')
              : null,
        };
      });
  }, [data.articles, query, kind, usage, lang, contentsOf, articleById, t]);

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
      <ArticleDialog
        value={dlg}
        usage={dlg?.id ? usage.get(dlg.id) : null}
        articles={data.articles || []}
        contents={data.contents || []}
        lang={lang}
        onClose={() => setDlg(null)}
        onDone={onReload}
      />
    </>
  );
};

const ArticleDialog = ({ value, usage, articles, contents, lang, onClose, onDone }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  useEffect(() => {
    setForm(value || {});
    setLines(
      value?.id
        ? contents
            .filter((c) => c.crate_article_id === value.id)
            .sort((x, y) => (x.sort || 0) - (y.sort || 0))
            .map((c) => ({ item_article_id: c.item_article_id, quantity: c.quantity }))
        : []
    );
  }, [value, contents]);
  if (!value) return confirmDialog;
  const materielArticles = articles
    .filter((a) => a.kind === 'materiel' && (a.active !== false || lines.some((l) => l.item_article_id === a.id)))
    .sort((x, y) => nodeName(x, lang).localeCompare(nodeName(y, lang)));
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const crateCount = form.kind === 'caisse' ? usage?.instances || 0 : 0;
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
      const saved = await saveArticle(form);
      if (form.kind === 'caisse') {
        await saveArticleContents(saved.id, lines, contents);
      }
      toast({ title: form.kind === 'caisse' && crateCount ? t('fleet.crate.contentsSaved', { count: crateCount }) : t('fleet.articles.saved') });
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
            {form.kind === 'caisse' && (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-amber-700" />
                  <span className="text-sm font-bold">{t('fleet.crate.contentsTitle')}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">{t('fleet.crate.contentsHint')}</p>
                {lines.length === 0 && <p className="text-xs italic text-gray-500">{t('fleet.crate.noContents')}</p>}
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select
                      className="h-10 flex-1 min-w-0 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                      value={l.item_article_id || ''}
                      onChange={(e) => setLine(i, { item_article_id: e.target.value })}
                      aria-label={t('fleet.crate.item')}
                    >
                      <option value="">{t('fleet.crate.pickItem')}</option>
                      {materielArticles.map((a) => (
                        <option key={a.id} value={a.id} disabled={a.id !== l.item_article_id && lines.some((x) => x.item_article_id === a.id)}>
                          {nodeName(a, lang)}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      className="h-10 w-20 rounded-xl text-center"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      aria-label={t('fleet.node.qty')}
                    />
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      className="h-10 w-10 shrink-0 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 dark:border-gray-700"
                      aria-label={t('common.delete')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={materielArticles.length === 0}
                  onClick={() => setLines((ls) => [...ls, { item_article_id: '', quantity: 1 }])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('fleet.crate.addLine')}
                </Button>
                {materielArticles.length === 0 && <p className="text-xs text-gray-500">{t('fleet.crate.noMateriel')}</p>}
                {crateCount > 0 && <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t('fleet.crate.syncHint', { count: crateCount })}</p>}
              </div>
            )}
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
