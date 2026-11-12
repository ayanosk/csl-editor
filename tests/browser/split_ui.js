// 言語別の書き出し：書式を選ぶ画面、2つ以上で zip（unzip -t で中身と CRC を検査）、1つなら .csl。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { errs.push('dialog: ' + d.message()); await d.accept(); });
  const dl = path.join(sp, 'dl_split'); fs.mkdirSync(dl, { recursive: true });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click()); await wait(300);
  await p.click('.add-lang'); await wait(200); await p.type('#newLang', 'fr'); await p.keyboard.press('Enter'); await wait(400);
  console.log('ボタン:', await p.evaluate(() => [document.getElementById('btnExport').textContent, document.getElementById('btnExportSplit').textContent].join(' / ')));
  // 3つとも選んで zip
  await p.click('#btnExportSplit'); await wait(300);
  console.log('選べる書式:', await p.evaluate(() => [...document.querySelectorAll('#splitList label')].map((l) => l.textContent).join(' / ')));
  console.log(await p.$eval('#splitFiles', (n) => n.textContent));
  await p.screenshot({ path: sp + '/split_dialog.png' });
  await p.click('#btnDoSplit'); await wait(1200);
  const zip = fs.readdirSync(dl).find((f) => f.endsWith('.zip'));
  if (!zip) errs.push('zip が出ない');
  else {
    const z = path.join(dl, zip);
    const test = cp.execSync(`unzip -t "${z}"`).toString();
    console.log('unzip -t:', test.trim().split('\n').slice(1).map((l) => l.trim()).join(' / '));
    if (!/No errors detected/.test(test)) errs.push('zip が壊れている');
    const names = cp.execSync(`unzip -Z1 "${z}"`).toString().trim().split('\n');
    if (names.join(',') !== 'My_Chicago_style_ja.csl,My_Chicago_style_en.csl,My_Chicago_style_fr.csl') errs.push('zip の中身の名前が違う: ' + names);
    for (const n of names) {
      const xml = cp.execSync(`unzip -p "${z}" "${n}"`).toString();
      const info = [(xml.match(/<layout[\s>]/g) || []).length + '個のレイアウト', / locale="/.test(xml) ? 'locale 属性あり' : 'locale 属性なし', xml.match(/default-locale="[^"]+"/)[0], xml.match(/<id>[^<]+<\/id>/)[0].replace(/.*csl-editor-/, '…')];
      console.log('  ' + n + ': ' + info.join(' / '));
      if (/ locale="/.test(xml)) errs.push(n + ' に locale 属性');
    }
  }
  // 1つだけ選ぶと .csl
  await p.click('#btnExportSplit'); await wait(300);
  await p.evaluate(() => { document.querySelectorAll('#splitList input').forEach((b, k) => { b.checked = k === 1; b.dispatchEvent(new Event('change')); }); });
  console.log(await p.$eval('#splitFiles', (n) => n.textContent));
  await p.click('#btnDoSplit'); await wait(1200);
  const one = fs.readdirSync(dl).filter((f) => f.endsWith('.csl'));
  console.log('1つだけ:', one.join(', '));
  if (one.join() !== 'My_Chicago_style_en.csl') errs.push('1つだけのとき .csl にならない');
  // 何も選ばないと書き出せない
  await p.click('#btnExportSplit'); await wait(300);
  await p.evaluate(() => { document.querySelectorAll('#splitList input').forEach((b) => { b.checked = false; b.dispatchEvent(new Event('change')); }); });
  if (!(await p.$eval('#btnDoSplit', (n) => n.disabled))) errs.push('何も選ばなくても書き出せる');
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
