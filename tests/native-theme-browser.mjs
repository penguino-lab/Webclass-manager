// Native blue/gray palettes reconstructed with dummy headers; no university data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.LIBRARY_TEST_OUTPUT || resolve(root, 'tmp/native-theme'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const rgb = hex => `rgb(${hex.slice(1).match(/../g).map(part => parseInt(part, 16)).join(', ')})`;
try {
  for (const native of ['blue', 'gray']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(String(error)));
    const nativeColor = native === 'blue' ? '#ffffff' : '#777777';
    const background = native === 'blue' ? '#1e6ecc' : '#f8f8f8';
    const markup = `<!doctype html><html lang="ja" data-wcl-course-ui><meta charset="utf-8"><style>
      body{margin:0;font:16px sans-serif;color:#333}.navbar{min-height:50px;box-sizing:border-box}.container{box-sizing:border-box;margin:0 auto;padding:0 15px}.container::before,.container::after{display:table;content:" "}.container::after{clear:both}@media(min-width:768px){.container{width:750px}.navbar-header{float:left}.navbar-brand{float:left}}@media(min-width:992px){.container{width:970px}}@media(min-width:1200px){.container{width:1170px}}
      .navbar-brand{font-size:20px;padding:15px;line-height:28px}.navbar-nav{display:flex;list-style:none;margin:0;padding:0}.navbar-nav>li>a{display:block;padding:15px}
      .navbar-header{float:left}.navbar-right{float:right}.navbar-right>li:last-child>a{box-sizing:border-box;height:76px}.navbar-collapse{clear:both}.course-name{display:block}.navbar:after{content:'';display:block;clear:both}
      @media(max-width:767px){.navbar-header,.navbar-right{float:none}}
      </style><nav class="navbar navbar-default"><div class="container"><div class="navbar-header"><div class="navbar-brand"><a class="course-webclass" href="/webclass/">WebClass</a><span class="course-name">Dummy course_demo123</span></div></div>
      <ul class="navbar-nav navbar-right"><li id="notification-dropdown-area"><a href="#messages">通知</a></li><li><a href="#language">言語</a></li><li><a href="#account">アカウント</a></li></ul></div><div class="container"><div class="navbar-collapse"><ul class="navbar-nav"><li><a href="#materials">教材</a></li></ul></div></div></nav><main><h1>Dummy materials</h1></main></html>`;
    await context.route('http://fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
    await page.addInitScript(() => {
      const listeners = [], values = JSON.parse(sessionStorage.themeValues || '{}');
      globalThis.chrome = { storage: {
        local: {
          get: async defaults => typeof defaults === 'object' ? { ...defaults, ...values } : { ...values },
          set: async update => {
            const changes = Object.fromEntries(Object.entries(update).map(([key, newValue]) => [key, { newValue }]));
            Object.assign(values, update); sessionStorage.themeValues = JSON.stringify(values);
            for (const listener of listeners) listener(changes, 'local');
          }
        }, onChanged: { addListener: listener => listeners.push(listener) }
      } };
    });
    async function initialize(syncOnly = false) {
      await page.addStyleTag({ path: resolve(root, 'page-ui.css') });
      await page.addStyleTag({ path: resolve(root, 'course-ui.css') });
      // Native CSS arriving later must not override a selected extension theme.
      await page.addStyleTag({ content: `.navbar-default{background-color:${background};border-color:#e7e7e7}.navbar-default .navbar-brand,.navbar-default .navbar-nav>li>a,.course-name,.course-webclass,.course-webclass:hover{color:${nativeColor}}` });
      await page.addScriptTag({ path: resolve(root, 'page-themes.js') });
      await page.addScriptTag({ path: resolve(root, syncOnly ? 'theme-sync.js' : 'page-ui.js') });
      if (!syncOnly) await page.addScriptTag({ path: resolve(root, 'course-ui.js') });
    }
    const theme = id => page.evaluate(id => chrome.storage.local.set({ pageTheme: id }), id);
    const color = selector => page.locator(selector).first().evaluate(el => getComputedStyle(el).color);
    await page.goto('http://fixture.test/webclass/course.php/dummy/');
    await initialize();
    await page.waitForFunction(() => document.documentElement.dataset.wclTheme === 'silver');
    assert.equal(await page.locator('.wcl-theme-toggle').innerText(), 'テーマ');
    const bounds = await page.locator('.navbar').boundingBox();
    const assertCopyPosition = async () => {
      const title = await page.locator('.course-name').boundingBox(), copy = await page.locator('#wcl-copy-code').boundingBox();
      assert.ok(copy.x >= title.x + title.width - 1, 'copy stays to the right of the course title');
      assert.ok(copy.y < title.y + title.height && copy.y + copy.height > title.y, 'copy does not fall below the course title');
      assert.equal(await page.locator('.wcl-course-title-row').count(), 1);
    };
    await assertCopyPosition();
    for (const width of [1920, 1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.course-name').evaluate(el => { el.textContent = '検証用の長い講義名称（金1・金2、担当教員、2026年度後期前半）_demo123'; });
      await page.evaluate(() => { WebClassCourseUI.update(); WebClassCourseUI.update(); });
      await assertCopyPosition();
      if (width >= 768) {
        const home = await page.locator('.course-webclass').boundingBox();
        const utilities = await page.locator('.navbar>.container:first-child>.navbar-right').boundingBox();
        const titleRow = await page.locator('.wcl-course-title-row').boundingBox();
        const header = await page.locator('.navbar>.container:first-child').boundingBox();
        assert.ok(Math.abs(utilities.y - home.y) < 2, 'utility controls remain in the first row alongside WebClass');
        assert.ok(Math.abs(titleRow.y - header.y - 50) < 1, 'course title starts 50px below the header top, independent of avatar height');
        assert.ok(titleRow.x + titleRow.width <= utilities.x + 1, 'title/copy row does not overlap tall account controls');
        assert.ok(titleRow.x + titleRow.width <= header.x + header.width + 1, 'title/copy row stays inside the banner');
        assert.ok(utilities.x >= home.x + home.width, 'utility controls do not overlap the WebClass link');
        assert.ok(header.height <= 120, 'long names do not create an extra utility row');
        await page.screenshot({ path: resolve(output, `${native}-long-${width}.png`) });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'long course title does not overflow the viewport');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.course-name').evaluate(el => { el.textContent = 'Dummy course_demo123'; });
    for (const id of ['silver', 'default', 'charcoal', 'forest', 'red', 'lightblue', 'gold', 'default']) {
      await theme(id);
      await page.waitForFunction(id => document.documentElement.dataset.wclTheme === id, id);
      const expected = id === 'default' ? rgb(nativeColor) : rgb(await page.evaluate(() => document.documentElement.style.getPropertyValue('--wcl-text')));
      for (const selector of ['.course-webclass', '.course-name', '.wcl-theme-toggle', '.wcl-library-button', '.wcl-copy-code']) {
        await page.waitForFunction(({ selector, expected }) => getComputedStyle(document.querySelector(selector)).color === expected, { selector, expected });
        assert.equal(await color(selector), expected, `${native}/${id}: ${selector}`);
      }
      assert.deepEqual(await page.locator('.navbar').boundingBox(), bounds, 'theme changes keep header dimensions');
      if (id === 'silver' || id === 'default') await page.screenshot({ path: resolve(output, `${native}-${id}.png`) });
    }
    await page.reload(); await initialize();
    await page.waitForFunction(() => document.documentElement.dataset.wclTheme === 'default');
    assert.equal(await color('.wcl-theme-toggle'), rgb(nativeColor), 'saved native/default choice survives reload');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.wcl-theme-toggle').click();
    const label = await page.locator('.wcl-theme-toggle span').boundingBox();
    assert.ok(label.width > 0 && label.x >= 0 && label.x + label.width <= 390, 'visible theme label fits mobile');
    const menu = await page.locator('.wcl-theme-menu').boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= 390, 'theme menu fits mobile');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.wcl-theme-toggle').getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => { sessionStorage.removeItem('themeValues'); localStorage.clear(); });
    await page.reload(); await initialize(true);
    await page.waitForFunction(() => document.documentElement.dataset.wclTheme === 'silver');
    await theme('default');
    await page.reload(); await initialize(true);
    await page.waitForFunction(() => document.documentElement.dataset.wclTheme === 'default');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS: native ${native}, all extension palettes, silver first run, saved default, visible label, keyboard/mobile and extension-page sync.`);
  }
} finally { await browser.close(); }
