#!/usr/bin/env python3
"""src/ と vendor/ を1枚の HTML にまとめ、docs/index.html（GitHub Pages で公開する場所）に書き出す。

    python3 build.py [出力先]

既定の出力先は docs/index.html（GitHub Pages で公開する場所）。
ネットにつながなくても動くよう、citeproc-js・ロケール・見本の書誌をすべて埋め込む。
"""
import base64
import datetime
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
VENDOR = HERE / "vendor"
DEFAULT_OUT = HERE / "docs" / "index.html"


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def script(code: str, comment: str = "") -> str:
    # 埋め込んだ JS の中の </script が HTML の終わりと誤読されないようにする。
    code = re.sub(r"</(script)", r"<\\/\1", code, flags=re.I)
    head = f"/* {comment} */\n" if comment else ""
    return f"<script>\n{head}{code}\n</script>"


def comment_block(text: str) -> str:
    return "/*\n" + text.replace("*/", "* /") + "\n*/"


def markdown_html(md: str) -> str:
    """CHANGELOG.md を HTML にする。使う書き方は、見出し（## ###）・箇条書き（2段まで）・段落・
    **太字**・`コード`・[リンク](URL) だけ。いちばん上の見出し（# 更新履歴）は画面の見出しと重なるので外す。"""
    def inline_md(t: str) -> str:
        t = html_escape(t)
        t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
        t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
        t = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', t)
        return t

    out, depth, para = [], 0, []

    def close_lists(to: int) -> None:
        nonlocal depth
        while depth > to:
            out.append("</li></ul>")
            depth -= 1

    def flush_para() -> None:
        if para:
            out.append("<p>" + inline_md(" ".join(para)) + "</p>")
            para.clear()

    for line in md.splitlines():
        item = re.match(r"^( *)- (.*)$", line)
        if line.startswith("# "):
            continue
        if line.startswith("## ") or line.startswith("### "):
            flush_para(); close_lists(0)
            tag = "h3" if line.startswith("## ") else "h4"
            text = re.sub(r"^\[(.+?)\] - ", r"v\1　", line.lstrip("# "))
            out.append(f"<{tag}>{inline_md(text)}</{tag}>")
        elif item:
            flush_para()
            level = len(item.group(1)) // 2 + 1
            if level > depth:
                while depth < level:
                    out.append("<ul><li>")
                    depth += 1
            else:
                close_lists(level)
                out.append("</li><li>")
            out.append(inline_md(item.group(2)))
        elif not line.strip():
            flush_para()
        else:
            close_lists(0)
            para.append(line.strip())
    flush_para(); close_lists(0)
    return "\n".join(out)


def html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build(out: Path) -> None:
    html = read(SRC / "index.html")

    def inline(m: re.Match) -> str:
        name = m.group(1)
        body = read(SRC / name)
        if name.endswith(".css"):
            return f"<style>\n{body}\n</style>"
        return script(body, f"src/{name}")

    html = re.sub(r"<!-- @inline (\S+) -->", inline, html)
    # アプリのアイコン（src/icon.svg）。タブのアイコンと、上の帯のアプリ名の前に置く。
    icon = "data:image/svg+xml;base64," + base64.b64encode((SRC / "icon.svg").read_bytes()).decode("ascii")
    html = html.replace("<!-- @icon link -->", f'<link rel="icon" type="image/svg+xml" href="{icon}">')
    html = html.replace("<!-- @icon img -->", f'<img class="brand-icon" src="{icon}" alt="" width="22" height="22">')
    # 版と公開日は CHANGELOG.md のいちばん上の版から取る。更新履歴の画面の中身も、同じファイルから作る。
    # 組んだ日付も残す（HTML だけを配ったとき、手元のものが古いかを見分けられるように）。
    changelog = read(HERE / "CHANGELOG.md")
    m = re.search(r"^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})", changelog, re.M)
    if not m:
        sys.exit("CHANGELOG.md に「## [0.1.0] - 2026-11-13」の形の版が見つかりません")
    html = html.replace("<!-- @version -->", m.group(1))
    html = html.replace("<!-- @released -->", m.group(2))
    html = html.replace("<!-- @built -->", datetime.date.today().isoformat())
    html = html.replace("<!-- @changelog -->", markdown_html(changelog))

    lic = read(VENDOR / "LICENSE")
    citeproc = read(VENDOR / "citeproc_commonjs.js")
    # CommonJS の形（末尾が module.exports = CSL）をブラウザで包む。
    wrapped = (
        comment_block("citeproc-js 2.4.63 (https://github.com/Juris-M/citeproc-js)\n\n" + lic)
        + "\n(function () {\nvar module = { exports: {} };\nvar exports = module.exports;\n"
        + citeproc
        + "\nwindow.CSL = module.exports;\n})();"
    )
    html = html.replace("<!-- @vendor citeproc -->", script(wrapped))

    # ja・en と、言語ごとの書式に使う欧文の主な言語（Zotero 10.0.7 同梱のものを vendor/ に置いた）。
    locales = {
        f.stem.removeprefix("locales-"): read(f) for f in sorted(VENDOR.glob("locales-*.xml"))
    }
    samples = json.loads(read(SRC / "samples.json"))
    data = (
        comment_block("CSL locales (https://github.com/citation-style-language/locales), CC BY-SA 3.0")
        + "\nwindow.CSL_LOCALES = " + json.dumps(locales, ensure_ascii=False) + ";\n"
        + "window.CSL_SAMPLES = " + json.dumps(samples, ensure_ascii=False) + ";"
    )
    html = html.replace("<!-- @data -->", script(data))

    leftover = re.findall(r"<!-- @\S+[^>]*-->", html)
    if leftover:
        sys.exit(f"埋め込めなかった目印があります: {leftover}")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out}  {out.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT)
