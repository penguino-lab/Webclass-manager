import { inSite, destination, contentsId, courseId } from './core.js';
import { directoryHandle } from './directory-store.js';
import { saveInDirectory } from './save-file.js';
import { attachmentLink, SaveError } from './attachment-link.js';
import { canonicalResourceKey, previewType } from './resource-tools.js';
const blobs = new Map();
const previews = new Map();
const fail = message => new SaveError(message);
function rememberBlob(key, blob, lifetime = 120000) {
  const url = URL.createObjectURL(blob); blobs.set(key, url);
  setTimeout(() => { if (blobs.get(key) === url) { URL.revokeObjectURL(url); blobs.delete(key); } }, lifetime);
  return url;
}
async function responseFor(url, site) {
  if (!inSite(url, site)) throw fail('登録サイト外への保存要求です。');
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !inSite(response.url, site)) throw fail('資料を取得できませんでした。WebClassへのログインを確認してください。');
  return response;
}
function resourceName(url, fallback = '資料') {
  try {
    const value = new URL(url).searchParams.get('file_name') || decodeURIComponent(new URL(url).pathname.split('/').pop());
    return value && value.includes('.') ? value : fallback;
  } catch { return fallback; }
}
async function resolvedResource(resource, job) {
  let url = resource.url, name = resource.name || '';
  if (resource.kind === 'attachment') {
    const page = await responseFor(url, job.site);
    const link = attachmentLink(await page.text(), page.url, url, job.site, job.courseId);
    url = link.url; name = link.name || name;
  }
  return { url, name: name || resourceName(url), kind: resource.kind };
}
function candidates(html, page, job, materialName) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), resources = [], pages = [];
  const add = (value, target) => { try { const url = new URL(value, page); if (inSite(url.href, job.site)) target.push(url.href); } catch {} };
  for (const element of doc.querySelectorAll('a[href],frame[src],iframe[src]')) {
    const value = element.getAttribute('href') || element.getAttribute('src');
    if (!value) continue;
    let url; try { url = new URL(value, page); } catch { continue; }
    if (!inSite(url.href, job.site)) continue;
    const material = contentsId(url.href), course = courseId(url.href);
    if ((material && material !== job.materialId) || (course && job.courseId && course !== job.courseId)) continue;
    if (/\/file_down\.php$/.test(url.pathname) && url.searchParams.get('target_type') === 'attach') {
      resources.push({ kind: 'attachment', url: url.href, name: url.searchParams.get('file_name') || element.textContent.trim() });
    } else if (/\/loadit\.php$/.test(url.pathname) && url.searchParams.get('action') === 'pdfViewer' && url.searchParams.get('file')) {
      const file = new URL(url.searchParams.get('file'), url);
      if (inSite(file.href, job.site) && file.pathname.toLowerCase().endsWith('.pdf')) resources.push({ kind: 'pdf', url: file.href, name: `${materialName || '教材'}.pdf` });
    } else if (/\/(?:txtbk|loadit|show|frame|chapter)[^/]*\.php(?:\/|$)/i.test(url.pathname)) add(url.href, pages);
  }
  return { resources, pages };
}
async function discover(job) {
  const found = [], queued = job.materials.map(item => ({ ...item, depth: 0 })), seen = new Set();
  let failed = 0;
  while (queued.length && seen.size < 80) {
    const item = queued.shift();
    if (seen.has(item.url) || item.depth > 4) continue;
    seen.add(item.url);
    try {
      const response = await responseFor(item.url, job.site);
      const mime = response.headers.get('content-type') || '';
      if (!/text\/html/i.test(mime)) {
        found.push({ kind: item.url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'attachment', url: item.url, name: item.name || resourceName(item.url) });
        continue;
      }
      const next = candidates(await response.text(), response.url, job, item.name);
      found.push(...next.resources);
      queued.push(...next.pages.map(url => ({ url, name: item.name, depth: item.depth + 1 })));
    } catch {
      failed++;
    }
  }
  return { found, failed };
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
async function bulkPerform(job) {
  const discovery = await discover(job), discovered = [...discovery.found, ...(job.resources || [])], unique = new Set(), resources = [];
  let failed = discovery.failed, skipped = 0;
  for (const item of discovered) {
    try {
      const resource = await resolvedResource(item, job), key = canonicalResourceKey(resource.url, resource.name);
      if (!unique.has(key)) { unique.add(key); resources.push(resource); } else skipped++;
    } catch { failed++; }
  }
  let saved = 0;
  const contentHashes = new Set(), usedNames = new Set();
  const handle = job.saveMode === 'directory' ? await directoryHandle() : null;
  if (job.saveMode === 'directory' && (!handle || await handle.queryPermission({ mode: 'readwrite' }) !== 'granted')) throw fail('保存先への書き込みを許可してください。');
  for (const [index, resource] of resources.entries()) {
    await chrome.runtime.sendMessage({ type: 'bulk-progress', jobId: job.id, current: index + 1, total: resources.length });
    try {
      const response = await responseFor(resource.url, job.site), mime = response.headers.get('content-type') || '';
      if (/text\/html/i.test(mime)) throw fail('資料ではなくHTMLが返されました。');
      const blob = await response.blob();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (contentHashes.has(digest)) { skipped++; continue; }
      // Keep the attachment's original name. Different bytes with the same name
      // must both be saved, while identical bytes at different URLs are skipped.
      const originalName = resource.name;
      let suffix = 1;
      while (usedNames.has(resource.name.toLocaleLowerCase())) {
        resource.name = originalName.replace(/(\.[^.]*)?$/, (_, extension = '') => ` (${++suffix})${extension}`);
      }
      if (job.saveMode === 'directory') {
        const result = await saveInDirectory(handle, job.course, resource.name, blob.stream());
        result.existing ? skipped++ : saved++;
        if (!result.existing) { contentHashes.add(digest); usedNames.add(resource.name.toLocaleLowerCase()); }
      } else {
        const path = destination({}, job.course, resource.name);
        const existing = (await chrome.downloads.search({ state: 'complete', exists: true, limit: 100, orderBy: ['-startTime'] }))
          .some(item => String(item.filename || '').replaceAll('\\', '/').toLocaleLowerCase().endsWith('/' + path.toLocaleLowerCase()));
        if (existing) { skipped++; continue; }
        const blobUrl = rememberBlob(`${job.id}:${index}`, blob);
        await chrome.downloads.download({ url: blobUrl, filename: path, conflictAction: 'uniquify', saveAs: false }); saved++;
        contentHashes.add(digest); usedNames.add(resource.name.toLocaleLowerCase());
      }
    } catch { failed++; }
  }
  await chrome.runtime.sendMessage({ type: 'bulk-result', jobId: job.id, saved, skipped, failed, total: resources.length });
}
async function preview(job) {
  const resource = await resolvedResource(job, job);
  const response = await responseFor(resource.url, job.site), mime = response.headers.get('content-type') || '';
  if (/text\/html/i.test(mime)) throw fail('提出物ではなくHTMLが返されました。');
  const type = previewType(resource.name, mime);
  if (!type) throw fail('この形式はブラウザ内で安全に表示できません。');
  const source = await response.blob();
  const token = crypto.randomUUID(), url = URL.createObjectURL(source.slice(0, source.size, type));
  previews.set(token, url);
  while (previews.size > 100) { const [old, value] = previews.entries().next().value; URL.revokeObjectURL(value); previews.delete(old); }
  return { ok: true, token, url };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.type === 'release-blob') {
    const blob = blobs.get(message.jobId); if (blob) URL.revokeObjectURL(blob);
    blobs.delete(message.jobId); reply({ ok: true }); return;
  }
  if (message.type === 'release-preview') {
    const url = previews.get(message.token); if (url) URL.revokeObjectURL(url);
    previews.delete(message.token); reply({ ok: true }); return;
  }
  if (message.type === 'preview-job') { preview(message.job).then(reply, error => reply({ ok: false, error: error.message || '提出物を表示できませんでした。' })); return true; }
  if (message.type === 'bulk-save-job') {
    reply({ accepted: true });
    bulkPerform(message.job).catch(error => chrome.runtime.sendMessage({ type: 'bulk-result', jobId: message.job.id, saved: 0, skipped: 0, failed: 1, total: 0, error: error.message }));
    return;
  }
  if (message.type !== 'save-job') return;
  reply({ accepted: true });
  perform(message.job).catch(error => chrome.runtime.sendMessage({ type: 'save-result', jobId: message.job.id,
    code: 'save-failed', path: '', error: error instanceof SaveError ? error.message : '保存できませんでした。保存先の書き込み許可・WebClassのログイン状態を確認してください。「元の操作を使う」でも保存できます。' }));
});
