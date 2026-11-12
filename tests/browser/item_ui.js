// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [], alerts = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', async (d) => { alerts.push(d.message()); await d.accept(); });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(300);
  console.log('帯:', await p.evaluate(() => document.querySelector('.brand').textContent.trim()), '/ 見本に戻す表示:', await p.evaluate(() => !document.getElementById('btnResetItems').hidden));
  // 足す：雑誌論文（仏語）
  await p.click('#btnAddItem'); await wait(200); await p.click('#btnNewItem'); await wait(300);
  const setv = (label, v) => p.evaluate((label, v) => {
    const labs = [...document.querySelectorAll('#itemForm label')].filter((l) => !l.hidden && l.textContent === label);
    const c = labs[0].nextElementSibling; c.value = v; c.dispatchEvent(new Event('input'));
  }, label, v);
  await p.evaluate(() => { const s = document.querySelector('#itemForm select'); s.value = 'article-journal'; s.dispatchEvent(new Event('change')); }); await wait(100);
  console.log('雑誌論文の欄:', await p.evaluate(() => [...document.querySelectorAll('#itemForm .item-grid label')].filter(l => !l.hidden).map(l => l.textContent).join(' ')));
  await setv('言語', 'fr'); await setv('著者', 'Blanc, Marie\nRoux, Anne'); await setv('題名', 'Les académies et l’État');
  await setv('掲載誌名', 'Revue d’histoire'); await setv('巻', '7'); await setv('号', '2'); await setv('掲載頁', '10-30'); await setv('発行年月日', '2021年3月');
  // Enter で閉じないこと
  await p.focus('#itemForm input[type=text]'); await p.keyboard.press('Enter'); await wait(200);
  console.log('Enter 後もダイアログが開いている:', await p.evaluate(() => document.getElementById('dlgItem').open));
  await p.screenshot({ path: sp + '/v5_item.png' });
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '入れる').click()); await wait(500);
  const cards = () => p.evaluate(() => [...document.querySelectorAll('#previewList .item')].map((n) => n.querySelector('.v').textContent));
  let c = await cards(); console.log('件数:', await p.evaluate(() => document.getElementById('dataSource').textContent), '/ 足した文献:', c.find(t => t.includes('Blanc')));
  // 和書を足す（空白区切りの和名）
  await p.click('#btnAddItem'); await wait(200); await p.click('#btnNewItem'); await wait(300);
  await setv('著者', '佐渡 次郎'); await setv('書名', '越後の村'); await setv('出版者', '越後書房'); await setv('発行年月日', '2019');
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '入れる').click()); await wait(500);
  c = await cards(); console.log('和書:', c.find(t => t.includes('越後の村')));
  // 直す：見本の1件目の題名
  await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].find(n => n.textContent.includes('デジタル史料学入門')).querySelector('button').click()); await wait(300);
  await setv('書名', 'デジタル史料学入門（改訂版）');
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '直す').click()); await wait(500);
  c = await cards(); console.log('直した:', c.find(t => t.includes('改訂版')));
  // 一覧から選んで直す：ボタンの名前、一覧の件数、選んだ文献が開くか
  console.log('ボタン:', await p.$eval('#btnAddItem', (n) => n.textContent));
  await p.click('#btnAddItem'); await wait(300);
  console.log('一覧の件数:', await p.evaluate(() => document.querySelectorAll('#itemList .item-pick').length));
  await p.evaluate(() => [...document.querySelectorAll('#itemList .item-pick')].find(b => b.textContent.includes('Archives as Data')).click()); await wait(300);
  console.log('開いた文献:', await p.evaluate(() => [document.querySelector('#itemForm h2').textContent, [...document.querySelectorAll('#itemForm input')].map(i => i.value).find(v => v === 'Archives as Data')]));
  console.log('* の付いた欄（雑誌論文）:', await p.evaluate(() => [...document.querySelectorAll('#itemForm label.req')].filter(l => !l.hidden).map(l => l.textContent).join(' ')));
  // 題名を空にすると保存を断る
  await setv('題名', '');
  const nAlert = alerts.length;
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '直す').click()); await wait(300);
  const refused = alerts.slice(nAlert);
  console.log('題名が空：', refused.length === 1 && refused[0].startsWith('言語と題名') ? '保存を断った' : 'NG', '/ ダイアログ:', await p.evaluate(() => document.getElementById('dlgItem').open));
  if (!(refused.length === 1 && await p.evaluate(() => document.getElementById('dlgItem').open))) errs.push('題名が空でも保存した');
  alerts.splice(nAlert);
  await p.evaluate(() => document.getElementById('dlgItem').close());
  // 隠す → 隠した文献から戻す
  const before = await p.evaluate(() => document.getElementById('dataSource').textContent);
  await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].find(n => n.textContent.includes('Archives as Data')).querySelectorAll('button')[1].click()); await wait(400);
  const hid = await p.evaluate(() => ({ src: document.getElementById('dataSource').textContent, card: [...document.querySelectorAll('#previewList .item')].some(n => n.textContent.includes('Archives as Data')), box: (document.querySelector('.hidden-items summary') || {}).textContent }));
  console.log('隠した後:', hid);
  if (hid.card || !hid.box) errs.push('隠せていない');
  await p.evaluate(() => { document.querySelector('.hidden-items').open = true; [...document.querySelectorAll('.hidden-items button')].find(b => b.textContent === '戻す').click(); }); await wait(400);
  const back = await p.evaluate(() => ({ src: document.getElementById('dataSource').textContent, card: [...document.querySelectorAll('#previewList .item')].some(n => n.textContent.includes('Archives as Data')) }));
  console.log('戻した後:', back);
  if (!back.card || back.src !== before) errs.push('戻せていない');
  // もう一度隠して、再読み込み後も隠れたままか
  await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].find(n => n.textContent.includes('Archives as Data')).querySelectorAll('button')[1].click()); await wait(400);
  // 再読み込み
  await p.reload(); await wait(700);
  console.log('再読み込み後:', await p.evaluate(() => document.getElementById('dataSource').textContent), '/ 見本に戻す表示:', await p.evaluate(() => !document.getElementById('btnResetItems').hidden));
  if (await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].some(n => n.textContent.includes('Archives as Data')))) errs.push('再読み込みで隠した文献が出た');
  await p.click('#btnResetItems'); await wait(400);
  console.log('見本に戻した後:', await p.evaluate(() => document.getElementById('dataSource').textContent));
  const xml = await p.evaluate(() => CSLGen.generate(CSLApp.state.model));
  console.log('id:', xml.match(/<id>(.*?)<\/id>/)[1], '/ summary:', xml.match(/<summary>(.*?)<\/summary>/)[1]);
  console.log('確認ダイアログ:', alerts.length, '/ エラー:', errs.length ? errs.join('\n') : 'なし');
  await b.close();
})();
