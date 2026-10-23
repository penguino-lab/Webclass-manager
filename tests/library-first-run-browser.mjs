// Isolated profile, OPFS dummy folders, and synthetic public release metadata.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readdir, copyFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const output = resolve(source, '..', 'tmp', 'webclass-library-first-run');
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
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless: true, viewport: { width: 1440, height: 1000 },
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: [`--load-extension=${extension}`]
  });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const installed = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const url = worker.url().replace(/background.js$/, 'library.html');
  let remoteVersion = installed, requests = 0;
  await context.route('https://raw.githubusercontent.com/penguino-lab/Webclass-manager/main/manifest.json', route => {
    requests++;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ name: 'WebClass Library Manager', version: remoteVersion }) });
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
  await page.locator('#sidebar-settings').click();
  assert.equal(await page.locator('#settings-recursive').isChecked(), false);
  await page.locator('label.switch:has(#settings-recursive)').click();
  await page.waitForFunction(() => document.getElementById('count').textContent === '3個の項目');
  await page.locator('#all').click();
  await page.locator('.entry[data-path="数学/補足/深い資料.txt"]').waitFor();
  assert.equal(await page.locator('.entry').count(), 3);
  await page.reload(); await page.locator('#sidebar-settings').click();
  assert.equal(await page.locator('#settings-recursive').isChecked(), true);
  await page.locator('label.switch:has(#settings-recursive)').click();
  await page.waitForFunction(() => document.getElementById('count').textContent === '1個の項目');
  await page.locator('#all').click();
  assert.equal(await page.locator('.entry').count(), 1);
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
  console.log('PASS: first-run click/gesture, cancel/denied picker, empty folder, default depth, recursive toggle/reload, version banner/cache/dismiss/manual check, stable header, mobile layout.');
  console.log('Artifacts:', run);
} finally { await context?.close(); }
