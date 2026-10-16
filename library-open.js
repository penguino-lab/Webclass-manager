const mimeTypes = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  flac: 'audio/flac', aac: 'audio/aac', mp4: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', m4v: 'video/mp4',
};
const openURLs = new Map();
chrome.tabs.onRemoved.addListener(id => { const url = openURLs.get(id); if (url) { URL.revokeObjectURL(url); openURLs.delete(id); } });
export function canOpenInBrowser(entry) {
  return ['pdf', 'image', 'audio', 'video', 'text'].includes(entry.type) || /\.(csv|tsv)$/i.test(entry.name);
}
export async function openInBrowser(entry) {
  if (!canOpenInBrowser(entry)) throw Error('この形式はChromeで開けません。');
  const file = await entry.handle.getFile(), extension = entry.name.split('.').pop().toLowerCase();
  // HTML, JavaScript and SVG are opened as text; PDF goes to Chrome's own viewer.
  const mime = mimeTypes[extension] || 'text/plain';
  const url = URL.createObjectURL(file.slice(0, file.size, mime));
  try { const tab = await chrome.tabs.create({ url }); openURLs.set(tab.id, url); }
  catch (error) { URL.revokeObjectURL(url); throw error; }
}
