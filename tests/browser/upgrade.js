// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(400);
  // 古い保存状態を再現：citeSub・citeIbid・subsequent を消して保存し直す
  await p.evaluate(() => { const k = 'csl-editor-v1'; const s = JSON.parse(localStorage.getItem(k)); delete s.model.subsequent; for (const sys of Object.values(s.model.systems)) { delete sys.citeSub; delete sys.citeIbid; } localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await wait(700);
  console.log('古い保存状態から:', await p.evaluate(() => [...document.querySelectorAll('.seg button')].map(b => b.textContent).join(' | ')));
  console.log('プレビューの注の行:', await p.evaluate(() => [...document.querySelectorAll('#previewList .item:not([hidden])')][0].querySelectorAll('.out .k').length));
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
