import { normalizeCrop } from '@/lib/annotationCommands';

function traceFreehand(ctx, points) {
  if (!points || points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawArrowHead(ctx, x1, y1, x2, y2) {
  const head = Math.max(14, ctx.lineWidth * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function drawShape(ctx, shape) {
  if (!shape) return;
  ctx.save();
  ctx.strokeStyle = shape.color || '#facc15';
  ctx.fillStyle = shape.color || '#facc15';
  ctx.lineWidth = shape.strokeWidth || 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.type === 'freehand') {
    traceFreehand(ctx, shape.points);
  } else if (shape.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
  } else if (shape.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    drawArrowHead(ctx, shape.x1, shape.y1, shape.x2, shape.y2);
  } else if (shape.type === 'rectangle') {
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
  } else if (shape.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(shape.x + shape.w / 2, shape.y + shape.h / 2, Math.abs(shape.w) / 2, Math.abs(shape.h) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape.type === 'text') {
    const size = shape.fontSize || 32;
    ctx.font = `700 ${size}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(shape.text || '', shape.x, shape.y);
  }
  ctx.restore();
}

function drawBase(ctx, image, doc) {
  const rotation = ((doc.rotation || 0) % 360 + 360) % 360;
  const swaps = rotation === 90 || rotation === 270;
  ctx.save();
  ctx.translate(doc.width / 2, doc.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const dw = swaps ? doc.height : doc.width;
  const dh = swaps ? doc.width : doc.height;
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/** Draw the photo and vectors. Crop is applied by translating into the crop window. */
export function paintAnnotations(ctx, image, doc) {
  const crop = normalizeCrop(doc.crop);
  const viewW = Math.max(1, Math.round(doc.width * crop.w));
  const viewH = Math.max(1, Math.round(doc.height * crop.h));
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-crop.x * doc.width, -crop.y * doc.height);
  if (image) drawBase(ctx, image, doc);
  (doc.shapes || []).forEach((shape) => drawShape(ctx, shape));
  ctx.restore();
  return { width: viewW, height: viewH };
}

export async function flattenAnnotations(image, doc) {
  const crop = normalizeCrop(doc.crop);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(doc.width * crop.w));
  canvas.height = Math.max(1, Math.round(doc.height * crop.h));
  const ctx = canvas.getContext('2d');
  paintAnnotations(ctx, image, doc);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) reject(new Error('jpeg encode failed'));
      else resolve(result);
    }, 'image/jpeg', 0.92);
  });
  const file = new File([blob], 'annotated.jpg', { type: 'image/jpeg' });
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { file, dataUrl, canvas };
}
