/**
 * Pure image-size and output-format helpers shared by the browser pipeline,
 * unit tests, and the backfill script. No DOM, no network.
 */

export const JPEG_QUALITY = 0.85;

/** Long-edge caps. Original keeps detail; web is the viewer; thumb is the grid. */
export const IMAGE_LIMITS = {
  original: 2560,
  web: 1600,
  thumbnail: 400,
};

/**
 * Fit width/height inside a square of `maxLongEdge` without upscaling.
 * The longer side becomes `maxLongEdge` when the source is larger.
 * Portrait, landscape, and square all use the same rule.
 */
export function computeLongEdgeSize(width, height, maxLongEdge) {
  const sourceW = Math.max(1, Math.round(Number(width) || 0));
  const sourceH = Math.max(1, Math.round(Number(height) || 0));
  const limit = Math.max(1, Math.round(Number(maxLongEdge) || 0));
  const longEdge = Math.max(sourceW, sourceH);

  if (longEdge <= limit) {
    return { width: sourceW, height: sourceH };
  }

  if (sourceW >= sourceH) {
    return {
      width: limit,
      height: Math.max(1, Math.round((sourceH * limit) / sourceW)),
    };
  }

  return {
    width: Math.max(1, Math.round((sourceW * limit) / sourceH)),
    height: limit,
  };
}

/**
 * Choose the encode target. WebP is used only when the caller has verified
 * that this browser actually emits image/webp (Safari's OffscreenCanvas
 * silently writes PNG). Otherwise JPEG at JPEG_QUALITY.
 */
export function selectEncodeFormat(webpSupported) {
  if (webpSupported) {
    return { contentType: 'image/webp', extension: 'webp', quality: JPEG_QUALITY };
  }
  return { contentType: 'image/jpeg', extension: 'jpg', quality: JPEG_QUALITY };
}

/**
 * Extension and contentType taken from the blob the encoder actually produced.
 * A PNG result must stay PNG (or be re-encoded) — never labeled .jpg or .webp.
 */
export function formatFromOutputType(mime) {
  const normalized = String(mime || '').split(';')[0].trim().toLowerCase();

  if (!normalized || normalized === 'application/octet-stream') {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (normalized === 'image/jpg' || normalized === 'image/jpeg') {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (normalized === 'image/webp') {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  if (normalized === 'image/png') {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (normalized === 'image/gif') {
    return { contentType: 'image/gif', extension: 'gif' };
  }
  if (normalized === 'image/heic' || normalized === 'image/heif') {
    return { contentType: normalized, extension: normalized === 'image/heif' ? 'heif' : 'heic' };
  }

  const subtype = normalized.startsWith('image/') ? normalized.slice('image/'.length) : '';
  return {
    contentType: normalized,
    extension: subtype || 'jpg',
  };
}

export function isHeicFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

export function isImageFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  return isHeicFile(file);
}

export function extensionFromUrl(url, fallback = 'jpg') {
  const path = storagePathFromPublicUrl(url) || String(url || '').split('?')[0].split('#')[0];
  const base = path.split('/').pop() || '';
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  if (ext === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
    return ext;
  }
  return fallback;
}

export function storagePathFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = '/project-media/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length).split('?')[0].split('#')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function pathsForMediaItem(item) {
  const paths = [];
  for (const key of ['file_url', 'web_url', 'thumbnail_url']) {
    const path = storagePathFromPublicUrl(item?.[key]);
    if (path) paths.push(path);
  }
  return [...new Set(paths)];
}

export function buildVariantPaths(projectId, extension) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `${projectId}/${id}`;
  const ext = extension || 'jpg';
  return {
    original: `${base}.${ext}`,
    web: `${base}_web.${ext}`,
    thumbnail: `${base}_thumb.${ext}`,
  };
}

/**
 * Grid tiles load the thumbnail, with the web size as the larger srcset
 * candidate. The original is never referenced here.
 */
export function gridImageProps(item) {
  if (item?.annotated_url) {
    return { src: item.annotated_url, srcSet: undefined };
  }
  const full = item?.file_url || '';
  const thumb = item?.thumbnail_url || full;
  const web = item?.web_url || '';
  const parts = [];
  if (thumb && thumb !== full) parts.push(`${thumb} 400w`);
  if (web && web !== thumb && web !== full) parts.push(`${web} 1600w`);

  return {
    src: thumb || web || full,
    srcSet: parts.length > 0 ? parts.join(', ') : undefined,
  };
}
