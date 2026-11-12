// 似ている型4つを見本の書誌で組み、参考文献と注（引用頁42）を出す。
// 実行: node tests/render_starters.js [型の名前]
'use strict';
const fs = require('fs'), path = require('path');
const R = (...p) => path.join(__dirname, '..', ...p);
const CSL = require(R('vendor', 'citeproc_commonjs.js'));
const Gen = require(R('src', 'csl_generate.js'));
const { STARTERS, makeStarter } = require(R('src', 'starters.js'));
const LOC = Object.fromEntries(fs.readdirSync(R('vendor')).filter((f) => /^locales-.*\.xml$/.test(f))
  .map((f) => [f.slice(8, -4), fs.readFileSync(R('vendor', f), 'utf8')]));
// アプリと同じ探し方：完全一致 → 言語の先頭が同じもの → 英語の中身を、その言語として返す。
function retrieveLocale(l) {
  if (LOC[l]) return LOC[l];
  const p = String(l).split('-')[0];
  const k = Object.keys(LOC).find((x) => x.split('-')[0] === p);
  if (k) return LOC[k];
  return LOC['en-US'].replace('xml:lang="en-US"', `xml:lang="${l}"`);
}
const items = JSON.parse(fs.readFileSync(R('src', 'samples.json'), 'utf8'));

function render(model, fmt = 'text', opts = {}, its = items) {
  const items = its;
  const g = Gen.generate(model, { updated: '2026-11-11T00:00:00+00:00', ...opts });
  const xml = typeof g === 'string' ? g : g.xml;
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const sys = { retrieveLocale, retrieveItem: (id) => byId[id] };
  const e = new CSL.Engine(sys, xml, 'ja-JP', true);
  e.setOutputFormat(fmt);
  e.updateItems(items.map((i) => i.id));
  const [meta, bib] = e.makeBibliography();
  const cites = items.map((i) => [i.id, e.makeCitationCluster([{ id: i.id, locator: '42', label: 'page' }])]);
  return { xml, bib: meta.entry_ids.map((ids, k) => [ids[0], bib[k].trim()]), cites };
}
module.exports = { render, items, retrieveLocale };
if (require.main === module) {
  const keys = process.argv[2] ? [process.argv[2]] : Object.keys(STARTERS);
  for (const k of keys) {
    const r = render(makeStarter(k));
    console.log(`\n######## ${k}（${STARTERS[k].label}）`);
    console.log('-- 参考文献');
    for (const [id, s] of r.bib) console.log(`  ${id.padEnd(17)} ${s}`);
    console.log('-- 注・本文中の引用（42頁）');
    for (const [id, s] of r.cites) console.log(`  ${id.padEnd(17)} ${s}`);
  }
}
