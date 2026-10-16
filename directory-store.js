// Handles are structured-cloned into IndexedDB, not JSON/chrome.storage.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('webclass-save-directory', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function directoryHandle(value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const write = value !== undefined;
      const tx = db.transaction('handles', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('handles');
      const request = write ? store.put(value, 'destination') : store.get('destination');
      tx.oncomplete = () => resolve(write ? value : request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error('保存先の登録に失敗しました。'));
    });
  } finally { db.close(); }
}
