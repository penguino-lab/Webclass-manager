(() => {
  if (globalThis.WebClassCourseUI) return;
  const itemSelector = '.cl-contentsList_listGroupItem';
  const folderSelector = '.cl-contentsList_folder';
  const interactive = 'a,button,input,select,textarea,label,[role="button"],[contenteditable="true"]';
  if (!/\/course\.php\/[^/]+(?:\/|$)/.test(location.pathname)) return;
  let root, observer, panel, skeleton, queued = false, revealTimer, fallbackTimer, statusTimer;
  const started = performance.now();
  let initial = document.readyState !== 'complete';
  let availableOnly = true, periodOnly = false;
  const preferenceKey = 'wcl-course-filters';
  try {
    const saved = JSON.parse(sessionStorage.getItem(preferenceKey));
    if (typeof saved?.availableOnly === 'boolean') availableOnly = saved.availableOnly;
    if (typeof saved?.periodOnly === 'boolean') periodOnly = saved.periodOnly;
  } catch { /* Storage is optional on university pages. */ }
  const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  function openingLink(item) {
    const a = item.querySelector('.cm-contentsList_contentName a');
    if (!a || a.matches('.disabled,[aria-disabled="true"],[disabled]')) return null;
    const href = a.getAttribute('href')?.trim();
    return href && href !== '#' && !/^javascript:/i.test(href) ? a : null;
  }
  function hasPeriod(item) {
    return [...item.querySelectorAll('.cm-contentsList_contentDetailListItemLabel')].some(el => /利用可能期間/.test(el.textContent));
  }
  function nativeVisible(item, folder) {
    for (let el = item; el && el !== folder.parentElement; el = el.parentElement) {
      if (el.hidden || getComputedStyle(el).display === 'none') return false;
    }
    return true;
  }
  function clickItem(event) {
    if (event.defaultPrevented || event.button !== 0 || event.target.closest(interactive) || String(getSelection()).trim()) return;
    const item = event.target.closest(itemSelector);
    // A folder with one material is one large target, including its heading.
    const folder = event.target.closest(folderSelector);
    const items = folder?.querySelectorAll(itemSelector);
    const target = item || (items?.length === 1 ? items[0] : null);
    const link = target && openingLink(target);
    if (link) link.click();
  }
  function keyItem(event) {
    if (event.target.matches(itemSelector) && ['Enter', ' '].includes(event.key)) {
      const link = openingLink(event.target);
      if (link) { event.preventDefault(); link.click(); }
    }
  }
  function filters(sidebar) {
    const width = Math.max(0, Math.min(240, innerWidth - sidebar.getBoundingClientRect().left - 16));
    sidebar.style.setProperty('--wcl-filter-width', `${width}px`);
    if (panel?.isConnected) { if (panel.parentElement !== sidebar) sidebar.prepend(panel); return; }
    panel = document.createElement('aside'); panel.id = 'wcl-course-filters';
    const title = document.createElement('h3'); title.textContent = '教材を絞り込む'; panel.append(title);
    for (const [id, text, checked] of [['wcl-available-only', '現在開ける教材だけ表示', availableOnly], ['wcl-period-only', '期間が設定された教材だけ表示', periodOnly]]) {
      const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
      input.type = 'checkbox'; input.id = id; input.checked = checked; span.textContent = text;
      input.addEventListener('change', () => {
        availableOnly = panel.querySelector('#wcl-available-only').checked;
        periodOnly = panel.querySelector('#wcl-period-only').checked;
        try { sessionStorage.setItem(preferenceKey, JSON.stringify({ availableOnly, periodOnly })); } catch {}
        update();
      });
      label.append(input, span); panel.append(label);
    }
    const count = document.createElement('p'); count.id = 'wcl-filter-count'; count.setAttribute('role', 'status'); panel.append(count);
    sidebar.prepend(panel);
  }
  async function copyCode(button, label, code) {
    let copied = false;
    try { await navigator.clipboard.writeText(code); copied = true; } catch {
      const field = document.createElement('textarea'); field.value = code;
      field.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(field); field.select();
      try { copied = document.execCommand('copy'); } catch {} finally { field.remove(); button.focus(); }
    }
    setText(label, copied ? 'コピーしました✓' : 'コピーできません');
    clearTimeout(statusTimer); statusTimer = setTimeout(() => setText(label, '講義コードをコピー'), 2500);
  }
  function header() {
    const title = document.querySelector('.course-name');
    if (!title) return;
    if (title.hasAttribute('href')) { title.dataset.wclCourseHref = title.getAttribute('href'); title.removeAttribute('href'); }
    title.classList.add('wcl-course-title'); title.removeAttribute('role'); title.removeAttribute('tabindex');
    // Keep the original node for the university renderer; suppress its native action.
    if (!title.dataset.wclInactive) { title.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); }, true); title.dataset.wclInactive = 'true'; }
    const code = title.textContent.trim().match(/[_＿]([a-zA-Z][a-zA-Z0-9_-]{2,40})$/)?.[1] || location.pathname.match(/\/course\.php\/([^/]+)/)?.[1];
    if (code && !document.getElementById('wcl-copy-code')) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = 'wcl-copy-code'; button.className = 'wcl-copy-code'; button.title = code;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.6'); icon.setAttribute('aria-hidden', 'true');
      const outline = document.createElementNS(icon.namespaceURI, 'path'); outline.setAttribute('d', 'M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M9 3h6v4H9z'); outline.setAttribute('stroke-linejoin', 'round'); icon.append(outline);
      const label = document.createElement('span'); label.textContent = '講義コードをコピー'; label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite'); label.setAttribute('aria-atomic', 'true'); button.append(icon, label);
      button.addEventListener('click', () => copyCode(button, label, code)); title.after(button);
    }
    const home = document.querySelector('a.course-webclass');
    if (home) {
      if (!home.querySelector('.wcl-course-home-label')) {
        const label = document.createElement('span'); label.className = 'wcl-course-home-label'; label.textContent = 'WebClass'; home.replaceChildren(label);
      }
      home.classList.add('wcl-course-home'); home.setAttribute('aria-label', 'WebClass ホームに戻る');
    }
    return home;
  }
  function loadingSkeleton() {
    if (!initial) return;
    const host = root.querySelector('#search-app')?.parentElement;
    if (!host) return;
    if (skeleton?.isConnected && skeleton.parentElement === host) return;
    skeleton?.parentElement?.classList.remove('wcl-skeleton-host'); skeleton?.remove();
    host.classList.add('wcl-skeleton-host');
    skeleton = document.createElement('section'); skeleton.id = 'wcl-course-skeleton'; skeleton.setAttribute('role', 'status');
    const status = document.createElement('span'); status.className = 'wcl-skeleton-status'; status.textContent = '教材を読み込んでいます'; skeleton.append(status);
    const visual = document.createElement('div'); visual.className = 'wcl-skeleton-visual'; visual.setAttribute('aria-hidden', 'true'); skeleton.append(visual);
    const bar = (parent, variant = '') => { const el = document.createElement('div'); el.className = `wcl-skeleton-bar ${variant}`; parent.append(el); };
    const search = document.createElement('div'); search.className = 'wcl-skeleton-search'; bar(search); visual.append(search);
    for (let i = 0; i < 3; i++) {
      const card = document.createElement('div'), heading = document.createElement('div'), lines = document.createElement('div');
      card.className = 'wcl-skeleton-card'; heading.className = 'wcl-skeleton-heading'; lines.className = 'wcl-skeleton-lines';
      bar(heading); bar(lines); bar(lines, 'short'); bar(lines, 'long'); card.append(heading, lines); visual.append(card);
    }
    host.append(skeleton);
  }
  function update() {
    observer?.disconnect();
    const home = header();
    document.querySelectorAll('.alert-info').forEach(alert => {
      if (alert.querySelector('a[href*="information.php"],a[href*="msg_editor.php"]')) alert.classList.add('wcl-notification-banner');
    });
    const next = document.querySelector('.cm-contentsList');
    if (!next) { observe(); return; }
    if (next !== root) {
      root = next; root.addEventListener('click', clickItem); root.addEventListener('keydown', keyItem);
    }
    root.classList.add('wcl-course-layout');
    loadingSkeleton();
    const sidebar = root.querySelector('.cm-sideNav_container');
    if (sidebar) {
      sidebar.classList.add('wcl-course-sidebar');
      sidebar.querySelectorAll('.cm-sideNav_folders').forEach(el => el.classList.add('wcl-course-outline'));
      filters(sidebar);
    } else if (root.querySelector('#search-app')) filters(root.querySelector('#search-app').parentElement);
    let visible = 0, total = 0;
    const folders = root.querySelectorAll(folderSelector);
    folders.forEach(folder => folder.classList.remove('wcl-filtered-folder'));
    root.querySelectorAll(itemSelector).forEach(item => {
      item.classList.remove('wcl-filtered-item'); item.classList.add('wcl-course-card');
      const link = openingLink(item), folder = item.closest(folderSelector) || root;
      item.classList.toggle('wcl-openable', Boolean(link)); item.classList.toggle('wcl-unavailable', !link);
      if (link) { item.setAttribute('role', 'link'); item.tabIndex = 0; item.setAttribute('aria-label', item.dataset.contentsName || link.textContent.trim()); }
      else { item.removeAttribute('role'); item.removeAttribute('tabindex'); item.removeAttribute('aria-label'); }
      let badge = item.querySelector('.wcl-unavailable-badge');
      const name = item.querySelector('.cm-contentsList_contentName');
      if (!link && !badge && name) { badge = document.createElement('span'); badge.className = 'wcl-unavailable-badge'; badge.textContent = '現在は利用できません'; name.append(badge); }
      if (link && badge) badge.remove();
      const hidden = (availableOnly && !link) || (periodOnly && !hasPeriod(item));
      const shownBySearch = nativeVisible(item, folder);
      item.classList.toggle('wcl-filtered-item', hidden);
      if (shownBySearch) { total++; if (!hidden) visible++; }
    });
    folders.forEach(folder => {
      const items = [...folder.querySelectorAll(itemSelector)];
      folder.classList.toggle('wcl-filtered-folder', items.length > 0 && items.every(item => item.classList.contains('wcl-filtered-item') || !nativeVisible(item, folder)));
    });
    if (panel?.isConnected) setText(panel.querySelector('#wcl-filter-count'), visible ? `${visible} 件表示（検索結果 ${total} 件）` : '条件に合う教材はありません。検索・絞り込み条件を変更してください。');
    if (home) root.querySelectorAll('button,a').forEach(button => {
      if (!/^top$/i.test(button.textContent.trim())) return;
      const link = document.createElement('a'); link.href = home.href; link.textContent = 'ホームに戻る'; link.className = 'wcl-course-bottom-home'; button.replaceWith(link);
    });
    observe();
  }
  function observe() {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'href', 'aria-disabled'] });
  }
  function reveal() {
    if (!initial) return;
    update(); initial = false;
    clearTimeout(revealTimer); clearTimeout(fallbackTimer);
    skeleton?.parentElement?.classList.remove('wcl-skeleton-host'); skeleton?.remove(); skeleton = null;
    document.documentElement.removeAttribute('data-wcl-course-loading');
  }
  function settle() {
    if (!initial) return;
    clearTimeout(revealTimer);
    // Wait for a quiet first batch, while keeping an upper bound for empty/error pages.
    if (document.readyState !== 'loading' && root?.querySelector(itemSelector)) {
      revealTimer = setTimeout(reveal, Math.max(220, 450 - (performance.now() - started)));
    }
  }
  function schedule() {
    settle();
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; update(); settle(); });
  }
  globalThis.WebClassCourseUI = Object.freeze({ update });
  document.documentElement.setAttribute('data-wcl-course-ui', '');
  if (initial) {
    document.documentElement.setAttribute('data-wcl-course-loading', '');
    fallbackTimer = setTimeout(reveal, 2000);
  }
  observer = new MutationObserver(schedule);
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  addEventListener('resize', schedule, { passive: true });
  update(); settle();
})();
