import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
// Read the index so Windows checkout line endings do not change published hashes.
const entries = git('ls-files', '--stage', '-z').toString().split('\0').filter(Boolean).map(line => {
  const match = line.match(/^\d+ ([0-9a-f]+) 0\t(.+)$/);
  assert.ok(match, 'Resolve index conflicts before checking the distribution');
  return { sha: match[1], path: match[2] };
});
const batch = execFileSync('git', ['cat-file', '--batch'], {
  input: entries.map(entry => entry.sha + '\n').join(''), maxBuffer: 32 * 1024 * 1024
});
const files = new Map();
let offset = 0;
for (const entry of entries) {
  const end = batch.indexOf(10, offset);
  const [sha, type, size] = batch.subarray(offset, end).toString().split(' ');
  assert.equal(sha, entry.sha);
  assert.equal(type, 'blob', 'Only regular files are supported in the distribution');
  offset = end + 1;
  files.set(entry.path, batch.subarray(offset, offset + Number(size)));
  offset += Number(size) + 1;
}
const read = path => { assert.ok(files.has(path), `Missing staged file: ${path}`); return files.get(path); };
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, manifest.version, 'package.json and manifest.json versions differ');
const version = manifest.version;
assert.ok(read('README.md').toString().includes(`現在のバージョンは **${version}**`), 'README version differs');
assert.ok(read('README.md').toString().includes(` / ${version}**`), 'README installation version differs');
assert.ok(read('FEATURES.md').toString().startsWith(`# 全機能ガイド（${version}）`), 'FEATURES version differs');
assert.ok(read('DISTRIBUTION.md').toString().includes(`バージョン：**${version}**`), 'DISTRIBUTION version differs');

const paths = [...files.keys()]
  .filter(path => path !== 'CODE_HASHES.sha256' && !/^[^/]+\.md$/i.test(path)).sort();
const expected = paths.map(path => `${createHash('sha256').update(read(path)).digest('hex')}  ${path}\n`).join('');
if (process.argv.includes('--write')) {
  writeFileSync('CODE_HASHES.sha256', expected);
  console.log(`Updated hashes for ${paths.length} staged files (${version}). Stage CODE_HASHES.sha256 next.`);
} else {
  assert.equal(read('CODE_HASHES.sha256').toString().replace(/\r\n/g, '\n'), expected,
    'Distribution hashes are stale. Stage changes, run npm run distribution:hashes, then stage CODE_HASHES.sha256.');
  console.log(`Distribution ${version}: documentation and ${paths.length} file hashes match the staged snapshot.`);
}
