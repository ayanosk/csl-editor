// ヘッドレスの Chrome でアプリを操作する検証。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
// puppeteer-core は marp-cli に同梱のものを使う（PUPPETEER_CORE で差し替え可）。Chrome は CHROME で差し替え可。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1400, height: 900 });
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(400);
  const st = () => p.evaluate(() => { const s = document.querySelectorAll('#previewFilter select'); return s[0].selectedOptions[0].text + ' | ' + s[1].selectedOptions[0].text + ' | ' + [...new Set([...document.querySelectorAll('#previewList .item')].filter(n => !n.hidden).map(n => n.dataset.sys))].join(',') + ' ' + document.querySelector('#previewFilter > span:last-child').textContent; });
  const pick = (k, v) => p.evaluate((k, v) => { const s = document.querySelectorAll('#previewFilter select')[k]; s.value = v; s.dispatchEvent(new Event('change')); }, k, v);
  console.log('既定:', await st());
  // fr の書式を足し、仏語の文献を1件入れる
  await p.click('.add-lang'); await wait(200); await p.type('#newLang', 'fr'); await p.keyboard.press('Enter'); await wait(400);
  await p.click('#btnAddItem'); await wait(200); await p.click('#btnNewItem'); await wait(300);
  await p.evaluate(() => { const set = (lab, v) => { const l = [...document.querySelectorAll('#itemForm label')].find(l => !l.hidden && l.textContent === lab); l.nextElementSibling.value = v; }; set('言語', 'fr'); set('著者', 'Dupont, Jean'); set('書名', 'Histoire'); set('出版者', 'Éditions Exemple'); set('発行年月日', '2020'); });
  await p.evaluate(() => [...document.querySelectorAll('#itemForm button')].find(b => b.textContent === '入れる').click()); await wait(500);
  console.log('fr を開いたとき:', await st());
  console.log('選択肢:', await p.evaluate(() => [...document.querySelectorAll('#previewFilter select')[0].options].map(o => o.text).join(' / ')));
  await pick(0, 'sys:en'); await wait(200); console.log('欧文だけ:', await st());
  await pick(1, '単著'); await wait(200); console.log('欧文×単著:', await st());
  await pick(0, 'sys:fr'); await wait(200); console.log('fr×単著:', await st());
  await pick(0, 'all'); await pick(1, ''); await wait(200); console.log('すべて:', await st());
  await p.evaluate(() => [...document.querySelectorAll('#panelTabs button')].find(b => b.textContent === '和文の書式').click()); await wait(200);
  console.log('和文タブへ移っても「すべて」のまま:', await st());
  await pick(0, 'auto'); await wait(200); console.log('いま開いている書式:', await st());
  await p.screenshot({ path: sp + '/v9_lang.png', clip: { x: 720, y: 60, width: 680, height: 200 } });
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
