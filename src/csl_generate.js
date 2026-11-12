// 内部モデル（JSON）から CSL を生成する。ブラウザでも node でも動く。
//
// 要点
// - 和文の系統は言語指定の無いレイアウト（default-locale="ja-JP"）、欧文の系統は
//   <layout locale="en fr de ..."> に置く（citeproc-js で確かめた結果）。
// - チップの並びは左から入れ子の group にする。区切りは group の delimiter なので、
//   片側が空なら区切りも出ない。
// - opts.mark が真なら、各チップの前後に私用領域の目印を仕込む（理想形との差分表示で使う予定。未実装）。
(function (root) {
  'use strict';

  // ---- 部品の一覧 ---------------------------------------------------------
  const FIELDS = {
    author: { label: '著者', kind: 'names' },
    editor: { label: '編者', kind: 'names' },
    translator: { label: '訳者', kind: 'names' },
    title: { label: '書名・題名', kind: 'text', hasForm: true },
    'container-title': { label: '掲載誌名・収録書名', kind: 'text', hasForm: true },
    'collection-title': { label: '叢書名', kind: 'text' },
    volume: { label: '巻', kind: 'number', term: 'volume' },
    issue: { label: '号', kind: 'number', term: 'issue' },
    page: { label: '頁', kind: 'number', term: 'page' },
    edition: { label: '版', kind: 'number', term: 'edition' },
    publisher: { label: '出版者', kind: 'text' },
    'publisher-place': { label: '出版地', kind: 'text' },
    issued: { label: '発行年', kind: 'date' },
    accessed: { label: '参照日', kind: 'date', term: 'accessed' },
    URL: { label: 'URL', kind: 'text' },
    DOI: { label: 'DOI', kind: 'text' },
    locator: { label: '引用頁', kind: 'number', term: 'locator', citeOnly: true },
    'citation-number': { label: '番号', kind: 'number' },
    literal: { label: '任意の文字', kind: 'literal' },
  };

  // 資料の種類のタブ。CSL の type をまとめる。
  const TYPE_TABS = [
    { key: 'book', label: '図書', types: ['book'] },
    { key: 'chapter', label: '本の章', types: ['chapter', 'paper-conference'] },
    { key: 'article', label: '雑誌論文', types: ['article-journal', 'article-magazine', 'article-newspaper'] },
    { key: 'web', label: 'ウェブページ', types: ['webpage', 'post-weblog', 'post'] },
    { key: 'other', label: 'その他', types: [] },
  ];

  // Zotero 10.0.7 の項目の種類（resource/schema/global/schema.json）。[Zotero の種類, 日本語の表示名, CSL の種類]。
  // 注釈・添付ファイル・メモは書誌にならないので外した。CSL の種類が同じものは、CSL では書き分けられない。
  const ZOTERO_TYPES = [
    ['book', '書籍', 'book'], ['bookSection', '書籍の章', 'chapter'], ['journalArticle', '学術論文', 'article-journal'],
    ['webpage', 'ウェブページ', 'webpage'], ['magazineArticle', '雑誌記事', 'article-magazine'], ['newspaperArticle', '新聞記事', 'article-newspaper'],
    ['conferencePaper', '学会発表', 'paper-conference'], ['thesis', '学位論文', 'thesis'], ['report', 'レポート', 'report'],
    ['manuscript', '原稿', 'manuscript'], ['letter', '手紙', 'personal_communication'], ['email', '電子メール', 'personal_communication'],
    ['instantMessage', 'インスタントメッセージ', 'personal_communication'], ['document', '文書', 'document'],
    ['encyclopediaArticle', '百科事典項目', 'entry-encyclopedia'], ['dictionaryEntry', '辞書項目', 'entry-dictionary'],
    ['map', '地図', 'map'], ['artwork', '芸術作品', 'graphic'], ['blogPost', 'ブログ記事', 'post-weblog'], ['forumPost', '掲示板への投稿', 'post'],
    ['preprint', 'プレプリント', 'article'], ['presentation', 'プレゼンテーション', 'speech'], ['interview', 'インタビュー', 'interview'],
    ['film', '映画', 'motion_picture'], ['videoRecording', '録画', 'motion_picture'], ['audioRecording', '録音', 'song'],
    ['podcast', 'ポッドキャスト', 'broadcast'], ['radioBroadcast', 'ラジオ放送', 'broadcast'], ['tvBroadcast', 'テレビ放送', 'broadcast'],
    ['computerProgram', 'ソフトウェア', 'software'], ['dataset', 'データセット', 'dataset'], ['standard', '標準', 'standard'],
    ['patent', '特許', 'patent'], ['statute', '法律', 'legislation'], ['bill', '議案', 'bill'], ['hearing', '公聴会', 'hearing'],
    ['case', '訴訟', 'legal_case'],
  ];
  // CSL の種類ごとに、Zotero の表示名をまとめる（「手紙・電子メール・インスタントメッセージ」）。並びは上の順。
  const CSL_TYPES = [];
  for (const [, ja, csl] of ZOTERO_TYPES) {
    const t = CSL_TYPES.find((x) => x.type === csl);
    if (t) t.label += '・' + ja; else CSL_TYPES.push({ type: csl, label: ja });
  }
  function cslTypeLabel(type) { const t = CSL_TYPES.find((x) => x.type === type); return t ? t.label : type; }

  // 書式の種類のタブ。既定の4つ（model.baseOff で外せる）に、足した種類（model.typeTabs）を続け、最後に「その他」。
  // 足した種類は、それまで入っていた既定のタブから外れる。外した既定のタブの種類は「その他」で組む。
  function tabsOf(model) {
    const extra = ((model && model.typeTabs) || []).filter((t, i, a) => CSL_TYPES.some((x) => x.type === t) && a.indexOf(t) === i);
    const off = (model && model.baseOff) || [];
    const base = TYPE_TABS.filter((t) => t.key !== 'other' && !off.includes(t.key)).map((t) => ({ ...t, types: t.types.filter((x) => !extra.includes(x)) }));
    return [...base, ...extra.map((t) => ({ key: 'x-' + t, label: cslTypeLabel(t), types: [t], extra: true })), TYPE_TABS[TYPE_TABS.length - 1]];
  }
  function tabOfType(type, model) {
    for (const t of tabsOf(model)) if (t.types.includes(type)) return t.key;
    return 'other';
  }

  // 用語表の行。name と form が同じ行は1つの <term> にまとめる（single と multiple）。
  const TERM_ROWS = [
    { key: 'page', name: 'page', form: 'short', num: 'single', label: '頁（1頁）' },
    { key: 'pages', name: 'page', form: 'short', num: 'multiple', label: '頁（範囲）' },
    { key: 'volume', name: 'volume', form: 'short', label: '巻' },
    { key: 'issue', name: 'issue', form: 'short', label: '号' },
    { key: 'edition', name: 'edition', form: 'short', label: '版' },
    { key: 'editor', name: 'editor', form: 'short', num: 'single', label: '編（1人）' },
    { key: 'editors', name: 'editor', form: 'short', num: 'multiple', label: '編（複数）' },
    { key: 'editor-verb', name: 'editor', form: 'verb', label: '編（前に置く形）' },
    { key: 'translator', name: 'translator', form: 'short', num: 'single', label: '訳（1人）' },
    { key: 'translators', name: 'translator', form: 'short', num: 'multiple', label: '訳（複数）' },
    { key: 'translator-verb', name: 'translator', form: 'verb', label: '訳（前に置く形）' },
    { key: 'et-al', name: 'et-al', label: 'ほか' },
    { key: 'and', name: 'and', label: '最後の人名の前' },
    { key: 'accessed', name: 'accessed', label: '参照' },
    { key: 'page-range-delimiter', name: 'page-range-delimiter', label: '頁の範囲の区切り' },
  ];

  // ---- 小道具 ---------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function attrs(o) {
    let s = '';
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null || v === false || v === '') continue;
      s += ` ${k}="${esc(v === true ? 'true' : v)}"`;
    }
    return s;
  }
  const WRAPS = {
    none: ['', ''],
    nijukagi: ['『', '』'],
    kagi: ['「', '」'],
    dquote: ['“', '”'],
    paren: ['（', '）'],
    hparen: ['(', ')'],
    bracket: ['[', ']'],
  };
  const MARK_OPEN = '';
  const MARK_CLOSE = '';
  const MARK_BASE = 0xE100;
  function markChar(n) { return String.fromCharCode(MARK_BASE + n); }

  // ---- 部品1つの XML ---------------------------------------------------------
  // chip: { t:'field', f, prefix, suffix, wrap, italic, caps, opt:{...} }
  function fieldXml(chip, sysKey, sys, ctx) {
    const def = FIELDS[chip.f];
    if (!def) return '';
    const opt = chip.opt || {};
    const [wo, wc] = WRAPS[chip.wrap || 'none'] || WRAPS.none;
    // “” は quotes="true" にして、引用符の内側に句読点を入れる処理を効かせる。
    // 和文ロケールの引用符は「」なので、localeXml で “ ” に上書きしてある。
    const useQuotes = chip.wrap === 'dquote';
    const fmt = {
      prefix: useQuotes ? '' : wo,
      suffix: useQuotes ? '' : wc,
      quotes: useQuotes,
      'font-style': chip.italic ? 'italic' : '',
      'text-case': chip.caps === 'capitalize-first' ? 'capitalize-first' : '',
    };
    let inner = '';
    const space = sys.labelSpace || '';
    switch (def.kind) {
      case 'names': inner = namesXml(chip, sys, fmt); break;
      case 'text': {
        const v = chip.f;
        inner = `<text${attrs({ variable: v, form: def.hasForm && opt.form === 'short' ? 'short' : '', ...fmt })}/>`;
        break;
      }
      case 'literal':
        inner = `<text${attrs({ value: opt.value || '', ...fmt })}/>`;
        break;
      case 'date': {
        const form = opt.form || 'year';
        const dfmt = { ...fmt };
        if (form === 'year') inner = `<date${attrs({ variable: chip.f, ...dfmt })}><date-part name="year"/></date>`;
        else if (form === 'ym') inner = `<date${attrs({ variable: chip.f, form: 'text', 'date-parts': 'year-month', ...dfmt })}/>`;
        else if (form === 'numeric') inner = `<date${attrs({ variable: chip.f, form: 'numeric', ...dfmt })}/>`;
        else inner = `<date${attrs({ variable: chip.f, form: 'text', ...dfmt })}/>`;
        inner = withLabel(inner, chip, sys, def, space);
        break;
      }
      case 'number': {
        const v = chip.f;
        inner = `<text${attrs({ variable: v, ...fmt })}/>`;
        inner = withLabel(inner, chip, sys, def, space);
        break;
      }
    }
    // チップの前後の文字は外側の group に付ける（中身が空なら group ごと消える）。
    let xml = `<group${attrs({ prefix: chip.prefix || '', suffix: chip.suffix || '' })}>${inner}</group>`;
    if (ctx && ctx.mark) {
      const n = ctx.nextMark++;
      ctx.marks.push({ n, chip: chip.uid });
      xml = `<group><text value="${MARK_OPEN}${markChar(n)}"/>${xml}<text value="${MARK_CLOSE}${markChar(n)}"/></group>`;
    }
    return xml;
  }

  // 巻・号・頁・版・引用頁・参照日に添える用語。
  function withLabel(inner, chip, sys, def, space) {
    const pos = (chip.opt || {}).label || 'none';
    if (!def.term || pos === 'none') return inner;
    let lab;
    if (def.term === 'page' || def.term === 'locator') {
      lab = `<label${attrs({ variable: chip.f, form: 'short' })}/>`;
    } else if (def.term === 'accessed') {
      lab = `<text term="accessed"/>`;
    } else {
      lab = `<text${attrs({ term: def.term, form: 'short' })}/>`;
    }
    const parts = pos === 'before' ? [lab, inner] : [inner, lab];
    return `<group${attrs({ delimiter: space })}>${parts.join('')}</group>`;
  }

  function namesXml(chip, sys, fmt) {
    const opt = chip.opt || {};
    const n = sys.names || {};
    const short = opt.form === 'short';
    const nameAttrs = {
      form: short ? 'short' : '',
      delimiter: n.delimiter,
      and: n.and && n.and !== 'none' ? n.and : '',
      // 姓を前に出す形（Dubois, Léa, and Jules Moreau）では最後の名前の前にも区切りを入れる。
      'delimiter-precedes-last': !short && opt.order && opt.order !== 'given' ? (n.precedesLastInverted || 'always') : (n.precedesLast || ''),
      'delimiter-precedes-et-al': n.precedesEtAl || '',
      'et-al-min': n.etAlMin || '',
      'et-al-use-first': n.etAlUseFirst || '',
      'initialize-with': n.initialize && !short ? (n.initializeWith || '. ') : '',
      'name-as-sort-order': !short && opt.order === 'family' ? 'first' : (!short && opt.order === 'family-all' ? 'all' : ''),
      'sort-separator': !short && opt.order && opt.order !== 'given' ? (n.sortSeparator || ', ') : '',
    };
    const nameEl = `<name${attrs(nameAttrs)}/>`;
    const etal = n.etAlTerm === false ? '' : '<et-al term="et-al"/>';
    const role = opt.role || 'none';
    const label = (form, pos) => pos === 'before'
      ? `<label${attrs({ form, suffix: n.roleBeforeSuffix ?? ' ', 'text-case': chip.caps === 'capitalize-first' ? 'capitalize-first' : '' })}/>`
      : `<label${attrs({ form, prefix: n.roleAfterPrefix ?? '' })}/>`;
    const roleForm = opt.roleForm || (role === 'before' ? 'verb' : 'short');
    const lab = role === 'none' ? '' : label(roleForm, role);
    let sub = '';
    if (chip.f === 'author' && opt.substitute !== false) {
      // 著者が無いときは編者で代える（「山田太郎編」「Name, ed.」）。
      const subPos = (sys.names || {}).substituteRole || 'after';
      const subLab = subPos === 'none' ? '' : label(subPos === 'before' ? 'verb' : 'short', subPos);
      const inside = subPos === 'before' ? subLab + nameEl + etal : nameEl + etal + subLab;
      sub = `<substitute><names variable="editor">${inside}</names></substitute>`;
    }
    const body = role === 'before' ? lab + nameEl + etal : nameEl + etal + lab;
    const nfmt = { ...fmt };
    // text-case は label 側で扱う。
    delete nfmt['text-case'];
    delete nfmt.quotes;
    return `<names${attrs({ variable: chip.f, ...nfmt })}>${body}${sub}</names>`;
  }

  // ---- 並び（チップの列）→ 入れ子の group ---------------------------------------
  // 区切りは両側に部品があるときだけ出る。列の端にある区切りは何も出さない。
  // 部品が空の文献では、その部品とその前の区切りが消える（左から入れ子にするため）。
  // 〔 〕（t:'open' / t:'close'）で囲んだ部品は1つのまとまり（CSL の group）になる。まとまりの中が全部空なら、
  // まとまりと、その前の区切りが消える。〔 の前に付ける文字と 〕 の後ろに付ける文字は、まとまりが出るときだけ出る。
  // 例：書名 ． 〔訳者 ， 出版者 ， 年〕 → 訳者が空でも「書名. 出版者, 年」。
  function chainXml(chips, sysKey, sys, ctx) {
    return chainFrom(chips || [], 0, sysKey, sys, ctx, false)[0];
  }
  function chainFrom(chips, start, sysKey, sys, ctx, inGroup) {
    const nodes = [];
    let pending = '';
    let i = start;
    for (; i < chips.length; i++) {
      const c = chips[i];
      if (c.t === 'sep') { pending += c.v; continue; }
      if (c.t === 'close') { if (inGroup) break; continue; } // 対になる 〔 が無い 〕 は無視する
      let x;
      if (c.t === 'open') {
        const [inner, end] = chainFrom(chips, i + 1, sysKey, sys, ctx, true);
        const close = chips[end] && chips[end].t === 'close' ? chips[end] : null; // 〕 が無ければ列の終わりまで
        i = end;
        x = inner ? `<group${attrs({ prefix: c.prefix || '', suffix: (close && close.suffix) || '' })}>${inner}</group>` : '';
      } else {
        x = fieldXml(c, sysKey, sys, ctx);
      }
      if (!x) continue;
      if (nodes.length) nodes.push({ sep: pending });
      pending = '';
      nodes.push({ xml: x });
    }
    if (nodes.length === 0) return ['', i];
    let acc = nodes[0].xml;
    for (let k = 1; k < nodes.length; k += 2) {
      acc = `<group${attrs({ delimiter: nodes[k].sep })}>${acc}${nodes[k + 1].xml}</group>`;
    }
    return [acc, i];
  }

  function chooseXml(byTab, sysKey, sys, ctx, tabs) {
    const parts = [];
    let first = true;
    for (const t of tabs || TYPE_TABS) {
      if (t.key === 'other' || !t.types.length) continue;
      const tag = first ? 'if' : 'else-if';
      first = false;
      parts.push(`<${tag} type="${t.types.join(' ')}">${chainXml(byTab[t.key] || [], sysKey, sys, ctx)}</${tag}>`);
    }
    parts.push(`<else>${chainXml(byTab.other, sysKey, sys, ctx)}</else>`);
    return `<choose>${parts.join('')}</choose>`;
  }

  // ---- 用語表 → <locale> ------------------------------------------------------
  function localeXml(lang, terms, extra) {
    const groups = new Map();
    for (const r of TERM_ROWS) {
      const v = terms && terms[r.key];
      if (v === undefined || v === null) continue;
      const k = r.name + '|' + (r.form || '');
      if (!groups.has(k)) groups.set(k, { name: r.name, form: r.form, single: undefined, multiple: undefined, plain: undefined });
      const g = groups.get(k);
      if (r.num === 'single') g.single = v;
      else if (r.num === 'multiple') g.multiple = v;
      else g.plain = v;
    }
    const out = [];
    for (const g of groups.values()) {
      const a = attrs({ name: g.name, form: g.form || '' });
      if (g.single !== undefined || g.multiple !== undefined) {
        const s = g.single ?? g.multiple;
        const m = g.multiple ?? g.single;
        out.push(`<term${a}><single>${esc(s)}</single><multiple>${esc(m)}</multiple></term>`);
      } else {
        out.push(`<term${a}>${esc(g.plain)}</term>`);
      }
    }
    return `<locale xml:lang="${lang}">${(extra && extra.options) || ''}<terms>${out.join('')}${(extra && extra.terms) || ''}</terms></locale>`;
  }

  // ---- モデルの埋め込み（書き出した .csl から続きを直せるように） -------------------
  const MODEL_TAG = 'csl-editor-model';
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // base64 の文字には「-」が無いので、コメントの中に「--」は現れない。
  function embedModel(model) {
    const m = JSON.parse(JSON.stringify(model));
    return `<!-- ${MODEL_TAG} ${b64encode(JSON.stringify(m))} -->`;
  }
  function extractModel(cslText) {
    const re = new RegExp(`<!--\\s*${MODEL_TAG}\\s+([A-Za-z0-9+/=\\s]+?)\\s*-->`);
    const m = cslText.match(re);
    if (!m) return null;
    return JSON.parse(b64decode(m[1].replace(/\s+/g, '')));
  }

  // ---- 全体 --------------------------------------------------------------------
  // 言語別に書き出すときの既定ロケール（opts.only の書式の言語）。
  const ONLY_LOCALE = { ja: 'ja-JP', en: 'en-US', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', es: 'es-ES', nl: 'nl-NL', pt: 'pt-PT', ru: 'ru-RU', la: 'la' };
  // opts.only に書式のキー（ja・en・fr など）を渡すと、その書式だけで全文献を組む標準の CSL 1.0.2 を出す。
  // 言語別のレイアウトと if locale（CSL-M の拡張）を使わないので、pandoc など CSL-M に対応しないソフトでも読める。
  function generate(model, opts) {
    opts = opts || {};
    const only = opts.only || null;
    const ctx = opts.mark ? { mark: true, nextMark: 0, marks: [] } : null;
    const kind = model.kind || 'note';
    // 言語ごとの書式（fr など）は、その言語だけのレイアウトにする。残りの欧文は en の書式で組む。
    const extras = extraLangs(model);
    let euro = (model.euroLangs || ['en']).filter((l) => l && !extras.includes(l));
    if (!euro.length) euro = ['en'];
    const euroAttr = euro.join(' ');
    const keys = only ? [only] : ['ja', 'en', ...extras];
    const tabs = tabsOf(model);
    // 注形式で「2回目以降の注を書き分ける」を入れたときは、注の位置で並びを分ける。
    // 直前と同じ本：頁が違えば citeIbid の並び、頁も同じなら citeIbid から引用頁を外した並び（「同上。」）。
    // 間を挟んだ2回目以降：citeSub。初出：cite。
    const noLocator = (byTab) => Object.fromEntries(Object.entries(byTab || {}).map(([k, c]) => [k, (c || []).filter((x) => !(x.t === 'field' && x.f === 'locator'))]));
    const citeBody = (sk) => {
      const sys = S[sk];
      const first = chooseXml(sys.cite, sk, sys, ctx, tabs);
      if (kind !== 'note' || !model.subsequent || !sys.citeSub) return first;
      const ibid = sys.citeIbid || sys.citeSub;
      return '<choose>'
        + `<if position="ibid-with-locator">${chooseXml(ibid, sk, sys, ctx, tabs)}</if>`
        + `<else-if position="ibid">${chooseXml(noLocator(ibid), sk, sys, ctx, tabs)}</else-if>`
        + `<else-if position="subsequent">${chooseXml(sys.citeSub, sk, sys, ctx, tabs)}</else-if>`
        + `<else>${first}</else></choose>`;
    };
    const S = model.systems;
    const now = opts.updated || new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
    const info = model.info || {};

    const macros = [];
    for (const sk of keys) {
      macros.push(`<macro name="bib-${sk}">${chooseXml(S[sk].bib, sk, S[sk], ctx, tabs)}</macro>`);
      macros.push(`<macro name="cite-${sk}">${citeBody(sk)}</macro>`);
    }
    // 和文を先にまとめるための鍵。言語コードの降順だと sv・ru・nl・la などが ja より前に来るので、
    // 和文のレイアウトに落ちるもの（ja・言語欄が空・どこにも無い言語）を 0、欧文を 1 にする（CSL-M の if locale）。
    if (!only) macros.push(`<macro name="lang-group"><choose><if locale="${esc([...extras, ...euro].filter((l) => l !== 'ja').join(' '))}"><text value="1"/></if><else><text value="0"/></else></choose></macro>`);
    macros.push('<macro name="sort-key"><names variable="author"><name name-as-sort-order="all"/>'
      + '<substitute><names variable="editor"/><text variable="title"/></substitute></names></macro>');

    // 注・本文中の引用の括弧と区切りはスタイル全体で1つ。citeproc-js は、まとめた引用の
    // 開きを既定（和文）のレイアウトから、閉じと区切りを文献ごとのレイアウトから取るため、
    // 系統ごとに変えると括弧が揃わない（citeproc-js で確認）。注形式の文末だけは系統ごとに持つ。
    const CL = model.citeLayout || {};
    const lay = (sk, which) => {
      if (which === 'bib') {
        const L = (S[sk].layout || {}).bib || {};
        return attrs({ prefix: L.prefix || '', suffix: L.suffix || '' });
      }
      const suffix = kind === 'note' ? (((S[sk].layout || {}).cite || {}).suffix || '') : (CL.suffix || '');
      return attrs({ prefix: CL.prefix || '', suffix, delimiter: CL.delimiter || '' });
    };

    const citeAttrs = attrs({
      'disambiguate-add-year-suffix': kind === 'author-date',
    });
    let sort = '';
    if (kind === 'numeric') sort = '';
    else {
      const keys = [];
      if (model.sortByLanguage && !only) keys.push('<key macro="lang-group"/>');
      keys.push('<key macro="sort-key"/>', '<key variable="issued"/>', '<key variable="title"/>');
      sort = `<sort>${keys.join('')}</sort>`;
    }

    const title = (info.title || '無題のスタイル') + (only ? '_' + only : '');
    const id = (info.id || 'http://www.zotero.org/styles/csl-editor-untitled') + (only ? '-' + only : '');
    const quoteOpts = {
      options: `<style-options punctuation-in-quote="${model.punctuationInQuote === false ? 'false' : 'true'}"/>`,
      terms: '<term name="open-quote">“</term><term name="close-quote">”</term><term name="open-inner-quote">‘</term><term name="close-inner-quote">’</term>',
    };
    // 言語別：その書式の言語のロケールを既定にし、レイアウトは1つだけ。和文は多言語版と同じく “ ” に上書きする。
    const body = only ? [
      localeXml(only, model.terms && model.terms[only], only === 'ja' ? quoteOpts : { options: quoteOpts.options }),
      ...macros,
      `<citation${citeAttrs}>`,
      `<layout${lay(only, 'cite')}><text macro="cite-${only}"/></layout>`,
      '</citation>',
      '<bibliography>',
      sort,
      `<layout${lay(only, 'bib')}><text macro="bib-${only}"/></layout>`,
      '</bibliography>',
    ] : null;
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      opts.embed === false ? '' : embedModel(model),
      `<style xmlns="http://purl.org/net/xbiblio/csl" class="${kind === 'note' ? 'note' : 'in-text'}" version="1.0" default-locale="${only ? (ONLY_LOCALE[only] || only) : 'ja-JP'}" page-range-format="expanded">`,
      '<info>',
      `<title>${esc(title)}</title>`,
      `<id>${esc(id)}</id>`,
      `<category citation-format="${kind}"/>`,
      `<summary>${esc('引用スタイル（CSL）編集アプリで作成')}</summary>`,
      `<updated>${now}</updated>`,
      `<rights license="https://creativecommons.org/licenses/by-sa/3.0/">${esc(info.rights || 'This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License')}</rights>`,
      '</info>',
      ...(body || [
      // 句読点を引用符の内側に入れる設定は、既定ロケール（ja）に置かないと欧文のレイアウトにも効かない（citeproc-js で確認）。
      localeXml('ja', model.terms && model.terms.ja, quoteOpts),
      localeXml('en', model.terms && model.terms.en),
      ...extras.map((k) => localeXml(k, model.terms && model.terms[k])),
      ...macros,
      `<citation${citeAttrs}>`,
      ...extras.map((k) => `<layout locale="${k}"${lay(k, 'cite')}><text macro="cite-${k}"/></layout>`),
      `<layout locale="${esc(euroAttr)}"${lay('en', 'cite')}><text macro="cite-en"/></layout>`,
      `<layout${lay('ja', 'cite')}><text macro="cite-ja"/></layout>`,
      '</citation>',
      '<bibliography>',
      sort,
      ...extras.map((k) => `<layout locale="${k}"${lay(k, 'bib')}><text macro="bib-${k}"/></layout>`),
      `<layout locale="${esc(euroAttr)}"${lay('en', 'bib')}><text macro="bib-en"/></layout>`,
      `<layout${lay('ja', 'bib')}><text macro="bib-ja"/></layout>`,
      '</bibliography>',
      ]),
      '</style>',
    ].filter(Boolean).join('\n');
    return ctx ? { xml, marks: ctx.marks } : xml;
  }

  // 文献がどちらの系統で組まれるか（citeproc-js の振り分けに合わせる）。
  // 返り値 { sys:'ja'|'en'|言語ごとの書式のキー, warn: null|'empty'|'unknown'|'other' }
  function systemOfItem(item, euroLangs, extras) {
    const raw = (item.language || '').trim();
    if (!raw) return { sys: 'ja', warn: 'empty' };
    const primary = raw.toLowerCase().split(/[-_]/)[0];
    if ((extras || []).includes(primary)) return { sys: primary, warn: null };
    if ((euroLangs || ['en']).includes(primary)) return { sys: 'en', warn: null };
    if (primary === 'ja') return { sys: 'ja', warn: null };
    if (/^[a-z]{2,3}$/.test(primary) && primary !== 'jpn' && primary !== 'eng') return { sys: 'ja', warn: 'other' };
    return { sys: 'ja', warn: 'unknown' };
  }

  // 言語ごとの書式のキー（ja・en 以外）。並びは足した順。
  const LANG_KEY_RE = /^[a-z]{2,3}$/;
  function extraLangs(model) {
    return (model.extraLangs || []).filter((k) => LANG_KEY_RE.test(k) && k !== 'ja' && k !== 'en' && model.systems && model.systems[k]);
  }

  const api = {
    extraLangs, LANG_KEY_RE,
    FIELDS, TYPE_TABS, TERM_ROWS, WRAPS, tabOfType, tabsOf, ZOTERO_TYPES, CSL_TYPES, cslTypeLabel, generate, systemOfItem,
    embedModel, extractModel, MARK_OPEN, MARK_CLOSE, MARK_BASE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CSLGen = api;
})(typeof self !== 'undefined' ? self : this);
