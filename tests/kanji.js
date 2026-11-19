// 漢数字の設定：〇式・十式の変換と、和文の書式だけが漢数字になること（欧文・発行年は算用数字のまま）。
// 実行: node tests/kanji.js
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', 'src', 'csl_generate.js'));
const ST = require(path.join(__dirname, '..', 'src', 'starters.js'));
const { render, items } = require('./render_starters.js');
const errs = [];
const eq = (label, got, want) => { if (got !== want) errs.push(`${label}: ${got}（期待 ${want}）`); };
for (const [n, z, t] of [[10, '一〇', '十'], [42, '四二', '四十二'], [101, '一〇一', '百一'], [230, '二三〇', '二百三十'], [1205, '一二〇五', '千二百五'], [3000, '三〇〇〇', '三千']]) {
  eq(`〇式 ${n}`, G.kanjiNumber(n, 'zero'), z);
  eq(`十式 ${n}`, G.kanjiNumber(n, 'ten'), t);
}
const m = ST.makeStarter('chicago');
m.systems.ja.kanjiNumerals = 'zero';
const r = render(m, 'text', {}, items.filter((i) => /-1$/.test(i.id)));
const bib = Object.fromEntries(r.bib), cite = Object.fromEntries(r.cites);
eq('和文の雑誌論文', bib['s-ja-article-1'], '山本花子「近世村方文書のTEI化」『越後史学』一二巻三号、2024年、四五-六七頁。');
eq('和文の注', cite['s-ja-book-1'], '山本花子『デジタル史料学入門』越後書房、2024年、四二頁。');
eq('欧文の注は算用数字のまま', cite['s-en-book-1'], 'Emily Brown, Village Records and the State (Example University Press, 2020), 42.');
console.log(errs.length ? 'NG\n' + errs.join('\n') : 'OK 漢数字（〇式・十式、和文だけ、発行年は算用数字）');
process.exit(errs.length ? 1 : 0);
