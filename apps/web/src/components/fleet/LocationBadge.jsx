import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { locateNode, nodeName } from '@/lib/fleet/inventory';

/** "Van › Zone › Caisse" for a location resolved by locateNode (v1.11.0). */
export function placeLabel(loc, lang, { withRoot = true } = {}) {
  return [withRoot ? loc.root : null, loc.zone, loc.crate]
    .filter(Boolean)
    .map((n) => nodeName(n, lang))
    .join(' › ');
}

/**
 * v1.11.0: "📦 dans <caisse> · <zone>" badge for a matériel stored in a crate, shown wherever the
 * item appears flat (search, tickets, sheets). Renders nothing when the item is not in a crate.
 */
const CrateBadge = ({ node, byId, lang, t, withZone = true, className }) => {
  if (!node || node.kind !== 'materiel') return null;
  const loc = locateNode(node, byId);
  if (!loc.crate) return null;
  const zone = withZone && loc.zone ? nodeName(loc.zone, lang) : null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800 px-2 py-0.5 text-[11px] font-semibold',
        className
      )}
      title={placeLabel(loc, lang)}
    >
      <Package className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {zone
          ? t('fleet.crate.inCrateZone', { crate: nodeName(loc.crate, lang), zone })
          : t('fleet.crate.inCrate', { crate: nodeName(loc.crate, lang) })}
      </span>
    </span>
  );
};

export default CrateBadge;
