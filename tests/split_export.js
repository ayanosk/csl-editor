// 言語別の書き出し（generate の opts.only）の検査。
// 1) 構造：引用・参考文献のレイアウトが1つずつで、locale 属性（CSL-M の拡張）を使っていない
// 2) 中身：その書式で組まれる文献は、多言語版と同じ出力になる（参考文献と、引用頁42の引用）
// 3) pandoc があれば、pandoc（CSL-M 非対応）で組める
// 実行: node tests/split_export.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { render, items, retrieveLocale } = require('./render_starters.js');
const CSL = require('../vendor/citeproc_commonjs.js');
const G = require('../src/csl_generate.js');
const { STARTERS, makeStarter, addLanguage } = require('../src/starters.js');
const frItem = { id: 's-fr-book-1', type: 'book', language: 'fr', title: 'Les registres du village', author: [{ family: 'Dubois', given: 'Léa' }], publisher: 'Éditions Exemple', 'publisher-place': 'Paris', issued: { 'date-parts': [[2018]] } };
const ITEMS = items.concat([frItem]);
const hasPandoc = (() => { try { cp.execSync('pandoc --version', { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csl-split-'));
fs.writeFileSync(path.join(tmp, 'items.json'), JSON.stringify(ITEMS));
fs.writeFileSync(path.join(tmp, 'doc.md'), '---\nnocite: "@*"\n---\n\nTest[@s-ja-book-1, 42].\n');
function renderOwnLocale(xml) {
  const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const lang = xml.match(/default-locale="([^"]+)"/)[1];
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => byId[id] }, xml, lang, false);
  e.setOutputFormat('text');
  e.updateItems(ITEMS.map((i) => i.id));
  const [meta, bib] = e.makeBibliography();
  return { bib: meta.entry_ids.map((ids, k) => [ids[0], bib[k].trim()]), cites: ITEMS.map((i) => [i.id, e.makeCitationCluster([{ id: i.id, locator: '42', label: 'page' }])]) };
}
let bad = 0;
const fail = (msg) => { bad++; console.log('  NG ' + msg); };
for (const k of Object.keys(STARTERS)) {
  const m = makeStarter(k);
  m.info.id = 'http://www.zotero.org/styles/csl-editor-test-' + k;
  m.info.title = 'test_' + k;
  addLanguage(m, 'fr');
  const multi = render(m, 'text', {}, ITEMS);
  const mBib = Object.fromEntries(multi.bib), mCite = Object.fromEntries(multi.cites);
  const lines = [];
  for (const only of ['ja', 'en', 'fr']) {
    // 言語別の版は、Zotero・pandoc と同じくスタイルの default-locale に従って組む（forceLang しない）
    const xml = G.generate(m, { only, updated: '2026-11-11T00:00:00+00:00' });
    const one = renderOwnLocale(xml);
    const nLayout = (xml.match(/<layout[\s>]/g) || []).length;
    if (nLayout !== 2) fail(`${k}/${only}: レイアウトが ${nLayout} 個`);
    if (/ locale="/.test(xml)) fail(`${k}/${only}: locale 属性が残っている`);
    if (!xml.includes(`<id>${m.info.id}-${only}</id>`) || !xml.includes(`<title>test_${k}_${only}</title>`)) fail(`${k}/${only}: ID か名前に言語が付いていない`);
    const back = G.extractModel(xml);
    if (!back || JSON.stringify(back.systems) !== JSON.stringify(m.systems)) fail(`${k}/${only}: 埋め込んだモデルが元と違う`);
    const oBib = Object.fromEntries(one.bib), oCite = Object.fromEntries(one.cites);
    const mine = ITEMS.filter((it) => G.systemOfItem(it, m.euroLangs, G.extraLangs(m)).sys === only);
    let same = 0;
    for (const it of mine) {
      // IEEE の番号は並び順で変わるので外して比べる
      const nb = (s) => (k === 'ieee' ? String(s).replace(/^\[\d+\]\s*/, '').replace(/\[\d+(,|\])/, '[#$1') : s);
      if (nb(oBib[it.id]) === nb(mBib[it.id]) && nb(oCite[it.id]) === nb(mCite[it.id])) same++;
      else fail(`${k}/${only} ${it.id}\n     多言語版: ${mBib[it.id]} ‖ ${mCite[it.id]}\n     言語別　: ${oBib[it.id]} ‖ ${oCite[it.id]}`);
    }
    let pd = '';
    if (hasPandoc) {
      const f = path.join(tmp, `${k}_${only}.csl`);
      fs.writeFileSync(f, xml);
      try { cp.execSync(`pandoc "${path.join(tmp, 'doc.md')}" --citeproc --bibliography "${path.join(tmp, 'items.json')}" --csl "${f}" -t plain`, { stdio: 'pipe' }); pd = ' / pandoc OK'; }
      catch (e) { fail(`${k}/${only}: pandoc で組めない ${String(e.stderr).trim()}`); pd = ' / pandoc NG'; }
    }
    lines.push(`${only}: ${same}/${mine.length}件が多言語版と同じ${pd}`);
  }
  console.log(`${k}　` + lines.join('　'));
}
if (!hasPandoc) console.log('（pandoc が無いので、pandoc での確認は飛ばした）');
console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
