// 取り込みの確認：いまの文献に足す／言語を選んで取り込む／置き換える。
const { puppeteer, CHROME, toStarter } = require('./_puppeteer.js');
const fs = require('fs'), path = require('path');
// 見本の件数（src/samples.json。見本を足しても試験を直さずに済むように）
const BASE = require('../../src/samples.json').length;
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const file = path.join(sp, 'mixed.json');
fs.writeFileSync(file, JSON.stringify([
  { id: 'a', type: 'book', language: 'ja', title: '和の本', author: [{ family: '川上', given: '一郎' }], issued: { 'date-parts': [[2020]] } },
  { id: 'b', type: 'book', language: 'fr', title: 'Livre', author: [{ family: 'Martin', given: 'Paul' }], issued: { 'date-parts': [[2019]] } },
  { id: 'c', type: 'book', language: 'fr-FR', title: 'Autre livre', author: [{ family: 'Roux', given: 'Anne' }], issued: { 'date-parts': [[2018]] } },
  { id: 'd', type: 'book', language: 'zh', title: '中文书', author: [{ family: '王', given: '明' }], issued: { 'date-parts': [[2017]] } },
]));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { errs.push('dialog: ' + d.message()); await d.accept(); });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await toStarter(p);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(300);
  const check = (label, ok) => { console.log((ok ? 'OK ' : 'NG ') + label); if (!ok) errs.push(label); };
  const pick = async () => {
    await p.click('#btnAddItem'); await wait(200);
    const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnPickItems')]);
    await fc.accept([file]); await wait(500);
  };
  await pick();
  const labels = await p.evaluate(() => [...document.querySelectorAll('.import-lang')].map((x) => x.textContent.trim()));
  console.log('言語:', labels.join(' / '));
  check('言語を名前と略号で示す（フランス語（fr）2件）', labels.some((t) => t.includes('フランス語（fr）') && t.includes('2件')));
  // 足す・中国語を外す
  await p.evaluate(() => {
    document.querySelector('input[name="importMode"][value="add"]').click();
    [...document.querySelectorAll('.import-lang input')].find((x) => x.value === 'zh').click();
  }); await wait(100);
  check('件数の表示が変わる', (await p.evaluate(() => document.querySelector('#importForm .hint:last-of-type').textContent)).includes('3件') || (await p.evaluate(() => document.getElementById('importForm').textContent)).includes('取り込む文献：3件'));
  await p.click('#btnDoImport'); await wait(400);
  check(`見本${BASE}件に3件が足される`, (await p.evaluate(() => CSLApp.state.items.length)) === BASE + 3);
  check('中国語は入らない', !(await p.evaluate(() => CSLApp.state.items.some((i) => i.id === 'd'))));
  // 置き換える
  await pick();
  await p.click('#btnDoImport'); await wait(400);
  check('置き換えると4件だけになる', (await p.evaluate(() => CSLApp.state.items.length)) === 4);
  console.log('エラー:', errs.length ? errs.join(' / ') : 'なし');
  await b.close();
})();
