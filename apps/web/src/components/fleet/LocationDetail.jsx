import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  ClipboardCheck,
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
  resyncVanEquipment,
  setLocationMin,
} from '@/lib/fleet/api';
import { Avatarish, BigGauge, RoundAction, SectionCard, VanPictogram } from './FleetUI';
import EquipmentChecklist from './EquipmentChecklist';
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

const LocationDetail = ({ location, van, index, data, isAdmin, canEdit, moves, onReload, onLocalEquipment }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const lang = index.lang;
  const [moveMode, setMoveMode] = useState(null);
  const [presetSlug, setPresetSlug] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [editingMin, setEditingMin] = useState(null);
  const [minDraft, setMinDraft] = useState('');

  if (!location) {
    return <p className="text-sm text-gray-500">{t('fleet.noLocation')}</p>;
  }

  const isDepot = location.kind === 'depot';
  const current = van ? index.currentAssignment.get(van.id) : null;
  const driver = current ? index.profileById.get(current.user_id) : null;
  const history = van ? data.assignments.filter((a) => a.van_id === van.id) : [];
  const items = van ? index.vanEquipment(van.id) : [];
  const issues = van ? index.equipmentIssues(van.id) : { broken: 0, missing: 0 };
  const vansForTransfer = data.vans.filter((v) => v.active !== false && (isAdmin || index.locationByVan.get(v.id)));
  const locMoves = (moves || []).filter((m) => m.from_location_id === location.id || m.to_location_id === location.id);

  const openMove = (mode, slug = '') => {
    setPresetSlug(slug);
    setMoveMode(mode);
  };

  const resync = async () => {
    setResyncing(true);
    try {
      const n = await resyncVanEquipment(van.id);
      toast({ title: t('fleet.equipment.resynced', { count: n }) });
      onReload?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.equipment.saveFailed'), description: err.message });
    } finally {
      setResyncing(false);
    }
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
        </div>
        {isAdmin && van && (
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => setEditOpen(true)} aria-label={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

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

      {/* Produits */}
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
        {index.activeProducts.length === 0 && <p className="text-sm text-gray-500">{t('fleet.noProducts')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {index.activeProducts.map((p) => {
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

      {/* Matériel */}
      {van && (
        <SectionCard
          title={t('fleet.tabs.equipment')}
          icon={ClipboardCheck}
          action={
            issues.broken + issues.missing > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-1 text-xs font-bold">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('fleet.kitIssues', { count: issues.broken + issues.missing })}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2.5 py-1 text-xs font-bold">
                {t('fleet.kitOk')}
              </span>
            )
          }
        >
          <EquipmentChecklist
            items={items}
            canEdit={canEdit}
            lang={lang}
            onLocalChange={onLocalEquipment}
            onResync={resync}
            resyncing={resyncing}
          />
        </SectionCard>
      )}

      {/* Recent moves */}
      <SectionCard title={t('fleet.recentMoves')} icon={History}>
        <MovesTimeline moves={locMoves.slice(0, 8)} index={index} compact />
      </SectionCard>

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
