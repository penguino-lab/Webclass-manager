import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import '../webclass-adapter.js';
const adapter = globalThis.WebClassAdapter;
test('standalone classic adapter works without a separate global helper, including reinjection', () => {
  const isolated = { URL };
  const source = readFileSync(new URL('../webclass-adapter.js', import.meta.url), 'utf8');
  const doc = { URL: 'https://school.test/webclass/course.php/26math/', title: '数学 | WebClass', querySelector: () => null };
  for (let i = 0; i < 2; i++) {
    runInNewContext(source, isolated);
    assert.equal(isolated.WebClassContext, undefined);
    const result = isolated.WebClassAdapter.context(doc);
    assert.equal(result.courseId, '26math');
    // The title fallback is deliberately excluded when a course ID is available.
    assert.equal(result.course, null);
    doc.querySelector = selector => selector === '.course-name' ? { textContent: '数学', getAttribute: () => null } : null;
    assert.equal(isolated.WebClassAdapter.context(doc).course.name, '数学');
    doc.querySelector = () => null;
  }
});

test('material frames recover the course from WsTitle h1 and the material from WsTitle h2', () => {
  const node = textContent => ({ textContent, getAttribute: () => null });
  const top = { URL: 'https://school.test/webclass/txtbk_frame.php?set_contents_id=math1', title: 'WebClass', querySelector: () => null };
  const chapter = { ...top, URL: 'https://school.test/webclass/txtbk_show_chapter.php?contents_id=math1',
    querySelector: selector => selector === '#WsTitle h1' ? node(' > 数学（後期）') :
      selector.includes('#WsTitle h2') ? node('補足資料') : null };
  const viewer = { ...top, URL: 'https://school.test/webclass/loadit.php?action=pdfViewer&file=%2Fwebclass%2Ftext%2F26%2F26math%2Fdummy%2Fhash.pdf', title: 'PDF.js viewer',
    querySelector: selector => selector === 'h1' ? node('資料のタイトル') : null };
  const win = { document: top, frames: [{ document: chapter, frames: [] }, { document: viewer, frames: [] }] };
  win.top = win;
  for (const doc of [top, chapter, viewer]) doc.defaultView = win;
  for (const doc of [top, chapter, viewer]) {
    const result = adapter.context(doc);
    assert.equal(result.course.name, '数学（後期）');
    assert.equal(result.course.source, '#WsTitle h1');
    assert.equal(result.courseId, '26math');
    assert.equal(result.contentsId, 'math1');
    assert.equal(result.materialName, '補足資料');
  }
});
test('selector priority and title fallback', () => {
  const doc = { title:'線形代数 | WebClass', querySelector:() => null };
  assert.equal(adapter.course(doc).name,'線形代数');
  doc.querySelector = s => s === '.custom' ? {textContent:'統計学',getAttribute:()=>null} : null;
  assert.equal(adapter.course(doc,'.custom').name,'統計学');
  doc.title = 'WebClass'; doc.querySelector = () => null;
  assert.equal(adapter.course(doc),null);
});
test('download heading and PDF document titles cannot masquerade as courses', () => {
  const doc = { URL: 'https://school.test/webclass/file_down.php', title: 'ファイルのダウンロード', querySelector: () => ({ textContent: 'ファイルのダウンロード', getAttribute: () => null }) };
  assert.equal(adapter.course(doc), null);
  doc.URL = 'https://school.test/webclass/loadit.php?action=pdfViewer'; doc.title = '0123456789.pdf'; doc.querySelector = () => null;
  assert.equal(adapter.course(doc), null);
});
test('PDF save and attachment interception are limited to known WebClass controls and ordinary left clicks', () => {
  const doc = { URL: 'https://school.test/webclass/loadit.php?action=pdfViewer&file=%2Fwebclass%2Ftext%2F26%2F26math%2Fdummy%2Fhash.pdf', baseURI: 'https://school.test/webclass/' };
  const button = { id: 'downloadButton' }, event = { type: 'click', button: 0, target: { closest: () => button } };
  assert.deepEqual(adapter.directAction(event, doc, { materialName: '第4回授業', sectionName: '授業資料' }), { kind: 'pdf', url: 'https://school.test/webclass/text/26/26math/dummy/hash.pdf', name: '第4回授業_授業資料.pdf' });
  assert.equal(adapter.directAction({ ...event, ctrlKey: true }, doc, {}), null);
  assert.equal(adapter.directAction({ ...event, type: 'auxclick', button: 1 }, doc, {}), null);
  button.id = 'unrelated'; assert.equal(adapter.directAction(event, doc, {}), null);
  button.href = 'https://school.test/webclass/file_down.php?target_type=attach&file_name=sample.pdf';
  assert.equal(adapter.directAction(event, doc, {}).kind, 'attachment');
  button.href = 'https://outside.test/webclass/file_down.php?target_type=attach';
  assert.equal(adapter.directAction(event, doc, {}), null);
});
test('invalid selector falls back; non-HTTP links rejected', () => {
  const doc = { title:'情報科学 — WebClass', querySelector:() => {throw Error('bad selector');} };
  assert.equal(adapter.course(doc,'[').name,'情報科学');
  assert.equal(adapter.downloadTarget({target:{closest:()=>({href:'javascript:void(0)'})}},doc),null);
});
test('attachment button and POST form action are detected without reading inputs', () => {
  const button = {textContent:'添付資料をダウンロード',hasAttribute:()=>false};
  const doc = {baseURI:'https://example.edu/webclass/'};
  const target = {closest:s=>s === 'a[href]' ? null : button};
  assert.deepEqual(adapter.downloadAction({type:'click',target},doc),{target:null,fallback:true});
  const form = {action:'https://example.edu/webclass/download.php',closest:()=>null};
  Object.defineProperty(form,'elements',{get(){throw Error('Must not read form inputs');}});
  assert.deepEqual(adapter.downloadAction({type:'submit',target:form,submitter:button},doc),{target:form.action,fallback:true});
  button.textContent='ログイン';
  assert.equal(adapter.downloadAction({type:'submit',target:form,submitter:button},doc),null);
});
test('submitted PDF, image, and text links can be previewed without intercepting Office files', () => {
  const link = {
    href: 'https://school.test/webclass/download.php/report.txt?file=submitted', textContent: 'report.txt',
    getAttribute: () => '', closest: selector => selector === 'a[href]' ? link : { textContent: '提出済みファイル report.txt' }
  };
  const doc = { URL: 'https://school.test/webclass/report.php', baseURI: 'https://school.test/webclass/', title: 'マイレポート', querySelector: () => null };
  const event = { type: 'click', button: 0, target: { closest: selector => selector === 'a[href]' ? link : null } };
  assert.deepEqual(adapter.submissionPreviewAction(event, doc), { url: link.href, name: 'report.txt', kind: 'file' });
  link.href = 'https://school.test/webclass/download.php/report.docx'; link.textContent = 'report.docx';
  assert.equal(adapter.submissionPreviewAction(event, doc), null);
  link.href = 'https://outside.test/report.pdf'; link.textContent = 'report.pdf';
  assert.equal(adapter.submissionPreviewAction(event, doc), null);
});
