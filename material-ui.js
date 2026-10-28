(() => {
  if (globalThis.WebClassMaterialUI) return;
  const css = `
    .wcl-material-chapter #naviLayout,
    .wcl-material-chapter #top > hr,
    .wcl-material-chapter .wcl-outline-spacer { display:none!important; }
    .wcl-material-chapter #top { min-height:0!important; }
    .wcl-material-chapter { padding-bottom:84px!important; }
    #wcl-material-bulk { position:fixed; left:12px; right:12px; bottom:12px; z-index:100; box-sizing:border-box; width:calc(100% - 24px); min-height:48px; padding:12px; border:1px solid var(--wcl-hover,#0c559b); border-radius:7px; background:var(--wcl-accent,#1365b5); color:#fff; font:600 14px/1.5 system-ui,sans-serif; cursor:pointer; }
    #wcl-material-bulk:hover { background:var(--wcl-hover,#0c477f); }
    #wcl-material-bulk:disabled { opacity:.7; cursor:default; }
    #wcl-material-bulk:focus-visible { outline:3px solid var(--wcl-accent,#e6a72b); outline-offset:2px; }
    #TOCLayout.wcl-material-list { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; padding:10px; }
    .wcl-material-list > tbody { display:grid; gap:10px; }
    .wcl-material-list tr.wcl-material-row { display:grid; grid-template-columns:52px minmax(0,1fr); min-height:72px; background:var(--wcl-surface,#fff); border:1px solid var(--wcl-line,#cbd5e1); border-radius:10px; overflow:hidden; cursor:pointer; }
    .wcl-material-list tr.wcl-material-row:hover { background:var(--wcl-soft,#f0f6ff); border-color:var(--wcl-accent,#1365b5); }
    .wcl-material-list tr.wcl-material-row.bkkhaki,
    .wcl-material-list tr.wcl-material-row.active { background:var(--wcl-soft,#e6f1ff); border:2px solid var(--wcl-accent,#1365b5); }
    .wcl-material-list .wcl-section { grid-column:1; grid-row:1; align-self:center; padding:12px 4px 12px 10px!important; color:var(--wcl-muted,#536477); }
    .wcl-material-list .wcl-title-cell { grid-column:2; grid-row:1; padding:0!important; width:auto!important; min-width:0; }
    .wcl-material-list .wcl-title-button { display:block; width:100%; min-height:70px; padding:14px 12px; border:0; background:transparent; color:var(--wcl-ink,#123d68); text-align:left; font:600 15px/1.6 system-ui,sans-serif; cursor:pointer; white-space:normal; overflow-wrap:anywhere; }
    .wcl-material-list .wcl-title-button span { font:inherit; color:inherit; }
    .wcl-material-list .wcl-unused-cell { display:none; }
    .wcl-material-list tr.wcl-title-only { grid-template-columns:minmax(0,1fr); }
    .wcl-material-list .wcl-title-only .wcl-title-cell { grid-column:1 / -1; }
    .wcl-material-list .wcl-title-button:disabled { color:var(--wcl-muted,#64748b); cursor:default; }
    .wcl-material-list .wcl-attachments { grid-column:1 / -1; grid-row:2; padding:0 12px 12px!important; white-space:normal; }
    .wcl-material-list .wcl-attachments a { display:flex; align-items:center; justify-content:center; gap:8px; min-height:46px; box-sizing:border-box; width:100%; margin-top:4px; padding:10px 12px; border:1px solid var(--wcl-hover,#0c559b); border-radius:7px; background:var(--wcl-accent,#1365b5); color:#fff; text-decoration:none; font:600 14px/1.5 system-ui,sans-serif; white-space:normal; }
    .wcl-material-list .wcl-attachments a:hover { background:var(--wcl-hover,#0c477f); }
    .wcl-material-list .wcl-attachments img { width:20px; height:20px; }
    .wcl-material-list .wcl-title-button:focus-visible,
    .wcl-material-list .wcl-attachments a:focus-visible { outline:3px solid var(--wcl-accent,#e6a72b); outline-offset:-3px; }
    input.wcl-close-material { position:fixed!important; inset:0!important; display:block!important; box-sizing:border-box!important; width:100%!important; height:100%!important; margin:0!important; padding:0 16px!important; border:0!important; border-bottom:1px solid var(--wcl-line,#cbd5e1)!important; border-radius:0!important; background:var(--wcl-canvas,#f8fafc)!important; color:transparent!important; font:600 16px/1.4 system-ui,sans-serif!important; cursor:pointer!important; z-index:1000; }
    input.wcl-close-material:hover { background:var(--wcl-soft,#e6f1ff)!important; }
    input.wcl-close-material:focus-visible { outline:3px solid var(--wcl-accent,#e6a72b)!important; outline-offset:-4px; }
    .wcl-close-affordance { position:fixed; left:12px; top:50%; transform:translateY(-50%); display:inline-flex; align-items:center; gap:8px; box-sizing:border-box; height:34px; padding:0 12px; border:1px solid var(--wcl-line,#9db5cc); border-radius:6px; background:var(--wcl-heading,#e8eef5); color:var(--wcl-ink,#123d68); font:600 14px/1.2 system-ui,sans-serif; box-shadow:0 1px 2px #123d6814; pointer-events:none; z-index:1001; }
    .wcl-close-icon { font-size:22px; font-weight:400; line-height:1; }
    body:has(input.wcl-close-material:hover) .wcl-close-affordance,
    body:has(input.wcl-close-material:focus-visible) .wcl-close-affordance { background:var(--wcl-soft,#d6e8ff); border-color:var(--wcl-accent,#1365b5); }
    button.wcl-pdf-download { display:inline-flex!important; align-items:center; justify-content:center; box-sizing:border-box!important; width:auto!important; min-width:260px!important; max-width:none!important; height:32px!important; padding:2px 12px 2px 32px!important; border:1px solid var(--wcl-hover,#0c559b)!important; border-radius:5px!important; background:var(--wcl-accent,#1365b5)!important; color:#fff!important; cursor:pointer; }
    button.wcl-pdf-download:hover { background:var(--wcl-hover,#0c477f)!important; }
    button.wcl-pdf-download > span:not(.wcl-download-label) { display:none!important; }
    button.wcl-pdf-download::before { background-color:#fff!important; }
    button.wcl-pdf-download > span.wcl-download-label { display:inline!important; position:static!important; width:auto!important; height:auto!important; overflow:visible!important; font:600 13px/1.2 system-ui,sans-serif!important; white-space:nowrap; }
    button.wcl-pdf-download:focus-visible { outline:3px solid var(--wcl-accent,#e6a72b)!important; outline-offset:-3px; }
    @media (max-width:1100px) { button.wcl-pdf-download { width:240px!important; min-width:240px!important; } button.wcl-pdf-download > span.wcl-download-label { font-size:12px!important; line-height:1.1!important; white-space:normal; word-break:keep-all; } }
  `;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function chapter() {
    const table = document.querySelector('#TOCLayout');
    if (!table) return;
    document.body?.classList.add('wcl-material-chapter');
    for (const spacer of document.querySelectorAll('#TOC > div')) {
      if (!clean(spacer.textContent) && !spacer.children.length) spacer.classList.add('wcl-outline-spacer');
    }
    table.classList.add('wcl-material-list');
    if (!document.getElementById('wcl-material-bulk')) {
      const bulk = document.createElement('button');
      bulk.type = 'button'; bulk.id = 'wcl-material-bulk';
      bulk.textContent = 'この教材の資料を一括ダウンロード';
      bulk.addEventListener('click', () => {
        if (bulk.disabled) return;
        bulk.disabled = true;
        document.dispatchEvent(new CustomEvent('webclass-library-bulk-download'));
      });
      document.body.append(bulk);
    }
    // Chapter-only and unnamed sections use the same native navigation controls.
    // Some WebClass versions omit data-page, so use the controls to find rows.
    const rows = Array.from(table.rows).filter(row => row.querySelector('input[name="clickpage"],button[name="clickpage"]'));
    for (const [index, row] of rows.entries()) {
      const native = row.querySelector('input[name="clickpage"],button[name="clickpage"]');
      if (!native || row.classList.contains('wcl-material-row')) continue;
      const cells = Array.from(row.cells);
      const nativeCell = native.closest('td');
      const titleCell = cells[cells.indexOf(nativeCell) - 1];
      if (!titleCell) continue;
      const sectionCell = cells[cells.indexOf(titleCell) - 1];
      row.classList.add('wcl-material-row');
      titleCell.classList.add('wcl-title-cell');
      sectionCell?.classList.add('wcl-section');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'wcl-title-button';
      button.disabled = native.disabled;
      button.append(...titleCell.childNodes); titleCell.append(button);
      if (!clean(button.textContent)) {
        const section = clean(sectionCell?.textContent);
        const material = rows.length === 1 ? clean(document.querySelector('#WsTitle h2')?.textContent) : '';
        const number = clean(native.value || row.getAttribute('data-page')) || String(index + 1);
        const label = material || section || `教材 ${number}`;
        button.setAttribute('data-wcl-fallback', material ? 'material' : section ? 'section' : 'number');
        button.querySelectorAll('br').forEach(br => br.remove());
        button.append(document.createTextNode(label));
        if (!section || label === section) {
          row.classList.add('wcl-title-only');
          sectionCell?.classList.add('wcl-unused-cell');
        }
      }
      const navigate = () => { if (!native.disabled) native.click(); };
      button.addEventListener('click', navigate);
      row.addEventListener('click', event => {
        if (!event.target.closest('a,button,input,select,textarea')) navigate();
      });
      for (const cell of cells) {
        if (cell === titleCell || cell === sectionCell) continue;
        if (cell.querySelector('a[href*="file_down.php"]')) {
          cell.classList.add('wcl-attachments');
          for (const link of cell.querySelectorAll('a[href*="file_down.php"]')) {
            // Keep the original link and inline popup handler for native fallback.
            for (const node of link.childNodes) {
              if (node.nodeType === 3 && node.textContent.includes('添付資料') && !node.textContent.includes('ダウンロード')) node.textContent = node.textContent.replace('添付資料', '添付資料をダウンロード');
            }
          }
        } else cell.classList.add('wcl-unused-cell');
      }
    }
  }
  function viewer() {
    const page = new URL(document.URL);
    if (!page.pathname.endsWith('/loadit.php') || page.searchParams.get('action') !== 'pdfViewer') return;
    const button = document.getElementById('downloadButton');
    if (!button || button.classList.contains('wcl-pdf-download')) return;
    button.classList.add('wcl-pdf-download');
    const label = '表示中の教材（PDF）をダウンロード';
    button.title = label; button.setAttribute('aria-label', label);
    const span = document.createElement('span');
    span.className = 'wcl-download-label';
    span.append(document.createTextNode('表示中の教材（PDF）を'), document.createElement('wbr'), document.createTextNode('ダウンロード'));
    // PDF.js can localize its original label later; our label stays independent.
    button.append(span);
  }
  function closeHeader() {
    const native = document.querySelector('#ContentQuitMenu input[name="quit_contents"]');
    if (!native) return;
    native.classList.add('wcl-close-material');
    native.setAttribute('aria-label', '資料を閉じる');
    native.title = '資料を閉じる';
    if (!document.getElementById('wcl-close-affordance')) {
      const hint = document.createElement('span');
      hint.id = 'wcl-close-affordance'; hint.className = 'wcl-close-affordance'; hint.setAttribute('aria-hidden', 'true');
      const icon = document.createElement('span'); icon.className = 'wcl-close-icon'; icon.textContent = '×';
      hint.append(icon, document.createTextNode('資料を閉じる'));
      // The native button owns the entire hit area, including this visual cue.
      (document.body || document.documentElement).append(hint);
    }
  }
  function materialSnapshot() {
    const found = [], documents = [];
    let ready = true;
    const visit = win => {
      try {
        const doc = win.document, page = new URL(doc.URL);
        if (page.origin !== location.origin) return;
        documents.push(doc);
        if (doc.readyState && doc.readyState !== 'complete') ready = false;
        if (page.pathname.endsWith('/loadit.php') && page.searchParams.get('action') === 'pdfViewer') {
          const file = page.searchParams.get('file');
          if (file) {
            const url = new URL(file, page);
            if (url.origin === page.origin && url.pathname.toLowerCase().endsWith('.pdf')) found.push(url.href);
          }
        }
        for (let i = 0; i < win.frames.length; i++) visit(win.frames[i]);
      } catch { ready = false; /* Do not reuse a PDF while a frame is navigating. */ }
    };
    visit(window.top.frames.webclass_content || window.top);
    return { urls: [...new Set(found)], documents, ready };
  }
  async function collectChapterPDFs(report = () => {}) {
    const controls = [...document.querySelectorAll('#TOCLayout input[name="clickpage"],#TOCLayout button[name="clickpage"]')].filter(el => !el.disabled);
    const original = controls.find(el => el.closest('tr').matches('.bkkhaki,.active,[aria-current="true"]'));
    const resources = [];
    let changed = false;
    try {
      for (const [index, control] of controls.entries()) {
        report(index + 1, controls.length);
        const row = control.closest('tr');
        const current = row.matches('.bkkhaki,.active,[aria-current="true"]');
        const previous = materialSnapshot();
        if (!current) { control.click(); changed = true; }
        let urls = [], stable = null, stableSince = 0, loaded = false;
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 150));
          const next = materialSnapshot(), key = next.urls.join('|');
          const navigated = next.documents.some(doc => !previous.documents.includes(doc));
          if (next.ready && (current || navigated)) {
            if (key !== stable) { stable = key; stableSince = Date.now(); }
            if (Date.now() - stableSince >= 450) { urls = next.urls; loaded = true; break; }
          } else { stable = null; stableSince = 0; }
        }
        // A loaded chapter may contain attachments or HTML and no PDF at all.
        if (!loaded) {
          const error = Error('章の読み込みを確認できませんでした。確認済みのPDFと添付資料を保存します。');
          error.resources = resources;
          throw error;
        }
        const material = clean(document.querySelector('#WsTitle h2')?.textContent) || '教材';
        const section = [clean(row.querySelector('.wcl-section')?.textContent), clean(row.querySelector('.wcl-title-button')?.textContent)].filter(Boolean).join(' ');
        for (const url of urls) resources.push({ kind: 'pdf', url, name: [material, section].filter(Boolean).join('_') + '.pdf' });
      }
      return resources;
    } finally {
      if (changed && original?.isConnected && !original.disabled) original.click();
    }
  }
  globalThis.WebClassMaterialUI = {
    collectChapterPDFs,
    update() {
      const relevant = document.querySelector('#TOCLayout, #ContentQuitMenu input[name="quit_contents"], #downloadButton');
      if (!relevant) return;
      let style = document.getElementById('wcl-material-style');
      if (!style) {
        style = document.createElement('style'); style.id = 'wcl-material-style';
        (document.head || document.documentElement).append(style);
      }
      if (style.textContent !== css) style.textContent = css;
      chapter(); viewer(); closeHeader();
    }
  };
})();
