import React from 'react';
import {
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CARGO_ORIGIN, VAN_YELLOW } from './VanSvg';

/**
 * Drag & drop glue (@dnd-kit/core). Draggable ids: `node:<id>`, droppable ids: `drop:<id>`,
 * both carry data.nodeId. Mouse: 6 px to start; touch: long-press 250 ms (page scroll stays free).
 */
export function useFleetSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );
}

/** Innermost target wins (caisse block > breadcrumb/list row > zone); never the dragged node itself. */
export function fleetCollision(args) {
  const activeNode = args.active?.data?.current?.nodeId;
  const prio = (h) => h.data?.droppableContainer?.data?.current?.priority || 0;
  const hits = pointerWithin(args);
  const target = (h) => h.data?.droppableContainer?.data?.current?.nodeId;
  const list = (hits.length ? hits : rectIntersection(args)).filter((h) => target(h) && target(h) !== activeNode);
  return [...list].sort((a, b) => prio(b) - prio(a));
}

/** SVG zone: droppable, yellow highlight while hovered. */
export const DropZoneWrap = ({ zone, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${zone.id}`, data: { nodeId: zone.id, priority: 1 } });
  const r = zone.rect;
  return (
    <g ref={setNodeRef}>
      {children}
      {isOver && (
        <rect
          x={r.x + CARGO_ORIGIN.x}
          y={r.y + CARGO_ORIGIN.y}
          width={r.w}
          height={r.h}
          rx="4"
          fill={VAN_YELLOW}
          fillOpacity="0.25"
          stroke={VAN_YELLOW}
          strokeWidth="3"
          pointerEvents="none"
        />
      )}
    </g>
  );
};

/** SVG block: draggable when allowed. v1.12.0: crate contents are locked, so no block is a drop target. */
export const DragBlockWrap = ({ block, children }) => {
  const container = false;
  const drag = useDraggable({ id: `node:svg:${block.id}`, data: { nodeId: block.id }, disabled: !block.draggable });
  const drop = useDroppable({ id: `drop:${block.id}`, data: { nodeId: block.id, priority: 3 }, disabled: !container });
  const ref = (el) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  return (
    <g
      ref={ref}
      {...(block.draggable ? drag.listeners : {})}
      {...(block.draggable ? drag.attributes : {})}
      opacity={drag.isDragging ? 0.35 : 1}
      style={{
        filter: drop.isOver ? `drop-shadow(0 0 5px ${VAN_YELLOW}) drop-shadow(0 0 2px ${VAN_YELLOW})` : undefined,
        outline: 'none',
      }}
    >
      {children}
    </g>
  );
};

/** DOM drop target (breadcrumb crumb, container row). `scope` keeps ids unique across the page. */
export const DropTarget = ({ nodeId, scope = 'dom', disabled, priority = 2, className, overClassName, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${scope}:${nodeId}`, data: { nodeId, priority }, disabled });
  return (
    <div ref={setNodeRef} className={isOver ? `${className || ''} ${overClassName || ''}` : className}>
      {children}
    </div>
  );
};

/** DOM draggable handle (list row grip). */
export const DragHandle = ({ nodeId, disabled, className, children, label }) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `node:row:${nodeId}`, data: { nodeId }, disabled });
  if (disabled) return null;
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={label}
      className={className}
      style={{ touchAction: 'none', opacity: isDragging ? 0.4 : 1 }}
    >
      {children}
    </button>
  );
};
