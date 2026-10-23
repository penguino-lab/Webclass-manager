import './webclass-adapter.js';
export const DEFAULTS = { enabled: true, site: 'https://webclass.tcu.ac.jp/webclass/', selector: '', saveMode: 'browser', folderName: '', actionOpensLibrary: false };
export const courseId = globalThis.WebClassAdapter.urlContext.courseId;
export const contentsId = globalThis.WebClassAdapter.urlContext.contentsId;
export const usableName = globalThis.WebClassAdapter.urlContext.usableName;
export function hostPattern(site) { const u = new URL(site); return u.protocol + '//' + u.hostname + '/*'; }
export const TTL = 20000;
export function segment(value, fallback = '未分類', max = 80) {
  let s = String(value ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim().replace(/[. ]+$/g, '');
  s = Array.from(s).slice(0, max).join('').replace(/[. ]+$/g, '');
  if (!s || /^\.+$/.test(s)) s = fallback;
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s)) s = '_' + s;
  return s;
}
export function filename(value) {
  const base = String(value || '').split(/[\\/]/).pop();
  const match = base.match(/^(.*)(\.[a-zA-Z0-9]{1,12})$/);
  return match ? segment(match[1], 'file', 100) + match[2] : segment(base, 'file', 112);
}
export function destination(settings, course, name) {
  return `${segment(course, '未分類', 60)}/${filename(name)}`;
}
export function siteURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw Error('HTTPSのWebClass URLを入力してください。');
  if (u.username || u.password) throw Error('認証情報を含むURLは登録できません。');
  u.search = ''; u.hash = '';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}
export function inSite(url, site) {
  try { const u = new URL(url), s = new URL(site); return u.origin === s.origin && u.pathname.startsWith(s.pathname); } catch { return false; }
}
export function normalizedURL(value) {
  const u = new URL(value); u.hash = ''; return u.href;
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedURL(value)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
// A URL match alone cannot prove which tab initiated a download. Require referrer evidence too.
export function chooseIntent(intents, item, now = Date.now()) {
  if (!item.refOrigin || item.byExtensionId) return null;
  const candidates = intents.filter(i => now - i.time >= 0 && now - i.time <= TTL &&
    item.started >= i.time - 1000 && item.started <= i.time + TTL &&
    i.origin === item.refOrigin && (
      (i.target && (i.target === item.url || i.target === item.finalUrl) && (i.page === item.ref || item.originOnly)) ||
      // POST / JavaScript download controls need a full page referrer and an in-site target.
      (i.fallback === true && !item.originOnly && i.page === item.ref && item.inSite === true)
    ));
  // Never guess when two clicks/tabs could explain the same download.
  return candidates.length === 1 ? candidates[0] : null;
}
