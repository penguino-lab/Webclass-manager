import { createRequire } from 'node:module';
import { mkdir, mkdtemp, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createDemoServer } from './demo-server.js';
import { checkLibrary } from './library-browser.mjs';
import { checkMaterialVariants } from './material-browser.mjs';
import { checkCourse } from './course-browser.mjs';
import { checkPageUI } from './page-ui-browser.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const artifacts = resolve(source, '..', 'tmp', 'webclass-qa');
await mkdir(artifacts, { recursive: true });
const sandbox = await mkdtemp(join(artifacts, 'run-'));
await mkdir(join(sandbox, 'profile', 'Default'), { recursive: true });
await mkdir(join(sandbox, 'downloads'));
await writeFile(join(sandbox, 'profile', 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: join(sandbox, 'downloads'), prompt_for_download: false } }));
const extension = join(sandbox, 'extension'); await mkdir(extension);
const files = ['background.js', 'content.js', 'material-ui.js', 'course-ui.js', 'course-ui.css', 'core.js', 'resource-tools.js', 'webclass-adapter.js', 'directory-store.js', 'save-file.js', 'attachment-link.js', 'offscreen.html', 'offscreen.js', 'popup.html', 'popup.js', 'style.css', 'library.html', 'library.css', 'library.js', 'library-core.js', 'library-open.js', 'library-store.js', 'library-thumbnails.js', 'library-thumbnail-cache.js'];
files.push('typography.css','page-ui.css','page-themes.js','banner-crop.js','page-ui.js','theme-sync.js','extension-theme.css');
for (const file of files) await copyFile(join(source, file), join(extension, file));
await cp(join(source, 'vendor'), join(extension, 'vendor'), { recursive: true });
await cp(join(source, 'icons'), join(extension, 'icons'), { recursive: true });
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
// Fixture only: grant the dummy localhost site; never use a university account/profile.
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const server = createDemoServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}/webclass/`;
let context;
try {
  const browserChoice = process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' };
  context = await chromium.launchPersistentContext(join(sandbox, 'profile'), { ...browserChoice, headless: true, acceptDownloads: false, ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: [`--load-extension=${extension}`] });
  context.setDefaultTimeout(10000);
  context.on('console', msg => { if (msg.type() === 'error') console.error('Browser:', msg.text()); });
  let worker;
  for (let attempt = 0; attempt < 100 && !worker; attempt++) {
    for (const candidate of context.serviceWorkers()) {
      try { if (await candidate.evaluate(() => chrome.runtime.getManifest().name) === 'WebClass Library Manager') { worker = candidate; break; } } catch {}
    }
    if (!worker) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(worker, 'WebClass Library Manager service worker started');
  const id = worker.url().split('/')[2], options = await context.newPage();
  const errors = [];
  options.on('pageerror', error => errors.push(String(error)));
  await options.goto(`chrome-extension://${id}/library.html`);
  const iconDefinitions = await worker.evaluate(() => {
    const manifest = chrome.runtime.getManifest();
    return { icons:manifest.icons, action:manifest.action.default_icon };
  });
  assert.deepEqual(iconDefinitions.icons, iconDefinitions.action, 'extension and toolbar use the same artwork');
  for (const [size, path] of Object.entries(iconDefinitions.icons)) {
    const dimensions = await options.evaluate(async path => {
      const response = await fetch(chrome.runtime.getURL(path));
      const bitmap = await createImageBitmap(await response.blob());
      const dimensions = [bitmap.width, bitmap.height]; bitmap.close(); return dimensions;
    }, path);
    assert.deepEqual(dimensions, [Number(size), Number(size)], 'each manifest PNG loads at its declared size');
  }
  await options.locator('.brand-mark').evaluate(img => img.decode());
  assert.equal(await options.locator('.brand-mark').evaluate(img => img.naturalWidth), 128);
  const brandBox = await options.locator('.brand-mark').boundingBox();
  assert.equal(brandBox.width, 42); assert.equal(brandBox.height, 42);
  assert.deepEqual(await options.locator('link[rel="icon"]').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['icons/icon-16.png','icons/icon-32.png']);
  console.log('PASS: custom toolbar/extension PNGs load at all declared sizes; library brand and favicons use the same artwork');
  const cdp = await context.newCDPSession(options);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
  await options.locator('#sidebar-settings').click();
  await options.locator('#settings-site').fill(site);
  await options.locator('#library-settings-form button[type=submit]').click();
  await options.waitForFunction(() => document.getElementById('settings-status').textContent.includes('設定を保存しました'));
  let registered = [];
  for (let attempt = 0; attempt < 100 && !registered.length; attempt++) {
    registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    if (!registered.length) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.deepEqual(registered.find(script => script.id === 'webclass').js, ['webclass-adapter.js', 'material-ui.js', 'content.js']);
  const early = registered.find(script => script.id === 'webclass-course-ui');
  assert.equal(early.runAt, 'document_start'); assert.deepEqual(early.css, ['course-ui.css']);
  assert.deepEqual(early.js, ['course-ui.js']);
  const shared = registered.find(script => script.id === 'webclass-page-ui');
  assert.equal(shared.runAt, 'document_start'); assert.equal(shared.allFrames, true);
  assert.deepEqual(shared.css, ['page-ui.css']); assert.deepEqual(shared.matches, [site + '*']);
  assert.deepEqual(shared.js, ['page-themes.js','banner-crop.js','page-ui.js']);
  await checkPageUI(context, site, artifacts, worker);
  await checkCourse(context, site, artifacts);
  assert.equal(await options.locator('#selector').count(), 0);
  await options.screenshot({ path: join(artifacts, 'library-settings-initial.png'), fullPage: true });
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  assert.equal(await popup.locator('#choose-folder').count(), 1);
  assert.equal(await popup.locator('#course-form,#settings,#course-name').count(), 0);
  await popup.screenshot({ path: join(artifacts, 'popup.png'), fullPage: true }); await popup.close();
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(site + 'course.php/26math/');
  await page.locator('#material').click();
  const chapter = () => page.frames().find(frame => frame.url().includes('txtbk_show_chapter.php'));
  const viewer = () => page.frames().find(frame => frame.url().includes('action=pdfViewer'));
  for (let i = 0; i < 100 && !viewer(); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(viewer(), 'nested viewer exists');
  await worker.evaluate(() => chrome.storage.session.clear());
  // Starting on the material page must recover the lecture from a sibling frame.
  await page.reload();
  for (let i = 0; i < 100 && !viewer(); i++) await new Promise(resolve => setTimeout(resolve, 50));
  const detectedCourse = await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url });
    return chrome.tabs.sendMessage(tab.id, { type: 'current' }, { frameId: 0 });
  }, page.url());
  assert.equal(detectedCourse.name, '数学');
  assert.equal(detectedCourse.source, '#WsTitle h1');
  // The material names and row whitespace use the original WebClass navigation.
  const titles = chapter().locator('.wcl-title-button');
  await titles.last().waitFor();
  assert.equal(await titles.count(), 4);
  assert.equal(await chapter().locator('#naviLayout').isVisible(), false, 'redundant controls are hidden');
  const topBox = await chapter().locator('#top').boundingBox(), firstRowBox = await titles.first().boundingBox();
  assert.ok(topBox.height < 150 && firstRowBox.y <= topBox.y + topBox.height + 20, 'unused control space is reclaimed');
  await titles.nth(1).click();
  assert.equal(await chapter().locator('tr.bkkhaki').getAttribute('data-page'), '2');
  await titles.nth(2).focus(); await chapter().page().keyboard.press('Enter');
  assert.equal(await chapter().locator('tr.bkkhaki').getAttribute('data-page'), '3');
  await chapter().locator('.wcl-section').first().click();
  assert.equal(await chapter().locator('tr.bkkhaki').getAttribute('data-page'), '1');
  const attachmentBox = await chapter().locator('#attachment').boundingBox();
  const titleBox = await titles.last().boundingBox();
  assert.ok(attachmentBox.y >= titleBox.y + titleBox.height, 'attachment is below its title');
  assert.ok(attachmentBox.height >= 44 && titleBox.height >= 64, 'large click targets');
  const titleFrame = page.frames().find(frame => frame.url().includes('title_simple.php'));
  await titleFrame.locator('.wcl-close-material').waitFor();
  const closeBox = await titleFrame.locator('.wcl-close-material').boundingBox();
  assert.ok(closeBox.width >= 1200 && closeBox.height >= 50, 'whole header closes material');
  const cue = titleFrame.locator('#wcl-close-affordance');
  assert.equal(await cue.textContent(), '×資料を閉じる');
  const cueBox = await cue.boundingBox();
  assert.ok(cueBox.x <= closeBox.x + 16 && cueBox.width < 200 && cueBox.height >= 32, 'visible compact close cue at top left');
  assert.equal(await titleFrame.locator('.wcl-close-material').getAttribute('aria-label'), '資料を閉じる');
  assert.equal(await viewer().locator('#downloadButton').getAttribute('aria-label'), '表示中の教材（PDF）をダウンロード');
  await page.screenshot({ path: join(artifacts, 'material-controls.png'), fullPage: true });
  await checkMaterialVariants(context, worker, site, artifacts);
  const before = context.pages().length;
  await worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  await chapter().locator('#attachment').click();
  assert.equal(context.pages().length, before, 'attachment must not open a popup');
  const waitResult = async (...codes) => {
    for (let i = 0; i < 100; i++) {
      const result = await worker.evaluate(() => chrome.storage.session.get('lastResult'));
      if (codes.includes(result.lastResult?.code)) return result.lastResult;
      if (result.lastResult?.code === 'save-failed') throw Error(JSON.stringify(result));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log('Timed out session:', await worker.evaluate(() => chrome.storage.session.get(null)));
    console.log('Viewer:', viewer()?.url(), await viewer()?.locator('body').innerText());
    throw Error('save result timed out');
  };
  assert.equal((await waitResult('saved')).path, '数学/第4回_添付資料.pdf');
  assert.deepEqual(await chapter().locator('#webclass-save-notice button').allInnerTexts(), ['開く', '閉じる']);
  await chapter().locator('#webclass-save-notice').waitFor({ state: 'detached', timeout: 5000 });
  const attachment = await worker.evaluate(() => chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] }));
  assert.equal(attachment[0].state, 'complete');
  assert.ok(attachment[0].filename.endsWith('第4回_添付資料.pdf'));
  await worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  await viewer().locator('#downloadButton').click();
  assert.equal((await waitResult('saved')).path, '数学/第4回授業_第1節 授業資料.pdf');
  // Exercise the actual IndexedDB clone, offscreen document and file writer with an OPFS handle.
  // Native folder chooser interaction itself remains a manual check.
  assert.equal(await options.evaluate(() => typeof window.showDirectoryPicker), 'function');
  await options.evaluate(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
  await options.locator('#settings-choose-folder').click();
  await options.waitForFunction(() => document.getElementById('settings-folder-status').textContent === '保存先を変更しました。');
  await worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  await viewer().locator('#downloadButton').click(); await waitResult('saved');
  await worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  await viewer().locator('#downloadButton').click(); assert.equal((await waitResult('duplicate')).code, 'duplicate');
  assert.deepEqual(await viewer().locator('#webclass-save-notice button').allInnerTexts(), ['再ダウンロードする', '開く', '閉じる']);
  await viewer().locator('#webclass-save-notice button').first().click(); await waitResult('saved');
  const stored = await options.evaluate(async () => {
    const root = await navigator.storage.getDirectory(), folder = await root.getDirectoryHandle('数学');
    const values = [];
    for await (const [name, handle] of folder.entries()) values.push({ name, header: (await (await handle.getFile()).text()).slice(0, 8) });
    return values;
  });
  assert.deepEqual(stored.map(file => file.name).sort(), ['第4回授業_第1節 授業資料 (1).pdf', '第4回授業_第1節 授業資料.pdf']);
  assert.ok(stored.every(file => file.header.startsWith('%PDF-')));
  // A lost selected-directory handle must report a useful error, not silently save elsewhere.
  await options.evaluate(async () => { const { directoryHandle } = await import(chrome.runtime.getURL('directory-store.js')); await directoryHandle(null); });
  await worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  await viewer().locator('#downloadButton').click();
  let failed;
  for (let i = 0; i < 100; i++) {
    failed = (await worker.evaluate(() => chrome.storage.session.get('lastResult'))).lastResult;
    if (failed?.code === 'save-failed') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(failed.code, 'save-failed'); assert.match(failed.error, /保存先.*書き込み/);
  assert.deepEqual(await viewer().locator('#webclass-save-notice button').allInnerTexts(), ['開く', '閉じる']);
  // Re-selecting a folder restores the same handle and allows later saves.
  await options.locator('#settings-choose-folder').click();
  await options.waitForFunction(() => document.getElementById('settings-folder-status').textContent === '保存先を変更しました。');
  const second = await context.newPage(); await second.goto(site + 'course.php/26stats/'); await second.locator('#material').click();
  const secondChapter = () => second.frames().find(frame => frame.url().includes('txtbk_show_chapter.php'));
  for (let i = 0; i < 100 && !secondChapter(); i++) await new Promise(resolve => setTimeout(resolve, 50));
  await worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  await secondChapter().locator('#attachment').click(); assert.equal((await waitResult('saved')).path, '統計学/第4回_添付資料.pdf');
  await checkLibrary(context, id, options, artifacts, errors);
  await options.locator('label.switch:has(#settings-enabled)').click(); assert.equal(await options.locator('#settings-enabled').isChecked(), false);
  await options.locator('#library-settings-form button[type=submit]').click();
  await options.waitForFunction(() => document.getElementById('settings-status').textContent.includes('設定を保存しました'));
  await viewer().locator('#downloadButton').click();
  for (let i = 0; i < 100; i++) {
    const [native] = await worker.evaluate(() => chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] }));
    if (native?.filename.endsWith('0123456789abcdef0123456789abcdef.pdf') && native.state === 'complete') break;
    if (i === 99) throw Error('native OFF download timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.deepEqual(errors, []);
  // Clicking the far right of the header still calls the existing close handler.
  await titleFrame.locator('.wcl-close-material').click({ position: { x: closeBox.width - 12, y: 25 } });
  await page.waitForURL('**/course.php/26math/');
  const parser = await options.evaluate(async () => {
    const { attachmentLink } = await import(chrome.runtime.getURL('attachment-link.js'));
    const site = 'https://school.test/webclass/', page = site + 'file_down.php?file=dummy&contents_id=material';
    const good = '<a href="/webclass/download.php/test.pdf?file=dummy&amp;contents_id=material">test.pdf</a>';
    const result = attachmentLink(good, page, page, site);
    const rejected = [];
    for (const html of [good + good.replace('test.pdf', 'other.pdf'), good.replace('file=dummy', 'file=other'), good.replace('/webclass/download.php', 'https://outside.test/webclass/download.php'), '<h1>ログイン</h1>']) {
      try { attachmentLink(html, page, page, site); rejected.push(false); } catch { rejected.push(true); }
    }
    return { result, rejected };
  });
  assert.equal(parser.result.name, 'test.pdf'); assert.deepEqual(parser.rejected, [true, true, true, true]);
  console.log('PASS: real MV3 worker/offscreen; nested frames; attachment without popup; PDF naming; IndexedDB directory write; duplicate re-download; missing-directory failure/recovery; two courses; OFF; attachment identity/ambiguity checks');
  console.log('Settings screenshot: ' + join(artifacts, 'library-settings-initial.png'));
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
}
