// A directory identity keeps tags and favorites separate even when roots share a name.
export async function rootIdentity(handle) {
  return navigator.locks.request('webclass-library-root', async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('webclass-library', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('roots', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const roots = await new Promise((resolve, reject) => {
        const request = db.transaction('roots').objectStore('roots').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      for (const root of roots) {
        try { if (await handle.isSameEntry(root.handle)) return root.id; } catch { /* Removed roots may no longer resolve. */ }
      }
      const id = crypto.randomUUID();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('roots', 'readwrite'); tx.objectStore('roots').put({ id, handle });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      return id;
    } finally { db.close(); }
  });
}
