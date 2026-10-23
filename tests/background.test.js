import test from 'node:test';
import assert from 'node:assert/strict';
const event = () => ({ listeners:[], addListener(fn) { this.listeners.push(fn); } });
const session = {};
const saved = { enabled:true, root:'WebClass', site:'https://example.edu/webclass/', selector:'' };
let overrides = {};
globalThis.chrome = {
  action:{onClicked:event()},
  contextMenus:{onClicked:event(),removeAll:async()=>{},create:value=>{session.actionMenu=value;}},
  storage:{ local:{get:async()=>({settings:saved,courseOverrides:overrides})}, session:{get:async()=>structuredClone(session),set:async v=>Object.assign(session,structuredClone(v)),clear:async()=>{delete session.intents;}},onChanged:event() },
  runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,getContexts:async()=>[{contextType:'OFFSCREEN_DOCUMENT'}],sendMessage:async value=>{session.runtimeMessage=value;return value.type==='preview-job'?{ok:true,url:'blob:preview',token:'preview-token'}:{accepted:true};},onInstalled:event(),onStartup:event(),onMessage:event()},
  offscreen:{createDocument:async()=>{}},
  scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async()=>{},removeCSS:async()=>{},insertCSS:async()=>{}},
  permissions:{contains:async()=>true,onRemoved:event(),onAdded:event(),addHostAccessRequest:async()=>{}},
  tabs:{onRemoved:event(),onUpdated:event(),onActivated:event(),query:async()=>[],sendMessage:async()=>null,create:async value=>{ session.createdTab=value; return {id:99,...value}; }}, downloads:{onDeterminingFilename:event(),onChanged:event(),show:id=>{ session.shownDownload = id; },search:async()=>[]}
};
const { resolveCourse, requestForTab, matchesDownloadPath } = await import('../background.js');
test('startup reapplies typography to existing origin-wide windows at USER priority', async()=>{
  const originalQuery=chrome.tabs.query, originalInsert=chrome.scripting.insertCSS;
  const calls=[];
  chrome.tabs.query=async filter=>{
    if (!filter.url) return [];
    assert.equal(filter.url,'https://example.edu/*');
    return [{id:7,url:'https://example.edu/legacy-messages.php'}];
  };
  chrome.scripting.insertCSS=async options=>calls.push(options);
  try {
    await chrome.runtime.onStartup.listeners[0]();
    assert.deepEqual(calls,[{target:{tabId:7,allFrames:true},files:['typography.css'],origin:'USER'}]);
  } finally {
    chrome.tabs.query=originalQuery;
    chrome.scripting.insertCSS=originalInsert;
  }
});

test('toolbar opens the configured university and the action context menu opens the library', async()=>{
  await chrome.action.onClicked.listeners[0]();
  assert.equal(session.createdTab.url,saved.site);
  chrome.contextMenus.onClicked.listeners[0]({menuItemId:'webclass-open-library'});
  assert.equal(session.createdTab.url,'chrome-extension://test-extension/library.html');
});
const sender = { id:'test-extension',tab:{id:1},url:'https://example.edu/webclass/course?id=1' };
function intent() { return new Promise(resolve=>chrome.runtime.onMessage.listeners[0]({type:'intent',course:{name:'数学'},target:'https://example.edu/download/1'},sender,resolve)); }
function download(overrides={}) {
  return new Promise(resolve => {
    const asyncResult = chrome.downloads.onDeterminingFilename.listeners[0]({url:'https://example.edu/download/1',referrer:sender.url,filename:'C:\\Downloads\\lecture.pdf',startTime:new Date().toISOString(),...overrides},resolve);
    assert.equal(asyncResult,true);
  });
}
test('worker accepts one verified download, consumes intent, respects OFF and external referrer', async()=>{
  await intent();
  assert.equal(await download({referrer:'https://other.edu/'}),undefined);
  assert.deepEqual(await download(),{filename:'数学/lecture.pdf',conflictAction:'uniquify'});
  assert.equal(await download(),undefined);
  await intent(); saved.enabled=false;
  assert.equal(await download(),undefined);
  saved.enabled=true;
});
test('course identity crosses attachment windows and PDF frames without inheriting another course', async () => {
  session.courses = {}; session.materials = {};
  await resolveCourse({ course: { name: '数学', id: '26math', source: '.course-name' }, contentsId: 'material1' }, { url: 'https://example.edu/webclass/course.php/26math/' });
  const popup = { url: 'https://example.edu/webclass/file_down.php?contents_id=material1&acs_=dummy' };
  assert.equal((await resolveCourse({}, popup)).name, '数学');
  assert.equal(await resolveCourse({}, { url: 'https://example.edu/webclass/file_down.php?contents_id=other' }), null);
  assert.equal(await resolveCourse({}, { url: 'https://other.edu/webclass/file_down.php?contents_id=material1' }), null);
  const viewer = { url: 'https://example.edu/webclass/loadit.php?action=pdfViewer&file=%2Fwebclass%2Ftext%2F26%2F26math%2Fmock%2Fhash.pdf' };
  assert.equal((await resolveCourse({}, viewer)).name, '数学');
  assert.equal(await resolveCourse({ courseId: '26stats', course: { name: '統計学' } }, viewer), null);
  overrides = { 'https://example.edu|26math': '数学演習' };
  assert.equal((await resolveCourse({}, popup)).name, '数学演習');
  await resolveCourse({ courseId: '26math', course: { name: '数学演習', source: 'この講義で指定した講義名' } }, viewer);
  overrides = {};
  assert.equal((await resolveCourse({}, popup)).name, '数学');
});
test('ambiguous material IDs are rejected and site visits request access without settings submit', async () => {
  session.materials = {};
  await resolveCourse({ course: { name: '数学', id: '26math' }, contentsId: 'shared' }, { url: 'https://example.edu/webclass/course.php/26math/' });
  await resolveCourse({ course: { name: '統計学', id: '26stats' }, contentsId: 'shared' }, { url: 'https://example.edu/webclass/course.php/26stats/' });
  assert.equal(await resolveCourse({}, { url: 'https://example.edu/webclass/file_down.php?contents_id=shared' }), null);
  const requests = []; chrome.permissions.contains = async () => false;
  chrome.permissions.addHostAccessRequest = async value => requests.push(value);
  await requestForTab({ id: 1, url: 'https://example.edu/webclass/course.php/26math/' });
  await requestForTab({ id: 2, url: 'https://example.edu/outside/' });
  await requestForTab({ id: 3, url: 'https://other.edu/webclass/' });
  assert.deepEqual(requests, [{ tabId: 1, pattern: 'https://example.edu/webclass/*' }, { tabId: 3, pattern: 'https://other.edu/webclass/*' }]);
  chrome.permissions.contains = async () => true;
});
test('about:blank frames require a Chrome-verified live URL and matching document ID', async () => {
  await resolveCourse({ course: { name: '数学', id: '26math' } }, { url: 'https://example.edu/webclass/course.php/26math/' });
  const blank = { ...sender, url: 'about:blank', origin: 'https://example.edu', documentId: 'document1', frameId: 7 };
  chrome.scripting.executeScript = async () => [{ documentId: 'document1', result: 'https://example.edu/webclass/loadit.php?action=pdfViewer&file=%2Fwebclass%2Ftext%2F26%2F26math%2Fmock%2Fhash.pdf' }];
  const message = data => new Promise(resolve => chrome.runtime.onMessage.listeners[0]({ type: 'resolve-course' }, data, resolve));
  assert.equal((await message(blank)).course.name, '数学');
  assert.equal((await message({ ...blank, documentId: 'stale' })).ok, false);
  assert.equal((await message({ ...blank, origin: 'https://outside.edu' })).ok, false);
});
test('session intent survives worker reload and ambiguous tabs are rejected', async()=>{
  session.intents=[];
  await intent();
  await import('../background.js?restart');
  const answer = await new Promise(resolve=>chrome.downloads.onDeterminingFilename.listeners[1]({url:'https://example.edu/download/1',referrer:sender.url,filename:'lecture.pdf',startTime:new Date().toISOString()},resolve));
  assert.equal(answer.filename,'数学/lecture.pdf');
  await intent(); await intent();
  assert.equal(await download(),undefined);
});
test('attachment button creates course folder even when generated target differs', async()=>{
  session.intents=[];
  await new Promise(resolve=>chrome.runtime.onMessage.listeners[0]({type:'intent',course:{name:'自然言語処理'},target:null,fallback:true},sender,resolve));
  const result = await download({url:'https://example.edu/webclass/generated-file',filename:'lecture01.pdf'});
  assert.deepEqual(result,{filename:'自然言語処理/lecture01.pdf',conflictAction:'uniquify'});
  assert.equal(session.lastResult.code,'suggested');
});
test('completed extension downloads can reveal their file location only from the source tab', async()=>{
  session.completedDownloads = { job1: { downloadId: 42, tab: 1, time: Date.now() } };
  const message = (value, from=sender) => new Promise(resolve=>chrome.runtime.onMessage.listeners[0](value,from,resolve));
  assert.equal((await message({type:'open-download-location',jobId:'job1'})).ok,true);
  assert.equal(session.shownDownload,42);
  assert.equal((await message({type:'open-download-location',jobId:'job1'},{...sender,tab:{id:2}})).ok,false);
  session.completedDownloads.job1.time = Date.now() - 600001;
  assert.equal((await message({type:'open-download-location',jobId:'job1'})).ok,false);
});
test('duplicate download paths are matched safely and request an explicit re-download', async()=>{
  assert.equal(matchesDownloadPath('C:\\Users\\me\\Downloads\\数学\\資料.PDF','数学/資料.pdf'),true);
  assert.equal(matchesDownloadPath('C:\\Users\\me\\Downloads\\数学II\\資料.pdf','数学/資料.pdf'),false);
  session.jobs = { job2: { tab: 1, frame: 0, saveMode: 'browser', time: Date.now() } };
  chrome.downloads.search = async()=>[{id:77,filename:'C:\\Users\\me\\Downloads\\数学\\資料.pdf',exists:true,state:'complete'}];
  const sent = []; chrome.tabs.sendMessage = async (...args) => { sent.push(args); };
  const internal = {id:'test-extension',url:'chrome-extension://test-extension/offscreen.html'};
  const call = (value,from) => new Promise(resolve=>chrome.runtime.onMessage.listeners[0](value,from,resolve));
  assert.deepEqual(await call({type:'save-progress',jobId:'job2',loaded:50,total:100,percent:50},internal),{ok:true});
  assert.deepEqual(sent.at(-1)[1],{type:'save-progress',jobId:'job2',loaded:50,total:100,percent:50});
  assert.deepEqual(await call({type:'browser-check',jobId:'job2',path:'数学/資料.pdf'},internal),{duplicate:true});
  assert.equal(session.jobs.job2,undefined);
  assert.equal(sent.at(-1)[1].canRedownload,true);
});
test('bulk downloads are scoped to the active material using Chrome-provided frame URLs', async () => {
  const call = (value, from) => new Promise(resolve => chrome.runtime.onMessage.listeners[0](value, from, resolve));
  const chapter = 'https://example.edu/webclass/txtbk_show_chapter.php?contents_id=math1';
  const top = 'https://example.edu/webclass/txtbk_frame.php?set_contents_id=math1';
  const from = { ...sender, url: chapter, tab: { id: 1, url: top }, frameId: 2 };
  const context = { course: { name: '数学', id: '26math', source: '#WsTitle h1' }, courseId: '26math', materialName: '第1回' };
  const accepted = await call({ type: 'bulk-download', context, resources: [{kind:'pdf',url:'https://example.edu/webclass/text/26/26math/mock/chapter.pdf',name:'第1章.pdf'},{kind:'pdf',url:'https://example.edu/webclass/text/26/other/mock/chapter.pdf',name:'別講義.pdf'}], materials: [{ url: 'https://outside.test/material' }] }, from);
  assert.equal(accepted.ok, true);
  assert.equal(session.runtimeMessage.job.materialId, 'math1');
  assert.deepEqual(session.runtimeMessage.job.resources.map(item => item.name), ['第1章.pdf']);
  assert.deepEqual(session.runtimeMessage.job.materials.map(item => item.url), [chapter, top]);
  await call({ type: 'bulk-download', context }, { ...from, tab: { id: 1, url: top.replace('math1', 'other') } });
  assert.deepEqual(session.runtimeMessage.job.materials.map(item => item.url), [chapter]);
  assert.equal((await call({ type: 'bulk-download', context }, { ...from, url: 'https://example.edu/webclass/course.php/26math/' })).ok, false);
});
test('submission preview accepts safe same-site files and opens the returned blob tab', async () => {
  const call = value => new Promise(resolve => chrome.runtime.onMessage.listeners[0](value, sender, resolve));
  assert.equal((await call({ type: 'preview-submission', url: 'https://example.edu/webclass/download.php/report.txt', name: 'report.txt', kind: 'file' })).ok, true);
  assert.equal(session.runtimeMessage.type, 'preview-job');
  assert.equal(session.createdTab.url, 'blob:preview');
  assert.equal((await call({ type: 'preview-submission', url: 'https://example.edu/webclass/download.php/report.docx', name: 'report.docx', kind: 'file' })).ok, false);
  assert.equal((await call({ type: 'preview-submission', url: 'https://outside.test/report.pdf', name: 'report.pdf', kind: 'file' })).ok, false);
});
