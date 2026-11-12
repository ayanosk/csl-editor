// 仮説1の補足：layout の locale に複数言語を並べられるか／citation でも振り分くか。
'use strict';
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..', 'vendor');
const CSL = require(path.join(V, 'citeproc_commonjs.js'));
const LOC = { 'ja-JP': fs.readFileSync(path.join(V, 'locales-ja-JP.xml'), 'utf8'), 'en-US': fs.readFileSync(path.join(V, 'locales-en-US.xml'), 'utf8') };
const L = (tag) => `<text value="[${tag}] "/><text variable="title"/><group prefix=" "><label variable="locator" form="short"/><text variable="locator"/></group>`;
const st = (def) => `<?xml version="1.0" encoding="utf-8"?><style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0" default-locale="${def}">
<info><title>t</title><id>x</id><updated>2026-11-11T00:00:00+00:00</updated></info>
<locale xml:lang="ja"><terms><term name="page" form="short">頁</term></terms></locale>
<citation><layout locale="en fr de" delimiter="; ">${L('西')}</layout><layout delimiter="；">${L('和')}</layout></citation>
<bibliography><layout locale="en fr de">${L('西')}</layout><layout>${L('和')}</layout></bibliography></style>`;
const langs = ['ja', '', 'en', 'en-GB', 'fr', 'fr-FR', 'de', 'zh', 'it'];
const items = langs.map((l, i) => ({ id: 'i' + i, type: 'book', title: `T(${l || '空'})`, ...(l ? { language: l } : {}) }));
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const sys = { retrieveLocale: (l) => LOC[l] || LOC[{ ja: 'ja-JP', en: 'en-US' }[l]] || false, retrieveItem: (id) => byId[id] };
const e = new CSL.Engine(sys, st('ja-JP'), 'ja-JP', true);
e.setOutputFormat('text'); e.updateItems(items.map((i) => i.id));
console.log('== bibliography');
console.log(e.makeBibliography()[1].map((s) => '   ' + s.trim()).join('\n'));
console.log('== citation（1件ずつ, locator=42 page）');
for (const it of items) console.log('   ' + e.makeCitationCluster([{ id: it.id, locator: '42', label: 'page' }]));
