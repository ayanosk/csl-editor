// プレビューの「引用箇所」：選ぶと注・本文中の引用がその箇所で組み直される。
const { puppeteer, CHROME } = require('./_puppeteer.js');
const [html] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', async (d) => { errs.push('dialog: ' + d.message()); await d.accept(); });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click()); await wait(400);
  const rows = () => p.evaluate(() => [...document.querySelector('#previewList .item').querySelectorAll('.out .v')].map((n) => n.textContent));
  for (const [v, want] of [['page:42', '42頁'], ['chapter:2', '第2章'], ['chapter:第二章', '第二章'], ['chapter:2章2節', '2章2節'], ['section:3', '第3節']]) {
    await p.select('#locSel', v); await wait(500);
    const r = await rows();
    const note = r[1] || '';
    const ok = note.includes(want) && !/章章|節節|節章/.test(r.join(''));
    console.log(`${ok ? 'OK' : 'NG'} ${v.padEnd(16)} ${note} ／ 続けて別の箇所：${r[3] || ''}`);
    if (!ok) errs.push(v);
  }
  await p.reload(); await wait(600);
  const kept = await p.$eval('#locSel', (n) => n.value);
  console.log('再読み込み後の選択:', kept);
  if (kept !== 'section:3') errs.push('選択が保存されない');
  console.log('エラー:', errs.length ? errs.join('\n') : 'なし'); await b.close();
})();
