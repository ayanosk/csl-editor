// 画面の検証で使う puppeteer-core と Chrome の場所。
// PUPPETEER_CORE・CHROME の環境変数で指定できる。指定が無ければ、node の探し方で puppeteer-core を探し、
// 見つからなければ npm のグローバルに入れた marp-cli に同梱のものを使う。
'use strict';
const cp = require('child_process'), path = require('path'), fs = require('fs');
function findPuppeteer() {
  if (process.env.PUPPETEER_CORE) return require(process.env.PUPPETEER_CORE);
  try { return require('puppeteer-core'); } catch (e) { /* 次を試す */ }
  try {
    const p = path.join(cp.execSync('npm root -g').toString().trim(), '@marp-team', 'marp-cli', 'node_modules', 'puppeteer-core');
    if (fs.existsSync(p)) return require(p);
  } catch (e) { /* 下で止める */ }
  console.error('puppeteer-core が見つかりません。`npm i -g puppeteer-core`（または `npm i -g @marp-team/marp-cli`）で入れるか、PUPPETEER_CORE で場所を指定してください。');
  process.exit(2);
}
const CHROME = process.env.CHROME || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform];
if (!CHROME || !fs.existsSync(CHROME)) {
  console.error('Google Chrome が見つかりません。CHROME で実行ファイルの場所を指定してください。');
  process.exit(2);
}
module.exports = { puppeteer: findPuppeteer(), CHROME };
