import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function checkPageUI(context, site, artifacts, worker) {
  const page = await context.newPage();
  // Extension scripts have an isolated world, separate from Playwright's page clock.
  const setDay = time => worker.evaluate(async ({url,time}) => {
    const [tab] = await chrome.tabs.query({url});
    await chrome.scripting.executeScript({target:{tabId:tab.id},args:[time],func:time=>{
      const NativeDate = globalThis.__fixtureNativeDate ||= Date;
      globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [time])); }
        static now() { return new NativeDate(time).getTime(); }
      };
      document.dispatchEvent(new Event('visibilitychange'));
    }});
  }, {url:page.url(),time});
  try {
    await page.goto(site + '?ui=1');
    await setDay('2026-10-16T03:00:00Z');
    const account = page.locator('a[title="アカウントメニュー"]');
    const name = account.locator('span');
    const filter = el => el.evaluate(node => getComputedStyle(node).filter);
    const settled = el => el.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    assert.equal(await filter(name), 'blur(5px)', 'name is blurred on the home route');
    assert.equal(await filter(account.locator('img')), 'none', 'avatar remains clear');
    const original = await name.boundingBox();
    assert.equal(await name.evaluate(el => getComputedStyle(el).transitionDuration), '0.16s');
    await account.hover(); assert.notEqual(await filter(name), 'none', 'reveal fades rather than switching instantly');
    await settled(name); assert.equal(await filter(name), 'none');
    assert.deepEqual(await name.boundingBox(), original, 'revealing the name does not move content');
    await page.mouse.move(0, 0); await settled(name); assert.equal(await filter(name), 'blur(5px)');
    await account.focus(); await settled(name); assert.equal(await filter(name), 'none', 'keyboard users can reveal their name');
    await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => window.menuClicks), 1);
    assert.equal(await page.locator('.standalone-logout').count(), 0);
    assert.equal(await page.locator('.wcl-account-menu>li:last-child').innerText(), 'ログアウト');
    await page.locator('.wcl-account-logout a').click();
    assert.equal(await page.evaluate(() => window.logouts), 1, 'original logout handler is retained');
    await page.locator('h2').click();
    assert.equal(await page.locator('.wcl-account-logout a').isVisible(), false);
    await account.evaluate(el => el.blur());
    assert.equal(await page.locator('nav').evaluate(el => getComputedStyle(el).backgroundImage), 'none', 'default theme leaves the native header intact');
    const toolbar = page.locator('#toolbar');
    const before = await toolbar.boundingBox();
    await page.evaluate(() => scrollTo(0, 480));
    await page.waitForFunction(() => scrollY === 480);
    const after = await toolbar.boundingBox();
    assert.ok(Math.abs(before.y - after.y - 480) < 1, 'toolbar scrolls with the page despite native inline fixed positioning');
    await page.evaluate(() => scrollTo(0, 0));
    await toolbar.locator('button').first().click();
    assert.equal(await page.evaluate(() => window.refreshes), 1);
    await toolbar.locator('button').last().click();
    assert.equal(await page.locator('.timeline-post-form').isVisible(), true);
    assert.equal(await page.locator('.timeline-post-form').evaluate(el => getComputedStyle(el).position), 'absolute', 'post popup positioning retained');
    await page.locator('.timeline-post-form').evaluate(el => { el.hidden = true; });
    const intro = page.frameLocator('iframe');
    assert.equal(await intro.locator('body').evaluate(el=>getComputedStyle(el).fontFamily), 'sans-serif', 'browser default Gothic font is used without a fixed font name');
    assert.equal(await intro.locator('body').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom)), 0, 'no spacing is added outside the full-height layout table');
    assert.ok(await intro.locator('.wcl-intro-actions').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom)>=112), 'spacing is inside the content cell, after the intro buttons');
    assert.equal(await filter(intro.locator('.wcl-private-name')), 'blur(5px)', 'only the frame name text is blurred');
    assert.equal(await filter(intro.locator('#User')), 'none', 'the User container is never blurred');
    await intro.locator('.wcl-private-name').hover(); await settled(intro.locator('.wcl-private-name')); assert.equal(await filter(intro.locator('.wcl-private-name')), 'none');
    await intro.locator('body').evaluate(()=>{const el=document.createElement('div');el.id='User';el.innerHTML='<input name="saveanswer" type="button" value="回答を保存">';document.body.append(el)});
    assert.equal(await intro.locator('[name="saveanswer"]').evaluate(el=>getComputedStyle(el.parentElement).filter), 'none');
    assert.equal(await intro.locator('[name="saveanswer"]').evaluate(el=>getComputedStyle(el).filter), 'none');
    await page.mouse.move(0, 0);
    const startBox = await intro.locator('[name="next"]').boundingBox(), quitBox = await intro.locator('[name="giveup"]').boundingBox();
    assert.ok(Math.abs(startBox.y-quitBox.y)<1 && quitBox.x >= startBox.x+startBox.width, 'native intro controls share one horizontal row even with legacy table/line breaks');
    for (const action of ['next', 'giveup']) {
      const button = intro.locator(`input[name="${action}"]`);
      const box = await button.boundingBox();
      assert.ok(box.width >= 144 && box.height >= 48, 'large introduction hit area');
      await button.focus(); await page.keyboard.press('Enter');
      assert.equal(await button.evaluate(() => window.submitted), action, 'native submitter name retained');
    }
    assert.equal(await intro.locator('input[type="hidden"]').isVisible(), false);
    assert.ok((await intro.locator('#answer input').boundingBox()).height < 48, 'answer submission controls are unchanged');
    await intro.locator('#answer').evaluate(el => { el.hidden = true; });
    assert.match(await page.locator('.wcl-today-heading').innerText(), /金曜日.*今日/);
    assert.equal(await page.locator('.wcl-today-cell').count(), 2, 'Friday column includes rowspan cells at their logical table positions');
    assert.equal(await page.locator('#timetable-note.wcl-today-cell').count(), 0, 'multi-day note is not highlighted');
    assert.match(await page.locator('.wcl-today-heading').evaluate(el=>getComputedStyle(el).boxShadow), /inset/);
    assert.equal(await page.locator('.wcl-other-day').first().evaluate(el=>getComputedStyle(el).filter), 'saturate(0.45)');
    assert.match(await page.locator('.wcl-today-cell').first().evaluate(el=>getComputedStyle(el).boxShadow), /inset/);
    const themeToggle = page.locator('.wcl-theme-toggle');
    assert.equal(await themeToggle.evaluate(el=>el.parentElement.nextElementSibling.id), 'notification-dropdown-area');
    const headerBefore = await page.locator('nav').boundingBox();
    await themeToggle.click();
    assert.equal(await page.getByRole('menuitemradio').count(), 7);
    assert.equal(await page.getByRole('menuitemradio').first().innerText(), 'デフォルト');
    assert.deepEqual(await page.getByRole('menuitemradio').allTextContents(), ['デフォルト','ブラック','グリーン','レッド','ライトブルー','シルバー','ゴールド']);
    assert.equal(await page.getByRole('menuitemradio', {name:'ネイビー'}).count(), 0);
    await page.getByRole('menuitemradio', {name:'シルバー'}).click();
    assert.equal(await page.getByRole('menu').isVisible(), true, 'theme selection remains open for comparison');
    assert.equal(await page.locator('html').getAttribute('data-wcl-theme'), 'silver');
    assert.deepEqual(await page.locator('nav').boundingBox(), headerBefore, 'theme choice does not change header dimensions');
    assert.equal(await intro.locator('html').getAttribute('data-wcl-theme'), 'silver', 'frame theme updates through extension storage');
    await page.locator('#notification-dropdown-area a').click();
    assert.equal(await page.evaluate(()=>window.messages), 1, 'message link stays independent');
    const peer = await context.newPage();
    try {
      await peer.goto(site + '?ui=1');
      await peer.waitForFunction(()=>document.documentElement.dataset.wclTheme==='silver');
      await themeToggle.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await peer.waitForFunction(()=>document.documentElement.dataset.wclTheme==='forest');
      await peer.reload(); await peer.waitForFunction(()=>document.documentElement.dataset.wclTheme==='forest');
    } finally { await peer.close(); }
    await themeToggle.click(); await page.keyboard.press('Escape');
    assert.equal(await themeToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await themeToggle.evaluate(el=>el===document.activeElement), true);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await name.evaluate(el=>getComputedStyle(el).transitionDuration), '0s');
    await page.emulateMedia({reducedMotion:'no-preference'});
    // Replaced native headers must gain one theme picker and the logout entry again.
    await page.locator('nav').evaluate(el=>el.replaceWith(el.cloneNode(true)));
    await page.waitForFunction(()=>document.querySelector('.wcl-theme-toggle')?.getAttribute('title') === 'テーマ: グリーン');
    assert.equal(await page.locator('.wcl-theme-control').count(), 1);
    assert.equal(await page.locator('.wcl-account-logout').count(), 1);
    await page.locator('h2').click();
    await page.screenshot({path:join(artifacts, 'page-ui-desktop.png'), fullPage:false});
    await page.locator('#timetable').screenshot({path:join(artifacts, 'timetable-today.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await themeToggle.isVisible(), true);
    await themeToggle.click();
    const themeMenu = await page.locator('.wcl-theme-menu').boundingBox();
    assert.ok(themeMenu.x >= 0 && themeMenu.x+themeMenu.width <= 390, 'mobile theme menu fits');
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await intro.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'introduction fits a narrow frame');
    await page.screenshot({path:join(artifacts, 'page-ui-mobile.png'), fullPage:true});
    const mobileStart = await intro.locator('[name="next"]').boundingBox(), mobileQuit = await intro.locator('[name="giveup"]').boundingBox();
    assert.ok(Math.abs(mobileStart.y-mobileQuit.y)<1, 'intro buttons remain side-by-side on mobile');
    await setDay('2026-10-17T03:00:00Z');
    assert.match(await page.locator('.wcl-today-heading').innerText(), /土曜日.*今日/, 'day highlight updates when revisiting an open tab on the next day');
    await setDay('2026-10-18T03:00:00Z');
    assert.equal(await page.locator('.wcl-today-heading,.wcl-today-cell,.wcl-today-badge').count(), 0, 'no wrong weekday is highlighted on Sunday');
    await worker.evaluate(()=>chrome.storage.local.set({pageTheme:'retired-theme'}));
    await page.waitForFunction(()=>document.documentElement.dataset.wclTheme==='silver');
    assert.equal(await page.locator('[data-theme="silver"]').getAttribute('aria-checked'), 'true', 'removed theme IDs fall back to silver');
    await page.goto(new URL('/outside', site).href);
    await page.setContent('<nav class="navbar navbar-default"><a title="アカウントメニュー"><span>検証用ユーザー</span></a></nav>');
    assert.equal(await filter(page.locator('span')), 'none', 'same-origin pages outside the WebClass path remain unchanged');
    assert.equal(await page.locator('nav').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    console.log('PASS: gradual blur/reduced motion; horizontal native intro actions; rowspan-aware today column and date rollover; logout menu; six themes, keyboard/mobile, storage across frames/tabs/reload; stable header; native timeline and message actions');
  } finally { await page.close(); }
}
