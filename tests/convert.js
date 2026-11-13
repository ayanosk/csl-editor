// 公式のスタイルを部品（チップ）に移す：組み直した出力が、見本のすべてで元のスタイルと同じになるか。
// 実行: node tests/convert.js
'use strict';
const fs = require('fs'), path = require('path');
const CSL = require('../vendor/citeproc_commonjs.js');
const C = require('../src/convert.js');
const G = require('../src/csl_generate.js');
const { retrieveLocale, items } = require('./render_starters.js');
let bad = 0;
for (const f of ['chicago-notes-bibliography', 'ieee']) {
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', f + '.csl'), 'utf8');
  const r = C.convert(CSL, xml, items, retrieveLocale);
  const ch = r.report.checks, same = ch.filter((x) => x.same).length;
  console.log(`${same === ch.length ? 'OK' : 'NG'} ${f}：${same}/${ch.length}（${r.kind}、和文は ${r.starter} の型）`);
  ch.filter((x) => !x.same).slice(0, 3).forEach((x) => console.log(`   ${x.id} ${x.place}\n   元: ${x.original}\n   移: ${x.converted}`));
  if (same !== ch.length) bad++;
  // 多言語版でも組める（和文は和文の書式、欧文は元のスタイル）
  const multi = G.generate({ ...r.model, info: { title: 't', id: 'http://example.org/t' } });
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => items.find((i) => i.id === id) }, multi, 'ja-JP', false);
  e.setOutputFormat('text'); e.updateItems(['s-ja-book-1', 's-en-book-1']);
  const bib = e.makeBibliography()[1].join('');
  const ok = /『デジタル史料学入門』/.test(bib) && /Village Records and the State/.test(bib) && /rel="template"/.test(multi);
  console.log(`${ok ? 'OK' : 'NG'} ${f}：多言語版で和文と欧文を書き分け、元のスタイルを template に記録する`);
  if (!ok) bad++;
}
console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
