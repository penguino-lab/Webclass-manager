import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const artifacts = resolve(source, '..', 'tmp', 'bulk-qa');
await mkdir(artifacts, { recursive: true });
const sandbox = await mkdtemp(join(artifacts, 'run-'));
const extension = join(sandbox, 'extension');
await cp(source, extension, { recursive: true, filter: path => !['.git', 'node_modules'].includes(path.split(/[\\/]/).pop()) });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const html = body => `<!doctype html><html><meta charset="utf-8"><body>${body}</body></html>`;
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const variant = url.searchParams.get('contents_id') || url.searchParams.get('set_contents_id') || 'only';
  const file = `/webclass/text/26/26math/mock/${variant}.pdf`;
  let body;
  if (url.pathname === '/webclass/txtbk_frame.php') {
    body = `<!doctype html><html><frameset cols="40%,60%"><frame name="webclass_chapter" src="txtbk_show_chapter.php?contents_id=${variant}&group_id=26math"><frame name="webclass_content" src="txtbk_show_text.php?contents_id=${variant}&group_id=26math"></frameset></html>`;
  } else if (url.pathname === '/webclass/txtbk_show_chapter.php') {
    const count = variant === 'mixed' || variant === 'same-url' ? 3 : variant === 'stuck' ? 2 : 1;
    const rows = Array.from({ length: count }, (_, i) => `<tr ${i === 0 ? 'class="bkkhaki"' : ''}><td>第${i + 1}節</td><td>資料${i + 1}</td><td><input type="button" name="clickpage" value="${i}" onclick="document.querySelector('.bkkhaki')?.classList.remove('bkkhaki');this.closest('tr').classList.add('bkkhaki');${variant === 'stuck' ? '' : `parent.frames.webclass_content.location.href='txtbk_show_text.php?contents_id=${variant}&chapter=${i}'`}"></td><td><a href="file_down.php?target_type=attach&contents_id=${variant}&file=${i}&file_name=attachment.pdf">添付資料</a></td></tr>`).join('');
    body = html(`<div id="WsTitle"><h1>&gt; 数学</h1><h2>${variant}</h2></div><table id="TOCLayout">${rows}</table>`);
  } else if (url.pathname === '/webclass/txtbk_show_text.php') {
    const chapter = Number(url.searchParams.get('chapter') || 0);
    if (variant === 'only' || variant === 'mixed' && chapter === 1) body = html('<p>添付資料をご覧ください。</p>');
    else {
      res.writeHead(302, { Location: `loadit.php?action=pdfViewer&file=${encodeURIComponent(file)}&chapter=${chapter}` }); res.end(); return;
    }
  } else if (url.pathname === '/webclass/loadit.php') body = html('<button id="downloadButton">PDF</button>');
  else if (url.pathname === '/webclass/file_down.php') {
    body = html(`<a href="download.php/attachment.pdf?contents_id=${variant}&file=${url.searchParams.get('file')}&group_id=26math">attachment.pdf</a>`);
  } else if (url.pathname.startsWith('/webclass/download.php/') || url.pathname.startsWith('/webclass/text/')) {
    requests.push(url.pathname + url.search);
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    // Same-name attachments have different bytes in mixed; exact equality in same.
    res.end(`%PDF-1.4\n${url.pathname.startsWith('/webclass/download.php/') ? (variant === 'same' ? 'same' : `attachment-${variant}-${url.searchParams.get('file')}`) : url.pathname.split('/').pop().replace('.pdf', '')}\n%%EOF`);
    return;
  } else body = html('<p>dummy</p>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}/webclass/`;
let context;
try {
  const browserChoice = process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chromium' };
  context = await chromium.launchPersistentContext(join(sandbox, 'profile'), { ...browserChoice, headless: true, args: [`--load-extension=${extension}`], ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/library.html`);
  await options.evaluate(async site => {
    const { directoryHandle } = await import('./directory-store.js');
    await directoryHandle(await navigator.storage.getDirectory());
    await chrome.storage.local.set({ settings: { enabled: true, site, saveMode: 'directory' } });
  }, site);
  await assert.doesNotReject(async () => {
    await options.waitForFunction(async () => (await chrome.scripting.getRegisteredContentScripts()).some(s => s.js.includes('content.js')));
  });
  for (const [variant, expected] of [['only', 1], ['same', 1], ['different', 2], ['mixed', 4], ['same-url', 4], ['stuck', 3]]) {
    const page = await context.newPage();
    await options.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    });
    await page.goto(site + 'txtbk_frame.php?set_contents_id=' + variant);
    const chapter = page.frameLocator('frame[name="webclass_chapter"]');
    const button = chapter.locator('#wcl-material-bulk');
    await button.waitFor();
    const started = Date.now();
    await button.click();
    await chapter.getByText(/一括ダウンロードが完了しました/).waitFor({ timeout: 20000 });
    const message = await chapter.locator('#webclass-save-notice').innerText();
    assert.match(message, new RegExp(`保存 ${expected}件`), variant);
    assert.match(message, /失敗 0件/, variant);
    assert.equal(await button.isEnabled(), true);
    const files = await options.evaluate(async () => {
      const root = await navigator.storage.getDirectory(), result = [];
      const folder = await root.getDirectoryHandle('数学');
      for await (const [name, handle] of folder.entries()) result.push({ name, text: await (await handle.getFile()).text() });
      return result;
    });
    assert.equal(files.length, expected, variant);
    assert.equal(new Set(files.map(file => file.text)).size, expected, 'saved bytes are unique');
    if (variant === 'same') assert.equal(files[0].name, 'attachment.pdf', 'prefer original attachment name');
    if (variant === 'only') assert.ok(Date.now() - started < 5000, 'absence of a PDF does not incur the timeout');
    await page.screenshot({ path: join(sandbox, `${variant}.png`) });
    console.log(`PASS ${variant}: ${message.split('\n')[0]}`);
    await page.close();
  }
  assert.ok(requests.some(url => url.includes('file=0')) && requests.some(url => url.includes('file=1')), 'query-distinct same-name attachments both fetched');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
