import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('manual course creates a page-scoped override; clearing restores detection', async()=>{
  let listener;
  const data = {settings:{site:'https://example.edu/webclass/',enabled:true},courseNames:{}};
  const context = {
    URL,crypto,TextEncoder,setTimeout,clearTimeout,
    location:{href:'https://example.edu/webclass/course?id=1',origin:'https://example.edu',pathname:'/webclass/course'},
    document:{documentElement:{},addEventListener:()=>{}},
    MutationObserver:class {observe(){}},addEventListener:()=>{},
    WebClassAdapter:{course:()=>({name:'誤認識したタイトル',source:'h1'})},
    chrome:{
      storage:{local:{get:async()=>structuredClone(data),set:async value=>Object.assign(data,structuredClone(value))},onChanged:{addListener:()=>{}}},
      runtime:{id:'extension',sendMessage:async()=>{},onMessage:{addListener:fn=>{listener=fn;}}}
    }
  };
  vm.runInNewContext(await readFile(new URL('../content.js',import.meta.url),'utf8'),context);
  const message = value=>new Promise(resolve=>listener(value,{id:'extension'},resolve));
  assert.equal((await message({type:'set-course',name:'機械学習'})).name,'機械学習');
  assert.equal((await message({type:'current'})).name,'機械学習');
  assert.match(Object.keys(data.courseNames)[0],/^[a-f0-9]{64}$/);
  context.location.href='https://example.edu/webclass/course?id=2';
  assert.equal((await message({type:'current'})).name,'誤認識したタイトル');
  context.location.href='https://example.edu/webclass/course?id=1';
  assert.equal((await message({type:'set-course',name:''})).name,'誤認識したタイトル');
});
