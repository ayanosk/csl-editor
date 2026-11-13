// 公式のスタイルの大幅修正：読み込む → 大幅修正 → 部品に移る（欧文は元のまま、和文は和文の書式）→ 多言語版を書き出す
// → 微調整に戻る → 大幅修正の続きを開く → 再読み込みしても残る
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'), path = require('path');
const [html, sp] = process.argv.slice(2);
const FIX = path.join(__dirname, '..', 'fixtures', 'chicago-notes-bibliography.csl');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; const dialogs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  const dl = path.join(sp, 'dl_rebuild'); fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  const check = (label, cond, extra) => { console.log(`${cond ? 'OK' : 'NG'} ${label}${extra ? '：' + extra : ''}`); if (!cond) errs.push(label); };
  const tab = (t) => p.evaluate((t) => [...document.querySelectorAll('#panelTabs button')].find((x) => x.textContent === t).click(), t);
  const out = (id) => p.evaluate((id) => [...document.querySelectorAll(`#previewList .item[data-id="${id}"] .out .v`)].map((n) => n.textContent), id);
  // 1) 読み込んで、大幅修正へ
  const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
  await fc.accept([FIX]); await wait(1500);
  check('読み込むと微調整の画面', await p.evaluate(() => CSLApp.state.mode === 'official'));
  check('タブは微調整と大幅修正', (await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].map((x) => x.textContent).join('/'))) === '微調整/大幅修正');
  await tab('大幅修正'); await wait(2500);
  check('大幅修正で部品の画面になる', await p.evaluate(() => CSLApp.state.mode === 'chips' && CSLApp.state.model.source.kind === 'official'));
  const banner = await p.$eval('.rebuild-banner', (n) => n.textContent);
  check('帯に元のスタイルと一致の数', /Chicago/.test(banner) && /52\/52/.test(banner), banner.slice(0, 80));
  const en = await out('s-en-book-1');
  check('欧文は元のスタイルのまま', en[0] === 'Brown, Emily. Village Records and the State. Example University Press, 2020.', en[0]);
  const ja = await out('s-ja-book-1');
  check('和文は和文の書式', /『/.test(ja[0]) && !/ and /.test(ja.join('')), ja[0]);
  check('スタイル名は手直しと同じ', (await p.$eval('#styleTitle', (n) => n.value)) === 'chicago-notes-bibliography_edited');
  // 2) 多言語版を書き出す
  await p.click('#btnExport'); await wait(1500);
  const f = fs.readdirSync(dl).find((x) => x.endsWith('.csl'));
  const xml = f ? fs.readFileSync(path.join(dl, f), 'utf8') : '';
  check('書き出せる', !!xml, f);
  check('元のスタイルを template として記録', /<link href="http:\/\/www.zotero.org\/styles\/chicago-notes-bibliography" rel="template"\/>/.test(xml));
  check('元の作者の表示を保つ', /<author>\s*<name>Andrew Dunning<\/name>/.test(xml));
  check('多言語版（欧文のレイアウトがある）', /<layout locale="/.test(xml));
  // 3) 微調整に戻り、続きを開く
  await p.evaluate(() => { const s = CSLApp.state.model.systems.en; s.bib.book.push({ t: 'sep', v: ' ' }, { t: 'field', f: 'literal', prefix: '', suffix: '', wrap: 'none', italic: false, caps: 'none', opt: { value: 'TEST' }, uid: 'zz' }); CSLApp.renderPreview(); });
  await tab('微調整'); await wait(1500);
  check('微調整に戻る', await p.evaluate(() => CSLApp.state.mode === 'official'));
  await tab('大幅修正'); await wait(1500);
  check('続きを開くか尋ねる', dialogs.some((d) => /続きを開きます/.test(d)));
  check('続きが残っている', (await out('s-en-book-1'))[0].includes('TEST'));
  // 4) 再読み込み
  await p.reload(); await wait(1500);
  check('再読み込みしても大幅修正のまま', await p.evaluate(() => CSLApp.state.mode === 'chips' && CSLApp.state.model.source && CSLApp.state.model.source.kind === 'official'));
  check('再読み込みしても帯がある', !!(await p.$('.rebuild-banner')));
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
