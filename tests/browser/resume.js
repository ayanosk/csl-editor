// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs');
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [], alerts = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', async (d) => { alerts.push(d.message()); await d.dismiss(); });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(700);
  await p.screenshot({ path: sp + '/v3_dialog.png' });
  const st = () => p.evaluate(() => ({ open: document.getElementById('dlgStarter').open, starter: CSLApp.state.model.starter, title: document.getElementById('styleTitle').value }));
  console.log('起動時:', JSON.stringify(await st()));
  // 1) ボタンから
  const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
  await fc.accept([sp + '/test_apa.csl']); await wait(500);
  console.log('ボタンで test_apa.csl:', JSON.stringify(await st()));
  // 2) ドロップ（選び直しで画面を開いてから）
  await p.click('#btnStarter'); await wait(300);
  const drop = async (name, body) => p.evaluate((name, body) => {
    const dt = new DataTransfer(); dt.items.add(new File([body], name));
    document.getElementById('cslDrop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, name, body);
  await drop('test_ieee.csl', fs.readFileSync(sp + '/test_ieee.csl', 'utf8')); await wait(500);
  console.log('ドロップで test_ieee.csl:', JSON.stringify(await st()));
  // 3) 読めないファイル
  await p.click('#btnStarter'); await wait(300);
  await drop('other.csl', '<?xml version="1.0"?><style xmlns="http://purl.org/net/xbiblio/csl"/>'); await wait(500);
  console.log('公開スタイル風:', JSON.stringify(await st()), '警告:', alerts.length);
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし');
  await b.close();
})();
