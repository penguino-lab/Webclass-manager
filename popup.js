import { DEFAULTS, inSite, hostPattern } from './core.js';
import { directoryHandle } from './directory-store.js';
const $ = id => document.getElementById(id);
$('library').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') }));
let current = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings };
function renderDestination() {
  $('state').textContent = current.enabled ? '自動整理 ON' : '自動整理 OFF';
  $('folder-state').textContent = current.saveMode === 'directory' ? `選択したフォルダー：${current.folderName}` : 'ブラウザのダウンロード先を使用中';
}
renderDestination();
$('choose-folder').addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ id: 'webclass-materials', mode: 'readwrite' });
    await directoryHandle(handle);
    current = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings, saveMode: 'directory', folderName: handle.name };
    delete current.root; await chrome.storage.local.set({ settings: current });
    renderDestination(); $('folder-status').textContent = '保存先を登録しました。';
  } catch (error) { $('folder-status').textContent = error.name === 'AbortError' ? '選択を取り消しました。' : '保存先を登録できませんでした。'; }
});
$('use-browser').addEventListener('click', async () => {
  current = { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings, saveMode: 'browser', folderName: '' };
  delete current.root; await chrome.storage.local.set({ settings: current });
  renderDestination(); $('folder-status').textContent = 'ブラウザのダウンロード先に切り替えました。';
});
$('allow-site').addEventListener('click', async () => {
  try {
    const granted = await chrome.permissions.request({ origins: [hostPattern(current.site)] });
    if (!granted) { $('permission-status').textContent = 'アクセスは許可されませんでした。'; return; }
    $('allow-site').hidden = true; $('permission-status').textContent = 'このWebClassで有効になりました。ページを再読み込みしてください。';
  } catch { $('permission-status').textContent = 'WebClassを再読み込みしてください。'; }
});
function renderResult(result) {
  const messages = {
    'no-course': '講義名を認識できませんでした。', external: '別サイトの資料のため通常の保存先に任せました。',
    waiting: 'ダウンロードの開始を待っています。', saving: '資料を保存しています…', saved: '保存しました：' + (result?.path || ''),
    duplicate: '既に保存されています：' + (result?.path || ''), 'save-failed': result?.error || '保存できませんでした。',
    'no-referrer': 'ダウンロード元を確認できませんでした。', unmatched: 'ダウンロードを照合できませんでした。',
    suggested: '保存先を指定しました：' + (result?.path || '')
  };
  $('result').textContent = result ? `${new Date(result.time).toLocaleTimeString()} — ${messages[result.code] || result.code}` : 'まだ記録がありません。';
}
renderResult((await chrome.storage.session.get('lastResult')).lastResult);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.lastResult) renderResult(changes.lastResult.newValue);
  if (area === 'local' && changes.settings) { current = { ...DEFAULTS, ...changes.settings.newValue }; renderDestination(); }
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (inSite(tab.url, current.site) && !await chrome.permissions.contains({ origins: [hostPattern(current.site)] })) $('allow-site').hidden = false;
} catch { /* The popup still manages the destination outside WebClass. */ }
