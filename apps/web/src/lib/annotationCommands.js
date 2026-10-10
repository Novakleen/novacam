/**
 * Non-destructive annotation document and its undo stack.
 * Shapes live in image pixels. History stores plain JSON snapshots — never bitmaps.
 */

export const ANNOTATION_COLORS = ['#facc15', '#111111', '#ffffff', '#ef4444', '#2563eb', '#16a34a'];

export const STROKE_WIDTHS = [4, 8, 16];

export const NOVAKLEEN_YELLOW = '#facc15';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function emptyDocument(width = 0, height = 0) {
  return {
    version: 1,
    width: Math.max(0, Math.round(Number(width) || 0)),
    height: Math.max(0, Math.round(Number(height) || 0)),
    rotation: 0,
    crop: null,
    shapes: [],
  };
}

export function createHistory(doc) {
  return { past: [], present: clone(doc || emptyDocument()), future: [] };
}

function commit(history, present) {
  return {
    past: [...history.past, history.present],
    present: clone(present),
    future: [],
  };
}

export function canUndo(history) {
  return history.past.length > 0;
}

export function canRedo(history) {
  return history.future.length > 0;
}

export function undo(history) {
  if (!canUndo(history)) return history;
  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];
  return { past, present, future: [history.present, ...history.future] };
}

export function redo(history) {
  if (!canRedo(history)) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present, future };
}

function withId(shape) {
  const next = { ...shape };
  if (!next.id) {
    next.id = `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return next;
}

export function addShape(history, shape) {
  if (!shape || !shape.type) return history;
  const present = clone(history.present);
  present.shapes = [...present.shapes, withId(shape)];
  return commit(history, present);
}

export function updateShape(history, id, patch) {
  const present = clone(history.present);
  const index = present.shapes.findIndex((shape) => shape.id === id);
  if (index < 0) return history;
  present.shapes[index] = { ...present.shapes[index], ...patch, id };
  return commit(history, present);
}

function shiftShape(shape, dx, dy) {
  if (shape.type === 'freehand') {
    return {
      ...shape,
      points: (shape.points || []).map((point) => ({ x: point.x + dx, y: point.y + dy })),
    };
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    return {
      ...shape,
      x1: shape.x1 + dx,
      y1: shape.y1 + dy,
      x2: shape.x2 + dx,
      y2: shape.y2 + dy,
    };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

export function moveShape(history, id, dx, dy) {
  if (!dx && !dy) return history;
  const present = clone(history.present);
  const index = present.shapes.findIndex((shape) => shape.id === id);
  if (index < 0) return history;
  present.shapes[index] = shiftShape(present.shapes[index], dx, dy);
  return commit(history, present);
}

export function removeShape(history, id) {
  const present = clone(history.present);
  const shapes = present.shapes.filter((shape) => shape.id !== id);
  if (shapes.length === present.shapes.length) return history;
  present.shapes = shapes;
  return commit(history, present);
}

export function clearShapes(history) {
  if (history.present.shapes.length === 0) return history;
  const present = clone(history.present);
  present.shapes = [];
  return commit(history, present);
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normalizeCrop(crop) {
  if (!crop) return { x: 0, y: 0, w: 1, h: 1 };
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const w = Math.min(1 - x, Math.max(0.05, Number(crop.w) || 0));
  const h = Math.min(1 - y, Math.max(0.05, Number(crop.h) || 0));
  return { x, y, w, h };
}

export function setCrop(history, crop) {
  const present = clone(history.present);
  if (!crop) {
    if (!present.crop) return history;
    present.crop = null;
    return commit(history, present);
  }
  const next = normalizeCrop(crop);
  if (next.x === 0 && next.y === 0 && next.w >= 0.999 && next.h >= 0.999) {
    if (!present.crop) return history;
    present.crop = null;
    return commit(history, present);
  }
  present.crop = next;
  return commit(history, present);
}

function rotatePoint(x, y, width, height, turns) {
  if (turns === 90) return { x: height - y, y: x };
  if (turns === 180) return { x: width - x, y: height - y };
  if (turns === 270) return { x: y, y: width - x };
  return { x, y };
}

function rotateShape(shape, width, height, turns) {
  const map = (x, y) => rotatePoint(x, y, width, height, turns);
  if (shape.type === 'freehand') {
    return { ...shape, points: (shape.points || []).map((point) => map(point.x, point.y)) };
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    const a = map(shape.x1, shape.y1);
    const b = map(shape.x2, shape.y2);
    return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (shape.type === 'rectangle' || shape.type === 'ellipse') {
    const a = map(shape.x, shape.y);
    const b = map(shape.x + shape.w, shape.y + shape.h);
    return {
      ...shape,
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  }
  if (shape.type === 'text') {
    const point = map(shape.x, shape.y);
    return { ...shape, x: point.x, y: point.y };
  }
  return shape;
}

function rotateCrop(crop, turns) {
  if (!crop) return null;
  const { x, y, w, h } = crop;
  if (turns === 90) return normalizeCrop({ x: 1 - (y + h), y: x, w: h, h: w });
  if (turns === 180) return normalizeCrop({ x: 1 - (x + w), y: 1 - (y + h), w, h });
  if (turns === 270) return normalizeCrop({ x: y, y: 1 - (x + w), w: h, h: w });
  return crop;
}

/** Rotate the photo and every shape together. One undo step. */
export function rotateDocument(history, delta = 90) {
  const turns = ((Number(delta) % 360) + 360) % 360;
  if (![90, 180, 270].includes(turns)) return history;
  const doc = history.present;
  const swaps = turns === 90 || turns === 270;
  const present = {
    ...clone(doc),
    width: swaps ? doc.height : doc.width,
    height: swaps ? doc.width : doc.height,
    rotation: ((doc.rotation || 0) + turns) % 360,
    crop: rotateCrop(doc.crop, turns),
    shapes: doc.shapes.map((shape) => rotateShape(shape, doc.width, doc.height, turns)),
  };
  return commit(history, present);
}

export function shapeBounds(shape) {
  if (!shape) return null;
  if (shape.type === 'freehand') {
    const points = shape.points || [];
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
  }
  if (shape.type === 'text') {
    const size = shape.fontSize || 32;
    const width = Math.max(size, String(shape.text || '').length * size * 0.55);
    return { x: shape.x, y: shape.y - size, w: width, h: size * 1.2 };
  }
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function shapeHits(shape, x, y, tolerance) {
  if (shape.type === 'line' || shape.type === 'arrow') {
    return distanceToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= tolerance;
  }
  if (shape.type === 'freehand') {
    return (shape.points || []).some((point) => Math.hypot(point.x - x, point.y - y) <= tolerance);
  }
  const bounds = shapeBounds(shape);
  if (!bounds) return false;
  return (
    x >= bounds.x - tolerance &&
    y >= bounds.y - tolerance &&
    x <= bounds.x + bounds.w + tolerance &&
    y <= bounds.y + bounds.h + tolerance
  );
}

/** Top-most shape under the point, or null. */
export function hitTest(doc, x, y, tolerance = 14) {
  const shapes = doc?.shapes || [];
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    if (shapeHits(shapes[index], x, y, tolerance)) return shapes[index].id;
  }
  return null;
}
