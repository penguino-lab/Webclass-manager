import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalResourceKey, previewType, resourceExtension } from '../resource-tools.js';

test('resource identity keeps query parameters, origin and path case', () => {
  assert.equal(resourceExtension('Lecture.PDF?download=1'), 'pdf');
  assert.notEqual(
    canonicalResourceKey('https://school.test/webclass/download.php?file=%2Ftext%2Fcourse%2FSAME.PDF&token=one'),
    canonicalResourceKey('https://school.test/webclass/loadit.php?file=%2Ftext%2Fcourse%2Fsame.pdf&token=two')
  );
  assert.notEqual(canonicalResourceKey('https://school.test/download.php?id=1'), canonicalResourceKey('https://school.test/download.php?id=2'));
  assert.notEqual(canonicalResourceKey('https://school.test/a.pdf'), canonicalResourceKey('https://other.test/a.pdf'));
  assert.equal(canonicalResourceKey('https://school.test/a.pdf#page=1'), canonicalResourceKey('https://school.test/a.pdf#page=2'));
});

test('only browser-safe submission formats receive preview MIME types', () => {
  assert.equal(previewType('report.pdf', 'application/octet-stream'), 'application/pdf');
  assert.equal(previewType('photo.jpg', 'application/octet-stream'), 'image/jpeg');
  assert.equal(previewType('notes.txt', 'application/octet-stream'), 'text/plain;charset=utf-8');
  assert.equal(previewType('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), '');
  assert.equal(previewType('archive.zip', 'application/zip'), '');
});
