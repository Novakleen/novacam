import React from 'react';
import {
  Cable,
  CircleDot,
  Container,
  Cylinder,
  Fence,
  Fuel,
  Gauge,
  HardHat,
  LayoutGrid,
  Link2,
  Package,
  SprayCan,
  TrafficCone,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVY, YELLOW } from './FleetUI';

export const NODE_ICONS = {
  pump: Gauge,
  fuel: Fuel,
  spray: SprayCan,
  extension: Cable,
  sleeve: Cylinder,
  seal: CircleDot,
  wire: Fence,
  strap: Link2,
  ppe: HardHat,
  can: Container,
  cone: TrafficCone,
  box: Package,
};

const KIND_ICONS = {
  depot: Warehouse,
  van: Truck,
  zone: LayoutGrid,
  caisse: Package,
  machine: Gauge,
  materiel: Wrench,
};

export function iconFor(node) {
  return NODE_ICONS[node?.icon] || KIND_ICONS[node?.kind] || Wrench;
}

/** Square icon tile; containers navy/yellow, items light. */
const NodeIcon = ({ node, className }) => {
  const Icon = iconFor(node);
  const dark = ['caisse', 'machine', 'van', 'depot'].includes(node?.kind);
  return (
    <span
      className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', !dark && 'bg-gray-100 dark:bg-gray-800', className)}
      style={dark ? { backgroundColor: NAVY } : undefined}
    >
      <Icon className="h-5 w-5" style={dark ? { color: YELLOW } : undefined} />
    </span>
  );
};

export default NodeIcon;
