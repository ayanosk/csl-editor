// 似ている型（Chicago・APA・MLA・IEEE の4つ）。欧文の系統はそれぞれの典型的な形にし、
// 和文の系統はそれぞれの示し方（注・著者年・著者頁・番号）を日本語の書き方に移したもの。
//   chicago  注で示す        和文＝山本花子『書名』越後書房、2024年。
//   apa      著者と年で示す  和文＝山本花子（2024）『書名』越後書房。（山本, 2024, 42頁）
//   mla      著者と頁で示す  和文＝注と同じ形の参考文献。（山本 42頁）
//   ieee     番号で示す      和文＝[1] 山本花子『書名』越後書房、2024年。[1, 42頁]
(function (root) {
  'use strict';

  const F = (f, o = {}) => ({ t: 'field', f, prefix: o.prefix || '', suffix: o.suffix || '', wrap: o.wrap || 'none', italic: !!o.italic, caps: o.caps || 'none', opt: o.opt || {} });
  const S = (v) => ({ t: 'sep', v });
  // まとまり〔 〕。中が全部空なら、前後の文字（prefix・suffix）ごと消える（CSL の group）。
  const Grp = (chips, prefix = '', suffix = '') => [{ t: 'open', prefix }, ...chips, { t: 'close', suffix }];

  const JA_NAMES = { delimiter: '・', and: 'none', precedesEtAl: 'never', etAlMin: 4, etAlUseFirst: 1, initialize: false, roleAfterPrefix: '', roleBeforeSuffix: '', substituteRole: 'after' };
  const EN_NAMES = { delimiter: ', ', and: 'text', precedesLast: 'contextual', precedesLastInverted: 'always', precedesEtAl: 'never', etAlMin: 11, etAlUseFirst: 7, initialize: false, initializeWith: '. ', sortSeparator: ', ', roleAfterPrefix: ', ', roleBeforeSuffix: ' ', substituteRole: 'after' };

  const TERMS_JA = {
    page: '頁', pages: '頁', volume: '巻', volumes: '巻', issue: '号', edition: '版',
    editor: '編', editors: '編', 'editor-verb': '編', translator: '訳', translators: '訳', 'translator-verb': '訳',
    'et-al': 'ほか', and: '・', accessed: '参照', 'page-range-delimiter': '-',
    recipient: '宛', 'recipient-verb': '宛', number: '号',
  };
  const TERMS_EN = {
    page: 'p.', pages: 'pp.', volume: 'vol.', volumes: 'vols.', issue: 'no.', edition: 'ed.',
    editor: 'ed.', editors: 'eds.', 'editor-verb': 'edited by', translator: 'trans.', translators: 'trans.', 'translator-verb': 'translated by',
    'et-al': 'et al.', and: 'and', accessed: 'accessed', 'page-range-delimiter': '–',
    recipient: 'to', 'recipient-verb': 'to', number: 'no.',
  };

  // ---- 和文：注形式（Chicago・MLA・IEEE の参考文献もこの形） ----
  const JA_NOTE_BIB = {
    book: [F('author'), F('title', { wrap: 'nijukagi' }), F('translator', { suffix: '、', opt: { role: 'after' } }), F('publisher'), S('、'), F('issued', { suffix: '年' })],
    chapter: [F('author'), F('title', { wrap: 'kagi' }), F('editor', { opt: { role: 'after' } }), F('container-title', { wrap: 'nijukagi' }), F('publisher'), S('、'), F('issued', { suffix: '年' }), S('、'), F('page', { opt: { label: 'after' } })],
    article: [F('author'), F('title', { wrap: 'kagi' }), F('container-title', { wrap: 'nijukagi' }), F('volume', { opt: { label: 'after' } }), F('issue', { opt: { label: 'after' } }), S('、'), F('issued', { suffix: '年' }), S('、'), F('page', { opt: { label: 'after' } })],
    web: [F('author'), F('title', { wrap: 'kagi' }), S('、'), F('container-title'), S('、'), F('URL'), F('accessed', { prefix: '（', suffix: '）', opt: { form: 'ymd', label: 'after' } })],
    other: [F('author'), F('title', { wrap: 'nijukagi' }), F('publisher'), S('、'), F('issued', { suffix: '年' })],
  };
  // 注は「参考文献と同じ形＋頁」。本の章と雑誌論文は掲載頁の代わりに引用頁を置く。
  function noteFromBib(bib) {
    const out = {};
    for (const [k, chips] of Object.entries(bib)) {
      let c = clone(chips);
      const i = c.findIndex((x) => x.t === 'field' && x.f === 'page');
      if (i >= 0) c[i] = F('locator', { opt: { label: 'after' } });
      else c.push(S('、'), F('locator', { opt: { label: 'after' } }));
      out[k] = c;
    }
    return out;
  }

  // ---- 欧文 Chicago（第18版。出版地は書かない） ----
  const CHI_BIB = {
    book: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { italic: true }), S('. '), F('translator', { caps: 'capitalize-first', opt: { role: 'before' } }), S('. '), ...Grp([F('publisher'), S(', '), F('issued')])],
    chapter: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'dquote' }), S('. '), ...Grp([F('container-title', { prefix: 'In ', italic: true }), S(', '), F('editor', { opt: { role: 'before' } }), S(', '), F('page')]), S('. '), ...Grp([F('publisher'), S(', '), F('issued')])],
    article: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'dquote' }), S('. '), F('container-title', { italic: true }), S(' '), F('volume'), S(', '), F('issue', { opt: { label: 'before' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S(': '), F('page')],
    web: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'dquote' }), S('. '), F('container-title'), S('. '), F('accessed', { prefix: 'Accessed ', opt: { form: 'ymd' } }), S('. '), F('URL')],
    other: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { italic: true }), S('. '), ...Grp([F('publisher'), S(', '), F('issued')])],
  };
  // 注の訳者・編者は短い形を前に置く（trans. Anna Hughes）。出版者と年は〔( 出版者, 年 )〕のまとまり。
  const CHI_NOTE = {
    book: [F('author'), S(', '), F('title', { italic: true }), S(', '), F('translator', { opt: { role: 'before', roleForm: 'short' } }), S(' '), ...Grp([F('publisher'), S(', '), F('issued')], '(', ')'), S(', '), F('locator')],
    chapter: [F('author'), S(', '), F('title', { wrap: 'dquote' }), S(', '), ...Grp([F('container-title', { prefix: 'in ', italic: true }), S(', '), F('editor', { opt: { role: 'before', roleForm: 'short' } })]), S(' '), ...Grp([F('publisher'), S(', '), F('issued')], '(', ')'), S(', '), F('locator')],
    article: [F('author'), S(', '), F('title', { wrap: 'dquote' }), S(', '), F('container-title', { italic: true }), S(' '), F('volume'), S(', '), F('issue', { opt: { label: 'before' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S(': '), F('locator')],
    web: [F('author'), S(', '), F('title', { wrap: 'dquote' }), S(', '), F('container-title'), S(', '), F('accessed', { prefix: 'accessed ', opt: { form: 'ymd' } }), S(', '), F('URL')],
    other: [F('author'), S(', '), F('title', { italic: true }), S(' '), ...Grp([F('publisher'), S(', '), F('issued')], '(', ')'), S(', '), F('locator')],
  };

  // ---- 欧文 APA（第7版） ----
  const APA_NAMES = { ...EN_NAMES, and: 'symbol', initialize: true, etAlMin: 21, etAlUseFirst: 19 };
  const APA_BIB = {
    book: [F('author', { opt: { order: 'family-all' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S('. '), F('title', { italic: true }), S(' '), F('translator', { prefix: '(', suffix: ')', opt: { role: 'after' } }), S('. '), F('publisher')],
    chapter: [F('author', { opt: { order: 'family-all' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S('. '), F('title'), S('. '), ...Grp([F('editor', { suffix: ' (Ed.)' }), S(', '), F('container-title', { italic: true }), S(' '), F('page', { prefix: '(', suffix: ')', opt: { label: 'before' } })], 'In '), S('. '), F('publisher')],
    article: [F('author', { opt: { order: 'family-all' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S('. '), F('title'), S('. '), ...Grp([F('container-title', { italic: true }), S(', '), F('volume', { italic: true }), S(''), F('issue', { prefix: '(', suffix: ')' }), S(', '), F('page')])],
    web: [F('author', { opt: { order: 'family-all' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S('. '), F('title', { italic: true }), S('. '), F('container-title'), S('. '), F('URL')],
    other: [F('author', { opt: { order: 'family-all' } }), S(' '), F('issued', { prefix: '(', suffix: ')' }), S('. '), F('title', { italic: true }), S('. '), F('publisher')],
  };
  const APA_CITE = [F('author', { opt: { form: 'short' } }), S(', '), F('issued'), S(', '), F('locator', { opt: { label: 'before' } })];

  // ---- 欧文 MLA（第9版） ----
  const MLA_BIB = {
    // 題名の後は「. 」、そこから先（MLA のいう container）は〔 〕にまとめて「, 」でつなぐ。訳者などが空でも「題名. 出版者」になる。
    book: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { italic: true }), S('. '), ...Grp([F('translator', { caps: 'capitalize-first', opt: { role: 'before' } }), S(', '), F('publisher'), S(', '), F('issued')])],
    chapter: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'dquote' }), S('. '), ...Grp([F('container-title', { italic: true }), S(', '), F('editor', { opt: { role: 'before' } }), S(', '), F('publisher'), S(', '), F('issued'), S(', '), F('page', { opt: { label: 'before' } })])],
    article: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'dquote' }), S('. '), ...Grp([F('container-title', { italic: true }), S(', '), F('volume', { opt: { label: 'before' } }), S(', '), F('issue', { opt: { label: 'before' } }), S(', '), F('issued'), S(', '), F('page', { opt: { label: 'before' } })])],
    web: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'dquote' }), S('. '), ...Grp([F('container-title', { italic: true }), S(', '), F('URL')]), S('. '), F('accessed', { prefix: 'Accessed ', opt: { form: 'ymd' } })],
    other: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { italic: true }), S('. '), ...Grp([F('publisher'), S(', '), F('issued')])],
  };
  const MLA_CITE = [F('author', { opt: { form: 'short' } }), S(' '), F('locator')];

  // ---- 欧文 IEEE ----
  const IEEE_NAMES = { ...EN_NAMES, initialize: true, etAlMin: 7, etAlUseFirst: 1 };
  const IEEE_BIB = {
    book: [F('author'), S(', '), F('title', { italic: true }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')])],
    chapter: [F('author'), S(', '), F('title', { wrap: 'dquote' }), S(', '), F('container-title', { prefix: 'in ', italic: true }), S(', '), F('editor', { opt: { role: 'after' } }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued'), S(', '), F('page', { opt: { label: 'before' } })])],
    article: [F('author'), S(', '), F('title', { wrap: 'dquote' }), S(', '), F('container-title', { italic: true }), S(', '), F('volume', { opt: { label: 'before' } }), S(', '), F('issue', { opt: { label: 'before' } }), S(', '), F('page', { opt: { label: 'before' } }), S(', '), F('issued')],
    web: [F('author'), S(', '), F('title', { wrap: 'dquote' }), S(', '), F('container-title', { italic: true }), S('. '), F('URL'), S(' '), F('accessed', { prefix: '(accessed ', suffix: ')', opt: { form: 'ymd' } })],
    other: [F('author'), S(', '), F('title', { italic: true }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')])],
  };

  // ---- 和文：著者年形式（APA） ----
  const JA_AD_BIB = {
    book: [F('author'), F('issued', { prefix: '（', suffix: '）' }), F('title', { wrap: 'nijukagi' }), F('translator', { suffix: '、', opt: { role: 'after' } }), F('publisher')],
    chapter: [F('author'), F('issued', { prefix: '（', suffix: '）' }), F('title', { wrap: 'kagi' }), F('editor', { opt: { role: 'after' } }), F('container-title', { wrap: 'nijukagi' }), F('publisher'), S('、'), F('page', { opt: { label: 'after' } })],
    article: [F('author'), F('issued', { prefix: '（', suffix: '）' }), F('title', { wrap: 'kagi' }), F('container-title', { wrap: 'nijukagi' }), F('volume', { opt: { label: 'after' } }), F('issue', { opt: { label: 'after' } }), S('、'), F('page', { opt: { label: 'after' } })],
    web: [F('author'), F('issued', { prefix: '（', suffix: '）' }), F('title', { wrap: 'kagi' }), S('、'), F('URL'), F('accessed', { prefix: '（', suffix: '）', opt: { form: 'ymd', label: 'after' } })],
    other: [F('author'), F('issued', { prefix: '（', suffix: '）' }), F('title', { wrap: 'nijukagi' }), F('publisher')],
  };

  function allTabs(chips) {
    const o = {};
    for (const k of ['book', 'chapter', 'article', 'web', 'other']) o[k] = clone(chips);
    return o;
  }
  function withNumber(bib, sep) {
    const o = {};
    // 区切りのチップにすると、著者が空の文献で番号の後の空白ごと消えるので、番号の後ろに付ける。
    // 番号の後ろはまとまりにする（著者が空でも「[1] , 書名」にならない）。
    for (const [k, c] of Object.entries(bib)) o[k] = [F('citation-number', { prefix: '[', suffix: ']' + sep }), ...Grp(clone(c))];
    return o;
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function system(label, names, bib, cite, layout, labelSpace) {
    return { label, names: clone(names), bib: clone(bib), cite: clone(cite), layout: clone(layout), labelSpace };
  }

  // en と ja は、選ぶ画面に出す見本（見本データの欧文と和文の本を組んだもの）。
  const STARTERS = {
    chicago: {
      label: 'Chicago',
      name: 'Chicago 風', // 画面に出す名前。公式のスタイルではないので「風」を付ける
      how: '注で示す（歴史学・人文学）',
      en: 'Léa Dubois and Jules Moreau, Numbers in the Archive, trans. Anna Hughes (Example University Press, 2019), 42.',
      ja: '山本花子『デジタル史料学入門』越後書房、2024年、42頁。',
      build: () => ({
        kind: 'note',
        citeLayout: { delimiter: '；' },
        systems: {
          ja: system('和文', JA_NAMES, JA_NOTE_BIB, noteFromBib(JA_NOTE_BIB), { bib: { suffix: '。' }, cite: { suffix: '。' } }, ''),
          en: system('欧文', EN_NAMES, CHI_BIB, CHI_NOTE, { bib: { suffix: '.' }, cite: { suffix: '.' } }, ' '),
        },
      }),
    },
    apa: {
      label: 'APA',
      name: 'APA 風', // 画面に出す名前。公式のスタイルではないので「風」を付ける
      how: '著者名と出版年で示す（心理学・社会科学・教育学）',
      en: '（Dubois & Moreau, 2019, p. 42）　Dubois, L., & Moreau, J. (2019). Numbers in the Archive (A. Hughes, Trans.). Example University Press.',
      ja: '（山本, 2024, 42頁）　山本花子（2024）『デジタル史料学入門』越後書房。',
      build: () => ({
        kind: 'author-date',
        citeLayout: { prefix: '（', suffix: '）', delimiter: '；' },
        systems: {
          ja: system('和文', JA_NAMES, JA_AD_BIB, allTabs([F('author', { opt: { form: 'short' } }), S(', '), F('issued'), S(', '), F('locator', { opt: { label: 'after' } })]), { bib: { suffix: '。' } }, ''),
          en: system('欧文', APA_NAMES, APA_BIB, allTabs(APA_CITE), { bib: { suffix: '.' } }, ' '),
        },
      }),
    },
    mla: {
      label: 'MLA',
      name: 'MLA 風', // 画面に出す名前。公式のスタイルではないので「風」を付ける
      how: '著者名と頁で示す（文学・語学）',
      en: '（Dubois and Moreau 42）　Dubois, Léa, and Jules Moreau. Numbers in the Archive. Translated by Anna Hughes, Example University Press, 2019.',
      ja: '（山本 42頁）　山本花子『デジタル史料学入門』越後書房、2024年。',
      build: () => ({
        kind: 'author',
        citeLayout: { prefix: '（', suffix: '）', delimiter: '；' },
        systems: {
          ja: system('和文', JA_NAMES, JA_NOTE_BIB, allTabs([F('author', { opt: { form: 'short' } }), S(' '), F('locator', { opt: { label: 'after' } })]), { bib: { suffix: '。' } }, ''),
          en: system('欧文', EN_NAMES, MLA_BIB, allTabs(MLA_CITE), { bib: { suffix: '.' } }, ' '),
        },
      }),
    },
    ieee: {
      label: 'IEEE',
      name: 'IEEE 風', // 画面に出す名前。公式のスタイルではないので「風」を付ける
      how: '角括弧の番号で示す（電気・電子・情報工学）',
      en: '[1, p. 42]　[1] L. Dubois and J. Moreau, Numbers in the Archive. London: Example University Press, 2019.',
      ja: '[1, 42頁]　[1] 山本花子『デジタル史料学入門』越後書房、2024年。',
      build: () => ({
        kind: 'numeric',
        citeLayout: { prefix: '[', suffix: ']', delimiter: '; ' },
        systems: {
          ja: system('和文', JA_NAMES, withNumber(JA_NOTE_BIB, ' '), allTabs([F('citation-number'), S(', '), F('locator', { opt: { label: 'after' } })]), { bib: { suffix: '。' } }, ''),
          en: system('欧文', IEEE_NAMES, withNumber(IEEE_BIB, ' '), allTabs([F('citation-number'), S(', '), F('locator', { opt: { label: 'before' } })]), { bib: { suffix: '.' } }, ' '),
        },
      }),
    },
  };

  function makeStarter(key) {
    const s = STARTERS[key];
    const m = s.build();
    m.version = 1;
    m.starter = key;
    // スタイル名は半角の英字・数字と _ - . ( ) と空白だけ（app.js の TITLE_OK）。
    m.info = { title: 'My_' + s.label + '_style', id: '', rights: '' };
    m.euroLangs = ['en', 'fr', 'de', 'it', 'es', 'nl', 'la'];
    m.extraLangs = [];
    if (m.kind === 'note') { m.subsequent = true; ensureSubsequent(m); }
    m.sortByLanguage = m.kind !== 'numeric';
    // 番号形式でない型は、参考文献をぶら下げで組む（Chicago・APA・MLA の決まり）
    if (m.kind !== 'numeric') m.bibAttrs = { 'hanging-indent': 'true' };
    m.terms = { ja: { ...TERMS_JA }, en: { ...TERMS_EN } };
    if (key === 'apa') Object.assign(m.terms.en, { translator: 'Trans.', translators: 'Trans.', editor: 'Ed.', editors: 'Eds.' });
    if (key === 'ieee') Object.assign(m.terms.en, { editor: 'Ed.', editors: 'Eds.' });
    return m;
  }

  // ---- 2回目以降の注（注形式だけ） ----
  // 2回目以降（間を挟んで）：著者は姓だけ、題名は短い形（Zotero の「短いタイトル」、無ければ題名）、引用頁。
  // 直前と同じ文書：「同上」「Ibid.」と引用頁（頁も同じなら、生成側で引用頁を外す）。
  const QUOTED_TABS = ['chapter', 'article', 'web'];
  const TARGETS = ['bib', 'cite', 'citeSub', 'citeIbid'];
  function subDefaults(sysKey, tabKeys) {
    const ja = sysKey === 'ja';
    const sub = {}, ibid = {};
    for (const k of tabKeys) {
      const quoted = QUOTED_TABS.includes(k);
      sub[k] = ja
        ? [F('author', { opt: { form: 'short' } }), F('title', { wrap: quoted ? 'kagi' : 'nijukagi', opt: { form: 'short' } }), F('locator', { opt: { label: 'after' } })]
        : [F('author', { opt: { form: 'short' } }), S(', '), F('title', quoted ? { wrap: 'dquote', opt: { form: 'short' } } : { italic: true, opt: { form: 'short' } }), S(', '), F('locator')];
      ibid[k] = ja
        ? [F('literal', { opt: { value: '同上' } }), S('、'), F('locator', { opt: { label: 'after' } })]
        : [F('literal', { opt: { value: 'Ibid.' } }), S(', '), F('locator')];
    }
    return { sub, ibid };
  }
  // 2回目以降の注の型。short＝著者『書名』・Author, Short Title／ibid-like＝著者、前掲書・Author, op. cit.
  const PREV_JA = { book: '前掲書', other: '前掲書', chapter: '前掲論文', article: '前掲論文', web: '前掲' };
  function subPreset(sysKey, tabKeys, kind) {
    if (kind === 'short') return subDefaults(sysKey, tabKeys).sub;
    const o = {};
    for (const k of tabKeys) {
      o[k] = sysKey === 'ja'
        ? [F('author', { opt: { form: 'short' } }), S('、'), F('literal', { opt: { value: PREV_JA[k] || '前掲書' } }), S('、'), F('locator', { opt: { label: 'after' } })]
        : [F('author', { opt: { form: 'short' } }), S(', '), F('literal', { opt: { value: 'op. cit.' } }), S(', '), F('locator')];
    }
    return o;
  }
  // まだ持っていない書式に、2回目以降の注の既定の並びを入れる。
  function ensureSubsequent(model) {
    for (const [sk, sys] of Object.entries(model.systems || {})) {
      if (sys.citeSub && sys.citeIbid) continue;
      const d = subDefaults(sk, Object.keys(sys.cite || {}));
      if (!sys.citeSub) sys.citeSub = d.sub;
      if (!sys.citeIbid) sys.citeIbid = d.ibid;
    }
  }

  // ---- 言語ごとの書式（欧文の書式を写して、用語だけその言語の初期値にする） ----
  const LANG_NAMES = {
    fr: 'フランス語', de: 'ドイツ語', it: 'イタリア語', es: 'スペイン語', nl: 'オランダ語', pt: 'ポルトガル語',
    la: 'ラテン語', ru: 'ロシア語', pl: 'ポーランド語', cs: 'チェコ語', sv: 'スウェーデン語', da: 'デンマーク語',
    el: 'ギリシア語', zh: '中国語', ko: '韓国語', ar: 'アラビア語', tr: 'トルコ語', fa: 'ペルシア語', he: 'ヘブライ語',
    vi: 'ベトナム語', uk: 'ウクライナ語',
  };
  // このアプリに入れたロケール（プレビューの月名など）。ここに無い言語は英語のロケールで代わりに組む。
  const BUNDLED_LOCALES = ['ja', 'en', 'fr', 'de', 'it', 'es', 'nl', 'pt', 'la', 'ru', 'zh', 'ko', 'ar', 'tr'];
  // 用語の初期値。ここに無い言語は英語の用語を写す。どれも足場で、学生が用語表で直す前提。
  const LANG_TERMS = {
    fr: { page: 'p.', pages: 'p.', volume: 'vol.', volumes: 'vol.', issue: 'n°', edition: 'éd.', editor: 'éd.', editors: 'éd.', 'editor-verb': 'sous la direction de', translator: 'trad.', translators: 'trad.', 'translator-verb': 'traduit par', 'et-al': 'et al.', and: 'et', accessed: 'consulté le', 'page-range-delimiter': '-', recipient: 'à', 'recipient-verb': 'à', number: 'n°' },
    de: { page: 'S.', pages: 'S.', volume: 'Bd.', volumes: 'Bde.', issue: 'H.', edition: 'Aufl.', editor: 'Hrsg.', editors: 'Hrsg.', 'editor-verb': 'herausgegeben von', translator: 'Übers.', translators: 'Übers.', 'translator-verb': 'übersetzt von', 'et-al': 'u. a.', and: 'und', accessed: 'zugegriffen am', 'page-range-delimiter': '–', recipient: 'an', 'recipient-verb': 'an', number: 'Nr.' },
    it: { page: 'p.', pages: 'pp.', volume: 'vol.', volumes: 'voll.', issue: 'n.', edition: 'ed.', editor: 'a cura di', editors: 'a cura di', 'editor-verb': 'a cura di', translator: 'trad.', translators: 'trad.', 'translator-verb': 'tradotto da', 'et-al': 'et al.', and: 'e', accessed: 'consultato il', 'page-range-delimiter': '-', recipient: 'a', 'recipient-verb': 'a', number: 'n.' },
    es: { page: 'p.', pages: 'pp.', volume: 'vol.', volumes: 'vols.', issue: 'n.º', edition: 'ed.', editor: 'ed.', editors: 'eds.', 'editor-verb': 'editado por', translator: 'trad.', translators: 'trads.', 'translator-verb': 'traducido por', 'et-al': 'et al.', and: 'y', accessed: 'consultado el', 'page-range-delimiter': '-', recipient: 'a', 'recipient-verb': 'a', number: 'n.º' },
  };
  function langName(k) { return k === 'ja' ? '和文' : k === 'en' ? '欧文' : (LANG_NAMES[k] || k); }

  // ---- 言語ごとの既定の書式（その言語の人文学の論文で一般的な書き方） ----
  // 注の形を基本にし、参考文献は注から引用箇所を除いた形（言語によっては姓を前に出す）。
  // 典拠は各項目の src。どれも足場で、投稿先の規定に合わせて直す前提。
  // 注形式以外の型（著者年・番号など）では、参考文献にだけこの形を使い、本文中の引用は欧文の書式を写す。
  const NBSP = ' ';
  // 引用箇所の部品。label＝用語表の頁の語を前に置く（p. 42）。pre/post＝字をじかに付ける（第42页）。
  const LOC = (o = {}) => F('locator', o.label ? { opt: { label: o.label } } : { prefix: o.pre || '', suffix: o.post || '' });
  const PAGE = (o = {}) => F('page', o.label ? { opt: { label: o.label } } : { prefix: o.pre || '', suffix: o.post || '' });
  // 参考文献の並び → 注の並び。掲載頁を引用箇所に替え、無ければ末尾に区切りと引用箇所を足す。
  function presetNote(bib, sep, loc) {
    const out = {};
    for (const [k, chips] of Object.entries(bib)) {
      const c = clone(chips);
      // ウェブページの注には引用箇所を付けない（欧文の書式と同じ）
      if (k === 'web') { out[k] = c; continue; }
      const i = c.findIndex((x) => x.t === 'field' && x.f === 'page');
      const l = clone(loc);
      if (i >= 0) { l.prefix = c[i].prefix; l.suffix = c[i].suffix; if (c[i].opt.label) l.opt = { label: c[i].opt.label }; c[i] = l; } else c.push(S(sep), l);
      out[k] = c;
    }
    return out;
  }
  const subBy = (fn) => (tab) => fn(tab, QUOTED_TABS.includes(tab));

  const ZH_NAMES = { ...JA_NAMES, delimiter: '、', etAlMin: 4, etAlUseFirst: 1 };
  const LANG_PRESETS = [
    {
      id: 'zh-cn', lang: 'zh', name: '中国語（大陸式）', ex: '韩庆祥：《21世纪马克思主义的基础性问题》，《中国社会科学》2022年第4期。',
      src: '中国社会科学杂志社「期刊引文注释规定」（2026年修订）',
      names: ZH_NAMES, layout: { bib: { suffix: '。' }, cite: { suffix: '。' } }, labelSpace: '',
      terms: { page: '页', pages: '页', volume: '卷', issue: '期', edition: '版', editor: '主编', editors: '主编', 'editor-verb': '主编', translator: '译', translators: '译', 'translator-verb': '译', 'et-al': '等', and: '、', accessed: '', 'page-range-delimiter': '—' },
      bib: {
        book: [F('author'), S('：'), F('title', { wrap: 'zhbook' }), S('，'), F('translator', { opt: { role: 'after' } }), S('，'), F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued', { suffix: '年' })],
        chapter: [F('author'), S('：'), F('title', { wrap: 'zhbook' }), S('，'), ...Grp([F('editor', { suffix: '：', opt: { role: 'after' } }), F('container-title', { wrap: 'zhbook' })]), S('，'), F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued', { suffix: '年' }), S('，'), PAGE({ pre: '第', post: '页' })],
        article: [F('author'), S('：'), F('title', { wrap: 'zhbook' }), S('，'), F('container-title', { wrap: 'zhbook' }), F('issued', { suffix: '年' }), F('volume', { prefix: '第', suffix: '卷' }), F('issue', { prefix: '第', suffix: '期' })],
        web: [F('author'), S('：'), F('title', { wrap: 'zhbook' }), S('，'), F('container-title'), S('，'), F('issued', { opt: { form: 'ymd' } }), S('，'), F('URL'), S('，'), F('accessed', { opt: { form: 'ymd' } })],
        other: [F('author'), S('：'), F('title', { wrap: 'zhbook' }), S('，'), F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued', { suffix: '年' })],
      },
      loc: LOC({ pre: '第', post: '页' }), locSep: '，',
      sub: subBy(() => [F('author', { opt: { form: 'short' } }), S('：'), F('title', { wrap: 'zhbook', opt: { form: 'short' } }), S('，'), LOC({ pre: '第', post: '页' })]),
      ibid: subBy(() => [F('literal', { opt: { value: '同上' } }), S('，'), LOC({ pre: '第', post: '页' })]),
    },
    {
      id: 'zh-tw', lang: 'zh', name: '中国語（台湾式）', ex: '李定一，《中華史綱》(臺北：傳記文學出版社，1986)，頁38-45。',
      src: '《國立政治大學歷史學報》撰稿格式',
      names: ZH_NAMES, layout: { bib: { suffix: '。' }, cite: { suffix: '。' } }, labelSpace: '',
      terms: { page: '頁', pages: '頁', volume: '卷', issue: '期', edition: '版', editor: '編', editors: '編', 'editor-verb': '編', translator: '譯', translators: '譯', 'translator-verb': '譯', 'et-al': '等', and: '、', accessed: '檢索日期', 'page-range-delimiter': '-' },
      // 参考文献は括弧を外して「地：社，年」。注は「(地：社，年)」。
      bib: {
        book: [F('author'), S('，'), F('title', { wrap: 'zhbook' }), S('，'), F('translator', { opt: { role: 'after' } }), S('，'), F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued')],
        chapter: [F('author'), S('，'), F('title', { wrap: 'zharticle' }), S('，'), ...Grp([F('editor', { opt: { role: 'after' } }), S('，'), F('container-title', { wrap: 'zhbook' })], '收入'), S('，'), F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued'), S('，'), PAGE({ pre: '頁' })],
        article: [F('author'), S('，'), F('title', { wrap: 'zharticle' }), S('，'), F('container-title', { wrap: 'zhbook' }), S('，'), ...Grp([F('volume', { prefix: '第', suffix: '卷' }), F('issue', { prefix: '第', suffix: '期' })]), F('issued', { prefix: '(', suffix: ')' }), S('，'), PAGE({ pre: '頁' })],
        web: [F('author'), S('，'), F('title', { wrap: 'zharticle' }), S('，'), F('container-title', { wrap: 'zhbook' }), S('，'), F('URL'), F('accessed', { prefix: '（檢索日期：', suffix: '）', opt: { form: 'ymd' } })],
        other: [F('author'), S('，'), F('title', { wrap: 'zhbook' }), S('，'), F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued')],
      },
      note: {
        book: [F('author'), S('，'), F('title', { wrap: 'zhbook' }), S('，'), F('translator', { opt: { role: 'after' } }), ...Grp([F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued')], '(', ')'), S('，'), LOC({ pre: '頁' })],
        chapter: [F('author'), S('，'), F('title', { wrap: 'zharticle' }), S('，'), ...Grp([F('editor', { opt: { role: 'after' } }), S('，'), F('container-title', { wrap: 'zhbook' })], '收入'), ...Grp([F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued')], '(', ')'), S('，'), LOC({ pre: '頁' })],
        article: [F('author'), S('，'), F('title', { wrap: 'zharticle' }), S('，'), F('container-title', { wrap: 'zhbook' }), S('，'), ...Grp([F('volume', { prefix: '第', suffix: '卷' }), F('issue', { prefix: '第', suffix: '期' })]), F('issued', { prefix: '(', suffix: ')' }), S('，'), LOC({ pre: '頁' })],
        web: [F('author'), S('，'), F('title', { wrap: 'zharticle' }), S('，'), F('container-title', { wrap: 'zhbook' }), S('，'), F('URL'), F('accessed', { prefix: '（檢索日期：', suffix: '）', opt: { form: 'ymd' } })],
        other: [F('author'), S('，'), F('title', { wrap: 'zhbook' }), ...Grp([F('publisher-place'), S('：'), F('publisher'), S('，'), F('issued')], '(', ')'), S('，'), LOC({ pre: '頁' })],
      },
      // この規定は「同上」「同前引書」を使わず、2回目以降はいつも短縮形にする。
      sub: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S('，'), F('title', { wrap: q ? 'zharticle' : 'zhbook', opt: { form: 'short' } }), S('，'), LOC({ pre: '頁' })]),
      ibid: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S('，'), F('title', { wrap: q ? 'zharticle' : 'zhbook', opt: { form: 'short' } }), S('，'), LOC({ pre: '頁' })]),
    },
    {
      id: 'ko', lang: 'ko', name: '韓国語', ex: '진홍섭, 『韓國金屬工藝』, 일지사, 1980, 25쪽.',
      src: '『文物硏究』執筆要領（KCI）、『사학연구』投稿規定',
      names: { ...JA_NAMES, delimiter: '･', etAlMin: 4, etAlUseFirst: 1, roleAfterPrefix: ' ' }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: '',
      terms: { page: '쪽', pages: '쪽', volume: '권', issue: '호', edition: '판', editor: '편', editors: '편', 'editor-verb': '편', translator: '옮김', translators: '옮김', 'translator-verb': '옮김', 'et-al': '외', and: '･', accessed: '검색일', 'page-range-delimiter': '~' },
      bib: {
        book: [F('author'), F('translator', { prefix: '(', suffix: ')', opt: { role: 'after' } }), S(', '), F('title', { wrap: 'nijukagi' }), S(', '), F('publisher'), S(', '), F('issued')],
        chapter: [F('author'), S(', '), F('title', { wrap: 'kagi' }), S(', '), F('container-title', { wrap: 'nijukagi' }), F('editor', { prefix: '(', suffix: ')', opt: { role: 'after' } }), S(', '), F('publisher'), S(', '), F('issued'), S(', '), PAGE({ post: '쪽' })],
        article: [F('author'), S(', '), F('title', { wrap: 'kagi' }), S(', '), F('container-title', { wrap: 'nijukagi' }), F('volume', { prefix: ' ', suffix: '권' }), F('issue', { prefix: ' ', suffix: '호' }), S(', '), F('issued'), S(', '), PAGE({ post: '쪽' })],
        web: [F('author'), S(', '), F('title', { wrap: 'kagi' }), S(', '), F('container-title'), S(', '), F('URL'), F('accessed', { prefix: '(검색일: ', suffix: ')', opt: { form: 'numeric' } })],
        other: [F('author'), S(', '), F('title', { wrap: 'nijukagi' }), S(', '), F('publisher'), S(', '), F('issued')],
      },
      loc: LOC({ post: '쪽' }), locSep: ', ',
      // 直前の文献は「위의 책／위의 논문」、それより前の文献は「앞의 책／앞의 논문」。
      sub: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S(', '), F('literal', { opt: { value: q ? '앞의 논문' : '앞의 책' } }), S(', '), LOC({ post: '쪽' })]),
      ibid: subBy((tab, q) => [F('literal', { opt: { value: q ? '위의 논문' : '위의 책' } }), S(', '), LOC({ post: '쪽' })]),
    },
    {
      id: 'ru', lang: 'ru', name: 'ロシア語', ex: 'Корявко В. И. Эволюция форм применения // Воен. мысль. 2006. № 4. С. 64–67.',
      src: 'ГОСТ Р 7.0.5-2008（注）。区切りは「. –」を省いた注の形',
      names: { ...EN_NAMES, and: 'none', initialize: true, initializeWith: '. ', sortSeparator: ' ', etAlMin: 4, etAlUseFirst: 3, precedesLastInverted: 'contextual' },
      layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: ' ',
      terms: { page: 'С.', pages: 'С.', volume: 'Т.', issue: '№', edition: 'изд.', editor: 'ред.', editors: 'ред.', 'editor-verb': 'под ред.', translator: 'пер.', translators: 'пер.', 'translator-verb': 'пер.', 'et-al': 'и др.', and: 'и', accessed: 'дата обращения', 'page-range-delimiter': '–' },
      bib: {
        book: [F('author', { opt: { order: 'family-all' } }), S('. '), F('title'), S(' / '), F('translator', { opt: { role: 'before' } }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')])],
        chapter: [F('author', { opt: { order: 'family-all' } }), S('. '), F('title'), S(' // '), F('container-title'), F('editor', { prefix: ' / ', opt: { role: 'before' } }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')]), S('. '), PAGE({ label: 'before' })],
        article: [F('author', { opt: { order: 'family-all' } }), S('. '), F('title'), S(' // '), F('container-title'), S('. '), F('issued'), S('. '), F('volume', { opt: { label: 'before' } }), S(', '), F('issue', { opt: { label: 'before' } }), S('. '), PAGE({ label: 'before' })],
        web: [F('author', { opt: { order: 'family-all' } }), S('. '), F('title'), S(' // '), F('container-title'), S('. '), F('URL', { prefix: 'URL: ' }), F('accessed', { prefix: ' (дата обращения: ', suffix: ')', opt: { form: 'numeric' } })],
        other: [F('author', { opt: { order: 'family-all' } }), S('. '), F('title'), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')])],
      },
      loc: LOC({ label: 'before' }), locSep: '. ',
      sub: subBy(() => [F('author', { opt: { order: 'family-all' } }), S(' '), F('literal', { opt: { value: 'Указ. соч.' } }), S(' '), LOC({ label: 'before' })]),
      ibid: subBy(() => [F('literal', { opt: { value: 'Там же' } }), S('. '), LOC({ label: 'before' })]),
    },
    {
      id: 'fr', lang: 'fr', name: 'フランス語', ex: 'Alessio Sopracasa, « Turcs et choses turques », Turcica, 44 (2012), p. 31-128.',
      src: 'EPHE Sciences historiques et philologiques, Normes éditoriales (2024) ほか',
      names: { ...EN_NAMES }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: ' ',
      terms: { ...LANG_TERMS.fr, pages: 'p.', editor: 'dir.', editors: 'dir.', 'editor-verb': 'sous la direction de', 'translator-verb': 'trad. par' },
      bib: {
        book: [F('author', { opt: { order: 'family' } }), S(', '), F('title', { italic: true }), S(', '), F('translator', { opt: { role: 'before' } }), S(', '), F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')],
        chapter: [F('author', { opt: { order: 'family' } }), S(', '), F('title', { wrap: 'gfr' }), S(', '), ...Grp([F('editor', { opt: { role: 'after', rolePrefix: ' (', roleSuffix: ')' } }), S(', '), F('container-title', { italic: true })], 'dans '), S(', '), F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued'), S(', '), PAGE({ label: 'before' })],
        article: [F('author', { opt: { order: 'family' } }), S(', '), F('title', { wrap: 'gfr' }), S(', '), F('container-title', { italic: true }), S(', '), F('volume'), S(', '), F('issue', { opt: { label: 'before' } }), F('issued', { prefix: ' (', suffix: ')' }), S(', '), PAGE({ label: 'before' })],
        web: [F('author', { opt: { order: 'family' } }), S(', '), F('title', { wrap: 'gfr' }), S(', '), F('container-title', { italic: true }), S(', '), F('URL'), S(', '), F('accessed', { prefix: 'consulté le ', opt: { form: 'ymd' } })],
        other: [F('author', { opt: { order: 'family' } }), S(', '), F('title', { italic: true }), S(', '), F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')],
      },
      // 注では名を前に置く（Alessio Sopracasa）。
      noteNames: true, loc: LOC({ label: 'before' }), locSep: ', ',
      sub: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S(', '), F('title', q ? { wrap: 'gfr', opt: { form: 'short' } } : { italic: true, opt: { form: 'short' } }), S(', '), LOC({ label: 'before' })]),
      ibid: subBy(() => [F('literal', { italic: true, opt: { value: 'Ibid.' } }), S(', '), LOC({ label: 'before' })]),
    },
    {
      id: 'de', lang: 'de', name: 'ドイツ語', ex: 'Wolfgang Neugebauer, Das alte Preußen, in: Historisches Jahrbuch 122 (2002), S. 463–482.',
      src: 'Historisches Jahrbuch, Style-Sheet (2012) ほか',
      names: { ...EN_NAMES, delimiter: '/', and: 'none', precedesLast: 'never', precedesLastInverted: 'never' }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: ' ',
      terms: { ...LANG_TERMS.de, editor: 'Hg.', editors: 'Hgg.', 'editor-verb': 'hg. v.', 'translator-verb': 'übers. v.' },
      // 出版者を書かず「Ort Jahr」。題名は引用符・斜体で括らない。
      bib: {
        book: [F('author', { opt: { order: 'family' } }), S(': '), F('title'), S(', '), F('translator', { opt: { role: 'before' } }), S(', '), ...Grp([F('publisher-place'), S(' '), F('issued')])],
        chapter: [F('author', { opt: { order: 'family' } }), S(': '), F('title'), S(', '), ...Grp([F('editor', { opt: { role: 'after', rolePrefix: ' (', roleSuffix: ')' } }), S(', '), F('container-title')], 'in: '), S(', '), ...Grp([F('publisher-place'), S(' '), F('issued')]), S(', '), PAGE({ label: 'before' })],
        article: [F('author', { opt: { order: 'family' } }), S(': '), F('title'), S(', '), F('container-title', { prefix: 'in: ' }), F('volume', { prefix: ' ' }), F('issued', { prefix: ' (', suffix: ')' }), S(', '), PAGE({ label: 'before' })],
        web: [F('author', { opt: { order: 'family' } }), S(': '), F('title'), S(', '), F('container-title', { prefix: 'in: ' }), S(', '), F('URL'), F('accessed', { prefix: ' (Zugriff: ', suffix: ')', opt: { form: 'numeric' } })],
        other: [F('author', { opt: { order: 'family' } }), S(': '), F('title'), S(', '), ...Grp([F('publisher-place'), S(' '), F('issued')])],
      },
      noteNames: true, noteAuthorSep: ', ', loc: LOC({ label: 'before' }), locSep: ', ',
      sub: subBy(() => [F('author', { opt: { form: 'short' } }), S(', '), F('title', { opt: { form: 'short' } }), S(', '), LOC({ label: 'before' })]),
      ibid: subBy(() => [F('literal', { opt: { value: 'Ebd.' } }), S(', '), LOC({ label: 'before' })]),
    },
    {
      id: 'ar', lang: 'ar', name: 'アラビア語', ex: 'محمد حسن، "الأمن القومي العربي"، إستراتيجيات، مج 15، العدد 1 (2009)، ص 129.',
      src: 'アラブ調査政策研究センター（ドーハ）『دليل التحرير』',
      names: { ...EN_NAMES, delimiter: '، ', and: 'none', sortSeparator: '، ', etAlMin: 4, etAlUseFirst: 1 }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: '',
      terms: { page: 'ص', pages: 'ص', volume: 'مج', issue: 'العدد', edition: 'ط', editor: 'محرر', editors: 'محررون', 'editor-verb': 'تحرير', translator: 'مترجم', translators: 'مترجمون', 'translator-verb': 'ترجمة', 'et-al': '[وآخرون]', and: 'و', accessed: 'شوهد في', 'page-range-delimiter': '-' },
      bib: {
        book: [F('author', { opt: { order: 'family' } }), S('. '), F('title'), S('. '), F('translator', { opt: { role: 'before' } }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S('، '), F('issued')])],
        chapter: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'sdq' }), S('. '), ...Grp([F('editor', { opt: { role: 'after', rolePrefix: ' (', roleSuffix: ')' } }), S('، '), F('container-title')], 'في: '), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S('، '), F('issued')]), S('، '), PAGE({ pre: 'ص ' })],
        article: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'sdq' }), S('. '), F('container-title'), S('. '), F('volume', { prefix: 'مج ' }), S('، '), F('issue', { prefix: 'العدد ' }), F('issued', { prefix: ' (', suffix: ')' }), S('، '), PAGE({ pre: 'ص ' })],
        web: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'sdq' }), S('. '), F('container-title'), S('، '), F('issued', { opt: { form: 'numeric' } }), S('، '), F('accessed', { prefix: 'شوهد في ', opt: { form: 'numeric' } }), S('، '), F('URL', { prefix: 'في: ' })],
        other: [F('author', { opt: { order: 'family' } }), S('. '), F('title'), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S('، '), F('issued')])],
      },
      note: {
        book: [F('author'), S('، '), F('title'), S('، '), F('translator', { opt: { role: 'before' } }), S(' '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S('، '), F('issued')], '(', ')'), S('، '), LOC({ pre: 'ص ' })],
        chapter: [F('author'), S('، '), F('title', { wrap: 'sdq' }), S('، '), ...Grp([F('editor', { opt: { role: 'after', rolePrefix: ' (', roleSuffix: ')' } }), S('، '), F('container-title')], 'في: '), S(' '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S('، '), F('issued')], '(', ')'), S('، '), LOC({ pre: 'ص ' })],
        article: [F('author'), S('، '), F('title', { wrap: 'sdq' }), S('، '), F('container-title'), S('، '), F('volume', { prefix: 'مج ' }), S('، '), F('issue', { prefix: 'العدد ' }), F('issued', { prefix: ' (', suffix: ')' }), S('، '), LOC({ pre: 'ص ' })],
        web: [F('author'), S('، '), F('title', { wrap: 'sdq' }), S('، '), F('container-title'), S('، '), F('issued', { opt: { form: 'numeric' } }), S('، '), F('accessed', { prefix: 'شوهد في ', opt: { form: 'numeric' } }), S('، '), F('URL', { prefix: 'في: ' })],
        other: [F('author'), S('، '), F('title'), S(' '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S('، '), F('issued')], '(', ')'), S('، '), LOC({ pre: 'ص ' })],
      },
      sub: subBy(() => [F('author', { opt: { form: 'short' } }), S('، '), LOC({ pre: 'ص ' })]),
      ibid: subBy(() => [F('literal', { opt: { value: 'المرجع نفسه' } }), S('، '), LOC({ pre: 'ص ' })]),
    },
    {
      id: 'it', lang: 'it', name: 'イタリア語', ex: 'A. Galante Garrone, L’emigrazione politica, in “Rassegna storica del Risorgimento” 41 (1954), pp. 223-242.',
      src: 'Il Risorgimento, Norme redazionali（FrancoAngeli）',
      names: { ...EN_NAMES, initialize: true, precedesLast: 'never', precedesLastInverted: 'never' }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: ' ',
      terms: { ...LANG_TERMS.it, 'translator-verb': 'trad. di' },
      bib: {
        book: [F('author'), S(', '), F('title', { italic: true }), S(', '), F('translator', { opt: { role: 'before' } }), S(', '), F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')],
        chapter: [F('author'), S(', '), F('title', { italic: true }), S(', '), ...Grp([F('editor', { opt: { role: 'after', rolePrefix: ' (', roleSuffix: ')' } }), S(', '), F('container-title', { italic: true })], 'in '), S(', '), F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued'), S(', '), PAGE({ label: 'before' })],
        article: [F('author'), S(', '), F('title', { italic: true }), S(', '), F('container-title', { prefix: 'in ', wrap: 'dquote' }), F('volume', { prefix: ' ' }), F('issued', { prefix: ' (', suffix: ')' }), S(', '), PAGE({ label: 'before' })],
        web: [F('author'), S(', '), F('title', { italic: true }), S(', '), F('container-title'), S(', '), F('URL'), F('accessed', { prefix: ' (consultato il ', suffix: ')', opt: { form: 'ymd' } })],
        other: [F('author'), S(', '), F('title', { italic: true }), S(', '), F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')],
      },
      loc: LOC({ label: 'before' }), locSep: ', ',
      sub: subBy(() => [F('author', { opt: { form: 'short' } }), S(', '), F('title', { italic: true, suffix: ' cit.', opt: { form: 'short' } }), S(', '), LOC({ label: 'before' })]),
      ibid: subBy(() => [F('literal', { opt: { value: 'Ivi' } }), S(', '), LOC({ label: 'before' })]),
    },
    {
      id: 'es', lang: 'es', name: 'スペイン語', ex: 'Kamen, Henry: La Inquisición. Madrid, Alianza, 1982, p. 55.',
      src: 'Espacio, Tiempo y Forma, Serie V（UNED）Normas de publicación',
      names: { ...EN_NAMES, and: 'symbol', etAlMin: 4, etAlUseFirst: 1, precedesLastInverted: 'never' }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: ' ',
      terms: { ...LANG_TERMS.es, 'translator-verb': 'trad. de', 'et-al': 'et al.' },
      bib: {
        book: [F('author', { opt: { order: 'family-all' } }), S(': '), F('title', { italic: true }), S('. '), F('translator', { opt: { role: 'before' } }), S('. '), ...Grp([F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')])],
        chapter: [F('author', { opt: { order: 'family-all' } }), S(': '), F('title', { wrap: 'guil' }), S(', '), ...Grp([F('editor', { opt: { order: 'family-all', role: 'after', rolePrefix: ' (', roleSuffix: ')' } }), S(': '), F('container-title', { italic: true })], 'en '), S('. '), ...Grp([F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')]), S(', '), PAGE({ label: 'before' })],
        article: [F('author', { opt: { order: 'family-all' } }), S(': '), F('title', { wrap: 'guil' }), S(', '), F('container-title', { italic: true }), S(', '), F('volume'), F('issued', { prefix: ' (', suffix: ')' }), S(', '), PAGE({ label: 'before' })],
        web: [F('author', { opt: { order: 'family-all' } }), S(': '), F('title', { wrap: 'guil' }), S(', '), F('container-title', { italic: true }), S('. '), F('URL'), F('accessed', { prefix: ' [Consultado el ', suffix: ']', opt: { form: 'numeric' } })],
        other: [F('author', { opt: { order: 'family-all' } }), S(': '), F('title', { italic: true }), S('. '), ...Grp([F('publisher-place'), S(', '), F('publisher'), S(', '), F('issued')])],
      },
      loc: LOC({ label: 'before' }), locSep: ', ',
      sub: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S(': '), F('title', q ? { wrap: 'guil', opt: { form: 'short' } } : { italic: true, opt: { form: 'short' } }), S(', '), LOC({ label: 'before' })]),
      ibid: subBy(() => [F('literal', { opt: { value: 'Ibidem' } }), S(', '), LOC({ label: 'before' })]),
    },
    {
      id: 'tr', lang: 'tr', name: 'トルコ語', ex: 'Jon Hoover, "İslâmî Monoteizm ve Teslîs", Oksident 1/1 (2019), 117-143.',
      src: 'İSNAD Atıf Sistemi 2. Edisyon（dipnotlu）',
      names: { ...EN_NAMES, precedesLast: 'never', precedesLastInverted: 'never' }, layout: { bib: { suffix: '.' }, cite: { suffix: '.' } }, labelSpace: ' ',
      terms: { page: 's.', pages: 'ss.', volume: 'C.', issue: 'S.', edition: 'bs.', editor: 'ed.', editors: 'ed.', 'editor-verb': 'ed.', translator: 'çev.', translators: 'çev.', 'translator-verb': 'çev.', 'et-al': 'vd.', and: 've', accessed: 'Erişim', 'page-range-delimiter': '-' },
      bib: {
        book: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { italic: true }), S('. '), F('translator', { opt: { role: 'before' } }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')])],
        chapter: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'sdq' }), S('. '), F('container-title', { italic: true }), S('. '), F('editor', { opt: { role: 'before' } }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')]), S('. '), F('page')],
        article: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'sdq' }), S('. '), F('container-title', { italic: true }), S(' '), F('volume'), F('issue', { prefix: '/' }), F('issued', { prefix: ' (', suffix: ')' }), S(', '), F('page')],
        web: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { wrap: 'sdq' }), S('. '), F('container-title'), S('. '), F('accessed', { prefix: 'Erişim ', opt: { form: 'ymd' } }), S('. '), F('URL')],
        other: [F('author', { opt: { order: 'family' } }), S('. '), F('title', { italic: true }), S('. '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')])],
      },
      note: {
        book: [F('author'), S(', '), F('title', { italic: true }), S(', '), F('translator', { opt: { role: 'before' } }), S(' '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')], '(', ')'), S(', '), LOC()],
        chapter: [F('author'), S(', '), F('title', { wrap: 'sdq' }), S(', '), F('container-title', { italic: true }), S(', '), F('editor', { opt: { role: 'before' } }), S(' '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')], '(', ')'), S(', '), LOC()],
        article: [F('author'), S(', '), F('title', { wrap: 'sdq' }), S(', '), F('container-title', { italic: true }), S(' '), F('volume'), F('issue', { prefix: '/' }), F('issued', { prefix: ' (', suffix: ')' }), S(', '), LOC()],
        web: [F('author'), S(', '), F('title', { wrap: 'sdq' }), S(', '), F('container-title'), S(', '), F('accessed', { prefix: 'Erişim ', opt: { form: 'ymd' } }), S(', '), F('URL')],
        other: [F('author'), S(', '), F('title', { italic: true }), S(' '), ...Grp([F('publisher-place'), S(': '), F('publisher'), S(', '), F('issued')], '(', ')'), S(', '), LOC()],
      },
      sub: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S(', '), F('title', q ? { wrap: 'sdq', opt: { form: 'short' } } : { italic: true, opt: { form: 'short' } }), S(', '), LOC()]),
      ibid: subBy((tab, q) => [F('author', { opt: { form: 'short' } }), S(', '), F('title', q ? { wrap: 'sdq', opt: { form: 'short' } } : { italic: true, opt: { form: 'short' } }), S(', '), LOC()]),
    },
  ];

  // 参考文献の並びから注の並びを作る。noteNames＝注では名を前に置く（姓を前に出す指定を外す）。
  function presetNoteChips(p) {
    if (p.note) return clone(p.note);
    const bib = clone(p.bib);
    if (p.noteNames) {
      for (const chips of Object.values(bib)) {
        chips.forEach((c, i) => {
          if (c.t === 'field' && (c.f === 'author' || c.f === 'editor') && c.opt.order) delete c.opt.order;
          // 参考文献で著者の後ろが「: 」のもの（ドイツ語）は、注では「, 」にする
          if (p.noteAuthorSep && c.t === 'sep' && i > 0 && chips[i - 1].t === 'field' && chips[i - 1].f === 'author') c.v = p.noteAuthorSep;
        });
      }
    }
    return presetNote(bib, p.locSep || ', ', p.loc);
  }
  function presetSystem(p, model) {
    const en = model.systems.en;
    const tabs = Object.keys(en.bib || p.bib);
    const pick = (src) => Object.fromEntries(tabs.map((t) => [t, clone(src[t] || src.other)]));
    const bibSrc = pick(p.bib);
    const sys = { label: p.name, preset: p.id, names: clone(p.names), labelSpace: p.labelSpace };
    if (model.kind === 'note') {
      sys.bib = bibSrc;
      sys.cite = pick(presetNoteChips(p));
      sys.citeSub = Object.fromEntries(tabs.map((t) => [t, p.sub(t)]));
      sys.citeIbid = Object.fromEntries(tabs.map((t) => [t, p.ibid(t)]));
      sys.layout = clone(p.layout);
    } else {
      // 本文中の引用（著者年・番号など）は欧文の書式を写し、参考文献だけをこの言語の形にする。
      sys.bib = model.kind === 'numeric' ? withNumber(bibSrc, ' ') : bibSrc;
      sys.cite = clone(en.cite);
      sys.layout = { bib: clone(p.layout.bib), cite: clone((en.layout || {}).cite || {}) };
    }
    return sys;
  }

  // 言語を足す。preset に LANG_PRESETS の id を渡すと、その言語の既定の書式で作る。
  // 渡さなければ、from に指定した書式を写す。from は 'en' 'ja' や足した言語のコード（いまのその書式を、用語ごと写す）か、
  // 'preset:<LANG_PRESETS の id>'（その言語の既定の書式。フランス語の形をラテン語に使うなど）。省けば欧文の書式。
  // うまくいけば null、だめなら理由の文を返す。
  function addLanguage(model, key, preset, from) {
    const p = preset ? LANG_PRESETS.find((x) => x.id === preset) : null;
    const k = p ? p.lang : String(key || '').trim().toLowerCase();
    if (!/^[a-z]{2,3}$/.test(k)) return '言語コードは、Zotero の「言語」欄の先頭の2〜3文字（fr、de など）で入れてください。';
    if (k === 'ja' || k === 'en') return `${k} は「${langName(k)}の書式」として最初からあります。`;
    model.extraLangs = model.extraLangs || [];
    if (model.extraLangs.includes(k)) return `${langName(k)}（${k}）の書式はもうあります。別の形にしたいときは、いまの書式を消してから足してください。`;
    const fromPreset = !p && typeof from === 'string' && from.startsWith('preset:') ? LANG_PRESETS.find((x) => x.id === from.slice(7)) : null;
    if (!p && from && !fromPreset && !model.systems[from]) return `写す元の書式（${from}）が見つかりません。`;
    const src = p || fromPreset;
    const base = src ? null : (from || 'en');
    model.terms = model.terms || {};
    let sys;
    if (src) {
      sys = presetSystem(src, model);
      if (!p) sys.label = langName(k);
    } else {
      sys = clone(model.systems[base]);
      sys.label = langName(k);
      for (const tg of TARGETS) for (const tab of Object.keys(sys[tg] || {})) sys[tg][tab].forEach((c) => { delete c.uid; });
    }
    // 欧文の書式で組む言語に入っていれば外す（この言語は自分の書式で組む）。書式を消したら戻せるよう、外したことを覚えておく。
    if ((model.euroLangs || []).includes(k)) {
      model.euroLangs = model.euroLangs.filter((l) => l !== k);
      sys.fromEuro = true;
    }
    model.systems[k] = sys;
    if (src) model.terms[k] = { ...TERMS_EN, ...src.terms };
    // 欧文から写すときは、その言語の用語の初期値があれば重ねる（fr なら p.・éd. など）。ほかの書式から写すときは、用語もそのまま写す
    else if (base === 'en') model.terms[k] = { ...TERMS_EN, ...(model.terms.en || {}), ...(LANG_TERMS[k] || {}) };
    else model.terms[k] = { ...(base === 'ja' ? TERMS_JA : TERMS_EN), ...(model.terms[base] || {}) };
    // 既定の書式の用語に複数の巻が無ければ、英語の vols. ではなく1巻の語を使う（中国語の「卷」など）
    if (src && src.terms.volumes === undefined) model.terms[k].volumes = model.terms[k].volume;
    model.extraLangs.push(k);
    return null;
  }
  // 後から足した用語（宛先・文書番号）を、それより前に作ったスタイルに補う。入っている値には触れない。
  function fillTerms(model) {
    model.terms = model.terms || {};
    for (const [k, t] of Object.entries(model.terms)) {
      const base = k === 'ja' ? TERMS_JA : { ...TERMS_EN, ...(LANG_TERMS[k] || {}) };
      for (const key of ['recipient', 'recipient-verb', 'number']) if (t[key] === undefined) t[key] = base[key];
      // 複数の巻は、1巻の語を初期値のまま使っていれば初期値の複数形に、直していればその語に揃える
      if (t.volumes === undefined && t.volume !== undefined) t.volumes = t.volume === base.volume ? base.volumes : t.volume;
    }
  }

  // ---- 一次史料の並び（注形式の型で、原稿・文書・書簡のタブを足したときの初期値） ----
  // 和文：長岡三郎書状（山田太郎宛）「年貢上納につき」寛政元年三月五日（山田家文書12-4、越後史料館所蔵）
  // 欧文：Jules Moreau, lettre to Léa Dubois, March 5, 1761, Correspondance, carton 3, Bibliothèque municipale, Montclair.
  const ARCHIVE_JA = () => Grp([F('archive_location'), S('、'), F('call-number'), S('、'), F('archive', { suffix: '所蔵' })], '（', '）');
  const ARCHIVE_EN = () => [F('archive_location'), S(', '), F('call-number'), S(', '), F('archive'), S(', '), F('archive-place')];
  function archivePreset(sysKey, type, target) {
    if (!['manuscript', 'document', 'personal_communication'].includes(type)) return null;
    const letter = type === 'personal_communication';
    if (sysKey === 'ja') {
      return [F('author'), ...(letter ? [F('genre'), F('recipient', { prefix: '（', suffix: '）', opt: { role: 'after' } })] : []),
        F('title', { wrap: 'kagi' }), ...(letter ? [] : [F('genre', { prefix: '（', suffix: '）' })]),
        F('issued', { opt: { form: 'ymd' } }), F('number', { opt: { label: 'after' } }), ...ARCHIVE_JA()];
    }
    const bib = target === 'bib';
    const author = F('author', bib ? { opt: { order: 'family' } } : {});
    const sep = bib ? '. ' : ', ';
    const head = letter
      ? [author, S(sep), ...Grp([F('genre', { caps: 'capitalize-first' }), S(' '), F('recipient', { opt: { role: 'before', roleForm: 'verb' } })]), S(', '), F('issued', { opt: { form: 'ymd' } })]
      : [author, S(sep), F('title', { wrap: 'dquote' }), S(sep), F('genre', { caps: 'capitalize-first' }), S(', '), F('issued', { opt: { form: 'ymd' } }), S(', '), F('number', { opt: { label: 'before' } })];
    return [...head, S(sep), ...ARCHIVE_EN()];
  }

  // ---- 引用箇所の頁の語を、書式全体で揃える ----
  // 注・本文中の引用（初出・2回目以降・同上）の、全種類の引用箇所の部品の「用語」を pos（none・before・after）にする。
  // 1頁か範囲かで語が変わる（p. 42・pp. 42–45）のは用語表の「頁（1頁）」「頁（範囲）」による。変えた部品の数を返す。
  const CITE_TARGETS = ['cite', 'citeSub', 'citeIbid'];
  function locatorChips(sys) {
    const out = [];
    for (const tg of CITE_TARGETS) for (const chips of Object.values((sys && sys[tg]) || {})) for (const c of chips || []) if (c.t === 'field' && c.f === 'locator') out.push(c);
    return out;
  }
  function setLocatorLabel(sys, pos) {
    const list = locatorChips(sys);
    for (const c of list) {
      c.opt = c.opt || {};
      if (pos === 'none') delete c.opt.label; else c.opt.label = pos;
    }
    return list.length;
  }
  // いまの揃い方：全部同じならその値、ばらばらなら 'mixed'、引用箇所の部品が無ければ null。
  function locatorLabelOf(sys) {
    const v = [...new Set(locatorChips(sys).map((c) => (c.opt && c.opt.label) || 'none'))];
    return v.length === 0 ? null : v.length === 1 ? v[0] : 'mixed';
  }

  function removeLanguage(model, key) {
    model.extraLangs = (model.extraLangs || []).filter((k) => k !== key);
    if (key !== 'ja' && key !== 'en') {
      // 足したときに欧文の書式で組む言語から外していたなら、戻す（消したあとも欧文の書式で組まれる）
      if (model.systems[key] && model.systems[key].fromEuro && !(model.euroLangs || []).includes(key)) model.euroLangs = [...(model.euroLangs || ['en']), key];
      delete model.systems[key];
      if (model.terms) delete model.terms[key];
    }
  }

  const api = { STARTERS, makeStarter, F, S, Grp, TARGETS, ensureSubsequent, fillTerms, archivePreset, subPreset, LANG_NAMES, BUNDLED_LOCALES, LANG_PRESETS, langName, addLanguage, removeLanguage, setLocatorLabel, locatorLabelOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CSLStarters = api;
})(typeof self !== 'undefined' ? self : this);
