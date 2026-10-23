import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteOnboarding } from '../site-onboarding.js';

function fixture() {
  const session = {}, tabs = new Map(), grants = new Set(), prompts = [], requests = [], activations = [];
  let config = { enabled: true, site: 'https://webclass.tcu.ac.jp/webclass/' }, windowOpen = false;
  const api = {
    runtime: { id: 'extension', getURL: file => 'chrome-extension://extension/' + file },
    storage: { session: { get: async () => structuredClone(session), set: async value => Object.assign(session, structuredClone(value)) } },
    tabs: { get: async id => { if (!tabs.has(id)) throw Error('closed'); return tabs.get(id); } },
    permissions: { contains: async ({ origins }) => grants.has(origins[0]), addHostAccessRequest: async request => requests.push(request) },
    windows: { create: async options => { prompts.push(options); windowOpen = true; return { id: 9 }; }, get: async () => { if (!windowOpen) throw Error('closed'); return { id: 9 }; }, update: async () => {} }
  };
  const options = { settings: async () => config, activate: async site => { config = { ...config, site }; activations.push(site); } };
  const module = createSiteOnboarding(api, options);
  const tab = { id: 3, active: true, status: 'complete', url: 'https://campus.example.edu/lms/webclass/course.php/123/?token=secret' };
  tabs.set(tab.id, tab);
  const sender = { id: 'extension', url: 'chrome-extension://extension/onboarding.html?tab=3' };
  return { module, api, options, session, tab, tabs, grants, prompts, requests, activations, sender, close: () => { windowOpen = false; }, config: () => config };
}

test('fresh visit discovers another university and prompts once, including across worker restarts', async () => {
  const f = fixture();
  await f.module.requestForTab(f.tab);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.prompts[0].type, 'popup');
  assert.equal(f.prompts[0].url, 'chrome-extension://extension/onboarding.html?tab=3');
  assert.deepEqual(f.requests, [{ tabId: 3, pattern: 'https://campus.example.edu/lms/webclass/*' }]);
  assert.equal(f.config().site, 'https://webclass.tcu.ac.jp/webclass/', 'detection is not consent');
  assert.ok(!JSON.stringify(f.session).includes('secret'));
  await f.module.requestForTab(f.tab);
  f.close();
  await createSiteOnboarding(f.api, f.options).requestForTab(f.tab);
  assert.equal(f.prompts.length, 1, 'closing the prompt does not cause a popup loop');
  await f.module.requestForTab(f.tab, { force: true });
  assert.equal(f.prompts.length, 2, 'toolbar can explicitly reopen setup');
});

test('activation requires a live matching tab, own extension page and granted host permission', async () => {
  const f = fixture(); await f.module.requestForTab(f.tab);
  const message = { type: 'site-access-activate', tabId: 3 };
  assert.equal((await f.module.message(message, f.sender)).ok, false);
  f.grants.add('https://campus.example.edu/*');
  assert.equal((await f.module.message(message, { ...f.sender, url: 'https://attacker.test/' })).ok, false);
  f.tabs.set(3, { ...f.tab, url: 'https://idp.example.edu/login' });
  assert.equal((await f.module.message(message, f.sender)).ok, false);
  f.tabs.set(3, f.tab);
  assert.equal((await f.module.message(message, f.sender)).ok, true);
  assert.deepEqual(f.activations, ['https://campus.example.edu/lms/webclass/']);
  await f.module.requestForTab(f.tab);
  assert.equal(f.prompts.length, 1, 'approved configured sites do not keep prompting');
});

test('background visits wait for activation and native Chrome grants also register the site', async () => {
  const f = fixture();
  await f.module.requestForTab({ ...f.tab, active: false });
  assert.equal(f.prompts.length, 0);
  f.grants.add('https://campus.example.edu/*');
  await f.module.permissionAdded({ origins: ['https://campus.example.edu/*'] });
  assert.deepEqual(f.activations, ['https://campus.example.edu/lms/webclass/']);
  await f.module.removeTab(3);
  assert.equal((await f.module.message({ type: 'site-access-info', tabId: 3 }, f.sender)).ok, false);
});

test('unrelated permission grants cannot select an old detected university', async () => {
  const f = fixture(); await f.module.requestForTab(f.tab);
  f.grants.add('https://campus.example.edu/*');
  await f.module.permissionAdded({ origins: ['https://unrelated.example.edu/*'] });
  assert.deepEqual(f.activations, []);
});

test('unrelated tabs and disabled auto setup do not open prompts; native request failures have a fallback', async () => {
  const f = fixture();
  await f.module.requestForTab({ ...f.tab, url: 'https://idp.example.edu/login' });
  f.config().enabled = false;
  await f.module.requestForTab(f.tab);
  assert.equal(f.prompts.length, 0);
  f.config().enabled = true;
  f.api.permissions.addHostAccessRequest = async () => { throw Error('unavailable'); };
  await f.module.requestForTab(f.tab);
  assert.equal(f.prompts.length, 1);
});
