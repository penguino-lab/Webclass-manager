const safeText = new Set(['txt', 'text', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'html', 'htm', 'js', 'css', 'svg']);
const safeImages = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp']);

export function resourceExtension(name = '') {
  return String(name).split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase() || '';
}

export function canonicalResourceKey(value, name = '') {
  try {
    const url = new URL(value);
    // Query parameters and path case can select different files. Content hashes
    // below the fetch layer, rather than a guessed path, decide duplication.
    url.hash = '';
    return url.href;
  } catch {
    return String(value || name).trim().toLocaleLowerCase();
  }
}

export function previewType(name, mime = '') {
  const extension = resourceExtension(name);
  if (extension === 'pdf' || /^application\/pdf(?:;|$)/i.test(mime)) return 'application/pdf';
  if (safeImages.has(extension) || /^image\/(?:png|jpeg|gif|webp|avif|bmp)(?:;|$)/i.test(mime)) {
    return /^image\//i.test(mime) ? mime.split(';', 1)[0] : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  }
  if (safeText.has(extension) || /^text\//i.test(mime) || /^(?:application\/(?:json|xml))(?:;|$)/i.test(mime)) return 'text/plain;charset=utf-8';
  return '';
}
