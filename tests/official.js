// 公式のスタイルの手直し（src/official.js）の検査。
// 1) 木にして書き戻すだけなら、組んだ出力は元のスタイルと同じ
// 2) 目印による対応づけで、元の出力の文字のほとんどが元の要素にたどれる
// 3) 編集（属性・外す・並べ替え）が、意図した出力だけを変える
// 4) 書き出しで名前と ID が替わり、元のスタイルを template として残す
// 実行: node tests/official.js
'use strict';
const fs = require('fs'), path = require('path');
const CSL = require('../vendor/citeproc_commonjs.js');
const O = require('../src/official.js');
const { retrieveLocale, items } = require('./render_starters.js');
const FIX = path.join(__dirname, 'fixtures');
let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK ' : '  NG ') + msg); if (!cond) bad++; };

for (const f of ['chicago-notes-bibliography.csl', 'ieee.csl']) {
  const src = fs.readFileSync(path.join(FIX, f), 'utf8');
  console.log(`== ${f}`);
  const base = O.parse(src);
  // 1) 書き戻し
  const orig = O.renderRows(CSL, src, items, retrieveLocale, 'en-US');
  const back = O.renderRows(CSL, O.serialize(base), items, retrieveLocale, 'en-US');
  ok(JSON.stringify(orig.rows) === JSON.stringify(back.rows), `木にして書き戻しても出力は同じ（要素 ${base.count}個）`);
  // 2) 対応づけ
  const v = O.build(CSL, base, [], items, retrieveLocale);
  const sameAsOrig = items.every((it) => v.view[it.id].every((r, k) => r.plain === orig.rows[it.id][k][2]));
  ok(sameAsOrig, '表示する出力は、目印なしの元の出力そのもの');
  const rate = v.direct / v.total;
  ok(rate > 0.97, `文字の直接の対応 ${(100 * rate).toFixed(1)}%（${v.direct}/${v.total}字）`);
  const segOk = items.every((it) => v.view[it.id].every((r) => r.html.replace(/<span class="cslseg"[^>]*>|<\/span>/g, '') === r.plain.replace(/&#38;/g, '&amp;')));
  ok(segOk, '印を付けた HTML から印を外すと、元の HTML に戻る');
}

// 3) 編集（Chicago）
{
  const src = fs.readFileSync(path.join(FIX, 'chicago-notes-bibliography.csl'), 'utf8');
  const base = O.parse(src);
  const before = O.build(CSL, base, [], items, retrieveLocale);
  const row = (b, id, key) => b.view[id].find((r) => r.key === key).plain;
  // 画面と同じく、出力の文字を押したときの要素（いちばん内側）を使う
  const clickOn = (b, id, key, text) => {
    const html = b.view[id].find((r) => r.key === key).html;
    const re = /<span class="cslseg" data-n="(\d+)"[^>]*>([^<]*)<\/span>/g;
    let m; while ((m = re.exec(html))) if (m[2].includes(text)) return O.index(base)[+m[1]];
    return null;
  };
  const title = clickOn(before, 's-en-book-1', 'bib', 'Village Records');
  ok(!!title, `書名を押すと要素にたどり着く（${O.describe(title)}、マクロ ${O.macroOf(title)}）`);
  const e1 = O.build(CSL, base, [{ e: title.eid, op: 'attr', name: 'font-style', value: 'normal' }], items, retrieveLocale);
  const changed = (a, b) => items.flatMap((it) => a.view[it.id].filter((r, k) => r.plain !== b.view[it.id][k].plain).map((r) => `${r.key}:${it.id}`));
  const c1 = changed(before, e1);
  ok(row(e1, 's-en-book-1', 'bib').indexOf('<i>') < 0 && row(before, 's-en-book-1', 'bib').indexOf('<i>') >= 0, '書名の斜体をやめると、参考文献の書名が斜体でなくなる');
  ok(c1.some((x) => x.startsWith('bib:')) && c1.some((x) => x.startsWith('cite:')), `その変更は参考文献と注の両方に効く（${c1.length}か所：${[...new Set(c1.map((x) => x.split(':')[0]))].join('・')}）`);
  // 外す：参考文献の出版者
  const pub = clickOn(before, 's-en-book-1', 'bib', 'Example University Press');
  ok(!!pub, `出版者を押すと要素にたどり着く（${O.describe(pub)}、マクロ ${O.macroOf(pub)}）`);
  const e2 = O.build(CSL, base, [{ e: pub.eid, op: 'delete' }], items, retrieveLocale);
  ok(!row(e2, 's-en-book-1', 'bib').includes('Example University Press') && row(e2, 's-en-book-1', 'cite').includes('Example University Press'), '参考文献の出版者を外すと、参考文献からだけ消える');
  // 並べ替え：出版者と年のまとまりの中で入れ替える（「, 」を押すと、そのまとまりにたどり着く）
  const html = before.view['s-en-book-1'].find((r) => r.key === 'bib').html;
  const mm = html.match(/Example University Press<\/span><span class="cslseg" data-n="(\d+)"[^>]*>, <\/span>/);
  const grp = mm && O.index(base)[+mm[1]];
  ok(!!grp && grp.tag === 'group', `出版者と年の間の「, 」を押すと、まとまりにたどり着く（区切り「${grp && O.getAttr(grp, 'delimiter')}」）`);
  // 出版者を含む子を、年を含む子と入れ替える。マクロの呼び出しをまたぐので、元の木ではなく、
  // 組んだときの入れ子（data-path：外から内へ）で、まとまりのすぐ内側の要素を見る。
  const pm = html.match(/<span class="cslseg" data-n="\d+" data-path="([\d,]+)">Example University Press<\/span>/);
  const pathNums = pm ? pm[1].split(',').map(Number) : [];
  const inner = O.index(base)[pathNums[pathNums.indexOf(grp.ord) + 1]];
  const unit = O.unitIn(grp, inner);
  ok(!!unit, `まとまりの中で出版者を出しているのは <${unit && unit.tag}>（その中の「${O.describe(inner)}」）`);
  const sibs = grp.children.filter((x) => x.type === 'el');
  const k = sibs.indexOf(unit);
  // 後ろの日付のまとまりと入れ替える（前の分岐はウェブページ用で、図書では何も出さない）
  const e3 = O.build(CSL, base, [{ e: unit.eid, op: 'move', dir: 1 }], items, retrieveLocale);
  ok(/2020, Example University Press/.test(row(e3, 's-en-book-1', 'bib').replace(/<[^>]+>/g, '')), `並べ替えると「年, 出版者」の順になる：${row(e3, 's-en-book-1', 'bib').replace(/<[^>]+>/g, '')}`);
  // 編集を外せば元どおり
  const e4 = O.build(CSL, base, [], items, retrieveLocale);
  ok(changed(before, e4).length === 0, '編集の一覧を空にすれば、元の出力に戻る');
  // 4) 書き出し
  const out = O.finalize(e1.xml, { title: 'chicago-notes-bibliography_edited', id: 'http://www.zotero.org/styles/csl-editor-test', updated: '2026-11-12T00:00:00+00:00' });
  ok(O.titleOf(out) === 'chicago-notes-bibliography_edited' && out.includes('<id>http://www.zotero.org/styles/csl-editor-test</id>'), '書き出しで名前と ID が替わる');
  ok(out.includes('<link href="http://www.zotero.org/styles/chicago-notes-bibliography" rel="template"/>'), '元のスタイルを template として残す');
  ok(/creativecommons\.org\/licenses\/by-sa\/3\.0/.test(out) && /<author>/.test(out), '元の作者とライセンスの表示を保つ');
  const rr = O.renderRows(CSL, out, items, retrieveLocale, 'en-US');
  ok(rr.rows['s-en-book-1'][0][2] === row(e1, 's-en-book-1', 'bib'), '書き出したファイルでも、プレビューと同じに組める');
}
console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
