/**
 * Pure before/after template geometry and export sizing.
 * No DOM. The composer, the JPEG export, and the unit tests all use this.
 */

export const EXPORT_LONG_EDGE = 2048;

export const TEMPLATES = ['side-by-side', 'stacked', 'diagonal', 'slider'];

export const LOGO_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export const BRAND = {
  yellow: '#facc15',
  navy: '#0b1f4d',
  black: '#111111',
};

export const LABELS = {
  fr: { before: 'Avant', after: 'Après' },
  nl: { before: 'Voor', after: 'Na' },
  en: { before: 'Before', after: 'After' },
};

export function labelsFor(lang) {
  const key = String(lang || 'fr').slice(0, 2).toLowerCase();
  return LABELS[key] || LABELS.fr;
}

export function clampSlider(position) {
  const n = Number(position);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

/**
 * Width of the before image, as a percent of its clip, so the photo stays
 * full-frame while the clip shrinks. Null when the clip is empty — callers
 * must skip the draw instead of dividing by zero.
 */
export function sliderImageWidthPercent(position) {
  const clip = clampSlider(position);
  if (clip <= 0) return null;
  return 100 / (clip / 100);
}

export function defaultTransform() {
  return { x: 0, y: 0, scale: 1, rotation: 0 };
}

export function clampTransform(transform) {
  const source = transform || {};
  const scale = Number(source.scale);
  const rotation = Number(source.rotation);
  const x = Number(source.x);
  const y = Number(source.y);
  const turns = Number.isFinite(rotation) ? rotation : 0;
  return {
    x: Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0,
    y: Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0,
    scale: Number.isFinite(scale) ? Math.max(1, Math.min(4, scale)) : 1,
    rotation: ((turns % 360) + 360) % 360,
  };
}

/** Canvas size for a JPEG export. The long edge is always EXPORT_LONG_EDGE. */
export function exportCanvasSize(template) {
  const longEdge = EXPORT_LONG_EDGE;
  switch (template) {
    case 'stacked':
      return { width: Math.round((longEdge * 2) / 3), height: longEdge };
    case 'diagonal':
      return { width: longEdge, height: longEdge };
    case 'slider':
      return { width: longEdge, height: Math.round(longEdge * 0.75) };
    case 'side-by-side':
    default:
      return { width: longEdge, height: Math.round((longEdge * 2) / 3) };
  }
}

/**
 * Cover-fit `src` into `dest`, then pan (normalized -1..1), zoom, and rotate
 * around the dest center. Coordinates are canvas pixels.
 */
export function coverPlacement(srcW, srcH, dest, transform) {
  const aligned = clampTransform(transform);
  const sw = Math.max(1, Number(srcW) || 1);
  const sh = Math.max(1, Number(srcH) || 1);
  const scaleCover = Math.max(dest.w / sw, dest.h / sh);
  const drawW = sw * scaleCover * aligned.scale;
  const drawH = sh * scaleCover * aligned.scale;
  const cx = dest.x + dest.w / 2 + aligned.x * dest.w;
  const cy = dest.y + dest.h / 2 + aligned.y * dest.h;
  return {
    x: cx - drawW / 2,
    y: cy - drawH / 2,
    w: drawW,
    h: drawH,
    rotation: aligned.rotation,
    cx,
    cy,
  };
}

/** Before-region polygon for the diagonal template. After fills the rest. */
export function diagonalBeforePolygon(width, height) {
  return [
    [0, 0],
    [width * 0.22, 0],
    [width * 0.7, height * 0.42],
    [width, height * 0.72],
    [width, height],
    [0, height],
  ];
}

export function templateFrames(width, height, template, sliderPosition) {
  const slider = clampSlider(sliderPosition);
  if (template === 'stacked') {
    const half = height / 2;
    return {
      before: { x: 0, y: 0, w: width, h: half },
      after: { x: 0, y: half, w: width, h: half },
      clip: null,
    };
  }
  if (template === 'diagonal') {
    const full = { x: 0, y: 0, w: width, h: height };
    return {
      before: full,
      after: full,
      clip: { beforePolygon: diagonalBeforePolygon(width, height) },
    };
  }
  if (template === 'slider') {
    const full = { x: 0, y: 0, w: width, h: height };
    const clipW = (slider / 100) * width;
    return {
      before: full,
      after: full,
      clip: { x: 0, y: 0, w: clipW, h: height },
      sliderX: clipW,
    };
  }
  const half = width / 2;
  return {
    before: { x: 0, y: 0, w: half, h: height },
    after: { x: half, y: 0, w: half, h: height },
    clip: null,
  };
}

export function dateStripHeight(height, enabled) {
  if (!enabled) return 0;
  return Math.max(28, Math.round(height * 0.055));
}

export function labelBoxes(width, height, template, showDateStrip) {
  const pad = Math.round(Math.min(width, height) * 0.03);
  const boxW = Math.round(Math.min(width, height) * 0.28);
  const boxH = Math.max(22, Math.round(Math.min(width, height) * 0.07));
  const strip = dateStripHeight(height, showDateStrip);
  if (template === 'stacked') {
    return {
      before: { x: (width - boxW) / 2, y: height / 2 - boxH - pad, w: boxW, h: boxH },
      after: { x: (width - boxW) / 2, y: height / 2 + pad, w: boxW, h: boxH },
    };
  }
  const y = height - boxH - pad - strip;
  return {
    before: { x: pad, y, w: boxW, h: boxH },
    after: { x: width - boxW - pad, y, w: boxW, h: boxH },
  };
}

export function logoBox(width, height, corner, showDateStrip) {
  const size = Math.round(Math.min(width, height) * 0.14);
  const pad = Math.round(size * 0.22);
  const strip = dateStripHeight(height, showDateStrip);
  const spots = {
    'top-left': { x: pad, y: pad },
    'top-right': { x: width - size - pad, y: pad },
    'bottom-left': { x: pad, y: height - size - pad - strip },
    'bottom-right': { x: width - size - pad, y: height - size - pad - strip },
  };
  const pos = spots[corner] || spots['top-left'];
  return { ...pos, w: size, h: size };
}

export function dateStripBox(width, height, enabled) {
  const h = dateStripHeight(height, enabled);
  if (!h) return null;
  return { x: 0, y: height - h, w: width, h };
}

export function nextLogoCorner(current) {
  const index = LOGO_CORNERS.indexOf(current);
  return LOGO_CORNERS[(index + 1) % LOGO_CORNERS.length];
}

export function formatComparisonDate(value, lang) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'nl' ? 'nl-BE' : lang === 'en' ? 'en-GB' : 'fr-BE';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function layoutComparison(options = {}) {
  const template = TEMPLATES.includes(options.template) ? options.template : 'side-by-side';
  const size =
    options.width && options.height
      ? { width: Math.round(options.width), height: Math.round(options.height) }
      : exportCanvasSize(template);
  const showDateStrip = Boolean(options.showDateStrip);
  const frames = templateFrames(size.width, size.height, template, options.slider);
  return {
    template,
    width: size.width,
    height: size.height,
    longEdge: Math.max(size.width, size.height),
    frames,
    labels: labelsFor(options.labelLang),
    labelBoxes: labelBoxes(size.width, size.height, template, showDateStrip),
    logo: logoBox(size.width, size.height, options.logoCorner || 'top-left', showDateStrip),
    dateStrip: dateStripBox(size.width, size.height, showDateStrip),
    sliderImageWidthPercent: template === 'slider' ? sliderImageWidthPercent(options.slider) : null,
    transforms: {
      before: clampTransform(options.transforms?.before),
      after: clampTransform(options.transforms?.after),
    },
  };
}
