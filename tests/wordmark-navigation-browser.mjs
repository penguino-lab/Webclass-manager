// Synthetic headers only; no saved university pages, accounts, or access URLs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(String(error)));
  let markup;
  await context.route('http://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
  async function load(path, href, direct = false) {
    const link = `<a ${direct ? 'class="navbar-brand"' : 'class="course-webclass"'} href="${href}" role="link" tabindex="0" target="_top" onclick="sessionStorage.nativeClicks=Number(sessionStorage.nativeClicks||0)+1">WebClass</a>`;
    markup = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Dummy WebClass</title><nav class="navbar navbar-default">${direct ? link : `<div class="navbar-brand">${link}</div>`}</nav><main><h1>Dummy page</h1></main></html>`;
    await page.goto('http://fixture.test' + path);
    await page.evaluate(() => {
      sessionStorage.nativeClicks = 0;
      window.sentinel = 'same document';
      globalThis.chrome = { storage: { local: { get: async defaults => defaults }, onChanged: { addListener() {} } } };
    });
    await page.addStyleTag({ path: resolve(root, 'page-ui.css') });
    await page.addScriptTag({ path: resolve(root, 'page-themes.js') });
    await page.addScriptTag({ path: resolve(root, 'page-ui.js') });
    await page.evaluate(() => WebClassPageUI.update());
    return page.locator('.navbar-brand a, a.navbar-brand');
  }
  for (const [path, href] of [
    ['/webclass/?acs_=dummy-a', '/webclass/index.php?acs_=dummy-b'],
    ['/webclass/index.php?acs_=dummy-a', '/webclass/?acs_=dummy-b'],
    ['/campus/webclass/', '/campus/webclass/index.php']
  ]) {
    const link = await load(path, href);
    assert.equal(await link.getAttribute('href'), href, 'native destination is never deleted');
    assert.equal(await link.getAttribute('aria-disabled'), 'true');
    assert.equal(await link.getAttribute('tabindex'), '-1');
    await link.click({ force: true }); // Exercise the click guard despite aria-disabled.
    await link.press('Enter');
    assert.equal(await page.evaluate(() => window.sentinel), 'same document');
    assert.equal(await page.evaluate(() => sessionStorage.nativeClicks), '0', 'self navigation and native click handler are blocked only on home');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('a')).cursor), 'text');
  }
  for (const direct of [false, true]) {
    await page.setViewportSize({ width: direct ? 390 : 1440, height: 900 });
    const link = await load('/webclass/index.php/courses/?mode=list', '/webclass/?acs_=dummy-home', direct);
    assert.equal(await link.getAttribute('aria-disabled'), null);
    assert.equal(await link.getAttribute('tabindex'), '0');
    assert.equal(await link.getAttribute('role'), 'link');
    assert.notEqual(await link.evaluate(el => getComputedStyle(el).cursor), 'text');
    await Promise.all([page.waitForURL('http://fixture.test/webclass/?acs_=dummy-home'), direct ? link.press('Enter') : link.click()]);
    assert.equal(await page.evaluate(() => sessionStorage.nativeClicks), '1', 'native handler and actual home navigation work');
  }
  for (const [path, href] of [
    ['/webclass/eportfolio/', '/webclass/'],
    ['/webclass/course.php/dummy/', '/webclass/'],
    ['/webclass/?mode=list', '/webclass/'],
    ['/webclass/', '/webclass/?mode=list'],
    ['/webclass/', '/webclass/#other-section'],
    ['/webclass/', 'https://other.example/webclass/']
  ]) {
    const link = await load(path, href);
    assert.equal(await link.getAttribute('aria-disabled'), null, 'different pages and destinations stay enabled');
    assert.equal(await link.getAttribute('href'), href);
  }
  const link = await load('/webclass/', '/webclass/');
  await page.evaluate(() => {
    history.replaceState(null, '', '/webclass/index.php/courses/');
    WebClassPageUI.update(); WebClassPageUI.update();
  });
  assert.equal(await link.getAttribute('aria-disabled'), null, 'reusing a header restores its native state');
  assert.equal(await link.getAttribute('tabindex'), '0');
  await Promise.all([page.waitForURL('http://fixture.test/webclass/'), link.click()]);
  assert.equal(await page.evaluate(() => sessionStorage.nativeClicks), '1');
  assert.deepEqual(errors, []);
  console.log('PASS: home self links stay inactive; course registration and other pages retain native mouse/keyboard home navigation, destinations, and accessibility state.');
} finally { await browser.close(); }
