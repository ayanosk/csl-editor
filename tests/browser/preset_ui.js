// 言語ごとの既定の書式（一覧から選んで足す）と、書誌の一覧（言語の見本・チェックで隠す・一覧に戻る）。
const { puppeteer, CHROME, toStarter } = require('./_puppeteer.js');
// 見本の件数（src/samples.json。見本を足しても試験を直さずに済むように）
const BASE = require('../../src/samples.json').length;
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const count = () => p.evaluate(() => CSLApp.state.langSamples.length);
  // 1) 中国語の見本を足す
  await p.click('#btnAddItem'); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('#langSampleBtns button')].find((x) => x.textContent.includes('中国語')).click()); await wait(400);
  check('中国語の見本が4件加わる', (await p.evaluate(() => document.querySelectorAll('#itemList .item-row').length)) === BASE + 4);
  check('ボタンが押された状態になる', await p.evaluate(() => [...document.querySelectorAll('#langSampleBtns button')].find((x) => x.textContent.includes('中国語')).getAttribute('aria-pressed') === 'true'));
  // 2) チェックを外すとプレビューから消える
  const before = await p.evaluate(() => document.querySelectorAll('#previewList .item').length);
  await p.evaluate(() => document.querySelector('#itemList .item-row input').click()); await wait(400);
  const after = await p.evaluate(() => document.querySelectorAll('#previewList .item').length);
  check(`チェックを外すとプレビューから隠れる（${before}→${after}）`, after === before - 1);
  await p.evaluate(() => document.querySelector('#itemList .item-row input').click()); await wait(300);
  // 3) 1件開いて、一覧に戻る
  await p.evaluate(() => document.querySelector('#itemList .item-pick').click()); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find((x) => x.textContent.includes('一覧に戻る')).click()); await wait(300);
  check('編集画面から一覧に戻れる', await p.evaluate(() => document.getElementById('dlgItemList').open && !document.getElementById('dlgItem').open));
  await p.evaluate(() => document.getElementById('dlgItemList').close());
  // 4) 中国語（大陸式）を一覧から選んで足す
  await p.click('.add-lang'); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('.preset-pick')].find((x) => x.textContent.includes('中国語（大陸式）')).click()); await wait(500);
  check('中国語の書式ができる', await p.evaluate(() => CSLApp.state.model.extraLangs.includes('zh')));
  const zh = await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].map((x) => x.innerText).find((t) => t.includes('明清江南市镇史料研究')) || '');
  check('中国語の文献が《》と全角の区切りで組まれる', zh.includes('王晓明：《明清江南市镇史料研究》，上海：江南出版社，2019年'));
  // 5) 再読み込みしても見本と書式が残る
  await p.reload(); await wait(700);
  check('再読み込み後も中国語の見本が残る', (await count()) === 1);
  // 6) 外す
  await p.click('#btnAddItem'); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('#langSampleBtns button')].find((x) => x.textContent.includes('中国語')).click()); await wait(400);
  check('もう一度押すと見本が外れる', (await p.evaluate(() => document.querySelectorAll('#itemList .item-row').length)) === BASE);
  console.log('エラー:', errs.length ? errs.join(' / ') : 'なし');
  await b.close();
})();
