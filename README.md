# 引用スタイル（CSL）編集アプリ（β版）

日本語の画面で部品（チップ）を並べて、引用スタイル（CSL）を作るアプリです。作ったスタイルは Zotero などに入れて、注や参考文献の書き方として使えます。

**アプリを開く：https://ayanosk.github.io/csl-editor/**

1枚の HTML で動き、インストールは要りません。ネットにつながっていなくても動くので、[docs/index.html](docs/index.html) をダウンロードして開いても使えます。

*A browser-based editor for building CSL citation styles by arranging field chips, with separate formats for Japanese and Western-language references. The interface is in Japanese.*

## できること

- Chicago 風・APA 風・MLA 風・IEEE 風の4つの型から始めて、図書・本の章・雑誌論文・ウェブページなどの資料の種類ごとに、参考文献と注（または本文中の引用）の並びを作れます。
- 和文と欧文（とフランス語など足した言語）で、別々の書き方を持てます。どちらで組むかは、Zotero の「言語」欄で決まります。
- Zotero から書き出した書誌（CSL JSON）を読み込むと、自分の文献でプレビューできます。読み込まなければ見本の書誌で試せます。
- 2回目以降の注（同上、前掲書、短縮形）を書き分けられます。

## 4つの型について

各スタイルの典型的な形を簡略に再現した出発点です。公式のスタイルではなく、各団体とは関係ありません。規定どおりかは、それぞれの規定で確かめてください。たとえば、APA の「本文中の引用では著者が3人以上なら et al.」は再現できません（参考文献と本文中の引用で、名前の略し方を分けられないため）。

## 書き出しは2種類

| | 多言語版 | 言語別 |
|:---|:---|:---|
| 中身 | 1つのスタイルで、和文と欧文を書き分ける | 書式ごとに1つずつのスタイル（2つ以上なら zip） |
| 使えるソフト | Zotero など、CSL-M の拡張に対応したもの | pandoc など、標準の CSL 1.0.2 を読むもの全般 |
| 和文と欧文が混ざった文献リスト | 正しく組める | 組めない（全部の文献を同じ書式で組む） |
| Zotero に入れるとき | 「有効な CSL 1.0.2 ではない」と確認が出る。数秒後に OK で入れられる | 確認は出ない |

## スタイル名

型から始めたときのスタイル名は My_Chicago_style のようになります。前に書き出した .csl を読み込むと、ファイル名に _edited を付けた名前になり、ID も新しくなります（Zotero では元のスタイルと別に入ります。_edited の付いたものをもう一度読み込んで直したときは、名前も ID もそのままなので、Zotero では同じスタイルの更新になります）。

## データの扱い

読み込んだ書誌や .csl は、ブラウザの中だけで処理します。外部には送信しません。作業中の状態は、そのブラウザの中（localStorage）に保存されます。

## β版について

画面や出力は予告なく変わることがあります。書き出したスタイルは、最後に Zotero などで確かめてください。不具合や気づいたことは [Issues](https://github.com/ayanosk/csl-editor/issues) へどうぞ。

## 開発

```bash
python3 build.py                  # src/ と vendor/ を docs/index.html にまとめる
node tests/roundtrip.js           # 書き出し → 読み戻しの一致
node tests/empty_fields.js        # 欄が空のときに句読点や括弧が崩れないか
node tests/split_export.js        # 言語別の書き出し（pandoc があれば pandoc でも組む）
node tests/locator.js             # 引用箇所（頁・章・節）の組み方
bash tests/browser/run_all.sh     # ヘッドレスの Chrome で画面を操作する検証
```

- `src/` がアプリの本体、`vendor/` が同梱物（citeproc-js と CSL のロケール）です。`docs/index.html` は `build.py` で作るもので、GitHub Pages はここを公開します。直したら組み直してコミットしてください。
- 画面の検証には puppeteer-core と Google Chrome が要ります。場所は環境変数 `PUPPETEER_CORE`・`CHROME` で指定でき、無ければ自動で探します。

## ライセンス

- このアプリ：[AGPL-3.0](LICENSE)
- 組版エンジン [citeproc-js](https://github.com/Juris-M/citeproc-js) 2.4.63：© 2009-2019 Frank Bennett、CPAL 1.0 または AGPL 3.0（[vendor/LICENSE](vendor/LICENSE)）
- CSL のロケール（`vendor/locales-*.xml`）：[CSL プロジェクト](https://github.com/citation-style-language/locales)、CC BY-SA 3.0
- アプリで書き出した .csl の `<rights>` の初期値は CC BY-SA 3.0 です。

## 作成

2026年、Ayano KOKAZE。作成には Anthropic の Claude Code を用いました。
