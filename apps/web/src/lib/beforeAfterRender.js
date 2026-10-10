import {
  BRAND,
  clampSlider,
  coverPlacement,
  exportCanvasSize,
  formatComparisonDate,
  labelsFor,
  layoutComparison,
} from '@/lib/beforeAfterLayout';

export function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('missing image'));
      return;
    }
    const image = new Image();
    if (!String(src).startsWith('data:') && !String(src).startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clipBefore(ctx, layout) {
  const clip = layout.frames.clip;
  ctx.beginPath();
  if (clip?.beforePolygon) {
    const [first, ...rest] = clip.beforePolygon;
    ctx.moveTo(first[0], first[1]);
    rest.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    return true;
  }
  if (clip && clip.w != null) {
    if (clip.w <= 0) return false;
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    return true;
  }
  const frame = layout.frames.before;
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  return true;
}

function drawCover(ctx, image, frame, transform) {
  if (!image) return;
  const placement = coverPlacement(image.naturalWidth || image.width, image.naturalHeight || image.height, frame, transform);
  ctx.save();
  ctx.translate(placement.cx, placement.cy);
  ctx.rotate((placement.rotation * Math.PI) / 180);
  ctx.drawImage(image, placement.x - placement.cx, placement.y - placement.cy, placement.w, placement.h);
  ctx.restore();
}

function drawLabel(ctx, box, text) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(ctx, box.x, box.y, box.w, box.h, box.h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(box.h * 0.46)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1);
  ctx.restore();
}

export function drawWordmark(ctx, box) {
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.w * 0.12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = BRAND.black;
  roundRect(ctx, box.x + 2, box.y + 2, box.w - 4, box.h - 4, box.w * 0.1);
  ctx.fill();
  ctx.fillStyle = BRAND.yellow;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(box.h * 0.34)}px sans-serif`;
  ctx.fillText('NK', box.x + box.w / 2, box.y + box.h * 0.4);
  ctx.font = `700 ${Math.round(box.h * 0.13)}px sans-serif`;
  ctx.fillText('NOVAKLEEN', box.x + box.w / 2, box.y + box.h * 0.72);
  ctx.restore();
}

function drawLogo(ctx, box, logoImage) {
  if (!logoImage) {
    drawWordmark(ctx, box);
    return;
  }
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, box.w * 0.12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  ctx.drawImage(logoImage, box.x + 3, box.y + 3, box.w - 6, box.h - 6);
  ctx.restore();
}

/**
 * Paint one comparison into an existing canvas 2D context.
 * `width` and `height` are CSS pixels; the caller sets the backing store.
 */
export function paintComparison(ctx, spec) {
  const layout = layoutComparison(spec);
  const { width, height } = layout;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.frames.after.x, layout.frames.after.y, layout.frames.after.w, layout.frames.after.h);
  ctx.clip();
  drawCover(ctx, spec.afterImage, layout.frames.after, layout.transforms.after);
  ctx.restore();

  ctx.save();
  const visible = clipBefore(ctx, layout);
  if (visible) {
    ctx.clip();
    drawCover(ctx, spec.beforeImage, layout.frames.before, layout.transforms.before);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  if (layout.template === 'side-by-side') {
    const x = layout.frames.after.x;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  } else if (layout.template === 'stacked') {
    const y = layout.frames.after.y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  } else if (layout.template === 'diagonal' && layout.frames.clip?.beforePolygon) {
    const edge = layout.frames.clip.beforePolygon.slice(1, 4);
    ctx.beginPath();
    ctx.moveTo(edge[0][0], edge[0][1]);
    edge.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.stroke();
  } else if (layout.template === 'slider') {
    const x = clampSlider(spec.slider) === 0 ? 0 : layout.frames.sliderX;
    if (x > 0) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, height / 2, Math.max(10, width * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const labels = spec.labels || labelsFor(spec.labelLang);
  drawLabel(ctx, layout.labelBoxes.before, labels.before);
  drawLabel(ctx, layout.labelBoxes.after, labels.after);
  drawLogo(ctx, layout.logo, spec.logoImage);

  if (layout.dateStrip && spec.stripText) {
    const strip = layout.dateStrip;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
    ctx.fillStyle = BRAND.yellow;
    ctx.fillRect(strip.x, strip.y, strip.w, 3);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(strip.h * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.stripText, strip.x + strip.w / 2, strip.y + strip.h / 2 + 1);
    ctx.restore();
  }

  return layout;
}

export function comparisonStripText({ projectName, date, labelLang }) {
  const when = formatComparisonDate(date, labelLang);
  const name = String(projectName || '').trim();
  return [name, when].filter(Boolean).join('  ·  ');
}

export async function canvasToJpegFile(canvas, filename = 'novakleen-avant-apres.jpg', quality = 0.92) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) reject(new Error('jpeg encode failed'));
      else resolve(result);
    }, 'image/jpeg', quality);
  });
  return new File([blob], filename, { type: 'image/jpeg' });
}

/** Render the chosen template to one JPEG whose long edge is 2048 px. */
export async function exportComparisonJpeg(spec) {
  const size = exportCanvasSize(spec.template);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  paintComparison(ctx, { ...spec, width: size.width, height: size.height });
  return canvasToJpegFile(canvas);
}
