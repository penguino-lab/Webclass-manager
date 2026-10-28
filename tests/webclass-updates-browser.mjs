// Isolated extension profile and a synthetic local WebClass. No university data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import http from 'node:http';
import { courseFixture } from './course-fixture.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const output = process.env.LIBRARY_TEST_OUTPUT ? resolve(process.env.LIBRARY_TEST_OUTPUT) : resolve(source, '..', 'tmp', 'webclass-updates');
await mkdir(output, { recursive: true });
const run = await mkdtemp(join(output, 'run-')), extension = join(run, 'extension');
await mkdir(extension);
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile() && /\.(js|html|css|json)$/.test(entry.name)) await copyFile(join(source, entry.name), join(extension, entry.name));
}
for (const dir of ['icons', 'images']) await cp(join(source, dir), join(extension, dir), { recursive: true });
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
manifest.background.service_worker = 'test-background.js';
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
// Stub only the remote metadata transport before the actual worker imports it.
await writeFile(join(extension, 'test-background.js'), "import './test-transport.js'; import './background.js';");
await writeFile(join(extension, 'test-transport.js'), `
  globalThis.releaseCalls = 0; globalThis.remoteVersion = chrome.runtime.getManifest().version;
  globalThis.fetch = async () => {
    globalThis.releaseCalls++;
    if (globalThis.holdRelease) await new Promise(resolve => { globalThis.releaseFetch = resolve; });
    return { ok: true, json: async () => ({ name: 'Webclass manager', version: globalThis.remoteVersion }) };
  };
`);
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html><body>' + (req.url.includes('frame.html') ? '<nav class="navbar">Frame</nav>'
    : courseFixture().replace('<nav>', '<nav class="navbar navbar-default">') + '<iframe title="dummy material" src="/webclass/frame.html"></iframe>') + '</body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}/webclass/`;
let context;
try {
  context = await chromium.launchPersistentContext(join(run, 'profile'), {
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chromium' }),
    headless: true, viewport: { width: 1440, height: 1000 },
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: [`--load-extension=${extension}`]
  });
  context.setDefaultTimeout(10000);
  await context.addInitScript(() => sessionStorage.setItem('wcl-course-filters', JSON.stringify({ availableOnly: false, periodOnly: false })));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await assertEventually(async () => worker.evaluate(async () => {
    try { await chrome.contextMenus.update('webclass-open-library', { title: 'ライブラリを開く' }); return true; } catch { return false; }
  }));
  await worker.evaluate(async site => {
    await chrome.storage.local.set({ settings: { site, enabled: true } });
  }, site);
  await assertEventually(async () => (await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 4);
  let libraryRequests = 0;
  await context.route('https://raw.githubusercontent.com/penguino-lab/Webclass-manager/main/manifest.json', route => {
    libraryRequests++;
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ name: 'Webclass manager', version: '99.0.2' }) });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(site + 'course.php/26demo/');
  await page.locator('.wcl-course-card.wcl-unavailable').first().waitFor();
  await assertEventually(async () => worker.evaluate(async () => !!(await chrome.storage.local.get('publicReleaseCheck')).publicReleaseCheck));
  assert.equal(await worker.evaluate(() => releaseCalls), 1);
  assert.equal(await page.locator('#wcl-release-notice:visible').count(), 0);
  const geometry = () => page.evaluate(() => ({ nav: document.querySelector('.navbar').getBoundingClientRect().height, contents: document.querySelector('.cm-contentsList').getBoundingClientRect().top }));
  const before = await geometry();
  // Expire only metadata, then keep the remote reply pending during both navigations.
  await worker.evaluate(async () => {
    globalThis.remoteVersion = '99.0.0'; globalThis.holdRelease = true;
    const { publicReleaseCheck } = await chrome.storage.local.get('publicReleaseCheck');
    await chrome.storage.local.set({ publicReleaseCheck: { ...publicReleaseCheck, attemptedAt: Date.now() - 60001 } });
  });
  await page.goto(site + 'course.php/26demo/?again=1');
  await page.locator('.wcl-course-card.wcl-unavailable').first().waitFor();
  await assertEventually(async () => worker.evaluate(() => releaseCalls === 2 && !!globalThis.releaseFetch));
  const library = await context.newPage(); library.on('pageerror', error => errors.push(String(error)));
  await library.goto(new URL('library.html', worker.url()).href);
  await library.locator('#choose-folder:visible').waitFor();
  assert.equal(await library.locator('#header-version').textContent(), 'v' + manifest.version);
  assert.equal(await library.locator('#header-version').isVisible(), true);
  assert.equal(libraryRequests, 0, 'library shares the background lock instead of starting another fetch');
  await worker.evaluate(() => { globalThis.holdRelease = false; globalThis.releaseFetch(); });
  const notice = page.locator('#wcl-release-notice');
  await notice.waitFor({ state: 'visible' }); await library.locator('#update-banner:visible').waitFor();
  assert.deepEqual(await geometry(), before, 'update notice does not move the header or materials');
  assert.match(await notice.textContent(), /99.0.0/);
  assert.equal(await notice.locator('a').getAttribute('href'), 'https://github.com/penguino-lab/Webclass-manager#更新方法');
  assert.ok((await notice.boundingBox()).y >= before.nav);
  assert.equal(await page.frameLocator('iframe').locator('#wcl-release-notice').count(), 0, 'no duplicated notices in material frames');
  // Theme utility colors must not restore saturated/white unavailable rows.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-contents-id="expired"]')).backgroundColor === 'rgb(236, 238, 240)');
  for (const theme of ['default', 'forest', 'charcoal', 'red', 'lightblue', 'silver', 'gold']) {
    await worker.evaluate(pageTheme => chrome.storage.local.set({ pageTheme }), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.wclTheme === theme, theme);
    const colors = await page.locator('[data-contents-id="expired"]').evaluate(el => ({
      background: getComputedStyle(el).backgroundColor, title: getComputedStyle(el.querySelector('h4')).color,
      inner: getComputedStyle(el.querySelector('.cl-contentsList_content')).backgroundColor,
      filter: getComputedStyle(el).filter, link: getComputedStyle(el.querySelector('.detail')).pointerEvents
    }));
    assert.equal(colors.background, 'rgb(236, 238, 240)'); assert.equal(colors.title, 'rgb(133, 139, 147)');
    assert.equal(colors.inner, 'rgba(0, 0, 0, 0)'); assert.equal(colors.filter, 'grayscale(1)'); assert.notEqual(colors.link, 'none');
    if (['default', 'forest', 'charcoal'].includes(theme)) await page.screenshot({ path: join(run, `webclass-${theme}.png`), fullPage: true });
  }
  await page.locator('[data-contents-id="expired"] .detail').click();
  assert.equal(await page.evaluate(() => window.details), 1, 'native details still works on unavailable rows');
  await notice.locator('button').click();
  await library.locator('#update-banner').waitFor({ state: 'hidden' });
  await page.reload(); await page.locator('.wcl-course-card').first().waitFor();
  assert.equal(await page.locator('#wcl-release-notice:visible').count(), 0);
  assert.equal(await worker.evaluate(() => releaseCalls), 2, 'reload uses the one-minute cache');
  await worker.evaluate(() => chrome.storage.local.set({ publicReleaseCheck: { version: '99.0.1', attemptedAt: Date.now(), failed: false } }));
  await notice.waitFor({ state: 'visible' }); await library.locator('#update-banner:visible').waitFor();
  await library.locator('#sidebar-settings').click(); await library.locator('#check-update').click();
  await notice.filter({ hasText: '99.0.2' }).waitFor();
  assert.equal(libraryRequests, 1, 'explicit settings check can refresh immediately');
  assert.equal(await library.locator('#header-version').textContent(), 'v' + manifest.version, 'header always shows installed version');
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0));
  const mobileBox = await notice.boundingBox(); assert.ok(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390);
  await page.screenshot({ path: join(run, 'webclass-mobile.png'), fullPage: true });
  await library.setViewportSize({ width: 390, height: 844 }); await library.evaluate(() => scrollTo(0, 0));
  assert.equal(await library.locator('#header-version').isVisible(), true);
  assert.equal(await library.locator('.topbar').evaluate(el => el.getBoundingClientRect().height), 74);
  await library.screenshot({ path: join(run, 'library-version-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: nonblocking checks, shared cross-context lock/cache, WebClass/library live banners, dismissal/new versions, no frame duplicates/layout shift, installed header version, neutral unavailable rows in seven themes, details links and mobile fit.');
  console.log('Artifacts:', run);
} finally { await context?.close(); await new Promise(resolve => server.close(resolve)); }

async function assertEventually(fn) {
  const deadline = Date.now() + 10000;
  while (!await fn()) { assert.ok(Date.now() < deadline, 'state did not settle'); await new Promise(resolve => setTimeout(resolve, 50)); }
}
