import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { courseFixture } from './course-fixture.js';
const courses = { '26math': '数学', '26stats': '統計学' };
const courseFor = content => content?.startsWith('stats') ? '26stats' : '26math';
const hash = '0123456789abcdef0123456789abcdef.pdf';
function dummyPDF() {
  const stream = 'BT /F1 18 Tf 50 750 Td (WebClass test material) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
const pdf = dummyPDF();
const html = (title, body) => `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${title}</title><body>${body}</body></html>`;
export function createDemoServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const content = u.searchParams.get('contents_id') || u.searchParams.get('set_contents_id') || 'math1';
    const id = courseFor(content), name = courses[id];
    const file = u.searchParams.get('file') || `/webclass/text/26/${id}/demo/${hash}`;
    const material = '第4回授業';
    const attachmentName = '第4回_添付資料.pdf';
    const attach = '/webclass/file_down.php?' + new URLSearchParams({ target_type: 'attach', file: 'demo-' + content, contents_id: content, file_name: attachmentName });
    const load = '/webclass/loadit.php?' + new URLSearchParams({ file, lang: 'JAPANESE' });
    let body;
    if (u.pathname.startsWith('/webclass/download.php/') || u.pathname.startsWith('/webclass/text/')) {
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${hash}"; filename*=UTF-8''${encodeURIComponent(u.pathname.startsWith('/webclass/download.php/') ? attachmentName : hash)}` });
      res.end(pdf); return;
    }
    if (u.pathname === '/webclass/course.php/26demo/') {
      body = html('講義ページの検証', courseFixture({ staged: u.searchParams.has('staged'), empty: u.searchParams.has('empty') }));
    } else if (u.pathname === '/webclass/txtbk_frame.php') {
      body = `<!doctype html><html><head><title>${name} | WebClass</title></head><frameset rows="55,*"><frame src="/webclass/title_simple.php"><frameset cols="25%,75%"><frame name="webclass_chapter" src="/webclass/txtbk_show_chapter.php?contents_id=${content}"><frame name="webclass_content" src="/webclass/txtbk_show_text.php?contents_id=${content}"></frameset></frameset></html>`;
    } else if (u.pathname === '/webclass/txtbk_show_chapter.php') {
      const variant = content.split('-')[1] || '';
      const titles = variant === 'chapters' ? ['', '', '', ''] : variant === 'unnamed' ? [''] : variant === 'numbers' ? ['', ''] : variant === 'mixed' ? ['', '練習問題'] : ['授業資料', 'パワポ資料_第1回', 'パワポ資料_第2回', '演習用ファイル'];
      const rows = titles.map((title, i) => {
        const chapter = variant === 'chapters' || variant === 'mixed' && i === 0;
        const label = chapter ? `第${i}章` : variant === 'numbers' ? '' : `第${i + 1}節`;
        const titleCells = chapter ? `<td><span class="size3">${label}</span></td><td colspan="2"><span class="size3">${title}</span></td>` : `<td><br></td><td><span class="size2">${label}</span></td> <td width="90%"><span class="size2">${title}<br></span></td>`;
        const pageAttribute = variant === 'numbers' || variant === 'mixed' ? '' : `data-page="${i + 1}"`;
        const attachment = i === titles.length - 1 && variant !== 'numbers' ? `<a id="attachment" href="${attach.replaceAll('&', '&amp;')}" target="download" onclick="window.open(this.href,'download','width=400,height=400');return false">添付資料</a>` : '<br>';
        return `<tr ${i === 0 ? 'class="bkkhaki"' : ''} ${pageAttribute}>${titleCells}<td><input type="button" name="clickpage" value=" ${i + 1} " onclick="document.querySelector('.bkkhaki')?.classList.remove('bkkhaki');this.closest('tr').classList.add('bkkhaki');window.nativeClicks=(window.nativeClicks||0)+1;window.nativePage=this.value.trim()"></td><td>${attachment}</td></tr>`;
      }).join('');
      const navigation = '<hr><table id="naviLayout"><tr><td><button type="button" id="PrevButton">前のページ</button></td><td><button type="button" id="NextButton">次のページ</button></td></tr><tr><td colspan="2"><br></td></tr><tr><td><input name="hide_content" type="button" value="目次を隠す"></td><td><input name="quit" type="button" value="資料を閉じる"></td></tr></table>';
      body = html('WebClass', `<style>body{margin:0;background:#eee;font:14px system-ui}#top{min-height:200px}#WsTitle{background:#1365b5;color:white;padding:12px}#WsTitle h1{font-size:16px}#WsTitle h2{font-size:14px}.size2{font-size:11px}#TOCLayout td{padding:2px}.bkkhaki{background:khaki}</style><div id="top"><div id="WsTitle" class="bgc_sub"><h1>&gt; ${name}</h1><h2>${material}</h2></div>${navigation}</div><div id="TOC"><div style="height:10px">&nbsp;</div><table id="TOCLayout"><tbody>${rows}</tbody></table></div>`);
    } else if (u.pathname === '/webclass/txtbk_show_text.php') {
      res.writeHead(302, { Location: load }); res.end(); return;
    } else if (u.pathname === '/webclass/loadit.php') {
      if (!u.searchParams.get('action')) body = `<!doctype html><html><frameset rows="40,*"><frame src="${load}&action=providePDF"><frame src="${load}&action=pdfViewer"></frameset></html>`;
      else if (u.searchParams.get('action') === 'providePDF') body = html('PDFの案内', '<p>表示に問題があるときは別ウィンドウで開いてください。</p>');
      else body = html('PDF.js viewer', `<button id="downloadButton" title="保存します"><span>保存</span></button><div id="viewer"><h1>検証用PDF</h1><p>この画面はPDF.jsの保存操作を再現した検証用ページです。</p></div><script>document.getElementById('downloadButton').onclick=()=>{const a=document.createElement('a');a.href=${JSON.stringify(file)};a.download='${hash}';a.click();};</script>`);
    } else if (u.pathname === '/webclass/file_down.php') {
      const download = '/webclass/download.php/' + encodeURIComponent(attachmentName) + '?' + new URLSearchParams({ file: 'demo-' + content, contents_id: content, group_id: id });
      body = html('ファイルのダウンロード', `<h1>ファイルのダウンロード</h1><a href="${download.replaceAll('&', '&amp;')}"><span>${attachmentName}</span></a>`);
    } else if (u.pathname === '/webclass/title_simple.php') body = html('WebClass', '<div id="ContentQuitMenu"><input type="button" name="quit_contents" value="資料を閉じる" onclick="top.location.href=\'/webclass/course.php/26math/\'"></div>');
    else if (u.pathname.startsWith('/outside')) body = html('対象外ページ', '<h1>対象外ページ</h1>');
    else {
      const current = u.pathname.includes('26stats') || u.pathname.includes('stats') ? '26stats' : '26math';
      const contents = current === '26stats' ? 'stats1' : 'math1';
      body = html(courses[current] + ' | WebClass', `<a class="course-name" href="/webclass/course.php/${current}/">${courses[current]}</a><h1>教材一覧</h1><a id="material" href="/webclass/txtbk_frame.php?set_contents_id=${contents}">第4回授業を開く</a><p><a href="/webclass/course.php/26math/">数学</a> / <a href="/webclass/course.php/26stats/">統計学</a></p>`);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body);
  });
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  createDemoServer().listen(8765, '127.0.0.1', () => console.log('Demo: http://127.0.0.1:8765/webclass/course.php/26math/ — Ctrl+C to stop'));
}
