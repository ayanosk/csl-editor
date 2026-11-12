// 空欄の検査：見本の各文献から欄を1つずつ（と、まとめて）空にして組み、句読点の崩れを探す。
// Zotero で実際に使うと、欄が欠けた文献はよくある（出版地が無い、年が無い、訳者がいない）。
// 実行: node tests/empty_fields.js [スタイル名]   崩れがあれば終了コード 1。
'use strict';
const { render, items } = require('./render_starters.js');
const { STARTERS, makeStarter } = require('../src/starters.js');

const OPTIONAL = ['author', 'editor', 'translator', 'container-title', 'publisher', 'publisher-place', 'issued',
  'volume', 'issue', 'page', 'URL', 'accessed', 'title-short'];

// 崩れの型。[名前, 正規表現]
const BAD = [
  ['句読点の重なり', /[,，、:;：；]\s*[,，、。.:;：；]/],
  ['句点の重なり', /[。]\s*[。、]|\.\s*\.(?!\.)/],
  ['空の括弧', /\(\s*\)|（\s*）|\[\s*\]|『\s*』|「\s*」|“\s*”/],
  ['括弧の直後の句読点', /[(（[]\s*[,，、.:;]/],
  ['括弧の直前の句読点', /[,，、:;]\s*[)）\]]/],
  ['先頭の句読点', /^\s*[,，、。.:;）)]/],
  ['句読点の前の空白', / [,.:;](?!\d)/],
];
const PAIRS = [['(', ')'], ['（', '）'], ['[', ']'], ['『', '』'], ['「', '」'], ['“', '”']];
function problems(text) {
  const out = [];
  for (const [name, re] of BAD) if (re.test(text)) out.push(name);
  for (const [o, c] of PAIRS) if (text.split(o).length !== text.split(c).length) out.push('括弧の対 ' + o + c);
  return out;
}

const keys = process.argv[2] ? [process.argv[2]] : Object.keys(STARTERS);
let total = 0;
for (const key of keys) {
  const model = makeStarter(key);
  const variants = [];
  for (const it of items) {
    for (const f of OPTIONAL) if (it[f] !== undefined) {
      const v = JSON.parse(JSON.stringify(it));
      delete v[f];
      variants.push([`${it.id} から ${f} を外す`, v]);
    }
    const bare = JSON.parse(JSON.stringify(it));
    for (const f of OPTIONAL) if (f !== 'author' && f !== 'container-title') delete bare[f];
    variants.push([`${it.id} を題名・著者・掲載誌名だけにする`, bare]);
  }
  const found = new Map();
  const fullCache = new Map();
  const full = (it) => {
    if (!fullCache.has(it.id)) {
      const r = render(model, 'text', {}, [{ ...it }]);
      fullCache.set(it.id, [r.bib[0] ? r.bib[0][1] : '', r.cites[0][1]]);
    }
    return fullCache.get(it.id);
  };
  for (const [label, v] of variants) {
    const orig = items.find((i) => i.id === label.split(' ')[0]);
    v.id = 'x';
    const r = render(model, 'text', {}, [v]);
    const outs = [['参考文献', r.bib[0] ? r.bib[0][1] : ''], ['注・本文中', r.cites[0][1]]];
    const fulls = full(orig);
    outs.forEach(([where, text], k) => {
      const p = problems(text);
      // 題名の直後の区切りが変わったら、空にした欄の側ではない区切りが残っている（MLA の「書名, 出版者」の型）。
      // 空にしたのが題名の直後の欄なら、区切りが変わるのは正しいことがあるので、変わり方が「. → ,」などのときだけ数える。
      const after = (t) => { const j = t.indexOf(orig.title); if (j < 0) return null; const m = t.slice(j + orig.title.length).match(/^[^\p{L}\p{N}]*/u); return m ? m[0].trim() : ''; };
      const a0 = after(fulls[k]), a1 = after(text);
      if (a0 !== null && a1 !== null && a0 !== a1 && /[.。]/.test(a0) && /[,，、:]/.test(a1)) p.push('題名の後の区切りが変わる');
      if (!p.length) return;
      const key2 = p.join('・') + '｜' + where;
      if (!found.has(key2)) found.set(key2, []);
      found.get(key2).push(`${label}\n      ${text}`);
    });
  }
  const n = [...found.values()].reduce((a, b) => a + b.length, 0);
  total += n;
  console.log(`\n### ${key}（${STARTERS[key].label}）：${variants.length}通り中 ${n}件`);
  for (const [k, ex] of found) {
    console.log(`  - ${k}（${ex.length}件）例：`);
    for (const e of ex.slice(0, 3)) console.log('    ' + e);
  }
}
console.log(`\n崩れ：合計 ${total}件`);
process.exit(total ? 1 : 0);
