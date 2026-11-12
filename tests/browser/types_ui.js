// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'); const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1400, height: 1100 });
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(400);
  const cards = () => p.evaluate(() => [...document.querySelectorAll('#previewList .item')].filter(n => !n.hidden).map(n => n.dataset.tab + '/' + n.dataset.authors).join(' '));
  const tabs = () => p.evaluate(() => [...document.querySelectorAll('.type-tabs > button')].map(b => b.textContent).join(' | '));
  console.log('和文の表示:', await cards());
  console.log('件数表示:', await p.evaluate(() => document.getElementById('previewFilter').textContent));
  // 人数で絞る
  await p.evaluate(() => { const s = document.querySelectorAll('#previewFilter select')[1]; s.value = '2〜3名共著'; s.dispatchEvent(new Event('change')); }); await wait(200);
  console.log('2名共著:', await cards());
  await p.evaluate(() => { const s = document.querySelectorAll('#previewFilter select')[1]; s.value = ''; s.dispatchEvent(new Event('change')); }); await wait(200);
  // 種類の一覧を開く
  await p.evaluate(() => { document.querySelector('.type-pick').open = true; }); await wait(200);
  console.log('一覧の数:', await p.evaluate(() => document.querySelectorAll('.type-check').length), '/ チェック済み:', await p.evaluate(() => [...document.querySelectorAll('.type-check')].filter(l => l.querySelector('input').checked).map(l => l.textContent.trim()).join(' ; ')));
  const check = (name) => p.evaluate((name) => { const l = [...document.querySelectorAll('.type-check')].find(l => l.textContent.trim().startsWith(name)); l.querySelector('input').click(); }, name);
  // 学位論文と新聞記事を足す
  await check('学位論文'); await wait(300); await check('新聞記事'); await wait(300);
  console.log('タブ:', await tabs());
  console.log('新聞記事の並び（雑誌論文から写した）:', await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map(c => c.textContent).join(' ')));
  // 学位論文の文献を足してプレビューの並び順を確かめる
  await p.click('#btnAddItem'); await wait(200); await p.click('#btnNewItem'); await wait(300);
  await p.evaluate(() => { const s = document.querySelector('#itemForm select'); console.log(s.options.length); s.value = 'thesis'; s.dispatchEvent(new Event('change')); });
  console.log('入力画面の種類の数:', await p.evaluate(() => document.querySelector('#itemForm select').options.length));
  await p.evaluate(() => { const set = (lab, v) => { const l = [...document.querySelectorAll('#itemForm label')].find(l => !l.hidden && l.textContent === lab); l.nextElementSibling.value = v; }; set('言語', 'ja'); set('著者', '山田, 花子'); set('題名', '近世越後の村落'); set('大学名', '越後大学'); set('発行年月日', '2020'); });
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '入れる').click()); await wait(500);
  console.log('並び:', await cards());
  console.log('学位論文:', await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].find(n => n.dataset.tab === 'x-thesis').querySelector('.v').textContent));
  // ウェブページを外す → タブが消え、ウェブページは「その他」へ
  await check('ウェブページ'); await wait(300);
  console.log('ウェブページを外した後のタブ:', await tabs(), '/ web の文献の行き先:', await p.evaluate(() => [...new Set([...document.querySelectorAll('#previewList .item')].filter(n => n.querySelector('.badge').textContent.includes('ウェブ')).map(n => n.dataset.tab))].join(',')));
  await check('ウェブページ'); await wait(300);
  await check('新聞記事'); await wait(300); await check('新聞記事'); await wait(300);
  console.log('入れ直した後のタブ:', await tabs());
  await p.screenshot({ path: sp + '/v8_types.png' });
  const xml = await p.evaluate(() => CSLGen.generate(CSLApp.state.model));
  console.log('choose の条件:', (xml.match(/<macro name="bib-ja"><choose>(.*?)<\/macro>/)[1].match(/type="[^"]*"/g) || []).join(' '));
  await p.reload(); await wait(700);
  console.log('再読み込み後のタブ:', await tabs());
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
