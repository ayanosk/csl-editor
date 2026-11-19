// 一次史料の部品・原稿のタブ・項目の内容をコピーする・プレビューの再読み込み。run_all.sh から呼ぶ（引数：配布 HTML のパス、作業用ディレクトリ）。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.setViewport({ width: 1400, height: 1100 });
  await p.goto('file://' + html); await wait(600);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(400);
  const bad = [];
  const expect = (ok, what) => { console.log(`${ok ? 'OK' : 'NG'} ${what}`); if (!ok) bad.push(what); };
  const chipText = () => p.evaluate(() => [...document.querySelectorAll('#chipRow .chip')].map((c) => c.textContent).join(' '));
  const itemText = (id) => p.evaluate((id) => { const n = [...document.querySelectorAll('#previewList .item')].find((x) => x.dataset.id === id); return n ? n.querySelector('.v').textContent : ''; }, id);

  // 一次史料の部品が、部品を足す欄の別の行に出る
  const archiveBtns = await p.evaluate(() => {
    const lbl = [...document.querySelectorAll('.palette .lbl')].find((l) => l.textContent === '一次史料の部品');
    return lbl ? [...lbl.nextElementSibling.querySelectorAll('button')].map((x) => x.textContent) : [];
  });
  console.log('一次史料の部品:', archiveBtns.join(' / '));
  expect(archiveBtns.length === 7 && archiveBtns.includes('所蔵機関') && archiveBtns.includes('宛先'), '一次史料の部品が7つ');

  // 原稿と手紙のタブを足す → 一次史料の並びから始まる
  await p.evaluate(() => { document.querySelector('.type-pick').open = true; }); await wait(200);
  const check = (name) => p.evaluate((name) => { const l = [...document.querySelectorAll('.type-check')].find((l) => l.textContent.trim().startsWith(name)); l.querySelector('input').click(); }, name);
  await check('原稿'); await wait(400);
  const ms = await chipText();
  console.log('原稿の並び:', ms);
  expect(/所蔵機関/.test(ms) && /所蔵場所/.test(ms), '原稿のタブは所蔵の部品を含む並びで始まる');
  await check('手紙'); await wait(400);
  const letter = await itemText('s-ja-letter-1');
  console.log('和文の書状:', letter);
  expect(letter.includes('長岡三郎書状（山田太郎宛）') && letter.includes('越後史料館所蔵'), '和文の書状のプレビュー');

  // 項目の内容をコピーする：注（初出）に、参考文献の並びを写す
  await p.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => x.textContent === '注（初出）').click()); await wait(300);
  const opts = await p.evaluate(() => [...document.querySelectorAll('.copy-row select option')].map((o) => o.textContent));
  console.log('写す元:', opts.join(' / '));
  expect(opts.join(',') === '参考文献,注（2回目以降）,注（直前と同じ文書）', '写す元は開いている場所以外の3つ');
  await p.evaluate(() => {
    const sk = CSLApp.state.ui.panel, tab = CSLApp.state.ui.tab, sys = CSLApp.state.model.systems[sk];
    sys.cite[tab] = []; // 違いが分かるように空にしておく
  });
  await p.evaluate(() => { const s = document.querySelector('.copy-row select'); s.value = 'bib'; document.querySelector('.copy-row button').click(); }); await wait(400);
  const same = await p.evaluate(() => {
    const sk = CSLApp.state.ui.panel, tab = CSLApp.state.ui.tab, sys = CSLApp.state.model.systems[sk];
    const strip = (cs) => JSON.stringify((cs || []).map(({ uid, ...c }) => c));
    return strip(sys.cite[tab]) === strip(sys.bib[tab]) && sys.cite[tab].length > 0;
  });
  expect(same, '注（初出）に参考文献の並びが写る');

  // プレビューの再読み込み
  await p.evaluate(() => { document.getElementById('previewList').replaceChildren(); });
  await p.click('#btnRefresh'); await wait(300);
  expect((await p.evaluate(() => document.querySelectorAll('#previewList .item').length)) > 0, '再読み込みでプレビューを組み直す');

  // 文献の編集画面：原稿を選ぶと所蔵の欄が出る
  await p.click('#btnAddItem'); await wait(200); await p.click('#btnNewItem'); await wait(300);
  await p.evaluate(() => { const s = document.querySelector('#itemForm select'); s.value = 'manuscript'; s.dispatchEvent(new Event('change')); });
  const labels = await p.evaluate(() => [...document.querySelectorAll('#itemForm label')].filter((l) => !l.hidden).map((l) => l.textContent));
  console.log('原稿の欄:', labels.join(' / '));
  expect(labels.includes('所蔵機関') && labels.includes('所蔵場所') && labels.includes('原稿の種類'), '原稿の編集欄に所蔵機関・所蔵場所・種類');

  await p.screenshot({ path: sp + '/archive_ui.png' });
  console.log(bad.length ? `NG ${bad.length}件` : '');
  console.log('エラー:', errs.length || bad.length ? errs.concat(bad).join('\n') : 'なし'); await b.close();
})();
