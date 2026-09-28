import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, ChevronRight, FolderOpen, Lock, MoveRight, PackageCheck, PackageX, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  addNodePhoto,
  crateError,
  deleteNode,
  fetchNodePhotos,
  isContainer,
  isCrateItem,
  nodeName,
  setMissing,
  signedPhotoUrls,
  uploadNodePhoto,
} from '@/lib/fleet/inventory';
import { firstName } from '@/lib/fleet/api';
import { CondPill, NAVY, YELLOW } from './FleetUI';
import NodeIcon from './NodeIcon';
import CrateBadge from './LocationBadge';
import useConfirm from './useConfirm';

/** Item / container details: condition, path, photos, tickets, actions.
 *  v1.12.0: items inside a crate are locked (catalog standard) — no move / delete, only Manquant / Retrouvé. */
const NodeSheet = ({ node, tree, tickets, isAdmin, canAct, canMove = canAct, lang, profileById, onClose, onReport, onMove, onEdit, onOpen, onTicket, onChanged }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const fileRef = useRef(null);

  const loadPhotos = async () => {
    try {
      const rows = await fetchNodePhotos(node.id);
      setPhotos(rows);
      setUrls(await signedPhotoUrls(rows.map((r) => r.path)));
    } catch {
      setPhotos([]);
    }
  };

  useEffect(() => {
    if (node) loadPhotos();
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;
  const path = tree.path(node.id).slice(0, -1);
  const worst = tree.worst(node.id);
  const nodeTickets = tickets.filter((tk) => tk.node_id === node.id);
  const open = nodeTickets.filter((tk) => tk.status !== 'resolu');
  const closed = nodeTickets.filter((tk) => tk.status === 'resolu');
  const children = tree.childrenOf(node.id);
  const reportable = !['depot', 'van', 'zone'].includes(node.kind);
  const locked = isCrateItem(node, tree.byId);
  const movable = reportable && !locked;
  const missingQ = locked ? tree.missingQty(node.id) : 0;
  const crateMissing = node.kind === 'caisse' ? tree.crateMissing(node.id) : 0;

  const onToggleMissing = async () => {
    try {
      await setMissing(node.id, !(missingQ > 0));
      toast({ title: missingQ > 0 ? t('fleet.crate.foundDone', { name: nodeName(node, lang) }) : t('fleet.crate.missingDone', { name: nodeName(node, lang) }) });
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.crate.missingFailed'), description: err.message });
    }
  };

  const onAddPhoto = async (file) => {
    try {
      const p = await uploadNodePhoto(node.id, file);
      await addNodePhoto(node.id, p);
      loadPhotos();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.node.saveFailed'), description: err.message });
    }
  };

  const onDelete = async () => {
    const title =
      node.kind === 'caisse' && children.length > 0
        ? t('fleet.crate.confirmDelete', { name: nodeName(node, lang), count: children.length })
        : t('fleet.node.confirmDelete', { name: nodeName(node, lang) });
    if (!(await confirm({ title }))) return;
    try {
      await deleteNode(node.id);
      onClose();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: t('fleet.node.saveFailed'), description: crateError(err, t) });
    }
  };

  const ticketRow = (tk) => (
    <button
      key={tk.id}
      type="button"
      onClick={() => onTicket(tk)}
      className="w-full flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
    >
      <CondPill condition={tk.status === 'resolu' ? 'ok' : tk.severity} label={t(`fleet.cond.${tk.severity}`)} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold">
          {tk.status === 'resolu' ? t(`fleet.resolutions.${tk.resolution}`) : t(`fleet.status.${tk.status}`)}
        </span>
        <span className="block text-xs text-gray-500 truncate">
          {new Date(tk.reported_at).toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'en' ? 'en-GB' : 'fr-BE')} · {firstName(profileById.get(tk.reported_by))}
          {tk.note ? ` · ${tk.note}` : ''}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-gray-400" />
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <NodeIcon node={node} className="h-14 w-14" />
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{nodeName(node, lang)}</DialogTitle>
              <DialogDescription className="truncate">{path.map((p) => nodeName(p, lang)).join(' › ')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <CondPill condition={worst} label={t(`fleet.cond.${worst}`)} />
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-bold">{t(`fleet.kinds.${node.kind}`)}</span>
          {node.kind === 'materiel' && <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-bold">× {node.qty}</span>}
          <CrateBadge node={node} byId={tree.byId} lang={lang} t={t} />
          {missingQ > 0 && (
            <span className="rounded-full bg-red-600 text-white px-2.5 py-0.5 text-xs font-bold">
              {node.qty > 1 ? t('fleet.crate.missingOf', { count: missingQ, total: node.qty }) : t('fleet.cond.missing')}
            </span>
          )}
          {crateMissing > 0 && (
            <span className="rounded-full bg-red-600 text-white px-2.5 py-0.5 text-xs font-bold">{t('fleet.crate.missingCount', { count: crateMissing })}</span>
          )}
          {worst !== node.condition && isContainer(node) && <span className="text-xs text-gray-500">{t('fleet.node.worstInside')}</span>}
        </div>
        {(locked || node.kind === 'caisse') && (
          <p className="flex items-center gap-1.5 rounded-2xl bg-amber-50 text-amber-900 text-xs px-3 py-2 dark:bg-amber-900/30 dark:text-amber-200">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            {t('fleet.crate.lockedHint')}
          </p>
        )}

        {(node.serial || node.brand || node.model || node.notes) && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {node.serial && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">{t('fleet.node.serial')}</dt>
                <dd className="font-mono font-semibold">{node.serial}</dd>
              </div>
            )}
            {node.brand && (
              <div>
                <dt className="text-xs text-gray-500">{t('fleet.node.brand')}</dt>
                <dd className="font-semibold">{node.brand}</dd>
              </div>
            )}
            {node.model && (
              <div>
                <dt className="text-xs text-gray-500">{t('fleet.node.model')}</dt>
                <dd className="font-semibold">{node.model}</dd>
              </div>
            )}
            {node.notes && <p className="col-span-2 text-gray-600 dark:text-gray-300">{node.notes}</p>}
          </dl>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          {reportable && canAct && (
            <Button className="h-14 rounded-2xl font-black col-span-2" style={{ backgroundColor: YELLOW, color: NAVY }} onClick={() => onReport(node)}>
              <AlertTriangle className="h-5 w-5 mr-2" />
              {t('fleet.report.cta')}
            </Button>
          )}
          {locked && canAct && (
            <Button
              variant="outline"
              className={missingQ > 0 ? 'h-12 rounded-2xl col-span-2 border-emerald-300 text-emerald-700' : 'h-12 rounded-2xl col-span-2 border-red-300 text-red-700'}
              onClick={onToggleMissing}
            >
              {missingQ > 0 ? <PackageCheck className="h-4 w-4 mr-2" /> : <PackageX className="h-4 w-4 mr-2" />}
              {missingQ > 0 ? t('fleet.crate.markFound') : t('fleet.crate.markMissing')}
            </Button>
          )}
          {isContainer(node) && (
            <Button variant="outline" className="h-12 rounded-2xl" onClick={() => onOpen(node)}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {t('fleet.node.open', { count: children.length })}
            </Button>
          )}
          {movable && canMove && (
            <Button variant="outline" className="h-12 rounded-2xl" onClick={() => onMove(node)}>
              <MoveRight className="h-4 w-4 mr-2" />
              {t('fleet.moveNode.cta')}
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => onEdit(node)}>
                <Pencil className="h-4 w-4 mr-2" />
                {t('common.edit')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAddPhoto(f);
                  e.target.value = '';
                }}
              />
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" />
                {t('fleet.node.addPhoto')}
              </Button>
              {reportable && !locked && (children.length === 0 || node.kind === 'caisse') && (
                <Button variant="outline" className="h-12 rounded-2xl text-red-600" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('common.delete')}
                </Button>
              )}
            </>
          )}
        </div>

        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) =>
              urls[p.path] ? (
                <a key={p.id} href={urls[p.path]} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={urls[p.path]} alt="" className="h-24 w-24 rounded-2xl object-cover" />
                </a>
              ) : null
            )}
          </div>
        )}

        {open.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('fleet.node.openTickets')}</p>
            {open.map(ticketRow)}
          </div>
        )}
        {closed.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('fleet.node.history')}</p>
            {closed.map(ticketRow)}
          </div>
        )}
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
};

export default NodeSheet;
