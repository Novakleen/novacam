import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  Droplets,
  History,
  Pencil,
  ShoppingCart,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  firstName,
  fmtL,
  initialsOf,
  personName,
  productName,
  setLocationMin,
} from '@/lib/fleet/api';
import { Avatarish, BigGauge, CondPill, NAVY, RoundAction, SectionCard, VanPictogram, YELLOW } from './FleetUI';
import InventoryBrowser from './InventoryBrowser';
import InventoryDialogs from './InventoryDialogs';
import MoveDialog from './MoveDialog';
import ReassignDialog from './ReassignDialog';
import VanEditDialog from './VanEditDialog';
import MovesTimeline from './MovesTimeline';

function fmtDate(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'en' ? 'en-GB' : 'fr-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const LocationDetail = ({ location, van, index, data, isAdmin, canEdit, moves, onReload, focusNodeId, myRootId }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lang = index.lang;
  const [moveMode, setMoveMode] = useState(null);
  const [presetSlug, setPresetSlug] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dialogs, setDialogs] = useState({});
  const [focus, setFocus] = useState(focusNodeId ? { id: focusNodeId } : null);
  const [editingMin, setEditingMin] = useState(null);
  const [minDraft, setMinDraft] = useState('');

  if (!location) {
    return <p className="text-sm text-gray-500">{t('fleet.noLocation')}</p>;
  }

  const isDepot = location.kind === 'depot';
  const current = van ? index.currentAssignment.get(van.id) : null;
  const driver = current ? index.profileById.get(current.user_id) : null;
  const history = van ? data.assignments.filter((a) => a.van_id === van.id) : [];
  const tree = index.tree;
  const rootNode = tree.byId.get(location.id) || null;
  const counts = index.conditionCountsForLocation(location.id);
  const present = index.presentProducts(location);
  const vansForTransfer = data.vans.filter((v) => v.active !== false && (isAdmin || index.locationByVan.get(v.id)));
  const locMoves = (moves || []).filter((m) => m.from_location_id === location.id || m.to_location_id === location.id);

  const openMove = (mode, slug = '') => {
    setPresetSlug(slug);
    setMoveMode(mode);
  };

  const saveMin = async (slug) => {
    try {
      await setLocationMin(location.id, slug, minDraft);
      setEditingMin(null);
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.move.failed'), description: err.message });
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <VanPictogram photoUrl={van?.photo_url} depot={isDepot} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight truncate">{isDepot ? t('fleet.depot') : van?.name}</h2>
          <p className="text-sm text-gray-500">
            {isDepot ? t('fleet.depotSubtitle') : van?.plate || t('fleet.van.noPlate')}
            {van && van.active === false && <span className="ml-2 text-amber-600">· {t('fleet.van.inactive')}</span>}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {['broken', 'damaged_usable', 'missing'].map((c) =>
              counts[c] > 0 ? <CondPill key={c} condition={c} label={t(`fleet.condCount.${c}`, { count: counts[c] })} /> : null
            )}
            {counts.broken + counts.damaged_usable + counts.missing === 0 && rootNode && (
              <CondPill condition="ok" label={t('fleet.allOk')} />
            )}
          </div>
        </div>
        {isAdmin && van && (
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setEditOpen(true)} aria-label={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Inventaire */}
      {rootNode && (
        <SectionCard title={t('fleet.inv.title')} icon={Boxes}>
          <InventoryBrowser
            root={rootNode}
            tree={tree}
            kits={data.kits}
            isAdmin={isAdmin}
            canAct={canEdit}
            canEditPlan={Boolean(van) && (isAdmin || canEdit)}
            lang={lang}
            focus={focus}
            openDialog={(key, value) => setDialogs((d) => ({ ...d, [key]: value }))}
            onReload={onReload}
          />
        </SectionCard>
      )}

      {/* Produits: only products present in this location (litres > 0) */}
      {present.length > 0 ? (
        <SectionCard title={t('fleet.productsLitres')} icon={Droplets}>
        {canEdit && (
          <div className="flex justify-around gap-2">
            <RoundAction
              icon={ArrowLeftRight}
              variant="yellow"
              label={isDepot ? t('fleet.actions.transferToVan') : t('fleet.actions.transferFromDepot')}
              onClick={() => openMove('transfer')}
            />
            <RoundAction icon={SlidersHorizontal} label={t('fleet.actions.adjust')} onClick={() => openMove('adjust')} />
            {isAdmin && (
              <RoundAction icon={ShoppingCart} label={t('fleet.actions.purchase')} onClick={() => openMove('purchase')} />
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {present.map((p) => {
            const stock = index.stockFor(location, p);
            return (
              <BigGauge
                key={p.slug}
                label={productName(p, lang)}
                color={p.color}
                stock={stock}
                thresholdLabel={
                  editingMin === p.slug ? (
                    <span className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-20 rounded-lg"
                        value={minDraft}
                        placeholder={String(isDepot ? p.default_min_depot ?? '' : p.default_min_van ?? '')}
                        onChange={(e) => setMinDraft(e.target.value)}
                        autoFocus
                      />
                      <Button size="sm" className="h-8 rounded-lg" onClick={() => saveMin(p.slug)}>
                        OK
                      </Button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!isAdmin}
                      className={cn('text-left', isAdmin && 'underline decoration-dotted')}
                      onClick={() => {
                        setEditingMin(p.slug);
                        setMinDraft(stock.override ?? '');
                      }}
                    >
                      {t('fleet.threshold', { litres: fmtL(stock.min) })}
                      {stock.override != null && ` (${t('fleet.override')})`}
                    </button>
                  )
                }
              >
                {canEdit && (
                  <button
                    type="button"
                    className="font-semibold text-blue-700 dark:text-blue-300"
                    onClick={() => openMove('transfer', p.slug)}
                  >
                    {t('fleet.actions.refill')}
                  </button>
                )}
              </BigGauge>
            );
          })}
        </div>
        </SectionCard>
      ) : (
        canEdit && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button className="rounded-full h-11 font-bold" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => openMove('transfer')}>
              <Droplets className="h-4 w-4 mr-2" />
              {isDepot ? t('fleet.actions.transferToVan') : t('fleet.products.addToVan')}
            </Button>
            {isAdmin && (
              <Button variant="outline" className="rounded-full h-11" onClick={() => openMove('purchase')}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                {t('fleet.actions.purchase')}
              </Button>
            )}
          </div>
        )
      )}

      {/* Qui */}
      {van && (
        <SectionCard
          title={t('fleet.who')}
          icon={UserRound}
          action={
            isAdmin && (
              <Button size="sm" className="rounded-full" variant="outline" onClick={() => setReassignOpen(true)}>
                {t('fleet.reassign.button')}
              </Button>
            )
          }
        >
          {driver ? (
            <div className="flex items-center gap-3">
              <Avatarish initials={initialsOf(driver)} className="h-12 w-12 text-base" />
              <div>
                <p className="text-lg font-bold">{personName(driver)}</p>
                <p className="text-sm text-gray-500">{t('fleet.since', { date: fmtDate(current.start_at, lang) })}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('fleet.noDriver')}</p>
          )}
          {history.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300"
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <History className="h-4 w-4" />
                {t('fleet.history', { count: history.length })}
                <ChevronDown className={cn('h-4 w-4 transition-transform', historyOpen && 'rotate-180')} />
              </button>
              {historyOpen && (
                <ol className="mt-2 space-y-1.5 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                  {history.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-semibold">{fmtDate(a.start_at, lang)}</span>
                      {a.end_at ? ` → ${fmtDate(a.end_at, lang)}` : ` → ${t('fleet.today')}`}
                      {' · '}
                      {firstName(index.profileById.get(a.user_id))}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Recent moves */}
      <SectionCard title={t('fleet.recentMoves')} icon={History}>
        <MovesTimeline moves={locMoves.slice(0, 8)} index={index} compact />
      </SectionCard>

      <InventoryDialogs
        state={dialogs}
        setState={setDialogs}
        ctx={{
          tree,
          tickets: data.tickets,
          kits: data.kits,
          articles: data.articles,
          isAdmin,
          canActNode: (n) => isAdmin || (canEdit && n.root_id === location.id),
          canMoveNode: (n) => isAdmin || Boolean(myRootId && (n.root_id === myRootId || n.root_id === index.depot?.id)),
          moveRoots: isAdmin
            ? [tree.byId.get(index.depot?.id), ...data.vans.map((v) => tree.byId.get(index.locationByVan.get(v.id)?.id))].filter(Boolean)
            : [tree.byId.get(myRootId)].filter(Boolean),
          lang,
          profileById: index.profileById,
          onReload,
          onOpen: (n) => setFocus({ id: n.id }),
        }}
      />
      {moveMode && (
        <MoveDialog
          open={Boolean(moveMode)}
          onOpenChange={(o) => !o && setMoveMode(null)}
          mode={moveMode}
          location={location}
          presetSlug={presetSlug}
          index={index}
          vans={vansForTransfer}
          isAdmin={isAdmin}
          onDone={onReload}
        />
      )}
      {van && (
        <ReassignDialog
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          van={van}
          currentUserId={current?.user_id}
          profiles={data.profiles}
          onDone={onReload}
        />
      )}
      {van && <VanEditDialog open={editOpen} onOpenChange={setEditOpen} van={van} onDone={onReload} />}
    </div>
  );
};

export default LocationDetail;
