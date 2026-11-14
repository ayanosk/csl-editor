// 使い方スライド（guide/csl_editor_guide.md）の画面を撮る。
// 使い方：node guide/shoot.js   （先に python3 build.py で docs/index.html を組んでおく）
// 赤枠と番号は、撮影のときだけページに重ねる。アプリ本体には手を入れない。
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { puppeteer, CHROME } = require(path.join(ROOT, 'tests/browser/_puppeteer.js'));
const HTML = path.join(ROOT, 'docs/index.html');
const FIX = path.join(ROOT, 'tests/fixtures/chicago-notes-bibliography.csl');
const OUT = path.join(__dirname, 'img');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  p.on('dialog', async (d) => { await d.accept(); });
  await p.setViewport({ width: 1280, height: 760, deviceScaleFactor: 2 });

  // marks：[CSS セレクタ, 番号]。セレクタの代わりに {sel, text} で「sel のうち text（配列ならすべて）を含む、いちばん小さい要素」も指せる
  const mark = (marks) => p.evaluate((marks) => {
    document.querySelectorAll('.guide-mark').forEach((n) => n.remove());
    const area = (n) => { const r = n.getBoundingClientRect(); return r.width * r.height; };
    for (const [q, num] of marks) {
      const texts = typeof q === 'string' ? [] : [].concat(q.text);
      const el = typeof q === 'string' ? document.querySelector(q)
        : [...document.querySelectorAll(q.sel)].filter((n) => texts.every((t) => n.textContent.includes(t))).sort((a, b) => area(a) - area(b))[0];
      if (!el) { console.warn('見つからない', JSON.stringify(q)); continue; }
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = 'guide-mark';
      Object.assign(box.style, { position: 'fixed', left: (r.left - 4) + 'px', top: (r.top - 4) + 'px', width: (r.width + 8) + 'px', height: (r.height + 8) + 'px',
        border: '3px solid #d62d20', borderRadius: '6px', zIndex: 99999, pointerEvents: 'none' });
      const badge = document.createElement('div');
      badge.className = 'guide-mark';
      badge.textContent = num;
      Object.assign(badge.style, { position: 'fixed', left: Math.max(2, r.left - 16) + 'px', top: Math.max(2, r.top - 16) + 'px', width: '26px', height: '26px', lineHeight: '26px',
        borderRadius: '50%', background: '#d62d20', color: '#fff', font: '700 16px sans-serif', textAlign: 'center', zIndex: 100000, pointerEvents: 'none' });
      // 開いているダイアログは最前面に出るので、枠はその中に置く
      (el.closest('dialog[open]') || document.body).append(box, badge);
    }
  }, marks);
  const shot = async (name, marks = []) => { await mark(marks); await wait(150); await p.screenshot({ path: path.join(OUT, name + '.png') }); await mark([]); console.log('撮影', name); };
  const tab = (t) => p.evaluate((t) => { const x = [...document.querySelectorAll('#panelTabs button')].find((x) => x.textContent.startsWith(t)); if (x) x.click(); return !!x; }, t);
  const fresh = async () => { await p.goto('file://' + HTML); await wait(500); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(800); };
  const clickSeg = (id, s) => p.evaluate((id, s) => { const seg = [...document.querySelectorAll(`.item[data-id="${id}"] [data-row="bib"] .cslseg`)].find((x) => x.textContent.includes(s)); seg.click(); }, id, s);

  // 1) 最初の画面：①公式のスタイルを読み込む ②型を選ぶ
  await fresh();
  await shot('01_start', [['#btnDlgLoadCsl', 1], ['#starterList button', 2]]);

  // 2) 部品の画面（型から組む・大幅修正）
  await p.evaluate(() => document.querySelectorAll('#starterList button')[0].click()); await wait(800);
  await tab('和文の書式'); await wait(600);
  await shot('02_chips', [['#panelTabs', 1], ['#panelBody .type-tabs', 2], ['#panelBody .seg', 3], ['#chipRow', 4], ['#panelBody .palette', 5], ['#previewList .item', 6]]);

  // 3) チップを押したときの詳細
  await p.evaluate(() => { const c = document.querySelectorAll('#chipRow .chip'); (c[1] || c[0]).click(); }); await wait(500);
  await shot('03_chip', [['#chipRow .chip.sel, #chipRow .chip.selected, #chipRow .chip:nth-child(2)', 1], [{ sel: '#panelBody div', text: ['前に付ける文字', '削除'] }, 2]]);

  // 4) 公式のスタイルを読み込んだ直後（微調整）
  await fresh();
  const [fc] = await Promise.all([p.waitForFileChooser(), p.click('#btnDlgLoadCsl')]);
  await fc.accept([FIX]); await wait(7000);  // 読み込みの通知が消えるまで待つ
  await shot('04_official', [['#panelTabs', 1], ['#previewList .item', 2]]);

  // 5) 微調整：書名を押すと、同じ部品から出た所が光る
  await clickSeg('s-en-book-1', 'Village Records'); await wait(500);
  await shot('05_select', [['.item[data-id="s-en-book-1"] [data-row="bib"] .cslseg.hl', 1], [{ sel: '#panelBody p', text: '直すと、そのすべてが変わります' }, 2], [{ sel: '#panelBody div', text: ['前の部品と入れ替える', 'この部品を出さない'] }, 3]]);

  // 6) 微調整：手を入れた箇所の一覧
  await p.evaluate(() => { const l = [...document.querySelectorAll('#panelBody label')].find((x) => x.textContent === '斜体'); const c = l.nextElementSibling.querySelector('input'); c.checked = false; c.dispatchEvent(new Event('change')); }); await wait(1500);
  await clickSeg('s-en-book-1', 'Example University Press'); await wait(400);
  await p.evaluate(() => [...document.querySelectorAll('#panelBody button')].find((x) => x.textContent.includes('この部品を出さない')).click()); await wait(1500);
  await p.evaluate(() => { const e = document.querySelector('.off-edits'); if (e) e.scrollIntoView({ block: 'center' }); }); await wait(300);
  await shot('06_edits', [['.off-edits', 1]]);

  // 7) 大幅修正：部品の画面に移る（帯に、元のスタイルとの一致の数）
  await tab('大幅修正'); await wait(3000);
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(200);
  await shot('07_rebuild', [['#panelTabs', 1], ['.rebuild-banner', 2]]);

  // 8) 書き出しのボタン（画面の上端）
  await mark([['#styleTitle', 1], ['#btnExport', 2], ['#btnExportSplit', 3]]); await wait(150);
  await p.screenshot({ path: path.join(OUT, '08_export.png'), clip: { x: 0, y: 0, width: 1280, height: 90 } });
  console.log('撮影 08_export');
  await b.close();
})();
