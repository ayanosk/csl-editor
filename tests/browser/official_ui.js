// 公式のスタイルの手直し：読み込む → 押して選ぶ → 直す・出さない・入れ替える → 元に戻す → 書き出す → 再読み込み → 型に戻る
const { puppeteer, CHROME } = require('./_puppeteer.js');
const fs = require('fs'), path = require('path');
const [html, sp] = process.argv.slice(2);
const FIX = path.join(__dirname, '..', 'fixtures', 'chicago-notes-bibliography.csl');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { if (!/元に戻します/.test(d.message())) errs.push('dialog: ' + d.message()); await d.accept(); });
  const dl = path.join(sp, 'dl_official'); fs.mkdirSync(dl, { recursive: true });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  const idle = async () => { for (let i = 0; i < 60; i++) { await wait(200); const t = await p.$eval('#dataSource', (n) => n.textContent); if (!t.includes('組み直しています')) return; } errs.push('組み直しが終わらない'); };
  const check = (label, cond, extra) => { console.log(`${cond ? 'OK' : 'NG'} ${label}${extra ? '：' + extra : ''}`); if (!cond) errs.push(label); };
  const bib = (id) => p.evaluate((id) => document.querySelector(`.item[data-id="${id}"] [data-row="bib"]`).innerHTML, id);
  const text = (id, row) => p.evaluate((id, row) => document.querySelector(`.item[data-id="${id}"] [data-row="${row}"]`).textContent, id, row);
  const clickSeg = (id, row, s) => p.evaluate((id, row, s) => { const seg = [...document.querySelectorAll(`.item[data-id="${id}"] [data-row="${row}"] .cslseg`)].find((x) => x.textContent.includes(s)); seg.click(); return !!seg; }, id, row, s);
  const btn = (t) => p.evaluate((t) => [...document.querySelectorAll('#panelBody button')].find((x) => x.textContent.includes(t)).click(), t);
  // 1) 読み込む
  const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
  await fc.accept([FIX]); await wait(300); await idle();
  check('読み込むと手直しの画面になる', await p.evaluate(() => CSLApp.state.mode === 'official' && !document.getElementById('dlgStarter').open));
  check('スタイル名はファイル名＋_edited', (await p.$eval('#styleTitle', (n) => n.value)) === 'chicago-notes-bibliography_edited');
  check('言語別の書き出しは出さない', await p.$eval('#btnExportSplit', (n) => n.hidden));
  const orig = await text('s-en-book-1', 'bib');
  check('元の出力のまま表示する', orig === 'Brown, Emily. Village Records and the State. Example University Press, 2020.', orig);
  // 2) 書名を押す
  await clickSeg('s-en-book-1', 'bib', 'Village Records'); await wait(200);
  const panel = await p.evaluate(() => ({ h: document.querySelector('#panelBody h3').textContent, scope: document.querySelector('#panelBody h3 + p').textContent, lit: document.querySelectorAll('.cslseg.hl').length }));
  check('書名を押すと「題名」の詳細が出る', panel.h === '題名', panel.h);
  check('影響の範囲（参考文献と注）を示す', /参考文献/.test(panel.scope) && /注/.test(panel.scope) && /すべてが変わります/.test(panel.scope), panel.scope);
  check('同じ部品から出た所が光る', panel.lit >= 6, panel.lit + 'か所');
  // 3) 斜体をやめる
  await p.evaluate(() => { const l = [...document.querySelectorAll('#panelBody label')].find((x) => x.textContent === '斜体'); const c = l.nextElementSibling.querySelector('input'); c.checked = false; c.dispatchEvent(new Event('change')); });
  await idle();
  check('斜体をやめると、参考文献の書名が斜体でなくなる', !(await bib('s-en-book-1')).includes('<i>'));
  check('注の書名も斜体でなくなる', !(await p.evaluate(() => document.querySelector('.item[data-id="s-en-book-1"] [data-row="cite"]').innerHTML)).includes('<i>'));
  // 4) 出版者を出さない → 元に戻す
  await clickSeg('s-en-book-1', 'bib', 'Example University Press'); await wait(200);
  await btn('この部品を出さない'); await idle();
  check('出版者を出さないと、参考文献から消える', !(await text('s-en-book-1', 'bib')).includes('Example University Press'), await text('s-en-book-1', 'bib'));
  const edits = await p.evaluate(() => [...document.querySelectorAll('.off-edits li span')].map((x) => x.textContent));
  check('手を入れた箇所が2件並ぶ', edits.length === 2, edits.join(' ／ '));
  await p.evaluate(() => [...document.querySelectorAll('.off-edits li')][1].querySelector('button').click()); await idle();
  check('元に戻すと、出版者が戻る', (await text('s-en-book-1', 'bib')).includes('Example University Press'));
  // 5) 入れ替える
  await clickSeg('s-en-book-1', 'bib', 'Example University Press'); await wait(200);
  await btn('後ろの部品と入れ替える'); await idle();
  check('入れ替えると「年, 出版者」の順になる', /2020, Example University Press/.test(await text('s-en-book-1', 'bib')), await text('s-en-book-1', 'bib'));
  // 引用箇所の選択
  await p.select('#locSel', 'chapter:2'); await idle();
  check('引用箇所を章にすると、注が chap. 2 になる', /chap\. 2/.test(await text('s-en-book-1', 'cite')), await text('s-en-book-1', 'cite'));
  // 6) 書き出す
  await p.click('#btnExport'); await wait(1200);
  const f = fs.readdirSync(dl).find((x) => x.endsWith('.csl'));
  const xml = f ? fs.readFileSync(path.join(dl, f), 'utf8') : '';
  check('書き出したファイル', f === 'chicago-notes-bibliography_edited.csl', f);
  check('名前と template', /<title>chicago-notes-bibliography_edited<\/title>/.test(xml) && /rel="template"/.test(xml));
  // 7) 再読み込み
  await p.reload(); await wait(500); await idle();
  check('再読み込みしても、手直しの状態が残る', (await p.evaluate(() => CSLApp.state.mode === 'official' && CSLApp.state.official.edits.length === 2)) && /2020, Example University Press/.test(await text('s-en-book-1', 'bib')));
  // 書き出したものを読み込み直す（名前と ID を保つ）
  const id1 = (xml.match(/<id>([^<]*)<\/id>/) || [])[1];
  await p.click('#btnStarter'); await wait(200);
  const [fc2] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
  await fc2.accept([path.join(dl, f)]); await wait(300); await idle();
  check('書き出したものを読み込み直すと、名前と ID を保つ', (await p.evaluate(() => [CSLApp.state.official.title, CSLApp.state.official.id])).join() === ['chicago-notes-bibliography_edited', id1].join());
  check('読み込み直したものは、手直し後の出力から始まる', /2020, Example University Press/.test(await text('s-en-book-1', 'bib')));
  await p.screenshot({ path: path.join(sp, 'official.png') });
  // 8) 型から組む道に戻る
  await p.click('#btnStarter'); await wait(200);
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click()); await wait(500);
  check('型を選ぶと、型から組む画面に戻る', await p.evaluate(() => CSLApp.state.mode === 'chips' && !document.getElementById('btnExportSplit').hidden && document.querySelectorAll('#chipRow .chip').length > 0));
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
