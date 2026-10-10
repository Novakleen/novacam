/** Convert a canvas data URL into a File. Used after annotation; never stored in localStorage. */
export function dataUrlToFile(dataUrl, name = 'annotated.jpg') {
  const parts = String(dataUrl || '').split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(parts[1] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}
