import { filename, segment } from './core.js';
let writes = Promise.resolve();
export async function saveInDirectory(directory, course, name, body, { allowDuplicate = false } = {}) {
  if (!directory || await directory.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    throw Error('保存先の書き込み許可がありません。設定で保存先を選び直してください。');
  }
  // Serialize allocation and writing so simultaneous downloads cannot overwrite each other.
  const job = writes.then(async () => {
    const folderName = segment(course, '未分類', 60);
    const folder = await directory.getDirectoryHandle(folderName, { create: true });
    const base = filename(name);
    let candidate = base;
    try {
      await folder.getFileHandle(base);
      if (!allowDuplicate) return { path: `${folderName}/${base}`, existing: true };
      const match = base.match(/^(.*?)(\.[a-zA-Z0-9]{1,12})$/);
      let available = false;
      for (let number = 1; number < 10000; number++) {
        candidate = `${match?.[1] || base} (${number})${match?.[2] || ''}`;
        try { await folder.getFileHandle(candidate); }
        catch (error) { if (error.name === 'NotFoundError') { available = true; break; } throw error; }
      }
      if (!available) throw Error('同名ファイルが多すぎるため保存できません。');
    } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    const path = `${folderName}/${candidate}`;
    const file = await folder.getFileHandle(candidate, { create: true });
    const writable = await file.createWritable();
    try {
      if (body?.pipeTo) await body.pipeTo(writable);
      else { await writable.write(body); await writable.close(); }
    } catch (error) { try { await writable.abort(); } catch {} throw error; }
    return { path, existing: false };
  });
  writes = job.catch(() => {});
  return job;
}
