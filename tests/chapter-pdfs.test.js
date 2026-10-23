import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../material-ui.js', import.meta.url), 'utf8');

function fixture(stuck = false) {
  let selected = 0, clock = 0;
  const clicks = [];
  const viewer = { frames: [], document: {} };
  const top = { frames: [viewer], document: { URL: 'https://school.test/webclass/txtbk_frame.php?set_contents_id=one' } };
  const setViewer = index => { viewer.document.URL = 'https://school.test/webclass/loadit.php?action=pdfViewer&file=' + encodeURIComponent(`/webclass/text/26/course/mock/chapter${index}.pdf`); };
  setViewer(0);
  const controls = [0, 1, 2].map(index => ({
    disabled: false, isConnected: true,
    closest: () => ({
      matches: () => selected === index,
      querySelector: selector => ({ textContent: selector === '.wcl-section' ? '' : `第${index}章` })
    }),
    click() { clicks.push(index); selected = index; if (!stuck) setViewer(index); }
  }));
  const sandbox = {
    URL, location: { origin: 'https://school.test' }, window: { top },
    document: { querySelectorAll: () => controls, querySelector: () => ({ textContent: '教材' }) },
    Date: { now: () => clock }, setTimeout: callback => { clock += 150; callback(); }
  };
  runInNewContext(source, sandbox);
  return { collect: sandbox.WebClassMaterialUI.collectChapterPDFs, clicks };
}
test('collects every chapter PDF and restores the original chapter', async () => {
  const { collect, clicks } = fixture();
  const resources = await collect();
  assert.equal(resources.length, 3);
  assert.deepEqual(Array.from(resources, item => item.name), ['教材_第0章.pdf', '教材_第1章.pdf', '教材_第2章.pdf']);
  assert.deepEqual(Array.from(resources, item => new URL(item.url).pathname.split('/').pop()), ['chapter0.pdf', 'chapter1.pdf', 'chapter2.pdf']);
  assert.deepEqual(clicks, [1, 2, 0]);
});
test('a chapter that never loads cannot reuse the previous PDF, and restores the original', async () => {
  const { collect, clicks } = fixture(true);
  await assert.rejects(collect(), /章のPDFを確認できません/);
  assert.deepEqual(clicks, [1, 0]);
});
