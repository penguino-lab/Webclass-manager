// Focused theme feedback check: synthetic data and a disposable browser profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createDemoServer } from './demo-server.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const artifacts = resolve(source, '..', 'tmp', 'webclass-theme-check');
await mkdir(artifacts, { recursive:true });
const run = await mkdtemp(join(artifacts, 'run-'));
const extension = join(run, 'extension'); await mkdir(extension);
for (const entry of await readdir(source, { withFileTypes:true })) {
  if (entry.isFile() && /\.(js|css|html|json)$/.test(entry.name)) await copyFile(join(source, entry.name), join(extension, entry.name));
}
await cp(join(source, 'icons'), join(extension, 'icons'), { recursive:true });
const manifest = JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
const server = createDemoServer(); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const site = `http://127.0.0.1:${server.address().port}/webclass/`;
let context;
const color = (scope, selector, property='backgroundColor', pseudo=null) => scope.locator(selector).first().evaluate((el, { property, pseudo }) => getComputedStyle(el, pseudo)[property], { property, pseudo });
const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ') + ')';
try {
  context = await chromium.launchPersistentContext(join(run,'profile'), {
    executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless:true,
    ignoreDefaultArgs:['--disable-extensions','--disable-component-extensions-with-background-pages'], args:[`--load-extension=${extension}`]
  });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  const library = await context.newPage(); await library.goto(`chrome-extension://${id}/library.html`);
  await library.locator('#sidebar-settings').click();
  await library.locator('#settings-site').fill(site);
  await library.locator('#library-settings-form button[type=submit]').click();
  await library.waitForFunction(()=>document.getElementById('settings-status').textContent.includes('設定を保存しました'));
  // Wait for the settings listener's serialized registration to finish.
  const deadline = Date.now()+10000;
  while (!(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).some(s=>s.id==='webclass-page-ui')) {
    if(Date.now()>deadline) throw new Error('Theme content scripts were not registered');
    await new Promise(r=>setTimeout(r,50));
  }
  await library.locator('#home').click();
  const home = await context.newPage(); await home.goto(site+'?ui=1');
  const course = await context.newPage(); await course.goto(site+'course.php/26demo/');
  const material = await context.newPage(); await material.goto(site+'txtbk_show_chapter.php?contents_id=math1');
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await home.locator('.wcl-theme-toggle').waitFor();
  await material.locator('#wcl-material-bulk').waitFor();
  await home.evaluate(()=>{
    const el=document.createElement('div'); el.className='panel'; el.id='theme-panel';
    el.innerHTML='<div class="panel-heading">見出し</div><button class="btn btn-primary">操作</button><div class="alert-info">案内</div><a href="#test">リンク</a>';
    document.body.append(el);
  });
  const intro = home.frameLocator('iframe');
  // Keep realistic native selector/utility conflicts local to this regression.
  // Appending these after the extension stylesheet also exercises source order.
  await course.evaluate(()=>{
    const search=document.querySelector('#search-app');
    const wrapper=document.createElement('div');
    wrapper.setAttribute('role','search'); wrapper.className='bg-white';
    wrapper.innerHTML='<svg class="text-gray-400" aria-label="検索" width="20" height="20"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor"/></svg>';
    wrapper.append(...search.childNodes); search.append(wrapper);
    search.querySelector('input').type='search';
    const style=document.createElement('style');
    style.textContent=`.cm-contentsList{background:#fff}
      #search-app [role=search].bg-white{background:#fff;color:#111827;border:1px solid #d1d5db}
      #search-app input{background:#fff;color:#111827;border:1px solid #d1d5db}
      #search-app input::placeholder{color:#6b7280;opacity:1}
      #search-app button{color:#111827}.text-gray-400{color:#9ca3af}`;
    document.head.append(style);
  });
  await home.evaluate(()=>{
    document.querySelector('.timeline-message').insertAdjacentHTML('beforeend',
      '<textarea class="form-control LangKeyboad TabEnable inputcounter" id="theme-textarea">投稿内容</textarea><select class="form-control" id="theme-select"><option>全員</option></select><form name="answer_form"><input type="button" name="saveanswer" class="btn-default" id="theme-answer" value="回答を保存" onclick="window.fixtureSaves=(window.fixtureSaves||0)+1"><table id="QstnOperation"><tr><td><button type="button" class="btn-primary" id="GradeBtn" onclick="window.fixtureEnds=(window.fixtureEnds||0)+1">終了</button></td></tr></table></form>');
    const style=document.createElement('style');
    style.textContent=`.timeline-message :is(textarea,select).form-control{background:#fff;color:#555;border:1px solid #ccc}
      textarea.LangKeyboad.TabEnable.inputcounter{border:1px solid #ccc!important}
      form[name="answer_form"] :is(button,input[type="button"]){background:#e6e6e6;color:#333;border:1px solid #aaa}`;
    document.head.append(style);
  });
  await intro.locator('body').evaluate(body=>{
    const form=body.querySelector('form');
    const layout=document.createElement('table'); layout.className='layouter';
    layout.innerHTML='<tbody><tr><td class="navi">教材の案内</td></tr><tr><td class="content"></td></tr></tbody>';
    form.before(layout); layout.querySelector('.content').append(form);
    const style=document.createElement('style');
    style.textContent=`#ContentInfo th{background:#1365b5;color:#fff;border:2px solid #000066}
      #ContentInfo td{background:#fff;color:#000;border:2px solid #000066}
      table.layouter td.navi{background:#ccc;color:#000}`;
    body.ownerDocument.head.append(style);
  });
  await material.evaluate(()=>{
    document.querySelector('#WsTitle h2').innerHTML='<a href="#chapter">教材のリンク見出し</a>';
    const style=document.createElement('style');
    style.textContent='#WsTitle h1,#WsTitle h2,#WsTitle h2 a{color:#fff}';
    document.head.append(style);
  });
  // [scope, selector, property, palette token, original native value, pseudo]
  const nativeCases = [
    ['course','.cm-contentsList','backgroundColor','transparent','rgb(255, 255, 255)'],
    ['course','[role=search].bg-white','backgroundColor','surface','rgb(255, 255, 255)'],
    ['course','[role=search].bg-white','color','ink','rgb(17, 24, 39)'],
    ['course','[role=search].bg-white','borderTopColor','line','rgb(209, 213, 219)'],
    ['course','#search-app svg','color','ink','rgb(156, 163, 175)'],
    ['course','#search-app input','backgroundColor','transparent','rgb(255, 255, 255)'],
    ['course','#search-app input','color','ink','rgb(17, 24, 39)'],
    ['course','#search-app input','color','muted','rgb(107, 114, 128)','::placeholder'],
    ['course','#search-app button','color','ink','rgb(17, 24, 39)'],
    ['intro','#ContentInfo th','backgroundColor','heading','rgb(19, 101, 181)'],
    ['intro','#ContentInfo th','color','ink','rgb(255, 255, 255)'],
    ['intro','#ContentInfo td','backgroundColor','surface','rgb(255, 255, 255)'],
    ['intro','#ContentInfo td','color','ink','rgb(0, 0, 0)'],
    ['intro','table.layouter td.navi','backgroundColor','soft','rgb(204, 204, 204)'],
    ['intro','table.layouter td.navi','color','ink','rgb(0, 0, 0)'],
    ['material','#WsTitle','backgroundColor','heading','rgb(19, 101, 181)'],
    ['material','#WsTitle h1','color','ink','rgb(255, 255, 255)'],
    ['material','#WsTitle h2','color','ink','rgb(255, 255, 255)'],
    ['material','#WsTitle h2 a','color','ink','rgb(255, 255, 255)'],
    ...['th','td'].flatMap(tag=>['Top','Right','Bottom','Left'].map(side=>
      ['intro',`#ContentInfo ${tag}`,`border${side}Color`,'line','rgb(0, 0, 102)'])),
    ...['#theme-textarea','#theme-select'].flatMap(selector=>[
      ['home',selector,'backgroundColor','surface','rgb(255, 255, 255)'],
      ['home',selector,'color','ink','rgb(85, 85, 85)'],
      ['home',selector,'borderTopColor','line',selector==='#theme-textarea' ? 'rgb(188, 197, 206)' : 'rgb(204, 204, 204)']
    ]),
    ...['#theme-answer','#GradeBtn'].flatMap(selector=>[
      ['home',selector,'backgroundColor','native','rgb(230, 230, 230)'],
      ['home',selector,'color','native','rgb(51, 51, 51)'],
      ['home',selector,'borderTopColor','native','rgb(170, 170, 170)']
    ])
  ];
  const scopes = { home, course, intro, material };
  const assertNativeColors = async (theme, palette) => {
    for (const [scope,selector,property,token,original,pseudo] of nativeCases) {
      const expected = !palette || token==='native' ? original : token==='transparent' ? 'rgba(0, 0, 0, 0)' : rgb(palette[token]);
      assert.equal(await color(scopes[scope],selector,property,pseudo),expected,
        `${theme}: ${scope} ${selector}${pseudo||''} ${property}`);
    }
  };
  const assertAnswerActions = async () => {
    for (const selector of ['#theme-answer','#GradeBtn']) {
      const box=await home.locator(selector).boundingBox();
      assert.ok(box.width>=112 && box.height>=44,`${selector}: accessible hit area`);
    }
    const before=await home.evaluate(()=>[window.fixtureSaves||0,window.fixtureEnds||0]);
    await home.locator('#theme-answer').click();
    await home.locator('#GradeBtn').click();
    assert.deepEqual(await home.evaluate(()=>[window.fixtureSaves,window.fixtureEnds]),before.map(n=>n+1),'native action handlers remain intact');
    await home.mouse.move(0,0);
  };
  await assertNativeColors('initial default');
  await assertAnswerActions();
  assert.deepEqual(await home.locator('.wcl-theme-menu [data-theme]').evaluateAll(options=>options.map(el=>[el.dataset.theme,el.textContent.replace('✓','').trim()])),[
    ['default','デフォルト'],['charcoal','ブラック'],['forest','グリーン'],['red','レッド'],['lightblue','ライトブルー'],['silver','シルバー'],['gold','ゴールド']
  ],'theme menu order and labels');
  const initialBox = await home.locator('nav').boundingBox();
  for (const theme of ['charcoal','forest','red','lightblue','silver','gold']) {
    await home.locator('.wcl-theme-toggle').click();
    await home.locator(`[data-theme="${theme}"]`).click();
    for (const page of [home,course,material,library,popup]) await page.waitForFunction(id=>document.documentElement.dataset.wclTheme===id,theme);
    await intro.locator('html').evaluate((el,id)=>new Promise(resolve=>{
      if(el.dataset.wclTheme===id)return resolve();
      const observer=new MutationObserver(()=>{if(el.dataset.wclTheme===id){observer.disconnect();resolve();}});
      observer.observe(el,{attributes:true});
    }),theme);
    const palette = await home.locator('html').evaluate(el=>Object.fromEntries(['accent','surface','canvas','soft','ink','heading','line','muted'].map(k=>[k,el.style.getPropertyValue('--wcl-'+k)])));
    await assertNativeColors(theme,palette);
    await assertAnswerActions();
    assert.ok(Math.min(...palette.surface.slice(1).match(/../g).map(x=>parseInt(x,16)))>=249,'card surfaces remain near-white');
    assert.equal(await course.locator('.cm-contentsList').evaluate(el=>{
      for(let node=el;node;node=node.parentElement){const bg=getComputedStyle(node).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')return bg;}
    }),rgb(palette.canvas),'layout gaps reveal the page canvas, not a white rectangle');
    assert.equal(await color(home,'body'),rgb(palette.canvas));
    assert.equal(await color(home,'#theme-panel'),rgb(palette.surface));
    assert.equal(await color(home,'#theme-panel .btn-primary'),rgb(palette.accent));
    assert.equal(await color(home,'.wcl-theme-menu'),rgb(palette.surface));
    assert.equal(await color(home,`[data-theme="${theme}"]`),rgb(palette.soft));
    assert.equal(await color(intro,'[name="next"]'),rgb(palette.accent));
    assert.equal(await color(intro,'[name="giveup"]'),rgb(palette.surface));
    assert.equal(await color(course,'#wcl-course-filters'),rgb(palette.soft));
    assert.equal(await color(material,'#wcl-material-bulk'),rgb(palette.accent));
    assert.equal(await color(material,'.wcl-attachments a'),rgb(palette.accent));
    assert.equal(await color(material,'.wcl-attachments a','color'),'rgb(255, 255, 255)');
    assert.equal(await color(library,'.sidebar'),rgb(palette.surface));
    assert.equal(await color(library,'.nav.active'),rgb(palette.soft));
    assert.equal(await color(popup,'#library'),rgb(palette.accent));
    await worker.evaluate(async url=>{
      const [tab]=await chrome.tabs.query({url});
      await chrome.tabs.sendMessage(tab.id,{type:'save-progress',percent:42},{frameId:0});
    },home.url());
    assert.equal(await color(home,'#webclass-save-notice'),rgb(palette.surface));
    assert.equal(await color(home,'#webclass-save-notice progress','accentColor'),rgb(palette.accent));
    await worker.evaluate(async url=>{
      const [tab]=await chrome.tabs.query({url});
      await chrome.tabs.sendMessage(tab.id,{type:'save-feedback',code:'saved',path:'dummy.pdf'},{frameId:0});
    },home.url());
    assert.equal(await color(home,'#webclass-save-notice button'),rgb(palette.accent));
    assert.deepEqual(await home.locator('nav').boundingBox(),initialBox,'theme changes preserve layout');
    await library.locator('#sidebar-settings').click();
    assert.equal(await color(library,'#settings-site'),rgb(palette.surface));
    await library.locator('#home').click();
    await course.screenshot({path:join(artifacts,theme+'-course.png')});
    await home.screenshot({path:join(artifacts,theme+'-page.png')});
    await library.screenshot({path:join(artifacts,theme+'-library.png')});
    // Close only after verifying the menu's selected/hover state.
    await home.keyboard.press('Escape');
    console.log('PASS: '+theme+' native search/controls, intro tables, linked headings, frames, menus, material controls, library/settings, popup, stable layout');
  }
  await worker.evaluate(()=>chrome.storage.local.set({pageTheme:'default'}));
  for (const page of [home,course,material,library,popup]) await page.waitForFunction(()=>document.documentElement.dataset.wclTheme==='default');
  await intro.locator('html[data-wcl-theme="default"]').waitFor({state:'attached'});
  await assertNativeColors('restored default');
  assert.equal(await color(material,'#wcl-material-bulk'),'rgb(19, 101, 181)');
  assert.equal(await color(popup,'#library'),'rgb(23, 106, 73)');
  await library.mouse.move(0,0);
  assert.equal(await color(library,'.nav.active'),'rgb(252, 237, 241)');
  console.log('PASS: default restores each component’s original palette');
  console.log('Artifacts: '+artifacts);
} finally { await context?.close(); await new Promise(r=>server.close(r)); }
