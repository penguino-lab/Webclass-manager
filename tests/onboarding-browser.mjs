// Fresh profiles, localhost and synthetic WebClass markup only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const artifacts = resolve(source, '..', 'tmp', 'webclass-onboarding');
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(join(artifacts, 'run-'));
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="ja"><title>WebClass - ダミー大学</title><body><nav class="navbar navbar-default"><div class="navbar-brand">WebClass</div><div class="navbar-collapse"><ul class="navbar-nav"></ul></div></nav><main>初回導入のダミー画面</main></body></html>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}/campus/webclass/`;
let context;
try {
  for (const granted of [false, true]) {
    const extension = join(run, granted ? 'allowed-extension' : 'fresh-extension');
    await mkdir(extension);
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isFile() && /\.(js|html|css|json)$/.test(entry.name)) await copyFile(join(source, entry.name), join(extension, entry.name));
    }
    await cp(join(source, 'icons'), join(extension, 'icons'), { recursive: true });
    await cp(join(source, 'images'), join(extension, 'images'), { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    if (granted) manifest.host_permissions = ['http://127.0.0.1/*'];
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    context = await chromium.launchPersistentContext(join(run, granted ? 'allowed-profile' : 'fresh-profile'), {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless: true, viewport: null,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'], args: [`--load-extension=${extension}`]
    });
    context.setDefaultTimeout(15000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    const promptEvent = context.waitForEvent('page', { predicate: p => p !== page });
    await page.goto(site + 'course.php/dummy/?token=do-not-store');
    const prompt = await promptEvent;
    await prompt.waitForURL(/onboarding\.html\?tab=/);
    await prompt.locator('#allow:enabled').waitFor();
    assert.equal(await prompt.locator('#site').textContent(), site);
    assert.equal(await worker.evaluate(() => chrome.storage.local.get('settings').then(r => r.settings.site)), 'https://webclass.tcu.ac.jp/webclass/');
    assert.ok(!JSON.stringify(await worker.evaluate(() => chrome.storage.session.get('siteAccess'))).includes('do-not-store'));
    assert.equal(await prompt.locator('#allow').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true, 'allow button is visible without scrolling');
    if (!granted) {
      assert.deepEqual(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
      // Native Chrome approval itself is manual. Exercise a decline with no
      // host grant; the second profile covers real registration/injection.
      await prompt.evaluate(() => { chrome.permissions.request = async options => { window.requested = { options, gesture: navigator.userActivation.isActive }; return false; }; });
      await prompt.locator('#allow').click();
      await prompt.waitForFunction(() => document.getElementById('status').textContent.includes('許可されませんでした'));
      const requested = await prompt.evaluate(() => window.requested);
      assert.equal(requested.gesture, true);
      assert.deepEqual(requested.options.origins, ['http://127.0.0.1/*']);
      await prompt.screenshot({ path: join(run, 'permission-declined.png') });
      await prompt.close();
      await page.reload();
      await page.waitForTimeout(500);
      assert.equal(context.pages().filter(p => p.url().includes('onboarding.html')).length, 0, 'decline does not open a popup loop');
    } else {
      await prompt.locator('#allow').click();
      await prompt.waitForFunction(() => document.getElementById('status').textContent.includes('有効になりました'));
      assert.equal(await prompt.locator('#later').isVisible(), false);
      assert.equal(await worker.evaluate(() => chrome.storage.local.get('settings').then(r => r.settings.site)), site);
      assert.equal((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 4);
      await page.locator('.wcl-library-button').waitFor();
      await prompt.screenshot({ path: join(run, 'enabled.png') });
      await prompt.locator('#allow').click();
      await page.reload();
      await page.locator('.wcl-library-button').waitFor();
      assert.equal(context.pages().filter(p => p.url().includes('onboarding.html')).length, 0);
    }
    await context.close(); context = undefined;
  }
  console.log('PASS: fresh-install discovery, visible prompt, stripped auth queries, permission click gesture, decline/no repeat, approved site registration and immediate/reloaded UI. Native Chrome permission approval remains a manual check.');
  console.log('Artifacts:', run);
} finally { await context?.close(); await new Promise(r => server.close(r)); }
