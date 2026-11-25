// 「注では別の人数にする」の検査。本文中の引用は Quirk et al. (1985)、参考文献は4人全員を書く、などの分け方。
// 1) 入れないとき：注と参考文献が、書式全体の同じ人数で略される（前の版と同じ）
// 2) 入れたとき：注だけが別の人数で略され、参考文献は書式全体の人数のまま
// 3) 4) 「何人でも全員書く」：人数の欄があっても略さない。書式全体と注で別々に効く
// 実行: node tests/etal_split.js
'use strict';
const assert = require('assert');
const { render } = require('./render_starters.js');
const { STARTERS, makeStarter } = require('../src/starters.js');
const enItem = { id: 'etal-en', type: 'book', language: 'en', title: 'A Comprehensive Grammar of the English Language', publisher: 'Longman', 'publisher-place': 'London', issued: { 'date-parts': [[1985]] },
  author: [{ family: 'Quirk', given: 'Randolph' }, { family: 'Greenbaum', given: 'Sidney' }, { family: 'Leech', given: 'Geoffrey' }, { family: 'Svartvik', given: 'Jan' }] };
const jaItem = { id: 'etal-ja', type: 'book', language: 'ja', title: '村の記録', publisher: '見本書房', 'publisher-place': '東京', issued: { 'date-parts': [[2018]] },
  author: [{ family: '山田', given: '太郎' }, { family: '佐藤', given: '花子' }, { family: '鈴木', given: '一郎' }, { family: '高橋', given: '次郎' }] };
const ITEMS = [enItem, jaItem];
const out = (m) => {
  const r = render(m, 'text', {}, ITEMS);
  return { bib: Object.fromEntries(r.bib), cite: Object.fromEntries(r.cites) };
};
let n = 0;
for (const k of Object.keys(STARTERS)) {
  // 1) 書式全体で、和文・欧文とも 10 人以上で略す → 注にも参考文献にも4人全員が出る
  const m = makeStarter(k);
  // 番号形式（IEEE 風）は、引用に人名が出ないので見ない
  if (m.kind === 'numeric') continue;
  for (const sk of ['ja', 'en']) Object.assign(m.systems[sk].names, { etAlMin: 10, etAlUseFirst: 1, citeEtAl: false });
  const a = out(m);
  for (const v of [a.bib['etal-en'], a.cite['etal-en']]) assert(v.includes('Svartvik'), `${k}: 4人目が無い: ${v}`);
  for (const v of [a.bib['etal-ja'], a.cite['etal-ja']]) assert(v.includes('高橋'), `${k}: 4人目が無い: ${v}`);
  // 2) 注だけ 3 人以上で筆頭1人に略す → 注は Quirk et al.・山田太郎ほか、参考文献は4人のまま
  for (const sk of ['ja', 'en']) Object.assign(m.systems[sk].names, { citeEtAl: true, citeEtAlMin: 3, citeEtAlUseFirst: 1 });
  const b = out(m);
  assert.strictEqual(b.bib['etal-en'], a.bib['etal-en'], `${k}: 参考文献（欧文）が変わった`);
  assert.strictEqual(b.bib['etal-ja'], a.bib['etal-ja'], `${k}: 参考文献（和文）が変わった`);
  assert(/et al\./.test(b.cite['etal-en']) && !b.cite['etal-en'].includes('Greenbaum'), `${k}: 注（欧文）が略されない: ${b.cite['etal-en']}`);
  assert(b.cite['etal-ja'].includes('ほか') && !b.cite['etal-ja'].includes('佐藤'), `${k}: 注（和文）が略されない: ${b.cite['etal-ja']}`);
  // 3) 書式全体を「何人でも全員書く」にする → 人数を2人にしても、参考文献は4人全員。注は別の人数のまま略す
  for (const sk of ['ja', 'en']) Object.assign(m.systems[sk].names, { etAlAll: true, etAlMin: 2, etAlUseFirst: 1 });
  const c = out(m);
  assert.strictEqual(c.bib['etal-en'], a.bib['etal-en'], `${k}: 全員書く（欧文）で参考文献が変わった`);
  assert.strictEqual(c.bib['etal-ja'], a.bib['etal-ja'], `${k}: 全員書く（和文）で参考文献が変わった`);
  assert.strictEqual(c.cite['etal-en'], b.cite['etal-en'], `${k}: 全員書くが注にも効いた`);
  // 4) 注のほうを「全員書く」にする → 注にも4人全員
  for (const sk of ['ja', 'en']) Object.assign(m.systems[sk].names, { citeEtAlAll: true });
  const d = out(m);
  assert(d.cite['etal-en'].includes('Svartvik') && d.cite['etal-ja'].includes('高橋'), `${k}: 注で全員書かない: ${d.cite['etal-en']}`);
  console.log(`  ${k}: ${b.cite['etal-en']} ／ ${b.bib['etal-en']}`);
  n++;
}
console.log(`OK ${n} 型`);
