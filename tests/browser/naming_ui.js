// 読み込んだ .csl の名前の規則：ファイル名＋_edited。重ねない、言語の印を外す、名前が変わるときだけ ID を振り直す。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'), path = require('path');
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { errs.push('dialog: ' + d.message()); await d.accept(); });
  const dl = path.join(sp, 'dl_naming'); fs.mkdirSync(dl, { recursive: true });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click()); await wait(300);
  const cur = () => p.evaluate(() => ({ title: document.getElementById('styleTitle').value, id: CSLApp.state.model.info.id }));
  const load = async (file) => {
    await p.click('#btnStarter'); await wait(200);
    const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
    await fc.accept([path.join(dl, file)]); await wait(500);
    return cur();
  };
  const expect = (label, got, want) => { const ok = got === want; console.log(`${ok ? 'OK' : 'NG'} ${label}: ${got}`); if (!ok) errs.push(`${label}: ${got}（期待 ${want}）`); };
  const a = await cur();
  expect('型から始めた名前', a.title, 'My_Chicago_style');
  await p.click('#btnExport'); await wait(800);
  const b1 = await load('My_Chicago_style.csl');
  expect('読み込み1回目', b1.title, 'My_Chicago_style_edited');
  if (b1.id === a.id) errs.push('名前が変わったのに ID が同じ');
  await p.click('#btnExport'); await wait(800);
  const b2 = await load('My_Chicago_style_edited.csl');
  expect('読み込み2回目（重ねない）', b2.title, 'My_Chicago_style_edited');
  if (b2.id !== b1.id) errs.push('名前が同じなのに ID が変わった');
  // 言語別（欧文だけ）を書き出して読み込む
  await p.click('#btnExportSplit'); await wait(200);
  await p.evaluate(() => { document.querySelectorAll('#splitList input').forEach((x, k) => { x.checked = k === 1; x.dispatchEvent(new Event('change')); }); });
  await p.click('#btnDoSplit'); await wait(800);
  const b3 = await load('My_Chicago_style_edited_en.csl');
  expect('言語別の _en を外す', b3.title, 'My_Chicago_style_edited');
  // ファイル名に使えない文字
  const t = await p.evaluate(() => {
    const m = CSLApp.state.model;
    return ['My_style (1).csl', '卒論用.csl', 'thesis_ja.csl', 'thesis_fr.csl', 'thesis_edited_edited.csl'].map((f) => f + ' → ' + CSLApp.editedTitle(f, m));
  });
  t.forEach((x) => console.log('   ' + x));
  expect('「(1)」付き', t[0].split(' → ')[1], 'My_style (1)_edited');
  expect('日本語だけのファイル名', t[1].split(' → ')[1], 'My_Chicago_style_edited');
  expect('_ja を外す', t[2].split(' → ')[1], 'thesis_edited');
  expect('足していない言語（fr）は外さない', t[3].split(' → ')[1], 'thesis_fr_edited');
  expect('重なった _edited', t[4].split(' → ')[1], 'thesis_edited');
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
