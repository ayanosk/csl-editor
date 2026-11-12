// 書き出し→読み込みの往復と、記号を含む前後の文字で XML が壊れないことを確かめる。
// 実行: node tests/roundtrip.js [書き出し先のディレクトリ]
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const Gen = require('../src/csl_generate.js');
const { STARTERS, makeStarter, F, S } = require('../src/starters.js');
const { render } = require('./render_starters.js');

let n = 0;
for (const k of Object.keys(STARTERS)) {
  const m = makeStarter(k);
  m.info.id = 'http://www.zotero.org/styles/csl-editor-test-' + k;
  m.info.title = 'テスト ' + STARTERS[k].label + ' -- 「--」を含む';
  const xml = Gen.generate(m, { updated: '2026-11-11T00:00:00+00:00' });
  const back = Gen.extractModel(xml);
  assert.deepStrictEqual(back, JSON.parse(JSON.stringify(m)), `往復で変わった: ${k}`);
  // コメントの中に -- が無いこと（XML の規則）
  const comment = xml.match(/<!--([\s\S]*?)-->/)[1];
  assert(!comment.includes('--'), 'コメントに -- がある');
  n++;
  if (process.argv[2]) fs.writeFileSync(path.join(process.argv[2], `test_${k}.csl`), xml);
}
// 記号を含む前後の文字
const m = makeStarter('chicago');
m.systems.ja.bib.book.unshift(F('literal', { opt: { value: 'A&B <x> "q"' } }), S(' & '));
m.systems.ja.bib.book[2].prefix = '<';
m.systems.ja.bib.book[2].suffix = '">';
const r = render(m);
const book = r.bib.find(([id]) => id === 's-ja-book-1')[1];
// 対になった直線の引用符 "q" は、citeproc-js が組版用の “q” に替える（エンジンの決まった動き）。
assert.strictEqual(book, 'A&B <x> “q” & <山田花子">『デジタル史料学入門』越後書房、2024年。', book);
n++;
console.log(`OK ${n}件`);
