// Focused home UI check. All announcements, course names and artwork are dummy data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readdir,copyFile,cp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import http from 'node:http';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source=resolve(import.meta.dirname,'..');
const artifacts=resolve(source,'..','tmp','webclass-home-check');await mkdir(artifacts,{recursive:true});
const run=await mkdtemp(join(artifacts,'run-')),extension=join(run,'extension');await mkdir(extension);
for(const entry of await readdir(source,{withFileTypes:true}))if(entry.isFile()&&/\.(js|css|html|json)$/.test(entry.name))await copyFile(join(source,entry.name),join(extension,entry.name));
for(const folder of ['icons','images'])await cp(join(source,folder),join(extension,folder),{recursive:true});
const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
const news=()=>`<div class="infopkg"><ul class="info-list info-short-list"><li class="head">最新3件</li>${['授業システムのお知らせ','新しい資料が公開されました','次回の授業についてのお知らせ（長いタイトルの表示とリンクを確認します）'].map((title,i)=>`<li class="${i%2?'eve':'odd'}"><span class="hidden-xs"><a class="title${i?'':' unread'}" href="/post/${i}" title="${title}" target="msgeditor" onclick="event.preventDefault();window.opened=${i}">${title}</a></span><span class="visible-xs"><a class="title" href="/post/${i}">モバイル用の重複リンク</a></span><div class="data"><div class="exhibitionInfo"><span>システム管理者</span> - 10/23</div></div></li>`).join('')}</ul></div>`;
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;font:16px/1.6 sans-serif;color:#333}.navbar{background:linear-gradient(115deg,#365569,#91b2c7);color:#fff;padding:20px max(20px,calc((100vw - 1400px)/2));min-height:90px}.navbar-brand{font-size:25px}.navbar-nav{list-style:none;padding:0;display:flex;align-items:center;gap:24px}.navbar-collapse{display:flex;justify-content:space-between}.navbar-right{float:right}.container{max-width:1400px;margin:24px auto;display:grid;grid-template-columns:300px minmax(0,1fr);gap:36px;padding:0 20px}.side-block{border:1px solid #eee;border-radius:6px;margin-bottom:18px;padding:12px}.page-header{padding-bottom:8px;border-bottom:1px solid #eee}.info-list{list-style:none}.info-list li .data{float:right;margin-top:-1.3em}.hidden-xs{display:block}.visible-xs{display:none}#UserTopInfo{border:1px solid #eee;margin-bottom:32px}#UserTopInfo>.page-header{background:#fafafa;margin:0;padding:10px}.schedule{height:280px;background:repeating-linear-gradient(90deg,#f1f4f7 0,#f1f4f7 16.5%,#ccd4df 16.6%,#ccd4df 16.7%);border:1px solid #ccd4df}a{color:#1269b0}#NewestInformations .info-list li{padding:8px}.eve{background:#eee}@media(max-width:767px){.container{display:block;padding:0 16px}.container>aside{display:none}.hidden-xs{display:none}.visible-xs{display:block}}
</style><nav class="navbar navbar-default"><div class="navbar-brand">WebClass</div><div class="navbar-collapse"><ul class="navbar-nav"><li>コース</li><li>マニュアル・サンプルファイル</li></ul></div></nav><main class="container"><aside><div class="side-block">課題実施状況一覧<br><a href="#dashboard">» ダッシュボード</a></div><div class="side-block">学習記録ビューア<br><a href="#course">» コース活動状況</a></div></aside><section><div id="UserTopInfo"><h4 class="page-header">管理者からのお知らせ</h4><div id="NewestInformations"><div id="AjaxInfoBox">${news()}</div><p><span class="hidden-xs"><a href="/announcements" target="msgeditor">» お知らせ一覧</a></span><span class="visible-xs"><a href="/announcements">» お知らせ一覧</a></span></p></div></div><h3 class="page-header" id="courses">参加しているコース</h3><h4>表示する学期</h4><select><option>2026</option></select> <select><option>後期前半</option></select><h4>時間割表</h4><div class="schedule"></div></section></main></html>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const site=`http://127.0.0.1:${server.address().port}/webclass/`;
let context;
try{
 context=await chromium.launchPersistentContext(join(run,'profile'),{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,headless:true,viewport:{width:1600,height:1000},ignoreDefaultArgs:['--disable-extensions','--disable-component-extensions-with-background-pages'],args:[`--load-extension=${extension}`]});
 context.setDefaultTimeout(10000);
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 for(let i=0;i<100;i++){
  const installed=await worker.evaluate(async()=>{try{await chrome.contextMenus.update('webclass-open-library',{title:'ライブラリを開く'});return true}catch{return false}});
  if(installed)break;await new Promise(r=>setTimeout(r,40));
 }
 await worker.evaluate(async site=>{await chrome.storage.local.set({settings:{site,enabled:true}})},site);
 const deadline=Date.now()+10000;
 while(!(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).some(s=>s.id==='webclass-page-ui')){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,50))}
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(site);await page.locator('.wcl-library-hero').waitFor();
 const hero=page.locator('.wcl-library-hero'),ticker=page.locator('#UserTopInfo');
 const imageURL=await page.locator('.wcl-library-hero-image').evaluate(el=>el.style.backgroundImage.slice(5,-2));
 assert.equal(await page.evaluate(url=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth);image.onerror=()=>resolve(0);image.src=url}),imageURL),1500,'bundled preview is accessible from the host site');
 const box=await hero.boundingBox(),courses=await page.locator('#courses').boundingBox();assert.equal(box.height,208);assert.ok(courses.y>=box.y+box.height);
 const tickerBox=await ticker.boundingBox();assert.equal(box.y-tickerBox.y-tickerBox.height,20,'reserved space becomes the actual hero without an extra gap');
 assert.equal((await ticker.boundingBox()).height,44);assert.equal(await page.locator('#UserTopInfo a.title:visible').count(),3,'mobile duplicates are hidden at desktop width');
 await page.mouse.move(0,0);
 await page.waitForFunction(()=>document.querySelector('.info-list').getAnimations().length===1);
 assert.equal(await page.locator('.info-list').evaluate(el=>el.getAnimations()[0].playState),'running');
 const first=await page.locator('.wcl-news-item').first().innerText();
 await page.locator('.info-list').evaluate(el=>el.getAnimations()[0].finish());
 await page.waitForFunction(first=>document.querySelector('.wcl-news-item').innerText!==first,first);
 assert.notEqual(await page.locator('.wcl-news-item').first().innerText(),first,'ticker cycles original announcements');
 await ticker.hover();
 assert.equal(await page.locator('.info-list').evaluate(el=>el.getAnimations()[0]?.playState),'paused');
 await page.locator('.wcl-news-pause').click();await page.mouse.move(0,0);assert.equal(await page.locator('.wcl-news-pause').getAttribute('aria-pressed'),'true');
 await page.locator('.wcl-news-pause').press('Enter');assert.equal(await page.locator('.wcl-news-pause').getAttribute('aria-pressed'),'false');
 const last=page.locator('.wcl-news-primary a.title').last();await last.focus();await last.press('Enter');assert.equal(await page.evaluate(()=>window.opened),0,'original click handler survives cycling');
 assert.equal(await last.evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('#AjaxInfoBox').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1}),true,'offscreen keyboard link scrolls into view');
 await hero.focus();await page.mouse.move(0,0);await hero.hover();
 await hero.evaluate(el=>Promise.all(el.querySelector('.wcl-library-hero-image').getAnimations().map(a=>a.finished)));
 assert.match(await page.locator('.wcl-library-hero-image').evaluate(el=>getComputedStyle(el).transform),/1\.045/);
 assert.deepEqual(await hero.boundingBox(),box,'hover does not move surrounding content');
 await page.mouse.move(0,0);await page.locator('#courses').click();await page.screenshot({path:join(run,'home-desktop.png')});
 const newTab=context.waitForEvent('page');await hero.click();const library=await newTab;await library.waitForURL(/chrome-extension:.*library\.html/);await library.close();
 const labelBackgrounds=new Set();
 for(const theme of ['charcoal','forest','red','lightblue','silver','gold','default']){
  await worker.evaluate(pageTheme=>chrome.storage.local.set({pageTheme}),theme);
  await page.waitForFunction(theme=>document.documentElement.dataset.wclTheme===theme,theme);
  const colors=await page.locator('.wcl-library-hero-label').evaluate(el=>({ink:getComputedStyle(el).color,background:getComputedStyle(el).backgroundImage,arrow:getComputedStyle(el.querySelector('.wcl-library-hero-arrow')).color}));
  labelBackgrounds.add(colors.background);
  assert.equal(colors.ink,'rgb(255, 255, 255)');assert.equal(colors.arrow,'rgb(255, 255, 255)');
  assert.deepEqual(await hero.boundingBox(),box,'theme changes keep the compact banner dimensions');
  if(['forest','charcoal','gold'].includes(theme))await page.screenshot({path:join(run,`home-${theme}.png`)});
  if(theme==='forest')assert.match(colors.background,/rgb\(40, 98, 79\)/,'button background uses the selected theme accent');
 }
 assert.equal(labelBackgrounds.size,7,'all themes update the central button fill');
 await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(0,0);await hero.evaluate(el=>el.blur());
 assert.equal(await page.locator('.info-list').evaluate(el=>el.getAnimations().length),0);
 await hero.hover();assert.equal(await page.locator('.wcl-library-hero-image').evaluate(el=>getComputedStyle(el).transform),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#AjaxInfoBox').evaluate((el,body)=>{el.innerHTML=body},news());
 await page.waitForFunction(()=>document.querySelectorAll('.wcl-news-item').length===3);
 assert.equal(await hero.count(),1);assert.equal(await page.locator('.wcl-news-pause').count(),1);
 await worker.evaluate(async url=>{const [tab]=await chrome.tabs.query({url});await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{WebClassPageUI.update();WebClassPageUI.update()}})},page.url());assert.equal(await hero.count(),1);
 await page.setViewportSize({width:390,height:844});await page.mouse.move(0,0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile has no page overflow');
 assert.equal(await page.locator('#UserTopInfo a.title:visible').count(),3,'one copy remains visible on mobile');assert.equal((await ticker.boundingBox()).height,44);
 const mobileHero=await hero.boundingBox(),mobileTicker=await ticker.boundingBox();assert.equal(mobileHero.height,160);assert.equal(mobileHero.y-mobileTicker.y-mobileTicker.height,20);
 await page.screenshot({path:join(run,'home-mobile.png'),fullPage:true});
 const keyboardTab=context.waitForEvent('page');await hero.focus();await page.keyboard.press('Enter');const library2=await keyboardTab;await library2.waitForURL(/chrome-extension:.*library\.html/);await library2.close();
 await page.locator('#UserTopInfo').evaluate(el=>el.remove());await page.waitForFunction(()=>!document.querySelector('.info-list'));
 assert.deepEqual(errors,[]);
 console.log('PASS: bundled preview, large stable hero, hover zoom, mouse/keyboard library actions, continuous original notice links, pause/resume, keyboard visibility, AJAX replacement, reduced motion and mobile fit.');
 console.log('Screenshots:',run);
}finally{await context?.close();await new Promise(r=>server.close(r))}
