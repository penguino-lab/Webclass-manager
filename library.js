import { directoryHandle } from './directory-store.js';
import { DEFAULTS, siteURL, hostPattern } from './core.js';
import { formatSize, scanDirectory, visibleEntries, folderCoverEntries, matchingFiles, folderFileCounts, TYPE_FILTERS, normalizeTypeFilters, splitCourseName } from './library-core.js';
import { rootIdentity } from './library-store.js';
import { LibraryThumbnails } from './library-thumbnails.js';
import { openInBrowser, canOpenInBrowser } from './library-open.js';
import { mountUpdateNotice } from './update-notice.js';
const $ = id => document.getElementById(id);
const typeNames = { pdf: 'PDF', powerpoint: 'PowerPoint', word: 'Word', excel: 'Excel', csv: 'CSV', tsv: 'TSV', image: '画像', audio: '音声', video: '動画', text: 'テキスト', other: 'その他', folder: 'フォルダ' };
const icons = { pdf: 'PDF', powerpoint: 'PPT', word: 'DOC', excel: 'XLS', csv: 'CSV', tsv: 'TSV', image: 'IMG', audio: '♫', video: '▶', text: 'TXT', other: 'FILE', folder: '▱' };
const thumbnails = new LibraryThumbnails();
let root, rootId, entries = [], metadata = Object.create(null), selected, scanController, generation = 0, limit = 200, view = 'grid';
let favoritePaths;
let emphasizeCourseNames = true;
let readNestedFolders = false;
let currentSettings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
const state = { mode: 'folder', path: '', query: '', types: [], sort: 'modified' };
function status(text) { $('status').textContent = text; }
function node(tag, text, className) { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; if (className) result.className = className; return result; }
function courseName(target, name) {
  const { title, suffix } = emphasizeCourseNames ? splitCourseName(name) : { title: name, suffix: '' };
  target.replaceChildren(node('span', title, 'course-title'));
  if (suffix) target.append(node('span', suffix, 'course-suffix'));
  target.title = name;
  return target;
}
function coursePath(target, path) {
  target.replaceChildren();
  for (const [index, part] of path.split('/').entries()) {
    if (index) target.append(document.createTextNode('/'));
    target.append(courseName(node('span'), part));
  }
}
function action(id, callback) { $(id).addEventListener('click', () => Promise.resolve().then(callback).catch(() => status('操作できませんでした。アクセス許可を確認して、もう一度お試しください。'))); }
function clearSelection() { selected = null; $('detail-content').hidden = true; $('detail-empty').hidden = false; $('close-details').hidden = true; }
function updateFavorite() {
  const favorite = !!metadata[selected?.path]?.favorite;
  $('favorite').textContent = favorite ? '★ お気に入りから外す' : '☆ お気に入りに追加'; $('favorite').setAttribute('aria-pressed', String(favorite));
  for (const star of document.querySelectorAll('.entry-star')) {
    const active = !!metadata[star.closest('.entry').dataset.path]?.favorite;
    star.textContent = active ? '★' : '☆'; star.classList.toggle('active', active);
    star.setAttribute('aria-pressed', String(active));
    star.setAttribute('aria-label', `${active ? 'お気に入りから外す' : 'お気に入りに追加'}: ${star.dataset.name}`);
    star.title = active ? 'お気に入りから外す' : 'お気に入りに追加';
  }
}
function selectFile(entry) {
  if (entry.kind === 'directory') { navigate('folder', entry.path); return; }
  selected = entry; $('detail-content').hidden = false; $('detail-empty').hidden = true; $('close-details').hidden = false;
  $('detail-type').textContent = typeNames[entry.type]; $('detail-name').textContent = entry.name; coursePath($('detail-path'), entry.parent || root.name);
  $('detail-size').textContent = formatSize(entry.size); $('detail-date').textContent = entry.modified ? new Date(entry.modified).toLocaleString('ja-JP') : '—';
  $('open-folder').hidden = state.mode === 'folder';
  $('metadata-status').textContent = ''; updateFavorite(); renderEntries();
  $('open-file').disabled = !canOpenInBrowser(entry);
  status(canOpenInBrowser(entry) ? '' : 'この形式はChromeで開けません。');
}
async function openFile(entry) {
  selectFile(entry);
  if (entry.kind === 'file' && canOpenInBrowser(entry)) await openInBrowser(entry);
}
function navigate(mode, path = '') {
  leaveSettings();
  if (mode !== state.mode || path !== state.path) favoritePaths = undefined;
  state.mode = mode; state.path = path; state.query = ''; $('search').value = ''; limit = 200; clearSelection(); saveLocation(); render();
  status('');
}
function saveLocation(replace = false) {
  if (!rootId) return;
  const { types, ...locationState } = state;
  const hash = '#' + new URLSearchParams({ ...locationState, type: types.join(','), root: rootId }).toString();
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}
function restoreLocation() {
  const previousMode = state.mode, previousPath = state.path;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('root') !== rootId) { state.mode = 'folder'; state.path = ''; state.query = ''; saveLocation(true); }
  else {
    state.mode = ['folder', 'all', 'favorites'].includes(params.get('mode')) ? params.get('mode') : 'folder';
    state.path = params.get('path') || ''; state.query = params.get('query') || '';
    state.types = normalizeTypeFilters(params.get('type'));
    state.sort = ['name', 'modified', 'size'].includes(params.get('sort')) ? params.get('sort') : 'modified';
  }
  $('search').value = state.query; $('sort').value = state.sort; renderTypeFilters();
  if (state.mode !== previousMode || state.path !== previousPath) favoritePaths = undefined;
  limit = 200; clearSelection();
}
window.addEventListener('popstate', () => { restoreLocation(); render(); });
function renderTree() {
  const fragment = document.createDocumentFragment();
  for (const entry of entries.filter(entry => entry.kind === 'directory').sort((a, b) => a.path.localeCompare(b.path, 'ja', { numeric: true }))) {
    const button = node('button', undefined, 'tree-button' + (state.mode === 'folder' && state.path === entry.path ? ' active' : ''));
    button.title = entry.path; button.style.paddingLeft = `${12 + Math.min(entry.path.split('/').length - 1, 8) * 12}px`;
    button.append(node('span', '▱', 'tree-symbol'), courseName(node('span', undefined, 'tree-name'), entry.name)); button.addEventListener('click', () => navigate('folder', entry.path)); fragment.append(button);
  }
  $('tree').replaceChildren(fragment);
}
function renderHeading() {
  const settingsOpen = document.body.classList.contains('settings-open');
  for (const [id, mode] of [['home', 'folder'], ['all', 'all'], ['favorites', 'favorites']]) { $(id).classList.toggle('active', !settingsOpen && state.mode === mode); $(id).setAttribute('aria-current', !settingsOpen && state.mode === mode ? 'page' : 'false'); }
  const heading = state.mode === 'all' ? 'すべての資料' : state.mode === 'favorites' ? 'お気に入り' : state.path.split('/').pop() || '資料ライブラリ';
  courseName($('heading'), heading);
  const crumbs = document.createDocumentFragment();
  if (root && state.mode === 'folder') {
    const button = node('button', root.name || '保存先'); button.addEventListener('click', () => navigate('folder')); crumbs.append(button);
    let path = '';
    for (const part of state.path.split('/').filter(Boolean)) { path = path ? path + '/' + part : part; const target = path; const crumb = courseName(node('button'), part); crumb.addEventListener('click', () => navigate('folder', target)); crumbs.append(node('span', '›'), crumb); }
  } else if (root) crumbs.append(node('span', state.mode === 'all' ? '保存先内のすべての資料' : '保存先内のお気に入り'));
  $('breadcrumbs').replaceChildren(crumbs);
}
function renderEntries() {
  renderTypeFilters();
  thumbnails.clear(); thumbnails.rootId = rootId;
  // Keep this visit's favorites visible so an accidental removal can be undone.
  if (state.mode === 'favorites' && !favoritePaths && document.body.classList.contains('connected')) favoritePaths = new Set(entries.filter(entry => metadata[entry.path]?.favorite).map(entry => entry.path));
  const result = visibleEntries(entries, { ...state, favoritePaths }, metadata), fragment = document.createDocumentFragment();
  const files = matchingFiles(entries, state), counts = folderFileCounts(files);
  for (const entry of result.slice(0, limit)) {
    const card = node('article', undefined, 'entry' + (selected?.path === entry.path ? ' selected' : '')); card.dataset.path = entry.path;
    const open = node('button', undefined, 'entry-open'); open.title = entry.path; open.setAttribute('aria-label', `${entry.kind === 'directory' ? 'フォルダを開く' : canOpenInBrowser(entry) ? 'Chromeで開く' : '詳細を表示'}: ${entry.path}`);
    open.addEventListener('click', () => openFile(entry).catch(() => status('ファイルを開けませんでした。更新してお試しください。')));
    const art = node('span', undefined, 'entry-art ' + entry.type); art.setAttribute('aria-hidden', 'true'); art.append(node('span', icons[entry.type], 'file-icon'));
    const info = node('button', undefined, 'entry-info'); info.setAttribute('aria-label', `${entry.kind === 'directory' ? 'フォルダを開く' : 'プレビューを表示'}: ${entry.path}`);
    info.addEventListener('click', () => selectFile(entry));
    const name = node('span', entry.name, 'entry-name');
    if (entry.kind === 'directory') courseName(name, entry.name);
    info.append(name);
    if (entry.kind === 'file') info.append(node('span', `${typeNames[entry.type]} · ${formatSize(entry.size)}`, 'entry-meta entry-size'));
    else if (view === 'list') info.append(node('span', `${counts.get(entry.path) || 0}件の資料`, 'entry-meta'));
    if (entry.kind === 'file' && state.mode !== 'folder') { const parent = node('span', undefined, 'entry-meta entry-parent'); coursePath(parent, entry.parent || root?.name || '保存先'); info.append(parent); }
    if (entry.error) info.append(node('span', '読み込みできません', 'entry-meta'));
    open.append(art); card.append(open, info);
    card.addEventListener('click', event => { if (!event.target.closest('button')) selectFile(entry); });
    if (entry.kind === 'directory') {
      const covers = folderCoverEntries(files, entry.path);
      if (covers.length) {
        const mosaic = node('span', undefined, 'folder-mosaic');
        for (let i = 0; i < 4; i++) {
          const tile = node('span', undefined, 'folder-tile'); mosaic.append(tile);
          const file = covers[i];
          if (file) { tile.classList.add(file.type); tile.title = file.name; tile.append(node('span', icons[file.type], 'file-icon')); if (!file.error) thumbnails.observe(tile, file); }
        }
        art.replaceChildren(mosaic);
      }
    } else thumbnails.observe(art, entry);
    if (entry.kind === 'directory' && view === 'grid') art.append(node('span', `${counts.get(entry.path) || 0}件の資料`, 'folder-count'));
    if (entry.kind === 'file') {
      const star = node('button', '☆', 'entry-star'); star.dataset.name = entry.name;
      star.addEventListener('click', () => toggleFavorite(entry).catch(() => status('お気に入りを保存できませんでした。'))); card.append(star);
    }
    fragment.append(card);
  }
  if (result.length > limit) { const more = node('button', `さらに表示（残り ${result.length - limit} 件）`, 'quiet'); more.id = 'show-more'; more.addEventListener('click', () => { limit += 200; renderEntries(); }); fragment.append(more); }
  $('entries').replaceChildren(fragment); $('entries').className = 'entries ' + view;
  updateFavorite();
  const preview = $('detail-preview');
  preview.hidden = !selected || !['pdf', 'image'].includes(selected.type);
  preview.replaceChildren();
  if (!preview.hidden) { preview.append(node('span', icons[selected.type], 'file-icon')); thumbnails.observe(preview, selected); }
  $('count').textContent = `${result.length}個の項目`;
  $('empty').hidden = result.length > 0 || !$('permission').hidden;
  $('choose-folder').hidden = !!root;
  $('folder-start-help').hidden = !!root;
  $('empty-title').hidden = !root;
  $('empty-message').hidden = !root;
  $('empty-title').textContent = !root ? '保存先を選んで、はじめましょう' : state.query || state.types.length ? '一致する資料がありません' : state.mode === 'favorites' ? 'お気に入りを集めましょう' : 'このフォルダにはまだ資料がありません';
  $('empty-message').textContent = !root ? '設定の保存先を選択すると、既存のファイルも表示します。' : state.mode === 'favorites' && !state.query && !state.types.length ? 'カード右上の星を押すと、ここに表示されます。' : state.query || state.types.length ? '検索語や種類の絞り込みを変更してください。フォルダ内の検索はサブフォルダも対象です。' : '資料を保存してから「更新」を押してください。';
}
function render() { renderHeading(); renderTree(); renderEntries(); }
function renderCoursePreference() {
  $('settings-course-names').checked = emphasizeCourseNames;
  if (selected) coursePath($('detail-path'), selected.parent || root?.name || '保存先');
  render();
}
async function refresh() {
  const current = ++generation; scanController?.abort(); scanController = new AbortController(); const signal = scanController.signal;
  $('refresh').disabled = true; $('permission').hidden = true; status('保存先を確認しています…');
  try {
    const settings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
    const handle = settings.saveMode === 'directory' ? await directoryHandle() : null;
    if (current !== generation) return;
    root = handle;
    document.body.classList.remove('connected');
    if (!handle) { entries = []; rootId = null; metadata = Object.create(null); state.path = ''; clearSelection(); render(); status(''); return; }
    const permission = await handle.queryPermission({ mode: 'read' });
    if (current !== generation) return;
    if (permission !== 'granted') { entries = []; clearSelection(); $('permission').hidden = false; render(); status('フォルダへのアクセス許可が必要です。'); return; }
    const id = await rootIdentity(handle);
    const stored = await chrome.storage.local.get(null);
    if (current !== generation) return;
    const changedRoot = rootId !== id;
    if (changedRoot) { favoritePaths = undefined; state.path = ''; entries = []; clearSelection(); }
    rootId = id; metadata = Object.create(null);
    if (changedRoot) restoreLocation();
    const prefix = `library-file:${id}:`;
    for (const [key, value] of Object.entries(stored)) if (key.startsWith(prefix)) metadata[key.slice(prefix.length)] = value;
    document.body.classList.add('connected'); status('フォルダを読み込んでいます…');
    readNestedFolders = stored.libraryReadNestedFolders === true;
    const result = await scanDirectory(handle, { signal, recursive: readNestedFolders, onProgress: count => { if (current === generation) status(`${count} 件を確認しました…`); } });
    if (current !== generation) return;
    entries = result.entries;
    if (state.path && !entries.some(entry => entry.path === state.path && entry.kind === 'directory')) { state.path = ''; saveLocation(true); }
    if (selected) {
      const previous = selected, updated = entries.find(entry => entry.path === previous.path && entry.kind === 'file');
      if (!updated) clearSelection();
      else { selected = updated; if (previous.size !== updated.size || previous.modified !== updated.modified) selectFile(updated); }
    }
    render(); status(result.errors.length ? `${result.errors.length} 件を読み込めませんでした。「更新」で再確認できます。` : '');
  } catch (error) {
    if (current !== generation || signal.aborted) return;
    entries = []; clearSelection(); render(); document.body.classList.remove('connected');
    status(error.name === 'NotAllowedError' ? 'アクセス許可が失われました。保存先を選び直してください。' : '保存先を読み込めませんでした。移動・削除された場合は選び直してください。');
  } finally { if (current === generation) $('refresh').disabled = false; }
}
async function renderSettings() {
  currentSettings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
  $('settings-enabled').checked = currentSettings.enabled;
  $('settings-action-library').checked = currentSettings.actionOpensLibrary;
  $('settings-course-names').checked = emphasizeCourseNames;
  $('settings-recursive').checked = readNestedFolders;
  $('settings-site').value = currentSettings.site;
  $('settings-folder-state').textContent = currentSettings.saveMode === 'directory' ? `選択したフォルダー：${currentSettings.folderName}` : 'ブラウザのダウンロード先を使用中';
}
async function showSettings() {
  await renderSettings();
  document.body.classList.add('settings-open'); $('settings-page').hidden = false;
  $('sidebar-settings').classList.add('active'); $('sidebar-settings').setAttribute('aria-pressed', 'true');
  for (const id of ['home', 'all', 'favorites']) $(id).classList.remove('active');
  $('settings-site').focus();
}
function leaveSettings() {
  document.body.classList.remove('settings-open'); $('settings-page').hidden = true;
  $('sidebar-settings').classList.remove('active'); $('sidebar-settings').setAttribute('aria-pressed', 'false');
}
action('sidebar-settings', showSettings);
$('settings-recursive').addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({ libraryReadNestedFolders: $('settings-recursive').checked });
    $('settings-scan-status').textContent = '読み込む範囲を保存しました。';
  } catch {
    $('settings-recursive').checked = readNestedFolders;
    $('settings-scan-status').textContent = '読み込む範囲を保存できませんでした。もう一度お試しください。';
  }
});
$('settings-course-names').addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({ libraryEmphasizeCourseName: $('settings-course-names').checked });
    $('settings-display-status').textContent = '表示設定を保存しました。';
  } catch {
    $('settings-course-names').checked = emphasizeCourseNames;
    $('settings-display-status').textContent = '表示設定を保存できませんでした。もう一度お試しください。';
  }
});
async function chooseFolder(event) {
  const button = event.currentTarget;
  const message = button.id === 'choose-folder' ? $('folder-choice-status') : $('settings-folder-status');
  try {
    // Keep the picker directly in the click handler to preserve user activation.
    const handle = await window.showDirectoryPicker({ id: 'webclass-materials', mode: 'readwrite' });
    button.disabled = true;
    await directoryHandle(handle);
    currentSettings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings, saveMode: 'directory', folderName: handle.name };
    delete currentSettings.root; await chrome.storage.local.set({ settings: currentSettings });
    await refresh(); await renderSettings(); message.textContent = '保存先を変更しました。';
  } catch (error) { message.textContent = error.name === 'AbortError' ? '選択を取り消しました。' : '保存先を変更できませんでした。フォルダーへの書き込みを許可してください。'; }
  finally { button.disabled = false; }
}
$('choose-folder').addEventListener('click', chooseFolder);
$('settings-choose-folder').addEventListener('click', chooseFolder);
$('settings-use-browser').addEventListener('click', async () => {
  currentSettings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings, saveMode: 'browser', folderName: '' };
  delete currentSettings.root; await chrome.storage.local.set({ settings: currentSettings });
  await renderSettings(); $('settings-folder-status').textContent = 'ブラウザのダウンロード先に切り替えました。';
});
$('library-settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const site = siteURL($('settings-site').value.trim());
    const granted = await chrome.permissions.request({ origins: [hostPattern(site)] });
    currentSettings = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings, enabled: $('settings-enabled').checked, site, actionOpensLibrary: $('settings-action-library').checked };
    delete currentSettings.root; await chrome.storage.local.set({ settings: currentSettings });
    const permissions = await chrome.permissions.getAll();
    const obsolete = (permissions.origins || []).filter(origin => origin !== hostPattern(site));
    if (obsolete.length) await chrome.permissions.remove({ origins: obsolete });
    $('settings-status').textContent = granted ? '設定を保存しました。' : '設定を保存しました。対象サイトへのアクセスは拡張のタブから許可してください。';
  } catch (error) { $('settings-status').textContent = '保存できませんでした：' + error.message; }
});
$('grant').addEventListener('click', async () => {
  try { if (root && await root.requestPermission({ mode: 'read' }) === 'granted') await refresh(); else status('アクセスは許可されませんでした。'); }
  catch { status('アクセスを許可できませんでした。保存先を選び直してください。'); }
});
action('refresh', refresh); action('home', () => navigate('folder')); action('all', () => navigate('all')); action('favorites', () => navigate('favorites')); action('close-details', () => { clearSelection(); renderEntries(); });
for (const id of ['grid', 'list']) action(id, async () => { view = id; $('grid').setAttribute('aria-pressed', String(id === 'grid')); $('list').setAttribute('aria-pressed', String(id === 'list')); renderEntries(); await chrome.storage.local.set({ libraryView: view }); });
$('search').addEventListener('input', () => { state.query = $('search').value; limit = 200; saveLocation(true); renderEntries(); });
function renderTypeFilters() {
  for (const button of $('type-filters').querySelectorAll('[data-type]')) button.setAttribute('aria-pressed', String(state.types.includes(button.dataset.type)));
  $('clear-types').disabled = !state.types.length;
  $('filter-summary').textContent = state.types.length ? `${state.types.length}種類を選択中` : 'すべての種類';
}
function setTypes(types) { state.types = normalizeTypeFilters(types); limit = 200; saveLocation(true); renderEntries(); }
for (const type of TYPE_FILTERS) {
  const button = node('button', undefined, 'type-chip'); button.type = 'button'; button.dataset.type = type;
  button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', typeNames[type]);
  const mark = node('span', '＋', 'chip-mark'); mark.setAttribute('aria-hidden', 'true');
  button.append(node('span', typeNames[type]), mark);
  button.addEventListener('click', () => setTypes(state.types.includes(type) ? state.types.filter(item => item !== type) : [...state.types, type]));
  $('type-filters').append(button);
}
action('clear-types', () => setTypes([]));
$('sort').addEventListener('change', () => { state.sort = $('sort').value; limit = 200; saveLocation(true); renderEntries(); });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); } });
async function toggleFavorite(entry) {
  if (!entry || !rootId) return;
  const id = rootId, path = entry.path, key = `library-file:${id}:${path}`;
  // Keep favorite updates consistent between library tabs.
  await navigator.locks.request(key, async () => {
    const stored = (await chrome.storage.local.get(key))[key] || {};
    const value = { ...stored, favorite: !stored.favorite }; await chrome.storage.local.set({ [key]: value });
    if (id === rootId) metadata[path] = value;
  });
  if (id === rootId) { updateFavorite(); if (selected?.path === path) $('metadata-status').textContent = '保存しました。'; }
}
action('favorite', () => toggleFavorite(selected));
action('open-file', () => selected && openInBrowser(selected));
action('open-folder', () => selected && navigate('folder', selected.parent));
let updateTimer;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.libraryReadNestedFolders) {
    readNestedFolders = changes.libraryReadNestedFolders.newValue === true;
    $('settings-recursive').checked = readNestedFolders;
    refresh();
  }
  if (area === 'local' && changes.libraryEmphasizeCourseName) { emphasizeCourseNames = changes.libraryEmphasizeCourseName.newValue !== false; renderCoursePreference(); }
  if (area === 'local' && changes.settings || area === 'session' && changes.lastResult?.newValue?.code === 'saved') { clearTimeout(updateTimer); updateTimer = setTimeout(refresh, 300); }
  if (area === 'local' && rootId) {
    const prefix = `library-file:${rootId}:`;
    for (const [key, change] of Object.entries(changes)) if (key.startsWith(prefix)) { metadata[key.slice(prefix.length)] = change.newValue || {}; updateFavorite(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
window.addEventListener('pagehide', () => { scanController?.abort(); thumbnails.clear(); });
const preferences = await chrome.storage.local.get(['libraryView', 'libraryEmphasizeCourseName', 'libraryReadNestedFolders']); view = preferences.libraryView === 'list' ? 'list' : 'grid';
emphasizeCourseNames = preferences.libraryEmphasizeCourseName !== false;
readNestedFolders = preferences.libraryReadNestedFolders === true;
mountUpdateNotice(chrome);
$('grid').setAttribute('aria-pressed', String(view === 'grid')); $('list').setAttribute('aria-pressed', String(view === 'list'));
await refresh();
const revealPath = new URL(location.href).searchParams.get('reveal');
if (revealPath) {
  const existing = entries.find(entry => entry.kind === 'file' && entry.path === revealPath);
  if (existing) { navigate('folder', existing.parent); selectFile(existing); status('既に保存されている資料を表示しています。'); }
  else status(root ? '既存の資料を確認できませんでした。「更新」で再確認してください。' : '保存先を選択すると既存の資料を確認できます。');
  const url = new URL(location.href); url.searchParams.delete('reveal'); history.replaceState(null, '', url);
}
