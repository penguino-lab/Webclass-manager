import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateChecker, isNewerVersion, UPDATE_MANIFEST_URL } from '../update-notice.js';

function fixture() {
  const values = {};
  let time = 1000000, calls = 0, remote = { name: 'WebClass Library Manager', version: '0.10.0' }, offline = false;
  const checker = createUpdateChecker({
    storage: { get: async () => structuredClone(values), set: async value => Object.assign(values, value) },
    now: () => time,
    fetchManifest: async (url, options) => {
      calls++;
      assert.equal(url, UPDATE_MANIFEST_URL);
      assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error'); assert.ok(options.signal);
      if (offline) throw Error('offline');
      return { ok: true, json: async () => remote };
    }
  });
  return { checker, values, calls: () => calls, advance: ms => { time += ms; }, offline: () => { offline = true; }, remote: value => { remote = value; } };
}
test('release versions compare numerically and reject malformed remote versions', () => {
  assert.equal(isNewerVersion('0.10.0', '0.9.2'), true);
  assert.equal(isNewerVersion('0.9.2', '0.9.2.0'), false);
  assert.equal(isNewerVersion('0.9.2', '0.10.0'), false);
  for (const value of ['99<script>', '1.2-beta', '99999.1', '', null, {}]) assert.equal(isNewerVersion(value, '0.9.2'), false);
});
test('automatic checks share an in-flight fetch and cache success for one minute; manual check refreshes', async () => {
  const f = fixture();
  const results = await Promise.all([f.checker.check(), f.checker.check(), f.checker.check()]);
  assert.equal(f.calls(), 1); assert.equal(results[0].version, '0.10.0');
  await f.checker.check(); assert.equal(f.calls(), 1);
  await f.checker.check({ force: true }); assert.equal(f.calls(), 2);
  f.advance(59999); await f.checker.check(); assert.equal(f.calls(), 2);
  f.advance(1); await f.checker.check(); assert.equal(f.calls(), 3);
});
test('offline checks retain a known update and retry after one minute', async () => {
  const f = fixture(); await f.checker.check(); f.offline();
  const result = await f.checker.check({ force: true });
  assert.equal(result.failed, true); assert.equal(result.version, '0.10.0');
  await f.checker.check(); assert.equal(f.calls(), 2);
  f.advance(60 * 1000); await f.checker.check(); assert.equal(f.calls(), 3);
});
test('invalid manifests never announce a version and failures are cached', async () => {
  const f = fixture(); f.remote({ name: 'Other extension', version: '99.0' });
  assert.deepEqual((await f.checker.check()).version, '');
  await f.checker.check(); assert.equal(f.calls(), 1);
  f.remote({ name: 'WebClass Library Manager', version: '<img>' });
  assert.equal((await f.checker.check({ force: true })).failed, true);
});

test('independent background and library contexts coalesce with a shared lock and timestamp', async () => {
  const values = {}; let calls = 0, queue = Promise.resolve();
  const locks = { request: (name, fn) => {
    assert.equal(name, 'webclass-public-release-check');
    const result = queue.then(fn); queue = result.catch(() => {}); return result;
  } };
  const options = { locks, now: () => 1000000,
    storage: { get: async () => structuredClone(values), set: async v => Object.assign(values, v) },
    fetchManifest: async () => { calls++; return { ok: true, json: async () => ({ name: 'WebClass Library Manager', version: '0.10.0' }) }; }
  };
  const background = createUpdateChecker(options), library = createUpdateChecker(options);
  const results = await Promise.all([background.check(), library.check(), createUpdateChecker(options).check()]);
  assert.equal(calls, 1); assert.ok(results.every(r => r.version === '0.10.0'));
});
