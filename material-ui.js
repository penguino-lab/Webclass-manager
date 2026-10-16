(() => {
  if (globalThis.WebClassMaterialUI) return;
  const css = `
    .wcl-material-chapter #naviLayout,
    .wcl-material-chapter #top > hr,
    .wcl-material-chapter .wcl-outline-spacer { display:none!important; }
    .wcl-material-chapter #top { min-height:0!important; }
    #TOCLayout.wcl-material-list { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; padding:10px; }
    .wcl-material-list > tbody { display:grid; gap:10px; }
    .wcl-material-list tr.wcl-material-row { display:grid; grid-template-columns:52px minmax(0,1fr); min-height:72px; background:#fff; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; cursor:pointer; }
    .wcl-material-list tr.wcl-material-row:hover { background:#f0f6ff; border-color:#1365b5; }
    .wcl-material-list tr.wcl-material-row.bkkhaki,
    .wcl-material-list tr.wcl-material-row.active { background:#e6f1ff; border:2px solid #1365b5; }
    .wcl-material-list .wcl-section { grid-column:1; grid-row:1; align-self:center; padding:12px 4px 12px 10px!important; color:#536477; }
    .wcl-material-list .wcl-title-cell { grid-column:2; grid-row:1; padding:0!important; width:auto!important; min-width:0; }
    .wcl-material-list .wcl-title-button { display:block; width:100%; min-height:70px; padding:14px 12px; border:0; background:transparent; color:#123d68; text-align:left; font:600 15px/1.6 system-ui,sans-serif; cursor:pointer; white-space:normal; overflow-wrap:anywhere; }
    .wcl-material-list .wcl-title-button span { font:inherit; color:inherit; }
    .wcl-material-list .wcl-unused-cell { display:none; }
    .wcl-material-list tr.wcl-title-only { grid-template-columns:minmax(0,1fr); }
    .wcl-material-list .wcl-title-only .wcl-title-cell { grid-column:1 / -1; }
    .wcl-material-list .wcl-title-button:disabled { color:#64748b; cursor:default; }
    .wcl-material-list .wcl-attachments { grid-column:1 / -1; grid-row:2; padding:0 12px 12px!important; white-space:normal; }
    .wcl-material-list .wcl-attachments a { display:flex; align-items:center; justify-content:center; gap:8px; min-height:46px; box-sizing:border-box; width:100%; margin-top:4px; padding:10px 12px; border:1px solid #0c559b; border-radius:7px; background:#1365b5; color:#fff; text-decoration:none; font:600 14px/1.5 system-ui,sans-serif; white-space:normal; }
    .wcl-material-list .wcl-attachments a:hover { background:#0c477f; }
    .wcl-material-list .wcl-attachments img { width:20px; height:20px; }
    .wcl-material-list .wcl-title-button:focus-visible,
    .wcl-material-list .wcl-attachments a:focus-visible { outline:3px solid #e6a72b; outline-offset:-3px; }
    input.wcl-close-material { position:fixed!important; inset:0!important; display:block!important; box-sizing:border-box!important; width:100%!important; height:100%!important; margin:0!important; padding:0 16px!important; border:0!important; border-bottom:1px solid #cbd5e1!important; border-radius:0!important; background:#f8fafc!important; color:transparent!important; font:600 16px/1.4 system-ui,sans-serif!important; cursor:pointer!important; z-index:1000; }
    input.wcl-close-material:hover { background:#e6f1ff!important; }
    input.wcl-close-material:focus-visible { outline:3px solid #e6a72b!important; outline-offset:-4px; }
    .wcl-close-affordance { position:fixed; left:12px; top:50%; transform:translateY(-50%); display:inline-flex; align-items:center; gap:8px; box-sizing:border-box; height:34px; padding:0 12px; border:1px solid #9db5cc; border-radius:6px; background:#e8eef5; color:#123d68; font:600 14px/1.2 system-ui,sans-serif; box-shadow:0 1px 2px #123d6814; pointer-events:none; z-index:1001; }
    .wcl-close-icon { font-size:22px; font-weight:400; line-height:1; }
    body:has(input.wcl-close-material:hover) .wcl-close-affordance,
    body:has(input.wcl-close-material:focus-visible) .wcl-close-affordance { background:#d6e8ff; border-color:#1365b5; }
    button.wcl-pdf-download { display:inline-flex!important; align-items:center; justify-content:center; box-sizing:border-box!important; width:auto!important; min-width:260px!important; max-width:none!important; height:32px!important; padding:2px 12px 2px 32px!important; border:1px solid #0c559b!important; border-radius:5px!important; background:#1365b5!important; color:#fff!important; cursor:pointer; }
    button.wcl-pdf-download:hover { background:#0c477f!important; }
    button.wcl-pdf-download > span:not(.wcl-download-label) { display:none!important; }
    button.wcl-pdf-download::before { background-color:#fff!important; }
    button.wcl-pdf-download > span.wcl-download-label { display:inline!important; position:static!important; width:auto!important; height:auto!important; overflow:visible!important; font:600 13px/1.2 system-ui,sans-serif!important; white-space:nowrap; }
    button.wcl-pdf-download:focus-visible { outline:3px solid #e6a72b!important; outline-offset:-3px; }
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
  globalThis.WebClassMaterialUI = {
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
