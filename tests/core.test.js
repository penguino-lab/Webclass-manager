import test from 'node:test';
import assert from 'node:assert/strict';
import { segment, filename, destination, inSite, siteURL, chooseIntent, digest } from '../core.js';
test('Windows names, traversal, controls, reserved names', () => {
  for (const name of ['CON','nul.pdf','COM1','LPT9.txt','COM¹']) assert.ok(segment(name).startsWith('_'));
  assert.equal(segment('a<>:"/\\|?*\n.'), 'a__________');
  assert.equal(segment('..'), '未分類');
  assert.equal(segment(' lecture. '), 'lecture');
  assert.equal(filename('C:\\Downloads\\NUL.pdf'), '_NUL.pdf');
  assert.ok(filename('x'.repeat(200)+'.pdf').endsWith('.pdf'));
  assert.equal(destination({}, '数学/演習', '/tmp/a.pdf'), '数学_演習/a.pdf');
});
test('site boundary and secure registration', () => {
  assert.equal(siteURL('https://example.edu/webclass/?token=secret'), 'https://example.edu/webclass/');
  assert.ok(inSite('https://example.edu/webclass/course', 'https://example.edu/webclass/'));
  assert.ok(!inSite('https://example.edu/webclass-fake/', 'https://example.edu/webclass/'));
  assert.throws(() => siteURL('http://example.edu/'));
  assert.throws(() => siteURL('https://user:pass@example.edu/'));
});
const now = 100000;
const intent = { id:'1', time:now-100, origin:'https://example.edu', page:'page', target:'target', course:'数学' };
const item = { refOrigin:intent.origin, ref:'page', url:'target', finalUrl:'other', started:now };
test('exact target plus page referrer is accepted', () => assert.equal(chooseIntent([intent],item,now),intent));
test('origin-only referrer accepted only for a unique intent', () => {
  assert.equal(chooseIntent([intent],{...item,ref:'origin',originOnly:true},now),intent);
  assert.equal(chooseIntent([intent,{...intent,id:'2'}],item,now),null);
});
for (const [label, change] of Object.entries({ external:{refOrigin:'https://other.edu'}, missing:{refOrigin:''}, unrelated:{url:'other'}, wrongPage:{ref:'other'}, extension:{byExtensionId:'x'}, earlier:{started:1} })) {
  test('reject '+label, () => assert.equal(chooseIntent([intent],{...item,...change},now),null));
}
test('expired clicks rejected', () => assert.equal(chooseIntent([intent],item,now+21000),null));
test('attachment button fallback requires full referrer and both download URLs in site', () => {
  const button = {...intent, target:'', fallback:true};
  assert.equal(chooseIntent([button],{...item,inSite:true},now),button);
  assert.equal(chooseIntent([button],{...item,inSite:false},now),null);
  assert.equal(chooseIntent([button],{...item,inSite:true,originOnly:true},now),null);
  assert.equal(chooseIntent([button],{...item,inSite:true,ref:'different-page'},now),null);
  assert.equal(chooseIntent([button, {...button,id:'2'}],{...item,inSite:true},now),null);
});
test('fingerprints preserve query distinction without storing URL', async () => {
  const a = await digest('https://example.edu/a?token=1#hash');
  assert.equal(a,await digest('https://example.edu/a?token=1'));
  assert.notEqual(a,await digest('https://example.edu/a?token=2'));
  assert.match(a,/^[a-f0-9]{64}$/);
});
