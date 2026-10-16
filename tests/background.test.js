import test from 'node:test';
import assert from 'node:assert/strict';
const event = () => ({ listeners:[], addListener(fn) { this.listeners.push(fn); } });
const session = {};
const saved = { enabled:true, root:'WebClass', site:'https://example.edu/webclass/', selector:'' };
let overrides = {};
globalThis.chrome = {
  storage:{ local:{get:async()=>({settings:saved,courseOverrides:overrides})}, session:{get:async()=>structuredClone(session),set:async v=>Object.assign(session,structuredClone(v)),clear:async()=>{delete session.intents;}},onChanged:event() },
  runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,onInstalled:event(),onStartup:event(),onMessage:event()},
  scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async()=>{},insertCSS:async()=>{}},
  permissions:{contains:async()=>true,onRemoved:event(),onAdded:event(),addHostAccessRequest:async()=>{}},
  tabs:{onRemoved:event(),onUpdated:event(),query:async()=>[],sendMessage:async()=>null,create:async value=>{ session.createdTab=value; }}, downloads:{onDeterminingFilename:event(),onChanged:event(),show:id=>{ session.shownDownload = id; },search:async()=>[]}
};
const { resolveCourse, requestForTab, matchesDownloadPath } = await import('../background.js');
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
  assert.deepEqual(requests, [{ tabId: 1, pattern: 'https://example.edu/webclass/*' }]);
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
