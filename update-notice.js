export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/penguino-lab/Webclass-manager/main/manifest.json';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL = 15 * 60 * 1000;
const key = 'publicReleaseCheck';
function versionParts(value) {
  return typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(value) && value.split('.').every(n => Number(n) <= 65535)
    ? value.split('.').map(Number) : null;
}
export function isNewerVersion(latest, installed) {
  const a = versionParts(latest), b = versionParts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return difference > 0;
  }
  return false;
}
export function createUpdateChecker({ storage, fetchManifest = fetch, now = Date.now }) {
  let inFlight;
  async function check(force) {
    const cached = (await storage.get(key))[key] || {};
    const age = now() - cached.attemptedAt;
    if (!force && age >= 0 && age < (cached.failed ? RETRY_INTERVAL : CHECK_INTERVAL)) return cached;
    let result;
    try {
      const response = await fetchManifest(UPDATE_MANIFEST_URL, {
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', redirect: 'error', signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) throw Error('Update check failed');
      const manifest = await response.json();
      if (manifest.name !== 'WebClass Library Manager' || !versionParts(manifest.version)) throw Error('Invalid release');
      result = { version: manifest.version, attemptedAt: now(), failed: false };
    } catch {
      // Keep a previously confirmed update visible when offline. Never block the library.
      result = { version: versionParts(cached.version) ? cached.version : '', attemptedAt: now(), failed: true };
    }
    await storage.set({ [key]: result });
    return result;
  }
  return {
    check({ force = false } = {}) {
      if (!inFlight) inFlight = check(force).finally(() => { inFlight = undefined; });
      return inFlight;
    }
  };
}
export function mountUpdateNotice(api) {
  const $ = id => document.getElementById(id);
  const installed = api.runtime.getManifest().version;
  const checker = createUpdateChecker({ storage: api.storage.local });
  let latest = '';
  $('installed-version').textContent = `現在のバージョン：${installed}`;
  function render(version, dismissed) {
    latest = version;
    const available = isNewerVersion(version, installed);
    $('update-banner').hidden = !available || dismissed === version;
    if (available) $('update-message').textContent = `新しいバージョン ${version} があります`;
  }
  async function check(force = false) {
    $('check-update').disabled = true;
    if (force) $('update-status').textContent = '更新を確認しています…';
    try {
      const result = await checker.check({ force });
      const { dismissedUpdateVersion } = await api.storage.local.get('dismissedUpdateVersion');
      // An explicit check also reopens an update the user previously dismissed.
      render(result.version, force ? '' : dismissedUpdateVersion);
      if (force) $('update-status').textContent = result.failed ? '更新を確認できませんでした。接続後にもう一度お試しください。'
        : isNewerVersion(result.version, installed) ? '新しいバージョンがあります。上部の更新手順をご覧ください。' : '最新バージョンを使用しています。';
    } catch { if (force) $('update-status').textContent = '更新を確認できませんでした。もう一度お試しください。'; }
    finally { $('check-update').disabled = false; }
  }
  $('check-update').addEventListener('click', () => check(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  $('dismiss-update').addEventListener('click', async () => {
    $('update-banner').hidden = true;
    try { await api.storage.local.set({ dismissedUpdateVersion: latest }); } catch { /* Closing still works in this tab. */ }
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dismissedUpdateVersion) render(latest, changes.dismissedUpdateVersion.newValue);
  });
  // Check cached state first so an already-known update appears without a network wait.
  api.storage.local.get([key, 'dismissedUpdateVersion']).then(values => {
    render(values[key]?.version || '', values.dismissedUpdateVersion);
  }).catch(() => {});
  check();
}
