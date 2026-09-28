import React from 'react';

/**
 * Original top-down cargo view of a Peugeot Expert L3-class van (no official assets).
 * SVG units ≈ cm. Cargo floor 164 × 286 (Expert L3 ≈ 1.63 m × 2.86 m) starts at CARGO_ORIGIN;
 * cab at the top, rear doors at the bottom, sliding side door on the right.
 *
 * Zones are free rectangles stored per van on the node (plan_x/y/w/h, cm relative to the cargo
 * floor's top-left corner; the cab sits at negative y).
 *
 * props:
 *  zones: [{ id, key, label, worst, rect: {x,y,w,h}, blocks: [{ id, label, sub, kind, condition, children? }] }]
 *  v1.11.0: a caisse block with `children` (its matériel) is drawn as a full-width container with
 *  the items nested inside it.
 *  onZone(id), onBlock(id), selectedZoneId, mini, grid, dimBlocks
 *  ZoneWrap / BlockWrap: optional wrapper components ({ zone|block, children }) — used for drag & drop
 *  children: overlay rendered last, in cargo coordinates (plan editor handles)
 */
export const VAN_NAVY = '#0b1f4d';
export const VAN_YELLOW = '#facc15';
export const VAN_BLACK = '#111827';

export const COND_FILL = {
  ok: '#10b981',
  damaged_usable: '#eab308',
  broken: '#ef4444',
  missing: '#9ca3af',
};

export const CARGO_ORIGIN = { x: 38, y: 195 };
export const CARGO_SIZE = { w: 164, h: 286 };
/** Editable plan area in cargo cm (cab included, negative y). */
export const PLAN_BOUNDS = { minX: 0, maxX: 164, minY: -91, maxY: 286 };

/** Default Expert L3 layout (same values as the new-van seed in fleet_van_after_write). */
export const DEFAULT_ZONE_GEOM = {
  cab: { x: 8, y: -91, w: 148, h: 78 },
  bulkhead: { x: 2, y: 4, w: 160, h: 44 },
  left_shelf: { x: 2, y: 52, w: 40, h: 229 },
  floor: { x: 46, y: 52, w: 72, h: 229 },
  right_shelf: { x: 122, y: 110, w: 40, h: 171 },
};

export function nodeRect(node) {
  if (node && node.plan_w > 0 && node.plan_h > 0) {
    return { x: Number(node.plan_x), y: Number(node.plan_y), w: Number(node.plan_w), h: Number(node.plan_h) };
  }
  return DEFAULT_ZONE_GEOM[node?.zone_key] || { x: 62, y: 120, w: 40, h: 40 };
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

const Pass = ({ children }) => children;
const FONT = 'Arial, Helvetica, sans-serif';

/**
 * v1.11.0 zone layout: plain blocks fill a grid; crates take a full-width row sized to their
 * contents (chips ~12 cm high). Returns { placed: [{ b, x, y, w, h, kids: [{ k, x, y, w, h }], kidsHidden }], hidden }.
 */
export function zoneLayout(r, blocks) {
  const pad = 3;
  const cols = Math.max(1, Math.min(4, Math.floor(r.w / 52)));
  const bw = (r.w - pad * (cols + 1)) / cols;
  const bh = Math.min(34, Math.max(16, r.h - 17));
  const bottom = r.y + r.h - 2;
  const placed = [];
  let hidden = 0;
  let y = r.y + 14;
  let col = 0;
  for (const b of blocks) {
    if (b.kind === 'caisse' && Array.isArray(b.children)) {
      if (col > 0) {
        y += bh + pad;
        col = 0;
      }
      const w = r.w - pad * 2;
      const kcols = Math.max(1, Math.min(3, Math.floor((w - 6) / 42)));
      const kw = (w - 6 - (kcols - 1) * 2) / kcols;
      const kidRows = Math.ceil(b.children.length / kcols);
      const room = bottom - y;
      if (room < 16) {
        hidden += 1;
        continue;
      }
      const fitRows = Math.max(0, Math.floor((room - 14) / 13));
      const rowsShown = Math.min(kidRows, fitRows);
      const h = 14 + Math.max(1, rowsShown) * 13;
      const x = r.x + pad;
      const shownKids = b.children.slice(0, rowsShown * kcols);
      placed.push({
        b,
        x,
        y,
        w,
        h: Math.min(h, room),
        kids: shownKids.map((k, i) => ({ k, x: x + 3 + (i % kcols) * (kw + 2), y: y + 13 + Math.floor(i / kcols) * 13, w: kw, h: 11.5 })),
        kidsHidden: b.children.length - shownKids.length,
      });
      y += Math.min(h, room) + pad;
      continue;
    }
    if (y + bh > bottom + 1) {
      hidden += 1;
      continue;
    }
    placed.push({ b, x: r.x + pad + col * (bw + pad), y, w: bw, h: bh, kids: [] });
    col += 1;
    if (col === cols) {
      col = 0;
      y += bh + pad;
    }
  }
  return { placed, hidden };
}

/** Grid of blocks inside a zone rect (SVG coords). */
export function blockLayout(r) {
  const pad = 3;
  const cols = Math.max(1, Math.min(4, Math.floor(r.w / 52)));
  const bh = Math.min(34, Math.max(16, r.h - 17));
  const rows = Math.max(1, Math.floor((r.h - 14 + pad) / (bh + pad)));
  const bw = (r.w - pad * (cols + 1)) / cols;
  return {
    max: cols * rows,
    pos: (i) => ({
      x: r.x + pad + (i % cols) * (bw + pad),
      y: r.y + 14 + Math.floor(i / cols) * (bh + pad),
      w: bw,
      h: bh,
    }),
  };
}

const VanSvg = ({
  zones = [],
  onZone,
  onBlock,
  selectedZoneId,
  mini = false,
  grid = false,
  dimBlocks = false,
  ZoneWrap = Pass,
  BlockWrap = Pass,
  title,
  className,
  style,
  svgRef,
  children,
}) => {
  const clickable = (fn) => (fn ? { cursor: 'pointer' } : undefined);
  const O = CARGO_ORIGIN;
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 240 520"
      role="img"
      aria-label={title || 'Van'}
      className={className}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      {/* Wheels */}
      {[
        [10, 58],
        [218, 58],
        [10, 400],
        [218, 400],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="12" height="50" rx="4" fill={VAN_BLACK} />
      ))}
      {/* Mirrors */}
      <rect x="4" y="112" width="18" height="10" rx="3" fill={VAN_BLACK} />
      <rect x="218" y="112" width="18" height="10" rx="3" fill={VAN_BLACK} />

      {/* Body shell */}
      <path
        d="M40 12 Q120 2 200 12 Q220 16 222 40 L222 486 Q222 500 208 502 L32 502 Q18 500 18 486 L18 40 Q20 16 40 12 Z"
        fill={VAN_NAVY}
      />
      <rect x="18" y="200" width="5" height="280" fill={VAN_YELLOW} />
      <rect x="217" y="200" width="5" height="280" fill={VAN_YELLOW} />

      {/* Hood + lettering */}
      <path d="M44 20 Q120 10 196 20 L200 66 L40 66 Z" fill="#0f2a63" />
      {!mini && (
        <text x="120" y="48" textAnchor="middle" fontSize="13" fontWeight="800" fill={VAN_YELLOW} letterSpacing="2" fontFamily="Arial, Helvetica, sans-serif">
          NOVAKLEEN
        </text>
      )}
      <path d="M40 70 L200 70 L194 98 L46 98 Z" fill="#9fb7d9" opacity="0.85" />

      {/* Cab floor + seats */}
      <rect x="30" y="100" width="180" height="88" rx="6" fill="#1e3a8a" />
      <rect x="48" y="118" width="40" height="44" rx="8" fill={VAN_BLACK} opacity="0.8" />
      <rect x="100" y="118" width="40" height="44" rx="8" fill={VAN_BLACK} opacity="0.65" />
      <rect x="152" y="118" width="40" height="44" rx="8" fill={VAN_BLACK} opacity="0.65" />
      <circle cx="68" cy="108" r="9" fill="none" stroke={VAN_BLACK} strokeWidth="3" />

      {/* Bulkhead */}
      <rect x="30" y="188" width="180" height="7" fill={VAN_BLACK} />

      {/* Cargo floor */}
      <rect x={O.x} y={O.y} width={CARGO_SIZE.w} height={CARGO_SIZE.h} fill="#e5e7eb" />
      {!grid &&
        Array.from({ length: 13 }, (_, i) => (
          <line key={i} x1="40" x2="200" y1={215 + i * 20} y2={215 + i * 20} stroke="#d1d5db" strokeWidth="1" />
        ))}
      {grid && (
        <g stroke="#94a3b8" strokeWidth="0.4" opacity="0.7">
          {Array.from({ length: 17 }, (_, i) => (
            <line key={`v${i}`} x1={O.x + i * 10} x2={O.x + i * 10} y1={O.y - 91} y2={O.y + CARGO_SIZE.h} />
          ))}
          {Array.from({ length: 38 }, (_, i) => (
            <line key={`h${i}`} x1={O.x} x2={O.x + CARGO_SIZE.w} y1={O.y - 91 + i * 10} y2={O.y - 91 + i * 10} />
          ))}
        </g>
      )}

      {/* Sliding side door (right) */}
      <rect x="202" y="205" width="16" height="96" fill={VAN_YELLOW} opacity="0.9" />
      <line x1="210" y1="208" x2="210" y2="298" stroke={VAN_BLACK} strokeWidth="1.5" strokeDasharray="4 3" />
      {!mini && (
        <text x="214" y="253" fontSize="7" fontWeight="700" fill={VAN_NAVY} transform="rotate(90 214 253)" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif">
          PORTE LAT.
        </text>
      )}

      {/* Rear doors + lights */}
      <rect x="38" y="481" width="81" height="14" fill={VAN_YELLOW} />
      <rect x="121" y="481" width="81" height="14" fill={VAN_YELLOW} />
      <line x1="120" y1="481" x2="120" y2="495" stroke={VAN_BLACK} strokeWidth="2" />
      <rect x="110" y="485" width="6" height="6" rx="1" fill={VAN_BLACK} />
      <rect x="124" y="485" width="6" height="6" rx="1" fill={VAN_BLACK} />
      <rect x="22" y="486" width="10" height="12" rx="2" fill="#dc2626" />
      <rect x="208" y="486" width="10" height="12" rx="2" fill="#dc2626" />
      <rect x="40" y="14" width="22" height="8" rx="3" fill="#fde68a" />
      <rect x="178" y="14" width="22" height="8" rx="3" fill="#fde68a" />

      {/* Zones */}
      {zones.map((z) => {
        const r = { x: z.rect.x + O.x, y: z.rect.y + O.y, w: z.rect.w, h: z.rect.h };
        const inCab = z.rect.y < 0;
        const worst = z.worst || 'ok';
        const selected = selectedZoneId === z.id;
        const tint = worst === 'ok' ? '#ffffff' : COND_FILL[worst];
        const blocks = z.blocks || [];
        const { placed, hidden } = zoneLayout(r, blocks);
        return (
          <ZoneWrap key={z.id} zone={z}>
            <g onClick={onZone ? () => onZone(z.id) : undefined} style={clickable(onZone)}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx="4"
                fill={tint}
                fillOpacity={worst === 'ok' ? (inCab ? 0.08 : 0.55) : 0.3}
                stroke={selected ? VAN_YELLOW : inCab ? '#93c5fd' : '#9ca3af'}
                strokeWidth={selected ? 3 : 1}
                strokeDasharray={z.key === 'floor' || inCab ? '4 3' : undefined}
              />
              {!mini && z.label && (
                <text
                  x={r.x + 3}
                  y={inCab && !blocks.length ? r.y + r.h - 4 : r.y + 10}
                  fontSize="7"
                  fontWeight="700"
                  fill={inCab ? '#dbeafe' : '#374151'}
                  fontFamily="Arial, Helvetica, sans-serif"
                >
                  {truncate(z.label, Math.max(6, Math.floor(r.w / 4.2)))}
                </text>
              )}
              {!mini &&
                placed.map(({ b, x, y, w, h, kids, kidsHidden }) => {
                  const p = { x, y, w, h };
                  const crate = b.kind === 'caisse' && Array.isArray(b.children);
                  const chars = Math.max(4, Math.floor(p.w / 4.6));
                  const click = (id) =>
                    onBlock
                      ? (e) => {
                          e.stopPropagation();
                          onBlock(id);
                        }
                      : undefined;
                  return (
                    <React.Fragment key={b.id}>
                      <BlockWrap block={b}>
                        <g onClick={click(b.id)} style={clickable(onBlock)} opacity={dimBlocks ? 0.55 : 1}>
                          {crate ? (
                            <>
                              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill="#fffbeb" stroke={b.highlight ? VAN_YELLOW : '#b45309'} strokeWidth={b.highlight ? 2.5 : 1.2} />
                              <rect x={p.x} y={p.y} width={p.w} height="12" rx="4" fill="#b45309" />
                              <rect x={p.x} y={p.y + 6} width={p.w} height="6" fill="#b45309" />
                              <g transform={`translate(${p.x + 3} ${p.y + 2})`} fill="none" stroke={VAN_YELLOW} strokeWidth="1">
                                <rect x="0" y="1" width="8" height="7" rx="1" />
                                <line x1="0" y1="3.5" x2="8" y2="3.5" />
                              </g>
                              <text x={p.x + 14} y={p.y + 9} fontSize="7.5" fontWeight="800" fill="#ffffff" fontFamily={FONT}>
                                {truncate(b.label, Math.max(4, Math.floor((p.w - 30) / 4.3)))}
                              </text>
                              {b.condition && b.condition !== 'ok' && (
                                <circle cx={p.x + p.w - 6} cy={p.y + 6} r="4" fill={COND_FILL[b.condition]} stroke="#fff" strokeWidth="1.2" />
                              )}
                              {kids.length === 0 && b.sub && (
                                <text x={p.x + 5} y={p.y + 22} fontSize="6.5" fill="#92400e" fontFamily={FONT}>
                                  {truncate(b.sub, chars)}
                                </text>
                              )}
                              {kidsHidden > 0 && (
                                <text x={p.x + p.w - 3} y={p.y + p.h - 3} textAnchor="end" fontSize="7" fontWeight="700" fill="#92400e" fontFamily={FONT}>
                                  +{kidsHidden}
                                </text>
                              )}
                            </>
                          ) : (
                            <>
                              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill={b.kind === 'machine' ? VAN_NAVY : '#ffffff'} stroke={b.highlight ? VAN_YELLOW : VAN_NAVY} strokeWidth={b.highlight ? 2.5 : 1} />
                              <rect x={p.x} y={p.y} width="4" height={p.h} rx="2" fill={COND_FILL[b.condition || 'ok']} />
                              <text
                                x={p.x + 7}
                                y={p.y + p.h / 2 - (b.sub && p.h >= 26 ? 2 : -3)}
                                fontSize="8"
                                fontWeight="700"
                                fill={b.kind === 'machine' ? VAN_YELLOW : VAN_NAVY}
                                fontFamily={FONT}
                              >
                                {truncate(b.label, chars)}
                              </text>
                              {b.sub && p.h >= 26 && (
                                <text x={p.x + 7} y={p.y + p.h / 2 + 9} fontSize="6.5" fill={b.kind === 'machine' ? '#e5e7eb' : '#6b7280'} fontFamily={FONT}>
                                  {truncate(b.sub, chars + 2)}
                                </text>
                              )}
                              {b.condition && b.condition !== 'ok' && (
                                <circle cx={p.x + p.w - 6} cy={p.y + 6} r="4.5" fill={COND_FILL[b.condition]} stroke="#fff" strokeWidth="1.2" />
                              )}
                            </>
                          )}
                        </g>
                      </BlockWrap>
                      {/* nested matériel: siblings (not children) of the crate so each chip drags on its own */}
                      {kids.map(({ k, x: kx, y: ky, w: kw, h: kh }) => (
                        <BlockWrap key={k.id} block={k}>
                          <g onClick={click(k.id)} style={clickable(onBlock)} opacity={dimBlocks ? 0.55 : 1}>
                            <rect x={kx} y={ky} width={kw} height={kh} rx="3" fill="#ffffff" stroke={k.highlight ? VAN_YELLOW : '#d97706'} strokeWidth={k.highlight ? 2 : 0.8} />
                            <rect x={kx} y={ky} width="3" height={kh} rx="1.5" fill={COND_FILL[k.condition || 'ok']} />
                            <text x={kx + 5} y={ky + 8.2} fontSize="6.5" fontWeight="700" fill={VAN_NAVY} fontFamily={FONT}>
                              {truncate(k.sub ? `${k.label} ${k.sub}` : k.label, Math.max(4, Math.floor((kw - 6) / 3.6)))}
                            </text>
                          </g>
                        </BlockWrap>
                      ))}
                    </React.Fragment>
                  );
                })}
              {!mini && hidden > 0 && (
                <text x={r.x + r.w - 4} y={r.y + r.h - 4} textAnchor="end" fontSize="8" fontWeight="700" fill={VAN_NAVY} fontFamily="Arial, Helvetica, sans-serif">
                  +{hidden}
                </text>
              )}
              {mini && worst !== 'ok' && (
                <circle cx={r.x + r.w / 2} cy={r.y + Math.min(r.h / 2, 30)} r="11" fill={COND_FILL[worst]} stroke="#fff" strokeWidth="3" />
              )}
            </g>
          </ZoneWrap>
        );
      })}

      {children && <g transform={`translate(${O.x} ${O.y})`}>{children}</g>}
    </svg>
  );
};

export default VanSvg;
