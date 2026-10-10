import exifr from 'exifr';
import {
  IMAGE_LIMITS,
  JPEG_QUALITY,
  computeLongEdgeSize,
  formatFromOutputType,
  isHeicFile,
  selectEncodeFormat,
} from '@/lib/imageSizes';

function numberOrNull(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** EXIF timestamps are camera wall-clock. Keep that clock so the capture day does not shift. */
export function exifDateToIso(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}Z`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function orientedExifSize(exif) {
  const width = numberOrNull(exif?.ExifImageWidth ?? exif?.PixelXDimension ?? exif?.ImageWidth);
  const height = numberOrNull(exif?.ExifImageHeight ?? exif?.PixelYDimension ?? exif?.ImageHeight);
  if (!width || !height) return null;
  const orientation = Number(exif?.Orientation) || 1;
  if (orientation >= 5 && orientation <= 8) {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * Read capture metadata before any resize or HEIC conversion.
 * exifr understands JPEG and HEIC.
 */
export async function readCaptureMetadata(file) {
  const empty = { captured_at: null, latitude: null, longitude: null, width: null, height: null };
  try {
    const data = await exifr.parse(file, { gps: true, reviveValues: true });
    if (!data) return empty;
    const size = orientedExifSize(data);
    return {
      captured_at: exifDateToIso(data.DateTimeOriginal || data.CreateDate || data.ModifyDate),
      latitude: numberOrNull(data.latitude),
      longitude: numberOrNull(data.longitude),
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  } catch (error) {
    console.warn('[image] EXIF read failed', error);
    return empty;
  }
}

let webpSupportPromise = null;

/** True only when a 1×1 canvas encode comes back as image/webp, not a silent PNG. */
export function detectWebPEncodeSupport() {
  if (!webpSupportPromise) {
    webpSupportPromise = (async () => {
      try {
        if (typeof OffscreenCanvas !== 'undefined') {
          const canvas = new OffscreenCanvas(1, 1);
          const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
          return blob?.type === 'image/webp';
        }
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
        return blob?.type === 'image/webp';
      } catch {
        return false;
      }
    })();
  }
  return webpSupportPromise;
}

/** Optional device location. Never throws and never blocks longer than timeoutMs. */
export function tryGeolocation(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        const latitude = numberOrNull(position?.coords?.latitude);
        const longitude = numberOrNull(position?.coords?.longitude);
        finish(latitude == null || longitude == null ? null : { latitude, longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120000 }
    );
  });
}

async function convertHeic(file) {
  const mod = await import('heic2any');
  const heic2any = mod.default || mod;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const name = String(file.name || 'photo.heic').replace(/\.hei[cf]$/i, '.jpg');
  return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
}

async function decodeOriented(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

async function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image encode failed'))), type, quality);
  });
}

async function encodeBitmap(bitmap, maxLongEdge, mime) {
  const { width, height } = computeLongEdgeSize(bitmap.width, bitmap.height, maxLongEdge);
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, mime, JPEG_QUALITY);
  return { blob, width, height };
}

function toNamedFile(blob, extension, contentType, suffix) {
  return new File([blob], `photo${suffix}.${extension}`, {
    type: contentType,
    lastModified: Date.now(),
  });
}

/**
 * One pipeline for every photo upload:
 * EXIF first, HEIC → JPEG, EXIF orientation, long-edge resize, JPEG 0.85
 * (WebP only when this browser really encodes it). Returns original, web, thumb.
 */
export async function processImageFile(file) {
  const metadata = await readCaptureMetadata(file);
  const working = isHeicFile(file) ? await convertHeic(file) : file;
  const bitmap = await decodeOriented(working);

  if (!metadata.width || !metadata.height) {
    metadata.width = bitmap.width;
    metadata.height = bitmap.height;
  }

  const webpOk = await detectWebPEncodeSupport();
  let format = selectEncodeFormat(webpOk);

  const encode = async (limit, mime) => {
    const rendered = await encodeBitmap(bitmap, limit, mime);
    const actual = formatFromOutputType(rendered.blob?.type || mime);
    return { ...rendered, actual };
  };

  let original = await encode(IMAGE_LIMITS.original, format.contentType);
  if (format.contentType === 'image/webp' && original.actual.contentType !== 'image/webp') {
    format = selectEncodeFormat(false);
    original = await encode(IMAGE_LIMITS.original, format.contentType);
  }

  const locked = formatFromOutputType(original.blob?.type || format.contentType);
  const web = await encode(IMAGE_LIMITS.web, locked.contentType);
  const thumb = await encode(IMAGE_LIMITS.thumbnail, locked.contentType);
  bitmap.close?.();

  const contentType = locked.contentType;
  const extension = locked.extension;

  return {
    original: toNamedFile(original.blob, extension, contentType, ''),
    web: toNamedFile(web.blob, extension, contentType, '_web'),
    thumbnail: toNamedFile(thumb.blob, extension, contentType, '_thumb'),
    contentType,
    extension,
    metadata,
    sizes: {
      original: { width: original.width, height: original.height },
      web: { width: web.width, height: web.height },
      thumbnail: { width: thumb.width, height: thumb.height },
    },
  };
}
