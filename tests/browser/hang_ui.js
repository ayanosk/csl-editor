// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// 全体の設定の「参考文献の字下げ」：型の既定、プレビューのぶら下げ、書き出す CSL の hanging-indent。
const { puppeteer, CHROME, toStarter } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(600);
  await toStarter(p);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(500);
  await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].find(b => b.textContent === '全体の設定').click()); await wait(200);
  const look = () => p.evaluate(() => ({
    checked: [...document.querySelectorAll('label')].find(l => l.textContent.includes('ぶら下げにする')).querySelector('input').checked,
    hanging: document.querySelectorAll('#previewList .out .v.hanging').length,
    xml: /<bibliography[^>]* hanging-indent="true"/.test(CSLGen.generate(CSLApp.state.model)),
  }));
  const on = await look();
  console.log('Chicago 風の既定:', JSON.stringify(on));
  if (!on.checked || !on.hanging || !on.xml) errs.push('Chicago 風の既定がぶら下げになっていない');
  await p.screenshot({ path: sp + '/hang_on.png' });
  await p.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent.includes('ぶら下げにする')).querySelector('input').click()); await wait(800);
  const off = await look();
  console.log('外した後:', JSON.stringify(off));
  if (off.checked || off.hanging || off.xml) errs.push('外してもぶら下げが残る');
  // IEEE 風（番号形式）は既定で外す
  await p.click('#btnStarter'); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('#starterList button')][3].click()); await wait(500);
  await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].find(b => b.textContent === '全体の設定').click()); await wait(200);
  const ieee = await look();
  console.log('IEEE 風の既定:', JSON.stringify(ieee));
  if (ieee.checked || ieee.hanging || ieee.xml) errs.push('IEEE 風がぶら下げになっている');
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
