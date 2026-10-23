// Extension documents share the choice made on WebClass, including live changes.
(() => {
  const theme = globalThis.WebClassTheme;
  if (!theme) return;
  const cacheKey = 'wcl-page-theme';
  function apply(id) {
    const current = theme.apply(id);
    try { localStorage.setItem(cacheKey, current.id); } catch {}
  }
  let cached;
  try { cached = localStorage.getItem(cacheKey); } catch {}
  apply(cached);
  // A storage change can arrive before the initial read resolves.
  let changed = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pageTheme) { changed = true; apply(changes.pageTheme.newValue); }
  });
  chrome.storage.local.get('pageTheme').then(data => { if (!changed) apply(data.pageTheme); }).catch(() => {});
})();
