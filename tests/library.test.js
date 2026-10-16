import test from 'node:test';
import assert from 'node:assert/strict';
import { fileType, formatSize, scanDirectory, visibleEntries, folderCoverEntries, summarizeDirectories, matchingFiles, folderFileCounts, normalizeTypeFilters, splitCourseName } from '../library-core.js';
const file = (path, size = 10, modified = 0) => ({ path, name: path.split('/').pop(), parent: path.split('/').slice(0, -1).join('/'), kind: 'file', type: fileType(path), size, modified });
test('folder search includes descendants but never sibling paths with the same prefix', () => {
  const entries = [file('数学/第2回.pdf'), file('数学/補足/演習.pdf'), file('数学II/演習.pdf'), file('統計/演習.pdf')];
  assert.deepEqual(visibleEntries(entries, { path: '数学' }).map(x => x.path), ['数学/第2回.pdf']);
  assert.deepEqual(visibleEntries(entries, { path: '数学', query: '演習' }).map(x => x.path), ['数学/補足/演習.pdf']);
  assert.deepEqual(visibleEntries(entries, { mode: 'all', query: '数学 演習' }).map(x => x.path), ['数学/補足/演習.pdf', '数学II/演習.pdf']);
});
test('normalized names, favorites and file-type filters compose; old tags are no longer searched', () => {
  const entries = [file('講義/ＰＤＦ資料.PDF'), file('講義/メモ.txt')];
  const metadata = { '講義/ＰＤＦ資料.PDF': { tags: ['試験対策'], favorite: true } };
  assert.equal(visibleEntries(entries, { mode: 'favorites', query: 'pdf 資料', type: 'pdf' }, metadata).length, 1);
  assert.equal(visibleEntries(entries, { mode: 'all', query: '試験' }, metadata).length, 0);
  assert.equal(visibleEntries(entries, { mode: 'favorites', type: 'text' }, metadata).length, 0);
});
test('folder covers pick at most four PDFs within the correct folder, preferring direct children', () => {
  const entries = [file('数学/補足/第1回.pdf'), file('数学II/資料.pdf'), file('数学/図.png'), file('数学/第10回.pdf'), file('数学/第2回.pdf'), file('数学/第3回.pdf'), file('数学/第4回.pdf'), file('数学/第5回.pdf')];
  assert.deepEqual(folderCoverEntries(entries, '数学').map(entry => entry.name), ['第2回.pdf', '第3回.pdf', '第4回.pdf', '第5回.pdf']);
  assert.equal(folderCoverEntries(entries, '空').length, 0);
  assert.equal(folderCoverEntries([file('数学/大きい.pdf', 70 * 1024 * 1024), { ...file('数学/不明.pdf'), error: 'NotFoundError' }, file('数学/上限外.pdf', 101 * 1024 * 1024)], '数学').length, 3);
});

test('Office formats share their common groups; その他 includes every remaining format', () => {
  for (const name of ['slide.PPT', 'slide.pptx', 'slide.pptm', 'slide.ppsx']) assert.equal(fileType(name), 'powerpoint');
  for (const name of ['report.doc', 'report.DOCX', 'report.docm', 'report.rtf']) assert.equal(fileType(name), 'word');
  for (const name of ['sheet.xls', 'sheet.XLSX', 'sheet.xlsm', 'sheet.xlsb']) assert.equal(fileType(name), 'excel');
  assert.equal(fileType('table.CSV'), 'csv'); assert.equal(fileType('table.tsv'), 'tsv');
  const entries = ['a.pdf', 'b.pptx', 'c.docx', 'd.xlsx', 'e.png', 'f.wav', 'g.txt', 'h.zip', 'i.csv'].map(name => file('講義/' + name));
  assert.deepEqual(visibleEntries(entries, { mode: 'all', type: 'other' }).map(x => x.name), ['e.png', 'f.wav', 'g.txt', 'h.zip', 'i.csv']);
  assert.deepEqual(visibleEntries(entries, { mode: 'all', type: 'word' }).map(x => x.name), ['c.docx']);
});

test('a favorites visit keeps an unstarred card until the next visit and still applies other filters', () => {
  const entries = [file('講義/資料.pdf'), file('講義/メモ.txt')];
  const metadata = { '講義/資料.pdf': { favorite: false }, '講義/メモ.txt': { favorite: true } };
  const favoritePaths = new Set(['講義/資料.pdf']);
  assert.deepEqual(visibleEntries(entries, { mode: 'favorites', favoritePaths }, metadata).map(x => x.name), ['資料.pdf']);
  assert.equal(visibleEntries(entries, { mode: 'favorites', favoritePaths, type: 'word' }, metadata).length, 0);
  assert.deepEqual(visibleEntries(entries, { mode: 'favorites' }, metadata).map(x => x.name), ['メモ.txt']);
});
test('folders precede files; names use numeric order; modified and size sorting are descending', () => {
  const entries = [file('第10回.pdf', 5, 10), file('第2回.pdf', 50, 20), { path: '資料', parent: '', name: '資料', kind: 'directory' }];
  assert.deepEqual(visibleEntries(entries, {}).map(x => x.name), ['資料', '第2回.pdf', '第10回.pdf']);
  assert.equal(visibleEntries(entries, { mode: 'all', sort: 'modified' })[0].name, '第2回.pdf');
  assert.equal(visibleEntries(entries, { mode: 'all', sort: 'size' })[0].size, 50);
  assert.equal(fileType('PHOTO.JPEG'), 'image'); assert.equal(fileType('archive.zip'), 'other');
  assert.equal(formatSize(1024), '1.0 KB'); assert.equal(formatSize(undefined), '—');
});
function directory(children, error) {
  return { kind: 'directory', async *entries() { if (error) throw error; for (const entry of Object.entries(children)) yield entry; } };
}
const handle = (text, error) => ({ kind: 'file', async getFile() { if (error) throw error; return { size: text.length, lastModified: 123 }; } });
test('scan includes nested existing files and empty folders, reports inaccessible children, and does not write', async () => {
  const root = directory({ '数学': directory({ '資料.pdf': handle('pdf'), '補足': directory({ 'メモ.txt': handle('memo') }) }), '空': directory({}), '削除済み': directory({}, Error('missing')), '消えた.pdf': handle('', Error('missing')) });
  const result = await scanDirectory(root);
  assert.equal(result.entries.find(entry => entry.path === '数学/補足/メモ.txt').size, 4);
  assert.ok(result.entries.some(entry => entry.path === '空'));
  assert.deepEqual(result.errors.sort(), ['削除済み', '消えた.pdf'].sort());
  await assert.rejects(scanDirectory(directory({}, Error('root missing'))), /root missing/);
});
test('cancelled scans cannot return stale data when the destination changes', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(scanDirectory(directory({ '資料.pdf': handle('pdf') }), { signal: controller.signal }), { name: 'AbortError' });
});

const folder = path => ({ path, name: path.split('/').pop(), parent: path.split('/').slice(0, -1).join('/'), kind: 'directory', type: 'folder' });
test('type filtering retains exactly the folders with matching descendants, including nested files', () => {
  const entries = [folder('数学'), folder('数学/補足'), folder('数学II'), folder('表計算'), folder('空'), file('数学/補足/資料.pdf'), file('数学II/メモ.txt'), file('表計算/表.xlsx'), file('表計算/表.csv')];
  assert.deepEqual(visibleEntries(entries, { type: 'pdf' }).map(x => x.path), ['数学']);
  assert.deepEqual(visibleEntries(entries, { path: '数学', type: 'pdf' }).map(x => x.path), ['数学/補足']);
  assert.deepEqual(visibleEntries(entries, { type: 'excel' }).map(x => x.path), ['表計算']);
  assert.deepEqual(visibleEntries(entries, { type: 'other' }).map(x => x.path), ['数学II', '表計算']);
  assert.deepEqual(visibleEntries(entries, { type: 'pdf', query: '資料' }).map(x => x.path), ['数学', '数学/補足', '数学/補足/資料.pdf']);
  assert.deepEqual(visibleEntries(entries, { mode: 'all', type: 'pdf' }).map(x => x.path), ['数学/補足/資料.pdf']);
});
test('folder covers prefer PDFs and fill remaining slots with actual other files, leaving genuinely empty slots alone', () => {
  const entries = [file('講義/a.csv'), file('講義/b.docx'), file('講義/c.zip'), file('講義/z.pdf'), file('講義II/余分.pdf')];
  assert.deepEqual(folderCoverEntries(entries, '講義').map(x => x.name), ['z.pdf', 'a.csv', 'b.docx', 'c.zip']);
  assert.equal(folderCoverEntries([file('講義/z.pdf')], '講義').length, 1);
  assert.equal(folderCoverEntries([file('講義/a.csv')], '講義')[0].type, 'csv');
});
test('folders sort by the newest descendant file, including subfolders; sizes aggregate once per scan', () => {
  const entries = summarizeDirectories([folder('A'), folder('A/補足'), folder('B'), folder('空'), file('A/補足/資料.pdf', 10, 300), file('A/旧.pdf', 20, 100), file('B/資料.pdf', 40, 200)]);
  assert.deepEqual(visibleEntries(entries, {}).map(x => x.path), ['A', 'B', '空']);
  assert.deepEqual(visibleEntries(entries, { sort: 'size' }).map(x => x.path), ['B', 'A', '空']);
  assert.equal(entries.find(x => x.path === 'A').modified, 300); assert.equal(entries.find(x => x.path === 'A').size, 30);
  assert.equal(entries.find(x => x.path === 'A/補足').modified, 300);
  summarizeDirectories(entries); assert.equal(entries.find(x => x.path === 'A').size, 30, 'repeat aggregation does not double count');
});

test('multiple type filters use a union and compose with search, folders and favorites', () => {
  const entries = [folder('A'), folder('A/補足'), folder('AB'), folder('空'), file('A/資料.pdf'), file('A/補足/資料.xlsx'), file('A/メモ.txt'), file('AB/資料.docx')];
  assert.deepEqual(visibleEntries(entries, { types: ['pdf', 'excel'] }).map(x => x.path), ['A']);
  assert.deepEqual(visibleEntries(entries, { path: 'A', types: ['pdf', 'excel'], query: '資料' }).map(x => x.path).sort(), ['A/補足', 'A/補足/資料.xlsx', 'A/資料.pdf'].sort());
  assert.deepEqual(visibleEntries(entries, { mode: 'all', types: ['excel', 'other'] }).map(x => x.path), ['A/メモ.txt', 'A/補足/資料.xlsx']);
  const metadata = { 'A/資料.pdf': { favorite: true }, 'A/補足/資料.xlsx': { favorite: true } };
  assert.equal(visibleEntries(entries, { mode: 'favorites', types: ['pdf', 'excel'] }, metadata).length, 2);
  assert.equal(visibleEntries(entries, { mode: 'all', types: [] }).length, 4, 'no selected chips means every type');
  assert.equal(visibleEntries(entries, { types: ['powerpoint'] }).length, 0);
  assert.deepEqual(normalizeTypeFilters('pdf,excel,pdf,unknown'), ['pdf', 'excel']);
  assert.deepEqual(normalizeTypeFilters('pdf'), ['pdf'], 'legacy single-type locations remain valid');
  assert.deepEqual(normalizeTypeFilters(null), []);
});

test('filtered folder counts and covers include the same matching descendant files, once each', () => {
  const entries = [folder('A'), folder('A/補足'), file('A/資料.pdf'), file('A/補足/資料.xlsx'), file('A/メモ.csv'), file('AB/余分.xlsx')];
  const files = matchingFiles(entries, { types: ['pdf', 'excel'], query: '資料' });
  const counts = folderFileCounts(files);
  assert.equal(counts.get('A'), 2); assert.equal(counts.get('A/補足'), 1); assert.equal(counts.has('AB'), false);
  assert.deepEqual(folderCoverEntries(files, 'A').map(x => x.name), ['資料.pdf', '資料.xlsx']);
  const sheets = matchingFiles(entries, { types: ['excel'] });
  assert.deepEqual(folderCoverEntries(sheets, 'A').map(x => x.path), ['A/補足/資料.xlsx']);
  assert.equal(folderFileCounts(matchingFiles(entries)).get('A'), 3, 'subfolders are not counted as documents');
  assert.equal(folderFileCounts(matchingFiles(entries, { types: ['word'] })).size, 0);
});

test('course display separates only the final opening information, preserving title qualifiers', () => {
  const cases = [
    ['デザインプロダクション演習', '(金1・金2、蓮池、2026年度後期前半)_yba815101'],
    ['化学熱力学(2a)', '(火3、有村、2026年度後期前半)_sba152309'],
    ['機械システム設計演習(2b)', '(月3・月4、高坂、2026年度後期前半)_sba121304'],
    ['Next PBL(1)', '(杉浦、2026年度後期)_sbz137632'],
    ['文献研究・演習II（羽田）', '（羽田、2026年度後期）_ymbz219207'],
    ['特別セミナー（Business Acceleration Program）', '（大久保、2026年度後期）_ymbz212008'],
    ['(特履用)ブランド戦略', '(未定、2026年度後期)_sbI555555'],
    ['(再)社会とジェンダー', '(木1、渡邊、2026年度後期)_ybz074101'],
    ['【開講中止】社会学(2a)', '(金1、吉田、2026年度後期前半)_sba005101'],
    ['応用化学実験基礎(2a)', '(金3・金4、金澤・江場・黒岩・岩村・高津・小林・塩月・秀島・奥田・金友・藤森・大山、2026年度後期前半)_sba155304'],
    ['講義（2a）', ' （月３，担当（非常勤），２０２６年度後期後半）_［ABC123］'],
    ['講義', '(教員、2026年度通年)_[ABC123]'],
    ['講義', '(教員、2026年度春学期)'],
    ['講義', '(2026年度後期)_ABC123'],
  ];
  for (const [title, suffix] of cases) {
    const name = title + suffix;
    assert.deepEqual(splitCourseName(name), { title, suffix }, name);
    assert.equal(splitCourseName(name).title + splitCourseName(name).suffix, name, 'display preserves the original text');
  }
});

test('ambiguous, malformed or incomplete course suffixes stay unchanged', () => {
  const names = [
    '化学熱力学(2a)', 'Next PBL(1)', '特別セミナー（情報データ科学の活用）',
    '2026年度 夏期海外インターンシップ', '講義(2026年度後期)', '講義(資料2026年度後期)_ABC123',
    '講義(教員、2026年度後期)_backup', '講義(2a)_ABC123', '講義(教員、2026年度後期)_ABC123_extra',
    '講義(教員、2026年度後期', '講義(教員、2026年度後期）_ABC123', '講義(教員（非常勤)、2026年度後期)_ABC123',
    '講義(教員、2026年度後期)_ABC123/補足', '講義(2a)(金3、金澤・江場・黒岩・岩村・高津',
    '(教員、2026年度後期)_ABC123', '',
  ];
  for (const name of names) assert.deepEqual(splitCourseName(name), { title: name, suffix: '' }, name);
});
