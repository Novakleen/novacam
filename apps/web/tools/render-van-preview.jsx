/* global process */
// Headless preview of the Fleet van SVG (v1.8.0).
// Usage: node tools/render-van-preview.mjs  (bundles this file with esbuild, then Chrome → PNG)
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import VanSvg from '../src/components/fleet/VanSvg.jsx';

const zones = {
  cab: { label: 'Cabine', worst: 'ok', blocks: [] },
  bulkhead: {
    label: 'Zone cloison',
    worst: 'ok',
    blocks: [{ id: 'epi', label: 'Caisse EPI', sub: '1 article', kind: 'caisse', condition: 'ok' }],
  },
  left_shelf: {
    label: 'Étagères gauche',
    worst: 'damaged_usable',
    blocks: [
      { id: 'l', label: 'Lances', sub: '×2', kind: 'materiel', condition: 'damaged_usable' },
      { id: 'r', label: 'Rallonges', sub: '×2', kind: 'materiel', condition: 'ok' },
      { id: 'd', label: 'Dragonne', sub: '×1', kind: 'materiel', condition: 'ok' },
    ],
  },
  floor: {
    label: 'Plancher',
    worst: 'broken',
    blocks: [
      { id: 'p', label: 'Pompe / machine', sub: 'N° série —', kind: 'machine', condition: 'broken' },
      { id: 'e', label: 'Essence machine', sub: '×1', kind: 'materiel', condition: 'ok' },
      { id: 'b', label: 'Bidons vides', sub: '×1', kind: 'materiel', condition: 'ok' },
      { id: 'c', label: 'Cônes / signalisation', sub: '×1', kind: 'materiel', condition: 'missing' },
    ],
  },
  right_shelf: {
    label: 'Étagères droite',
    worst: 'ok',
    blocks: [{ id: 'rac', label: 'Caisse raccords', sub: '4 articles', kind: 'caisse', condition: 'ok' }],
  },
};

const big = renderToStaticMarkup(<VanSvg zones={zones} title="Van Martin" style={{ width: 480, height: 1040 }} />);
const mini = renderToStaticMarkup(<VanSvg zones={zones} mini style={{ width: 120, height: 260 }} />);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc}
.wrap{display:flex;gap:40px;padding:32px;align-items:flex-start}
h1{font-size:22px;color:#0b1f4d;margin:0 0 6px} p{margin:0 0 16px;color:#475569;font-size:13px}
.legend span{display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:13px}
.legend i{width:12px;height:12px;border-radius:50%;display:inline-block}
.card{background:#fff;border-radius:24px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
</style></head><body><div class="wrap">
<div class="card">${big}</div>
<div><h1>Flotte · vue van (Peugeot Expert L3, dessin original)</h1>
<p>Vue de dessus du compartiment de chargement (≈ 2,86 m × 1,63 m) — cabine en haut, portes arrière en bas, porte latérale coulissante à droite.</p>
<div class="legend"><span><i style="background:#10b981"></i>OK</span><span><i style="background:#eab308"></i>Abîmé mais utilisable</span><span><i style="background:#ef4444"></i>Hors service</span><span><i style="background:#9ca3af"></i>Manquant</span></div>
<p style="margin-top:24px">Carte aperçu (mini van) :</p><div class="card" style="display:inline-block">${mini}</div>
</div></div></body></html>`;

process.stdout.write(html);
