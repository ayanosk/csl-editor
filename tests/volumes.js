// 総巻数の部品：参考文献に「全5巻」「5 vols.」と出るか。用語表の「巻（複数）」の初期値と、前の版のスタイルへの補い。
// 実行: node tests/volumes.js
'use strict';
const CSL = require('../vendor/citeproc_commonjs.js');
const G = require('../src/csl_generate.js');
const { makeStarter, fillTerms, addLanguage, F, S } = require('../src/starters.js');
const { retrieveLocale } = require('./render_starters.js');

const ITEMS = [
  { id: 'v-ja', type: 'book', language: 'ja', title: '大日本古文書', author: [{ literal: '東京大学史料編纂所' }], publisher: '東京大学出版会', issued: { 'date-parts': [[1901]] }, 'number-of-volumes': '5' },
  { id: 'v-en', type: 'book', language: 'en', title: 'The Academy Papers', author: [{ family: 'Moreau', given: 'Jules' }], publisher: 'Example Press', issued: { 'date-parts': [[1901]] }, 'number-of-volumes': '5' },
  { id: 'v-en1', type: 'book', language: 'en', title: 'A Single Volume', author: [{ family: 'Moreau', given: 'Jules' }], publisher: 'Example Press', issued: { 'date-parts': [[1902]] }, 'number-of-volumes': '1' },
];
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

function render(m) {
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => byId[id] }, G.generate(m), 'ja-JP', true);
  e.setOutputFormat('text');
  e.updateItems(ITEMS.map((i) => i.id));
  const r = e.makeBibliography();
  return Object.fromEntries(r[0].entry_ids.map((ids, k) => [ids[0], r[1][k].trim()]));
}
function withVolumes(m) {
  m.systems.ja.bib.book.push(F('number-of-volumes', { prefix: '、全', opt: { label: 'after' } }));
  m.systems.en.bib.book.push(S(' '), F('number-of-volumes', { opt: { label: 'after' } }));
  return m;
}

let bad = 0;
function check(name, ok, detail) {
  if (!ok) bad++;
  console.log(`${ok ? 'OK' : 'NG'} ${name}${detail ? '\n   ' + detail : ''}`);
}

const m = withVolumes(makeStarter('chicago')); m.info.id = 'x';
let out = render(m);
check('和文：全5巻', out['v-ja'].includes('全5巻'), out['v-ja']);
check('欧文：5 vols.', out['v-en'].includes('5 vols.'), out['v-en']);
check('欧文：1巻なら vol.', out['v-en1'].includes('1 vol.') && !out['v-en1'].includes('vols.'), out['v-en1']);

m.systems.ja.kanjiNumerals = 'ten';
out = render(m);
check('漢数字：全五巻', out['v-ja'].includes('全五巻'), out['v-ja']);

// 前の版のスタイル（「巻（複数）」の行が無い）：初期値のままなら複数形を補い、直した語はそのまま複数にも使う
const old = makeStarter('chicago');
for (const t of Object.values(old.terms)) delete t.volumes;
old.terms.ja.volume = '冊';
fillTerms(old);
check('前の版：欧文に vols. を補う', old.terms.en.volumes === 'vols.', JSON.stringify(old.terms.en.volumes));
check('前の版：直した語（冊）は複数にも使う', old.terms.ja.volumes === '冊', JSON.stringify(old.terms.ja.volumes));

// 言語ごとの既定の書式：用語に複数の巻が無ければ、英語の vols. ではなくその言語の1巻の語
const z = makeStarter('chicago');
addLanguage(z, null, 'zh-cn');
check('中国語の既定：卷', z.terms.zh && z.terms.zh.volumes === z.terms.zh.volume, JSON.stringify(z.terms.zh && [z.terms.zh.volume, z.terms.zh.volumes]));

console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
