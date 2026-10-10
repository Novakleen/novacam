import test from 'node:test';
import assert from 'node:assert/strict';
import { sobelEdges } from './edgeDetect.js';

function stepImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = x < width / 2 ? 20 : 230;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

test('sobel marks the vertical step and leaves flat areas empty', () => {
  const width = 24;
  const height = 12;
  const edges = sobelEdges(stepImage(width, height), width, height, 40);
  let edgePixels = 0;
  let farFromStep = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = edges[(y * width + x) * 4 + 3];
      if (alpha === 0) continue;
      edgePixels += 1;
      if (x < 4 || x > width - 5) farFromStep += 1;
      assert.equal(edges[(y * width + x) * 4], 250);
    }
  }
  assert.ok(edgePixels > 0);
  assert.equal(farFromStep, 0);
});
