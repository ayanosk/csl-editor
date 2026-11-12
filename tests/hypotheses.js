// 開発の初めに立てた、citeproc-js の振る舞いについての仮説 1・2・3・5 を確かめる。
// 実行: node digital_humanities/scripts/csl_editor/tests/hypotheses.js
'use strict';
const fs = require('fs');
const path = require('path');
const V = path.join(__dirname, '..', 'vendor');
const CSL = require(path.join(V, 'citeproc_commonjs.js'));
const LOCALES = {
  'ja-JP': fs.readFileSync(path.join(V, 'locales-ja-JP.xml'), 'utf8'),
  'en-US': fs.readFileSync(path.join(V, 'locales-en-US.xml'), 'utf8'),
};

// 和文と欧文で別レイアウトを持つスタイル（仮説1）。
// 目印 {M} を入れたい箇所は関数で差し替える（仮説2）。
function style({ mark = false, sortByLang = false } = {}) {
  const m = (n, inner) =>
    mark ? `<group><text value="${String.fromCharCode(0xE100 + n)}"/>${inner}<text value="${String.fromCharCode(0xE100 + n)}"/></group>` : inner;
  return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0" default-locale="ja-JP">
  <info><title>test</title><id>http://example.org/test</id><updated>2026-11-11T00:00:00+00:00</updated></info>
  <locale xml:lang="ja"><terms><term name="page" form="short">頁</term></terms></locale>
  <locale xml:lang="en"><terms><term name="issue" form="short">no.</term></terms></locale>
  <citation><layout><text variable="title"/></layout></citation>
  <bibliography>
    ${sortByLang ? '<sort><key variable="language" sort="descending"/><key variable="author"/></sort>' : ''}
    <layout locale="ja" suffix="。">
      ${m(0, '<names variable="author"><name delimiter="・"/></names>')}
      <group delimiter="、">
        <group>
          ${m(1, '<text variable="title" quotes="false" prefix="『" suffix="』"/>')}
        </group>
        <text variable="publisher"/>
        <date variable="issued" form="text" date-parts="year"><date-part name="year" suffix="年"/></date>
        <label variable="page" form="short" plural="never" prefix="TERM:"/>
      </group>
    </layout>
    <layout locale="en" suffix=".">
      ${m(0, '<names variable="author"><name name-as-sort-order="first" sort-separator=", " initialize-with=". " delimiter=", "/></names>')}
      <group delimiter=". " prefix=". ">
        ${m(1, '<text variable="title" quotes="true"/>')}
        <text variable="publisher"/>
        <date variable="issued"><date-part name="year"/></date>
        <group><text term="issue" form="short" prefix="TERM:"/></group>
      </group>
    </layout>
    <layout>
      <text value="[DEFAULT] "/><text variable="title"/>
    </layout>
  </bibliography>
</style>`;
}

const base = (id, lang, extra = {}) => Object.assign({
  id, type: 'book', title: `書名${id}`, publisher: '越後書房',
  issued: { 'date-parts': [[2024]] }, page: '45-67',
  author: [{ family: '山田', given: '花子' }],
}, lang === undefined ? {} : { language: lang }, extra);

const items = [
  base('ja', 'ja'),
  base('jpn', 'jpn'),
  base('nihongo', '日本語'),
  base('jaJP', 'ja-JP'),
  base('empty', undefined),
  base('en', 'en', { title: 'Numbers in the Archive.', author: [{ family: 'Dubois', given: 'Léa' }, { family: 'Moreau', given: 'Jules' }], publisher: 'Example UP' }),
  base('enUS', 'en-US', { title: 'A "Quoted" Title', author: [{ family: 'Smith', given: 'John Paul' }] }),
  // 仮説5：和名と欧名の混在。言語欄は en にしても和名は詰まるか
  base('mixed', 'en', { title: 'Mixed', author: [{ family: '山田', given: '花子' }, { family: 'Smith', given: 'John' }] }),
  base('kana', 'ja', { title: 'かな', author: [{ family: 'にいがた', given: 'はなこ' }, { family: 'ヤマダ', given: 'タロウ' }] }),
];

function run(opts, fmt = 'text') {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const sys = {
    retrieveLocale: (l) => LOCALES[l] || LOCALES[{ ja: 'ja-JP', en: 'en-US' }[l]],
    retrieveItem: (id) => byId[id],
  };
  const eng = new CSL.Engine(sys, style(opts), 'ja-JP', true);
  eng.setOutputFormat(fmt);
  eng.updateItems(items.map((i) => i.id));
  const [meta, entries] = eng.makeBibliography();
  return meta.entry_ids.map((ids, k) => [ids[0], entries[k].trim()]);
}

console.log('== 仮説1・5：言語別レイアウト（並びは既定の順）');
for (const [id, s] of run({})) console.log(id.padEnd(8), JSON.stringify(s));

console.log('\n== 仮説2：目印あり（目印を見える形に置換）');
const plain = Object.fromEntries(run({}));
for (const [id, s] of run({ mark: true })) {
  const vis = s.replace(/[-]/g, (c) => c === '' ? '⟨' : c === '' ? '⟩' : String(c.charCodeAt(0) - 0xE100))
    .replace(/[-]/g, (c) => String(c.charCodeAt(0) - 0xE100));
  const stripped = s.replace(/[][-]/g, '');
  console.log(id.padEnd(8), stripped === plain[id] ? 'OK ' : 'DIFF', JSON.stringify(vis));
  if (stripped !== plain[id]) console.log('         plain:', JSON.stringify(plain[id]));
}

console.log('\n== 仮説3：language 降順で並べ替え');
console.log(run({ sortByLang: true }).map(([id]) => id).join(' / '));

console.log('\n== 参考：HTML 出力（目印なし）');
for (const [id, s] of run({}, 'html').slice(0, 2)) console.log(id.padEnd(8), s);
