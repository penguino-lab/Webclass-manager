import { hostPattern, inSite } from './core.js';
import { discoverWebClassSite } from './site-discovery.js';

export function createSiteOnboarding(api, { settings, activate }) {
  // Serialize only setup state, never behind downloads or page injection.
  let queue = Promise.resolve();
  const serial = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
  const nativeRequests = new Map();
  const key = 'siteAccess';
  const read = async () => ({ pending: {}, shown: [], ...(await api.storage.session.get(key))[key] });
  const save = state => api.storage.session.set({ [key]: state });
  const candidate = (tab, s) => inSite(tab.url, s.site) ? s.site : discoverWebClassSite(tab.url, tab.title);

  async function live(tabId) {
    if (!Number.isInteger(tabId) || tabId < 0) return null;
    const state = await read(), pending = state.pending[tabId];
    if (!pending) return null;
    try {
      const tab = await api.tabs.get(tabId);
      if (candidate(tab, await settings()) !== pending.site) return null;
      return { site: pending.site, tab };
    } catch { return null; }
  }

  async function requestForTab(tab, { force = false } = {}) {
    // Events can be queued during redirects or a switch to another tab.
    if (api.tabs.get) {
      try { tab = await api.tabs.get(tab.id); } catch { return false; }
    }
    const s = await settings();
    if (!s.enabled || !Number.isInteger(tab.id)) return false;
    const site = candidate(tab, s);
    if (!site) return false;
    const granted = await api.permissions.contains({ origins: [hostPattern(site)] });
    if (granted && site === s.site) return false;
    const state = await read();
    state.pending[tab.id] = { site, previousSite: s.site };
    state.pending = Object.fromEntries(Object.entries(state.pending).slice(-50));
    await save(state);
    if (!granted && nativeRequests.get(tab.id) !== site) {
      nativeRequests.set(tab.id, site);
      // Chrome's optional native indicator must not delay our own prompt.
      Promise.resolve().then(() => api.permissions.addHostAccessRequest({ tabId: tab.id, pattern: site + '*' }))
        .catch(() => { if (nativeRequests.get(tab.id) === site) nativeRequests.delete(tab.id); });
    }
    // Do not steal focus for background tabs, redirects or every page load.
    if (!tab.active || (!force && state.shown.includes(site))) return true;
    if (state.windowId !== undefined) {
      try {
        await api.windows.get(state.windowId);
        if (force) await api.windows.update(state.windowId, { focused: true });
        return true;
      } catch { delete state.windowId; }
    }
    const window = await api.windows.create({
      url: api.runtime.getURL('onboarding.html') + '?tab=' + tab.id,
      type: 'popup', width: 500, height: 650, focused: true
    });
    state.windowId = window.id;
    state.shown = [...new Set([...state.shown, site])].slice(-50);
    await save(state);
    return true;
  }

  async function permissionAdded({ origins = [] } = {}) {
    const state = await read(), matches = [];
    for (const id of Object.keys(state.pending)) {
      const current = await live(Number(id));
      if (current && origins.includes(hostPattern(current.site)) &&
        (await settings()).site === state.pending[id].previousSite &&
        await api.permissions.contains({ origins: [hostPattern(current.site)] })) matches.push(current);
    }
    // A native host-access request can also complete setup. Never pick between
    // two different installations sharing one host without a user's choice.
    const sites = [...new Set(matches.map(item => item.site))];
    if (sites.length === 1 && (await settings()).site !== sites[0]) await activate(sites[0]);
  }

  async function message(message, sender) {
    if (sender.id !== api.runtime.id || sender.url?.split('?')[0] !== api.runtime.getURL('onboarding.html')) return { ok: false };
    const current = await live(message.tabId);
    if (!current) return { ok: false, error: 'WebClassのタブが閉じられたか、URLが変わりました。WebClassを開き直してください。' };
    const granted = await api.permissions.contains({ origins: [hostPattern(current.site)] });
    if (message.type === 'site-access-info') return { ok: true, site: current.site, granted };
    if (message.type !== 'site-access-activate' || !granted) return { ok: false, error: 'このWebClassへのアクセスを許可してください。' };
    await activate(current.site);
    return { ok: true, site: current.site };
  }

  async function removeTab(tabId) {
    nativeRequests.delete(tabId);
    const state = await read(); delete state.pending[tabId]; await save(state);
  }
  return {
    requestForTab: (tab, options) => serial(() => requestForTab(tab, options)),
    permissionAdded, message,
    removeTab: tabId => serial(() => removeTab(tabId))
  };
}
