import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalResourceKey, previewType, resourceExtension } from '../resource-tools.js';

test('resource URLs are normalized for duplicate detection', () => {
  assert.equal(resourceExtension('Lecture.PDF?download=1'), 'pdf');
  assert.equal(
    canonicalResourceKey('https://school.test/webclass/download.php?file=%2Ftext%2Fcourse%2FSAME.PDF&token=one'),
    canonicalResourceKey('https://school.test/webclass/loadit.php?file=%2Ftext%2Fcourse%2Fsame.pdf&token=two')
  );
});

test('only browser-safe submission formats receive preview MIME types', () => {
  assert.equal(previewType('report.pdf', 'application/octet-stream'), 'application/pdf');
  assert.equal(previewType('photo.jpg', 'application/octet-stream'), 'image/jpeg');
  assert.equal(previewType('notes.txt', 'application/octet-stream'), 'text/plain;charset=utf-8');
  assert.equal(previewType('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), '');
  assert.equal(previewType('archive.zip', 'application/zip'), '');
});
