// 横書き／縦書きの切り替え：カードや操作はそのままで、組み上がりだけを縦に組む。縦中横・漢数字・再読み込み後も残ること。
const { puppeteer, CHROME, toStarter } = require('./_puppeteer.js');
const [html, sp] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file://' + html); await wait(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(500);
  await toStarter(p);
  await p.evaluate(() => document.querySelector('#starterList button').click()); await wait(300);
  const check = (label, ok) => { console.log((ok ? 'OK ' : 'NG ') + label); if (!ok) errs.push(label); };
  const st = () => p.evaluate(() => {
    const v = document.querySelector('#previewList .out .v');
    return { mode: getComputedStyle(v).writingMode, cards: document.querySelectorAll('#previewList .item').length,
      tcy: document.querySelectorAll('#previewList .tcy').length, tcyShown: !document.getElementById('tcyWrap').hidden,
      text: document.getElementById('previewList').textContent };
  });
  let s = await st();
  check('最初は横書き', s.mode === 'horizontal-tb' && !s.tcyShown);
  const cards = s.cards;
  await p.evaluate(() => document.querySelector('#writingMode [data-m="v"]').click()); await wait(500);
  s = await st();
  check('縦書きに切り替わる（カードの数は同じ）', s.mode === 'vertical-rl' && s.cards === cards);
  check('2桁の数字が縦中横になる', s.tcyShown && s.tcy > 0);
  await p.click('#tateTcy'); await wait(500);
  check('縦中横を外せる', (await st()).tcy === 0);
  await p.click('#tateTcy'); await wait(400);
  // カードを押す操作が変わらない
  await p.evaluate(() => document.querySelector('#previewList .item').click()); await wait(300);
  check('カードを押すと選ばれる', await p.evaluate(() => !!document.querySelector('#previewList .item.current')));
  await p.evaluate(() => { CSLApp.state.model.systems.ja.kanjiNumerals = 'zero'; CSLApp.state.ui.panel = 'ja'; });
  await p.evaluate(() => document.querySelector('#writingMode [data-m="v"]').click()); await wait(500);
  check('漢数字の設定が効く（四二頁）', (await st()).text.includes('四二頁'));
  await p.reload(); await wait(700);
  check('再読み込みしても縦書きのまま', (await st()).mode === 'vertical-rl');
  await p.evaluate(() => document.querySelector('#writingMode [data-m="h"]').click()); await wait(500);
  check('横書きに戻せる', (await st()).mode === 'horizontal-tb');
  console.log('エラー:', errs.length ? errs.join(' / ') : 'なし');
  await b.close();
})();
