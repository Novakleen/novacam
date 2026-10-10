/**
 * Backfill thumbnail + web variants for existing image rows in project-media.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-media-sizes.mjs
 *   node scripts/backfill-media-sizes.mjs --dry-run
 *
 * Requires `sharp` and `exifr` (installed with the web workspace).
 * Orphan objects in the project-media bucket are listed only — never deleted.
 * Do not run this from CI. Apply the v1.15 media migration first.
 */

import { createClient } from '@supabase/supabase-js';
import exifr from 'exifr';
import sharp from 'sharp';
import {
  IMAGE_LIMITS,
  JPEG_QUALITY,
  computeLongEdgeSize,
  storagePathFromPublicUrl,
} from '../apps/web/src/lib/imageSizes.js';

const BUCKET = 'project-media';
const dryRun = process.argv.includes('--dry-run');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function exifDateToIso(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}Z`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function needsVariants(row) {
  if (!row?.file_url) return false;
  if (row.file_type && row.file_type !== 'image') return false;
  const thumb = row.thumbnail_url || '';
  const web = row.web_url || '';
  return !web || !thumb || thumb === row.file_url;
}

async function fetchAll(table, columns) {
  const rows = [];
  const pageSize = 500;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function listFolder(prefix) {
  const files = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    for (const entry of data || []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const isFolder = entry.id == null && (entry.metadata == null || entry.metadata === undefined);
      if (isFolder) {
        files.push(...(await listFolder(path)));
      } else if (entry.name) {
        files.push(path);
      }
    }
    if (!data || data.length < limit) break;
    offset += data.length;
  }
  return files;
}

async function renderJpeg(buffer, maxLongEdge) {
  const rotated = await sharp(buffer, { failOn: 'none', animated: false }).rotate().toBuffer({ resolveWithObject: true });
  const sized = computeLongEdgeSize(rotated.info.width, rotated.info.height, maxLongEdge);
  const out = await sharp(rotated.data)
    .resize(sized.width, sized.height, { fit: 'fill' })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100), mozjpeg: true })
    .toBuffer();
  return { buffer: out, width: rotated.info.width, height: rotated.info.height, sized };
}

async function processRow(row) {
  const sourcePath = storagePathFromPublicUrl(row.file_url);
  if (!sourcePath) {
    return { id: row.id, status: 'skipped', reason: 'unrecognized file_url' };
  }

  if (dryRun) {
    return { id: row.id, status: 'dry-run', sourcePath };
  }

  const { data: download, error: downloadError } = await supabase.storage.from(BUCKET).download(sourcePath);
  if (downloadError) throw downloadError;
  const original = Buffer.from(await download.arrayBuffer());

  let capturedAt = row.captured_at || null;
  if (!capturedAt) {
    try {
      const exif = await exifr.parse(original, { reviveValues: true });
      capturedAt = exifDateToIso(exif?.DateTimeOriginal || exif?.CreateDate || null);
    } catch {
      capturedAt = null;
    }
  }

  const oriented = await renderJpeg(original, IMAGE_LIMITS.original);
  const thumb = await sharp(original, { failOn: 'none', animated: false })
    .rotate()
    .resize({
      width: computeLongEdgeSize(oriented.width, oriented.height, IMAGE_LIMITS.thumbnail).width,
      height: computeLongEdgeSize(oriented.width, oriented.height, IMAGE_LIMITS.thumbnail).height,
      fit: 'fill',
    })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100), mozjpeg: true })
    .toBuffer();
  const webSize = computeLongEdgeSize(oriented.width, oriented.height, IMAGE_LIMITS.web);
  const web = await sharp(original, { failOn: 'none', animated: false })
    .rotate()
    .resize({ width: webSize.width, height: webSize.height, fit: 'fill' })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100), mozjpeg: true })
    .toBuffer();

  const base = sourcePath.replace(/\.[^/.]+$/, '');
  const thumbPath = `${base}_thumb.jpg`;
  const webPath = `${base}_web.jpg`;

  const upload = async (path, body) => {
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const [thumbnailUrl, webUrl] = await Promise.all([upload(thumbPath, thumb), upload(webPath, web)]);

  const patch = {
    thumbnail_url: thumbnailUrl,
    web_url: webUrl,
    width: oriented.width,
    height: oriented.height,
  };
  if (capturedAt && !row.captured_at) patch.captured_at = capturedAt;

  const { error: updateError } = await supabase.from('media').update(patch).eq('id', row.id);
  if (updateError) throw updateError;

  return { id: row.id, status: 'updated', thumbPath, webPath, width: oriented.width, height: oriented.height };
}

async function main() {
  console.log(dryRun ? 'Dry run — no uploads, no updates, no deletes.' : 'Backfill starting.');

  const media = await fetchAll('media', 'id, file_url, web_url, thumbnail_url, file_type, captured_at, width, height');
  const images = media.filter((row) => (row.file_type || 'image') === 'image');
  const todo = images.filter(needsVariants);

  const results = [];
  for (const row of todo) {
    try {
      const result = await processRow(row);
      results.push(result);
      console.log(`${result.status}\t${row.id}\t${result.sourcePath || result.thumbPath || ''}`);
    } catch (error) {
      results.push({ id: row.id, status: 'error', message: error.message });
      console.error(`error\t${row.id}\t${error.message}`);
    }
  }

  const referenced = new Set();
  for (const row of media) {
    for (const key of ['file_url', 'web_url', 'thumbnail_url']) {
      const path = storagePathFromPublicUrl(row[key]);
      if (path) referenced.add(path);
    }
  }

  let orphans = [];
  try {
    const stored = await listFolder('');
    orphans = stored.filter((path) => !referenced.has(path));
  } catch (error) {
    console.error('Could not list project-media for the orphan report:', error.message);
  }

  console.log('\nOrphan storage objects (report only, nothing deleted):');
  if (orphans.length === 0) console.log('(none)');
  for (const path of orphans) console.log(path);

  const summary = {
    dryRun,
    imageRows: images.length,
    candidates: todo.length,
    updated: results.filter((r) => r.status === 'updated').length,
    dryRunRows: results.filter((r) => r.status === 'dry-run').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    orphanCount: orphans.length,
  };
  console.log('\n' + JSON.stringify(summary, null, 2));
  if (summary.errors > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
