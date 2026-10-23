import { DEFAULTS, TTL, inSite, digest, chooseIntent, destination, filename, courseId, contentsId, usableName, hostPattern } from './core.js';
import { previewType } from './resource-tools.js';
import { createSiteOnboarding } from './site-onboarding.js';
import { createUpdateChecker } from './update-notice.js';
let queue = Promise.resolve(), creating;
const previewTabs = new Map();
const webClassLogin = 'https://webclass.tcu.ac.jp/webclass/singlesignon.php?auth_mode=SAML';
const libraryMenuId = 'webclass-open-library';
const onboarding = createSiteOnboarding(chrome, { settings, activate: activateSite });
const releaseChecker = createUpdateChecker({ storage: chrome.storage.local });
const checkRelease = () => { releaseChecker.check().catch(() => {}); };
async function checkReleaseForTab(tab) {
  const s = await settings();
  if (inSite(tab.url, s.site)) checkRelease();
}
chrome.action.onClicked.addListener(async tab => {
  checkRelease();
  try {
    const s = await settings();
    if (s.actionOpensLibrary) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
      return;
    }
    if (tab && await onboarding.requestForTab(tab, { force: true })) return;
    await chrome.tabs.create({ url: s.site === DEFAULTS.site ? webClassLogin : s.site });
  } catch (error) { console.error(error); }
});
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === libraryMenuId) { checkRelease(); chrome.tabs.create({url:chrome.runtime.getURL('library.html')}).catch(console.error); }
});
async function syncActionMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:libraryMenuId,title:'ライブラリを開く',contexts:['action']});
  await syncActionTitle();
}
async function syncActionTitle() {
  await chrome.action.setTitle({ title: (await settings()).actionOpensLibrary ? 'ライブラリを開く' : 'WebClassを開く' });
}
function serial(fn) { const job = queue.then(fn); queue = job.catch(() => {}); return job; }
async function settings() { return { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings }; }
async function status(code, path = '', error = '') {
  await chrome.storage.session.set({ lastResult: { code, path, error, time: Date.now() } });
}
export function matchesDownloadPath(fullPath, relativePath) {
  const full = String(fullPath || '').replaceAll('\\', '/').toLocaleLowerCase();
  const relative = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '').toLocaleLowerCase();
  return Boolean(relative && (full === relative || full.endsWith('/' + relative)));
}
async function existingDownload(path) {
  const items = await chrome.downloads.search({ state: 'complete', exists: true, limit: 100, orderBy: ['-startTime'] });
  return items.find(item => matchesDownloadPath(item.filename, path));
}
async function applyTypography(tabId) {
  try {
    // USER origin also overrides legacy inline !important fonts in old windows.
    await chrome.scripting.removeCSS({target:{tabId,allFrames:true},files:['typography.css'],origin:'USER'});
    await chrome.scripting.insertCSS({target:{tabId,allFrames:true},files:['typography.css'],origin:'USER'});
  } catch { /* The tab may close or navigate while its styles are being applied. */ }
}
async function refreshTypography(tab) {
  const s = await settings();
  if (!s.site || !tab.url || new URL(tab.url).origin !== new URL(s.site).origin) return;
  if (await chrome.permissions.contains({origins:[hostPattern(s.site)]})) await applyTypography(tab.id);
}
async function inject(tabId) {
  try {
    await applyTypography(tabId);
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['page-ui.css', 'course-ui.css'] });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['release-version.js', 'page-themes.js', 'banner-crop.js', 'page-ui.js', 'webclass-adapter.js', 'material-ui.js', 'course-ui.js', 'content.js'] });
  } catch {}
}
async function syncScripts() {
  const s = await settings();
  await chrome.scripting.unregisterContentScripts();
  if (!s.site) return;
  const pattern = hostPattern(s.site);
  if (await chrome.permissions.contains({ origins: [pattern] })) {
    const site = new URL(s.site);
    const pagePattern = site.origin + site.pathname.replace(/\/?$/, '/') + '*';
    const coursePattern = site.origin + site.pathname.replace(/\/?$/, '/') + 'course.php/*';
    await chrome.scripting.registerContentScripts([
      { id: 'webclass-typography', matches: [pattern], css: ['typography.css'], runAt: 'document_start', allFrames: true, matchOriginAsFallback:true },
      { id: 'webclass-page-ui', matches: [pagePattern], css: ['page-ui.css'], js: ['release-version.js','page-themes.js','banner-crop.js','page-ui.js'], runAt: 'document_start', allFrames: true },
      { id: 'webclass-course-ui', matches: [coursePattern], css: ['course-ui.css'], js: ['course-ui.js'], runAt: 'document_start', allFrames: true },
      { id: 'webclass', matches: [pattern], js: ['webclass-adapter.js', 'material-ui.js', 'content.js'], runAt: 'document_idle', allFrames: true }
    ]);
    // Registered styles only affect future documents. Refresh already-open
    // pages/popups too, including legacy URLs outside the course page path.
    for (const tab of await chrome.tabs.query({url:pattern})) await applyTypography(tab.id);
  }
}
export async function requestForTab(tab) {
  return onboarding.requestForTab(tab);
}
async function activateSite(site) {
  const s = await settings();
  if (s.site !== site) await chrome.storage.local.set({ settings: { ...s, site } });
  await syncScripts();
  for (const tab of await chrome.tabs.query({})) if (inSite(tab.url, site)) await inject(tab.id);
}
chrome.runtime.onInstalled.addListener(() => serial(async () => {
  const initial = await settings(); delete initial.root;
  await chrome.storage.local.set({ settings: initial });
  await syncActionMenu();
  await syncScripts();
  for (const tab of await chrome.tabs.query({})) await requestForTab(tab);
}).catch(console.error));
chrome.runtime.onStartup.addListener(() => serial(async () => {
  await syncActionMenu(); await syncScripts();
  for (const tab of await chrome.tabs.query({})) await requestForTab(tab);
}).catch(console.error));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'complete') checkReleaseForTab(tab).catch(() => {});
  if (change.url || change.title || change.status === 'complete') requestForTab(tab).catch(console.error);
  if (change.status === 'complete') refreshTypography(tab).catch(console.error);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { const tab = await chrome.tabs.get(tabId); checkReleaseForTab(tab).catch(() => {}); await requestForTab(tab); }
  catch (error) { console.error(error); }
});
chrome.permissions.onAdded.addListener(permissions => serial(async () => {
  await onboarding.permissionAdded(permissions);
  await syncScripts();
  const s = await settings();
  for (const tab of await chrome.tabs.query({})) if (inSite(tab.url, s.site)) await inject(tab.id);
}).catch(console.error));
chrome.permissions.onRemoved.addListener(() => serial(async () => { await chrome.storage.session.remove(['intents', 'courses', 'materials']); await syncScripts(); }).catch(console.error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) syncActionTitle().catch(console.error);
  if (area === 'local' && changes.settings && ['site', 'enabled'].some(key =>
    (changes.settings.oldValue?.[key] ?? DEFAULTS[key]) !== (changes.settings.newValue?.[key] ?? DEFAULTS[key]))) serial(async () => {
    await chrome.storage.session.remove(['intents', 'courses', 'materials']); await syncScripts();
    const s = await settings();
    for (const tab of await chrome.tabs.query({})) {
      await requestForTab(tab);
      if (inSite(tab.url, s.site) && await chrome.permissions.contains({ origins: [hostPattern(s.site)] })) await inject(tab.id);
    }
  }).catch(console.error);
});
export async function resolveCourse(context, sender) {
  const origin = new URL(sender.url).origin;
  const own = courseId(sender.url);
  let id = context.courseId || context.course?.id || own;
  if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
  if (own && id && own !== id) return null;
  const content = contentsId(sender.url) || context.contentsId;
  const { courses = {}, materials = {} } = await chrome.storage.session.get(['courses', 'materials']);
  const { courseOverrides = {} } = await chrome.storage.local.get('courseOverrides');
  id ||= materials[origin + '|' + content] || '';
  let course = context.course;
  if (course && !usableName(course.name)) course = null;
  if (id && course) {
    course = { name: course.name.trim(), id, source: course.source || '講義ページ' };
    // Manual names live in local overrides; keep the original detection for clearing them.
    if (!course.source.startsWith('この')) courses[origin + '|' + id] = course;
    if (content) {
      const key = origin + '|' + content;
      materials[key] = materials[key] === undefined || materials[key] === id ? id : '';
    }
    await chrome.storage.session.set({ courses: Object.fromEntries(Object.entries(courses).slice(-200)), materials: Object.fromEntries(Object.entries(materials).slice(-500)) });
  }
  if (id && usableName(courseOverrides[origin + '|' + id])) return { id, name: courseOverrides[origin + '|' + id], source: 'この講義で指定した講義名' };
  if (id && !course) course = courses[origin + '|' + id] ? { ...courses[origin + '|' + id], source: 'コースIDから取得' } : null;
  return course || null;
}
async function offscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('offscreen.html')] });
  if (contexts.length) return;
  if (!creating) creating = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER', 'BLOBS'], justification: '添付資料の中間HTMLから正規リンクを抽出し、資料を選択したフォルダーへ保存します。' }).finally(() => { creating = null; });
  await creating;
}
async function startSave(message, sender, s) {
  if (!inSite(message.url, s.site) || !['attachment', 'pdf'].includes(message.kind)) return { ok: false, error: '保存対象を確認できませんでした。' };
  const u = new URL(message.url);
  if (message.kind === 'attachment' && (!/\/file_down\.php$/.test(u.pathname) || u.searchParams.get('target_type') !== 'attach')) return { ok: false };
  if (message.kind === 'pdf') {
    const page = new URL(sender.url), file = page.searchParams.get('file');
    if (!/\/loadit\.php$/.test(page.pathname) || page.searchParams.get('action') !== 'pdfViewer' || !file || new URL(file, page).href !== u.href) return { ok: false, error: '表示中のPDFと保存対象を照合できませんでした。元の保存操作を利用してください。' };
  }
  const course = await resolveCourse(message.context || {}, sender);
  if (!course) { await status('no-course'); return { ok: false, error: '講義名を認識できませんでした。講義の教材ページを再読み込みしてから、もう一度お試しください。' }; }
  const targetCourse = courseId(message.url), targetContent = contentsId(message.url);
  if ((targetCourse && course.id && targetCourse !== course.id) || (targetContent && message.context?.contentsId && targetContent !== message.context.contentsId)) {
    return { ok: false, error: '資料と表示中の講義を照合できませんでした。元の操作を利用してください。' };
  }
  const id = crypto.randomUUID();
  await offscreen();
  const { jobs = {} } = await chrome.storage.session.get('jobs');
  jobs[id] = { tab: sender.tab.id, frame: sender.frameId || 0, saveMode: s.saveMode, time: Date.now() };
  await chrome.storage.session.set({ jobs: Object.fromEntries(Object.entries(jobs).filter(([, job]) => Date.now() - job.time < 3600000).slice(-100)) });
  await status('saving');
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'save-job', job: {
    id, url: message.url, kind: message.kind, name: typeof message.name === 'string' ? message.name.slice(0, 300) : '',
    course: course.name, courseId: course.id || '', site: s.site, saveMode: s.saveMode, redownload: message.redownload === true
  } });
  return response?.accepted ? { ok: true, jobId: id } : { ok: false };
}
async function startBulk(message, sender, s) {
  const course = await resolveCourse(message.context || {}, sender);
  if (!course) return { ok: false, error: '講義名を認識できませんでした。講義ページを再読み込みしてください。' };
  const materialId = contentsId(sender.url);
  if (!materialId || !/\/txtbk_show_chapter\.php$/.test(new URL(sender.url).pathname)) {
    return { ok: false, error: '教材の目次画面から操作してください。' };
  }
  const name = String(message.context?.materialName || '教材').slice(0, 200);
  const materials = [{ url: sender.url, name }];
  // Chrome supplies the top-level tab URL. Include its frames only for this material.
  if (inSite(sender.tab.url, s.site) && contentsId(sender.tab.url) === materialId &&
      /\/txtbk_frame\.php$/.test(new URL(sender.tab.url).pathname)) {
    materials.push({ url: sender.tab.url, name });
  }
  const resources = Array.isArray(message.resources) ? message.resources.slice(0, 500).flatMap(item => {
    try {
      const url = new URL(item.url);
      if (item.kind !== 'pdf' || !inSite(url.href, s.site) || !url.pathname.toLowerCase().endsWith('.pdf') ||
          !course.id || courseId(url.href) !== course.id) return [];
      return [{ kind: 'pdf', url: url.href, name: String(item.name || '教材.pdf').slice(0, 300) }];
    } catch { return []; }
  }) : [];
  const id = crypto.randomUUID(); await offscreen();
  const { jobs = {} } = await chrome.storage.session.get('jobs');
  jobs[id] = { tab: sender.tab.id, frame: sender.frameId || 0, bulk: true, time: Date.now() };
  await chrome.storage.session.set({ jobs: Object.fromEntries(Object.entries(jobs).filter(([, job]) => Date.now() - job.time < 3600000).slice(-100)) });
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'bulk-save-job', job: { id, materials, resources, materialId, course: course.name, courseId: course.id || '', site: s.site, saveMode: s.saveMode } });
  return response?.accepted ? { ok: true, jobId: id } : { ok: false, error: '一括保存を開始できませんでした。' };
}
async function startPreview(message, sender, s) {
  const url = new URL(message.url, sender.url);
  const name = String(message.name || '').slice(0, 300);
  if (!inSite(url.href, s.site) || !/\/(?:file_down|download)\.php(?:\/|$)/.test(url.pathname) || !previewType(name)) {
    return { ok: false, error: '提出物の取得先または形式を確認できませんでした。' };
  }
  await offscreen();
  const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'preview-job', job: {
    url: url.href, name, kind: message.kind === 'attachment' ? 'attachment' : 'file', site: s.site, courseId: courseId(sender.url)
  } });
  if (!result?.ok) return result || { ok: false };
  const tab = await chrome.tabs.create({ url: result.url }); previewTabs.set(tab.id, result.token);
  return { ok: true };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (['site-access-info', 'site-access-activate'].includes(message?.type)) {
    onboarding.message(message, sender).then(reply, () => reply({ ok: false, error: '設定を登録できませんでした。' }));
    return true;
  }
  if (message?.target === 'offscreen') return;
  if (['browser-check', 'browser-save', 'save-progress', 'save-result', 'bulk-progress', 'bulk-result'].includes(message?.type)) {
    if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('offscreen.html')) return;
    serial(async () => {
      const { jobs = {} } = await chrome.storage.session.get('jobs');
      if (!jobs[message.jobId]) return;
      if (message.type === 'bulk-progress') {
        const job = jobs[message.jobId];
        try { await chrome.tabs.sendMessage(job.tab, { type: 'bulk-progress', jobId: message.jobId, current: message.current, total: message.total }, { frameId: job.frame }); } catch {}
      } else if (message.type === 'bulk-result') {
        const job = jobs[message.jobId];
        try { await chrome.tabs.sendMessage(job.tab, { type: 'bulk-result', jobId: message.jobId, saved: message.saved, skipped: message.skipped, failed: message.failed, total: message.total, error: message.error }, { frameId: job.frame }); } catch {}
        delete jobs[message.jobId]; await chrome.storage.session.set({ jobs });
      } else if (message.type === 'save-progress') {
        const job = jobs[message.jobId];
        try { await chrome.tabs.sendMessage(job.tab, { type: 'save-progress', jobId: message.jobId, loaded: message.loaded, total: message.total, percent: message.percent }, { frameId: job.frame }); } catch {}
      } else if (message.type === 'browser-check') {
        const existing = await existingDownload(message.path);
        if (!existing) return { duplicate: false };
        const job = jobs[message.jobId];
        try { await chrome.tabs.sendMessage(job.tab, { type: 'save-feedback', jobId: message.jobId, code: 'duplicate', path: message.path, canRedownload: true }, { frameId: job.frame }); } catch {}
        delete jobs[message.jobId];
        await chrome.storage.session.set({ jobs });
        await status('duplicate', message.path);
        return { duplicate: true };
      } else if (message.type === 'browser-save') {
        if (!String(message.url).startsWith('blob:' + chrome.runtime.getURL('/'))) return;
        const downloadId = await chrome.downloads.download({ url: message.url, filename: message.path, conflictAction: 'uniquify', saveAs: false });
        const { browserJobs = {} } = await chrome.storage.session.get('browserJobs');
        browserJobs[downloadId] = { jobId: message.jobId, path: message.path };
        await chrome.storage.session.set({ browserJobs });
        await status('suggested', message.path);
      } else {
        const job = jobs[message.jobId];
        const duplicate = message.code === 'duplicate';
        try { await chrome.tabs.sendMessage(job.tab, { type: 'save-feedback', jobId: message.jobId, code: message.code, path: message.path, error: message.error, canOpenLocation: false, canRedownload: duplicate }, { frameId: job.frame }); } catch {}
        delete jobs[message.jobId]; await chrome.storage.session.set({ jobs });
        await status(['saved', 'duplicate'].includes(message.code) ? message.code : 'save-failed', message.path, message.error);
      }
    }).then(result => reply(result || { ok: true }), () => { status('save-failed'); reply({ ok: false }); });
    return true;
  }
  if (!['intent', 'page', 'resolve-course', 'direct-download', 'bulk-download', 'preview-submission', 'open-download-location', 'open-library'].includes(message?.type)) return;
  serial(async () => {
    const s = await settings();
    // Old framesets can reuse an about:blank document after changing its location.
    // Verify the live frame via Chrome, never trust a URL supplied in the message.
    if (sender.id === chrome.runtime.id && sender.tab && sender.url === 'about:blank' && sender.origin === new URL(s.site).origin) {
      const [frame] = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, func: () => location.href });
      if (frame?.documentId === sender.documentId && inSite(frame.result, s.site)) sender = { ...sender, url: frame.result };
    }
    if (sender.id !== chrome.runtime.id || !sender.tab || !inSite(sender.url, s.site)) return { ok: false };
    if (message.type === 'open-library') { checkRelease(); await chrome.tabs.create({ url: chrome.runtime.getURL('library.html') }); return { ok: true }; }
    if (message.type === 'open-download-location') {
      const { completedDownloads = {} } = await chrome.storage.session.get('completedDownloads');
      const completed = completedDownloads[message.jobId];
      if (!completed || completed.tab !== sender.tab.id || Date.now() - completed.time > 600000) return { ok: false };
      chrome.downloads.show(completed.downloadId);
      return { ok: true };
    }
    if (message.type === 'direct-download') return s.enabled ? startSave(message, sender, s) : { ok: false };
    if (message.type === 'bulk-download') return s.enabled ? startBulk(message, sender, s) : { ok: false, error: '自動整理を有効にしてください。' };
    if (message.type === 'preview-submission') return startPreview(message, sender, s);
    let course = await resolveCourse(message.context || { course: message.course }, sender);
    if (!course && sender.frameId > 0) {
      try { course = await chrome.tabs.sendMessage(sender.tab.id, { type: 'local-course' }, { frameId: 0 }); } catch {}
    }
    if (message.type === 'resolve-course' || message.type === 'page') return { course };
    if (!s.enabled || !course || !usableName(course.name)) { if (s.enabled) await status('no-course'); return { ok: false }; }
    if (typeof message.target !== 'string' && message.fallback !== true) return { ok: false };
    const target = message.target ? new URL(message.target) : null;
    if (target && (target.origin !== new URL(sender.url).origin || !['https:', 'http:'].includes(target.protocol))) { await status('external'); return { ok: false }; }
    const now = Date.now();
    const { intents = [] } = await chrome.storage.session.get('intents');
    const intent = { id: crypto.randomUUID(), course: course.name, tab: sender.tab.id, origin: new URL(sender.url).origin,
      page: await digest(sender.url), target: target ? await digest(target.href) : '', fallback: message.fallback === true, time: now };
    await chrome.storage.session.set({ intents: [...intents.filter(i => now - i.time <= TTL), intent].slice(-100) });
    await status('waiting'); return { ok: true };
  }).then(reply, () => reply({ ok: false, error: '操作を開始できませんでした。拡張とWebClassを再読み込みしてください。' }));
  return true;
});
chrome.tabs.onRemoved.addListener(tab => onboarding.removeTab(tab).catch(console.error));
chrome.tabs.onRemoved.addListener(tab => serial(async () => {
  const token = previewTabs.get(tab); if (token) { previewTabs.delete(tab); try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'release-preview', token }); } catch {} }
  const { intents = [] } = await chrome.storage.session.get('intents');
  await chrome.storage.session.set({ intents: intents.filter(i => i.tab !== tab) });
}).catch(console.error));
chrome.downloads.onChanged.addListener(delta => {
  if (!['complete', 'interrupted'].includes(delta.state?.current)) return;
  serial(async () => {
    const { browserJobs = {}, jobs = {} } = await chrome.storage.session.get(['browserJobs', 'jobs']);
    const job = browserJobs[delta.id]; if (!job) return;
    if (delta.state.current === 'complete') {
      const [item] = await chrome.downloads.search({ id: delta.id });
      if (item?.filename) job.path = job.path.slice(0, job.path.lastIndexOf('/') + 1) + filename(item.filename);
    }
    const source = jobs[job.jobId];
    if (source) try { await chrome.tabs.sendMessage(source.tab, { type: 'save-feedback', jobId: job.jobId, code: delta.state.current === 'complete' ? 'saved' : 'save-failed', path: job.path, canOpenLocation: delta.state.current === 'complete' }, { frameId: source.frame }); } catch {}
    const { completedDownloads = {} } = await chrome.storage.session.get('completedDownloads');
    if (source && delta.state.current === 'complete') completedDownloads[job.jobId] = { downloadId: delta.id, tab: source.tab, time: Date.now() };
    const recentDownloads = Object.fromEntries(Object.entries(completedDownloads).filter(([, value]) => Date.now() - value.time <= 600000).slice(-100));
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'release-blob', jobId: job.jobId });
    delete browserJobs[delta.id]; delete jobs[job.jobId];
    await chrome.storage.session.set({ browserJobs, jobs, completedDownloads: recentDownloads });
    await status(delta.state.current === 'complete' ? 'saved' : 'save-failed', job.path);
  }).catch(console.error);
});
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  setTimeout(() => serial(async () => {
    if (item.byExtensionId === chrome.runtime.id) {
      const { browserJobs = {} } = await chrome.storage.session.get('browserJobs');
      const owned = browserJobs[item.id];
      return owned ? { filename: owned.path, conflictAction: 'uniquify' } : undefined;
    }
    const s = await settings();
    if (!s.enabled || !s.site || item.byExtensionId || s.saveMode === 'directory') return;
    if (!item.referrer) { if (inSite(item.url, s.site)) await status('no-referrer'); return; }
    const ref = new URL(item.referrer);
    if (ref.origin !== new URL(s.site).origin) return;
    const { intents = [] } = await chrome.storage.session.get('intents');
    const found = chooseIntent(intents, { refOrigin: ref.origin, ref: await digest(ref.href), originOnly: ref.pathname === '/' && !ref.search,
      url: await digest(item.url), finalUrl: item.finalUrl ? await digest(item.finalUrl) : '',
      inSite: inSite(item.url, s.site) && (!item.finalUrl || inSite(item.finalUrl, s.site)), started: Date.parse(item.startTime), byExtensionId: item.byExtensionId });
    if (!found) { await status('unmatched'); return; }
    await chrome.storage.session.set({ intents: intents.filter(i => i.id !== found.id && Date.now() - i.time <= TTL) });
    const path = destination(s, found.course, item.filename);
    await status('suggested', path); return { filename: path, conflictAction: 'uniquify' };
  }).then(result => suggest(result), () => suggest()), 200);
  return true;
});
