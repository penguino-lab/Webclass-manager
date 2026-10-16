import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbnailKey, ThumbnailCache } from '../library-thumbnail-cache.js';

test('thumbnail keys change with root, path, size or modification time', () => {
  const entry = { path: '講義/資料.pdf', size: 100, modified: 200 };
  const key = thumbnailKey('one', entry);
  for (const candidate of [thumbnailKey('two', entry), thumbnailKey('one', { ...entry, path: '別講義/資料.pdf' }), thumbnailKey('one', { ...entry, size: 101 }), thumbnailKey('one', { ...entry, modified: 201 })]) assert.notEqual(candidate, key);
  assert.equal(thumbnailKey('one', { ...entry }), key);
});

test('cache failures fall back to generation; memory reuse is bounded and invalidates changed files', async () => {
  const cache = new ThumbnailCache(), entry = { path: '資料.pdf', size: 100, modified: 200 }, blob = new Blob(['preview']);
  assert.equal(await cache.get('root', entry), null, 'no IndexedDB in Node is a recoverable cache miss');
  await cache.put('root', entry, blob); assert.equal(await cache.get('root', entry), blob);
  assert.equal(await cache.get('root', { ...entry, modified: 201 }), null);
  for (let i = 0; i < 80; i++) await cache.put('root', { ...entry, path: `${i}.pdf` }, blob);
  assert.equal(cache.peek('root', entry), null, 'old in-memory previews are evicted');
  assert.equal(cache.peek('root', { ...entry, path: '79.pdf' }), blob);
});
