import assert from 'node:assert/strict';
import { join } from 'node:path';
function twoPagePDF(title = 'WebClass library preview') {
  const stream = `0.82 0.91 0.96 rg 0 0 595 842 re f 0 0 0 rg BT /F1 18 Tf 50 750 Td (${title}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  return pdf + `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
}
export async function checkLibrary(context, id, options, artifacts, errors) {
  await options.evaluate(async pdf => {
    const root = await navigator.storage.getDirectory(), course = await root.getDirectoryHandle('数学'), nested = await course.getDirectoryHandle('補足', { create: true });
    const write = async (dir, name, body) => { const file = await dir.getFileHandle(name, { create: true }), writable = await file.createWritable(); await writable.write(body); await writable.close(); };
    await write(course, '試験対策.pdf', pdf); await write(nested, '演習メモ.txt', '試験対策のメモ');
    await write(course, '第5回.pdf', pdf); await write(course, '第6回.pdf', pdf);
    await root.getDirectoryHandle('空フォルダ', { create: true });
    await write(course, '<script>資料.html', '<script>globalThis.libraryUnsafe = true</script><h1>テキストとして表示</h1>');
    await write(course, '未対応.docx', 'fixture'); await write(course, 'スライド.pptx', 'fixture'); await write(course, '集計.xlsx', 'fixture');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 80; canvas.getContext('2d').fillRect(10, 10, 60, 60);
    await write(course, '図.png', await (await fetch(canvas.toDataURL())).blob());
    const wave = new Uint8Array(44 + 8000), bytes = new DataView(wave.buffer), text = (offset, value) => [...value].forEach((ch, i) => wave[offset + i] = ch.charCodeAt(0));
    text(0, 'RIFF'); bytes.setUint32(4, wave.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true); bytes.setUint32(24, 8000, true); bytes.setUint32(28, 8000, true); bytes.setUint16(32, 1, true); bytes.setUint16(34, 8, true); text(36, 'data'); bytes.setUint32(40, 8000, true); wave.fill(128, 44);
    await write(course, '音声.wav', wave); await write(course, 'アンケート.csv', 'name,score\nA,10');
    await write(await root.getDirectoryHandle('統計学'), '補足.zip', 'fixture');
  }, twoPagePDF());
  const library = await context.newPage(); library.on('pageerror', error => errors.push(String(error)));
  await library.addInitScript(() => {
    const original = File.prototype.arrayBuffer; globalThis.pdfThumbnailReads = 0;
    File.prototype.arrayBuffer = function () { if (/\.pdf$/i.test(this.name)) globalThis.pdfThumbnailReads++; return original.call(this); };
  });
  const setTypes = async (...types) => {
    await library.locator('#clear-types').evaluate(button => button.click());
    for (const type of types) await library.locator(`#type-filters [data-type="${type}"]`).click();
  };
  const consoleErrors = []; library.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await library.setViewportSize({ width: 1440, height: 1000 });
  await library.goto(`chrome-extension://${id}/library.html`);
  await library.locator('#sidebar-settings').click();
  assert.equal(await library.locator('#settings-page').isVisible(), true);
  assert.equal(await library.locator('.sidebar').isVisible(), true);
  assert.equal(await library.locator('#choose-folder').count(), 0);
  assert.equal(await library.locator('#settings-enabled').isChecked(), true);
  assert.equal(await library.locator('#settings-course-names').isChecked(), true, 'course-name emphasis defaults to ON');
  assert.ok((await library.locator('#settings-site').inputValue()).startsWith('http://127.0.0.1:'));
  assert.match(await library.locator('#settings-folder-state').innerText(), /選択したフォルダー/);
  assert.equal(await library.locator('.topbar').evaluate(element => getComputedStyle(element).position), 'sticky', '設定画面でもヘッダーを固定する');
  await library.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  assert.ok((await library.locator('.topbar').boundingBox()).y <= 1, '設定画面をスクロールしてもヘッダーは上端に残る');
  await library.evaluate(() => scrollTo(0, 0));
  await library.screenshot({ path: join(artifacts, 'library-settings.png'), fullPage: true });
  await library.locator('#home').click();
  await library.waitForFunction(() => document.querySelectorAll('.entry[data-path="数学"] .folder-tile canvas').length === 4);
  await library.locator('.entry[data-path="統計学"] .folder-tile canvas').waitFor();
  assert.equal(await library.locator('.entry[data-path="数学"] .folder-tile').count(), 4);
  assert.equal(await library.locator('.entry[data-path="統計学"] .folder-tile').count(), 4);
  assert.ok(await library.locator('.entry[data-path="数学"] .folder-count').innerText().then(text => text.endsWith('件の資料')));
  const tile = library.locator('.entry[data-path="数学"] .folder-tile').first();
  const cover = library.locator('.entry[data-path="数学"] .entry-art');
  const geometry = await tile.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, fit: getComputedStyle(element.querySelector('canvas')).objectFit }));
  assert.ok(Math.abs(geometry.width - geometry.height) <= 1, 'folder quadrants are square');
  assert.equal(geometry.fit, 'cover');
  assert.ok(await cover.evaluate(element => Math.abs(element.clientWidth - element.clientHeight) <= 1));
  assert.equal(await library.locator('.brand-sub,.eyebrow,#tags-form,#pdf-controls').count(), 0);
  assert.equal(await library.locator('#sort').inputValue(), 'modified');
  assert.equal(await library.locator('#sort option').first().getAttribute('value'), 'modified');
  assert.equal(await library.locator('.entry[data-path="統計学"] .folder-tile .file-icon').innerText(), 'FILE', 'remaining cover slots show other real files');
  assert.equal(await library.locator('.entry[data-path="統計学"] .folder-tile:empty').count(), 2);
  await library.screenshot({ path: join(artifacts, 'library-folders.png'), fullPage: true });
  await setTypes('excel', 'word');
  assert.deepEqual(await library.locator('.entry').evaluateAll(items => items.map(item => item.dataset.path)), ['数学']);
  assert.equal(await library.locator('.entry .folder-count').innerText(), '2件の資料');
  assert.equal(await library.locator('.folder-tile.excel').count(), 1);
  assert.equal(await library.locator('.folder-tile.word').count(), 1);
  assert.equal(await library.locator('.folder-tile.pdf').count(), 0, 'excluded files never appear in covers');
  const palette = await library.locator('.folder-tile:not(:empty)').evaluateAll(tiles => tiles.map(tile => ({ type: tile.classList[1], color: getComputedStyle(tile.querySelector('.file-icon')).color, background: getComputedStyle(tile).backgroundColor })));
  assert.notEqual(palette[0].color, palette[1].color); assert.notEqual(palette[0].background, palette[1].background);
  await library.screenshot({ path: join(artifacts, 'library-filter-chips.png'), fullPage: true });
  await library.reload(); await library.locator('.folder-tile.excel').waitFor();
  assert.equal(await library.locator('#type-filters [aria-pressed=true]').count(), 2, 'multi-selection survives reload');
  await library.locator('#type-filters [data-type=word]').click();
  assert.equal(await library.locator('.entry .folder-count').innerText(), '1件の資料');
  assert.equal(await library.locator('.folder-tile.word').count(), 0);
  await setTypes('other');
  assert.equal(await library.locator('.entry[data-path="統計学"] .folder-count').innerText(), '1件の資料');
  assert.equal(await library.locator('.entry[data-path="統計学"] .folder-tile.pdf').count(), 0);
  assert.ok(await library.locator('.folder-tile.csv').count() > 0);
  await setTypes();
  assert.equal(await library.locator('#clear-types').isDisabled(), true);
  assert.equal(await library.locator('.entry[data-path="空フォルダ"]').count(), 1, 'clear restores empty folders');
  await library.locator('#list').click();
  await library.locator('.entry[data-path="数学"] .folder-tile canvas').first().waitFor();
  await library.screenshot({ path: join(artifacts, 'library-folder-list.png'), fullPage: true });
  await library.locator('#grid').click();
  await setTypes('pdf');
  assert.deepEqual((await library.locator('.entry').evaluateAll(items => items.map(item => item.dataset.path))).sort(), ['数学', '統計学']);
  await library.locator('.entry[data-path="数学"] .entry-info').click();
  assert.equal(await library.locator('.entry[data-path="数学/補足"]').count(), 0, 'folders without a matching PDF stay hidden');
  assert.ok(await library.locator('.entry-art.pdf').count() > 0);
  await library.locator('#home').click(); await setTypes();
  await library.locator('.entry[data-path="数学"] .entry-open').click();
  await library.locator('.entry[data-path="数学/補足"] .entry-open').click();
  await library.goBack(); await library.locator('.entry[data-path="数学/補足"]').waitFor();
  assert.equal(await library.locator('#heading').innerText(), '数学');
  await library.goBack(); await library.locator('.entry[data-path="数学"]').waitFor();
  await library.goForward(); await library.locator('.entry[data-path="数学/試験対策.pdf"]').waitFor();
  await library.reload(); await library.locator('.entry[data-path="数学/試験対策.pdf"]').waitFor();
  const openTab = async click => {
    const [tab] = await Promise.all([context.waitForEvent('page'), click()]);
    await tab.waitForURL(/^blob:/); return tab;
  };
  assert.deepEqual(await library.locator('#type-filters button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['PDF', 'PowerPoint', 'Word', 'Excel', 'その他']);
  assert.equal(await library.locator('.entry-parent').count(), 0, 'folder view omits duplicate folder names');
  const pagesBeforePreview = context.pages().length;
  await library.locator('.entry[data-path="数学/試験対策.pdf"] .entry-info').click();
  await library.locator('#detail-preview canvas').waitFor();
  assert.equal(await library.locator('#open-folder').isHidden(), true, 'フォルダ表示中は現在地への移動ボタンを隠す');
  assert.equal(context.pages().length, pagesBeforePreview, 'card text opens only a first-page preview');
  const pdfTab = await openTab(() => library.locator('.entry[data-path="数学/試験対策.pdf"] .entry-open').click());
  const data = await library.evaluate(async url => { const response = await fetch(url); return { type: response.headers.get('content-type'), text: (await response.text()).slice(0, 8) }; }, pdfTab.url());
  assert.equal(data.type, 'application/pdf'); assert.ok(data.text.startsWith('%PDF-'));
  await pdfTab.waitForLoadState('domcontentloaded');
  assert.equal(await pdfTab.locator('link[href$="/pdf_embedder.css"]').count(), 1, 'Chrome handles the new tab with its built-in PDF viewer');
  const viewerFrame = pdfTab.frames().find(frame => frame.url().includes('mhjfbmdgcfjbbpaeojofohoefgiehjai')) || await pdfTab.waitForEvent('framenavigated', { predicate: frame => frame.url().includes('mhjfbmdgcfjbbpaeojofohoefgiehjai'), timeout: 10000 });
  await viewerFrame.locator('pdf-viewer').waitFor();
  await viewerFrame.waitForFunction(() => document.querySelector('pdf-viewer')?.loadProgress_ === 100);
  await pdfTab.screenshot({ path: join(artifacts, 'library-pdf-tab.png') });
  await pdfTab.close();
  await library.locator('#detail-content').waitFor();
  const star = library.locator('.entry[data-path="数学/試験対策.pdf"] .entry-star');
  await star.click(); await library.waitForFunction(() => document.getElementById('favorite').getAttribute('aria-pressed') === 'true');
  assert.equal(context.pages().length, pagesBeforePreview, 'favorite toggles do not open a tab');
  await library.locator('.entry[data-path="数学/試験対策.pdf"] canvas.thumbnail').waitFor();
  await library.locator('.entry[data-path="数学/図.png"] img.thumbnail').waitFor();
  await library.screenshot({ path: join(artifacts, 'library.png'), fullPage: true });
  await library.locator('.entry[data-path="数学/未対応.docx"]').hover();
  assert.equal(await library.locator('.entry[data-path="数学/未対応.docx"] .entry-star').evaluate(el => getComputedStyle(el).opacity), '1');
  await library.locator('#favorites').click(); assert.equal(await library.locator('.entry').count(), 1);
  await library.reload(); await library.locator('#favorites').click(); await library.waitForFunction(() => document.querySelectorAll('.entry').length === 1);
  await library.locator('.entry-star').click();
  await library.waitForFunction(() => document.querySelector('.entry-star')?.getAttribute('aria-pressed') === 'false');
  assert.equal(await library.locator('.entry').count(), 1, 'unstarred favorite stays available to undo');
  await library.locator('#favorites').click();
  assert.equal(await library.locator('.entry').count(), 1, 'clicking the current menu keeps the undo opportunity');
  await library.locator('#refresh').click(); await library.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(await library.locator('.entry').count(), 1, 'refresh keeps this favorites visit');
  await library.locator('#list').click(); assert.equal(await library.locator('.entry').count(), 1);
  await library.locator('.entry canvas.thumbnail').waitFor();
  await library.locator('.entry-star').click();
  await library.waitForFunction(() => document.querySelector('.entry-star')?.getAttribute('aria-pressed') === 'true');
  await library.locator('.entry-star').click();
  await library.waitForFunction(() => document.querySelector('.entry-star')?.getAttribute('aria-pressed') === 'false');
  await library.locator('#all').click(); await library.locator('#favorites').click();
  assert.equal(await library.locator('.entry').count(), 0, 'leaving and returning applies the removal');
  await library.goBack(); await library.goBack();
  assert.equal(await library.locator('.entry').count(), 0, 'browser back starts a new favorites visit');
  await library.locator('#all').click();
  await library.locator('.entry[data-path="数学/試験対策.pdf"] .entry-star').click();
  await library.waitForFunction(() => document.querySelector('.entry[data-path="数学/試験対策.pdf"] .entry-star')?.getAttribute('aria-pressed') === 'true');
  await library.locator('#all').click(); await library.locator('#grid').click();
  assert.ok(await library.locator('.entry-parent').count() > 0, 'all files include folder names');
  for (const type of ['powerpoint', 'word', 'excel']) {
    await setTypes(type); assert.equal(await library.locator('.entry').count(), 1);
    await library.locator('.entry-info').click(); assert.equal(await library.locator('#open-file').isDisabled(), true, 'Office files are not opened as garbled text');
  }
  await setTypes(); await library.locator('#search').fill('演習'); assert.equal(await library.locator('.entry').count(), 1);
  await library.locator('#search').fill(''); await setTypes('other'); assert.equal(await library.locator('.entry').count(), 6);
  assert.ok((await library.locator('.entry[data-path="数学/アンケート.csv"] .entry-size').innerText()).startsWith('CSV'));
  assert.equal(await library.locator('.entry[data-path="数学/アンケート.csv"] .file-icon').innerText(), 'CSV');
  await library.locator('#search').fill('アンケート.csv');
  const csvTab = await openTab(() => library.locator('.entry-open').click());
  await csvTab.waitForLoadState('domcontentloaded'); assert.ok((await csvTab.locator('body').innerText()).includes('name,score')); await csvTab.close();
  await setTypes(); await library.locator('#search').fill('資料.html');
  const textTab = await openTab(() => library.locator('.entry-open').click());
  await textTab.waitForLoadState('domcontentloaded'); assert.equal(await textTab.locator('h1').count(), 0);
  assert.equal(await textTab.evaluate(() => globalThis.libraryUnsafe), undefined); await textTab.close();
  assert.equal(await library.evaluate(() => globalThis.libraryUnsafe), undefined, 'HTML is inert text');
  assert.equal(await library.locator('.entry script').count(), 0, 'filenames are inert');
  await library.locator('#search').fill('未対応'); await library.locator('.entry-open').click(); assert.equal(await library.locator('#open-file').isDisabled(), true);
  assert.equal(await library.locator('#open-folder').isVisible(), true, 'すべての資料では保存フォルダへ移動できる');
  await library.locator('#open-folder').click(); assert.equal(await library.locator('#heading').innerText(), '数学');
  await library.goBack(); await library.waitForFunction(() => document.getElementById('heading').textContent === 'すべての資料');
  assert.equal(await library.locator('#search').inputValue(), '未対応');
  await library.locator('#list').click(); assert.ok(await library.locator('#entries').evaluate(element => element.classList.contains('list')));
  await library.locator('#search').fill(''); await library.screenshot({ path: join(artifacts, 'library-list.png'), fullPage: true });
  await library.locator('.entry[data-path="数学/試験対策.pdf"] canvas.thumbnail').waitFor();
  await library.locator('.entry[data-path="数学/図.png"] img.thumbnail').waitFor();
  await library.locator('#search').fill(''); await library.locator('#home').click(); await library.locator('#grid').click();
  if (process.env.WEBCLASS_THUMBNAIL_TEST_PDF) {
    await options.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'large-pdf-fixture'; document.body.append(input); });
    await options.locator('#large-pdf-fixture').setInputFiles(process.env.WEBCLASS_THUMBNAIL_TEST_PDF);
    await options.evaluate(async () => {
      const root = await navigator.storage.getDirectory(), course = await root.getDirectoryHandle('大きい資料', { create: true });
      const handle = await course.getFileHandle('添付PDF.pdf', { create: true }), stream = await handle.createWritable();
      await stream.write(document.getElementById('large-pdf-fixture').files[0]); await stream.close(); document.getElementById('large-pdf-fixture').remove();
    });
    await library.locator('#refresh').click();
    await library.locator('.entry[data-path="大きい資料"] .folder-tile canvas').waitFor({ timeout: 60000 });
    await library.locator('.entry[data-path="大きい資料"] .entry-info').click();
    await library.locator('.entry[data-path="大きい資料/添付PDF.pdf"] canvas.thumbnail').waitFor({ timeout: 60000 });
    await library.locator('.entry-info').click(); await library.locator('#detail-preview canvas').waitFor({ timeout: 60000 });
    await library.screenshot({ path: join(artifacts, 'library-large-pdf.png'), fullPage: true });
    await library.locator('#home').click(); console.log('PASS: attached large PDF renders in folder cover, file card, and detail preview');
  }
  // Warm all PDFs, then prove a reload reuses persisted previews without reading PDF bytes.
  await library.locator('#all').click(); await setTypes(); await library.locator('#grid').click();
  const pdfCards = await library.locator('.entry:has(.entry-art.pdf)').evaluateAll(items => items.map(item => item.dataset.path));
  const ensurePDFs = async () => {
    for (const path of pdfCards) { const card = library.locator('.entry').filter({ has: library.locator('.entry-open[aria-label="Chromeで開く: ' + path + '"]') }); await card.scrollIntoViewIfNeeded(); await card.locator('canvas.thumbnail').waitFor(); }
  };
  await ensurePDFs();
  await library.waitForFunction(async paths => {
    const { scanDirectory } = await import(chrome.runtime.getURL('library-core.js')), { ThumbnailCache } = await import(chrome.runtime.getURL('library-thumbnail-cache.js'));
    const entries = (await scanDirectory(await navigator.storage.getDirectory())).entries, rootId = new URLSearchParams(location.hash.slice(1)).get('root'), cache = new ThumbnailCache();
    return (await Promise.all(paths.map(path => cache.get(rootId, entries.find(entry => entry.path === path))))).every(Boolean);
  }, pdfCards);
  await library.reload(); await library.locator('#all.active').waitFor(); await ensurePDFs();
  assert.equal(await library.evaluate(() => pdfThumbnailReads), 0, 'cached PDFs require no PDF byte reads after reload');
  const oldPixels = await library.locator('.entry[data-path="数学/試験対策.pdf"] canvas').evaluate(canvas => canvas.toDataURL());
  await options.evaluate(async pdf => {
    const course = await (await navigator.storage.getDirectory()).getDirectoryHandle('数学'), file = await course.getFileHandle('試験対策.pdf'), stream = await file.createWritable();
    await stream.write(pdf); await stream.close();
  }, twoPagePDF('UPDATED thumbnail cache invalidation'));
  await library.locator('#refresh').click(); await library.waitForFunction(() => !document.getElementById('refresh').disabled);
  await library.locator('.entry[data-path="数学/試験対策.pdf"]').scrollIntoViewIfNeeded();
  await library.locator('.entry[data-path="数学/試験対策.pdf"] canvas').waitFor();
  assert.notEqual(await library.locator('.entry[data-path="数学/試験対策.pdf"] canvas').evaluate(canvas => canvas.toDataURL()), oldPixels, 'modified files get a fresh preview');
  assert.equal(await library.evaluate(() => pdfThumbnailReads), 1, 'unchanged PDFs reuse their cached previews');
  await library.locator('#home').click();
  assert.equal(await library.locator('.entry').first().getAttribute('data-path'), '数学', 'newest descendant puts its folder first');
  console.log('PASS: persistent thumbnail cache on reload, invalidation of changed PDF, and newest-file folder sorting');
  // A cancelled picker never changes the configured destination.
  await library.evaluate(() => { window.showDirectoryPicker = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
  await library.locator('#sidebar-settings').click(); await library.locator('#settings-choose-folder').click();
  await library.locator('#home').click(); assert.ok(await library.locator('.entry[data-path="数学"]').count());
  // Simulate revoked permission in this page without changing the shared OPFS fixture.
  await library.evaluate(() => { globalThis.originalQuery = FileSystemDirectoryHandle.prototype.queryPermission; FileSystemDirectoryHandle.prototype.queryPermission = async () => 'prompt'; });
  await library.locator('#refresh').click(); await library.locator('#grant').waitFor({ state: 'visible' }); assert.equal(await library.locator('.entry').count(), 0);
  await library.evaluate(() => { FileSystemDirectoryHandle.prototype.queryPermission = globalThis.originalQuery; });
  await library.locator('#grant').click(); await library.locator('.entry[data-path="数学"]').waitFor();
  // Same-named roots get distinct metadata identities, then restore the real destination.
  const identities = await options.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), a = await root.getDirectoryHandle('A', { create: true }), b = await root.getDirectoryHandle('B', { create: true });
    const one = await a.getDirectoryHandle('Library', { create: true }), two = await b.getDirectoryHandle('Library', { create: true });
    const { rootIdentity } = await import(chrome.runtime.getURL('library-store.js'));
    return [await rootIdentity(one), await rootIdentity(two), await rootIdentity(one)];
  });
  assert.notEqual(identities[0], identities[1]); assert.equal(identities[0], identities[2]);
  await library.setViewportSize({ width: 390, height: 844 }); await library.screenshot({ path: join(artifacts, 'library-mobile.png'), fullPage: true });
  assert.ok(await library.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout has no page overflow');
  const cacheBounds = await library.evaluate(async () => {
    const { ThumbnailCache } = await import(chrome.runtime.getURL('library-thumbnail-cache.js')), cache = new ThumbnailCache();
    const rootId = 'cache-bound-fixture', small = new Blob(['fixture']);
    for (let i = 0; i < 140; i++) await cache.put(rootId, { path: i + '.pdf', size: i, modified: 1 }, small);
    const db = await new Promise(resolve => { const request = indexedDB.open('webclass-library-thumbnails', 1); request.onsuccess = () => resolve(request.result); });
    const records = () => new Promise(resolve => { const request = db.transaction('thumbnails').objectStore('thumbnails').getAll(); request.onsuccess = () => resolve(request.result); });
    const count = (await records()).length, large = new Blob([new Uint8Array(2 * 1024 * 1024)]);
    for (let i = 0; i < 13; i++) await cache.put(rootId, { path: 'large' + i + '.pdf', size: large.size, modified: 1 }, large);
    const bytes = (await records()).reduce((sum, record) => sum + record.blob.size, 0); db.close(); return { count, bytes };
  });
  assert.ok(cacheBounds.count <= 128); assert.ok(cacheBounds.bytes <= 24 * 1024 * 1024, 'persistent cache has bounded storage');
  const courseNames = [
    { title: 'デザインプロダクション演習', suffix: '(金1・金2、蓮池、2026年度後期前半)_yba815101' },
    { title: '化学熱力学(2a)', suffix: '(火3、有村、2026年度後期前半)_sba152309' },
    { title: '特別セミナー（Business Acceleration Program）', suffix: '（大久保、2026年度後期）_ymbz212008' },
    { title: 'Next PBL(1)', suffix: '' },
  ];
  const materialName = '演習(2a)(火3、有村、2026年度後期)_sba152309.pdf';
  await options.evaluate(async ({ courseNames, materialName, pdf }) => {
    const root = await navigator.storage.getDirectory();
    for (const course of courseNames) {
      const dir = await root.getDirectoryHandle(course.title + course.suffix, { create: true });
      const stream = await (await dir.getFileHandle(materialName, { create: true })).createWritable();
      await stream.write(pdf); await stream.close();
    }
  }, { courseNames, materialName, pdf: twoPagePDF('Course name display') });
  await library.setViewportSize({ width: 1440, height: 1000 });
  await library.locator('#refresh').click(); await library.waitForFunction(() => !document.getElementById('refresh').disabled);
  await library.locator('#home').click(); await setTypes(); await library.locator('#grid').click();
  for (const { title, suffix } of courseNames) {
    const name = title + suffix, cardName = library.locator(`.entry[data-path="${name}"] .entry-name`);
    assert.equal(await cardName.locator('.course-title').textContent(), title);
    assert.equal(await cardName.textContent(), name, 'no part of the folder name is removed');
    assert.equal(await cardName.locator('.course-suffix').count(), suffix ? 1 : 0);
    assert.equal(await library.locator(`#tree button[title="${name}"] .course-title`).textContent(), title);
    if (suffix) assert.equal(await cardName.locator('.course-suffix').evaluate(el => getComputedStyle(el).color), 'rgb(146, 153, 166)');
  }
  await library.screenshot({ path: join(artifacts, 'library-course-names.png'), fullPage: true });
  const course = courseNames[1], name = course.title + course.suffix;
  await library.locator('#list').click();
  assert.equal(await library.locator(`.entry[data-path="${name}"] .course-title`).textContent(), course.title);
  await library.screenshot({ path: join(artifacts, 'library-course-names-list.png'), fullPage: true });
  await library.locator(`.entry[data-path="${name}"] .entry-info`).click();
  assert.equal(await library.locator('#heading .course-title').textContent(), course.title);
  assert.equal(await library.locator('#heading .course-suffix').textContent(), course.suffix);
  assert.equal(await library.locator('#breadcrumbs button').last().locator('.course-title').textContent(), course.title);
  assert.equal(await library.locator('.entry-name .course-suffix').count(), 0, 'file names are never parsed as course names');
  await library.locator('.entry-info').click();
  assert.equal(await library.locator('#detail-path .course-title').textContent(), course.title);
  await library.locator('#sidebar-settings').click();
  const settingsBefore = await library.evaluate(() => chrome.storage.local.get('settings'));
  await library.locator('label.switch:has(#settings-course-names)').click();
  await library.waitForFunction(() => document.getElementById('heading').querySelector('.course-suffix') === null);
  assert.deepEqual(await library.evaluate(() => chrome.storage.local.get('settings')), settingsBefore, 'display preference does not modify saving/site settings');
  await library.reload(); await library.locator('#sidebar-settings').click();
  assert.equal(await library.locator('#settings-course-names').isChecked(), false, 'OFF persists across reload');
  await library.locator('#home').click();
  assert.equal(await library.locator('.entry-name .course-suffix').count(), 0);
  assert.equal(await library.locator('#tree .course-suffix').count(), 0);
  const secondLibrary = await context.newPage(); await secondLibrary.goto(`chrome-extension://${id}/library.html`);
  await secondLibrary.locator('.entry').first().waitFor();
  await library.locator('#sidebar-settings').click();
  await library.locator('label.switch:has(#settings-course-names)').click();
  await library.waitForFunction(() => document.querySelector('#tree .course-suffix') !== null);
  await secondLibrary.waitForFunction(() => document.querySelector('#tree .course-suffix') !== null);
  await secondLibrary.close();
  await library.screenshot({ path: join(artifacts, 'library-course-name-settings.png'), fullPage: true });
  await library.locator('#home').click(); await library.locator('#all').click();
  assert.ok(await library.locator('.entry-parent .course-suffix').count() > 0, 'containing-folder labels use the same styling');
  console.log('PASS: course metadata styling; title qualifiers preserved; grid/list/tree/heading/breadcrumb/details; default ON; immediate toggle; reload persistence; cross-tab update; original paths and file names preserved');
  assert.deepEqual(consoleErrors, [], 'library has no CSP or rendering errors');
  await library.close();
  console.log('PASS: four-part PDF folder covers; browser back/forward/reload; PDF opens in Chrome viewer; card preview without new tab; one-click favorites and undo until navigation; Office filters; search; inert HTML; containing-folder navigation; simplified controls; cancelled picker; lost permission/recovery; directory identities; mobile layout');
}
