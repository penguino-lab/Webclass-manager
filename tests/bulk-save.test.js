import test from 'node:test';
import assert from 'node:assert/strict';

// Run the real offscreen listener/fetch/hash/save pipeline with dummy documents
// and downloads. No university HTML, credentials or teaching files are used.
test('bulk save compares bytes, keeps distinct same-name files, and retries after a failed save', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = { chrome: globalThis.chrome, fetch: globalThis.fetch, DOMParser: globalThis.DOMParser };
  let listener, completed;
  let downloads = [], payloads = new Map(), rejectNext = false;
  globalThis.DOMParser = class {
    parseFromString() { return { querySelectorAll: () => [] }; }
  };
  globalThis.fetch = async url => {
    const body = payloads.get(url);
    assert.ok(body, `unexpected fetch: ${url}`);
    return { ok: true, url, headers: new Headers({ 'content-type': 'application/pdf' }), blob: async () => new Blob([body]) };
  };
  globalThis.chrome = {
    runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } },
      sendMessage: async message => { if (message.type === 'bulk-result') completed(message); } },
    downloads: {
      search: async () => [],
      download: async options => {
        if (rejectNext) { rejectNext = false; throw Error('dummy save failure'); }
        downloads.push(options.filename); return downloads.length;
      }
    }
  };
  try {
    await import('../offscreen.js?bulk-save-test');
    const run = async resources => {
      downloads = [];
      const result = new Promise(resolve => { completed = resolve; });
      listener({ target: 'offscreen', type: 'bulk-save-job', job: { id: 'bulk-test', site: 'https://school.test/webclass/', course: '数学', saveMode: 'browser', materials: [], resources } }, { id: 'test' }, () => {});
      return result;
    };
    const a = 'https://school.test/webclass/download.php?id=1';
    const b = 'https://school.test/webclass/download.php?id=2';
    const c = 'https://school.test/webclass/text/26/math/mock/viewer.pdf';
    const resources = [a, b, c].map(url => ({ url, kind: 'pdf', name: '資料.pdf' }));
    payloads = new Map([[a, 'same content'], [b, 'different content'], [c, 'same content']]);
    const result = await run(resources);
    assert.equal(result.saved, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(downloads, ['数学/資料.pdf', '数学/資料 (2).pdf']);
    rejectNext = true;
    const retried = await run([resources[0], resources[2]]);
    assert.equal(retried.saved, 1, 'failed save does not hide a usable identical copy');
    assert.equal(retried.failed, 1);
    assert.equal(retried.skipped, 0);
  } finally {
    t.mock.timers.tick(120000);
    t.mock.timers.reset();
    Object.assign(globalThis, previous);
  }
});
