const types = {
  pdf: ['pdf'], powerpoint: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'pot', 'potx', 'potm'],
  word: ['doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'rtf'],
  excel: ['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'xltm'], csv: ['csv'], tsv: ['tsv'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'], video: ['mp4', 'webm', 'mov', 'm4v'],
  text: ['txt', 'md', 'json', 'html', 'css', 'js', 'xml', 'log'],
};
export const MAX_PDF_THUMBNAIL_SIZE = 100 * 1024 * 1024;
// Recognize only the final, balanced opening-information group. Earlier groups
// such as (2a), (1), or (Business Acceleration Program) belong to the title.
export function splitCourseName(name) {
  const unchanged = { title: name, suffix: '' };
  const code = name.match(/_(?:[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*|\[[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*\]|［[A-Za-z][A-Za-z0-9]*\d[A-Za-z0-9]*］)\s*$/u);
  const end = (code ? name.slice(0, code.index) : name).trimEnd();
  if (!/[)）]$/u.test(end)) return unchanged;
  const stack = [], pairs = { ')': '(', '）': '（' };
  let start = -1;
  for (let i = end.length - 1; i >= 0; i--) {
    const char = end[i];
    if (pairs[char]) stack.push(pairs[char]);
    else if (char === '(' || char === '（') {
      if (stack.pop() !== char) return unchanged;
      if (!stack.length) { start = i; break; }
    }
  }
  if (start < 0) return unchanged;
  const info = end.slice(start + 1, -1).normalize('NFKC');
  const term = info.match(/(?:19|20|21)\d{2}\s*年(?:度)?\s*(?:前期|後期|通年|春学期|夏学期|秋学期|冬学期|春期|夏期|秋期|冬期|集中)(?:前半|後半)?\s*$/u);
  if (!term) return unchanged;
  const beforeTerm = info.slice(0, term.index).trimEnd();
  // Without a code, require an instructor/schedule field as additional evidence.
  if (beforeTerm ? !/[,、]$/u.test(beforeTerm) : !code) return unchanged;
  const title = name.slice(0, start).trimEnd();
  return title ? { title, suffix: name.slice(title.length) } : unchanged;
}
export function fileType(name) {
  const extension = name.split('.').pop().toLowerCase();
  return Object.keys(types).find(type => types[type].includes(extension)) || 'other';
}
export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
export const TYPE_FILTERS = ['pdf', 'powerpoint', 'word', 'excel', 'other'];
export function normalizeTypeFilters(value) {
  return [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).filter(type => TYPE_FILTERS.includes(type)))];
}
function matchesType(entry, type) {
  const selected = Array.isArray(type) ? type : type ? [type] : [];
  return !selected.length || selected.some(type => type === 'other' ? !['pdf', 'powerpoint', 'word', 'excel'].includes(entry.type) : entry.type === type);
}
function queryMatcher(query = '') {
  const terms = query.trim().normalize('NFKC').toLocaleLowerCase('ja').split(/\s+/).filter(Boolean);
  return entry => { const haystack = entry.path.normalize('NFKC').toLocaleLowerCase('ja'); return terms.every(term => haystack.includes(term)); };
}
export function matchingFiles(entries, { types, type = '', query = '' } = {}) {
  const matchesQuery = queryMatcher(query);
  return entries.filter(entry => entry.kind === 'file' && matchesType(entry, types ?? type) && matchesQuery(entry));
}
export function folderFileCounts(files) {
  const counts = new Map();
  for (const file of files) if (file.kind === 'file') ancestors(file.parent, path => counts.set(path, (counts.get(path) || 0) + 1));
  return counts;
}
function ancestors(parent, visit) { for (; parent; parent = parent.slice(0, Math.max(0, parent.lastIndexOf('/')))) visit(parent); }
export function summarizeDirectories(entries) {
  const folders = new Map(entries.filter(entry => entry.kind === 'directory').map(entry => { entry.modified = 0; entry.size = 0; return [entry.path, entry]; }));
  for (const entry of entries) if (entry.kind === 'file') ancestors(entry.parent, path => {
    const folder = folders.get(path); if (!folder) return;
    folder.modified = Math.max(folder.modified, entry.modified || 0); folder.size += entry.size || 0;
  });
  return entries;
}
export function visibleEntries(entries, { mode = 'folder', path = '', query = '', types, type = '', sort = 'modified', favoritePaths }, metadata = {}) {
  const selectedTypes = types ?? type;
  const filtered = Array.isArray(selectedTypes) ? selectedTypes.length > 0 : !!selectedTypes;
  const terms = query.trim().normalize('NFKC').toLocaleLowerCase('ja').split(/\s+/).filter(Boolean);
  const matchesQuery = queryMatcher(query);
  const matchingFolders = new Set();
  if (filtered && mode === 'folder') for (const entry of matchingFiles(entries, { types: selectedTypes, query })) ancestors(entry.parent, path => matchingFolders.add(path));
  const result = entries.filter(entry => {
    const info = metadata[entry.path] || {};
    if (mode === 'favorites' && (entry.kind !== 'file' || !(favoritePaths ? favoritePaths.has(entry.path) : info.favorite))) return false;
    if (mode === 'all' && entry.kind !== 'file') return false;
    if (mode === 'folder') {
      if (terms.length ? path && !entry.path.startsWith(path + '/') : entry.parent !== path) return false;
    }
    if (filtered && entry.kind === 'directory') return matchingFolders.has(entry.path);
    return matchesType(entry, selectedTypes) && matchesQuery(entry);
  });
  return result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    if (sort === 'modified') return (b.modified || 0) - (a.modified || 0) || a.path.localeCompare(b.path, 'ja', { numeric: true });
    if (sort === 'size') return (b.size || 0) - (a.size || 0) || a.path.localeCompare(b.path, 'ja', { numeric: true });
    return a.name.localeCompare(b.name, 'ja', { numeric: true }) || a.path.localeCompare(b.path, 'ja');
  });
}
export function folderCoverEntries(entries, path) {
  const files = entries.filter(entry => entry.kind === 'file' && entry.path.startsWith(path + '/'))
    .sort((a, b) => (a.parent === path ? 0 : 1) - (b.parent === path ? 0 : 1) || a.path.localeCompare(b.path, 'ja', { numeric: true }));
  const pdfs = files.filter(entry => entry.type === 'pdf' && !entry.error && entry.size <= MAX_PDF_THUMBNAIL_SIZE);
  const preferred = new Set(pdfs);
  return [...pdfs, ...files.filter(entry => !preferred.has(entry))].slice(0, 4);
}
export async function scanDirectory(root, { signal, recursive = false, onProgress = () => {} } = {}) {
  const entries = [], errors = [], queue = [{ handle: root, path: '', depth: 0 }];
  while (queue.length) {
    signal?.throwIfAborted();
    const current = queue.shift();
    try {
      let batch = [];
      const collect = async () => {
        await Promise.all(batch.map(async entry => {
          signal?.throwIfAborted();
          if (entry.kind === 'file') {
            try { const file = await entry.handle.getFile(); entry.size = file.size; entry.modified = file.lastModified; }
            catch (error) { entry.error = error.name; errors.push(entry.path); }
          }
        }));
        batch = [];
      };
      for await (const [name, handle] of current.handle.entries()) {
        signal?.throwIfAborted();
        // Default: selected root plus the files directly inside each course.
        // Do not even enumerate/read deeper directories without opting in.
        if (handle.kind === 'directory' && current.depth >= 1 && !recursive) continue;
        const path = current.path ? `${current.path}/${name}` : name;
        const entry = { name, path, parent: current.path, kind: handle.kind, handle, type: handle.kind === 'file' ? fileType(name) : 'folder' };
        entries.push(entry); batch.push(entry);
        if (handle.kind === 'directory') queue.push({ handle, path, depth: current.depth + 1 });
        if (batch.length === 24) { await collect(); onProgress(entries.length); await new Promise(resolve => setTimeout(resolve, 0)); }
      }
      await collect(); onProgress(entries.length);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!current.path) throw error;
      errors.push(current.path);
    }
  }
  return { entries: summarizeDirectories(entries), errors };
}
