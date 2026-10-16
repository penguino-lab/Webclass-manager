const MAX_ENTRIES = 128, MAX_BYTES = 24 * 1024 * 1024, MEMORY_ENTRIES = 64;
let database;
function openDatabase() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('webclass-library-thumbnails', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('thumbnails', { keyPath: 'key' });
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  });
}
// Root identity prevents collisions between same-named files in different libraries.
export function thumbnailKey(rootId, entry) { return JSON.stringify([1, rootId, entry.path, entry.size, entry.modified]); }
export class ThumbnailCache {
  constructor() { this.memory = new Map(); }
  remember(key, blob) {
    this.memory.delete(key); this.memory.set(key, blob);
    while (this.memory.size > MEMORY_ENTRIES) this.memory.delete(this.memory.keys().next().value);
    return blob;
  }
  peek(rootId, entry) {
    const key = thumbnailKey(rootId, entry), blob = this.memory.get(key);
    return blob ? this.remember(key, blob) : null;
  }
  async get(rootId, entry) {
    if (!rootId) return null;
    const cached = this.peek(rootId, entry); if (cached) return cached;
    try {
      const db = await openDatabase(), key = thumbnailKey(rootId, entry);
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction('thumbnails').objectStore('thumbnails').get(key);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (!value) return null;
      const tx = db.transaction('thumbnails', 'readwrite'); tx.objectStore('thumbnails').put({ ...value, used: Date.now() });
      tx.onerror = () => {}; tx.onabort = () => {};
      return this.remember(key, value.blob);
    } catch { return null; } // A missing/disabled cache never prevents a thumbnail.
  }
  async put(rootId, entry, blob) {
    if (!rootId || !blob || blob.size > MAX_BYTES) return;
    const key = thumbnailKey(rootId, entry); this.remember(key, blob);
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('thumbnails', 'readwrite'), store = tx.objectStore('thumbnails');
        store.put({ key, blob, used: Date.now() });
        const request = store.getAll();
        request.onsuccess = () => {
          const records = request.result.sort((a, b) => a.used - b.used);
          let count = records.length, bytes = records.reduce((sum, value) => sum + value.blob.size, 0);
          for (const value of records) {
            if (count <= MAX_ENTRIES && bytes <= MAX_BYTES) break;
            store.delete(value.key); count--; bytes -= value.blob.size;
          }
        };
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } catch { /* Fall back to the bounded in-memory cache if storage is full. */ }
  }
}
