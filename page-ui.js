(() => {
  if (globalThis.WebClassPageUI) return;
  const themes = globalThis.WebClassPageThemes;
  if (!themes?.length) return;
  const themeKey = 'pageTheme', cacheKey = 'wcl-page-theme', bannerKey = 'pageBanner';
  let bannerImage = '', bannerBusy = false, bannerOperation = 0, bannerTouched = false;
  const validBanner = value => typeof value === 'string' && value.length <= 1500000 && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  function bannerControls(message, error = false) {
    for (const control of controls) {
      control.querySelector('.wcl-banner-pick').disabled = bannerBusy;
      control.querySelector('.wcl-banner-clear').disabled = bannerBusy || !bannerImage;
      const preview = control.querySelector('.wcl-banner-thumbnail');
      preview.style.backgroundImage = bannerImage ? `url("${bannerImage}")` : '';
      if (message !== undefined) {
        const status = control.querySelector('.wcl-banner-status');
        status.textContent = message; status.toggleAttribute('data-error', error);
      }
    }
  }
  function applyBanner(value) {
    bannerImage = validBanner(value) ? value : '';
    const root = document.documentElement;
    root.toggleAttribute('data-wcl-banner', Boolean(bannerImage));
    if (bannerImage) root.style.setProperty('--wcl-banner-image', `url("${bannerImage}")`);
    else root.style.removeProperty('--wcl-banner-image');
    bannerControls(bannerImage ? 'バナー画像を設定しています。' : 'テーマとは別に保存されます。');
  }
  async function bannerData(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('PNG・JPEG・WebPの画像を選択してください。');
    if (file.size > 20 * 1024 * 1024) throw new Error('20MB以下の画像を選択してください。');
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('画像を読み込めませんでした。別の画像を選択してください。'); }
    try {
      const nav = document.querySelector('.navbar.navbar-default');
      const bounds = nav?.getBoundingClientRect();
      const aspectRatio = bounds?.height > 0 ? bounds.width / bounds.height : 10;
      if (!globalThis.WebClassBannerCrop) throw new Error('切り取り画面を読み込めませんでした。ページを再読み込みしてください。');
      const canvas = await globalThis.WebClassBannerCrop.open(bitmap, { aspectRatio });
      if (!canvas) return null;
      for (const quality of [.86, .72, .55]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (validBanner(data)) return data;
      }
      throw new Error('画像が大きすぎます。小さい画像を選択してください。');
    } finally { bitmap.close(); }
  }
  async function saveBanner(file) {
    const operation = ++bannerOperation; bannerTouched = true; bannerBusy = true;
    bannerControls(file ? '画像を保存しています…' : '画像を解除しています…');
    try {
      const data = file ? await bannerData(file) : '';
      if (operation !== bannerOperation) return;
      if (file && data === null) { bannerControls('画像の選択を取り消しました。'); return; }
      if (file) bannerControls('画像を保存しています…');
      if (data) await chrome.storage.local.set({ [bannerKey]:data });
      else await chrome.storage.local.remove(bannerKey);
      if (operation === bannerOperation) applyBanner(data);
    } catch (error) {
      if (operation === bannerOperation) bannerControls(error.message || 'バナーの保存に失敗しました。', true);
    } finally {
      if (operation === bannerOperation) { bannerBusy = false; bannerControls(); }
    }
  }
  const accountSelector = '.navbar a[title="アカウントメニュー"]';
  let current = themes[0], observer, queued = false, dayTimer, selected = false, controlId = 0;
  const controls = new Set();
  const inactiveWordmarks = new WeakSet();
  const libraryButtons = new WeakSet();
  const homeNews = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function libraryAction(button) {
    if (libraryButtons.has(button)) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await chrome.runtime.sendMessage({type:'open-library'}); }
      catch (error) { console.warn('Library could not be opened',error); }
      finally { button.disabled = false; }
    });
    libraryButtons.add(button);
  }
  function newsMotion(state, restart = false) {
    const { info, list, viewport, pause } = state;
    if (restart) { state.animation?.cancel(); state.animation = null; }
    const stopped = state.paused || state.hovered || list.contains(document.activeElement) || document.hidden || reducedMotion.matches;
    pause.textContent = state.paused ? '▶' : 'Ⅱ';
    pause.setAttribute('aria-label', state.paused ? 'お知らせのスクロールを再開' : 'お知らせのスクロールを一時停止');
    pause.setAttribute('aria-pressed', String(state.paused));
    if (stopped) { state.animation?.pause(); return; }
    if (state.animation) { state.animation.play(); return; }
    const items = [...list.children].filter(el => el.matches('li:not(.head)'));
    if (items.length < 2) return;
    viewport.scrollLeft = 0;
    const distance = items[0].getBoundingClientRect().width;
    if (!distance) return;
    state.animation = list.animate([{transform:'translateX(0)'},{transform:`translateX(-${distance}px)`}], {duration:Math.max(8000,distance / 42 * 1000),easing:'linear'});
    state.animation.onfinish = () => {
      state.animation.cancel(); state.animation = null;
      if (!info.isConnected || !list.isConnected) return;
      // Move the original node so WebClass's links and handlers survive each lap.
      observer.disconnect(); list.append(items[0]); observe(); newsMotion(state);
    };
  }
  function homeLibrary() {
    for (const [info,state] of homeNews) if (!info.isConnected || !state.list.isConnected) {
      state.animation?.cancel(); state.resize.disconnect(); homeNews.delete(info);
    }
    // This native block identifies the home page; course/material pages stay intact.
    for (const info of document.querySelectorAll('#UserTopInfo:has(#NewestInformations)')) {
      let hero = info.nextElementSibling;
      if (!hero?.matches('.wcl-library-hero')) {
        hero = document.createElement('button'); hero.type = 'button'; hero.className = 'wcl-library-hero';
        const image = document.createElement('span'); image.className = 'wcl-library-hero-image'; image.setAttribute('aria-hidden','true');
        image.style.backgroundImage = `url("${chrome.runtime.getURL('images/library-preview.webp')}")`;
        const label = document.createElement('span'); label.className = 'wcl-library-hero-label'; label.textContent = 'ライブラリを開く';
        const arrow = document.createElement('span'); arrow.className = 'wcl-library-hero-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
        label.append(arrow); hero.append(image,label); info.after(hero);
      }
      libraryAction(hero);
      info.classList.add('wcl-news-ticker');
      const list = info.querySelector('#AjaxInfoBox .info-list');
      if (!list) continue;
      const items = [...list.children].filter(el => el.matches('li:not(.head)'));
      const previous = homeNews.get(info);
      if (previous && items.length === previous.items.length && items.every(item => previous.items.includes(item))) continue;
      previous?.animation?.cancel(); previous?.resize.disconnect();
      const viewport = info.querySelector('#AjaxInfoBox');
      let pause = info.querySelector('.wcl-news-pause');
      if (!pause) { pause = document.createElement('button'); pause.type = 'button'; pause.className = 'wcl-news-pause'; info.append(pause); }
      // WebClass renders separate desktop/mobile links. Show one original copy.
      for (const item of list.querySelectorAll(':scope > li:not(.head)')) {
        const link = item.querySelector('a.title');
        if (!link) continue;
        item.classList.add('wcl-news-item');
        const wrapper = link.closest('span'); if (wrapper?.parentElement === item) wrapper.classList.add('wcl-news-primary');
        if (link.title) link.textContent = link.title;
      }
      const state = {info,list,viewport,pause,items,paused:previous?.paused || false,hovered:info.matches(':hover'),animation:null};
      homeNews.set(info,state);
      pause.onclick = () => { state.paused = !state.paused; newsMotion(state); };
      info.onpointerenter = () => { state.hovered = true; newsMotion(state); };
      info.onpointerleave = () => { state.hovered = false; newsMotion(state); };
      info.onfocusin = () => {
        // A focused link must be reachable even when its item is off screen.
        if (list.contains(document.activeElement)) { state.animation?.cancel(); state.animation = null; }
        newsMotion(state);
        if (list.contains(document.activeElement)) document.activeElement.scrollIntoView({block:'nearest',inline:'nearest'});
      };
      info.onfocusout = () => queueMicrotask(() => newsMotion(state));
      state.resize = new ResizeObserver(() => newsMotion(state,true)); state.resize.observe(viewport);
      newsMotion(state);
    }
  }
  reducedMotion.addEventListener('change', () => { for (const state of homeNews.values()) newsMotion(state,true); });
  document.addEventListener('visibilitychange', () => { for (const state of homeNews.values()) newsMotion(state); });
  function applyTheme(id) {
    current = globalThis.WebClassTheme.apply(id);
    try { localStorage.setItem(cacheKey, current.id); } catch {}
    for (const control of controls) {
      control.querySelector('.wcl-theme-toggle').title = `テーマ: ${current.label}`;
      for (const option of control.querySelectorAll('[data-theme]')) option.setAttribute('aria-checked', String(option.dataset.theme === current.id));
    }
  }
  function closeThemes(except) {
    for (const control of controls) {
      if (control === except) continue;
      control.querySelector('.wcl-theme-menu').hidden = true;
      control.querySelector('.wcl-theme-toggle').setAttribute('aria-expanded', 'false');
    }
  }
  function themeControl(notification) {
    const list = notification.parentElement;
    let control = [...controls].find(el => el.parentElement === list);
    if (control) { if (control.nextElementSibling !== notification) notification.before(control); return; }
    // Native renderers can clone/replace a header; cloned nodes lack our listeners.
    list.querySelectorAll(':scope > .wcl-theme-control').forEach(el => el.remove());
    control = document.createElement('li'); control.className = 'wcl-theme-control';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'wcl-theme-toggle';
    toggle.setAttribute('aria-label', 'テーマを選択'); toggle.setAttribute('aria-haspopup', 'menu'); toggle.setAttribute('aria-expanded', 'false');
    toggle.title = `テーマ: ${current.label}`;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('aria-hidden','true');
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d','M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.2 1.2 0 0 1 .6-2.3H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z'); icon.append(path);
    for (const [cx,cy] of [[7,10],[10,6.8],[14.5,7],[17.5,10.5]]) {
      const dot = document.createElementNS(icon.namespaceURI,'circle'); dot.setAttribute('cx',cx); dot.setAttribute('cy',cy); dot.setAttribute('r','1'); icon.append(dot);
    }
    toggle.append(icon);
    const menu = document.createElement('div'); menu.className = 'wcl-theme-menu'; menu.hidden = true;
    menu.id = `wcl-theme-menu-${++controlId}`; menu.setAttribute('role','menu'); menu.setAttribute('aria-label','テーマ'); toggle.setAttribute('aria-controls',menu.id);
    for (const theme of themes) {
      const option = document.createElement('button'); option.type = 'button'; option.dataset.theme = theme.id;
      option.setAttribute('role','menuitemradio'); option.setAttribute('aria-checked',String(current.id === theme.id));
      const swatch = document.createElement('span'); swatch.className = 'wcl-theme-swatch'; swatch.style.background = theme.gradient || 'linear-gradient(135deg,#fff 48%,#cbd5df 49%,#cbd5df 51%,#fff 52%)'; swatch.setAttribute('aria-hidden','true');
      const label = document.createElement('span'); label.textContent = theme.label; option.append(swatch,label);
      option.addEventListener('click', () => {
        selected = true; applyTheme(theme.id);
        chrome.storage.local.set({ [themeKey]:theme.id }).catch(() => {});
      });
      menu.append(option);
    }
    const separator = document.createElement('div'); separator.className = 'wcl-banner-separator'; separator.setAttribute('role','separator');
    const row = document.createElement('div'); row.className = 'wcl-banner-row'; row.setAttribute('role','group'); row.setAttribute('aria-label','バナー画像');
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'wcl-banner-pick'; pick.setAttribute('role','menuitem');
    const preview = document.createElement('span'); preview.className = 'wcl-banner-thumbnail'; preview.setAttribute('aria-hidden','true');
    if (bannerImage) preview.style.backgroundImage = `url("${bannerImage}")`;
    const pickLabel = document.createElement('span'); pickLabel.textContent = 'バナー画像を選択'; pick.append(preview,pickLabel);
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'wcl-banner-clear'; clear.textContent = '×'; clear.title = 'バナー画像を解除'; clear.setAttribute('aria-label','バナー画像を解除'); clear.setAttribute('role','menuitem'); clear.disabled = bannerBusy || !bannerImage;
    row.append(pick,clear);
    pick.disabled = bannerBusy;
    const input = document.createElement('input'); input.type = 'file'; input.className = 'wcl-banner-input'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true;
    const status = document.createElement('div'); status.className = 'wcl-banner-status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.textContent = bannerImage ? 'バナー画像を設定しています。' : 'テーマとは別に保存されます。';
    pick.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; input.value = '';
      if (file) { await saveBanner(file); if (!menu.hidden) pick.focus(); }
    });
    clear.addEventListener('click', async () => { await saveBanner(null); if (!menu.hidden) pick.focus(); });
    menu.append(separator,row,input,status);
    const show = () => {
      const opening = menu.hidden; closeThemes(); menu.hidden = !opening; toggle.setAttribute('aria-expanded',String(opening));
      if (!opening) return;
      menu.style.transform = ''; menu.style.maxHeight = '';
      const box = menu.getBoundingClientRect();
      const shift = box.right > innerWidth - 8 ? innerWidth - 8 - box.right : box.left < 8 ? 8 - box.left : 0;
      menu.style.transform = `translateX(${shift}px)`;
      menu.style.maxHeight = `${Math.max(96, innerHeight - box.top - 8)}px`;
      const option = menu.querySelector(`[data-theme="${current.id}"]`);
      option.focus({preventScroll:true});
      menu.scrollTop = Math.max(0, option.offsetTop + option.offsetHeight - menu.clientHeight);
    };
    toggle.addEventListener('click', show);
    toggle.addEventListener('keydown', event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); if (menu.hidden) show(); } });
    control.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('button:not(:disabled)')], index = options.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeThemes(); toggle.focus(); }
      else if (index >= 0 && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault(); options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
      }
    });
    control.append(toggle,menu); controls.add(control); notification.before(control);
  }
  function header() {
    for (const nav of document.querySelectorAll('.navbar')) {
      let button = nav.querySelector('.wcl-library-button');
      if (!button) {
        const collapse = nav.querySelector('.navbar-collapse'), notification = nav.querySelector('#notification-dropdown-area');
        if (!collapse && !notification) continue;
        const item = document.createElement('li'); button = document.createElement('button'); button.type = 'button'; button.className = 'wcl-library-button'; button.textContent = 'ライブラリを開く'; item.append(button);
        if (collapse) { const list = document.createElement('ul'); list.className = 'nav navbar-nav navbar-right wcl-library-nav'; list.append(item); collapse.prepend(list); }
        else notification.before(item);
      }
      libraryAction(button);
    }
    for (const nav of document.querySelectorAll('.navbar:not(:has(.course-name))')) {
      if (/\/course\.php(?:\/|$)/.test(location.pathname)) continue;
      const brand = nav.querySelector('.navbar-brand');
      if (!brand || brand.textContent.trim() !== 'WebClass') continue;
      const wordmark = brand.matches('a') ? brand : brand.querySelector('a') || brand;
      brand.classList.add('wcl-home-brand'); wordmark.classList.add('wcl-home-wordmark');
      wordmark.removeAttribute('href'); wordmark.removeAttribute('tabindex'); wordmark.removeAttribute('role');
      if (!inactiveWordmarks.has(wordmark)) {
        wordmark.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
        inactiveWordmarks.add(wordmark);
      }
    }
    for (const control of controls) if (!control.isConnected) controls.delete(control);
    for (const notification of document.querySelectorAll('.navbar #notification-dropdown-area')) themeControl(notification);
    const accounts = [...document.querySelectorAll(accountSelector)];
    for (const account of accounts) {
      const owner = account.closest('li');
      if (!owner) continue;
      let menu = owner.querySelector(':scope > .dropdown-menu');
      if (!menu) { menu = document.createElement('ul'); menu.className = 'dropdown-menu'; owner.append(menu); }
      menu.classList.add('wcl-account-menu');
      const links = [...document.querySelectorAll('.navbar a[href]')].filter(link => {
        try { return /\/logout\.php$/.test(new URL(link.href).pathname) && !link.closest('.wcl-account-menu'); } catch { return false; }
      });
      let logout = menu.querySelector('.wcl-account-logout');
      if (!logout && links.length) {
        const native = links[0], original = native.closest('li'), originalList = original?.parentElement;
        logout = document.createElement('li'); logout.className = 'wcl-account-logout'; logout.append(native); menu.append(logout);
        if (original && !original.textContent.trim() && !original.querySelector('a,button')) original.remove();
        if (originalList?.matches('.navbar-nav') && !originalList.querySelector('a,button,input')) originalList.remove();
        // Other responsive copies must also live in their account menu, not the main bar.
        for (const duplicate of links.slice(1)) duplicate.closest('li')?.classList.add('wcl-logout-duplicate');
      }
      if (!logout) {
        const existing = document.querySelector('.wcl-account-logout a');
        if (existing) { logout = document.createElement('li'); logout.className = 'wcl-account-logout'; logout.append(existing.cloneNode(true)); menu.append(logout); }
      }
      if (logout && menu.lastElementChild !== logout) menu.append(logout);
    }
  }
  function introduction() {
    for (const info of document.querySelectorAll('#ContentInfo')) {
      const form = info.closest('form'); if (!form) continue;
      let actions = form.querySelector('.wcl-intro-actions');
      const buttons = [...form.querySelectorAll('input[type="submit"],input[type="button"],button')].filter(button => !info.contains(button) && !actions?.contains(button));
      if (!buttons.length) continue;
      if (!actions) { actions = document.createElement('div'); actions.className = 'wcl-intro-actions'; actions.setAttribute('role','group'); actions.setAttribute('aria-label','教材の操作'); form.append(actions); }
      for (const button of buttons) actions.append(button);
      for (const table of form.querySelectorAll('table')) {
        if (table === info || table.contains(info)) continue;
        if (!table.textContent.replace(/\s|\u00a0/g,'') && !table.querySelector('input,button,a,img')) table.classList.add('wcl-intro-spacer');
      }
    }
  }
  function privateNames() {
    // WebClass reuses #User for save controls; never filter that container.
    for (const user of document.querySelectorAll('[id="User"]')) {
      if (user.querySelector('input,button,textarea,select,a')) continue;
      for (const node of [...user.childNodes]) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
        const span = document.createElement('span'); span.className = 'wcl-private-name';
        node.replaceWith(span); span.append(node);
      }
    }
  }
  const weekday = cell => {
    const copy = cell.cloneNode(true); copy.querySelectorAll('.wcl-today-badge').forEach(el => el.remove());
    const day = copy.textContent.replace(/\s/g,'').match(/^([日月火水木金土])(?:曜日|曜)?$/)?.[1];
    return day ? '日月火水木金土'.indexOf(day) : -1;
  };
  function timetable() {
    const today = new Date().getDay();
    for (const table of document.querySelectorAll('table')) {
      const rows = [...table.rows].filter(row => row.closest('table') === table);
      const heading = rows.find(row => [...row.cells].filter(cell => weekday(cell) >= 0).length >= 3);
      if (!heading) continue;
      table.querySelectorAll('.wcl-today-heading,.wcl-today-cell,.wcl-other-day,.wcl-other-day-course').forEach(cell => cell.classList.remove('wcl-today-heading','wcl-today-cell','wcl-other-day','wcl-other-day-course'));
      table.querySelectorAll('.wcl-today-badge').forEach(badge => badge.remove());
      let column = -1; const grid = [], positions = new Map();
      for (const [r,row] of rows.entries()) {
        grid[r] ||= []; let c = 0;
        for (const cell of row.cells) {
          while (grid[r][c]) c++;
          positions.set(cell, {start:c,end:c+cell.colSpan});
          if (row === heading && weekday(cell) === today) column = c;
          const span = cell.rowSpan || rows.length-r;
          for (let y=r; y<Math.min(rows.length,r+span); y++) { grid[y] ||= []; for (let x=c; x<c+cell.colSpan; x++) grid[y][x] = cell; }
          c += cell.colSpan;
        }
      }
      table.dataset.wclCurrentDay = String(today);
      if (column < 0) continue;
      const header = [...heading.cells].find(cell => weekday(cell) === today);
      header.classList.add('wcl-today-heading');
      const dayColumns = new Set();
      for (const cell of heading.cells) if (weekday(cell) >= 0) {
        dayColumns.add(positions.get(cell).start);
        if (cell !== header) cell.classList.add('wcl-other-day');
      }
      const badge = document.createElement('span'); badge.className = 'wcl-today-badge'; badge.textContent = '今日'; header.append(badge);
      for (const row of rows.slice(rows.indexOf(heading)+1)) for (const cell of row.cells) {
        const pos = positions.get(cell);
        if (pos.start === column && pos.end === column+1) cell.classList.add('wcl-today-cell');
        else if (pos.end === pos.start+1 && dayColumns.has(pos.start)) {
          cell.classList.add('wcl-other-day');
          if (cell.textContent.replace(/\s|\u00a0/g,'') || cell.querySelector('a[href],button')) cell.classList.add('wcl-other-day-course');
        }
      }
    }
  }
  function observe() { observer.observe(document.documentElement,{childList:true,subtree:true}); }
  function update() {
    observer.disconnect(); header(); homeLibrary(); privateNames(); introduction(); timetable(); observe();
  }
  function schedule() { if (queued) return; queued = true; queueMicrotask(() => { queued = false; update(); }); }
  function nextDay() {
    clearTimeout(dayTimer); const next = new Date(); next.setHours(24,0,0,100);
    dayTimer = setTimeout(() => { update(); nextDay(); },Math.max(100,next-Date.now()));
  }
  globalThis.WebClassPageUI = Object.freeze({ update });
  let cached; try { cached = localStorage.getItem(cacheKey); } catch {}
  applyTheme(cached);
  chrome.storage.local.get({ [themeKey]:themes[0].id, [bannerKey]:'' }).then(data => {
    if (!selected) applyTheme(data[themeKey]);
    if (!bannerTouched) applyBanner(data[bannerKey]);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area !== 'local') return;
    if (changes[themeKey]) applyTheme(changes[themeKey].newValue);
    if (changes[bannerKey]) { bannerTouched = true; applyBanner(changes[bannerKey].newValue); }
  });
  observer = new MutationObserver(schedule);
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  document.addEventListener('click',event => { if (!event.target.closest('.wcl-theme-control')) closeThemes(); });
  document.addEventListener('focusin',event => { if (!event.target.closest('.wcl-theme-control')) closeThemes(); });
  document.addEventListener('visibilitychange',() => { if (!document.hidden) { update(); nextDay(); } });
  update(); nextDay();
})();
