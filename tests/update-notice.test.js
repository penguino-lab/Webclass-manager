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
test('automatic checks share an in-flight fetch and cache success for six hours; manual check refreshes', async () => {
  const f = fixture();
  const results = await Promise.all([f.checker.check(), f.checker.check(), f.checker.check()]);
  assert.equal(f.calls(), 1); assert.equal(results[0].version, '0.10.0');
  await f.checker.check(); assert.equal(f.calls(), 1);
  await f.checker.check({ force: true }); assert.equal(f.calls(), 2);
  f.advance(6 * 60 * 60 * 1000); await f.checker.check(); assert.equal(f.calls(), 3);
});
test('offline checks retain a known update and retry after fifteen minutes', async () => {
  const f = fixture(); await f.checker.check(); f.offline();
  const result = await f.checker.check({ force: true });
  assert.equal(result.failed, true); assert.equal(result.version, '0.10.0');
  await f.checker.check(); assert.equal(f.calls(), 2);
  f.advance(15 * 60 * 1000); await f.checker.check(); assert.equal(f.calls(), 3);
});
test('invalid manifests never announce a version and failures are cached', async () => {
  const f = fixture(); f.remote({ name: 'Other extension', version: '99.0' });
  assert.deepEqual((await f.checker.check()).version, '');
  await f.checker.check(); assert.equal(f.calls(), 1);
  f.remote({ name: 'WebClass Library Manager', version: '<img>' });
  assert.equal((await f.checker.check({ force: true })).failed, true);
});
