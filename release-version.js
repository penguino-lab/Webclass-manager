// Shared by the background/library modules and classic WebClass content scripts.
(() => {
  function parts(value) {
    return typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(value) && value.split('.').every(n => Number(n) <= 65535)
      ? value.split('.').map(Number) : null;
  }
  function isNewerVersion(latest, installed) {
    const a = parts(latest), b = parts(installed);
    if (!a || !b) return false;
    for (let i = 0; i < 4; i++) {
      const difference = (a[i] || 0) - (b[i] || 0);
      if (difference) return difference > 0;
    }
    return false;
  }
  globalThis.WebClassReleaseVersion ||= Object.freeze({ parts, isNewerVersion });
})();
