import React from 'react';

/**
 * Original top-down cargo view of a Peugeot Expert L3-class van (no official assets).
 * Units ≈ cm: cargo floor 164 × 286 (Expert L3 ≈ 1.63 m × 2.86 m), cab at the top,
 * rear doors at the bottom, sliding side door on the right (passenger side).
 * NovaKleen colours: navy body, yellow accents, black trim.
 *
 * props:
 *  zones:   { [zone_key]: { label, worst, blocks: [{ id, label, condition, count }] } }
 *  onZone(zoneKey), onBlock(blockId), selectedZone, mini (no text), title
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

// Zone rectangles inside the cargo / cab (x, y, w, h)
export const ZONE_RECTS = {
  cab: { x: 46, y: 104, w: 148, h: 78 },
  bulkhead: { x: 40, y: 199, w: 160, h: 44 },
  left_shelf: { x: 40, y: 247, w: 40, h: 229 },
  floor: { x: 84, y: 247, w: 72, h: 229 },
  right_shelf: { x: 160, y: 305, w: 40, h: 171 },
};

const ZONE_ORDER = ['cab', 'bulkhead', 'left_shelf', 'floor', 'right_shelf'];

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

function blockLayout(zoneKey, count) {
  const r = ZONE_RECTS[zoneKey];
  const horizontal = zoneKey === 'bulkhead' || zoneKey === 'cab';
  const pad = 3;
  if (horizontal) {
    const cols = Math.max(1, Math.min(count, 3));
    const w = (r.w - pad * (cols + 1)) / cols;
    const h = Math.min(30, r.h - 16);
    return { horizontal, max: 3, pos: (i) => ({ x: r.x + pad + i * (w + pad), y: r.y + r.h - h - pad, w, h }) };
  }
  const h = 34;
  const max = Math.floor((r.h - 14) / (h + pad));
  return { horizontal, max, pos: (i) => ({ x: r.x + pad, y: r.y + 14 + i * (h + pad), w: r.w - pad * 2, h }) };
}

const VanSvg = ({ zones = {}, onZone, onBlock, selectedZone, mini = false, title, className, style }) => {
  const clickable = (fn) => (fn ? { cursor: 'pointer' } : undefined);
  return (
    <svg
      viewBox="0 0 240 520"
      role="img"
      aria-label={title || 'Van'}
      className={className}
      style={style}
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
      {/* Yellow side stripes */}
      <rect x="18" y="200" width="5" height="280" fill={VAN_YELLOW} />
      <rect x="217" y="200" width="5" height="280" fill={VAN_YELLOW} />

      {/* Hood + lettering */}
      <path d="M44 20 Q120 10 196 20 L200 66 L40 66 Z" fill="#0f2a63" />
      {!mini && (
        <text x="120" y="48" textAnchor="middle" fontSize="13" fontWeight="800" fill={VAN_YELLOW} letterSpacing="2" fontFamily="Arial, Helvetica, sans-serif">
          NOVAKLEEN
        </text>
      )}
      {/* Windscreen */}
      <path d="M40 70 L200 70 L194 98 L46 98 Z" fill="#9fb7d9" opacity="0.85" />

      {/* Cab floor + seats */}
      <rect x="30" y="100" width="180" height="88" rx="6" fill="#1e3a8a" />
      <rect x="48" y="118" width="40" height="44" rx="8" fill={VAN_BLACK} opacity="0.8" />
      <rect x="100" y="118" width="40" height="44" rx="8" fill={VAN_BLACK} opacity="0.65" />
      <rect x="152" y="118" width="40" height="44" rx="8" fill={VAN_BLACK} opacity="0.65" />
      <circle cx="68" cy="108" r="9" fill="none" stroke={VAN_BLACK} strokeWidth="3" />

      {/* Bulkhead */}
      <rect x="30" y="188" width="180" height="7" fill={VAN_BLACK} />

      {/* Cargo floor 164 × 286 */}
      <rect x="38" y="195" width="164" height="286" fill="#e5e7eb" />
      {/* floor ribs */}
      {Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1="40" x2="200" y1={215 + i * 20} y2={215 + i * 20} stroke="#d1d5db" strokeWidth="1" />
      ))}

      {/* Sliding side door (right) */}
      <rect x="202" y="205" width="16" height="96" fill={VAN_YELLOW} opacity="0.9" />
      <line x1="210" y1="208" x2="210" y2="298" stroke={VAN_BLACK} strokeWidth="1.5" strokeDasharray="4 3" />
      {!mini && (
        <text x="214" y="253" fontSize="7" fontWeight="700" fill={VAN_NAVY} transform="rotate(90 214 253)" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif">
          PORTE LAT.
        </text>
      )}

      {/* Rear doors */}
      <rect x="38" y="481" width="81" height="14" fill={VAN_YELLOW} />
      <rect x="121" y="481" width="81" height="14" fill={VAN_YELLOW} />
      <line x1="120" y1="481" x2="120" y2="495" stroke={VAN_BLACK} strokeWidth="2" />
      <rect x="110" y="485" width="6" height="6" rx="1" fill={VAN_BLACK} />
      <rect x="124" y="485" width="6" height="6" rx="1" fill={VAN_BLACK} />
      {/* Lights */}
      <rect x="22" y="486" width="10" height="12" rx="2" fill="#dc2626" />
      <rect x="208" y="486" width="10" height="12" rx="2" fill="#dc2626" />
      <rect x="40" y="14" width="22" height="8" rx="3" fill="#fde68a" />
      <rect x="178" y="14" width="22" height="8" rx="3" fill="#fde68a" />

      {/* Zones */}
      {ZONE_ORDER.map((key) => {
        const r = ZONE_RECTS[key];
        const z = zones[key];
        const worst = z?.worst || 'ok';
        const selected = selectedZone === key;
        const tint = worst === 'ok' ? '#ffffff' : COND_FILL[worst];
        const blocks = z?.blocks || [];
        const layout = blockLayout(key, blocks.length);
        const shown = blocks.slice(0, layout.max);
        const hidden = blocks.length - shown.length;
        return (
          <g key={key} onClick={onZone ? () => onZone(key) : undefined} style={clickable(onZone)}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx="4"
              fill={tint}
              fillOpacity={worst === 'ok' ? (key === 'cab' ? 0.08 : 0.55) : 0.3}
              stroke={selected ? VAN_YELLOW : key === 'cab' ? '#93c5fd' : '#9ca3af'}
              strokeWidth={selected ? 3 : 1}
              strokeDasharray={key === 'floor' || key === 'cab' ? '4 3' : undefined}
            />
            {!mini && z?.label && (
              <text
                x={r.x + 3}
                y={key === 'cab' ? r.y + r.h - 4 : r.y + 10}
                fontSize="7"
                fontWeight="700"
                fill={key === 'cab' ? '#dbeafe' : '#374151'}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {truncate(z.label, key === 'left_shelf' || key === 'right_shelf' ? 10 : 24)}
              </text>
            )}
            {!mini &&
              shown.map((b, i) => {
                const p = layout.pos(i);
                const chars = Math.max(4, Math.floor(p.w / 4.6));
                return (
                  <g
                    key={b.id}
                    onClick={
                      onBlock
                        ? (e) => {
                            e.stopPropagation();
                            onBlock(b.id);
                          }
                        : undefined
                    }
                    style={clickable(onBlock)}
                  >
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="4" fill={b.kind === 'machine' ? VAN_NAVY : '#ffffff'} stroke={VAN_NAVY} strokeWidth="1" />
                    <rect x={p.x} y={p.y} width="4" height={p.h} rx="2" fill={COND_FILL[b.condition || 'ok']} />
                    <text
                      x={p.x + 7}
                      y={p.y + p.h / 2 - (b.sub ? 2 : -3)}
                      fontSize="8"
                      fontWeight="700"
                      fill={b.kind === 'machine' ? VAN_YELLOW : VAN_NAVY}
                      fontFamily="Arial, Helvetica, sans-serif"
                    >
                      {truncate(b.label, chars)}
                    </text>
                    {b.sub && (
                      <text x={p.x + 7} y={p.y + p.h / 2 + 9} fontSize="6.5" fill={b.kind === 'machine' ? '#e5e7eb' : '#6b7280'} fontFamily="Arial, Helvetica, sans-serif">
                        {truncate(b.sub, chars + 2)}
                      </text>
                    )}
                    {b.condition && b.condition !== 'ok' && (
                      <circle cx={p.x + p.w - 6} cy={p.y + 6} r="4.5" fill={COND_FILL[b.condition]} stroke="#fff" strokeWidth="1.2" />
                    )}
                  </g>
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
        );
      })}
    </svg>
  );
};

export default VanSvg;
