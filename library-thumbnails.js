import { MAX_PDF_THUMBNAIL_SIZE } from './library-core.js';
import { ThumbnailCache } from './library-thumbnail-cache.js';
// Thumbnails are generated only near the viewport, with two reads/renders at a time.
export class LibraryThumbnails {
  constructor() {
    this.version = 0; this.slots = [0, 1]; this.queue = []; this.urls = []; this.tasks = new Set();
    this.cache = new ThumbnailCache();
    this.observer = new IntersectionObserver(items => {
      for (const item of items) if (item.isIntersecting) { this.observer.unobserve(item.target); this.queue.push({ ...this.targets.get(item.target), version: this.version }); }
      this.pump();
    }, { rootMargin: '180px' });
    this.targets = new WeakMap();
  }
  clear() {
    this.version++; this.observer.disconnect(); this.queue = []; this.targets = new WeakMap();
    for (const task of this.tasks) task.destroy().catch(() => {});
    this.tasks.clear(); for (const url of this.urls) URL.revokeObjectURL(url); this.urls = [];
  }
  observe(target, entry) {
    if (!['image', 'pdf'].includes(entry.type) || entry.size > (entry.type === 'pdf' ? MAX_PDF_THUMBNAIL_SIZE : 25 * 1024 * 1024)) return;
    const cached = this.cache.peek(this.rootId, entry);
    if (cached) { this.show(target, entry, cached, this.version).catch(() => {}); return; }
    this.targets.set(target, { target, entry, rootId: this.rootId }); this.observer.observe(target);
  }
  pump() {
    while (this.slots.length && this.queue.length) {
      const job = this.queue.shift(), slot = this.slots.pop();
      this.load({ ...job, slot }).catch(() => {}).finally(() => { this.slots.push(slot); this.pump(); });
    }
  }
  async show(target, entry, blob, version) {
    if (version !== this.version) return;
    const url = URL.createObjectURL(blob); this.urls.push(url);
    const img = document.createElement('img'); img.alt = ''; img.className = 'thumbnail';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    if (version !== this.version) return;
    if (entry.type === 'pdf') {
      const canvas = document.createElement('canvas'); canvas.className = 'thumbnail'; canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0); target.replaceChildren(canvas);
    } else target.replaceChildren(img);
  }
  async load({ target, entry, version, slot, rootId }) {
    const cached = await this.cache.get(rootId, entry);
    if (version !== this.version) return;
    if (cached) { await this.show(target, entry, cached, version); return; }
    const file = await entry.handle.getFile(); if (version !== this.version) return;
    const save = async canvas => {
      if (file.size !== entry.size || file.lastModified !== entry.modified) return;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await this.cache.put(rootId, entry, blob);
    };
    if (entry.type === 'image') {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 360 / bitmap.width, 240 / bitmap.height), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (version === this.version) await this.show(target, entry, blob, version);
        if (file.size === entry.size && file.lastModified === entry.modified) await this.cache.put(rootId, entry, blob);
      } catch { await this.show(target, entry, file, version); }
      return;
    }
    // PDF.js 5.4 has a module-wide PagesMapper singleton. Isolate the two renderers.
    const pdfjs = await import(`./vendor/pdfjs/pdf.min.mjs?thumbnail-${slot}`);
    if (version !== this.version) return;
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.mjs');
    const data = new Uint8Array(await file.arrayBuffer()); if (version !== this.version) return;
    const task = pdfjs.getDocument({ data, isEvalSupported: false, useWasm: false, cMapUrl: chrome.runtime.getURL('vendor/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: chrome.runtime.getURL('vendor/pdfjs/standard_fonts/') });
    this.tasks.add(task); task.onPassword = () => task.destroy().catch(() => {});
    try {
      const pdf = await task.promise, page = await pdf.getPage(1); if (version !== this.version) return;
      const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).height });
      const canvas = document.createElement('canvas'); canvas.className = 'thumbnail'; canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (version === this.version) target.replaceChildren(canvas);
      await save(canvas);
    } finally { this.tasks.delete(task); await task.destroy(); }
  }
}
