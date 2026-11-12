// 引用箇所の組み方：数字だけなら用語を添え（和文の章・節は「第」も）、文字を含むなら入れたまま出す。
// 実行: node tests/locator.js
'use strict';
const CSL = require('../vendor/citeproc_commonjs.js');
const G = require('../src/csl_generate.js');
const { STARTERS, makeStarter } = require('../src/starters.js');
const { retrieveLocale, items } = require('./render_starters.js');
const ja = items.find((i) => i.id === 's-ja-chapter-1'), en = items.find((i) => i.id === 's-en-chapter-1');
const CASES = [['page', '42'], ['page', '42-45'], ['chapter', '2'], ['chapter', '第二章'], ['chapter', '2章2節'], ['section', '3'], ['section', '第3節']];
let bad = 0;
for (const k of Object.keys(STARTERS)) {
  const m = makeStarter(k); m.info.id = 'x';
  const xml = G.generate(m);
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => (id === ja.id ? ja : en) }, xml, 'ja-JP', true);
  e.setOutputFormat('text'); e.updateItems([ja.id, en.id]);
  console.log(`== ${k}`);
  for (const [label, loc] of CASES) {
    const oj = e.makeCitationCluster([{ id: ja.id, locator: loc, label }]);
    const oe = e.makeCitationCluster([{ id: en.id, locator: loc, label }]);
    const want = { '42': /42頁/, '42-45': /42-45頁/, '2': /第2章/, '第二章': /第二章(?!章)/, '2章2節': /2章2節(?![章節])/, '3': /第3節/, '第3節': /第3節(?!節)/ }[loc];
    const okJa = want.test(oj) && !/章章|節節|節章/.test(oj);
    // 欧文：数字の章・節には用語（chap. sec.）が付き、頁には付けるかどうかは型の設定どおり
    const okEn = !/章章|節節|節章/.test(oe) && (!/^\d/.test(loc) || oe.includes(loc.replace('-', '–')) || oe.includes(loc))
      && (label === 'page' || !/^\d+$/.test(loc) || /(chap|sec)\./.test(oe));
    if (!okJa || !okEn) bad++;
    console.log(`  ${okJa && okEn ? 'OK' : 'NG'} ${label.padEnd(8)} ${loc.padEnd(6)} 和文 ${oj}\n${' '.repeat(22)}欧文 ${oe}`);
  }
}
console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
