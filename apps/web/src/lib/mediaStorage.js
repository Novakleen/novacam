import { supabase } from '@/lib/customSupabaseClient';
import { pathsForMediaItem } from '@/lib/imageSizes';

const BUCKET = 'project-media';

export function getPublicMediaUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadStorageObject(path, file, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: contentType || file.type || 'application/octet-stream',
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw error;
  return getPublicMediaUrl(path);
}

/** Remove every storage object referenced by a media row (original, web, thumbnail). */
export async function deleteMediaStorageObjects(item) {
  const paths = pathsForMediaItem(item);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

export async function deleteProjectMedia(item) {
  await deleteMediaStorageObjects(item);
  const { error } = await supabase.from('media').delete().eq('id', item.id);
  if (error) throw error;
}
