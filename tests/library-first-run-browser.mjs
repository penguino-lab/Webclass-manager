// Isolated profile, OPFS dummy folders, and synthetic public release metadata.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readdir, copyFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const output = process.env.LIBRARY_TEST_OUTPUT ? resolve(process.env.LIBRARY_TEST_OUTPUT) : resolve(source, '..', 'tmp', 'webclass-library-first-run');
await mkdir(output, { recursive: true });
const run = await mkdtemp(join(output, 'run-')), extension = join(run, 'extension');
await mkdir(extension);
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile() && /\.(js|html|css|json)$/.test(entry.name)) await copyFile(join(source, entry.name), join(extension, entry.name));
}
for (const dir of ['icons', 'images']) await cp(join(source, dir), join(extension, dir), { recursive: true });
let context;
try {
  context = await chromium.launchPersistentContext(join(run, 'profile'), {
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chromium' }),
    headless: true, viewport: { width: 1440, height: 1000 },
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: [`--load-extension=${extension}`]
  });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const installed = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const url = worker.url().replace(/background.js$/, 'library.html');
  let remoteVersion = installed, requests = 0;
  await context.route('https://raw.githubusercontent.com/penguino-lab/Webclass-manager/main/manifest.json', route => {
    requests++;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ name: 'Webclass manager', version: remoteVersion }) });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(url);
  await page.locator('#choose-folder:visible').waitFor();
  assert.match(await page.locator('#folder-start-help').textContent(), /空の専用フォルダー/);
  await page.screenshot({ path: join(run, 'first-run.png'), fullPage: true });
  // Cancellation and a denied picker keep the actionable first-run panel.
  await page.evaluate(() => { window.showDirectoryPicker = async () => { throw new DOMException('cancel', 'AbortError'); }; });
  await page.locator('#choose-folder').click();
  await page.locator('#folder-choice-status').filter({ hasText: '選択を取り消しました' }).waitFor();
  assert.equal((await page.evaluate(() => chrome.storage.local.get('settings'))).settings.saveMode, 'browser');
  await page.evaluate(() => { window.showDirectoryPicker = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.locator('#choose-folder').click();
  await page.locator('#folder-choice-status').filter({ hasText: '保存先を変更できませんでした' }).waitFor();
  await page.evaluate(() => {
    window.showDirectoryPicker = async options => {
      window.pickerOptions = options; window.pickerGesture = navigator.userActivation.isActive;
      return (await navigator.storage.getDirectory()).getDirectoryHandle('WebClass資料', { create: true });
    };
  });
  await page.locator('#choose-folder').click();
  await page.locator('#empty-title').filter({ hasText: 'まだ資料がありません' }).waitFor();
  assert.equal(await page.locator('#choose-folder').isVisible(), false);
  assert.equal(await page.evaluate(() => window.pickerGesture), true);
  assert.equal(await page.evaluate(() => window.pickerOptions.mode), 'readwrite');
  assert.equal(await page.evaluate(() => chrome.storage.local.get('settings').then(r => r.settings.folderName)), 'WebClass資料');
  // Empty selection is usable. Later saves appear at the default course depth.
  await page.evaluate(async () => {
    const { directoryHandle } = await import(chrome.runtime.getURL('directory-store.js'));
    const root = await directoryHandle(), course = await root.getDirectoryHandle('数学', { create: true });
    const nested = await course.getDirectoryHandle('補足', { create: true });
    const deeper = await nested.getDirectoryHandle('さらに下', { create: true });
    for (const [dir, name] of [[course, '資料.txt'], [nested, '深い資料.txt'], [deeper, 'さらに深い資料.txt']]) {
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable(); await writable.write('dummy'); await writable.close();
    }
  });
  await page.locator('#refresh').click();
  await page.locator('.entry[data-path="数学"]').waitFor();
  await page.locator('#all').click();
  assert.equal(await page.locator('.entry').count(), 1);
  // A read grant alone is not enough for the selected save destination.
  // The recovery click asks once for read+write and keeps the stored handle.
  await page.evaluate(() => {
    window.originalQuery = FileSystemDirectoryHandle.prototype.queryPermission;
    window.originalRequest = FileSystemDirectoryHandle.prototype.requestPermission;
    window.testAccess = 'prompt'; window.testAnswer = 'denied'; window.accessRequests = [];
    FileSystemDirectoryHandle.prototype.queryPermission = async options => options.mode === 'readwrite' ? window.testAccess : 'granted';
    FileSystemDirectoryHandle.prototype.requestPermission = async options => {
      window.accessRequests.push({ ...options, gesture: navigator.userActivation.isActive });
      if (window.testAnswer === 'granted') window.testAccess = 'granted';
      return window.testAnswer;
    };
  });
  await page.locator('#refresh').click();
  await page.locator('#permission:visible').waitFor();
  assert.match(await page.locator('#permission').innerText(), /サイトアクセス時は常に許可/);
  await page.screenshot({ path: join(run, 'permission-guidance.png'), fullPage: true });
  await page.locator('#grant').click();
  await page.locator('#directory-permission-status').filter({ hasText: '許可されませんでした' }).waitFor();
  assert.equal(await page.locator('#grant').isEnabled(), true);
  await page.evaluate(() => { window.testAnswer = 'granted'; });
  await page.locator('#grant').click();
  await page.locator('#permission').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => window.accessRequests), [
    { mode: 'readwrite', gesture: true }, { mode: 'readwrite', gesture: true }
  ]);
  await page.evaluate(() => {
    FileSystemDirectoryHandle.prototype.queryPermission = window.originalQuery;
    FileSystemDirectoryHandle.prototype.requestPermission = window.originalRequest;
  });
  // Keep source paths intact, with compact labels only in the sidebar/all-files view.
  const courseTitle = '化学熱力学(2a)', courseSuffix = '(' + '担当者・'.repeat(24) + '教員、2026年度後期前半)_ABC123';
  const fullCourse = courseTitle + courseSuffix;
  await page.evaluate(async fullCourse => {
    const { directoryHandle } = await import(chrome.runtime.getURL('directory-store.js'));
    const course = await (await directoryHandle()).getDirectoryHandle(fullCourse, { create: true });
    for (const name of ['開ける.txt', '表.csv', 'Office.docx']) {
      const stream = await (await course.getFileHandle(name, { create: true })).createWritable(); await stream.write('dummy'); await stream.close();
    }
  }, fullCourse);
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  await page.locator('#home').click();
  const label = page.locator(`.entry[data-path="${fullCourse}"] .entry-name`);
  assert.equal(await label.locator('.course-title').textContent(), courseTitle);
  assert.equal(await label.textContent(), fullCourse);
  assert.equal(await label.evaluate(el => el.scrollHeight > el.clientHeight), true, 'long metadata is clamped');
  const checkColors = async () => {
    const colors = await label.evaluate(el => ({ ellipsis: getComputedStyle(el).color, suffix: getComputedStyle(el.querySelector('.course-suffix')).color, title: getComputedStyle(el.querySelector('.course-title')).color }));
    assert.equal(colors.ellipsis, colors.suffix, 'the browser-drawn ellipsis uses the muted metadata color');
    assert.notEqual(colors.title, colors.suffix, 'the actual course title stays emphasized');
  };
  await checkColors();
  assert.equal(await page.locator(`#tree button[title="${fullCourse}"] .tree-name`).textContent(), courseTitle);
  await page.screenshot({ path: join(run, 'course-ellipsis.png'), fullPage: true });
  for (const theme of ['forest', 'charcoal', 'default']) {
    await page.evaluate(theme => chrome.storage.local.set({ pageTheme: theme }), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.wclTheme === theme, theme);
    await checkColors();
  }
  await page.locator('#list').click();
  await checkColors();
  await page.locator('#all').click();
  const textCard = page.locator(`.entry[data-path="${fullCourse}/開ける.txt"]`);
  assert.equal(await textCard.locator('.entry-parent').textContent(), courseTitle);
  assert.equal(await page.locator('.entry-parent .course-suffix').count(), 0);
  const thumbnail = textCard.locator('.entry-open'), hint = thumbnail.locator('.entry-open-hint');
  assert.match(await thumbnail.getAttribute('title'), /Chromeで開く/);
  const originalSize = await thumbnail.boundingBox();
  await thumbnail.hover();
  await page.waitForFunction(() => [...document.querySelectorAll('.entry-open-hint')].some(el => getComputedStyle(el).opacity === '1'));
  assert.equal(await hint.evaluate(el => getComputedStyle(el).opacity), '1');
  assert.deepEqual(await thumbnail.boundingBox(), originalSize, 'hint is overlaid without moving the thumbnail');
  assert.equal(await page.locator(`.entry[data-path="${fullCourse}/Office.docx"] .entry-open-hint`).count(), 0);
  assert.equal(await page.locator(`.entry[data-path="${fullCourse}/表.csv"] .entry-open-hint`).count(), 1);
  await page.mouse.move(0, 0);
  await thumbnail.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  assert.equal(await thumbnail.evaluate(el => el.matches(':focus-visible')), true);
  await page.screenshot({ path: join(run, 'thumbnail-open-hint.png'), fullPage: true });
  await page.locator('#grid').click();
  await textCard.locator('.entry-open').hover();
  await page.screenshot({ path: join(run, 'thumbnail-open-hint-grid.png'), fullPage: true });
  await page.locator('#sidebar-settings').click();
  await page.locator('label.switch:has(#settings-course-names)').click();
  await page.waitForFunction(fullCourse => document.querySelector(`#tree button[title="${fullCourse}"] .tree-name`).textContent === fullCourse, fullCourse);
  await page.locator('#all').click();
  assert.equal(await textCard.locator('.entry-parent').textContent(), fullCourse, 'OFF restores the full original label');
  await page.locator('#sidebar-settings').click();
  await page.locator('label.switch:has(#settings-course-names)').click();
  await page.locator('#all').click();
  assert.equal(await textCard.locator('.entry-parent').textContent(), courseTitle);
  await page.reload();
  await textCard.waitFor();
  assert.equal(await textCard.locator('.entry-parent').textContent(), courseTitle, 'compact labels persist after reload');
  await page.locator('#sidebar-settings').click();
  assert.equal(await page.locator('#settings-recursive').isChecked(), false);
  await page.locator('label.switch:has(#settings-recursive)').click();
  await page.waitForFunction(() => document.getElementById('count').textContent === '6個の項目');
  await page.locator('#all').click();
  await page.locator('.entry[data-path="数学/補足/深い資料.txt"]').waitFor();
  assert.equal(await page.locator('.entry').count(), 6);
  await page.reload(); await page.locator('#sidebar-settings').click();
  assert.equal(await page.locator('#settings-recursive').isChecked(), true);
  await page.locator('label.switch:has(#settings-recursive)').click();
  await page.waitForFunction(() => document.getElementById('count').textContent === '4個の項目');
  await page.locator('#all').click();
  assert.equal(await page.locator('.entry').count(), 4);
  await page.locator('#sidebar-settings').click();
  await page.screenshot({ path: join(run, 'scan-settings.png'), fullPage: true });
  const headerHeight = await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().height);
  remoteVersion = '99.0.0';
  await page.locator('#check-update').click();
  await page.locator('#update-banner:visible').waitFor();
  assert.match(await page.locator('#update-message').textContent(), /99.0.0/);
  assert.equal(await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().height), headerHeight);
  assert.match(await page.locator('#update-banner a').getAttribute('href'), /^https:\/\/github.com\/penguino-lab\/Webclass-manager#/);
  const beforeReload = requests;
  await page.reload(); await page.locator('#update-banner:visible').waitFor();
  assert.equal(requests, beforeReload, 'cached update avoids another network request');
  await page.screenshot({ path: join(run, 'update-banner.png'), fullPage: true });
  await page.locator('#dismiss-update').click(); await page.reload();
  await page.locator('#all').waitFor();
  assert.equal(await page.locator('#update-banner').isVisible(), false);
  await page.locator('#sidebar-settings').click(); await page.locator('#check-update').click();
  await page.locator('#update-banner:visible').waitFor();
  await page.setViewportSize({ width: 480, height: 850 });
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().height), headerHeight);
  await page.screenshot({ path: join(run, 'mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  if (process.env.CHECK_LIVE_UPDATE === '1') {
    await context.unroute('https://raw.githubusercontent.com/penguino-lab/Webclass-manager/main/manifest.json');
    const live = await page.evaluate(async () => {
      const { createUpdateChecker } = await import(chrome.runtime.getURL('update-notice.js'));
      return createUpdateChecker({ storage: chrome.storage.local }).check({ force: true });
    });
    assert.equal(live.failed, false, 'public metadata is readable without extra host permissions');
    console.log('Live public version check:', live.version);
  }
  console.log('PASS: first-run folder setup; combined read/write grant and persistent-permission guidance; muted course ellipsis and compact labels; thumbnail hover/focus actions; recursive preference; update notices; stable header and mobile layout.');
  console.log('Artifacts:', run);
} finally { await context?.close(); }
