#!/bin/bash
# 配布 HTML をヘッドレスの Chrome で操作し、画面の検証を全部走らせる。
# 使い方：bash tests/browser/run_all.sh [配布HTML]
#   既定の HTML は build.py の出力先。作業用のファイルとスクリーンショットは一時ディレクトリに出す。
#   puppeteer-core と Chrome の場所は PUPPETEER_CORE・CHROME で指定できる（無ければ自動で探す。_puppeteer.js）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
HTML="${1:-$ROOT/docs/index.html}"
HTML="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
WORK="$(mktemp -d)"
mkdir -p "$WORK/dl"

# resume.js が読み込む試し入れ用の .csl（4つの型を書き出したもの）
node -e "
const fs=require('fs');const G=require('$ROOT/src/csl_generate.js');const {STARTERS,makeStarter}=require('$ROOT/src/starters.js');
for(const k of Object.keys(STARTERS)){const m=makeStarter(k);m.info.title='test_'+k;m.info.id='http://www.zotero.org/styles/csl-editor-test-'+k;fs.writeFileSync('$WORK/test_'+k+'.csl',G.generate(m));}"

fail=0
for t in flow resume lang_ui item_ui types_ui langsel sub_ui grp_ui upgrade split_ui naming_ui import_ui locator_ui; do
  out="$(node "$HERE/$t.js" "$HTML" "$WORK" 2>&1)"
  last="$(printf '%s\n' "$out" | tail -1)"
  if printf '%s' "$last" | grep -q "なし"; then echo "OK   $t"; else echo "FAIL $t"; printf '%s\n' "$out" | sed 's/^/     /'; fail=1; fi
done
echo "作業用ディレクトリ（スクリーンショット）：$WORK"
exit $fail
