import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverWebClassSite } from '../site-discovery.js';

test('detects TCU and other universities without retaining authentication queries or courses', () => {
  for (const [url, expected] of [
    ['https://webclass.tcu.ac.jp/webclass/singlesignon.php?auth_mode=SAML&token=secret', 'https://webclass.tcu.ac.jp/webclass/'],
    ['https://lms.other.ac.jp/campus/webclass/course.php/26math/?acs_=secret#top', 'https://lms.other.ac.jp/campus/webclass/'],
    ['https://example.edu/WebClass', 'https://example.edu/WebClass/'],
    ['https://webclass2.example.edu/login.php?token=secret', 'https://webclass2.example.edu/'],
    ['http://127.0.0.1:8765/webclass/course.php/mock/', 'http://127.0.0.1:8765/webclass/']
  ]) assert.equal(discoverWebClassSite(url), expected);
  assert.equal(discoverWebClassSite('https://lms.example.edu/learning/course.php/123/', 'WebClass - ダミー講義'), 'https://lms.example.edu/learning/');
});

test('does not treat unrelated pages, SSO providers or unsafe URLs as WebClass', () => {
  for (const url of ['https://example.edu/', 'https://example.edu/webclass-fake/', 'https://example.edu/docs/webclass-guide',
    'https://idp.example.edu/saml/login', 'https://example.edu/login.php', 'http://webclass.example.edu/webclass/',
    'https://user:secret@example.edu/webclass/', 'javascript:alert(1)', 'chrome://extensions', 'not a URL']) {
    assert.equal(discoverWebClassSite(url), null, url);
  }
});
