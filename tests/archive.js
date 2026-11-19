// 一次史料の部品：原稿・文書・手紙のタブを足したときの初期の並びで、所蔵機関・所蔵場所・宛先などが出るか。
// 実行: node tests/archive.js
'use strict';
const CSL = require('../vendor/citeproc_commonjs.js');
const G = require('../src/csl_generate.js');
const { makeStarter, archivePreset, fillTerms, TARGETS } = require('../src/starters.js');
const { retrieveLocale, items } = require('./render_starters.js');

// 画面で「項目の種類を選ぶ」にチェックを入れたときと同じ手順（app.js の setTypeChecked）
function addTab(m, type) {
  const key = 'x-' + type;
  const from = G.tabOfType(type, m);
  for (const [sk, sys] of Object.entries(m.systems)) for (const tg of TARGETS) {
    sys[tg] = sys[tg] || {};
    sys[tg][key] = (tg === 'bib' || tg === 'cite' ? archivePreset(sk, type, tg) : null) || JSON.parse(JSON.stringify(sys[tg][from] || []));
  }
  m.typeTabs = (m.typeTabs || []).concat(type);
}

// [文献, 参考文献に出るべき文字, 注に出るべき文字]
const CASES = [
  ['s-ja-manuscript-1', ['蒲原郡新田村検地帳', '検地帳）', '新田村庄屋文書 3-12', '越後史料館所蔵'], ['越後史料館所蔵']],
  ['s-ja-letter-1', ['長岡三郎書状（山田太郎宛）', '「年貢上納につき」', '山田家文書 12-4'], ['山田太郎宛']],
  ['s-fr-manuscript-1', ['Dubois, Léa', 'Mémoire', 'Fonds Moreau, carton 3', 'MS 412', 'Bibliothèque municipale, Montclair'], ['Léa Dubois', 'MS 412']],
  ['s-en-letter-1', ['Moreau, Jules', 'Letter to Léa Dubois', 'no. 27', 'Montclair'], ['Jules Moreau', 'Letter to Léa Dubois']],
];

const m = makeStarter('chicago'); m.info.id = 'x';
for (const t of ['manuscript', 'document', 'personal_communication']) addTab(m, t);
const xml = G.generate(m);
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => byId[id] }, xml, 'ja-JP', true);
e.setOutputFormat('text');
let bad = 0;
for (const [id, wantBib, wantCite] of CASES) {
  e.updateItems([id]);
  const bib = e.makeBibliography()[1].join('').trim();
  const cite = e.makeCitationCluster([{ id }]);
  const miss = [...wantBib.filter((w) => !bib.includes(w)), ...wantCite.filter((w) => !cite.includes(w))];
  if (miss.length) bad++;
  console.log(`${miss.length ? 'NG' : 'OK'} ${id}\n   参考文献 ${bib}\n   注       ${cite}${miss.length ? '\n   足りない：' + miss.join(' / ') : ''}`);
}

// 用語を足す前に作ったスタイル：宛先・文書番号の用語を補い、入っている値には触れない
const old = makeStarter('chicago');
for (const t of Object.values(old.terms)) { delete t.recipient; delete t['recipient-verb']; delete t.number; }
old.terms.ja.page = 'ページ';
fillTerms(old);
const termsOk = old.terms.ja.recipient === '宛' && old.terms.en['recipient-verb'] === 'to' && old.terms.en.number === 'no.' && old.terms.ja.page === 'ページ';
if (!termsOk) bad++;
console.log(`${termsOk ? 'OK' : 'NG'} 古いスタイルに用語を補う`);

console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
