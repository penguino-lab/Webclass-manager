import { inSite, courseId } from './core.js';
export class SaveError extends Error {}
export function attachmentLink(html, page, original, site, expectedCourse = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const source = new URL(original);
  const links = [...doc.querySelectorAll('a[href]')].flatMap(a => {
    try {
      const url = new URL(a.getAttribute('href'), page);
      if (!inSite(url.href, site) || !/\/download\.php(?:\/|$)/.test(url.pathname)) return [];
      const id = courseId(url.href);
      if (id && expectedCourse && id !== expectedCourse) return [];
      for (const key of ['file', 'contents_id']) {
        if (source.searchParams.get(key) && url.searchParams.get(key) !== source.searchParams.get(key)) return [];
      }
      return [{ url: url.href, name: a.textContent.trim() }];
    } catch { return []; }
  });
  const unique = [...new Map(links.map(link => [link.url, link])).values()];
  if (unique.length !== 1) throw new SaveError('添付資料のリンクを一意に確認できませんでした。「元の操作を使う」から添付資料画面を開いてください。');
  return unique[0];
}
