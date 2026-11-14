// 読みで五十音順に並べる：和文は Extra（CSL の note）の1行目の読み、欧文は Extra を見ずに著者名。
// 実行: node tests/reading_sort.js
'use strict';
const CSL = require('../vendor/citeproc_commonjs.js');
const G = require('../src/csl_generate.js');
const { makeStarter } = require('../src/starters.js');
const { retrieveLocale } = require('./render_starters.js');
const J = (id, fam, note) => ({ id, type: 'book', language: 'ja', title: '書名', author: [{ family: fam, given: '太郎' }], issued: { 'date-parts': [[2020]] }, ...(note ? { note } : {}) });
const E = (id, fam, note) => ({ id, type: 'book', language: 'en', title: 'Book', author: [{ family: fam, given: 'Ann' }], issued: { 'date-parts': [[2019]] }, ...(note ? { note } : {}) });
const items = [
  J('j-wa', '渡辺', 'わたなべ たろう'), J('j-a', '青木', 'あおき たろう'), J('j-go', '後藤', 'ごとう たろう'),
  J('j-ko', '小林', 'こばやし たろう'), J('j-sho', '東海林', 'しょうじ たろう'), J('j-i', '伊藤', 'イトウ タロウ'),
  J('j-o', '岡田', 'original-date: 1990\nおかだ たろう'), // 頭の CSL の変数の行は飛ばされる
  E('e-b', 'Brown', 'zzz memo'), E('e-a', 'Adams', 'aaa memo'), // 欧文は Extra のメモに左右されない
];
const want = ['j-a', 'j-i', 'j-o', 'j-go', 'j-ko', 'j-sho', 'j-wa', 'e-a', 'e-b'];
let bad = 0;
const order = (xml, its) => {
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => its.find((i) => i.id === id) }, xml, 'ja-JP', false);
  e.updateItems(its.map((i) => i.id));
  return e.makeBibliography()[0].entry_ids.map((x) => x[0]);
};
for (const k of ['chicago', 'apa', 'mla']) {
  const m = makeStarter(k); m.info.id = 'x'; m.sortByLanguage = true; m.sortByReading = true;
  const got = order(G.generate(m), items);
  const ok = got.join() === want.join();
  console.log(`${ok ? 'OK' : 'NG'} ${k} 多言語版：${got.join(' ')}`);
  if (!ok) bad++;
  // 言語別の和文版（標準の CSL 1.0.2）でも、読みで並ぶ
  const ja = items.filter((i) => i.language === 'ja');
  const got2 = order(G.generate(m, { only: 'ja' }), ja);
  const ok2 = got2.join() === want.filter((x) => x.startsWith('j-')).join();
  console.log(`${ok2 ? 'OK' : 'NG'} ${k} 和文版：${got2.join(' ')}`);
  if (!ok2) bad++;
}
// 番号形式は並べ替えないので、読みの鍵を入れない
const ieee = makeStarter('ieee'); ieee.info.id = 'x'; ieee.sortByReading = true;
const noKey = !/sort-yomi/.test(G.generate(ieee));
console.log(`${noKey ? 'OK' : 'NG'} ieee（番号形式）には読みの鍵を入れない`);
if (!noKey) bad++;
console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
