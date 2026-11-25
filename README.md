# 引用スタイル（CSL）編集アプリ（β版）

日本語の画面で部品（チップ）を並べて、引用スタイル（CSL）を作るアプリです。作ったスタイルは Zotero などに入れて、注や参考文献の書き方として使えます。

**アプリを開く：https://ayanosk.github.io/csl-editor/**

画面の図つきの使い方：https://ayanosk.github.io/csl-editor/guide/

1枚の HTML で動き、インストールは要りません。ネットにつながっていなくても動くので、[docs/index.html](docs/index.html) をダウンロードして開いても使えます。

*A browser-based editor for building CSL citation styles by arranging field chips, with separate formats for Japanese and Western-language references. The interface is in Japanese.*

## できること

- **公式のスタイルを手直しする**：Zotero のスタイル一覧からダウンロードした .csl（Chicago など）を読み込んで直せます。
  - **微調整**：プレビューの出力で直したい箇所を押して、前後の文字・区切り・斜体などを直したり、出さないようにしたり、並びを入れ替えたりできます。手を入れていない部分は元のまま残り、直すと影響する範囲（参考文献と注の両方など）も示します。
  - **大幅修正**：元のスタイルを部品（チップ）に移し、型から組むときと同じように、資料の種類ごとに部品を足したり並べ替えたりできます。和文の書式も入るので、多言語版にできます。元のスタイルと出力が違う見本は一覧で示します。元のスタイルの作者・ライセンスの表示は保ち、元のスタイルを template として記録します。
- Chicago 風・APA 風・MLA 風・IEEE 風の4つの型から始めて、図書・本の章・雑誌論文・ウェブページなどの資料の種類ごとに、参考文献と注（または本文中の引用）の並びを作れます。
- 和文と欧文（と足した言語）で、別々の書き方を持てます。中国語（大陸式・台湾式）・韓国語・ロシア語・フランス語・ドイツ語・アラビア語・イタリア語・スペイン語・トルコ語は、その言語の人文学の論文で一般的な書き方を既定として選んで足せます。どちらで組むかは、Zotero の「言語」欄で決まります。Zotero（Word・Google ドキュメントのプラグイン）でも、LaTeX の citation-style-language（citeproc-lua）でも、この書き分けが効きます。
- Zotero から書き出した書誌（CSL JSON）を読み込むと、自分の文献でプレビューできます。いまの文献と置き換えるか足すか、どの言語の文献を入れるかを選べます。読み込まなければ見本の書誌で試せ、中国語・韓国語・ロシア語などの見本も言語ごとに足せます。
- 縦書き向けに、巻・号・頁・引用箇所を漢数字にできます（発行年は CSL の仕組み上できません）。プレビューを縦書きに切り替えて見られます。
- 2回目以降の注（同上、前掲書、短縮形）を書き分けられます。
- 和文の文献を、Zotero の「その他（Extra）」欄の1行目に入れた読みで、五十音順に並べられます。

## 4つの型について

各スタイルの典型的な形を簡略に再現した出発点です。公式のスタイルではなく、各団体とは関係ありません。規定どおりかは、それぞれの規定で確かめてください。APA 風の型は、本文中の引用では著者が3人以上なら et al.、参考文献では20人まで全員を書きます（人名の設定の「本文中の引用では別の人数にする」）。

## 書き出しは2種類

| | 多言語版 | 言語別 |
|:---|:---|:---|
| 中身 | 1つのスタイルで、和文と欧文を書き分ける | 書式ごとに1つずつのスタイル（2つ以上なら zip） |
| 使えるソフト | Zotero（Word・Google ドキュメントのプラグイン）、LaTeX の citation-style-language（citeproc-lua）など、CSL-M の言語別のレイアウトを読むもの | pandoc など、標準の CSL 1.0.2 を読むもの全般 |
| 和文と欧文が混ざった文献リスト | 正しく組める | 組めない（全部の文献を同じ書式で組む） |
| 書き分けの決め手 | 文献の「言語」欄（`ja` なら和文、`en` `fr` `de` などなら欧文、空なら和文） | なし |
| Zotero に入れるとき | 「有効な CSL 1.0.2 ではない」と確認が出る場合がある。OK で入れられる | 確認は出ない |

## スタイル名

型から始めたときのスタイル名は My_Chicago_style のようになります。前に書き出した .csl を読み込むと、ファイル名に _edited を付けた名前になり、ID も新しくなります（Zotero では元のスタイルと別に入ります。_edited の付いたものをもう一度読み込んで直したときは、名前も ID もそのままなので、Zotero では同じスタイルの更新になります）。

## データの扱い

読み込んだ書誌や .csl は、ブラウザの中だけで処理します。外部には送信しません。作業中の状態は、そのブラウザの中（localStorage）に保存されます。

## β版について

画面や出力は予告なく変わることがあります。書き出したスタイルは、最後に Zotero などで確かめてください。不具合や気づいたことは [Issues](https://github.com/ayanosk/csl-editor/issues) へどうぞ。版ごとの変更は [CHANGELOG.md](CHANGELOG.md)（アプリではフッターの版を押すと開く「更新履歴」）に記録しています。

## 開発

```bash
python3 build.py                  # src/ と vendor/ を docs/index.html にまとめる
node tests/roundtrip.js           # 書き出し → 読み戻しの一致
node tests/empty_fields.js        # 欄が空のときに句読点や括弧が崩れないか
node tests/split_export.js        # 言語別の書き出し（pandoc があれば pandoc でも組む）
node tests/locator.js             # 引用箇所（頁・章・節）の組み方
node tests/official.js            # 公式のスタイルの手直し（書き戻し・文字の対応・編集の効き目・書き出し）
node tests/convert.js             # 公式のスタイルを部品に移す（大幅修正）：組み直した出力が元と同じか
node tests/reading_sort.js        # 読みで五十音順に並べる（Extra 欄の1行目。欧文は著者名）
node tests/archive.js             # 一次史料の部品：原稿・文書・手紙のタブを足したときの並び
node tests/etal_split.js           # 注（本文中の引用）だけ別の人数で et al. にする・何人でも全員書く
node tests/volumes.js             # 総巻数の部品（全5巻・5 vols.）と、用語「巻（複数）」の補い
node tests/lang_copy.js           # 言語を足すときの写す元（いまの書式・既定の書式）と、引用箇所の頁の語の一括設定
bash tests/browser/run_all.sh     # ヘッドレスの Chrome で画面を操作する検証
```

- `src/` がアプリの本体、`vendor/` が同梱物（citeproc-js と CSL のロケール）です。`docs/index.html` は `build.py` で作るもので、GitHub Pages はここを公開します。直したら組み直してコミットしてください。
- 使い方のページ `docs/guide/index.html` は、そのファイルが正本です（組む手順はありません）。画面の図は `docs/guide/img/` にあり、`node guide/shoot.js` で撮り直せます（先に `python3 build.py`）。
- 版を上げるときは、[CHANGELOG.md](CHANGELOG.md) のいちばん上に `## [0.2.0] - 2026-12-01` の形で版を足し、追加・変更・修正を書いてから `build.py` で組み直します。フッターの版と公開日、アプリの「更新履歴」は、ここから作られます。
- 画面の検証には puppeteer-core と Google Chrome が要ります。場所は環境変数 `PUPPETEER_CORE`・`CHROME` で指定でき、無ければ自動で探します。

## ライセンス

- このアプリ：[AGPL-3.0](LICENSE)
- 組版エンジン [citeproc-js](https://github.com/Juris-M/citeproc-js) 2.4.63：© 2009-2019 Frank Bennett、CPAL 1.0 または AGPL 3.0（[vendor/LICENSE](vendor/LICENSE)）
- CSL のロケール（`vendor/locales-*.xml`）：[CSL プロジェクト](https://github.com/citation-style-language/locales)、CC BY-SA 3.0
- アプリで書き出した .csl の `<rights>` の初期値は CC BY-SA 3.0 です。

## 作成

2026年、Ayano KOKAZE。作成には Anthropic の Claude Code を用いました。
