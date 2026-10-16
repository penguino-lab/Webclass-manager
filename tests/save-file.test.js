import test from 'node:test';
import assert from 'node:assert/strict';
import { saveInDirectory } from '../save-file.js';
function fixture(permission = 'granted') {
  const files = new Map();
  const directory = { queryPermission: async () => permission, getDirectoryHandle: async name => {
    return { getFileHandle: async (file, options) => {
      const key = name + '/' + file;
      if (!files.has(key) && !options?.create) throw new DOMException('missing', 'NotFoundError');
      if (!files.has(key)) files.set(key, '');
      return { createWritable: async () => ({ write: async body => files.set(key, body), close: async () => {}, abort: async () => {} }) };
    } };
  } };
  return { directory, files };
}
test('chosen directory saves once and reports an existing duplicate without changing its bytes', async () => {
  const { directory, files } = fixture();
  const results = await Promise.all([saveInDirectory(directory, '数学/演習', 'NUL.pdf', 'first'), saveInDirectory(directory, '数学/演習', 'NUL.pdf', 'second')]);
  assert.deepEqual(results, [{ path: '数学_演習/_NUL.pdf', existing: false }, { path: '数学_演習/_NUL.pdf', existing: true }]);
  assert.deepEqual([...files.values()], ['first']);
  assert.deepEqual(await saveInDirectory(directory, '数学/演習', 'NUL.pdf', 'again', { allowDuplicate: true }), { path: '数学_演習/_NUL (1).pdf', existing: false });
  assert.deepEqual([...files.values()], ['first', 'again']);
});
test('lost write permission fails before creating any folder or file', async () => {
  const { directory, files } = fixture('prompt');
  await assert.rejects(saveInDirectory(directory, '数学', 'a.pdf', 'bytes'), /書き込み許可/);
  assert.equal(files.size, 0);
});
