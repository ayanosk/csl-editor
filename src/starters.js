// 似ている型（Chicago・APA・MLA・IEEE の4つ）。欧文の系統はそれぞれの典型的な形にし、
// 和文の系統はそれぞれの示し方（注・著者年・著者頁・番号）を日本語の書き方に移したもの。
//   chicago  注で示す        和文＝山田花子『書名』越後書房、2024年。
//   apa      著者と年で示す  和文＝山田花子（2024）『書名』越後書房。（山田, 2024, 42頁）
//   mla      著者と頁で示す  和文＝注と同じ形の参考文献。（山田 42頁）
//   ieee     番号で示す      和文＝[1] 山田花子『書名』越後書房、2024年。[1, 42頁]
(function (root) {
  'use strict';

  const F = (f, o = {}) => ({ t: 'field', f, prefix: o.prefix || '', suffix: o.suffix || '', wrap: o.wrap || 'none', italic: !!o.italic, caps: o.caps || 'none', opt: o.opt || {} });
  const S = (v) => ({ t: 'sep', v });
  // まとまり〔 〕。中が全部空なら、前後の文字（prefix・suffix）ごと消える（CSL の group）。
  const Grp = (chips, prefix = '', suffix = '') => [{ t: 'open', prefix }, ...chips, { t: 'close', suffix }];

  const JA_NAMES = { delimiter: '・', and: 'none', precedesEtAl: 'never', etAlMin: 4, etAlUseFirst: 1, initialize: false, roleAfterPrefix: '', roleBeforeSuffix: '', substituteRole: 'after' };
  const EN_NAMES = { delimiter: ', ', and: 'text', precedesLast: 'contextual', precedesLastInverted: 'always', precedesEtAl: 'never', etAlMin: 11, etAlUseFirst: 7, initialize: false, initializeWith: '. ', sortSeparator: ', ', roleAfterPrefix: ', ', roleBeforeSuffix: ' ', substituteRole: 'after' };

  const TERMS_JA = {
    page: '頁', pages: '頁', volume: '巻', issue: '号', edition: '版',
    editor: '編', editors: '編', 'editor-verb': '編', translator: '訳', translators: '訳', 'translator-verb': '訳',
    'et-al': 'ほか', and: '・', accessed: '参照', 'page-range-delimiter': '-',
  };
  const TERMS_EN = {
    page: 'p.', pages: 'pp.', volume: 'vol.', issue: 'no.', edition: 'ed.',
    editor: 'ed.', editors: 'eds.', 'editor-verb': 'edited by', translator: 'trans.', translators: 'trans.', 'translator-verb': 'translated by',
    'et-al': 'et al.', and: 'and', accessed: 'accessed', 'page-range-delimiter': '–',
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
      ja: '山田花子『デジタル史料学入門』越後書房、2024年、42頁。',
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
      ja: '（山田, 2024, 42頁）　山田花子（2024）『デジタル史料学入門』越後書房。',
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
      ja: '（山田 42頁）　山田花子『デジタル史料学入門』越後書房、2024年。',
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
      ja: '[1, 42頁]　[1] 山田花子『デジタル史料学入門』越後書房、2024年。',
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
    el: 'ギリシア語', zh: '中国語', ko: '韓国語',
  };
  // このアプリに入れたロケール（プレビューの月名など）。ここに無い言語は英語のロケールで代わりに組む。
  const BUNDLED_LOCALES = ['ja', 'en', 'fr', 'de', 'it', 'es', 'nl', 'pt', 'la', 'ru'];
  // 用語の初期値。ここに無い言語は英語の用語を写す。どれも足場で、学生が用語表で直す前提。
  const LANG_TERMS = {
    fr: { page: 'p.', pages: 'p.', volume: 'vol.', issue: 'n°', edition: 'éd.', editor: 'éd.', editors: 'éd.', 'editor-verb': 'sous la direction de', translator: 'trad.', translators: 'trad.', 'translator-verb': 'traduit par', 'et-al': 'et al.', and: 'et', accessed: 'consulté le', 'page-range-delimiter': '-' },
    de: { page: 'S.', pages: 'S.', volume: 'Bd.', issue: 'H.', edition: 'Aufl.', editor: 'Hrsg.', editors: 'Hrsg.', 'editor-verb': 'herausgegeben von', translator: 'Übers.', translators: 'Übers.', 'translator-verb': 'übersetzt von', 'et-al': 'u. a.', and: 'und', accessed: 'zugegriffen am', 'page-range-delimiter': '–' },
    it: { page: 'p.', pages: 'pp.', volume: 'vol.', issue: 'n.', edition: 'ed.', editor: 'a cura di', editors: 'a cura di', 'editor-verb': 'a cura di', translator: 'trad.', translators: 'trad.', 'translator-verb': 'tradotto da', 'et-al': 'et al.', and: 'e', accessed: 'consultato il', 'page-range-delimiter': '-' },
    es: { page: 'p.', pages: 'pp.', volume: 'vol.', issue: 'n.º', edition: 'ed.', editor: 'ed.', editors: 'eds.', 'editor-verb': 'editado por', translator: 'trad.', translators: 'trads.', 'translator-verb': 'traducido por', 'et-al': 'et al.', and: 'y', accessed: 'consultado el', 'page-range-delimiter': '-' },
  };
  function langName(k) { return k === 'ja' ? '和文' : k === 'en' ? '欧文' : (LANG_NAMES[k] || k); }

  // 言語を足す。うまくいけば null、だめなら理由の文を返す。
  function addLanguage(model, key) {
    const k = String(key || '').trim().toLowerCase();
    if (!/^[a-z]{2,3}$/.test(k)) return '言語コードは、Zotero の「言語」欄の先頭の2〜3文字（fr、de など）で入れてください。';
    if (k === 'ja' || k === 'en') return `${k} は「${langName(k)}の書式」として最初からあります。`;
    model.extraLangs = model.extraLangs || [];
    if (model.extraLangs.includes(k)) return `${k} の書式はもうあります。`;
    const sys = clone(model.systems.en);
    sys.label = langName(k);
    for (const tg of TARGETS) for (const tab of Object.keys(sys[tg] || {})) sys[tg][tab].forEach((c) => { delete c.uid; });
    model.systems[k] = sys;
    model.terms = model.terms || {};
    model.terms[k] = { ...TERMS_EN, ...(model.terms.en || {}), ...(LANG_TERMS[k] || {}) };
    model.extraLangs.push(k);
    return null;
  }
  function removeLanguage(model, key) {
    model.extraLangs = (model.extraLangs || []).filter((k) => k !== key);
    if (key !== 'ja' && key !== 'en') {
      delete model.systems[key];
      if (model.terms) delete model.terms[key];
    }
  }

  const api = { STARTERS, makeStarter, F, S, Grp, TARGETS, ensureSubsequent, subPreset, LANG_NAMES, BUNDLED_LOCALES, langName, addLanguage, removeLanguage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CSLStarters = api;
})(typeof self !== 'undefined' ? self : this);
