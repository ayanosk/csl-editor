// 仮説1の切り分け：どの条件で言語別レイアウトが選ばれるか。
'use strict';
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..', 'vendor');
const CSL = require(path.join(V, 'citeproc_commonjs.js'));
const LOC = { 'ja-JP': fs.readFileSync(path.join(V, 'locales-ja-JP.xml'), 'utf8'), 'en-US': fs.readFileSync(path.join(V, 'locales-en-US.xml'), 'utf8') };
const L = (tag) => `<text value="[${tag}] "/><text variable="title"/><text term="page" form="short" prefix=" TERM="/><text term="editor" form="short" prefix=" ED="/>`;
function style(defLoc, layouts) {
  return `<?xml version="1.0" encoding="utf-8"?><style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0" default-locale="${defLoc}">
<info><title>t</title><id>x</id><updated>2026-11-11T00:00:00+00:00</updated></info>
<locale xml:lang="ja"><terms><term name="page" form="short">頁</term></terms></locale>
<citation><layout><text variable="title"/></layout></citation><bibliography>${layouts}</bibliography></style>`;
}
const langs = ['ja', 'jpn', '日本語', 'ja-JP', '', 'en', 'en-US', 'fr', 'zh'];
const items = langs.map((l, i) => ({ id: 'i' + i, type: 'book', title: `T(${l || '空'})`, ...(l ? { language: l } : {}) }));
const cases = {
  'A def=ja-JP / ja,en,無印': ['ja-JP', `<layout locale="ja">${L('JA')}</layout><layout locale="en">${L('EN')}</layout><layout>${L('DEF')}</layout>`],
  'B def=en-US / ja,en,無印': ['en-US', `<layout locale="ja">${L('JA')}</layout><layout locale="en">${L('EN')}</layout><layout>${L('DEF')}</layout>`],
  'C def=ja-JP / en,無印': ['ja-JP', `<layout locale="en">${L('EN')}</layout><layout>${L('DEF')}</layout>`],
  'D def=en-US / ja,無印': ['en-US', `<layout locale="ja">${L('JA')}</layout><layout>${L('DEF')}</layout>`],
  'E def=ja-JP / ja-JP,en-US,無印': ['ja-JP', `<layout locale="ja-JP">${L('JA')}</layout><layout locale="en-US">${L('EN')}</layout><layout>${L('DEF')}</layout>`],
};
for (const [name, [def, lay]] of Object.entries(cases)) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const sys = { retrieveLocale: (l) => LOC[l] || LOC[{ ja: 'ja-JP', en: 'en-US' }[l]], retrieveItem: (id) => byId[id] };
  let out;
  try {
    const e = new CSL.Engine(sys, style(def, lay), def, true);
    e.setOutputFormat('text'); e.updateItems(items.map((i) => i.id));
    const [m, ents] = e.makeBibliography();
    out = ents.map((s) => s.trim()).join('\n   ');
  } catch (err) { out = 'ERROR ' + err.message; }
  console.log('== ' + name + '\n   ' + out);
}
