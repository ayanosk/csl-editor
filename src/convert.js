// 公式のスタイルを、型から組む画面のチップ（内部モデル）に移す（window.CSLConvert）。ブラウザでも node でも動く。
//
// 要点
// - 公式のスタイルで、資料の種類ごとの見本を組み（参考文献・注・2回目以降の注・直前と同じ文書）、
//   どの文字がどの要素から出たかを目印でたどる（official.js と同じ仕組み）。
// - 変数を持つ要素（text・number・date・names・label）を部品のチップにする。同じ変数のラベルと値は1つの部品にまとめる。
// - 部品が1つだけのまとまり（group・マクロ）は、まとまりの前後の文字ごと、その部品の前後の文字にする（「In 」書名、「(」年「)」）。
//   部品が2つ以上のまとまりで、前後に文字があるものは〔 〕のまとまりにする。部品の間の文字は区切りのチップにする。
// - 部品の無いまとまり（Ibid. など）は「任意の文字」にする。チップに無い変数（ISBN など）は外し、報告に挙げる。
// - 欧文の書式だけを移す。和文の書式は、公式のスタイルの示し方（注・著者年・番号・著者頁）に合う型から入れる。
// - 移したあと組み直した出力と、元の出力を見本ごとに比べ、一致の度合いを返す。
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const O = isNode ? require('./official.js') : root.CSLOfficial;
  const G = isNode ? require('./csl_generate.js') : root.CSLGen;
  const ST = isNode ? require('./starters.js') : root.CSLStarters;

  const F = (f, o = {}) => ({ t: 'field', f, prefix: o.prefix || '', suffix: o.suffix || '', wrap: o.wrap || 'none', italic: !!o.italic, caps: o.caps || 'none', opt: o.opt || {} });
  const S = (v) => ({ t: 'sep', v });
  const getAttr = O.getAttr;
  // 子の要素を名前で探す（無ければ undefined）
  const child = (el, tag) => el && el.children.find((x) => x.type === 'el' && x.tag === tag);

  // 変数 → チップの部品。form は短い形。
  const VAR_FIELD = {
    'title-short': ['title', 'short'], 'container-title-short': ['container-title', 'short'],
  };
  function fieldOf(v) {
    if (VAR_FIELD[v]) return VAR_FIELD[v];
    if (G.FIELDS[v] && v !== 'literal') return [v, ''];
    return null;
  }
  // 示し方 → 和文の書式を借りる型
  const STARTER_OF = { note: 'chicago', 'author-date': 'apa', numeric: 'ieee', author: 'mla' };
  function kindOf(xml) {
    if (/<style[^>]*\sclass="note"/.test(xml)) return 'note';
    const f = (xml.match(/citation-format="([^"]+)"/) || [])[1];
    if (f === 'author-date' || f === 'author') return f;
    return 'numeric';
  }

  // 見本：種類ごとに1件（著者2名）。「その他」は報告書を組む。比べるための相手（other）も置く。
  const OTHER_ITEM = { id: 'cv-other', type: 'report', language: 'en', title: 'Counting the Parish', author: [{ family: 'Dubois', given: 'Léa' }, { family: 'Moreau', given: 'Jules' }], publisher: 'Example Institute', 'publisher-place': 'Paris', issued: { 'date-parts': [[2018]] } };
  const PICK = { book: 's-en-book-2', chapter: 's-en-chapter-2', article: 's-en-article-2', web: 's-en-web-2' };
  function samplesFor(items) {
    const out = {};
    for (const [tab, id] of Object.entries(PICK)) { const it = items.find((x) => x.id === id); if (it) out[tab] = it; }
    // 雑誌論文には DOI を足して組む（見本に無い欄は部品に移らないため。DOI の無い文献では、その部品は消える）
    if (out.article) out.article = { ...out.article, DOI: out.article.DOI || '10.1234/example.2021.4' };
    out.other = OTHER_ITEM;
    return out;
  }

  // ---- 組む（参考文献・注・2回目以降・直前と同じ文書） ------------------------------------
  // 返り値：{ [id]: { bib, cite, citeSub, citeIbid } } の HTML
  function renderAll(CSL, xml, items, retrieveLocale, note) {
    const lang = (xml.match(/default-locale="([^"]+)"/) || [])[1] || 'en-US';
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const mk = () => {
      const e = new CSL.Engine({ retrieveLocale, retrieveItem: (id) => byId[id] }, xml, lang, false);
      e.setOutputFormat('html'); e.updateItems(items.map((i) => i.id));
      return e;
    };
    const out = {};
    const e = mk();
    const bib = {};
    if (/<bibliography[\s>]/.test(xml)) {
      const r = e.makeBibliography();
      if (r) r[0].entry_ids.forEach((ids, k) => { bib[ids[0]] = r[1][k].replace(/^\s*<div class="csl-entry">/, '').replace(/<\/div>\s*$/, '').trim(); });
    }
    for (const it of items) {
      const other = items.find((x) => x.id !== it.id).id;
      const o = { bib: bib[it.id] || '' };
      if (note) {
        const seq = [[it.id, '42'], [it.id, '45'], [other, '10'], [it.id, '50']];
        const cits = seq.map(([x, v], k) => ({ citationID: 'q' + k, citationItems: [{ id: x, locator: v, label: 'page' }], properties: { noteIndex: k + 1 } }));
        const res = Object.fromEntries(mk().rebuildProcessorState(cits, 'html').map(([cid, , s]) => [cid, s]));
        Object.assign(o, { cite: res.q0, citeIbid: res.q1, citeSub: res.q3 });
      } else {
        o.cite = mk().makeCitationCluster([{ id: it.id, locator: '42', label: 'page' }]);
      }
      out[it.id] = o;
    }
    return out;
  }

  // HTML → 文字ごとに、斜体の中かどうか
  function htmlChars(html) {
    const chars = [];
    const stack = [];
    let italic = 0;
    String(html).replace(/<[^>]*>|[^<]+/g, (t) => {
      if (t[0] === '<') {
        if (t[1] === '/') { if (stack.pop()) italic--; } else if (!/\/>$/.test(t)) { const i = /^<i\b/.test(t); stack.push(i); if (i) italic++; }
        return t;
      }
      for (const ch of t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m) => decode(m))) chars.push({ ch, i: italic > 0 });
      return t;
    });
    return chars;
  }
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decode(m) {
    const e = m.slice(1, -1);
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENT[e] !== undefined ? ENT[e] : m;
  }
  function plain(html) { return htmlChars(html).map((c) => c.ch).join(''); }

  // 目印なしの HTML と目印付きの HTML → 文字ごとの { ch, path, i }
  function tokens(cleanHtml, markedHtml) {
    const chars = htmlChars(cleanHtml);
    const text = chars.map((c) => c.ch).join('');
    const mtext = htmlChars(markedHtml).map((c) => c.ch).join('');
    const al = O.align(text, O.attribute(mtext));
    return chars.map((c, k) => ({ ...c, path: al.path[k] || [] }));
  }

  // ---- 文字の並び → 入れ子 ------------------------------------------------------------
  // path の depth 番目の要素ごとにまとめる。その深さに要素が無い文字は、その要素自身の文字（前後の文字・区切り）。
  function nest(toks, depth) {
    const out = [];
    for (const t of toks) {
      const o = t.path[depth];
      const last = out[out.length - 1];
      if (o === undefined) {
        if (last && last.lit !== undefined) { last.lit += t.ch; last.toks.push(t); } else out.push({ lit: t.ch, toks: [t] });
      } else if (last && last.ord === o) last.toks.push(t);
      else out.push({ ord: o, toks: [t] });
    }
    for (const n of out) if (n.ord !== undefined) n.depth = depth;
    return out;
  }
  // 変数を持つ要素なら、その変数。names variable="editor translator" のように複数あるときは、
  // いま組んでいる見本に値がある変数を選ぶ（無ければ、チップに移せる最初の変数）。
  // いま読み取っている見本・書く場所・木（convert の中で1行ごとに入れ替える）
  const cur = { item: null, place: '', tree: null };
  const hasValue = (v) => { const x = cur.item && cur.item[(VAR_FIELD[v] || [v])[0]]; return x !== undefined && x !== '' && !(Array.isArray(x) && !x.length); };
  const fieldVar = (el) => {
    if (!el || !/^(text|number|date|names|label)$/.test(el.tag)) return null;
    const v = getAttr(el, 'variable');
    if (!v) return null;
    const vs = v.split(/\s+/);
    const own = vs.find((x) => hasValue(x));
    if (own) return own;
    // 人名で値が無ければ、代わりに出る変数（substitute の中の names）を探す（composer → author など）
    if (el.tag === 'names') {
      const sub = child(el, 'substitute');
      const found = [];
      (function walk(x) { if (x.type !== 'el') return; if (x.tag === 'names' && getAttr(x, 'variable')) found.push(...getAttr(x, 'variable').split(/\s+/)); x.children.forEach(walk); })(sub || { type: 'none' });
      const hit = found.find((x) => hasValue(x));
      if (hit) return hit;
    }
    return vs.find((x) => fieldOf(x)) || vs[0];
  };

  // 入れ子 → 平らな並び：{ field }・{ lit, term }・{ grp: [...], prefix, suffix }
  function flatten(nodes, byOrd) {
    const out = [];
    for (const n of nodes) {
      if (n.lit !== undefined) { out.push({ lit: n.lit }); continue; }
      const el = byOrd[n.ord];
      const v = fieldVar(el);
      if (v) { out.push({ field: v, el, toks: n.toks }); continue; }
      if (el.tag === 'text' && getAttr(el, 'macro') === undefined) { out.push({ lit: n.toks.map((t) => t.ch).join(''), term: true, el }); continue; }
      // まとまり（group・マクロの呼び出し・layout）：中を平らにしてから、部品の数で扱いを決める
      const inner = flatten(nest(n.toks, n.depth + 1), byOrd);
      const vars = new Set(inner.flatMap(allVars));
      if (vars.size === 0) { out.push({ lit: inner.map(litText).join(''), term: true, el }); continue; }
      if (vars.size === 1) {
        // 部品1つ：前後の文字はその部品の前後の文字にする
        const k0 = inner.findIndex((x) => x.field || x.grp), k1 = inner.length - 1 - [...inner].reverse().findIndex((x) => x.field || x.grp);
        const pre = inner.slice(0, k0).map(litText).join(''), suf = inner.slice(k1 + 1).map(litText).join('');
        let mid = inner.slice(k0, k1 + 1), p0 = pre, s0 = suf;
        // 入れ子の「部品1つのまとまり」は、内側の前後の文字も足し合わせる（(年) の括弧など）
        while (mid.length === 1 && mid[0].parts) { p0 += mid[0].pre || ''; s0 = (mid[0].suf || '') + s0; mid = mid[0].parts; }
        out.push({ field: [...vars][0], parts: mid, pre: p0, suf: s0 });
        continue;
      }
      // 部品2つ以上：前後に文字があれば〔 〕のまとまり
      let a = 0, b = inner.length;
      while (a < b && inner[a].lit !== undefined) a++;
      while (b > a && inner[b - 1].lit !== undefined) b--;
      const pre = inner.slice(0, a).map(litText).join(''), suf = inner.slice(b).map(litText).join('');
      if (pre || suf) out.push({ grp: inner.slice(a, b), prefix: pre, suffix: suf });
      else out.push(...inner);
    }
    return out;
  }
  function leafText(x) { return x.toks ? x.toks.map((t) => t.ch).join('') : (x.parts || x.grp || []).map(leafText).join(''); }
  function allVars(x) { return x.field ? [x.field] : x.grp ? x.grp.flatMap(allVars) : x.parts ? x.parts.flatMap(allVars) : []; }
  function litText(x) { return x.lit !== undefined ? x.lit : ''; }

  // ---- 平らな並び → チップ ------------------------------------------------------------
  function chipsOf(flat, report) {
    const chips = [];
    let pending = '';
    let lead = '';
    let moved = '';
    const pushChip = (c) => {
      if (!c) return;
      if (chips.length) { if (pending || moved) chips.push(S(moved && !pending.startsWith(moved) ? moved + pending : pending)); } else c.prefix = lead + pending + c.prefix;
      moved = '';
      if (!chips.length) lead = '';
      pending = '';
      chips.push(c);
    };
    for (const x of flat) {
      if (x.lit !== undefined) {
        // 決まった語（Ibid. など）が並びの頭や、部品のない所に来たら「任意の文字」の部品にする
        if (x.term && !chips.length && !lead && !pending) { chips.push(F('literal', { opt: { value: x.lit } })); continue; }
        if (chips.length) pending += x.lit; else lead += x.lit;
        continue;
      }
      if (x.grp) {
        const inner = chipsOf(x.grp, report);
        if (!inner.length) continue;
        if (chips.length && pending) chips.push(S(pending));
        else if (!chips.length && (lead || pending)) inner[0].prefix = lead + pending + (inner[0].prefix || '');
        lead = ''; pending = '';
        chips.push({ t: 'open', prefix: x.prefix }, ...inner, { t: 'close', suffix: x.suffix });
        continue;
      }
      const c = fieldChip(x, report);
      pushChip(c);
      // 引用符の内側に入った区切りの句読点（“Title,”）は、次の区切りに戻す（書き出すときに、また内側へ移る）
      if (c && c.wrap === 'dquote') {
        const txt = leafText(x);
        const m = txt.match(/([,.;:!?])\s*[”"]\s*$/);
        if (m && !(c.suffix || '').includes(m[1])) moved = m[1];
      }
    }
    // 並びの最後の文字（文末の「.」など）は、どの部品が最後に来ても付くように、並び全体をまとまりで囲んだ後ろの文字にする。
    // 最後の部品に付けると、その部品の無い文献（DOI の無い論文など）で消えてしまう。
    if (pending || lead) {
      const tail = lead + pending;
      if (chips.length === 1 && chips[0].t === 'field') chips[0].suffix += tail;
      else if (chips.length) return [{ t: 'open', prefix: '' }, ...chips, { t: 'close', suffix: tail }];
    }
    return chips;
  }

  // 行の最後の部品の後ろの文字が文末の句読点（. 。）で終わるなら、それを行全体のまとまりの後ろの文字に移す。
  // 見本では最後に来た部品（DOI など）が無い文献でも、文末の句読点が付くように（IEEE：DOI があれば「, doi: ….」、無ければ「2022.」）。
  function endPunct(chips) {
    const last = chips[chips.length - 1];
    if (chips.length < 2 || !last || last.t !== 'field') return chips;
    const m = (last.suffix || '').match(/[.。]$/);
    if (!m) return chips;
    last.suffix = last.suffix.slice(0, -1);
    return [{ t: 'open', prefix: '' }, ...chips, { t: 'close', suffix: m[0] }];
  }

  // 部品1つ分（同じ変数のラベルと値、前後の文字）→ チップ
  function fieldChip(x, report) {
    const map = fieldOf(x.field);
    if (!map) { report.dropped.add(x.field); return null; }
    const [f, form] = map;
    // 葉（変数を持つ要素）を集める
    const leaves = [];
    (function walk(y) { if (y.parts) y.parts.forEach(walk); else if (y.field && y.el) leaves.push(y); else if (y.grp) y.grp.forEach(walk); })(x);
    const valueLeaf = leaves.find((l) => l.el.tag !== 'label') || leaves[0];
    const labelLeaf = leaves.find((l) => l.el.tag === 'label');
    const el = valueLeaf ? valueLeaf.el : null;
    const toks = leaves.flatMap((l) => l.toks);
    const c = F(f);
    if (form) c.opt.form = form;
    // 前後の文字：まとまりの前後の文字＋要素自身の prefix・suffix
    let pre = x.pre || '', suf = x.suf || '';
    if (el && !labelLeaf) { pre += getAttr(el, 'prefix') || ''; suf = (getAttr(el, 'suffix') || '') + suf; }
    // 斜体：値の文字の半分以上が斜体なら
    const vt = valueLeaf ? valueLeaf.toks : toks;
    if (vt.length && vt.filter((t) => t.i).length * 2 > vt.length) c.italic = true;
    if (el && getAttr(el, 'quotes') === 'true') c.wrap = 'dquote';
    if (el && getAttr(el, 'text-case') === 'capitalize-first') c.caps = 'capitalize-first';
    const def = G.FIELDS[f];
    if (def.kind === 'names' && el) namesOpt(el, c, cur.place, cur.tree);
    if (def.kind === 'date' && el) {
      c.opt.form = dateForm(el);
      // 選択肢（年・年月・年月日・数字）で表せない書き方なら、元の <date> をそのまま持つ
      if (!plainDate(el)) {
        const d = O.parse(O.serialize(el)).children.find((k) => k.type === 'el');
        for (const k of ['prefix', 'suffix', 'variable', 'font-style', 'quotes']) d.attrs = d.attrs.filter((x) => x[0] !== k);
        c.opt.form = 'original'; c.opt.raw = O.serialize(d);
      }
    }
    if (def.hasForm && el && getAttr(el, 'form') === 'short') c.opt.form = 'short';
    if (labelLeaf && valueLeaf && labelLeaf !== valueLeaf) {
      c.opt.label = leaves.indexOf(labelLeaf) < leaves.indexOf(valueLeaf) ? 'before' : 'after';
      // ラベルと値の間の文字（まとまりの区切り）と、略記の点を外す指定
      // 間の文字＝前の要素の suffix ＋ まとまりの区切り ＋ 後ろの要素の prefix
      const [first, second] = c.opt.label === 'before' ? [labelLeaf.el, valueLeaf.el] : [valueLeaf.el, labelLeaf.el];
      // 両方を含む一番近いまとまりの区切り（値が条件分岐の中にあってもよい）
      const anc = new Set(); for (let q = labelLeaf.el.parent; q; q = q.parent) anc.add(q);
      let cg = valueLeaf.el.parent; while (cg && !(anc.has(cg) && cg.tag === 'group')) cg = cg.parent;
      const delim = cg ? getAttr(cg, 'delimiter') || '' : '';
      c.opt.labelSpace = (getAttr(first, 'suffix') || '') + delim + (getAttr(second, 'prefix') || '');
      if (getAttr(labelLeaf.el, 'strip-periods') === 'true') c.opt.stripPeriods = true;
    } else if (f === 'locator' || f === 'page' || f === 'volume' || f === 'issue' || f === 'edition') {
      c.opt.label = 'none';
    }
    c.prefix = pre; c.suffix = suf;
    return c;
  }
  function namesOpt(el, c, place, tree) {
    const kids = el.children.filter((k) => k.type === 'el');
    const name = kids.find((k) => k.tag === 'name');
    const label = kids.find((k) => k.tag === 'label');
    const style = child(tree, 'style');
    const sec = child(style, place === 'bib' ? 'bibliography' : 'citation');
    // 人名の設定（区切り・「ほか」の人数・頭文字など）は、この <name> の値を部品ごとに持つ。
    // 注と参考文献で違うことがある（Chicago：注は3人以上で1人）。書式全体と同じ値は、あとで外す。
    c._names = nameSettings(name, sec, style, place);
    // 人名の順と形は <name> のほか、citation・bibliography・style に書かれていることもある（受け継ぐ）
    const inherit = (k, up) => (name && getAttr(name, k)) ?? (sec && getAttr(sec, up)) ?? (style && getAttr(style, up));
    const so = inherit('name-as-sort-order', 'name-as-sort-order');
    if (so === 'first') c.opt.order = 'family'; else if (so === 'all') c.opt.order = 'family-all';
    if (inherit('form', 'name-form') === 'short') c.opt.form = 'short';
    if (label) {
      c.opt.role = kids.indexOf(label) < kids.indexOf(name) ? 'before' : 'after';
      // verb（translated by）だけを長い形にし、verb-short・short（trans.・ed.）は短い形にする
      const lf = getAttr(label, 'form') || 'long';
      c.opt.roleForm = /^(verb|verb-short|short|long)$/.test(lf) ? lf : 'short';
      // 役割の語の前後の文字（APA の「 (Ed.)」）
      const lp = getAttr(label, 'prefix'), ls = getAttr(label, 'suffix');
      if (lp !== undefined) c.opt.rolePrefix = lp;
      if (ls !== undefined) c.opt.roleSuffix = ls;
      if (/^(capitalize-first|capitalize-all|title)$/.test(getAttr(label, 'text-case') || '')) c.caps = 'capitalize-first';
    }
  }
  // アプリの選択肢と同じ書き方か（年だけ／form="text" で日付の部分に細かい指定が無い／form="numeric"）
  function plainDate(el) {
    const parts = el.children.filter((k) => k.type === 'el' && k.tag === 'date-part');
    const form = getAttr(el, 'form');
    if (!form) return parts.length === 1 && getAttr(parts[0], 'name') === 'year' && parts[0].attrs.length === 1;
    return !parts.length && (form === 'text' || form === 'numeric');
  }
  function dateForm(el) {
    const form = getAttr(el, 'form');
    const parts = form ? (getAttr(el, 'date-parts') || 'year-month-day').split('-') : el.children.filter((k) => k.type === 'el' && k.tag === 'date-part').map((k) => getAttr(k, 'name'));
    if (form === 'numeric' && parts.includes('month')) return 'numeric';
    if (parts.includes('day')) return 'ymd';
    if (parts.includes('month')) return 'ym';
    return 'year';
  }

  // ---- 人名の設定 ------------------------------------------------------------------
  // <name> の属性。無ければ citation・bibliography → style から受け継ぐ（CSL の決まり）。
  const NAME_KEYS = ['delimiter', 'and', 'precedesLast', 'precedesEtAl', 'etAlMin', 'etAlUseFirst', 'initialize', 'initializeWith', 'sortSeparator'];
  function nameSettings(name, sec, style, place) {
    // 上位の要素（citation・bibliography・style）では、人名の区切りは name-delimiter という名前になる
    const up = (k) => (sec && getAttr(sec, k === 'delimiter' ? 'name-delimiter' : k)) ?? (style && getAttr(style, k === 'delimiter' ? 'name-delimiter' : k));
    const get = (k) => (name && getAttr(name, k)) ?? up(k);
    const later = place === 'citeSub' || place === 'citeIbid';
    const n = {};
    n.delimiter = get('delimiter') ?? ', ';
    const and = get('and'); n.and = and === 'text' ? 'text' : and === 'symbol' ? 'symbol' : 'none';
    // 指定が無ければ CSL の既定（contextual：3人以上のときだけ区切りを入れる）
    n.precedesLast = get('delimiter-precedes-last') || 'contextual';
    n.precedesEtAl = get('delimiter-precedes-et-al') || 'contextual';
    const em = (later && get('et-al-subsequent-min')) || get('et-al-min'), eu = (later && get('et-al-subsequent-use-first')) || get('et-al-use-first');
    n.etAlMin = em ? +em : ''; n.etAlUseFirst = eu ? +eu : '';
    const iw = get('initialize-with');
    n.initialize = iw !== undefined && get('initialize') !== 'false';
    n.initializeWith = iw !== undefined ? iw : '. ';
    n.sortSeparator = get('sort-separator') ?? ', ';
    return n;
  }
  // 書式全体の人名の設定は、参考文献の最初の人名の部品から取る。部品には、それと違う値だけを残す。
  function settleNames(sys, places) {
    let base = null;
    for (const p of places) for (const chips of Object.values(sys[p] || {})) for (const c of chips) if (!base && c._names && p === 'bib') base = c._names;
    if (!base) for (const p of places) for (const chips of Object.values(sys[p] || {})) for (const c of chips) if (!base && c._names) base = c._names;
    if (base) { Object.assign(sys.names, base); sys.names.precedesLastInverted = base.precedesLast; }
    for (const p of places) for (const chips of Object.values(sys[p] || {})) for (const c of chips) {
      if (!c._names) continue;
      const diff = {};
      for (const k of NAME_KEYS) if (base && c._names[k] !== base[k]) diff[k] = c._names[k];
      if (Object.keys(diff).length) c.opt.names = diff;
      delete c._names;
    }
  }

  // ---- 本体 ------------------------------------------------------------------------
  // xml：公式のスタイル（手直しの編集を当てたもの）。items：見本データ。
  function convert(CSL, xml, items, retrieveLocale) {
    const report = { dropped: new Set() };
    const kind = kindOf(xml);
    const note = kind === 'note';
    // 部品を読み取るときは「同じ著者の2件目以降を ——— にする」を外して組む（見本の著者が ——— として文字に移らないように）。
    // 外すのは読み取りのときだけで、書き出しには bibAttrs として引き継ぐ。
    const xmlRead = xml.replace(/\ssubsequent-author-substitute(-rule)?="[^"]*"/g, '');
    const tree = O.parse(xmlRead);
    const byOrd = O.index(tree);
    const samples = samplesFor(items);
    const its = Object.values(samples);
    const clean = renderAll(CSL, xmlRead, its, retrieveLocale, note);
    const marked = renderAll(CSL, O.serialize(O.instrument(tree)), its, retrieveLocale, note);
    const places = note ? ['bib', 'cite', 'citeSub', 'citeIbid'] : ['bib', 'cite'];
    const en = { bib: {}, cite: {}, citeSub: {}, citeIbid: {} };
    for (const [tab, it] of Object.entries(samples)) {
      for (const p of places) {
        const toks = tokens(clean[it.id][p] || '', marked[it.id][p] || '');
        // 一番外（layout）の文字（前後の文字・区切り）は、書式全体の設定に回すので外す
        const top = nest(toks, 0);
        const body = top.filter((x) => x.ord !== undefined && byOrd[x.ord] && byOrd[x.ord].tag === 'layout').flatMap((x) => x.toks.filter((t) => t.path.length > 1));
        Object.assign(cur, { item: it, place: p, tree });
        const flat = flatten(nest(body, 1), byOrd);
        en[p][tab] = endPunct(chipsOf(flat, report));
      }
    }
    // 書式全体の設定
    const starter = STARTER_OF[kind] || 'chicago';
    const m = ST.makeStarter(starter);
    const style = child(tree, 'style');
    const bl = child(child(style, 'bibliography'), 'layout'), cl = child(child(style, 'citation'), 'layout');
    const sys = m.systems.en;
    sys.bib = en.bib; sys.cite = en.cite;
    if (note) { sys.citeSub = en.citeSub; sys.citeIbid = en.citeIbid; m.subsequent = true; }
    settleNames(sys, places);
    sys.layout = { bib: { prefix: bl ? getAttr(bl, 'prefix') || '' : '', suffix: bl ? getAttr(bl, 'suffix') || '' : '' }, cite: { suffix: note && cl ? getAttr(cl, 'suffix') || '' : '' } };
    if (!note && cl) m.citeLayout = { prefix: getAttr(cl, 'prefix') || '', suffix: getAttr(cl, 'suffix') || '', delimiter: getAttr(cl, 'delimiter') || '' };
    // 元のスタイルの作者・ライセンス・ID（書き出しで保つ）
    const info = {};
    const infoEl = child(style, 'info');
    if (infoEl) {
      const credits = infoEl.children.filter((x) => x.type === 'el' && (x.tag === 'author' || x.tag === 'contributor')).map(O.serialize);
      const rights = child(infoEl, 'rights');
      info.credits = credits;
      info.template = (xml.match(/<id>([^<]*)<\/id>/) || [])[1] || '';
      if (rights) info.rights = O.serialize(rights).replace(/^<rights[^>]*>|<\/rights>$/g, '');
      info.rightsLicense = rights ? getAttr(rights, 'license') || '' : '';
    }
    // 元のスタイルの <locale>（日付の書き方・用語の上書き）は欧文の書式に引き継ぐ。言語指定の無いものは en にする（和文に効かせない）。
    const locales = (style ? style.children : []).filter((x) => x.type === 'el' && x.tag === 'locale')
      .filter((x) => !getAttr(x, 'xml:lang') || /^en\b/.test(getAttr(x, 'xml:lang')))
      .map((x) => O.serialize(x).replace(/^<locale(?:\s+xml:lang="[^"]*")?/, '<locale xml:lang="en"'));
    m.terms = m.terms || {}; m.terms.en = {}; // 欧文の用語は、元のスタイルとロケールのものを使う
    // スタイル全体・参考文献・引用の設定（頁の範囲の書き方、同じ著者の2件目以降を ——— にする、など）を引き継ぐ。
    // 人名の設定は部品ごとに移したので除く。
    const NAME_ATTR = /^(and|delimiter-precedes-(last|et-al)|et-al-|initialize|name-|names-|sort-separator|demote-non-dropping-particle)/;
    const keep = (el) => Object.fromEntries((el ? el.attrs : []).filter(([k]) => !NAME_ATTR.test(k)));
    if (style && getAttr(style, 'page-range-format')) m.pageRangeFormat = getAttr(style, 'page-range-format');
    // 参考文献の設定は、読み取り用に外した subsequent-author-substitute を含む元のスタイルから取る。
    // second-field-align（番号を左にそろえる）は、レイアウトの最初の要素を切り離す。アプリの生成するスタイルでは
    // 中身が1つのマクロなので切り離し方が変わり、文末の文字が落ちる。見た目だけの設定なので引き継がない。
    m.bibAttrs = keep(child(child(O.parse(xml), 'style'), 'bibliography'));
    if (m.bibAttrs['second-field-align']) { delete m.bibAttrs['second-field-align']; report.dropped.add('second-field-align'); }
    m.citeAttrs = keep(child(style, 'citation'));
    m.source = { kind: 'official', title: O.titleOf(xml), locales, ...info };
    // 組み直して、見本ごとに元の出力と比べる
    const checks = compare(CSL, xml, m, items.filter((i) => i.language === 'en').concat([OTHER_ITEM]), retrieveLocale, note);
    return { model: m, kind, starter, report: { dropped: [...report.dropped], checks } };
  }

  // 見本ごとに、元のスタイルと移したモデルの出力（文字だけ）を比べる
  function compare(CSL, xml, model, items, retrieveLocale, note) {
    const gen = G.generate({ ...model, info: { ...(model.info || {}), id: 'http://example.org/cv' } }, { only: 'en', embed: false });
    const a = renderAll(CSL, xml, items, retrieveLocale, note);
    const b = renderAll(CSL, gen, items, retrieveLocale, note);
    const out = [];
    for (const it of items) {
      for (const p of Object.keys(a[it.id])) {
        const x = plain(a[it.id][p]), y = plain(b[it.id][p]);
        out.push({ id: it.id, type: it.type, place: p, same: x === y, original: x, converted: y });
      }
    }
    return out;
  }

  const api = { convert };
  if (isNode) module.exports = api;
  else root.CSLConvert = api;
})(typeof window !== 'undefined' ? window : this);
