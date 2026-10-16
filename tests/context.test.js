import test from 'node:test';
import assert from 'node:assert/strict';
import { courseId, contentsId, usableName } from '../core.js';
test('course IDs agree across course, generated download and nested PDF URLs', () => {
  assert.equal(courseId('https://school.test/webclass/course.php/26math/?acs_=dummy'), '26math');
  assert.equal(courseId('https://school.test/webclass/download.php/x?group_id=26math'), '26math');
  assert.equal(courseId('https://school.test/webclass/loadit.php?action=pdfViewer&file=%2Fwebclass%2Ftext%2F26%2F26math%2Fdummy%2Fhash.pdf'), '26math');
  assert.equal(courseId('https://school.test/webclass/loadit.php?group_id=26stats&file=%2Fwebclass%2Ftext%2F26%2F26math%2Fdummy%2Fhash.pdf'), '');
  assert.equal(contentsId('https://school.test/webclass/txtbk_frame.php?set_contents_id=dummy1'), 'dummy1');
  assert.equal(contentsId('https://school.test/webclass/file_down.php?contents_id=dummy1&acs_=dummy'), 'dummy1');
});
test('generic download window headings are never course names', () => {
  for (const value of ['ファイルのダウンロード', 'PDF.js viewer', 'WebClass', 'ログイン']) assert.equal(usableName(value), false);
  assert.equal(usableName('リスク＆クライシスマネジメント'), true);
});
