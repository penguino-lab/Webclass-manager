import { inSite, destination } from './core.js';
import { directoryHandle } from './directory-store.js';
import { saveInDirectory } from './save-file.js';
import { attachmentLink, SaveError } from './attachment-link.js';
const blobs = new Map();
const fail = message => new SaveError(message);
async function responseFor(url, site) {
  if (!inSite(url, site)) throw fail('登録サイト外への保存要求です。');
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'error' });
  if (!response.ok || !inSite(response.url, site)) throw fail('資料を取得できませんでした。WebClassへのログインを確認してください。');
  return response;
}
function progressBody(response, jobId) {
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) return response.body;
  let loaded = 0, lastPercent = -1, lastSent = 0;
  const report = force => {
    const percent = total ? Math.min(100, Math.floor(loaded * 100 / total)) : (force ? 100 : 0);
    const now = performance.now();
    if (!force && percent === lastPercent && now - lastSent < 150) return;
    lastPercent = percent; lastSent = now;
    chrome.runtime.sendMessage({ type: 'save-progress', jobId, loaded, total, percent }).catch(() => {});
  };
  report(false);
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { report(true); controller.close(); return; }
      loaded += value.byteLength; report(false); controller.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); }
  });
}
async function perform(job) {
  let url = job.url, name = job.name;
  const handle = job.saveMode === 'directory' ? await directoryHandle() : null;
  if (job.saveMode === 'directory' && (!handle || await handle.queryPermission({ mode: 'readwrite' }) !== 'granted')) {
    throw fail('保存先への書き込みを許可してください。設定で「保存先を選ぶ」を押してください。');
  }
  if (job.kind === 'attachment') {
    const page = await responseFor(url, job.site);
    const link = attachmentLink(await page.text(), page.url, url, job.site, job.courseId);
    url = link.url; name = name || link.name;
  }
  const response = await responseFor(url, job.site);
  const mime = response.headers.get('content-type') || '';
  if (/text\/html/i.test(mime)) throw fail('資料ではなくHTMLが返されました。WebClassにログインしてから、もう一度保存してください。');
  if (job.kind === 'pdf' && !/application\/(?:pdf|octet-stream)/i.test(mime)) throw fail('PDFの取得先を確認できませんでした。「元の操作を使う」で保存してください。');
  if (job.saveMode === 'browser') {
    const path = destination({}, job.course, name || '資料');
    if (!job.redownload) {
      const check = await chrome.runtime.sendMessage({ type: 'browser-check', jobId: job.id, path });
      if (check?.duplicate) return;
    }
    const blob = URL.createObjectURL(await new Response(progressBody(response, job.id), { headers: { 'content-type': mime } }).blob()); blobs.set(job.id, blob);
    const result = await chrome.runtime.sendMessage({ type: 'browser-save', jobId: job.id, url: blob, path });
    if (!result?.ok) { URL.revokeObjectURL(blob); blobs.delete(job.id); throw Error('ダウンロードを開始できませんでした。'); }
    return;
  }
  const saved = await saveInDirectory(handle, job.course, name || '資料', progressBody(response, job.id), { allowDuplicate: job.redownload });
  await chrome.runtime.sendMessage({ type: 'save-result', jobId: job.id, code: saved.existing ? 'duplicate' : 'saved', path: saved.path });
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.type === 'release-blob') {
    const blob = blobs.get(message.jobId); if (blob) URL.revokeObjectURL(blob);
    blobs.delete(message.jobId); reply({ ok: true }); return;
  }
  if (message.type !== 'save-job') return;
  reply({ accepted: true });
  perform(message.job).catch(error => chrome.runtime.sendMessage({ type: 'save-result', jobId: message.job.id,
    code: 'save-failed', path: '', error: error instanceof SaveError ? error.message : '保存できませんでした。保存先の書き込み許可・WebClassのログイン状態を確認してください。「元の操作を使う」でも保存できます。' }));
});
