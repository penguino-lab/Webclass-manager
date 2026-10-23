// Detect only recognizable WebClass entry points. Never keep query strings,
// credentials or individual course/material URLs as the site's base URL.
export function discoverWebClassSite(value, title = '') {
  try {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null;
    const marker = url.pathname.match(/^(.*?\/webclass)(?:\/|$)/i);
    if (marker) return url.origin + marker[1] + '/';
    const brandedHost = /^webclass(?:\d+)?\./i.test(url.hostname);
    const brandedTitle = /\bwebclass\b/i.test(title);
    const entry = url.pathname.match(/^(.*\/)(?:index|login|singlesignon|course|top|menu|user|loadit|txtbk_frame|txtbk_show_chapter)\.php(?:\/.*)?$/i);
    if (entry && (brandedHost || brandedTitle)) return url.origin + entry[1];
    if (brandedHost && url.pathname.endsWith('/')) return url.origin + url.pathname;
    return null;
  } catch { return null; }
}
