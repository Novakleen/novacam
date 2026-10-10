import { supabase } from '@/lib/customSupabaseClient';
import { buildVariantPaths } from '@/lib/imageSizes';
import { getPublicMediaUrl, uploadStorageObject } from '@/lib/mediaStorage';
import { processImageFile, tryGeolocation } from '@/lib/processImage';

export function parseTagNames(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((name) => String(name || '').trim()).filter(Boolean))];
  }
  return [...new Set(String(value || '').split(/[,;]+/).map((name) => name.trim()).filter(Boolean))];
}

export function buildImageMediaInsert({
  projectId,
  userId,
  urls,
  processed,
  description = '',
  latitude = null,
  longitude = null,
  capturedAt = null,
  showInPortfolio = false,
  kind = 'photo',
}) {
  return {
    project_id: projectId,
    uploaded_by: userId,
    file_url: urls.file_url,
    web_url: urls.web_url,
    thumbnail_url: urls.thumbnail_url,
    file_type: 'image',
    description: description || null,
    show_in_portfolio: Boolean(showInPortfolio),
    captured_at: processed?.metadata?.captured_at || capturedAt || null,
    latitude,
    longitude,
    width: processed?.metadata?.width || null,
    height: processed?.metadata?.height || null,
    size: processed?.original?.size || null,
    kind: kind || 'photo',
  };
}

export async function attachTagNames(mediaId, tagNames) {
  const names = parseTagNames(tagNames);
  if (!mediaId || names.length === 0) return;

  const { data: existing, error: readError } = await supabase.from('tags').select('id, name');
  if (readError) throw readError;

  const byName = new Map((existing || []).map((tag) => [String(tag.name || '').toLowerCase(), tag.id]));
  const ids = [];

  for (const name of names) {
    const known = byName.get(name.toLowerCase());
    if (known) {
      ids.push(known);
      continue;
    }
    const { data: created, error: insertError } = await supabase
      .from('tags')
      .insert({ name })
      .select('id')
      .single();
    if (insertError) throw insertError;
    ids.push(created.id);
    byName.set(name.toLowerCase(), created.id);
  }

  const { error } = await supabase.from('media_tags').insert(ids.map((tagId) => ({ media_id: mediaId, tag_id: tagId })));
  if (error) throw error;
}

/**
 * Shared photo upload: three sizes in project-media, one media row.
 * requestGeolocation is for camera captures that have no EXIF GPS.
 * The lookup is raced with a timeout inside tryGeolocation and does not reject.
 */
export async function uploadProjectImage(file, options) {
  const {
    projectId,
    userId,
    description = '',
    tagNames = [],
    requestGeolocation = false,
    capturedAt = null,
    latitude: latitudeHint = null,
    longitude: longitudeHint = null,
    showInPortfolio = false,
    kind = 'photo',
  } = options || {};

  const processed = await processImageFile(file);
  const paths = buildVariantPaths(projectId, processed.extension);
  const needsGeo =
    requestGeolocation && processed.metadata.latitude == null && latitudeHint == null;
  const geoPromise = needsGeo ? tryGeolocation(4000) : Promise.resolve(null);

  const [thumbnailUrl, webUrl, fileUrl, geo] = await Promise.all([
    uploadStorageObject(paths.thumbnail, processed.thumbnail, processed.contentType),
    uploadStorageObject(paths.web, processed.web, processed.contentType),
    uploadStorageObject(paths.original, processed.original, processed.contentType),
    geoPromise,
  ]);

  const latitude = processed.metadata.latitude ?? latitudeHint ?? geo?.latitude ?? null;
  const longitude = processed.metadata.longitude ?? longitudeHint ?? geo?.longitude ?? null;
  const urls = { file_url: fileUrl, web_url: webUrl, thumbnail_url: thumbnailUrl };

  const { data, error } = await supabase
    .from('media')
    .insert(
      buildImageMediaInsert({
        projectId,
        userId,
        urls,
        processed,
        description,
        latitude,
        longitude,
        capturedAt,
        showInPortfolio,
        kind,
      })
    )
    .select()
    .single();

  if (error) {
    await supabase.storage.from('project-media').remove([paths.original, paths.web, paths.thumbnail]).catch(() => {});
    throw error;
  }

  if (data?.id) {
    await attachTagNames(data.id, tagNames);
  }

  return data;
}

export { getPublicMediaUrl };
