// Focused header-banner regression: synthetic canvas images, local demo site,
// and a disposable extension/profile only. Never load university pages/photos.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createDemoServer } from './demo-server.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = resolve(import.meta.dirname, '..');
const artifacts = resolve(source, '..', 'tmp', 'webclass-banner-check');
await mkdir(artifacts, { recursive:true });
const run = await mkdtemp(join(artifacts, 'run-'));
const extension = join(run, 'extension');
await mkdir(extension);
for (const entry of await readdir(source, { withFileTypes:true })) {
  if (entry.isFile() && /\.(js|css|html|json)$/.test(entry.name)) {
    await copyFile(join(source, entry.name), join(extension, entry.name));
  }
}
await cp(join(source, 'icons'), join(extension, 'icons'), { recursive:true });
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
const server = createDemoServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}/webclass/`;
let context;

const menu = page => page.locator('.wcl-theme-menu').first();
const toggle = page => page.locator('.wcl-theme-toggle').first();
const pick = page => menu(page).locator('.wcl-banner-pick');
const clear = page => menu(page).locator('.wcl-banner-clear');
const input = page => page.locator('input.wcl-banner-input').first();
const status = page => page.locator('.wcl-banner-status').first();
const rgb = value => {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  assert.ok(parts?.length >= 3, `expected computed RGB color, got ${value}`);
  return parts;
};
const contrast = (a, b) => {
  const luminance = color => color.slice(0,3).map(v => v/255)
    .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
    .reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
  const first = luminance(a), second = luminance(b);
  return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
};
const openMenu = async page => {
  if (await menu(page).isHidden()) await toggle(page).click();
  await menu(page).waitFor({ state:'visible' });
};
const layout = async page => page.evaluate(() => {
  const rect = selector => {
    const {x,y,width,height} = document.querySelector(selector).getBoundingClientRect();
    return {x,y,width,height};
  };
  return { header:rect('.navbar.navbar-default'), content:rect('.fixture-columns') };
});
const assertBanner = async (page, image) => {
  await page.waitForFunction(image => {
    const root = document.documentElement;
    return root.hasAttribute('data-wcl-banner') &&
      getComputedStyle(root).getPropertyValue('--wcl-banner-image').includes(image);
  }, image);
  const css = await page.locator('.navbar.navbar-default').evaluate(el => {
    const style = getComputedStyle(el);
    return { image:style.backgroundImage, size:style.backgroundSize };
  });
  assert.ok(css.image.includes(image), 'banner image is a navbar background layer');
  assert.ok(css.size.split(',').map(x=>x.trim()).includes('cover'), 'header image covers its existing area');
};
const assertNoBanner = async page => {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    return !root.hasAttribute('data-wcl-banner') &&
      !getComputedStyle(root).getPropertyValue('--wcl-banner-image').includes('data:image/');
  });
  assert.ok(!(await page.locator('.navbar.navbar-default').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('data:image/'), 'clear removes the actual background image');
};
const assertMenuEnd = async (page, expected) => {
  await openMenu(page);
  await menu(page).locator('[data-theme][aria-checked="true"]').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator(expected).evaluate(el=>el===document.activeElement),true,
    'End focuses the last enabled menu button, skipping disabled clear');
};
const assertReadableBanner = async page => {
  const header = page.locator('.navbar.navbar-default');
  const scrim = await header.evaluate(el => {
    const image=getComputedStyle(el).backgroundImage;
    return { image, alphas:[...image.matchAll(/rgba?\(([^)]*)\)/g)].map(match=>{
      const values=match[1].match(/[\d.]+/g).map(Number);return values[3]??1;
    }) };
  });
  assert.ok(scrim.image.includes('gradient('),'banner uses a localized scrim');
  assert.ok(scrim.alphas.length>=4 && scrim.alphas.includes(0),'gradients include transparent stops rather than a uniform dark mask');
  assert.ok(Math.max(...scrim.alphas)<=.401,'banner scrim does not uniformly darken the photograph');
  const shadows=await header.locator('.navbar-brand,.navbar-nav>li>a,.wcl-library-button').evaluateAll(elements=>
    elements.filter(el=>el.getBoundingClientRect().width>0).map(el=>getComputedStyle(el).textShadow));
  assert.ok(shadows.length>=3 && shadows.every(value=>value!=='none'),'white header text has a readability shadow');
  const foregrounds = await header.locator('.navbar-brand,.navbar-nav>li>a,.wcl-theme-toggle,.wcl-library-button').evaluateAll(elements =>
    elements.filter(el=>el.getBoundingClientRect().width>0).map(el=>({name:el.className,color:getComputedStyle(el).color})));
  assert.ok(foregrounds.length>=4,'exercise native header text, links and extension controls');
  for (const {name,color} of foregrounds) {
    assert.ok(rgb(color).slice(0,3).every(channel=>channel>=240),`banner header foreground remains white: ${name} ${color}`);
  }
  await openMenu(page);
  const colors = await menu(page).locator('button:not(:disabled)').evaluateAll(elements => elements.map(el => {
    let node = el, background;
    while(node) {
      const value=getComputedStyle(node).backgroundColor;
      if(value!=='rgba(0, 0, 0, 0)' && value!=='transparent'){background=value;break;}
      node=node.parentElement;
    }
    return { label:el.textContent.trim(), foreground:getComputedStyle(el).color, background:background||'rgb(255, 255, 255)' };
  }));
  for (const item of colors) {
    assert.ok(contrast(rgb(item.foreground),rgb(item.background))>=4.5,
      `menu text is not white-on-white: ${item.label} ${item.foreground} / ${item.background}`);
  }
};

try {
  context = await chromium.launchPersistentContext(join(run, 'profile'), {
    executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless:true,
    viewport:{width:1280,height:800},
    ignoreDefaultArgs:['--disable-extensions','--disable-component-extensions-with-background-pages'],
    args:[`--load-extension=${extension}`]
  });
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers().find(worker=>worker.url().endsWith('/background.js')) ||
    await context.waitForEvent('serviceworker',{predicate:worker=>worker.url().endsWith('/background.js')});
  const id = worker.url().split('/')[2];
  const storage = () => worker.evaluate(()=>chrome.storage.local.get(['pageTheme','pageBanner']));
  const library = await context.newPage();
  await library.goto(`chrome-extension://${id}/library.html`);
  await library.waitForFunction(()=>document.getElementById('status')?.textContent.includes('保存先フォルダを選んでください'));
  await library.locator('#sidebar-settings').click();
  await library.locator('#settings-site').fill(site);
  await library.locator('#library-settings-form button[type=submit]').click();
  await library.waitForFunction(()=>document.getElementById('settings-status').textContent.includes('設定を保存しました'));
  const deadline = Date.now()+10000;
  while (!(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).some(script=>script.id==='webclass-page-ui')) {
    if(Date.now()>deadline) throw new Error('Banner content scripts were not registered');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  await library.locator('#home').click();
  const home = await context.newPage();
  const other = await context.newPage();
  // The course demo uses <nav> without navbar classes. Two home fixtures test
  // real .navbar.navbar-default synchronization without modifying fixtures.
  await home.goto(site+'?ui=1&banner=first');
  await other.goto(site+'?ui=1&banner=second');
  const pages = [home,other];
  for(const page of pages) await pick(page).waitFor({state:'attached'});
  assert.equal(await pick(home).getAttribute('role'),'menuitem');
  assert.equal((await pick(home).textContent()).trim(),'バナー画像を選択');
  assert.equal((await clear(home).textContent()).trim(),'×');
  assert.equal(await clear(home).getAttribute('aria-label'),'バナー画像を解除');
  assert.equal(await pick(home).locator('.wcl-banner-thumbnail').count(),1,'picker includes the banner thumbnail');
  await openMenu(home);
  const pickBox=await pick(home).boundingBox(), clearBox=await clear(home).boundingBox();
  assert.ok(Math.abs(pickBox.y-clearBox.y)<2,'picker and compact clear share one row');
  assert.equal(await pick(home).evaluate(el=>el.parentElement.classList.contains('wcl-banner-row')),true);
  assert.equal(await status(home).getAttribute('role'),'status');
  assert.equal(await status(home).evaluate(el=>!!el.closest('.wcl-theme-menu')),true,'feedback stays inline in the menu');
  assert.equal(await status(home).evaluate(el=>{const box=el.getBoundingClientRect();return box.width<=1 && box.height<=1 && !el.hasAttribute('data-error');}),true,'ordinary banner status is screen-reader-only');
  assert.equal(await input(home).evaluate(el=>el.hidden || getComputedStyle(el).display==='none'),true,'file input does not occupy layout');
  const accepted = (await input(home).getAttribute('accept')||'').toLowerCase().split(',').map(value=>value.trim());
  for(const variants of [['image/png','.png'],['image/jpeg','.jpeg','.jpg'],['image/webp','.webp']]) {
    assert.ok(variants.some(value=>accepted.includes(value)),`file input accepts ${variants[0]}`);
  }
  assert.equal(accepted.includes('image/*'),false,'picker does not advertise unsupported formats');
  assert.equal(await clear(home).isDisabled(),true,'clear starts disabled without a saved image');
  await assertNoBanner(home);
  await assertNoBanner(other);
  await assertMenuEnd(home,'.wcl-banner-pick');
  assert.deepEqual(await menu(home).locator('button').evaluateAll(buttons=>buttons.slice(-2).map(el=>el.classList.contains('wcl-banner-pick')?'pick':el.classList.contains('wcl-banner-clear')?'clear':'other')),
    ['pick','clear'],'image actions are the final two menu buttons');

  const chooseTheme = async theme => {
    await openMenu(home);
    await menu(home).locator(`[data-theme="${theme}"]`).click();
    for(const page of pages) await page.waitForFunction(theme=>document.documentElement.dataset.wclTheme===theme,theme);
    await library.waitForFunction(theme=>document.documentElement.dataset.wclTheme===theme,theme);
    await library.waitForFunction(theme=>chrome.storage.local.get('pageTheme').then(data=>data.pageTheme===theme),theme);
    assert.equal((await storage()).pageTheme,theme,'theme selection is stored independently');
    assert.equal(await menu(home).locator(`[data-theme="${theme}"]`).getAttribute('aria-checked'),'true');
    assert.equal(await menu(home).locator('[data-theme][aria-checked="true"]').count(),1,'exactly one theme remains selected');
  };
  await chooseTheme('default');
  const dimensions = await Promise.all(pages.map(layout));
  const assertLayout = async () => {
    for(const [index,page] of pages.entries()) assert.deepEqual(await layout(page),dimensions[index],
      'upload/theme/reload/clear never changes header or content dimensions');
  };
  const png = async (variant,portrait=false) => Buffer.from((await home.evaluate(({variant,portrait}) => {
    const canvas=document.createElement('canvas');canvas.width=portrait?360:960;canvas.height=portrait?960:320;
    const ctx=canvas.getContext('2d');
    for(let y=0;y<canvas.height;y+=20) for(let x=0;x<canvas.width;x+=20){
      ctx.fillStyle=`hsl(${(x*.35+y*.6+variant*60)%360} 65% ${55+(Math.floor(x/20)+Math.floor(y/20))%3*10}%)`;
      ctx.fillRect(x,y,20,20);
    }
    return canvas.toDataURL('image/png');
  },{variant,portrait})).split(',')[1],'base64');
  const beginCrop = async (variant=0,portrait=false) => {
    const before=await storage();
    await input(home).setInputFiles({name:`synthetic-banner-${variant}.png`,mimeType:'image/png',buffer:await png(variant,portrait)});
    await home.locator('#wcl-banner-crop[open]').waitFor({state:'visible'});
    assert.equal(await home.locator('#wcl-banner-crop').getAttribute('aria-labelledby'),'wcl-banner-crop-title');
    assert.equal(await home.locator('#wcl-banner-crop-title').textContent(),'バナー画像を切り取る');
    assert.deepEqual(await storage(),before,'selecting a file does not save before crop confirmation');
    return before;
  };
  const cancelCrop = async (escape=false,portrait=false) => {
    const before=await beginCrop(0,portrait);
    if(escape) await home.keyboard.press('Escape');
    else await home.locator('.wcl-banner-crop-cancel').click();
    await home.locator('#wcl-banner-crop').waitFor({state:'detached'});
    await home.waitForFunction(()=>!document.querySelector('.wcl-banner-pick').disabled);
    assert.deepEqual(await storage(),before,'crop cancel/Escape preserves the previous image and theme');
    for(const page of pages) before.pageBanner?await assertBanner(page,before.pageBanner):await assertNoBanner(page);
  };
  await cancelCrop(false); await cancelCrop(true);
  const upload = async (variant,{adjust=false}={}) => {
    const before=await beginCrop(variant);
    const expectedRatio=await home.locator('.navbar.navbar-default').evaluate(el=>{const b=el.getBoundingClientRect();return b.width/b.height;});
    if(adjust){
      await home.locator('.wcl-banner-crop-zoom').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
      const stage=home.locator('.wcl-banner-crop-stage'), box=await stage.boundingBox();
      await home.mouse.move(box.x+box.width/2,box.y+box.height/2); await home.mouse.down();
      await home.mouse.move(box.x+box.width/2+55,box.y+box.height/2+30,{steps:5}); await home.mouse.up();
      await stage.focus(); await home.keyboard.press('ArrowDown'); await home.keyboard.press('Shift+ArrowRight');
    }
    await home.screenshot({path:join(artifacts,'banner-crop-dialog.png')});
    await home.locator('.wcl-banner-crop-apply').click();
    await home.locator('#wcl-banner-crop').waitFor({state:'detached'});
    await home.waitForFunction(previous=>{
      const root=document.documentElement, image=root.style.getPropertyValue('--wcl-banner-image');
      return root.hasAttribute('data-wcl-banner') && image.includes('data:image/webp;base64,') &&
        (!previous || !image.includes(previous)) && !document.querySelector('.wcl-banner-pick').disabled;
    },before.pageBanner);
    const saved=await storage();
    assert.equal(saved.pageTheme,before.pageTheme,'upload must not change the selected theme');
    assert.match(saved.pageBanner,/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/,'confirmed crop is stored as WebP');
    for(const page of pages){
      await assertBanner(page,saved.pageBanner);
      assert.ok((await pick(page).locator('.wcl-banner-thumbnail').evaluate(el=>getComputedStyle(el).backgroundImage)).includes(saved.pageBanner),'thumbnail matches the stored crop');
    }
    const size=await home.evaluate(data=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error('invalid saved WebP'));image.src=data;
    }),saved.pageBanner);
    assert.ok(size.width>0 && size.width<=2560 && size.height>0,'crop output dimensions are valid and bounded');
    assert.ok(Math.abs(size.width/size.height-expectedRatio)/expectedRatio<.01,'saved crop matches the current header aspect ratio within pixel quantization');
    assert.equal(await clear(home).isDisabled(),false);
    await assertMenuEnd(home,'.wcl-banner-clear'); await assertLayout();
    return saved.pageBanner;
  };
  const firstImage=await upload(0);
  await cancelCrop(false); await cancelCrop(true);
  const image=await upload(0,{adjust:true});
  assert.notEqual(image,firstImage,'drag, zoom and keyboard adjustment changes the saved crop of the SAME source');
  await home.setViewportSize({width:390,height:640});
  const beforePortrait=await beginCrop(1,true);
  const dialog=home.locator('#wcl-banner-crop'), bounds=await dialog.boundingBox();
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=391 && bounds.y>=0 && bounds.y+bounds.height<=641,'crop dialog fits a small viewport');
  assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'portrait crop has no horizontal overflow');
  assert.ok((await home.locator('.wcl-banner-crop-stage').boundingBox()).height>=160,'thin banner crop retains a usable stage');
  await home.screenshot({path:join(artifacts,'portrait-crop-small.png')});
  await home.locator('.wcl-banner-crop-apply').scrollIntoViewIfNeeded();
  assert.equal(await home.locator('.wcl-banner-crop-apply').isVisible(),true,'apply remains reachable through short-viewport scrolling');
  await home.locator('.wcl-banner-crop-cancel').click();
  await dialog.waitFor({state:'detached'}); await home.waitForFunction(()=>!document.querySelector('.wcl-banner-pick').disabled);
  assert.deepEqual(await storage(),beforePortrait,'canceling portrait crop preserves the saved landscape crop');
  await home.setViewportSize({width:1280,height:800}); await assertLayout();

  for(const theme of ['default','forest','lightblue']) {
    await chooseTheme(theme);
    assert.equal((await storage()).pageBanner,image,'selecting a theme preserves the independent banner setting');
    for(const page of pages) {
      await assertBanner(page,image);
      await assertReadableBanner(page);
    }
    await assertLayout();
  }
  await home.reload();
  await pick(home).waitFor({state:'attached'});
  await home.waitForFunction(()=>document.documentElement.dataset.wclTheme==='lightblue');
  for(const page of pages) await assertBanner(page,image);
  assert.equal((await storage()).pageTheme,'lightblue','reload preserves theme selection');
  await assertLayout();

  for(const file of [
    {name:'not-an-image.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic text, not an image')},
    {name:'corrupt.png',mimeType:'image/png',buffer:Buffer.from('not a decodable PNG')}
  ]) {
    await openMenu(home);
    // Error wording may be shared by both cases; clear only the inline output
    // so every failed upload must produce fresh, observable feedback.
    await status(home).evaluate(el=>{el.textContent='';});
    await input(home).setInputFiles(file);
    await home.waitForFunction(()=>!document.querySelector('.wcl-banner-pick')?.disabled && /選択してください|読み込めません/.test(document.querySelector('.wcl-banner-status')?.textContent || ''));
    assert.equal(await status(home).evaluate(el=>el.hasAttribute('data-error') && el.getBoundingClientRect().height>1),true,'invalid-file errors are visibly exposed');
    const saved = await storage();
    assert.equal(saved.pageBanner,image,`${file.name}: rejected file cannot discard the last valid image`);
    assert.equal(saved.pageTheme,'lightblue',`${file.name}: rejected file cannot alter theme selection`);
    for(const page of pages) await assertBanner(page,image);
    await assertLayout();
  }
  await assertReadableBanner(home);
  await home.screenshot({path:join(artifacts,'lightblue-banner.png')});

  const themeBeforeClear = (await storage()).pageTheme;
  await openMenu(home);
  await clear(home).click();
  await home.waitForFunction(()=>!document.documentElement.hasAttribute('data-wcl-banner') && !document.querySelector('.wcl-banner-pick').disabled);
  for(const page of pages) {
    await assertNoBanner(page);
    assert.equal(await page.locator('html').getAttribute('data-wcl-theme'),themeBeforeClear);
  }
  assert.equal((await storage()).pageTheme,themeBeforeClear,'clear does not reset the theme');
  assert.equal(await clear(home).isDisabled(),true);
  await assertMenuEnd(home,'.wcl-banner-pick');
  assert.ok(!rgb(await home.locator('.navbar-brand').evaluate(el=>getComputedStyle(el).color)).slice(0,3).every(channel=>channel>=240),
    'clearing the banner restores dark lightblue header text instead of retaining forced white');
  await assertLayout();
  console.log('PASS: one-row thumbnail menu, crop confirmation/drag/zoom/arrows, cancel/Escape preservation, portrait/small viewport, brighter scrim/shadow, sync/themes/persistence, invalid-file feedback, keyboard and stable layout');
  console.log('Screenshot: '+join(artifacts,'lightblue-banner.png'));
} finally {
  await context?.close();
  await new Promise(resolve=>server.close(resolve));
}
