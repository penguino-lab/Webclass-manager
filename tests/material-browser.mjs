import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function checkMaterialVariants(context, worker, site, artifacts) {
  const variants = [
    { name: 'chapters', labels: ['第0章', '第1章', '第2章', '第3章'], sections: ['第0章', '第1章', '第2章', '第3章'] },
    { name: 'unnamed', labels: ['第4回授業'], sections: ['第1節'] },
    { name: 'numbers', labels: ['教材 1', '教材 2'], sections: ['教材 1', '教材 2'] },
    { name: 'mixed', labels: ['第0章', '練習問題'], sections: ['第0章', '第2節 練習問題'] }
  ];
  for (const variant of variants) {
    const page = await context.newPage();
    try {
      await page.goto(site + 'txtbk_frame.php?set_contents_id=math-' + variant.name);
      const chapter = page.frameLocator('frame[name="webclass_chapter"]');
      const titles = chapter.locator('.wcl-title-button');
      await titles.last().waitFor();
      assert.equal(await chapter.locator('#naviLayout').isVisible(), false);
      assert.deepEqual(await titles.allTextContents(), variant.labels);
      assert.equal(await chapter.locator('input[name="clickpage"]:visible').count(), 0);
      for (const [index, label] of variant.labels.entries()) {
        if (index % 2) { await titles.nth(index).focus(); await page.keyboard.press('Space'); }
        else await titles.nth(index).click();
        assert.deepEqual(await titles.nth(index).evaluate(() => ({ page: window.nativePage, clicks: window.nativeClicks })), { page: String(index + 1), clicks: index + 1 }, 'exactly one native action per title activation');
        const state = await worker.evaluate(async url => {
          const [tab] = await chrome.tabs.query({ url });
          const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => {
            if (!document.getElementById('TOCLayout')) return null;
            WebClassMaterialUI.update(); WebClassMaterialUI.update();
            return { section: WebClassAdapter.context(document).sectionName };
          } });
          return frames.find(frame => frame.result)?.result;
        }, page.url());
        assert.equal(state.section, variant.sections[index], label + ' PDF name');
        const nativeState = await chapter.locator('input[name="clickpage"]').nth(index).getAttribute('value');
        assert.equal(nativeState.trim(), String(index + 1), 'preserved native navigation value');
        assert.equal(await chapter.locator('tr.bkkhaki .wcl-title-button').textContent(), label);
      }
      assert.equal(await titles.count(), variant.labels.length, 'repeated updates do not duplicate buttons');
      const bulk = chapter.locator('#wcl-material-bulk');
      assert.equal(await bulk.count(), 1);
      assert.equal(await bulk.textContent(), 'この教材の資料を一括ダウンロード');
      const placement = await bulk.evaluate(el => { const r = el.getBoundingClientRect(); return { bottom: innerHeight - r.bottom, left: r.left, position: getComputedStyle(el).position }; });
      assert.deepEqual(placement, { bottom: 12, left: 12, position: 'fixed' });
      if (variant.name !== 'numbers') {
        const attach = chapter.locator('#attachment');
        const box = await attach.boundingBox(), titleBox = await titles.last().boundingBox();
        assert.ok(box.y >= titleBox.y + titleBox.height && box.height >= 44, 'attachment below unnamed/chapter title');
        assert.equal(await attach.textContent(), '添付資料をダウンロード');
      }
      await page.screenshot({ path: join(artifacts, `material-${variant.name}.png`), fullPage: true });
      if (variant.name === 'chapters' || variant.name === 'unnamed') {
        const header = page.frameLocator('frame[src*="title_simple.php"]');
        assert.equal(await header.locator('#wcl-close-affordance').count(), 1, 'one close cue');
        const close = header.locator('.wcl-close-material');
        if (variant.name === 'chapters') await close.click({ position: { x: 40, y: 25 } });
        else { await close.focus(); await page.keyboard.press('Enter'); }
        await page.waitForURL('**/course.php/26math/');
      }
    } finally { await page.close(); }
  }
  console.log('PASS: chapter-only/colspan, unnamed singleton/attachment, number fallback without data-page, mixed rows, native click/Space navigation, idempotence, PDF names');
}
