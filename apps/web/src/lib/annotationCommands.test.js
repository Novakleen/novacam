import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANNOTATION_COLORS,
  NOVAKLEEN_YELLOW,
  addShape,
  clearShapes,
  createHistory,
  emptyDocument,
  hitTest,
  moveShape,
  redo,
  removeShape,
  rotateDocument,
  setCrop,
  undo,
  updateShape,
} from './annotationCommands.js';

test('palette includes NovaKleen yellow', () => {
  assert.equal(NOVAKLEEN_YELLOW, '#facc15');
  assert.ok(ANNOTATION_COLORS.includes(NOVAKLEEN_YELLOW));
});

test('undo and redo a freehand stroke, and a new command drops the redo stack', () => {
  let history = createHistory(emptyDocument(1000, 800));
  history = addShape(history, {
    id: 'pen',
    type: 'freehand',
    points: [
      { x: 1, y: 1 },
      { x: 4, y: 6 },
    ],
    color: NOVAKLEEN_YELLOW,
    strokeWidth: 4,
  });
  assert.equal(history.present.shapes.length, 1);
  assert.equal(history.past.length, 1);

  history = undo(history);
  assert.equal(history.present.shapes.length, 0);
  assert.equal(history.future.length, 1);

  history = redo(history);
  assert.equal(history.present.shapes[0].id, 'pen');

  history = undo(history);
  history = addShape(history, {
    id: 'line',
    type: 'line',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 10,
    color: '#111111',
    strokeWidth: 4,
  });
  assert.equal(history.future.length, 0);
  assert.equal(history.present.shapes.length, 1);
  assert.equal(history.present.shapes[0].type, 'line');
  assert.equal(redo(history), history);
});

test('moveShape shifts an arrow in one undo step', () => {
  let history = createHistory(emptyDocument(400, 300));
  history = addShape(history, {
    id: 'arrow',
    type: 'arrow',
    x1: 10,
    y1: 20,
    x2: 80,
    y2: 90,
    color: NOVAKLEEN_YELLOW,
    strokeWidth: 8,
  });
  history = moveShape(history, 'arrow', 15, -5);
  assert.deepEqual(
    [history.present.shapes[0].x1, history.present.shapes[0].y1, history.present.shapes[0].x2, history.present.shapes[0].y2],
    [25, 15, 95, 85]
  );
  history = undo(history);
  assert.equal(history.present.shapes[0].x1, 10);
  assert.equal(history.present.shapes[0].y2, 90);
  assert.equal(moveShape(history, 'missing', 1, 1).present, history.present);
});

test('clearShapes removes drawings and undo restores them without touching rotation', () => {
  let history = createHistory(emptyDocument(200, 200));
  history = addShape(history, {
    id: 'rect',
    type: 'rectangle',
    x: 10,
    y: 10,
    w: 40,
    h: 20,
    color: '#ffffff',
    strokeWidth: 4,
  });
  history = rotateDocument(history, 90);
  const rotatedWidth = history.present.width;
  history = clearShapes(history);
  assert.equal(history.present.shapes.length, 0);
  assert.equal(history.present.width, rotatedWidth);
  history = undo(history);
  assert.equal(history.present.shapes.length, 1);
  assert.equal(history.present.shapes[0].id, 'rect');
});

test('rotate 90 swaps dimensions and moves a point clockwise', () => {
  let history = createHistory(emptyDocument(100, 50));
  history = addShape(history, {
    id: 't',
    type: 'text',
    x: 10,
    y: 20,
    text: 'Hi',
    color: '#111111',
    fontSize: 16,
  });
  history = rotateDocument(history, 90);
  assert.equal(history.present.width, 50);
  assert.equal(history.present.height, 100);
  assert.equal(history.present.rotation, 90);
  assert.equal(history.present.shapes[0].x, 30);
  assert.equal(history.present.shapes[0].y, 10);
  history = undo(history);
  assert.equal(history.present.width, 100);
  assert.equal(history.present.height, 50);
  assert.equal(history.present.shapes[0].x, 10);
  assert.equal(history.present.shapes[0].y, 20);
});

test('crop is stored as a normalized rect and undo restores the previous crop', () => {
  let history = createHistory(emptyDocument(800, 600));
  history = setCrop(history, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  assert.deepEqual(history.present.crop, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  history = setCrop(history, { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(history.present.crop, null);
  history = undo(history);
  assert.equal(history.present.crop.w, 0.5);
  history = rotateDocument(history, 90);
  assert.ok(history.present.crop.w > 0);
  assert.ok(history.present.crop.x >= 0 && history.present.crop.x <= 1);
});

test('hitTest returns the top-most shape and updateShape recolors it', () => {
  let history = createHistory(emptyDocument(200, 200));
  history = addShape(history, {
    id: 'a',
    type: 'rectangle',
    x: 10,
    y: 10,
    w: 80,
    h: 80,
    color: '#111111',
    strokeWidth: 4,
  });
  history = addShape(history, {
    id: 'b',
    type: 'ellipse',
    x: 30,
    y: 30,
    w: 40,
    h: 40,
    color: '#ffffff',
    strokeWidth: 4,
  });
  assert.equal(hitTest(history.present, 40, 40), 'b');
  assert.equal(hitTest(history.present, 15, 15), 'a');
  assert.equal(hitTest(history.present, 190, 190), null);
  history = updateShape(history, 'b', { color: NOVAKLEEN_YELLOW });
  assert.equal(history.present.shapes[1].color, NOVAKLEEN_YELLOW);
  history = removeShape(history, 'b');
  assert.equal(history.present.shapes.length, 1);
  history = undo(history);
  assert.equal(history.present.shapes.length, 2);
});
