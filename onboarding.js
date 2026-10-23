import { hostPattern } from './core.js';
const $ = id => document.getElementById(id);
const tabId = Number(new URL(location.href).searchParams.get('tab'));
let site = '', ready = false;
function status(text, error = false) { $('status').textContent = text; $('status').toggleAttribute('data-error', error); }
async function initialize() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'site-access-info', tabId });
    if (!result?.ok) throw Error(result?.error || 'WebClassのタブを確認できませんでした。');
    site = result.site; $('site').textContent = site; $('allow').disabled = false;
  } catch (error) { status(error.message, true); }
}
$('allow').addEventListener('click', async () => {
  if (ready) { window.close(); return; }
  try {
    // Call directly from the click, before any await, to keep the user gesture.
    const permission = chrome.permissions.request({ origins: [hostPattern(site)] });
    $('allow').disabled = true;
    if (!await permission) { status('許可されませんでした。もう一度試すか、「あとで」を選んでください。', true); return; }
    const result = await chrome.runtime.sendMessage({ type: 'site-access-activate', tabId });
    if (!result?.ok) throw Error(result?.error || '設定を登録できませんでした。');
    status('有効になりました。WebClassのタブに画面の改善を反映しました。');
    ready = true; $('allow').textContent = '閉じてWebClassを使う'; $('later').hidden = true;
  } catch (error) { status(error.message, true); }
  finally { $('allow').disabled = !site; }
});
$('later').addEventListener('click', () => window.close());
initialize();
