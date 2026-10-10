/** Web Share (WhatsApp and the system sheet) with a download fallback. */
export async function shareOrDownloadFile(file, { title, text } = {}) {
  const payload = {
    files: [file],
    title: title || file.name,
    text: text || title || file.name,
  };
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(payload);

  if (canShareFiles) {
    await navigator.share(payload);
    return 'shared';
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || 'novakleen.jpg';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
