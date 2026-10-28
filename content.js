(() => {
  if (globalThis.__webclassLibraryLoaded) return;
  globalThis.__webclassLibraryLoaded = true;
  let settings, names = {}, overrides = {}, timer, lastAction, noticeTimer;
  const controls = new Map();
  const retries = new Map();
  const send = message => chrome.runtime.sendMessage(message).catch(() => undefined);
  const ready = chrome.storage.local.get({ settings: {}, courseNames: {}, courseOverrides: {} }).then(data => {
    settings = data.settings; names = data.courseNames; overrides = data.courseOverrides;
  });
  function active() {
    try { const site = new URL(settings.site); return location.origin === site.origin && location.pathname.startsWith(site.pathname); } catch { return false; }
  }
  async function pageKey() {
    const url = new URL(location.href); url.hash = '';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.href));
    return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  }
  async function localContext() {
    await ready;
    if (!active()) return { course: null };
    const context = WebClassAdapter.context ? WebClassAdapter.context(document, settings.selector) : { course: WebClassAdapter.course(document, settings.selector) };
    const key = context.courseId ? location.origin + '|' + context.courseId : await pageKey();
    const name = context.courseId ? overrides[key] : names[key];
    if (name) context.course = { name, id: context.courseId, source: context.courseId ? 'この講義で指定した講義名' : 'このページで指定した講義名' };
    return context;
  }
  async function course() {
    const context = await localContext();
    if (!active()) return null;
    const result = await send({ type: 'resolve-course', context });
    return result && 'course' in result ? result.course : context.course;
  }
  async function report() {
    const context = await localContext();
    if (active()) {
      globalThis.WebClassMaterialUI?.update();
      globalThis.WebClassCourseUI?.update();
      send({ type: 'page', context });
    }
  }
  ready.then(report);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) settings = changes.settings.newValue;
    if (changes.courseNames) names = changes.courseNames.newValue || {};
    if (changes.courseOverrides) overrides = changes.courseOverrides.newValue || {};
    if (changes.settings || changes.courseNames || changes.courseOverrides) report();
  });
  function notice(text, { control = null, redownloadJobId = '', progress = null, persistent = false, openManager = false, closable = false } = {}) {
    let box = document.getElementById('webclass-save-notice');
    if (!box) {
      box = document.createElement('div'); box.id = 'webclass-save-notice'; box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;right:16px;bottom:16px;max-width:420px;z-index:2147483647;padding:16px;background:var(--wcl-surface,#fff);color:var(--wcl-ink,#21332d);border:2px solid var(--wcl-accent,#176a49);border-radius:10px;font:14px/1.6 system-ui;box-shadow:0 4px 20px #0003';
      (document.body || document.documentElement).append(box);
    }
    box.replaceChildren(document.createTextNode(text));
    if (Number.isFinite(progress)) {
      const bar = document.createElement('progress'); bar.max = 100; bar.value = progress;
      bar.setAttribute('aria-label', `ダウンロード進捗 ${progress}%`);
      bar.style.cssText = 'display:block;width:100%;height:8px;margin-top:8px;accent-color:var(--wcl-accent,#176a49)';
      box.append(bar);
    }
    if (control) {
      const native = document.createElement('button'); native.type = 'button'; native.textContent = '元の操作を使う';
      native.addEventListener('click', () => { box.remove(); control.click(); }); box.append(document.createElement('br'), native);
    }
    if (redownloadJobId) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '再ダウンロードする';
      retry.addEventListener('click', async () => {
        const previous = retries.get(redownloadJobId);
        if (!previous) return;
        notice('ダウンロード中… 0%', { progress: 0, persistent: true });
        const result = await send({ ...previous.request, redownload: true });
        retries.delete(redownloadJobId);
        if (result?.ok) {
          controls.set(result.jobId, previous.control);
          retries.set(result.jobId, previous);
        } else notice(result?.error || '再ダウンロードを開始できませんでした。', { openManager: true, closable: true });
      });
      box.append(document.createElement('br'), retry);
    }
    if (openManager) {
      const open = document.createElement('button'); open.type = 'button'; open.textContent = '開く'; open.title = 'Webclass managerを開く';
      open.addEventListener('click', () => { send({ type: 'open-library' }); box.remove(); });
      box.append(document.createElement('br'), open);
    }
    if (closable) {
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる';
      close.addEventListener('click', () => box.remove()); box.append(document.createTextNode(' '), close);
    }
    clearTimeout(noticeTimer);
    if (!persistent) noticeTimer = setTimeout(() => { box.remove(); if (redownloadJobId) retries.delete(redownloadJobId); }, 3000);
  }
  function finishBulk() {
    const button = document.getElementById('wcl-material-bulk');
    if (button) button.disabled = false;
  }
  document.addEventListener('webclass-library-bulk-download', async () => {
    await ready;
    if (!active()) { finishBulk(); return; }
    notice('一括ダウンロードを準備しています…', { progress: 0, persistent: true });
    const context = await localContext();
    // The worker derives the material URLs from Chrome's verified sender.
    let resources;
    try {
      resources = await WebClassMaterialUI.collectChapterPDFs((current, total) => {
        notice(`教材の資料を確認中… ${current}/${total}`, { persistent: true });
      });
    } catch (error) {
      resources = Array.isArray(error.resources) ? error.resources : [];
      notice(error.message || 'PDFを確認できないため、添付資料のみ保存します。', { persistent: true });
    }
    const result = await send({ type: 'bulk-download', context, resources });
    if (!result?.ok) {
      finishBulk();
      notice(result?.error || '一括ダウンロードを開始できませんでした。', { openManager: true, closable: true });
    }
  });
  for (const kind of ['click', 'auxclick', 'submit']) document.addEventListener(kind, async event => {
    if (!event.isTrusted || !active() || (kind === 'auxclick' && event.button !== 1)) return;
    const control = event.target.closest?.('button,input');
    if (kind === 'click' && control?.form && control.type === 'submit') return;
    const context = WebClassAdapter.context ? WebClassAdapter.context(document, settings.selector) : { course: WebClassAdapter.course(document, settings.selector) };
    const preview = WebClassAdapter.submissionPreviewAction?.(event, document);
    if (preview && event.cancelable) {
      event.preventDefault(); event.stopImmediatePropagation();
      const original = event.target.closest('a');
      notice('提出物を開いています…', { persistent: true });
      const result = await send({ type: 'preview-submission', ...preview });
      if (result?.ok) document.getElementById('webclass-save-notice')?.remove();
      else notice(result?.error || '提出物を表示できませんでした。', { control: original, openManager: true, closable: true });
      return;
    }
    if (!settings.enabled) return;
    const direct = WebClassAdapter.directAction?.(event, document, context);
    if (direct && event.cancelable) {
      // Must stop WebClass's inline popup handler/PDF.js handler BEFORE any await.
      event.preventDefault(); event.stopImmediatePropagation();
      const original = event.target.closest('a,button');
      notice('ダウンロード中… 0%', { progress: 0, persistent: true });
      const request = { type: 'direct-download', context: await localContext(), ...direct };
      const result = await send(request);
      if (!result?.ok) notice(result?.error || '保存を開始できませんでした。', { openManager: true, closable: true });
      else { controls.set(result.jobId, original); retries.set(result.jobId, { request, control: original }); }
      return;
    }
    const action = WebClassAdapter.downloadAction(event, document);
    if (!action) return;
    const now = Date.now();
    if (lastAction && now - lastAction.time < 250 && lastAction.target === action.target) return;
    lastAction = { time: now, target: action.target };
    send({ type: 'intent', course: await course(), context: await localContext(), ...action });
  }, true);
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(report, 300); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  addEventListener('popstate', report);
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'save-progress') {
      notice(`ダウンロード中… ${Math.max(0, Math.min(100, Number(message.percent) || 0))}%`, { progress: message.percent, persistent: true });
      return;
    }
    if (message.type === 'bulk-progress') {
      const total = Math.max(1, Number(message.total) || 1), current = Math.max(0, Number(message.current) || 0);
      notice(`一括ダウンロード中… ${current}/${total}`, { progress: Math.round(current * 100 / total), persistent: true });
      return;
    }
    if (message.type === 'bulk-result') {
      finishBulk();
      const text = message.error || `一括ダウンロードが完了しました：保存 ${message.saved || 0}件・重複 ${message.skipped || 0}件・失敗 ${message.failed || 0}件`;
      notice(text, { openManager: true, closable: true });
      return;
    }
    if (message.type === 'save-feedback') {
      const text = message.code === 'saved' ? '保存しました：' + message.path
        : message.code === 'duplicate' ? 'この資料は既に保存されています：' + message.path
          : message.error || '保存できませんでした。設定とログイン状態を確認してください。';
      notice(text, {
        redownloadJobId: message.code === 'duplicate' && message.canRedownload ? message.jobId : '',
        openManager: true,
        closable: true
      });
      controls.delete(message.jobId);
      if (message.code !== 'duplicate') retries.delete(message.jobId);
      return;
    }
    if (!['current', 'local-course', 'set-course'].includes(message.type)) return;
    (async () => {
      await ready;
      if (!active()) return null;
      if (message.type === 'local-course') return (await localContext()).course;
      if (message.type === 'set-course') {
        const name = String(message.name || '').trim();
        if (name.length > 200) throw Error('講義名は200文字以内で入力してください。');
        const context = await localContext();
        const resolved = await course();
        const id = context.courseId || resolved?.id;
        const field = id ? 'courseOverrides' : 'courseNames';
        const key = id ? location.origin + '|' + id : await pageKey();
        const data = (await chrome.storage.local.get(field))[field] || {};
        delete data[key]; if (name) data[key] = name;
        const limited = Object.fromEntries(Object.entries(data).slice(-200));
        if (id) overrides = limited; else names = limited;
        await chrome.storage.local.set({ [field]: limited });
      }
      return course();
    })().then(reply, () => reply(null));
    return true;
  });
})();
