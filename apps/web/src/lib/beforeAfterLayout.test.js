import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_LONG_EDGE,
  TEMPLATES,
  coverPlacement,
  exportCanvasSize,
  labelsFor,
  layoutComparison,
  logoBox,
  sliderImageWidthPercent,
  templateFrames,
} from './beforeAfterLayout.js';

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

test('export long edge is 2048 for every template', () => {
  for (const template of TEMPLATES) {
    const size = exportCanvasSize(template);
    assert.equal(Math.max(size.width, size.height), EXPORT_LONG_EDGE);
    assert.ok(size.width >= 1 && size.height >= 1);
    const layout = layoutComparison({ template });
    assert.equal(layout.longEdge, EXPORT_LONG_EDGE);
    assert.equal(layout.width, size.width);
    assert.equal(layout.height, size.height);
  }
});

test('side-by-side panels split the width and meet in the middle', () => {
  const layout = layoutComparison({ template: 'side-by-side' });
  assert.equal(layout.frames.before.x, 0);
  assert.equal(layout.frames.before.w, layout.width / 2);
  assert.equal(layout.frames.after.x, layout.width / 2);
  assert.equal(layout.frames.after.w, layout.frames.before.w);
  assert.equal(layout.frames.before.h, layout.height);
  assert.equal(layout.frames.after.h, layout.height);
});

test('stacked panels split the height and do not overlap', () => {
  const layout = layoutComparison({ template: 'stacked' });
  assert.equal(layout.frames.before.y, 0);
  assert.equal(layout.frames.before.h, layout.height / 2);
  assert.equal(layout.frames.after.y, layout.height / 2);
  assert.equal(layout.frames.before.w, layout.width);
  assert.equal(layout.frames.after.w, layout.width);
});

test('diagonal before-region covers part of the frame, not all of it', () => {
  const layout = layoutComparison({ template: 'diagonal' });
  const polygon = layout.frames.clip.beforePolygon;
  assert.ok(polygon.length >= 3);
  const area = polygonArea(polygon);
  const frame = layout.width * layout.height;
  assert.ok(area > frame * 0.35, `area ${area} too small`);
  assert.ok(area < frame * 0.85, `area ${area} too large`);
});

test('slider at 0% does not divide by zero and hides the before clip', () => {
  assert.equal(sliderImageWidthPercent(0), null);
  assert.equal(sliderImageWidthPercent(-20), null);
  const frames = templateFrames(2048, 1536, 'slider', 0);
  assert.equal(frames.clip.w, 0);
  const layout = layoutComparison({ template: 'slider', slider: 0 });
  assert.equal(layout.sliderImageWidthPercent, null);
  assert.equal(layout.frames.clip.w, 0);
});

test('slider at 50% keeps the before photo twice as wide as the clip', () => {
  assert.equal(sliderImageWidthPercent(50), 200);
  const layout = layoutComparison({ template: 'slider', slider: 50 });
  assert.equal(layout.frames.clip.w, layout.width / 2);
  assert.equal(layout.sliderImageWidthPercent, 200);
});

test('slider at 100% shows the before photo at its own width', () => {
  assert.equal(sliderImageWidthPercent(100), 100);
});

test('labels follow fr, nl and en', () => {
  assert.deepEqual(labelsFor('fr'), { before: 'Avant', after: 'Après' });
  assert.deepEqual(labelsFor('nl'), { before: 'Voor', after: 'Na' });
  assert.deepEqual(labelsFor('en'), { before: 'Before', after: 'After' });
  assert.deepEqual(labelsFor('fr-BE'), { before: 'Avant', after: 'Après' });
  assert.equal(layoutComparison({ template: 'slider', labelLang: 'nl' }).labels.before, 'Voor');
});

test('cover placement centers a landscape photo and pans in dest pixels', () => {
  const dest = { x: 0, y: 0, w: 100, h: 100 };
  const centered = coverPlacement(200, 100, dest, { x: 0, y: 0, scale: 1, rotation: 0 });
  assert.equal(centered.w, 200);
  assert.equal(centered.h, 100);
  assert.equal(centered.cx, 50);
  assert.equal(centered.cy, 50);

  const panned = coverPlacement(100, 100, dest, { x: 0.2, y: -0.1, scale: 2, rotation: 90 });
  assert.equal(panned.cx, 70);
  assert.equal(panned.cy, 40);
  assert.equal(panned.w, 200);
  assert.equal(panned.rotation, 90);
});

test('logo sits above the date strip and the strip spans the bottom edge', () => {
  const layout = layoutComparison({
    template: 'side-by-side',
    showDateStrip: true,
    logoCorner: 'bottom-right',
  });
  assert.ok(layout.dateStrip);
  assert.equal(layout.dateStrip.y + layout.dateStrip.h, layout.height);
  assert.equal(layout.dateStrip.w, layout.width);
  const logo = logoBox(layout.width, layout.height, 'bottom-right', true);
  assert.ok(logo.y + logo.h <= layout.dateStrip.y);
  assert.ok(layout.labelBoxes.before.y + layout.labelBoxes.before.h <= layout.dateStrip.y);
});
