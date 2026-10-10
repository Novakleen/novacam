import { supabase } from '@/lib/customSupabaseClient';
import { buildVariantPaths } from '@/lib/imageSizes';
import { uploadStorageObject } from '@/lib/mediaStorage';
import { processImageFile } from '@/lib/processImage';

function hasVisibleEdits(document) {
  if (!document) return false;
  if ((document.shapes || []).length > 0) return true;
  if (document.crop) return true;
  if ((document.rotation || 0) % 360 !== 0) return true;
  return false;
}

/**
 * Keep the original media file. Store the vector document and a flattened
 * JPEG produced by the same resize pipeline (original, web, thumbnail).
 * The grid and the viewer read annotated_url (the web size).
 */
export async function savePhotoAnnotations({ media, document, flattenedFile }) {
  if (!media?.id) throw new Error('missing media');

  if (!hasVisibleEdits(document)) {
    const { data, error } = await supabase
      .from('media')
      .update({
        annotations: document || null,
        annotated_url: null,
        kind: media.kind === 'annotated' ? 'photo' : media.kind || 'photo',
      })
      .eq('id', media.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const processed = await processImageFile(flattenedFile);
  const paths = buildVariantPaths(`${media.project_id}/annotated`, processed.extension || 'jpg');
  const [, annotatedUrl] = await Promise.all([
    uploadStorageObject(paths.thumbnail, processed.thumbnail, processed.contentType),
    uploadStorageObject(paths.web, processed.web, processed.contentType),
    uploadStorageObject(paths.original, processed.original, processed.contentType),
  ]);

  const { data, error } = await supabase
    .from('media')
    .update({
      annotations: document,
      annotated_url: annotatedUrl,
      kind: 'annotated',
    })
    .eq('id', media.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
