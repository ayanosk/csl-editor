// Zotero からの取り込み：一覧の画面から。形式を選び間違えたら形式の名前を挙げて断り、CSL JSON なら取り込む。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'), path = require('path');
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const files = {
  'x.bib': '@book{yamada2024,\n  title = {Test},\n  author = {Yamada, Hanako},\n  year = {2024}\n}\n',
  'x.ris': 'TY  - BOOK\nTI  - Test\nAU  - Yamada, Hanako\nER  - \n',
  'x.rdf': '<?xml version="1.0"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>\n',
  'x_bbt.json': JSON.stringify({ config: {}, items: [{ itemType: 'book', title: 'Test' }] }),
  'x_csl.json': JSON.stringify([{ id: 'a', type: 'book', language: 'ja', title: '取り込みの確認', author: [{ family: '山田', given: '花子' }], issued: { 'date-parts': [[2024]] } }]),
};
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [], alerts = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { alerts.push(d.message()); await d.accept(); });
  for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(sp, n), t);
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click()); await wait(300);
  console.log('上の帯:', await p.evaluate(() => [...document.querySelectorAll('.actions button')].map((x) => x.textContent).join(' / ')));
  const pick = async (n) => {
    await p.click('#btnAddItem'); await wait(200);
    const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnPickItems')]);
    await fc.accept([path.join(sp, n)]); await wait(500);
  };
  for (const [n, want] of [['x.bib', 'BibTeX'], ['x.ris', 'RIS'], ['x.rdf', 'Zotero RDF'], ['x_bbt.json', 'Zotero 独自']]) {
    const k = alerts.length; await pick(n);
    const msg = alerts.slice(k).join(' ');
    const ok = msg.includes(want) && msg.includes('選択された項目をエクスポート');
    console.log(`${ok ? 'OK' : 'NG'} ${n}: ${msg.slice(0, 60)}…`);
    if (!ok) errs.push(n + ' の案内が違う');
  }
  const src0 = await p.$eval('#dataSource', (x) => x.textContent);
  await pick('x_csl.json');
  const after = await p.evaluate(() => ({ src: document.getElementById('dataSource').textContent, card: document.querySelector('#previewList .item .v').textContent }));
  console.log('CSL JSON:', after.src, '/', after.card);
  if (!after.card.includes('取り込みの確認')) errs.push('CSL JSON が取り込めない');
  console.log('取り込み前:', src0);
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
