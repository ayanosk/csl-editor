// 公式のスタイル（Zotero のスタイル一覧などの .csl）を読み込み、出力を見ながら手直しする仕組み（window.CSLOfficial）。
// ブラウザでも node でも動く。DOM には頼らない。
//
// 要点
// - 元の CSL を小さな木にして持つ。目印を付ける要素（text・names・date・number・label・group・layout）には、
//   文書の中の順番で番号（ord、目印用）を振る。すべての要素には別の通し番号（eid）も振り、
//   手を入れた箇所は eid を宛先にした編集の一覧として持ち、
//   表示のたびに元の木の写しに当て直す。元の CSL はいつでも手付かずで残る。
// - どの文字がどの要素から出たかは、各要素の prefix・suffix に私用領域の目印（開き・閉じ）を仕込んで組み、
//   目印の入れ子から求める。目印が挟まると句読点の処理（引用符の内側に入れるなど）が崩れるので、
//   表示には常に目印なしの出力を使い、目印付きの出力とは文字単位で突き合わせる（LCS）だけにする。
(function (root) {
  'use strict';

  const MARKABLE = new Set(['text', 'names', 'date', 'number', 'label', 'group', 'layout']);
  const OPEN = 0xE000, MAXN = 3200, CLOSE = OPEN + MAXN;
  const isMark = (c) => c >= OPEN && c < OPEN + 2 * MAXN;

  // ---- XML を木にする --------------------------------------------------------------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function unescape(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }
  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function parse(xml) {
    const top = { type: 'root', children: [] };
    const stack = [top];
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    let m, last = 0, ord = 0, eid = 0;
    const cur = () => stack[stack.length - 1];
    while ((m = re.exec(xml))) {
      if (m.index > last) cur().children.push({ type: 'raw', text: xml.slice(last, m.index) });
      last = re.lastIndex;
      if (m[1]) { // 閉じタグ
        if (stack.length > 1) stack.pop();
        continue;
      }
      if (!m[2]) { cur().children.push({ type: 'raw', text: m[0] }); continue; } // コメントなど
      const attrs = [];
      (m[3] || '').replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (a, n, v1, v2) => { attrs.push([n, unescape(v1 !== undefined ? v1 : v2)]); });
      const el = { type: 'el', tag: m[2], attrs, children: [], self: !!m[4], parent: cur(), eid: eid++ };
      // info・locale・sort の中は、出力の部品ではないので番号を振らない
      const inside = stack.some((s) => s.type === 'el' && /^(info|locale|sort)$/.test(s.tag));
      if (MARKABLE.has(el.tag) && !inside) el.ord = ord++;
      cur().children.push(el);
      if (!el.self) stack.push(el);
    }
    if (last < xml.length) top.children.push({ type: 'raw', text: xml.slice(last) });
    top.count = ord;
    return top;
  }
  function serialize(node) {
    if (node.type === 'raw') return node.text;
    if (node.type === 'root') return node.children.map(serialize).join('');
    const a = node.attrs.map(([n, v]) => ` ${n}="${escAttr(v)}"`).join('');
    if (node.self && !node.children.length) return `<${node.tag}${a}/>`;
    return `<${node.tag}${a}>${node.children.map(serialize).join('')}</${node.tag}>`;
  }
  function clone(node, parent) {
    if (node.type === 'raw') return { type: 'raw', text: node.text };
    const c = { type: node.type, tag: node.tag, attrs: node.attrs ? node.attrs.map((x) => x.slice()) : undefined, self: node.self, ord: node.ord, eid: node.eid, count: node.count, parent, children: [] };
    c.children = node.children.map((ch) => clone(ch, c));
    return c;
  }
  function index(tree) {
    const byOrd = [];
    (function walk(n) { if (n.type === 'el' && n.ord !== undefined) byOrd[n.ord] = n; (n.children || []).forEach(walk); })(tree);
    return byOrd;
  }
  function indexEid(tree) {
    const byEid = [];
    (function walk(n) { if (n.type === 'el') byEid[n.eid] = n; (n.children || []).forEach(walk); })(tree);
    return byEid;
  }
  // まとまり group の中で、el（実行時にその内側にあった要素）を含む直下の子。条件分岐をまたいでさかのぼる。
  // マクロの呼び出しをまたぐ場合は、組んだときの入れ子（path）の中で group のすぐ内側の要素を el に渡す。
  function unitIn(group, el) {
    let u = el;
    while (u && u.parent && u.parent !== group) u = u.parent;
    return u && u.parent === group ? u : null;
  }
  const getAttr = (el, n) => { const a = el.attrs.find((x) => x[0] === n); return a ? a[1] : undefined; };
  function setAttr(el, n, v) {
    const k = el.attrs.findIndex((x) => x[0] === n);
    if (v === null || v === undefined || v === '') { if (k >= 0) el.attrs.splice(k, 1); return; }
    if (k >= 0) el.attrs[k][1] = v; else el.attrs.push([n, v]);
  }

  // ---- 編集の一覧を当てる ------------------------------------------------------------
  // { e: eid, op: 'attr', name, value }   属性を変える（value が空なら外す）
  // { e: eid, op: 'delete' }              その部品を出さない（要素ごと外す）
  // { e: eid, op: 'move', dir: -1 | 1 }   同じ親の中で、前後の要素と入れ替える
  // { e: eid, op: 'swap', with: eid }     同じ親の中の2つの要素を入れ替える（間に何も出さない分岐が挟まっていてもよい）
  function apply(base, edits) {
    const t = clone(base, null);
    const byEid = indexEid(t);
    for (const e of edits || []) {
      const el = byEid[e.e];
      if (!el || !el.parent) continue;
      if (e.op === 'attr') setAttr(el, e.name, e.value);
      else if (e.op === 'delete') {
        const sib = el.parent.children;
        const k = sib.indexOf(el);
        if (k >= 0) sib.splice(k, 1);
      } else if (e.op === 'move') {
        const sib = el.parent.children;
        const els = sib.filter((x) => x.type === 'el');
        const k = els.indexOf(el), j = k + e.dir;
        if (k < 0 || j < 0 || j >= els.length) continue;
        const a = sib.indexOf(els[k]), b = sib.indexOf(els[j]);
        sib[a] = els[j]; sib[b] = els[k];
      } else if (e.op === 'swap') {
        const other = byEid[e.with];
        if (!other || other.parent !== el.parent) continue;
        const sib = el.parent.children;
        const a = sib.indexOf(el), b = sib.indexOf(other);
        sib[a] = other; sib[b] = el;
      }
    }
    return t;
  }

  // ---- 目印 ------------------------------------------------------------------------
  function instrument(tree) {
    const t = clone(tree, null);
    index(t).forEach((el) => {
      if (!el || el.ord >= MAXN) return;
      setAttr(el, 'prefix', String.fromCharCode(OPEN + el.ord) + (getAttr(el, 'prefix') || ''));
      setAttr(el, 'suffix', (getAttr(el, 'suffix') || '') + String.fromCharCode(CLOSE + el.ord));
    });
    return t;
  }
  const strip = (s) => [...s].filter((ch) => !isMark(ch.charCodeAt(0))).join('');

  // 目印付きの文字列 → 目に見える各文字と、それを包む要素の番号の並び（外から内へ）
  function attribute(s) {
    const stack = [], chars = [];
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c >= OPEN && c < CLOSE) stack.push(c - OPEN);
      else if (c >= CLOSE && c < CLOSE + MAXN) { const k = stack.lastIndexOf(c - CLOSE); if (k >= 0) stack.splice(k); }
      else chars.push({ ch, path: stack.slice() });
    }
    return chars;
  }
  // 元の文字列の各文字に、目印付きの文字の path を LCS で対応づける。対応の付かない文字は前（無ければ後ろ）に寄せる。
  function align(text, mchars) {
    const a = [...text], b = mchars, n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j].ch ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const path = new Array(n);
    let i = 0, j = 0, direct = 0;
    while (i < n && j < m) {
      if (a[i] === b[j].ch) { path[i] = b[j].path; i++; j++; direct++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    for (let k = 0; k < n; k++) if (!path[k]) path[k] = k > 0 ? path[k - 1] : (path.find(Boolean) || []);
    return { path, direct, n };
  }

  // HTML の文字列を、タグと文字（実体参照をほどいたもの）に分ける
  function htmlParts(html) {
    const parts = [];
    String(html).replace(/<[^>]*>|[^<]+/g, (t) => { parts.push(t[0] === '<' ? { tag: t } : { text: unescape(t) }); return t; });
    return parts;
  }
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 目印なしの HTML の文字を、要素ごとの <span class="cslseg" data-n="番号" data-path="外,…,内"> で包む
  function decorate(cleanHtml, markedHtml) {
    const clean = htmlParts(cleanHtml);
    const mtext = htmlParts(markedHtml).filter((p) => p.text !== undefined).map((p) => p.text).join('');
    const ctext = clean.filter((p) => p.text !== undefined).map((p) => p.text).join('');
    const al = align(ctext, attribute(mtext));
    let pos = 0;
    const out = clean.map((p) => {
      if (p.tag !== undefined) return p.tag;
      const chars = [...p.text];
      let html = '', run = '', runPath = null;
      const flush = () => {
        if (!run) return;
        const inner = runPath && runPath.length ? runPath[runPath.length - 1] : '';
        html += inner === '' ? escHtml(run) : `<span class="cslseg" data-n="${inner}" data-path="${runPath.join(',')}">${escHtml(run)}</span>`;
        run = '';
      };
      for (const ch of chars) {
        const pth = al.path[pos++] || [];
        if (runPath === null || pth.join(',') !== runPath.join(',')) { flush(); runPath = pth; }
        run += ch;
      }
      flush();
      return html;
    });
    return { html: out.join(''), direct: al.direct, total: al.n };
  }

  // ---- 組む ------------------------------------------------------------------------
  // 1つの CSL で、文献ごとに参考文献と引用（注形式なら初出と2回目以降）を組む。
  function renderRows(CSL, xml, items, retrieveLocale, lang, loc) {
    loc = loc || { label: 'page', value: '42' };
    const num = /^\d+$/.test(loc.value);
    const far = num ? String(+loc.value + 8) : loc.value;
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => byId[id] }, xml, lang || 'en-US', false);
    e.setOutputFormat('html');
    e.updateItems(items.map((i) => i.id));
    const bib = {};
    const hasBib = /<bibliography[\s>]/.test(xml);
    if (hasBib) {
      const r = e.makeBibliography();
      if (r) r[0].entry_ids.forEach((ids, k) => { bib[ids[0]] = r[1][k].replace(/^\s*<div class="csl-entry">/, '').replace(/<\/div>\s*$/, '').trim(); });
    }
    const note = /<style[^>]*\sclass="note"/.test(xml);
    const out = {};
    for (const it of items) {
      const rows = [];
      if (hasBib) rows.push(['bib', '参考文献', bib[it.id] || '']);
      if (note) {
        const other = (items.find((x) => x.id !== it.id) || {}).id;
        const seq = [[it.id, loc.value, loc.label]];
        if (other) seq.push([other, '10', 'page'], [it.id, far, loc.label]);
        const cits = seq.map(([x, v, lab], k) => ({ citationID: 'q' + k, citationItems: [{ id: x, locator: v, label: lab }], properties: { noteIndex: k + 1 } }));
        const res = Object.fromEntries(e.rebuildProcessorState(cits, 'html').map(([cid, , s]) => [cid, s]));
        rows.push(['cite', '注（初出）', res.q0]);
        if (other) rows.push(['citeSub', '注（2回目以降）', res.q2]);
      } else {
        rows.push(['cite', '本文中の引用', e.makeCitationCluster([{ id: it.id, locator: loc.value, label: loc.label }])]);
      }
      out[it.id] = rows;
    }
    return { rows: out, note, hasBib };
  }

  // 元の木と編集の一覧から、目印なし・目印付きの両方で組み、表示用の HTML を作る。
  function build(CSL, base, edits, items, retrieveLocale, loc) {
    const tree = apply(base, edits);
    const xml = serialize(tree);
    const lang = (xml.match(/default-locale="([^"]+)"/) || [])[1] || 'en-US';
    const clean = renderRows(CSL, xml, items, retrieveLocale, lang, loc);
    const marked = renderRows(CSL, serialize(instrument(tree)), items, retrieveLocale, lang, loc);
    let direct = 0, total = 0;
    const view = {};
    for (const it of items) {
      view[it.id] = clean.rows[it.id].map(([k, label, html], r) => {
        const d = decorate(html || '', marked.rows[it.id][r][2] || '');
        direct += d.direct; total += d.total;
        return { key: k, label, html: d.html, plain: html };
      });
    }
    return { xml, tree, view, note: clean.note, hasBib: clean.hasBib, direct, total };
  }

  // ---- 要素の説明（画面に出す） ----------------------------------------------------------
  const VAR_JA = {
    author: '著者', editor: '編者', translator: '訳者', 'container-author': '収録書の著者', 'collection-editor': '叢書の編者', composer: '著者など', director: '監督',
    title: '題名', 'title-short': '短い題名', 'container-title': '掲載誌名・収録書名', 'container-title-short': '掲載誌の略称', 'collection-title': '叢書名',
    publisher: '出版者', 'publisher-place': '出版地', issued: '発行年月日', accessed: '参照日', URL: 'URL', DOI: 'DOI', page: '掲載頁', locator: '引用頁',
    volume: '巻', issue: '号', edition: '版', 'number-of-pages': '総頁数', 'number-of-volumes': '総巻数', genre: '種別', medium: '媒体', 'citation-number': '番号',
    'year-suffix': '年の添え字', status: '刊行状況', note: 'メモ', ISBN: 'ISBN', ISSN: 'ISSN',
  };
  const TAG_JA = { text: '文字', names: '名前', date: '日付', number: '数', label: 'ラベル', group: 'まとまり', layout: '全体' };
  function varLabel(v) { return String(v).split(/\s+/).map((x) => VAR_JA[x] || x).join('・'); }
  function describe(el) {
    if (!el) return '';
    const v = getAttr(el, 'variable');
    if (el.tag === 'names') return v ? varLabel(v) + '（名前）' : '名前';
    if (el.tag === 'label') return v ? `${varLabel(v)}のラベル（p. や ed. など）` : 'ラベル';
    if (el.tag === 'date') return v ? varLabel(v) : '日付';
    if (el.tag === 'group') {
      const d = getAttr(el, 'delimiter'), pre = getAttr(el, 'prefix') || '', suf = getAttr(el, 'suffix') || '';
      if (d) return `まとまり（区切り「${d}」）`;
      if (pre || suf) return `まとまり（${pre}…${suf}）`;
      return 'まとまり';
    }
    if (el.tag === 'layout') return el.parent && el.parent.tag === 'bibliography' ? '参考文献の全体' : '引用の全体';
    if (el.tag === 'text' || el.tag === 'number') {
      if (v) return varLabel(v);
      const mc = getAttr(el, 'macro'); if (mc) return `部品のまとまり（${mc}）`;
      const tm = getAttr(el, 'term'); if (tm) return `決まった語（${tm}）`;
      const val = getAttr(el, 'value'); if (val !== undefined) return `文字「${val}」`;
    }
    return TAG_JA[el.tag] || el.tag;
  }
  // その要素が入っているマクロの名前（無ければ null）
  function macroOf(el) {
    for (let p = el && el.parent; p; p = p.parent) if (p.type === 'el' && p.tag === 'macro') return getAttr(p, 'name');
    return null;
  }

  // ---- 書き出し ----------------------------------------------------------------------
  // 名前と ID を差し替え、元のスタイルを template として記録する（CC BY-SA の表示を保つ）。
  function finalize(xml, info) {
    const origId = (xml.match(/<id>([^<]*)<\/id>/) || [])[1];
    let out = xml.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(info.title)}</title>`)
      .replace(/<id>[^<]*<\/id>/, `<id>${escHtml(info.id)}</id>`)
      .replace(/<updated>[^<]*<\/updated>/, `<updated>${info.updated}</updated>`);
    if (origId && origId !== info.id && !/rel="template"/.test(out)) {
      out = out.replace(/(<id>[^<]*<\/id>)/, `$1\n    <link href="${escHtml(origId)}" rel="template"/>`);
    }
    // 自分で作った別名（title-short）は元の名前を指してしまうので外す
    out = out.replace(/\s*<title-short>[^<]*<\/title-short>/, '');
    return out;
  }
  function isCsl(text) { return /<style[\s>][\s\S]*xmlns="http:\/\/purl\.org\/net\/xbiblio\/csl"/.test(text); }
  const titleOf = (xml) => unescape((xml.match(/<title>([^<]*)<\/title>/) || [])[1] || '');

  const api = { parse, serialize, apply, instrument, strip, attribute, align, decorate, renderRows, build, describe, macroOf, getAttr, finalize, isCsl, titleOf, index, indexEid, unitIn, MAXN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CSLOfficial = api;
})(typeof window !== 'undefined' ? window : this);
