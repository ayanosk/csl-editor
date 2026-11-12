// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(500);
  console.log('切り替え:', await p.evaluate(() => [...document.querySelectorAll('.seg button')].map(b => b.textContent).join(' | ')));
  const card = (t) => p.evaluate((t) => { const n = [...document.querySelectorAll('#previewList .item')].find(n => n.textContent.includes(t)); return [...n.querySelectorAll('.out .k')].map(k => k.textContent + '：' + k.nextElementSibling.textContent).join('\n  '); }, t);
  console.log(await card('デジタル史料学入門'));
  // 2回目以降の並びで「前掲書」を足してみる：直前と同じ本タブで同上を「前掲」に変える代わりに、2回目以降タブを開いてチップを確認
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.textContent === '注（2回目以降）').click()); await wait(300);
  console.log('2回目以降のチップ:', await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map(c => c.textContent).join(' ')));
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.textContent === '注（直前と同じ本）').click()); await wait(300);
  console.log('直前と同じ本のチップ:', await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map(c => c.textContent).join(' ')));
  await p.screenshot({ path: sp + '/v10_sub.png' });
  // 欧文
  await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].find(b => b.textContent === '欧文の書式').click()); await wait(300);
  console.log(await card('Numbers in the Archive'));
  // 書き分けを切る
  await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].find(b => b.textContent === '全体の設定').click()); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent.includes('書き分ける（間を')).querySelector('input').click()); await wait(400);
  console.log('切った後:', await card('Numbers in the Archive'));
  await p.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent.includes('書き分ける（間を')).querySelector('input').click()); await wait(400);
  // APA には出ない
  await p.evaluate(() => { CSLApp.state; }); 
  await p.click('#btnStarter'); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('#starterList button')][1].click()); await wait(400);
  console.log('APA の切り替え:', await p.evaluate(() => [...document.querySelectorAll('.seg button')].map(b => b.textContent).join(' | ')));
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
