import React, { useRef } from 'react';
import { CARGO_ORIGIN, PLAN_BOUNDS, VAN_NAVY, VAN_YELLOW } from './VanSvg';

export const SNAP_CM = 5;
const MIN_CM = 20;

const snap = (v) => Math.round(v / SNAP_CM) * SNAP_CM;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Keep a rect inside the plan area with a minimum size. */
export function clampRect(r) {
  const B = PLAN_BOUNDS;
  const w = clamp(r.w, MIN_CM, B.maxX - B.minX);
  const h = clamp(r.h, MIN_CM, B.maxY - B.minY);
  return { x: clamp(r.x, B.minX, B.maxX - w), y: clamp(r.y, B.minY, B.maxY - h), w, h };
}

/**
 * Plan editor overlay, rendered as VanSvg children (cargo coordinates).
 * Drag a zone body to move it, a corner handle to resize it; everything snaps to a 5 cm grid.
 * onChange(id, rect) fires live, onCommit(id, rect) once on release (only if something moved).
 */
const ZoneEditOverlay = ({ zones, selectedId, svgRef, onSelect, onChange, onCommit, onQuickAdd }) => {
  const drag = useRef(null);

  const toCargo = (e) => {
    const svg = svgRef?.current;
    if (!svg?.getScreenCTM) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x - CARGO_ORIGIN.x, y: p.y - CARGO_ORIGIN.y };
  };

  const start = (e, zone, mode) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { id: zone.id, mode, start: toCargo(e), orig: { ...zone.rect }, rect: { ...zone.rect }, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onSelect?.(zone.id);
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = toCargo(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 1.5) d.moved = true;
    if (!d.moved) return;
    const o = d.orig;
    let r;
    if (d.mode === 'move') {
      r = { x: snap(o.x + dx), y: snap(o.y + dy), w: o.w, h: o.h };
    } else if (d.mode === 'se') {
      r = { x: o.x, y: o.y, w: snap(o.x + o.w + dx) - o.x, h: snap(o.y + o.h + dy) - o.y };
    } else {
      // nw: opposite corner fixed
      const x = Math.min(snap(o.x + dx), o.x + o.w - MIN_CM);
      const y = Math.min(snap(o.y + dy), o.y + o.h - MIN_CM);
      r = { x, y, w: o.x + o.w - x, h: o.y + o.h - y };
    }
    r = clampRect(r);
    d.rect = r;
    onChange?.(d.id, r);
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) onCommit?.(d.id, d.rect);
  };

  return (
    <g onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ touchAction: 'none' }}>
      {zones.map((z) => {
        const r = z.rect;
        const sel = z.id === selectedId;
        return (
          <g key={z.id}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx="4"
              fill={sel ? VAN_YELLOW : VAN_NAVY}
              fillOpacity={sel ? 0.18 : 0.06}
              stroke={sel ? VAN_YELLOW : VAN_NAVY}
              strokeWidth={sel ? 2.5 : 1}
              strokeDasharray="5 3"
              style={{ cursor: 'move', touchAction: 'none' }}
              pointerEvents="all"
              onPointerDown={(e) => start(e, z, 'move')}
            />
            {sel && (
              <>
                {[
                  ['nw', r.x, r.y],
                  ['se', r.x + r.w, r.y + r.h],
                ].map(([mode, cx, cy]) => (
                  <circle
                    key={mode}
                    cx={cx}
                    cy={cy}
                    r="7"
                    fill={VAN_YELLOW}
                    stroke={VAN_NAVY}
                    strokeWidth="2"
                    style={{ cursor: mode === 'se' ? 'nwse-resize' : 'nwse-resize', touchAction: 'none' }}
                    onPointerDown={(e) => start(e, z, mode)}
                  />
                ))}
                <rect x={r.x + r.w / 2 - 24} y={r.y + r.h - 13} width="48" height="11" rx="5.5" fill={VAN_NAVY} pointerEvents="none" />
                <text x={r.x + r.w / 2} y={r.y + r.h - 5} textAnchor="middle" fontSize="7" fontWeight="700" fill={VAN_YELLOW} pointerEvents="none" fontFamily="Arial, Helvetica, sans-serif">
                  {Math.round(r.w)}×{Math.round(r.h)} cm
                </text>
                {onQuickAdd && (
                  <g
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAdd(z.id);
                    }}
                  >
                    <circle cx={r.x + r.w - 9} cy={r.y + 9} r="8" fill={VAN_NAVY} stroke={VAN_YELLOW} strokeWidth="1.5" />
                    <path d={`M${r.x + r.w - 13} ${r.y + 9} h8 M${r.x + r.w - 9} ${r.y + 5} v8`} stroke={VAN_YELLOW} strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
};

export default ZoneEditOverlay;
