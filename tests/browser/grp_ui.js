// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(600);
  const tab = (t) => p.evaluate((t) => [...document.querySelectorAll('#panelTabs button')].find(b => b.textContent.startsWith(t)).click(), t);
  const chipsTxt = () => p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map(c => c.textContent).join(' '));
  const card = (t) => p.evaluate((t) => { const n = [...document.querySelectorAll('#previewList .item')].find(n => n.textContent.includes(t)); return n ? [...n.querySelectorAll('.out .v')].map(v => v.textContent).join(' ‖ ') : '(なし)'; }, t);
  // MLA
  await p.evaluate(() => [...document.querySelectorAll('#starterList button')][2].click()); await wait(400);
  await tab('欧文'); await wait(300);
  console.log('MLA 欧文・図書のチップ:', await chipsTxt());
  await p.click('#btnAddItem'); await wait(200); await p.click('#btnNewItem'); await wait(300);
  await p.evaluate(() => { const set = (lab, v) => { const l = [...document.querySelectorAll('#itemForm label')].find(l => !l.hidden && l.textContent === lab); l.nextElementSibling.value = v; }; set('言語', 'de'); set('著者', 'Müller, Hans'); set('書名', 'Geschichte'); set('出版者', 'Beispiel Verlag'); set('発行年月日', '2018'); });
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '入れる').click()); await wait(500);
  console.log('訳者のいない本:', await card('Geschichte'));
  // まとまりを外す → 崩れが戻ることを確認 → 囲み直す
  await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].find(c => c.textContent.includes('〔ここから')).click()); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('#detail button')].find(b => b.textContent.startsWith('まとまりを外す')).click()); await wait(400);
  console.log('外した後のチップ:', await chipsTxt());
  console.log('外した後:', await card('Geschichte'));
  // 訳者のチップを選んで囲み、〕を出版者・年の後ろへ動かす代わりに、元に戻すため型を選び直す
  await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].find(c => c.textContent.startsWith('訳者')).click()); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('.palette button')].find(b => b.textContent === '〔 〕で囲む').click()); await wait(300);
  console.log('訳者を囲んだチップ:', await chipsTxt());
  // Chicago の前掲書・op. cit.
  await p.click('#btnStarter'); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('#starterList button')][0].click()); await wait(400);
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.textContent === '注（2回目以降）').click()); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('#panelBody .small-btn')].find(b => b.textContent.includes('前掲書')).click()); await wait(500);
  console.log('和文・前掲書:', await card('デジタル史料学入門'));
  console.log('和文・論文:', await card('近世村方文書'));
  await tab('欧文'); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.textContent === '注（2回目以降）').click()); await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('#panelBody .small-btn')].find(b => b.textContent.includes('op. cit.')).click()); await wait(500);
  console.log('欧文・op. cit.:', await card('Numbers in the Archive'));
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.textContent === '注（初出）').click()); await wait(300);
  console.log('Chicago 注（初出）のチップ:', await chipsTxt());
  await p.screenshot({ path: sp + '/v11_grp.png' });
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
