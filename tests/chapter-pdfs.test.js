import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../material-ui.js', import.meta.url), 'utf8');

function fixture({ stuck = false, empty = [], samePDF = false, loading = false } = {}) {
  let selected = 0, clock = 0;
  const clicks = [];
  const viewer = { frames: [], document: {} };
  const top = { frames: [viewer], document: { URL: 'https://school.test/webclass/txtbk_frame.php?set_contents_id=one' } };
  const setViewer = index => { viewer.document = {
    readyState: loading ? 'loading' : 'complete',
    URL: empty.includes(index) ? 'https://school.test/webclass/txtbk_show_text.php?chapter=' + index :
      'https://school.test/webclass/loadit.php?action=pdfViewer&file=' + encodeURIComponent(`/webclass/text/26/course/mock/chapter${samePDF ? 0 : index}.pdf`)
  }; };
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
  return { collect: sandbox.WebClassMaterialUI.collectChapterPDFs, clicks, elapsed: () => clock };
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
  const { collect, clicks } = fixture({ stuck: true });
  await assert.rejects(collect(), error => {
    assert.match(error.message, /章の読み込みを確認できません/);
    assert.equal(error.resources.length, 1, 'retain the PDF confirmed before a later chapter stalls');
    return true;
  });
  assert.deepEqual(clicks, [1, 0]);
});

test('attachment-only chapters finish without waiting for a nonexistent PDF', async () => {
  const { collect, clicks, elapsed } = fixture({ empty: [0, 1, 2] });
  assert.equal((await collect()).length, 0);
  assert.ok(elapsed() < 3000);
  assert.deepEqual(clicks, [1, 2, 0]);
});

test('mixed PDF and attachment-only chapters retain all available PDFs', async () => {
  const { collect } = fixture({ empty: [1] });
  assert.deepEqual(Array.from(await collect(), item => item.name), ['教材_第0章.pdf', '教材_第2章.pdf']);
});

test('newly loaded chapters may display the same PDF URL', async () => {
  const { collect, elapsed } = fixture({ samePDF: true });
  assert.equal((await collect()).length, 3);
  assert.ok(elapsed() < 3000);
});

test('a loading document is not mistaken for a chapter without a PDF', async () => {
  const { collect } = fixture({ loading: true, empty: [0] });
  await assert.rejects(collect(), /章の読み込みを確認できません/);
});
