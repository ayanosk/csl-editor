// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'); const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [], alerts = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', async (d) => { alerts.push(d.message()); await d.accept(); });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(300);
  // 仏語・瑞語の文献を読み込む
  const data = [
    {id:1,type:'book',language:'fr',title:'Histoire des sciences',author:[{family:'Dupont',given:'Jean'},{family:'Martin',given:'Paul'}],publisher:'Éditions Exemple',issued:{'date-parts':[[2020]]}},
    {id:2,type:'book',language:'en',title:'Archives',author:[{family:'Smith',given:'John'}],publisher:'Press',issued:{'date-parts':[[2022]]}},
    {id:3,type:'webpage',language:'sv',title:'Arkiv',author:[{family:'Berg',given:'Lars'}],URL:'https://e.org',accessed:{'date-parts':[[2026,11,1]]}},
    {id:4,type:'book',language:'ja',title:'史料学',author:[{family:'山田',given:'花子'}],publisher:'越後書房',issued:{'date-parts':[[2024]]}}];
  fs.writeFileSync(sp + '/lang_items.json', JSON.stringify(data));
  await p.click('#btnAddItem'); await wait(200);
  const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnPickItems')]); await fc.accept([sp + '/lang_items.json']); await wait(500);
  const prev = () => p.evaluate(() => [...document.querySelectorAll('#previewList .item')].map((n) => n.querySelector('.badge.sys-ja,.badge.sys-en').textContent + ' | ' + n.querySelector('.v').textContent + (n.querySelector('.warn') ? ' ⚠ ' + n.querySelector('.warn').textContent : '')));
  console.log('足す前:\n ' + (await prev()).join('\n '));
  // タブの「＋ 言語ごとの書式」→ fr を足す
  await p.click('.add-lang'); await wait(200);
  await p.type('#newLang', 'fr'); await p.keyboard.press('Enter'); await wait(400);
  await p.type('#newLang', 'sv').catch(() => {});
  await p.evaluate(() => { const t=[...document.querySelectorAll('#panelTabs button')].find(b=>b.textContent==='全体の設定'); t.click(); }); await wait(200);
  await p.type('#newLang', 'sv'); await p.keyboard.press('Enter'); await wait(400);
  await p.evaluate(() => { const t=[...document.querySelectorAll('#panelTabs button')].find(b=>b.textContent==='全体の設定'); t.click(); }); await wait(200);
  await p.type('#newLang', 'en'); await p.keyboard.press('Enter'); await wait(300);
  console.log('タブ:', await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].map(b=>b.textContent).join(' / ')));
  // fr の用語「and」を変えてみる
  await p.evaluate(() => { const t=[...document.querySelectorAll('#panelTabs button')].find(b=>b.textContent==='用語表'); t.click(); }); await wait(200);
  console.log('用語表の列:', await p.evaluate(() => [...document.querySelectorAll('table.terms th')].map(t=>t.textContent).join(' / ')));
  await p.screenshot({ path: sp + '/v4_terms.png' });
  await p.evaluate(() => { const t=[...document.querySelectorAll('#panelTabs button')].find(b=>b.textContent.startsWith('フランス語')); t.click(); }); await wait(300);
  await p.screenshot({ path: sp + '/v4_fr.png' });
  console.log('足した後:\n ' + (await prev()).join('\n '));
  // 書き出し→読み戻し
  const xml = await p.evaluate(() => CSLGen.generate(CSLApp.state.model));
  fs.writeFileSync(sp + '/lang_style.csl', xml);
  await p.reload(); await wait(700);
  console.log('再読み込み後のタブ:', await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].map(b=>b.textContent).join(' / ')));
  // 消す
  await p.evaluate(() => { const t=[...document.querySelectorAll('#panelTabs button')].find(b=>b.textContent==='全体の設定'); t.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('.lang-list button')].find(b=>b.textContent==='消す').click()); await wait(400);
  console.log('fr を消した後のタブ:', await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].map(b=>b.textContent).join(' / ')));
  console.log('警告ダイアログ:', alerts.map(a=>a.slice(0,40)).join(' || '));
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし');
  await b.close();
})();
