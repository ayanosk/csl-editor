// 言語を足すときの「写す元」と、書式全体の「引用箇所の頁の語」。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
const { puppeteer, CHROME, toStarter, confirmImport } = require('./_puppeteer.js');
const fs = require('fs'); const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', async (d) => { errs.push('dialog: ' + d.message()); await d.accept(); });
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await toStarter(p);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(300);
  const data = [
    { id: 1, type: 'book', language: 'la', title: 'Historia academiae', author: [{ family: 'Duhamel', given: 'Jean-Baptiste' }], publisher: 'Michallet', 'publisher-place': 'Parisiis', issued: { 'date-parts': [[1698]] } },
    { id: 2, type: 'book', language: 'en', title: 'Archives', author: [{ family: 'Smith', given: 'John' }], publisher: 'Press', issued: { 'date-parts': [[2022]] } }];
  fs.writeFileSync(sp + '/lang_copy_items.json', JSON.stringify(data));
  await p.click('#btnAddItem'); await wait(200);
  const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnPickItems')]); await fc.accept([sp + '/lang_copy_items.json']); await wait(500); await confirmImport(p);
  const notes = () => p.evaluate(() => [...document.querySelectorAll('#previewList .item')].map((n) => [...n.querySelectorAll('.out .v')].map((v) => v.textContent)[1] || ''));
  // ラテン語を「フランス語の既定の書式」から足す
  await p.click('.add-lang'); await wait(200);
  await p.evaluate(() => document.querySelectorAll('.lang-other').forEach((d) => { d.open = true; }));
  const opts = await p.$$eval('#newLangFrom option', (o) => o.map((x) => x.value));
  if (!opts.includes('preset:fr') || !opts.includes('ja')) errs.push('写す元の選択肢が足りない: ' + opts.join(','));
  await p.select('#newLangFrom', 'preset:fr');
  await p.type('#newLang', 'la'); await p.keyboard.press('Enter'); await wait(500);
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].map((x) => x.textContent).join(' / '));
  console.log('タブ:', tabs);
  if (!/ラテン語/.test(tabs) || /フランス語/.test(tabs)) errs.push('ラテン語だけが足されていない');
  let n = await notes();
  console.log('注:\n ' + n.join('\n '));
  if (!/Jean-Baptiste Duhamel, Historia academiae, Parisiis, Michallet, 1698, p.\s42/.test(n.join('\n'))) errs.push('ラテン語の文献がフランス語の形で組まれない');
  await p.screenshot({ path: sp + '/lang_copy_la.png' });
  // 欧文の書式で、引用箇所の頁の語を「前に付ける」に揃え、範囲で pp. になるか
  await p.evaluate(() => { [...document.querySelectorAll('#panelTabs button')].find((x) => x.textContent.startsWith('欧文')).click(); }); await wait(300);
  const now = await p.$eval('select.loc-label', (s) => s.value);
  if (now !== 'none') errs.push('Chicago の欧文の初期値が「付けない」でない: ' + now);
  await p.select('select.loc-label', 'before'); await wait(500);
  await p.select('#locSel', 'page:42-45'); await wait(500);
  n = await notes();
  console.log('欧文・範囲:', n.find((x) => /Smith/.test(x)));
  if (!/pp\.\s42–45/.test(n.find((x) => /Smith/.test(x)) || '')) errs.push('範囲が pp. にならない');
  await p.select('#locSel', 'page:42'); await wait(500);
  n = await notes();
  console.log('欧文・1頁:', n.find((x) => /Smith/.test(x)));
  if (!/p\.\s42/.test(n.find((x) => /Smith/.test(x)) || '') || /pp\./.test(n.find((x) => /Smith/.test(x)) || '')) errs.push('1頁が p. にならない');
  await p.screenshot({ path: sp + '/lang_copy_loc.png' });
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
