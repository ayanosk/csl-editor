// 言語を足すときの写す元（いまの書式・既定の書式）と、引用箇所の頁の語の一括設定。
// 実行: node tests/lang_copy.js
'use strict';
const CSL = require('../vendor/citeproc_commonjs.js');
const G = require('../src/csl_generate.js');
const ST = require('../src/starters.js');
const { retrieveLocale, items } = require('./render_starters.js');
let bad = 0;
const ok = (cond, msg) => { if (!cond) bad++; console.log(`${cond ? 'OK' : 'NG'} ${msg}`); };

// 1. ラテン語に、フランス語の既定の書式を写す
{
  const m = ST.makeStarter('chicago');
  ok(ST.addLanguage(m, 'la', null, 'preset:fr') === null, 'la を「フランス語の既定の書式」から足せる');
  const m2 = ST.makeStarter('chicago'); ST.addLanguage(m2, null, 'fr');
  ok(JSON.stringify(m.systems.la.cite) === JSON.stringify(m2.systems.fr.cite), 'la の注の並びが、既定のフランス語と同じ');
  ok(m.systems.la.label === 'ラテン語', '書式の名前はラテン語');
  ok(m.terms.la.editor === m2.terms.fr.editor && m.terms.la.pages === m2.terms.fr.pages, '用語もフランス語の既定から写す');
  ok(m.extraLangs.join() === 'la', 'フランス語の書式は足されない');
}
// 2. いまのフランス語の書式（直したあと）を写す
{
  const m = ST.makeStarter('chicago'); ST.addLanguage(m, null, 'fr');
  m.systems.fr.layout.cite.suffix = '!';
  m.terms.fr.pages = 'pp.';
  ok(ST.addLanguage(m, 'la', null, 'fr') === null, 'la を「いまのフランス語の書式」から足せる');
  ok(m.systems.la.layout.cite.suffix === '!' && m.terms.la.pages === 'pp.', '直した文末と用語も写る');
  m.systems.la.layout.cite.suffix = '?';
  ok(m.systems.fr.layout.cite.suffix === '!', '写したあとは別々（写し元は変わらない）');
}
// 3. 和文の書式を写す・写す元が無い・既定（欧文）
{
  const m = ST.makeStarter('chicago');
  ok(ST.addLanguage(m, 'zh', null, 'ja') === null && m.terms.zh.page === '頁', '和文の書式から写すと、用語も和文');
  ok(typeof ST.addLanguage(m, 'ko', null, 'xx') === 'string', '無い書式を写す元にするとエラー');
  ok(ST.addLanguage(m, 'fr') === null && m.terms.fr.pages === 'p.', '写す元を省けば、従来どおり欧文＋その言語の用語');
}
// 4. 組んでみる：la の文献が、フランス語の形で出る
{
  const m = ST.makeStarter('chicago'); m.info.id = 'x';
  ST.addLanguage(m, 'la', null, 'preset:fr');
  const it = { ...items.find((i) => i.id === 's-en-chapter-1'), id: 'la1', language: 'la' };
  const xml = G.generate(m);
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: () => it }, xml, 'ja-JP', true);
  e.setOutputFormat('text'); e.updateItems(['la1']);
  const out = e.makeCitationCluster([{ id: 'la1', locator: '42-45', label: 'page' }]);
  console.log('   ', out);
  ok(/«\s.+\s»/.test(out) && /dans\s/.test(out) && /p\.\s42-45/.test(out), 'ラテン語の文献がフランス語の形（« »・dans・p. 42-45）で組まれる');
}
// 5. 引用箇所の頁の語：Chicago の欧文の注で、付けない → 前に付ける（p. 42・pp. 42–45）
{
  const m = ST.makeStarter('chicago'); m.info.id = 'x';
  ok(ST.locatorLabelOf(m.systems.en) === 'none', 'Chicago の欧文は初め「付けない」');
  const n = ST.setLocatorLabel(m.systems.en, 'before');
  ok(n > 0 && ST.locatorLabelOf(m.systems.en) === 'before', `前に付けるに揃う（${n}個）`);
  const en = items.find((i) => i.id === 's-en-chapter-1');
  const xml = G.generate(m);
  const e = new CSL.Engine({ retrieveLocale, retrieveItem: () => en }, xml, 'ja-JP', true);
  e.setOutputFormat('text'); e.updateItems([en.id]);
  const one = e.makeCitationCluster([{ id: en.id, locator: '42', label: 'page' }]);
  const many = e.makeCitationCluster([{ id: en.id, locator: '42-45', label: 'page' }]);
  const chap = e.makeCitationCluster([{ id: en.id, locator: '2', label: 'chapter' }]);
  console.log('   ', one, '\n   ', many, '\n   ', chap);
  ok(/p\. 42\.?$/.test(one) && !/pp\./.test(one), '1頁は p. 42');
  ok(/pp\. 42–45/.test(many), '範囲は pp. 42–45');
  ok(/chap\. 2/.test(chap), '章は chap. 2');
  m.systems.en.cite.book[0].opt.label = 'after';
  m.systems.en.cite.book.push(ST.F('locator', { opt: { label: 'after' } }));
  ok(ST.locatorLabelOf(m.systems.en) === 'mixed', '部品ごとに違えば mixed');
  ST.setLocatorLabel(m.systems.en, 'none');
  ok(ST.locatorLabelOf(m.systems.en) === 'none', '付けないに戻せる');
}
// 6. 足した言語は「欧文の書式で組む言語」から外れ、書式を消すと戻る
{
  const m = ST.makeStarter('chicago');
  ok(m.euroLangs.includes('la') && m.euroLangs.includes('fr'), '初めは la・fr が欧文の書式で組む言語に入っている');
  ST.addLanguage(m, 'la', null, 'preset:fr'); ST.addLanguage(m, null, 'fr');
  ok(!m.euroLangs.includes('la') && !m.euroLangs.includes('fr'), '足すと外れる（写す元つき・既定の書式とも）');
  ST.removeLanguage(m, 'la');
  ok(m.euroLangs.includes('la') && !m.euroLangs.includes('fr'), '消すと la だけ戻る');
  const m2 = ST.makeStarter('chicago'); ST.addLanguage(m2, 'sv');
  ST.removeLanguage(m2, 'sv');
  ok(!m2.euroLangs.includes('sv'), 'もともと入っていない言語は、消しても足さない');
}
console.log(bad ? `NG ${bad}件` : 'OK');
process.exit(bad ? 1 : 0);
