// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const SP = process.argv[3];
const FIX = __dirname;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('dialog', async (d) => { errs.push('dialog: ' + d.message()); await d.accept(); });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SP + '/dl' });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + process.argv[2]);
  await wait(500);
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click());
  await wait(300);
  // 1) CSL JSON を読み込む
  await p.click('#btnAddItem'); await wait(200);
  let [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnPickItems')]);
  await fc.accept([FIX + '/zotero_export.json']);
  await wait(600);
  const cards = await p.evaluate(() => [...document.querySelectorAll('#previewList .item')].map((n) => [n.querySelector('.meta').textContent, n.querySelector('.v').textContent, (n.querySelector('.warn') || {}).textContent || '']));
  console.log('読み込み後:', document = null || '', '\n' + cards.map((c) => '  ' + c.join(' | ')).join('\n'));
  console.log('出典表示:', await p.$eval('#dataSource', (n) => n.textContent));
  // 2) ドラッグ：図書の「発行年」を先頭へ（HTML5 DnD を合成イベントで）
  await p.evaluate(() => {
    const row = document.querySelectorAll('#chipRow .chip');
    const src = row[row.length - 1], dst = row[0];
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const r = dst.getBoundingClientRect();
    dst.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: r.left + 1, clientY: r.top + 2 }));
  });
  await wait(400);
  console.log('ドラッグ後のチップ:', await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map((n) => n.textContent).join(' | ')));
  console.log('ドラッグ後の1件目:', await p.evaluate(() => document.querySelector('#previewList .item.current .v').textContent));
  // 3) 書き出し
  // 日本語のスタイル名は欄が赤くなり、書き出しを断る（断りの alert は想定内なので errs から外す）
  await p.evaluate(() => { const t = document.getElementById('styleTitle'); t.value = '卒論用 style'; t.dispatchEvent(new Event('input')); });
  const jaState = await p.evaluate(() => ({ bad: document.getElementById('styleTitle').classList.contains('bad'), msg: document.getElementById('styleTitleMsg').textContent }));
  console.log('日本語のスタイル名:', jaState);
  if (!jaState.bad) errs.push('日本語のスタイル名が赤くならない');
  const nErr = errs.length;
  await p.click('#btnExport');
  await wait(400);
  const refused = errs.splice(nErr).filter((e) => e.startsWith('dialog: スタイル名には'));
  if (refused.length !== 1) errs.push('日本語のスタイル名で書き出しを断らない');
  if (require('fs').readdirSync(SP + '/dl').length) errs.push('日本語のスタイル名で書き出された');
  await p.evaluate(() => { const t = document.getElementById('styleTitle'); t.value = 'test export (flow)'; t.dispatchEvent(new Event('input')); });
  if (await p.evaluate(() => document.getElementById('styleTitle').classList.contains('bad'))) errs.push('英字のスタイル名が赤いまま');
  await p.click('#btnExport');
  await wait(1200);
  const fs = require('fs');
  const files = fs.readdirSync(SP + '/dl');
  console.log('書き出したファイル:', files);
  // 4) 型を選び直してから、書き出した .csl を読み込む → ドラッグ後の並びに戻るか
  // 型を選び直すのはアプリ名から（「引用スタイルを選び直す」と同じ画面が開く）
  await p.click('#btnBrand');
  await wait(200);
  if (!(await p.$eval('#dlgStarter', (n) => n.open))) errs.push('アプリ名を押しても選び直す画面が開かない');
  await p.evaluate(() => document.querySelectorAll('#starterList button')[2].click());
  await wait(300);
  await p.click('#btnStarter'); await wait(200);
  [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
  await fc.accept([SP + '/dl/' + files.find((f) => f.endsWith('.csl'))]);
  await wait(600);
  console.log('読み戻し後のチップ:', await p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map((n) => n.textContent).join(' | ')));
  console.log('スタイル名:', await p.$eval('#styleTitle', (n) => n.value));
  // 5) 再読み込みで状態が残るか
  await p.reload(); await wait(600);
  console.log('再読み込み後の出典:', await p.$eval('#dataSource', (n) => n.textContent), '/ ダイアログ表示:', await p.$eval('#dlgStarter', (n) => n.open));
  await p.screenshot({ path: SP + '/shot_5_loaded.png' });
  console.log('エラー・ダイアログ:', errs.length ? '\n  ' + errs.join('\n  ') : 'なし');
  await b.close();
})();
