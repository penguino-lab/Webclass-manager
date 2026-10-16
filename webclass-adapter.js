(() => {
  // Keep URL helpers in the same script as their consumers. Old registrations
  // and already-open tabs may inject the adapter without a separate helper file.
  const id = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value || '') ? value : '';
  const url = (value, base) => { try { return new URL(value, base); } catch { return null; } };
  const contextHelpers = Object.freeze({
    courseId(value, base) {
      const u = url(value, base); if (!u) return '';
      const candidates = [id(u.searchParams.get('group_id')), id(u.pathname.match(/\/course\.php\/([^/]+)/)?.[1])];
      const file = u.searchParams.get('file') || u.pathname;
      candidates.push(id(file.match(/\/(?:text|attach)\/\d{2,4}\/([^/]+)\//)?.[1]));
      const unique = [...new Set(candidates.filter(Boolean))];
      return unique.length === 1 ? unique[0] : '';
    },
    contentsId(value, base) {
      const u = url(value, base);
      return id(u?.searchParams.get('contents_id') || u?.searchParams.get('set_contents_id'));
    },
    usableName(value) {
      const s = String(value || '').replace(/\s+/g, ' ').trim();
      return Boolean(s && s.length <= 200 && !/^(webclass|ホーム|home|ログイン|login|コース一覧|時間割|教材一覧|ファイルのダウンロード|ダウンロード|download|pdf viewer|pdf\.js viewer)$/i.test(s));
    }
  });
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const usable = contextHelpers.usableName;
  globalThis.WebClassAdapter = {
    urlContext: contextHelpers,
    course(doc, custom = '') {
      const filePage = /\/(?:file_down|download|loadit)\.php(?:[/?]|$)/.test(doc.URL || '');
      const selectors = [custom, '[data-course-name]', '#course-name', '#course_name', '.course-name', '.course_name', '.course-title', '#WsTitle h1', '[aria-label="講義名"]', 'a[href*="course.php/"]:not([href*="/logout"])', filePage ? '' : 'h1'].filter(Boolean);
      for (const selector of selectors) {
        try {
          const el = doc.querySelector(selector);
          const text = clean(el?.getAttribute('data-course-name') || el?.textContent);
          const value = selector === '#WsTitle h1' ? text.replace(/^[>›»]\s*/, '') : text;
          if (usable(value)) {
            const id = contextHelpers.courseId(el?.href || doc.URL, doc.baseURI);
            return { name: value, source: selector, ...(id ? { id } : {}) };
          }
        } catch { /* Invalid university-specific selector: continue to fallbacks. */ }
      }
      // Download/PDF documents describe the file, not the lecture.
      if (filePage) return null;
      const title = clean(doc.title).replace(/\s*[-|｜–—:]\s*WebClass.*$/i, '').replace(/^WebClass\s*[-|｜–—:]\s*/i, '');
      return usable(title) ? { name: title, source: 'document.title（要確認）' } : null;
    },
    context(doc, custom = '') {
      const documents = [doc];
      const visit = win => {
        if (!win || documents.length >= 25) return;
        try {
          const child = win.document;
          if (new URL(child.URL).origin !== new URL(doc.URL).origin) return;
          if (!documents.includes(child)) documents.push(child);
          for (let i = 0; i < win.frames.length; i++) visit(win.frames[i]);
        } catch { /* Cross-origin frames are outside our scope. */ }
      };
      try { visit(doc.defaultView?.top); } catch {}
      const ids = documents.map(d => contextHelpers.courseId(d.URL)).filter(Boolean);
      const detected = documents.map(d => this.course(d, custom)).filter(Boolean);
      const ownId = contextHelpers.courseId(doc.URL);
      const uniqueIds = [...new Set([...ids, ...detected.map(c => c.id).filter(Boolean)])];
      const courseId = ownId || (uniqueIds.length === 1 ? uniqueIds[0] : '');
      const course = !ownId && uniqueIds.length > 1 ? null : detected.find(c => c.id && c.id === courseId) ||
        detected.find(c => c.source !== 'document.title（要確認）' && (c.source !== 'h1' || custom === 'h1') && (!c.id || c.id === courseId)) ||
        (courseId ? null : detected[0]) || null;
      let materialName = '', sectionName = '';
      for (const d of documents) {
        const material = d.querySelector?.('[data-material-name], #material-name, .material-name, #contents-name, .contents-name, #WsTitle h2');
        materialName ||= clean(material?.getAttribute('data-material-name') || material?.textContent);
        if (!materialName) {
          for (const el of d.querySelectorAll?.('h1,h2,h3,th,td,font,b,strong') || []) {
            const text = clean(el.textContent);
            if (/^第[0-9０-９一二三四五六七八九十]+回[^\n]{0,60}$/.test(text)) { materialName = text; break; }
          }
        }
        const row = d.querySelector?.('#TOC tr.bkkhaki, #TOC tr.active, #TOC tr[aria-current="true"]');
        const titleButton = row?.querySelector?.('.wcl-title-button');
        if (titleButton) {
          // UI fallback labels must not repeat the chapter/material in PDF names.
          const section = clean(row.querySelector('.wcl-section')?.textContent);
          const title = titleButton.hasAttribute('data-wcl-fallback') ? '' : clean(titleButton.textContent);
          sectionName ||= [section, title].filter(Boolean).join(' ') || (titleButton.getAttribute('data-wcl-fallback') === 'number' ? clean(titleButton.textContent) : '');
        } else sectionName ||= clean(row?.textContent).replace(/添付資料.*$/, '').replace(/\s*\d+\s*$/, '').trim();
      }
      return { course: course ? { ...course, ...(courseId ? { id: courseId } : {}) } : null, courseId,
        contentsId: contextHelpers.contentsId(doc.URL) || documents.map(d => contextHelpers.contentsId(d.URL)).find(Boolean) || '',
        materialName, sectionName };
    },
    directAction(event, doc, context) {
      if (event.type !== 'click' || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return null;
      const control = event.target.closest?.('a,button');
      if (!control) return null;
      try {
        const link = new URL(control.href || doc.URL, doc.baseURI);
        const page = new URL(doc.URL);
        if (control.href && link.origin === page.origin && /\/file_down\.php$/.test(link.pathname) && link.searchParams.get('target_type') === 'attach') {
          return { kind: 'attachment', url: link.href, name: link.searchParams.get('file_name') || '' };
        }
        if (['downloadButton', 'secondaryDownload'].includes(control.id) && /\/loadit\.php$/.test(page.pathname) && page.searchParams.get('action') === 'pdfViewer') {
          const file = page.searchParams.get('file');
          if (!file) return null;
          const pdf = new URL(file, page);
          if (pdf.origin !== page.origin || !pdf.pathname.toLowerCase().endsWith('.pdf')) return null;
          const stem = [context.materialName, context.sectionName].filter(Boolean).join('_') || `教材${context.contentsId ? '_' + context.contentsId.slice(0, 8) : ''}`;
          return { kind: 'pdf', url: pdf.href, name: stem + '.pdf' };
        }
      } catch {}
      return null;
    },
    downloadTarget(event, doc) {
      const a = event.target.closest?.('a[href]');
      if (!a) return null;
      try {
        const u = new URL(a.href, doc.baseURI);
        if (!['http:', 'https:'].includes(u.protocol)) return null;
        // The worker only acts if Chrome actually starts a download of this exact URL.
        return u.href;
      } catch { return null; }
    },
    downloadAction(event, doc) {
      const control = event.type === 'submit' ? event.submitter : event.target.closest?.('a,button,input[type="submit"],input[type="button"],[role="button"]');
      const label = clean(control?.textContent || control?.value || control?.getAttribute?.('aria-label'));
      const explicit = Boolean(control?.hasAttribute?.('download')) || /download|ダウンロード|添付資料|添付ファイル|資料を保存|ファイルを保存/i.test(label);
      let target = this.downloadTarget(event, doc);
      // Never read or serialize form fields.
      if (event.type === 'submit' && explicit) {
        try {
          const u = new URL(event.submitter?.formAction || event.target.action, doc.baseURI);
          if (['http:', 'https:'].includes(u.protocol)) target = u.href;
        } catch { /* Use only the full matching page referrer. */ }
      }
      return target || explicit ? { target, fallback: explicit } : null;
    }
  };
})();
