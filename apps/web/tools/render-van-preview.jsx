/* global process */
// Headless previews of the Fleet van SVG (v1.9.0): view mode and plan edit mode.
// Usage: node tools/render-van-preview.mjs [view.png] [edit.png]
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import VanSvg, { DEFAULT_ZONE_GEOM } from '../src/components/fleet/VanSvg.jsx';
import ZoneEditOverlay from '../src/components/fleet/ZoneEditOverlay.jsx';

const mode = process.argv[2] || 'view';

const blocks = {
  cab: [],
  bulkhead: [{ id: 'epi', label: 'Caisse EPI', sub: '1 article', kind: 'caisse', condition: 'ok' }],
  left_shelf: [
    { id: 'l', label: 'Lances', sub: '×2', kind: 'materiel', condition: 'damaged_usable' },
    { id: 'r', label: 'Rallonges', sub: '×2', kind: 'materiel', condition: 'ok' },
    { id: 'd', label: 'Dragonne', sub: '×1', kind: 'materiel', condition: 'ok' },
  ],
  floor: [
    { id: 'p', label: 'Pompe / machine', sub: 'N° série —', kind: 'machine', condition: 'broken' },
    { id: 'e', label: 'Essence machine', sub: '×1', kind: 'materiel', condition: 'ok' },
    { id: 'b', label: 'Bidons vides', sub: '×1', kind: 'materiel', condition: 'ok' },
    { id: 'c', label: 'Cônes / signalisation', sub: '×1', kind: 'materiel', condition: 'missing' },
  ],
  right_shelf: [{ id: 'rac', label: 'Caisse raccords', sub: '4 articles', kind: 'caisse', condition: 'ok' }],
};
const labels = { cab: 'Cabine', bulkhead: 'Zone cloison', left_shelf: 'Étagères gauche', floor: 'Plancher', right_shelf: 'Étagères droite' };
const worst = { left_shelf: 'damaged_usable', floor: 'broken' };

let zones = Object.keys(labels).map((key) => ({
  id: key,
  key,
  label: labels[key],
  worst: worst[key] || 'ok',
  rect: { ...DEFAULT_ZONE_GEOM[key] },
  blocks: blocks[key],
}));

if (mode === 'edit') {
  // Edited layout: shorter floor zone + a custom zone near the rear doors (being resized)
  zones = zones.map((z) => (z.key === 'floor' ? { ...z, rect: { x: 46, y: 52, w: 72, h: 165 } } : z));
  zones.push({
    id: 'custom',
    key: null,
    label: 'Bac à tuyaux',
    worst: 'ok',
    rect: { x: 46, y: 225, w: 72, h: 55 },
    blocks: [{ id: 't', label: 'Tuyau 20 m', sub: '×2', kind: 'materiel', condition: 'ok' }],
  });
}

const big =
  mode === 'edit'
    ? renderToStaticMarkup(
        <VanSvg zones={zones} title="Van Martin" grid dimBlocks style={{ width: 480, height: 1040 }}>
          <ZoneEditOverlay zones={zones} selectedId="custom" svgRef={null} onQuickAdd={() => {}} />
        </VanSvg>
      )
    : renderToStaticMarkup(<VanSvg zones={zones} title="Van Martin" style={{ width: 480, height: 1040 }} />);
const mini = renderToStaticMarkup(<VanSvg zones={zones.map((z) => ({ ...z, blocks: [] }))} mini style={{ width: 120, height: 260 }} />);

const side =
  mode === 'edit'
    ? `<h1>Flotte · « Modifier le plan » (v1.9.0)</h1>
<p>Mode édition : grille de 5 cm, zones déplaçables, poignées jaunes pour redimensionner, « + » pour ajouter un article dans la zone.
La géométrie (x, y, l, h en cm du plancher de chargement) est enregistrée par van.</p>
<div class="toolbar"><b>Bac à tuyaux</b> <span class="mono">72×55 cm</span>
<div class="btns"><span class="btn y">+ Ajouter dans la zone</span><span class="btn">Renommer</span><span class="btn r">Supprimer la zone</span></div>
<div class="btns sep"><span class="btn">Nouvelle zone</span><span class="btn">Disposition par défaut</span><span class="btn">Utiliser comme disposition par défaut</span></div></div>
<p style="margin-top:24px">Carte aperçu (mini van) :</p><div class="card" style="display:inline-block">${mini}</div>`
    : `<h1>Flotte · vue van (Peugeot Expert L3, dessin original)</h1>
<p>Vue de dessus du compartiment de chargement (≈ 2,86 m × 1,63 m) — cabine en haut, portes arrière en bas, porte latérale coulissante à droite.
Maintenez un élément puis glissez-le vers une zone ou une caisse pour le déplacer.</p>
<div class="legend"><span><i style="background:#10b981"></i>OK</span><span><i style="background:#eab308"></i>Abîmé mais utilisable</span><span><i style="background:#ef4444"></i>Hors service</span><span><i style="background:#9ca3af"></i>Manquant</span></div>
<p style="margin-top:24px">Carte aperçu (mini van) :</p><div class="card" style="display:inline-block">${mini}</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc}
.wrap{display:flex;gap:40px;padding:32px;align-items:flex-start}
h1{font-size:22px;color:#0b1f4d;margin:0 0 6px} p{margin:0 0 16px;color:#475569;font-size:13px;line-height:1.45}
.legend span{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:13px}
.legend i{width:12px;height:12px;border-radius:50%;display:inline-block}
.card{background:#fff;border-radius:24px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.card.edit{background:#fefce8;box-shadow:0 0 0 3px #fde047}
.toolbar{background:#fff;border:1px solid #fde68a;border-radius:16px;padding:14px;font-size:14px;color:#0b1f4d}
.mono{font-family:monospace;color:#64748b;margin-left:8px}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.btns.sep{border-top:1px solid #f1f5f9;padding-top:10px}
.btn{border:1px solid #e2e8f0;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700}
.btn.y{background:#facc15;border-color:#facc15}.btn.r{color:#dc2626}
</style></head><body><div class="wrap">
<div class="card ${mode === 'edit' ? 'edit' : ''}">${big}</div>
<div style="max-width:520px">${side}</div></div></body></html>`;

process.stdout.write(html);
