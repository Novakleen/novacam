/**
 * Sobel edge mask for the before-photo alignment overlay.
 * Returns RGBA pixels: NovaKleen yellow on edges, transparent elsewhere.
 */

const YELLOW = [250, 204, 21, 255];

export function sobelEdges(pixels, width, height, threshold = 48) {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  const out = new Uint8ClampedArray(w * h * 4);
  if (w < 3 || h < 3 || !pixels) return out;

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const offset = i * 4;
    gray[i] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
  }

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] +
        gray[i - w + 1] +
        -2 * gray[i - 1] +
        2 * gray[i + 1] +
        -gray[i + w - 1] +
        gray[i + w + 1];
      const gy =
        -gray[i - w - 1] -
        2 * gray[i - w] -
        gray[i - w + 1] +
        gray[i + w - 1] +
        2 * gray[i + w] +
        gray[i + w + 1];
      if (Math.hypot(gx, gy) >= threshold) {
        const offset = i * 4;
        out[offset] = YELLOW[0];
        out[offset + 1] = YELLOW[1];
        out[offset + 2] = YELLOW[2];
        out[offset + 3] = YELLOW[3];
      }
    }
  }
  return out;
}
