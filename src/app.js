// 引用スタイル（CSL）編集アプリの画面。状態・描画・イベント。
(function () {
  'use strict';
  const G = window.CSLGen;
  const ST = window.CSLStarters;
  const O = window.CSLOfficial;
  const LOCALES = window.CSL_LOCALES;
  const SAMPLES = window.CSL_SAMPLES;
  const STORE_KEY = 'csl-editor-v1';

  // ---- 状態 ------------------------------------------------------------------
  const state = {
    model: null,
    items: null,
    source: '見本データ',
    hidden: [], // 隠した文献の id。データには残し、プレビューと組版から外す
    mode: 'chips', // chips＝型から組む／official＝公式のスタイルを手直しする
    official: null, // { xml: 元の CSL, edits: 編集の一覧, title, id, source: 元のスタイルの名前 }
    ui: { panel: 'ja', target: 'bib', tab: 'book', sel: null, filter: 'auto', loc: 'page:42' },
  };
  let uidN = 0;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function $(id) { return document.getElementById(id); }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  function toast(msg) {
    const t = h('div', { class: 'toast', text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  function eachChips(model, fn) {
    for (const sk of Object.keys(model.systems)) for (const tg of ST.TARGETS) {
      const byTab = model.systems[sk][tg] || {};
      for (const tab of Object.keys(byTab)) fn(byTab[tab], sk, tg, tab);
    }
  }
  function ensureUids(model) {
    eachChips(model, (chips) => chips.forEach((c) => {
      const n = c.uid ? parseInt(String(c.uid).slice(1), 10) : NaN;
      if (Number.isFinite(n)) uidN = Math.max(uidN, n);
    }));
    eachChips(model, (chips) => chips.forEach((c) => { if (!c.uid) c.uid = 'c' + (++uidN); }));
  }
  function newStyleId() {
    const r = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
    return 'http://www.zotero.org/styles/csl-editor-' + r;
  }
  // 2回目以降の注を入れる前に保存した状態や .csl には、その並びが無い。注形式なら既定の並びで補う。
  function upgradeModel(m) {
    if (m.kind === 'note' && m.subsequent === undefined) m.subsequent = true;
    if (m.kind === 'note' && m.subsequent) ST.ensureSubsequent(m);
    return m;
  }
  function freshModel(key) {
    const m = ST.makeStarter(key);
    m.info.id = newStyleId();
    ensureUids(m);
    return m;
  }
  function chips() {
    const { panel, target } = state.ui;
    const tabs = G.tabsOf(state.model);
    if (!tabs.some((t) => t.key === state.ui.tab)) state.ui.tab = tabs[0].key;
    const sys = state.model.systems[panel];
    const byTab = sys[target] || (sys[target] = {});
    return byTab[state.ui.tab] || (byTab[state.ui.tab] = []);
  }
  function selChip() {
    return chips().find((c) => c.uid === state.ui.sel) || null;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ model: state.model, items: state.items, source: state.source, hidden: state.hidden, ui: state.ui, mode: state.mode, official: state.official }));
    } catch (e) { /* 保存できない環境でも動かす */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s.model || !s.model.systems) return false;
      state.model = upgradeModel(s.model);
      state.items = Array.isArray(s.items) ? s.items : null;
      state.source = s.source || '見本データ';
      state.hidden = Array.isArray(s.hidden) ? s.hidden.map(String) : [];
      Object.assign(state.ui, s.ui || {});
      ensureUids(state.model);
      if (s.mode === 'official' && s.official && s.official.xml) {
        try { offBase = O.parse(s.official.xml); state.mode = 'official'; state.official = s.official; } catch (e) { state.mode = 'chips'; }
      }
      return true;
    } catch (e) { return false; }
  }

  function changed(opts = {}) {
    if (state.mode === 'official') { schedulePreview(); save(); return; }
    if (opts.row !== false) renderChipRow();
    if (opts.detail) renderDetail();
    schedulePreview();
    save();
  }

  // ---- 表示用の文字 -------------------------------------------------------------
  const SEP_CHOICES = [
    ['、', '、'], ['，', '，'], ['・', '・'], ['。', '。'], [', ', ',␣'], ['. ', '.␣'], [': ', ':␣'], ['; ', ';␣'], [' ', '␣'], ['', 'なし'],
  ];
  function showSpaces(s) { return s.replace(/ /g, '␣').replace(/　/g, '□'); }
  function sepText(v) { return v === '' ? 'なし' : showSpaces(v); }

  const WRAP_LABELS = {
    none: 'なし', nijukagi: '『　』', kagi: '「　」', dquote: '“　”', paren: '（　）', hparen: '(　)', bracket: '[　]',
  };
  function termOf(key) {
    const t = (state.model.terms || {})[state.ui.panel] || {};
    return t[key] || '';
  }
  function fieldLabel(c) {
    if (c.t === 'open') return 'まとまりの始め〔';
    if (c.t === 'close') return 'まとまりの終わり〕';
    const def = G.FIELDS[c.f];
    if (!def) return c.f;
    if (c.f === 'literal') return '“' + ((c.opt || {}).value || '') + '”';
    return def.label;
  }
  function chipNode(c, i) {
    if (c.t === 'open' || c.t === 'close') {
      return h('span', { class: 'chip grp', title: 'まとまり。中の部品が全部空なら、前後の文字ごと消えます', draggable: 'true', 'data-i': i },
        c.t === 'open' && c.prefix ? h('span', { class: 'aff', text: showSpaces(c.prefix) }) : null,
        h('span', { class: 'grp-mark', text: c.t === 'open' ? '〔ここから' : 'ここまで〕' }),
        c.t === 'close' && c.suffix ? h('span', { class: 'aff', text: showSpaces(c.suffix) }) : null);
    }
    if (c.t === 'sep') {
      return h('span', { class: 'chip sep', title: '区切り', draggable: 'true', 'data-i': i }, sepText(c.v));
    }
    const [wo, wc] = G.WRAPS[c.wrap || 'none'] || ['', ''];
    const opt = c.opt || {};
    const tags = [];
    if (opt.role === 'after' || opt.role === 'before') {
      const key = c.f === 'editor' ? 'editor' : 'translator';
      const form = opt.roleForm || (opt.role === 'before' ? 'verb' : 'short');
      const term = termOf(form === 'verb' ? key + '-verb' : key);
      tags.push((opt.role === 'before' ? '前に「' : '後に「') + term + '」');
    }
    if (opt.label && opt.label !== 'none') {
      const key = { volume: 'volume', issue: 'issue', page: 'page', locator: 'page', edition: 'edition', accessed: 'accessed' }[c.f];
      tags.push((opt.label === 'before' ? '前に「' : '後に「') + termOf(key) + '」');
    }
    if (opt.form === 'short') tags.push(c.f === 'author' || c.f === 'editor' || c.f === 'translator' ? '姓だけ' : '略記');
    if (opt.order === 'family') tags.push('姓, 名');
    if (opt.form === 'ymd') tags.push('年月日');
    if (opt.form === 'ym') tags.push('年月');
    return h('span', { class: 'chip', draggable: 'true', 'data-i': i },
      c.prefix ? h('span', { class: 'aff', text: showSpaces(c.prefix) }) : null,
      wo ? h('span', { class: 'aff', text: wo }) : null,
      h('span', { class: c.italic ? 'it' : '', text: fieldLabel(c) }),
      wc ? h('span', { class: 'aff', text: wc }) : null,
      c.suffix ? h('span', { class: 'aff', text: showSpaces(c.suffix) }) : null,
      tags.length ? h('span', { class: 'tag', text: tags.join('・') }) : null);
  }

  // ---- 左：パネル ---------------------------------------------------------------
  function sysKeys() { return ['ja', 'en', ...G.extraLangs(state.model)]; }
  function isFormatPanel(k) { return sysKeys().includes(k); }
  function sysName(k) { return ST.langName(k); }
  // プレビューの札に出す短い名前（和文・欧文・fr など）。
  function sysBadge(k) { return k === 'ja' || k === 'en' ? sysName(k) : k; }
  function panels() {
    return [['ja', '和文の書式'], ['en', G.extraLangs(state.model).length ? '欧文の書式（その他）' : '欧文の書式'],
      ...G.extraLangs(state.model).map((k) => [k, `${sysName(k)}（${k}）の書式`]),
      ['terms', '用語表'], ['settings', '全体の設定']];
  }

  // 左のパネルを描き直す。書式のパネルなら、チップの列と詳細も描く。
  function renderPanels() {
    syncModeUi();
    if (state.mode === 'official') { drawOfficialPanel(); return; }
    drawPanels();
    renderChipRow();
    renderDetail();
  }
  function drawPanels() {
    const tabs = $('panelTabs');
    if (!isFormatPanel(state.ui.panel) && !['terms', 'settings'].includes(state.ui.panel)) state.ui.panel = 'en';
    tabs.replaceChildren(...panels().map(([k, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(state.ui.panel === k),
      onclick: () => { state.ui.panel = k; state.ui.sel = null; renderPanels(); renderPreviewHighlight(); save(); },
    }, label)), h('button', {
      type: 'button', class: 'add-lang', title: '仏語・独語などの文献を、英語と別の書式で組みたいときに',
      onclick: () => { state.ui.panel = 'settings'; state.ui.sel = null; renderPanels(); const i = $('newLang'); if (i) i.focus(); },
    }, '＋ 言語ごとの書式'));
    const body = $('panelBody');
    if (state.ui.panel === 'terms') body.replaceChildren(termsPanel());
    else if (state.ui.panel === 'settings') body.replaceChildren(settingsPanel());
    else body.replaceChildren(formatPanel());
  }

  function citeTargetLabel() {
    return state.model.kind === 'note' ? '注（初出）' : '本文中の引用';
  }

  function formatPanel() {
    const sk = state.ui.panel;
    const counts = itemCounts();
    const targets = [['bib', '参考文献'], ['cite', citeTargetLabel()]];
    if (hasSubsequent()) targets.push(['citeSub', '注（2回目以降）'], ['citeIbid', '注（直前と同じ本）']);
    if (!targets.some(([k]) => k === state.ui.target)) state.ui.target = 'cite';
    const seg = h('div', { class: 'seg' },
      ...targets.map(([k, label]) => h('button', {
        type: 'button', 'aria-pressed': String(state.ui.target === k),
        onclick: () => { state.ui.target = k; state.ui.sel = null; renderPanels(); save(); },
      }, label)));
    const tabs = G.tabsOf(state.model);
    const typeTabs = h('div', { class: 'type-tabs' },
      ...tabs.map((t) => h('button', {
        type: 'button', 'aria-pressed': String(state.ui.tab === t.key),
        title: t.types.length ? 'Zotero の ' + t.types.map(G.cslTypeLabel).join('・') + ' をこの並びで組みます' : 'ほかのタブに入らない種類をすべてこの並びで組みます',
        onclick: () => { state.ui.tab = t.key; state.ui.sel = null; renderPanels(); renderPreviewHighlight(); save(); },
      }, t.label, h('span', { class: 'count', text: counts[sk + '|' + t.key] ? counts[sk + '|' + t.key] + '件' : '' }))),
      typeChecklist(tabs));
    const row = h('div', { class: 'chip-row', id: 'chipRow' });
    const extra = [];
    if (state.ui.target === 'cite') {
      extra.push(h('p', { class: 'hint' },
        state.model.kind === 'note'
          ? (hasSubsequent() ? 'その本を初めて引く注の並びです。' : '注の並びです。') + 'プレビューの引用箇所は、上の「引用箇所」で選んだもので組みます。'
          : '本文中の引用の並びです。括弧と区切りは「全体の設定」で変えます。',
        ' ', h('button', { type: 'button', onclick: () => copyChips('bib', '参考文献') }, '参考文献の並びを写す')));
    } else if (state.ui.target === 'citeSub') {
      extra.push(h('p', { class: 'hint' },
        '間に別の注を挟んで、同じ本をもう一度引いたときの並びです（短縮形）。著者は「姓だけ」、題名は「短い形」にするのが一般的です。短い形には Zotero の「短いタイトル」欄が使われ、空なら題名がそのまま出ます。「前掲書」などは「任意の文字」で足せます。',
        ' ', h('button', { type: 'button', onclick: () => copyChips('cite', '注（初出）') }, '注（初出）の並びを写す')),
        h('p', { class: 'hint' }, '型を選ぶ（この書式の全種類を置き換えます）：',
          ...(sk === 'ja'
            ? [['short', '山田『デジタル史料学入門』50頁'], ['prev', '山田、前掲書、50頁']]
            : [['short', 'Dubois and Moreau, Numbers in the Archive, 50'], ['prev', 'Dubois and Moreau, op. cit., 50']])
            .map(([k, label]) => h('button', { type: 'button', class: 'small-btn', onclick: () => applySubPreset(k, label) }, label))));
    } else if (state.ui.target === 'citeIbid') {
      extra.push(h('p', { class: 'hint' },
        '直前の注と同じ本を引いたときの並びです。箇所が違えば引用箇所が付き（「同上、45頁。」）、箇所も同じなら引用箇所は自動で消えます（「同上。」）。「同上」を使わない書き方にするときは、2回目以降の並びを写してください。',
        ' ', h('button', { type: 'button', onclick: () => copyChips('citeSub', '注（2回目以降）') }, '注（2回目以降）の並びを写す')));
    }
    // 上に資料の種類（図書・本の章…）、その下に書く場所（参考文献・注…）。プレビューの並びと同じ順。
    return h('div', {},
      typeTabs, seg, row, paletteNode(),
      ...extra,
      h('div', { id: 'detail' }),
      systemCard(sk));
  }

  // 項目の種類を選ぶ（複数選べる）。既定は図書・本の章・雑誌論文・ウェブページの4つにチェックが入っているだけ。
  // チェックした種類はタブになり、自分の並びを持つ。チェックの無い種類は「その他」の並びで組む。
  // チェックを外しても並びは消さずに残し、入れ直すと元の並びに戻る。
  const MAIN_TYPES = ['book', 'chapter', 'article-journal', 'webpage'];
  const BASE_OF_MAIN = { book: 'book', chapter: 'chapter', 'article-journal': 'article', webpage: 'web' };
  function typeChecklist(tabs) {
    const m = state.model;
    const off = m.baseOff || [];
    const extra = m.typeTabs || [];
    const tabLabel = Object.fromEntries(tabs.map((t) => [t.key, t.label]));
    const rows = G.CSL_TYPES.map((t) => {
      const base = BASE_OF_MAIN[t.type];
      const checked = base ? !off.includes(base) : extra.includes(t.type);
      const name = base ? TYPE_TABS_LABEL[base] : t.label;
      const note = base
        ? (t.label !== name ? `Zotero の「${t.label}」` : '')
        : (checked ? '' : `いまは「${tabLabel[G.tabOfType(t.type, m)]}」で組む`);
      return h('label', { class: 'type-check' },
        h('input', { type: 'checkbox', checked, onchange: (e) => setTypeChecked(t.type, e.target.checked) }),
        h('span', {}, h('span', { text: name }), note ? h('span', { class: 'type-note', text: note }) : null));
    });
    const n = tabs.length - 1;
    return h('details', { class: 'type-pick', open: state.ui.typePickOpen || undefined, ontoggle: (e) => { state.ui.typePickOpen = e.target.open; save(); } },
      h('summary', {}, `項目の種類を選ぶ（${n}種類）`),
      h('p', { class: 'hint', text: 'Zotero の項目の種類です。チェックした種類ごとに並びを作れます。チェックの無い種類は「その他」の並びで組みます。CSL で同じ種類になるもの（手紙・電子メールなど）は書き分けられないので、1つにまとめてあります。' }),
      h('div', { class: 'type-check-grid' }, ...rows));
  }
  const TYPE_TABS_LABEL = Object.fromEntries(G.TYPE_TABS.map((t) => [t.key, t.label]));
  function setTypeChecked(type, on) {
    const m = state.model;
    const base = BASE_OF_MAIN[type];
    if (base) {
      m.baseOff = (m.baseOff || []).filter((k) => k !== base);
      if (!on) m.baseOff.push(base);
      if (on) state.ui.tab = base;
    } else {
      const key = 'x-' + type;
      if (on) {
        // 並びが無ければ、いまその種類を組んでいるタブから写す。前に作った並びが残っていれば、それを使う。
        const from = G.tabOfType(type, m);
        for (const sys of Object.values(m.systems)) for (const tg of ST.TARGETS) {
          sys[tg] = sys[tg] || {};
          if (!sys[tg][key]) sys[tg][key] = clone(sys[tg][from] || []).map((c) => { delete c.uid; return c; });
        }
        m.typeTabs = (m.typeTabs || []).filter((t) => t !== type).concat(type);
        ensureUids(m);
        state.ui.tab = key;
      } else {
        m.typeTabs = (m.typeTabs || []).filter((t) => t !== type);
      }
    }
    state.ui.sel = null;
    renderPanels(); renderPreviewHighlight();
    changed({ row: false });
  }

  function applySubPreset(kind, label) {
    const { panel } = state.ui;
    if (!confirm(`この書式の「注（2回目以降）」の並びを、全種類とも「${label}」の型に置き換えます。よろしいですか。`)) return;
    const sys = state.model.systems[panel];
    sys.citeSub = ST.subPreset(panel === 'ja' ? 'ja' : 'en', G.tabsOf(state.model).map((t) => t.key), kind);
    ensureUids(state.model);
    state.ui.sel = null;
    renderPanels();
    changed({ row: false });
  }
  function hasSubsequent() { return state.model.kind === 'note' && !!state.model.subsequent; }
  function copyChips(from, fromLabel) {
    const { panel, tab, target } = state.ui;
    if (!confirm(`この種類のいまの並びを、「${fromLabel}」の並びで置き換えます。よろしいですか。`)) return;
    const sys = state.model.systems[panel];
    const c = clone((sys[from] || {})[tab] || []);
    c.forEach((x) => { x.uid = 'c' + (++uidN); });
    sys[target][tab] = c;
    state.ui.sel = null;
    renderPanels();
    changed({ row: false });
  }

  function renderChipRow() {
    const row = $('chipRow');
    if (!row) return;
    const list = chips();
    if (!list.length) {
      row.replaceChildren(h('span', { class: 'empty-row', text: '部品がありません。下の「部品を足す」から足してください。' }));
      return;
    }
    const firstField = list.findIndex((c) => c.t !== 'sep');
    const lastField = list.length - 1 - [...list].reverse().findIndex((c) => c.t !== 'sep');
    row.replaceChildren(...list.map((c, i) => {
      const n = chipNode(c, i);
      if (c.uid === state.ui.sel) n.classList.add('selected');
      if (c.t === 'sep' && (firstField < 0 || i < firstField || i > lastField)) {
        n.classList.add('idle');
        n.title = '両側に部品が無いので、この区切りは出ません';
      }
      n.addEventListener('click', () => { state.ui.sel = c.uid; renderChipRow(); renderDetail(); });
      n.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      n.addEventListener('dragover', (e) => {
        e.preventDefault();
        const r = n.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        n.classList.toggle('drop-after', after);
        n.classList.toggle('drop-before', !after);
      });
      n.addEventListener('dragleave', () => n.classList.remove('drop-after', 'drop-before'));
      n.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const r = n.getBoundingClientRect();
        let to = i + (e.clientX > r.left + r.width / 2 ? 1 : 0);
        if (Number.isFinite(from)) moveChip(from, to);
      });
      return n;
    }));
  }

  function moveChip(from, to) {
    const list = chips();
    if (from < 0 || from >= list.length) return;
    const [c] = list.splice(from, 1);
    if (to > from) to -= 1;
    list.splice(Math.max(0, Math.min(list.length, to)), 0, c);
    state.ui.sel = c.uid;
    changed({ detail: true });
  }

  function insertChip(c) {
    c.uid = 'c' + (++uidN);
    const list = chips();
    const i = list.findIndex((x) => x.uid === state.ui.sel);
    list.splice(i >= 0 ? i + 1 : list.length, 0, c);
    state.ui.sel = c.uid;
    changed({ detail: true });
  }

  function insertGroup() {
    const list = chips();
    const open = { t: 'open', prefix: '', uid: 'c' + (++uidN) };
    const close = { t: 'close', suffix: '', uid: 'c' + (++uidN) };
    const i = list.findIndex((x) => x.uid === state.ui.sel);
    if (i >= 0 && list[i].t === 'field') list.splice(i, 1, open, list[i], close);
    else list.push(open, close);
    state.ui.sel = open.uid;
    changed({ detail: true });
  }
  // 〔 と 〕 の対を探す。見つからなければ -1。
  function pairOf(list, i) {
    const step = list[i].t === 'open' ? 1 : -1;
    let depth = 0;
    for (let k = i; k >= 0 && k < list.length; k += step) {
      if (list[k].t === 'open') depth += step;
      if (list[k].t === 'close') depth -= step;
      if (depth === 0) return k;
    }
    return -1;
  }

  function paletteNode() {
    const kind = state.model.kind;
    const target = state.ui.target;
    const fieldBtns = Object.entries(G.FIELDS)
      .filter(([k, d]) => !(d.citeOnly && target === 'bib'))
      .filter(([k]) => k !== 'citation-number' || kind === 'numeric')
      .map(([k, d]) => h('button', {
        type: 'button', title: '選んだ部品の後ろ（無ければ末尾）に足す',
        onclick: () => insertChip(ST.F(k, k === 'literal' ? { opt: { value: '' } } : {})),
      }, d.label));
    const custom = h('input', { type: 'text', placeholder: '自由入力', 'aria-label': '区切りの自由入力' });
    const sepBtns = SEP_CHOICES.map(([v, label]) => h('button', { type: 'button', onclick: () => insertChip(ST.S(v)) }, label));
    return h('div', { class: 'palette' },
      h('span', { class: 'lbl', text: '部品を足す' }), h('div', { class: 'btns' }, fieldBtns),
      h('span', { class: 'lbl', text: 'まとめる' }), h('div', { class: 'btns' },
        h('button', { type: 'button', onclick: insertGroup, title: '選んだ部品を〔 〕で囲む（選んでいなければ末尾に足す）' }, '〔 〕で囲む'),
        h('span', { class: 'hint', text: '〔 〕の中が全部空の文献では、まとまりと、その前の区切りが消えます（「書名. 〔訳者, 出版者, 年〕」）。' })),
      h('span', { class: 'lbl', text: '区切りを足す' }), h('div', { class: 'btns' }, sepBtns, custom,
        h('button', { type: 'button', onclick: () => { insertChip(ST.S(custom.value)); custom.value = ''; } }, '足す')));
  }

  // ---- 選んだチップの詳細 -----------------------------------------------------------
  function renderDetail() {
    const box = $('detail');
    if (!box) return;
    const c = selChip();
    if (!c) {
      box.replaceChildren(h('p', { class: 'hint', text: 'チップを押すと、ここで括弧や前後の文字を変えられます。' }));
      box.className = '';
      return;
    }
    box.className = 'detail';
    const list = chips();
    const i = list.indexOf(c);
    const head = h('div', { class: 'detail-head' },
      h('b', { text: c.t === 'sep' ? '区切り' : fieldLabel(c) }),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', disabled: i <= 0, onclick: () => moveChip(i, i - 1), title: '左へ' }, '←'),
      h('button', { type: 'button', disabled: i >= list.length - 1, onclick: () => moveChip(i, i + 2), title: '右へ' }, '→'),
      h('button', { type: 'button', onclick: () => { list.splice(i, 1); state.ui.sel = null; changed({ detail: true }); } }, '削除'));
    const grid = h('div', { class: 'form-grid' });
    const add = (label, ctl) => grid.append(h('label', { text: label }), ctl);
    const text = (get, set, ph) => h('input', { type: 'text', value: get() || '', placeholder: ph || '', oninput: (e) => { set(e.target.value); changed(); } });
    const select = (choices, get, set) => {
      const s = h('select', { onchange: (e) => { set(e.target.value); changed(); } },
        ...choices.map(([v, l]) => h('option', { value: v, text: l })));
      s.value = get();
      return s;
    };
    const check = (get, set, label) => h('label', {}, h('input', { type: 'checkbox', checked: !!get(), onchange: (e) => { set(e.target.checked); changed(); } }), ' ', label);

    if (c.t === 'open' || c.t === 'close') {
      const unwrap = h('button', { type: 'button', onclick: () => {
        const j = pairOf(list, i);
        [i, j].filter((k) => k >= 0).sort((a, b) => b - a).forEach((k) => list.splice(k, 1));
        state.ui.sel = null; changed({ detail: true });
      } }, 'まとまりを外す（中の部品は残す）');
      if (c.t === 'open') add('〔 の前に付ける文字', text(() => c.prefix, (v) => { c.prefix = v; }, '例：(　In␣'));
      else add('〕 の後ろに付ける文字', text(() => c.suffix, (v) => { c.suffix = v; }, '例：)'));
      box.replaceChildren(head, grid, h('p', { class: 'hint', text: '〔 〕で囲んだ部品は1つのまとまりになります。中の部品が全部空の文献では、まとまりも、前後に付けた文字も、その前の区切りも消えます。括弧（ ）をまとまりに付けると、中身が無いときに空の括弧が残りません。' }), unwrap);
      return;
    }
    if (c.t === 'sep') {
      add('区切りの文字', text(() => c.v, (v) => { c.v = v; }, '空なら「なし」'));
      box.replaceChildren(head, grid, h('p', { class: 'hint', text: '空白は ␣ で表示します。前後の部品のどちらかが空の文献では、この区切りは出ません。' }));
      return;
    }
    const def = G.FIELDS[c.f];
    c.opt = c.opt || {};
    const o = c.opt;
    if (def.kind === 'literal') add('文字', text(() => o.value, (v) => { o.value = v; }));
    add('前に付ける文字', text(() => c.prefix, (v) => { c.prefix = v; }));
    add('後ろに付ける文字', text(() => c.suffix, (v) => { c.suffix = v; }));
    add('括弧', select(Object.entries(WRAP_LABELS), () => c.wrap || 'none', (v) => { c.wrap = v; }));
    add('書体', h('span', {},
      check(() => c.italic, (v) => { c.italic = v; }, '斜体'), '　',
      check(() => c.caps === 'capitalize-first', (v) => { c.caps = v ? 'capitalize-first' : 'none'; }, '先頭を大文字')));
    if (def.kind === 'names') {
      add('名前の順', select([['given', '名 姓（そのまま）'], ['family', '最初の人だけ「姓, 名」'], ['family-all', '全員「姓, 名」']], () => o.order || 'given', (v) => { o.order = v; }));
      add('名前の形', select([['long', '姓名とも'], ['short', '姓だけ']], () => o.form || 'long', (v) => { o.form = v; }));
      if (c.f !== 'author') {
        add('役割語', select([['none', '付けない'], ['after', '後ろに付ける（山田花子編）'], ['before', '前に付ける（edited by）']], () => o.role || 'none', (v) => { o.role = v; renderDetail(); }));
        if (o.role && o.role !== 'none') {
          add('役割語の形', select([['short', '短い形（編・ed.・trans.）'], ['verb', '前に置く形（edited by）']], () => o.roleForm || (o.role === 'before' ? 'verb' : 'short'), (v) => { o.roleForm = v; }));
        }
      } else {
        add('著者が無いとき', check(() => o.substitute !== false, (v) => { o.substitute = v; }, '編者で代える（「山田太郎編」）'));
      }
    }
    if (def.hasForm) add('表記', select([['long', '全形'], ['short', '略記（Zotero の略記の欄）']], () => o.form || 'long', (v) => { o.form = v; }));
    if (def.kind === 'date') add('日付の形', select([['year', '年だけ'], ['ym', '年月'], ['ymd', '年月日'], ['numeric', '数字だけ']], () => o.form || 'year', (v) => { o.form = v; }));
    if (def.term) {
      const termKey = { volume: 'volume', issue: 'issue', page: 'page', locator: 'page', edition: 'edition', accessed: 'accessed' }[c.f];
      add('用語', select([['none', '付けない'], ['after', `後ろに付ける（「${termOf(termKey)}」）`], ['before', `前に付ける（「${termOf(termKey)}」）`]], () => o.label || 'none', (v) => { o.label = v; }));
    }
    const hints = [];
    if (def.term) hints.push('用語の文字は「用語表」で変えられます。');
    if (c.f === 'locator') hints.push('引用箇所は、Zotero で引用するときに選ぶ種類（ページ・章・節など）と値です。値が数字だけなら「42頁」「第2章」の形に整え、「第二章」「2章2節」のように文字を含むときは、用語を重ねずに入れたまま出します。');
    if (def.kind === 'date') hints.push('「年だけ」のときは、後ろに「年」を付けるかどうかを「後ろに付ける文字」で決めます。');
    box.replaceChildren(head, grid, ...hints.map((t) => h('p', { class: 'hint', text: t })));
  }

  // ---- 系統の設定（人名・文末） ---------------------------------------------------
  function systemCard(sk) {
    const S = state.model.systems[sk];
    S.names = S.names || {};
    S.layout = S.layout || { bib: {}, cite: {} };
    S.layout.bib = S.layout.bib || {};
    S.layout.cite = S.layout.cite || {};
    const n = S.names;
    const grid = h('div', { class: 'form-grid' });
    const add = (label, ctl) => grid.append(h('label', { text: label }), ctl);
    const inp = (obj, key, type = 'text') => h('input', {
      type, value: obj[key] ?? '',
      oninput: (e) => { obj[key] = type === 'number' ? (parseInt(e.target.value, 10) || '') : e.target.value; changed({ row: false }); },
    });
    const sel = (obj, key, choices) => {
      const s = h('select', { onchange: (e) => { obj[key] = e.target.value; changed({ row: false }); } }, ...choices.map(([v, l]) => h('option', { value: v, text: l })));
      s.value = obj[key] || choices[0][0];
      return s;
    };
    add('人名の間の区切り', inp(n, 'delimiter'));
    add('最後の人名の前', sel(n, 'and', [['none', '何も入れない'], ['text', '用語表の「最後の人名の前」'], ['symbol', '&']]));
    add('人数が多いとき', h('span', {}, inp(n, 'etAlMin', 'number'), ' 人以上なら、最初の ', inp(n, 'etAlUseFirst', 'number'), ' 人＋「', termOfSys(sk, 'et-al'), '」'));
    add('欧文の名', h('label', {}, h('input', { type: 'checkbox', checked: !!n.initialize, onchange: (e) => { n.initialize = e.target.checked; changed({ row: false }); } }), ' 頭文字にする（J. Smith）'));
    add('参考文献の文末', inp(S.layout.bib, 'suffix'));
    if (state.model.kind === 'note') add('注の文末', inp(S.layout.cite, 'suffix'));
    return h('div', { class: 'card' },
      h('h3', { text: (sk === 'ja' || sk === 'en' ? sysName(sk) : `${sysName(sk)}（${sk}）`) + 'の書式全体（全種類に共通）' }), grid,
      h('p', { class: 'hint', text: '和名（漢字・かな）は、姓と名の間を自動で詰め、頭文字にもしません。' }));
  }
  function termOfSys(sk, key) { return ((state.model.terms || {})[sk] || {})[key] || ''; }

  // ---- 用語表 ---------------------------------------------------------------
  function termsPanel() {
    const T = state.model.terms = state.model.terms || { ja: {}, en: {} };
    const keys = sysKeys();
    const rows = G.TERM_ROWS.map((r) => h('tr', {},
      h('td', { text: r.label }),
      ...keys.map((sk) => h('td', {}, h('input', {
        type: 'text', value: (T[sk] || {})[r.key] ?? '',
        oninput: (e) => { T[sk] = T[sk] || {}; T[sk][r.key] = e.target.value; changed({ row: false }); },
      })))));
    return h('div', {},
      h('p', { class: 'hint', text: '巻・号・頁などに添える言葉です。書式ごとに別々に持ちます。チップの「用語」で付ける位置を決めます。' }),
      h('table', { class: 'terms' }, h('thead', {}, h('tr', {}, h('th', { text: '項目' }),
        ...keys.map((k) => h('th', { text: k === 'ja' || k === 'en' ? sysName(k) : `${sysName(k)}（${k}）` })))), h('tbody', {}, rows)),
      h('p', { class: 'hint', text: '「欧文」の用語は、自分の書式を持たない欧文の言語（英語のほか、「欧文の書式で組む言語」に並べたもの）すべてに使われます。言語ごとの書式を足すと、その言語の列が増えます。' }));
  }

  // ---- 全体の設定 ----------------------------------------------------------------
  function settingsPanel() {
    const m = state.model;
    m.citeLayout = m.citeLayout || {};
    const grid = h('div', { class: 'form-grid' });
    const add = (label, ctl) => grid.append(h('label', { text: label }), ctl);
    const kindLabel = { note: '注形式', 'author-date': '著者年形式', author: '著者頁形式', numeric: '番号形式' }[m.kind];
    add('形式', h('span', {}, kindLabel + (ST.STARTERS[m.starter] ? '（' + ST.STARTERS[m.starter].name + 'をもとに作成）' : '') + '　',
      h('button', { type: 'button', onclick: openStarter }, '引用スタイルを選び直す')));
    const cl = m.citeLayout;
    const inp = (obj, key, ph) => h('input', { type: 'text', value: obj[key] || '', placeholder: ph || '', oninput: (e) => { obj[key] = e.target.value; changed({ row: false }); } });
    if (m.kind === 'note') {
      add('1つの注に複数の文献', h('span', {}, '区切り ', inp(cl, 'delimiter')));
      add('2回目以降の注', h('label', {}, h('input', { type: 'checkbox', checked: !!m.subsequent, onchange: (e) => {
        m.subsequent = e.target.checked;
        if (m.subsequent) { ST.ensureSubsequent(m); ensureUids(m); }
        renderPanels(); changed({ row: false });
      } }), ' 書き分ける（間を挟んだら短縮形、直前と同じ本なら「同上」）'));
    } else {
      add('本文中の引用の括弧', h('span', {}, '前 ', inp(cl, 'prefix'), '　後 ', inp(cl, 'suffix'), '　複数の区切り ', inp(cl, 'delimiter')));
    }
    add('欧文の書式で組む言語', h('input', {
      type: 'text', value: (m.euroLangs || []).join(' '),
      oninput: (e) => { m.euroLangs = e.target.value.split(/[\s,、]+/).map((x) => x.trim().toLowerCase()).filter(Boolean); changed({ row: false }); },
    }));
    if (m.kind !== 'numeric') {
      add('参考文献の並び', h('label', {}, h('input', { type: 'checkbox', checked: !!m.sortByLanguage, onchange: (e) => { m.sortByLanguage = e.target.checked; changed({ row: false }); } }), ' 和文を先に、欧文を後にまとめる'));
    }
    add('引用符と句読点', h('label', {}, h('input', { type: 'checkbox', checked: m.punctuationInQuote !== false, onchange: (e) => { m.punctuationInQuote = e.target.checked; changed({ row: false }); } }), ' “ ” の内側に . , を入れる（米国式）'));
    add('スタイルの ID', h('span', {}, h('code', { text: m.info.id }), ' ', h('button', {
      type: 'button', onclick: () => { m.info.id = newStyleId(); renderPanels(); changed({ row: false }); },
    }, '振り直す')));
    return h('div', {},
      grid,
      langCard(),
      h('p', { class: 'hint', text: '欧文の書式で組む言語は、Zotero の「言語」欄に入る言語コード（en fr de など）を空白で区切って並べます。先頭の言語（ふつうは en）の用語が使われます。言語ごとの書式を足した言語は、ここに並べなくてもその書式で組みます。どこにも無い言語の文献と、言語欄が空の文献は、和文の書式で組みます。' }),
      h('p', { class: 'hint', text: 'スタイルの ID は、Zotero がスタイルを見分ける名札です。公式スタイルと同じ ID にすると、元のスタイルが上書きされます。自分の版を別に残したいときは「振り直す」を押してから書き出してください。' }));
  }

  // ---- 言語ごとの書式 ------------------------------------------------------------
  function langCard() {
    const m = state.model;
    const extras = G.extraLangs(m);
    const input = h('input', { id: 'newLang', type: 'text', placeholder: '例：fr', size: 6,
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addLang(); } } });
    const addLang = () => {
      const err = ST.addLanguage(m, input.value);
      if (err) { alert(err); input.focus(); return; }
      const k = m.extraLangs[m.extraLangs.length - 1];
      ensureUids(m);
      state.ui.panel = k; state.ui.sel = null;
      renderPanels();
      changed({ row: false });
      toast(`${sysName(k)}（${k}）の書式を足しました。いまの欧文の書式を写してあります`);
    };
    const list = extras.length
      ? h('ul', { class: 'lang-list' }, ...extras.map((k) => h('li', {},
        h('b', { text: `${sysName(k)}（${k}）` }), ' ',
        h('button', { type: 'button', onclick: () => { state.ui.panel = k; state.ui.sel = null; renderPanels(); save(); } }, '開く'), ' ',
        h('button', { type: 'button', onclick: () => {
          if (!confirm(`${sysName(k)}（${k}）の書式を消します。この言語の文献は、また欧文（または和文）の書式で組まれます。よろしいですか。`)) return;
          ST.removeLanguage(m, k);
          renderPanels();
          changed({ row: false });
        } }, '消す'))))
      : h('p', { class: 'muted small', text: 'まだありません。いまは英語以外の欧文も、すべて「欧文の書式」で組みます。' });
    return h('div', { class: 'card' },
      h('h3', { text: '言語ごとの書式' }),
      h('p', { class: 'hint', text: '英語は「欧文の書式」が既定です。フランス語の文献は « » や「et」で組みたい、など言語ごとに変えたいときは、Zotero の「言語」欄の言語コード（fr、de など）を入れて足してください。いまの欧文の書式を写した新しい書式ができ、用語表にその言語の列が増えます。' }),
      list,
      h('div', { class: 'lang-add' }, '言語コード ', input, ' ', h('button', { type: 'button', onclick: addLang }, '足す')));
  }

  // ---- 右：プレビュー ---------------------------------------------------------------
  function currentItems() { return state.items || SAMPLES; }
  // プレビューと組版に出す文献（隠した文献を除く）。
  function visibleItems() {
    const off = new Set(state.hidden);
    return currentItems().filter((i) => !off.has(String(i.id)));
  }
  function usingSamples() { return state.items === null || /^見本データ/.test(state.source); }
  function itemCounts() {
    const counts = {};
    for (const it of visibleItems()) {
      const { sys } = G.systemOfItem(it, state.model.euroLangs, G.extraLangs(state.model));
      const k = sys + '|' + G.tabOfType(it.type, state.model);
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }
  function langWarning(it) {
    const r = G.systemOfItem(it, state.model.euroLangs, G.extraLangs(state.model));
    const v = (it.language || '').trim();
    if (!r.warn && r.sys !== 'ja' && r.sys !== 'en' && !ST.BUNDLED_LOCALES.includes(r.sys)) {
      return `このアプリには「${r.sys}」の言語の設定が無いので、プレビューの月名や引用符は英語で出ます。Zotero では${sysName(r.sys)}の形で出ます。`;
    }
    if (r.warn === 'empty') return '言語欄が空なので、和文の書式で組みます。Zotero の「言語」欄に ja か en などを入れてください。';
    if (r.warn === 'unknown') return `言語欄の「${v}」は言語コードとして読めないので、和文の書式で組みます。Zotero で ja や en に直してください。`;
    if (r.warn === 'other') return `言語「${v}」は「欧文の書式で組む言語」にも、言語ごとの書式にも無いので、和文の書式で組みます。`;
    return null;
  }

  let timer = null;
  function schedulePreview() {
    clearTimeout(timer);
    timer = setTimeout(renderPreview, 120);
  }

  // ロケールの探し方：完全一致 → 言語の先頭が同じもの → 英語の中身を、その言語として返す
  // （このアプリに入れていない言語でも止まらずに組めるように。月名などは英語になる）。
  function retrieveLocale(l) {
    if (LOCALES[l]) return LOCALES[l];
    const p = String(l).split('-')[0];
    const k = Object.keys(LOCALES).find((x) => x.split('-')[0] === p);
    if (k) return LOCALES[k];
    return LOCALES['en-US'].replace('xml:lang="en-US"', `xml:lang="${l}"`);
  }

  function makeEngine(xml, items) {
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const sys = {
      retrieveLocale,
      retrieveItem: (id) => byId[id],
    };
    const e = new window.CSL.Engine(sys, xml, 'ja-JP', true);
    e.setOutputFormat('html');
    e.updateItems(items.map((i) => i.id));
    return e;
  }

  function renderPreview() {
    if (state.mode === 'official') { renderOfficialPreview(); return; }
    const items = visibleItems();
    const hiddenItems = currentItems().filter((i) => state.hidden.includes(String(i.id)));
    $('dataSource').textContent = `${state.source}・${items.length}件` + (hiddenItems.length ? `（ほかに隠した文献 ${hiddenItems.length}件）` : '');
    $('btnResetItems').hidden = state.items === null && !state.hidden.length;
    $('btnAddItem').textContent = usingSamples() ? '見本の書誌を編集する' : '書誌を編集する';
    const errBox = $('previewError');
    let xml, eng, bib;
    try {
      xml = G.generate(state.model);
      eng = makeEngine(xml, items);
      bib = eng.makeBibliography();
      errBox.hidden = true;
    } catch (err) {
      errBox.hidden = false;
      errBox.textContent = '組版でエラーが出ました。直前の変更を戻してみてください。\n' + (err && err.message ? err.message : err);
      return;
    }
    const [meta, entries] = bib;
    const order = meta.entry_ids.map((ids) => ids[0]);
    const bibById = Object.fromEntries(order.map((id, k) => [id, entries[k]]));
    const listed = new Set(order);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    // 並びは、種類のタブの順（図書・本の章・雑誌論文・ウェブページ・足した種類・その他）。
    // 同じ種類の中は著者の人数の順（単著・2名・…・著者なし）、その中は参考文献の順。
    const tabList = G.tabsOf(state.model);
    const tabLabel = Object.fromEntries(tabList.map((t) => [t.key, t.label]));
    const tabIdx = Object.fromEntries(tabList.map((t, k) => [t.key, k]));
    const all = order.concat(items.map((i) => i.id).filter((id) => !listed.has(id)))
      .map((id, k) => ({ id, k, t: tabIdx[G.tabOfType(byId[id].type, state.model)], n: (byId[id].author || []).length || 99 }))
      .sort((a, b) => a.t - b.t || a.n - b.n || a.k - b.k).map((x) => x.id);
    const nodes = all.map((id) => {
      const it = byId[id];
      const { sys } = G.systemOfItem(it, state.model.euroLangs, G.extraLangs(state.model));
      const tab = G.tabOfType(it.type, state.model);
      let cite = '';
      let citeRows = null;
      try {
        if (hasSubsequent()) citeRows = noteSequence(eng, id, items);
        else cite = eng.makeCitationCluster([{ id, locator: curLoc().value, label: curLoc().label }]);
      } catch (e) { cite = '（組めませんでした）'; citeRows = null; }
      const warn = langWarning(it);
      const card = h('div', { class: 'item', 'data-sys': sys, 'data-tab': tab, 'data-authors': authorCountLabel(it), title: '押すと、この文献の書式を編集します',
        onclick: () => { state.ui.panel = sys; state.ui.tab = tab; state.ui.sel = null; renderPanels(); renderPreviewHighlight(); save(); } },
        h('div', { class: 'meta' },
          h('span', { class: 'badge', text: tabLabel[tab] + (tab === 'other' || !(MAIN_TYPES.includes(it.type) || tab.startsWith('x-')) ? `（${G.cslTypeLabel(it.type || '')}）` : '') }),
          h('span', { class: 'badge sys-' + (sys === 'ja' ? 'ja' : 'en'), text: sysBadge(sys) }),
          h('span', { class: 'badge', text: authorCountLabel(it) }),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'small-btn', onclick: (e) => { e.stopPropagation(); openItemEditor(id); } }, '直す'),
          h('button', { type: 'button', class: 'small-btn', title: 'プレビューに出さないようにします。データは残り、下の「隠した文献」から戻せます', onclick: (e) => { e.stopPropagation(); hideItem(id); } }, '隠す')),
        h('div', { class: 'out' },
          h('span', { class: 'k', text: '参考文献' }), h('span', { class: 'v', html: bibById[id] ? stripDiv(bibById[id]) : '<span class="muted">（参考文献に出ません）</span>' }),
          ...(citeRows
            ? citeRows.flatMap(([k, v]) => [h('span', { class: 'k', text: k }), h('span', { class: 'v', html: v })])
            : [h('span', { class: 'k', text: state.model.kind === 'note' ? '注' : '本文中' }), h('span', { class: 'v', html: cite })])),
        warn ? h('div', { class: 'warn', text: warn }) : null);
      return card;
    });
    const hiddenBox = hiddenItems.length ? h('details', { class: 'hidden-items' },
      h('summary', { text: `隠した文献 ${hiddenItems.length}件` }),
      h('ul', {}, ...hiddenItems.map((it) => h('li', {},
        h('span', { text: itemSummary(it) }),
        h('button', { type: 'button', class: 'small-btn', onclick: () => unhideItem(it.id) }, '戻す'))))) : null;
    $('previewList').replaceChildren(...nodes, h('p', { id: 'previewEmpty', class: 'muted small', hidden: true,
      text: '条件に合う文献がありません。絞り込みを変えるか、「書誌を編集する」から「新しく入れる」で入れてみてください（言語ごとの書式なら、言語欄をその言語にします）。' }), hiddenBox || '');
    renderPreviewHighlight();
    // 種類ごとの件数を更新する
    if (isFormatPanel(state.ui.panel)) {
      const counts = itemCounts();
      document.querySelectorAll('.type-tabs button').forEach((b, k) => {
        const t = G.tabsOf(state.model)[k];
        const c = counts[state.ui.panel + '|' + t.key];
        const span = b.querySelector('.count');
        if (span) span.textContent = c ? c + '件' : '';
      });
    }
  }
  // プレビューで引く箇所（Zotero で引用するときに選ぶ種類と値）。
  const LOCS = [['page:42', '頁 42'], ['page:42-45', '頁 42-45'], ['chapter:2', '章 2'], ['chapter:第二章', '章 第二章'], ['chapter:2章2節', '章 2章2節'], ['section:3', '節 3']];
  function curLoc() {
    const v = LOCS.some(([k]) => k === state.ui.loc) ? state.ui.loc : 'page:42';
    const i = v.indexOf(':');
    return { label: v.slice(0, i), value: v.slice(i + 1) };
  }
  // 同じ本を何度か引いたときの注を、続けて組んで見せる。
  // 注1：初出（42頁）／注2：直前と同じ本・同じ頁／注3：直前と同じ本・別の頁（45頁）／注4：別の本／注5：間を挟んで同じ本（50頁）。
  function noteSequence(eng, id, items) {
    const other = (items.find((i) => i.id !== id) || {}).id;
    const { label, value } = curLoc();
    // 数字の箇所なら、別の箇所は +3 と +8（頁なら 45・50）。文字の箇所（第二章など）は同じ値のまま。
    const num = /^\d+$/.test(value);
    const alt = num ? String(+value + 3) : value, far = num ? String(+value + 8) : value;
    const seq = [[id, value, label], [id, value, label], [id, alt, label]];
    if (other) seq.push([other, '10', 'page'], [id, far, label]);
    const cits = seq.map(([x, loc, lab], k) => ({ citationID: 'seq' + k, citationItems: [{ id: x, locator: loc, label: lab }], properties: { noteIndex: k + 1 } }));
    const out = eng.rebuildProcessorState(cits, 'html');
    const txt = Object.fromEntries(out.map(([cid, , str]) => [cid, str]));
    const rows = [['注（初出）', txt.seq0], ['続けて同じ箇所', txt.seq1], ['続けて別の箇所', txt.seq2]];
    if (other) rows.push(['間を挟んで', txt.seq4]);
    return rows;
  }
  // 著者の人数。人名の区切り・「ほか」の略し方の違いを見比べるための札。
  function authorCountLabel(it) {
    const n = (it.author || []).length;
    if (n === 0) return (it.editor || []).length ? '著者なし（編者あり）' : '著者なし';
    if (n === 1) return '単著';
    if (n <= 3) return '2〜3名共著';
    return '4名以上の共著';
  }
  function stripDiv(s) { return s.replace(/^\s*<div class="csl-entry">/, '').replace(/<\/div>\s*$/, ''); }
  // プレビューは、いま開いている書式（和文・欧文・fr など）の文献だけを出すのが既定。
  // 用語表と全体の設定を開いているときは全部出す。「すべて表示」で切り替えられる。
  function renderPreviewHighlight() {
    if (state.mode === 'official') { offFilter(); return; }
    const { panel, tab } = state.ui;
    // 言語の絞り込み：auto＝いま開いている書式に合わせる（用語表・全体の設定では全部）、all＝全部、sys:ja など＝その書式だけ。
    let f = state.ui.filter || 'auto';
    if (f.startsWith('sys:') && !isFormatPanel(f.slice(4))) f = state.ui.filter = 'auto';
    const langSys = f === 'all' ? null : f.startsWith('sys:') ? f.slice(4) : (isFormatPanel(panel) ? panel : null);
    const allLang = langSys === null;
    const who = state.ui.authors || '';
    let shown = 0, total = 0;
    document.querySelectorAll('#previewList .item').forEach((n) => {
      n.classList.toggle('current', n.dataset.sys === panel && n.dataset.tab === tab);
      const on = (allLang || n.dataset.sys === langSys) && (!who || n.dataset.authors === who);
      n.hidden = !on;
      total++;
      if (on) shown++;
    });
    const box = $('previewFilter');
    if (!box) return;
    const parts = [];
    const sysLabel = (k) => k === 'ja' ? '和文' : k === 'en' ? '欧文（英語ほか）' : `${sysName(k)}（${k}）`;
    const lang = h('select', { class: 'small-sel', title: '言語（書式）で絞り込む',
      onchange: (e) => { state.ui.filter = e.target.value; renderPreviewHighlight(); save(); } },
      h('option', { value: 'auto', text: '言語：いま開いている書式' + (isFormatPanel(panel) ? `（${sysLabel(panel)}）` : '') }),
      h('option', { value: 'all', text: '言語：すべて' }),
      ...sysKeys().map((k) => h('option', { value: 'sys:' + k, text: '言語：' + sysLabel(k) })));
    lang.value = f;
    parts.push(lang);
    const kinds = ['単著', '2〜3名共著', '4名以上の共著', '著者なし（編者あり）', '著者なし'];
    const present = new Set([...document.querySelectorAll('#previewList .item')].map((n) => n.dataset.authors));
    const sel = h('select', { class: 'small-sel', title: '著者の人数で絞り込む',
      onchange: (e) => { state.ui.authors = e.target.value; renderPreviewHighlight(); save(); } },
      h('option', { value: '', text: '著者：すべて' }),
      ...kinds.filter((k) => present.has(k) || k === who).map((k) => h('option', { value: k, text: '著者：' + k })));
    sel.value = who;
    const loc = h('select', { class: 'small-sel', id: 'locSel', title: '引用箇所：Zotero で引用するときに選ぶ種類と値。注や本文中の引用をこれで組む',
      onchange: (e) => { state.ui.loc = e.target.value; renderPreview(); save(); } },
      ...LOCS.map(([k, l]) => h('option', { value: k, text: '引用箇所：' + l })));
    loc.value = LOCS.some(([k]) => k === state.ui.loc) ? state.ui.loc : 'page:42';
    parts.push(sel, loc, h('span', { class: 'muted', text: `${shown}/${total}件` }));
    box.replaceChildren(...parts);
    const empty = $('previewEmpty');
    if (empty) empty.hidden = shown > 0;
  }

  // ---- 文献の手入力 ------------------------------------------------------------
  // CSL JSON の項目を、資料の種類ごとに出し分けて入れてもらう。フォームに無い項目は元のまま残す。
  // 種類は Zotero の全種類（CSL の種類ごとにまとめたもの）。欄の出し分けを決めてある種類以外は、全部の欄を出す。
  const ITEM_TYPES = G.CSL_TYPES.map((t) => [t.type, t.label]);
  const ITEM_TYPE_LABEL = Object.fromEntries(ITEM_TYPES);
  const FIELD_KNOWN_TYPES = ['book', 'chapter', 'article-journal', 'paper-conference', 'webpage', 'thesis', 'report'];
  const ALL = null;
  // [項目, 見出し, 入れ方, 出す種類（null は全部）, 種類ごとの見出し, 例]
  const ITEM_FIELDS = [
    ['language', '言語', 'lang', ALL, null, 'ja、en、fr など。和文か欧文かがこれで決まります'],
    ['author', '著者', 'names', ALL, null, ''],
    ['editor', '編者', 'names', ['book', 'chapter', 'paper-conference', 'report'], null, ''],
    ['translator', '訳者', 'names', ['book', 'chapter', 'article-journal'], null, ''],
    ['title', '題名', 'text', ALL, { book: '書名' }, ''],
    ['title-short', '短いタイトル', 'text', ALL, null, '2回目以降の注で使う短い形。空なら題名のまま'],
    ['container-title', '掲載誌名', 'text', ['chapter', 'paper-conference', 'article-journal', 'webpage'], { chapter: '収録書名', 'paper-conference': '会議録名', webpage: 'サイト名', 'article-magazine': '雑誌名', 'article-newspaper': '新聞名', 'post-weblog': 'ブログ名', 'entry-encyclopedia': '事典名', 'entry-dictionary': '辞書名' }, ''],
    ['collection-title', '叢書名', 'text', ['book', 'report'], null, ''],
    ['edition', '版', 'text', ['book'], null, '例：2'],
    ['volume', '巻', 'text', ['book', 'chapter', 'article-journal'], null, ''],
    ['issue', '号', 'text', ['article-journal'], null, ''],
    ['page', '掲載頁', 'text', ['chapter', 'paper-conference', 'article-journal'], null, '例：45-67'],
    ['publisher', '出版者', 'text', ['book', 'chapter', 'paper-conference', 'report', 'thesis'], { thesis: '大学名', report: '発行機関' }, ''],
    ['publisher-place', '出版地', 'text', ['book', 'chapter', 'paper-conference', 'report', 'thesis'], null, ''],
    ['issued', '発行年月日', 'date', ALL, null, '例：2024　2024-3　2024-3-1'],
    ['accessed', '参照日', 'date', ['webpage'], null, '例：2026-11-1'],
    ['URL', 'URL', 'text', ALL, null, ''],
    ['DOI', 'DOI', 'text', ['article-journal', 'chapter', 'paper-conference', 'book'], null, '例：10.1234/abcd'],
  ];

  // 赤い * を付ける欄（その種類の書誌に欠かせないもの）。保存を止めるのは MUST（言語と題名）が空のときだけ。
  const MUST = ['language', 'title'];
  const REQ_CHAPTER = ['author', 'title', 'container-title', 'publisher', 'issued', 'page'];
  const REQ_WEB = ['title', 'container-title', 'URL', 'accessed'];
  const REQUIRED = {
    book: ['author', 'title', 'publisher', 'issued'],
    chapter: REQ_CHAPTER,
    'paper-conference': REQ_CHAPTER,
    'article-journal': ['author', 'title', 'container-title', 'volume', 'issued', 'page'],
    'article-magazine': ['author', 'title', 'container-title', 'issued'],
    'article-newspaper': ['title', 'container-title', 'issued'],
    webpage: REQ_WEB,
    'post-weblog': REQ_WEB,
    post: REQ_WEB,
    thesis: ['author', 'title', 'publisher', 'issued'],
    report: ['author', 'title', 'publisher', 'issued'],
  };
  function requiredOf(type) { return new Set([...MUST, ...(REQUIRED[type] || ['author', 'title', 'issued'])]); }

  // 1行に1人。「姓, 名」。カンマが無く、空白で区切った和名は姓と名に分ける。それ以外はそのまま（団体名など）。
  function parseNames(text) {
    return String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(.+?)\s*[,，、]\s*(.+)$/);
      if (m) return { family: m[1], given: m[2] };
      const j = l.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+)[\s　]+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+)$/u);
      if (j) return { family: j[1], given: j[2] };
      return { literal: l };
    });
  }
  function namesToText(names) {
    return (names || []).map((n) => n.literal || [n.family, n.given].filter(Boolean).join(', ')).join('\n');
  }
  // 2024 / 2024-3 / 2024/3/1 / 2024年3月1日 → date-parts。読めなければ literal で持つ。
  function parseDate(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const m = t.match(/^(\d{1,4})(?:\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2})\s*日?)?\s*月?)?\s*年?$/);
    if (m) return { 'date-parts': [[m[1], m[2], m[3]].filter(Boolean).map(Number)] };
    return { literal: t };
  }
  function dateToText(d) {
    if (!d) return '';
    if (d['date-parts'] && d['date-parts'][0]) return d['date-parts'][0].join('-');
    return d.literal || d.raw || '';
  }

  // 見本や読み込んだデータに手を入れるときは、写しを作ってから直す。
  function editableItems() {
    if (state.items === null) {
      state.items = clone(SAMPLES);
      state.source = '見本データ（手を加えたもの）';
    } else if (!/（手を加えたもの）$/.test(state.source)) {
      state.source += '（手を加えたもの）';
    }
    return state.items;
  }

  function openItemEditor(id) {
    const orig = id === null ? null : currentItems().find((i) => i.id === id);
    const it = orig ? clone(orig) : { type: 'book', language: 'ja' };
    const form = $('itemForm');
    const typeSel = h('select', {}, ...ITEM_TYPES.map(([v, l]) => h('option', { value: v, text: l })));
    if (!ITEM_TYPE_LABEL[it.type]) typeSel.append(h('option', { value: it.type, text: it.type }));
    typeSel.value = it.type;
    const grid = h('div', { class: 'form-grid item-grid' });
    const ctls = {};
    const rows = {};
    for (const [key, label, kind, , , ex] of ITEM_FIELDS) {
      let ctl;
      if (kind === 'names') {
        ctl = h('textarea', { rows: 2, placeholder: '1行に1人。姓, 名（例：山田, 花子　Dubois, Léa）' });
        ctl.value = namesToText(it[key]);
      } else if (kind === 'date') {
        ctl = h('input', { type: 'text', placeholder: ex, value: dateToText(it[key]) });
      } else if (kind === 'lang') {
        ctl = h('input', { type: 'text', list: 'langList', placeholder: ex, value: it[key] || '' });
      } else {
        ctl = h('input', { type: 'text', placeholder: ex, value: it[key] == null ? '' : String(it[key]) });
      }
      ctls[key] = ctl;
      const lab = h('label', { text: label });
      rows[key] = [lab, ctl];
      grid.append(lab, ctl);
    }
    const showFor = () => {
      const t = typeSel.value;
      const req = requiredOf(t);
      for (const [key, label, , types, byType] of ITEM_FIELDS) {
        const on = req.has(key) || !types || types.includes(t) || !FIELD_KNOWN_TYPES.includes(t) || (ctls[key].value || '').trim() !== '';
        rows[key][0].hidden = rows[key][1].hidden = !on;
        rows[key][0].textContent = (byType && byType[t]) || label;
        rows[key][0].classList.toggle('req', req.has(key));
      }
    };
    for (const k of MUST) ctls[k].addEventListener('input', () => ctls[k].classList.remove('bad'));
    typeSel.addEventListener('change', showFor);
    showFor();
    const langList = h('datalist', { id: 'langList' }, ...['ja', 'en', 'fr', 'de', 'it', 'es', 'nl', 'la', 'zh', 'ko'].map((v) => h('option', { value: v })));
    const ok = h('button', { type: 'button', class: 'primary' }, orig ? '直す' : '入れる');
    ok.addEventListener('click', () => {
      const empty = MUST.filter((k) => !ctls[k].value.trim());
      if (empty.length) {
        empty.forEach((k) => ctls[k].classList.add('bad'));
        alert('言語と題名は必ず入れてください。言語で和文か欧文かの書式が決まります（ja、en、fr など）。');
        ctls[empty[0]].focus();
        return;
      }
      const out = orig ? clone(orig) : {};
      out.type = typeSel.value;
      for (const [key, , kind] of ITEM_FIELDS) {
        const v = ctls[key].value.trim();
        delete out[key];
        if (!v) continue;
        if (kind === 'names') out[key] = parseNames(v);
        else if (kind === 'date') out[key] = parseDate(v);
        else out[key] = v;
      }
      const items = editableItems();
      if (orig) {
        const k = items.findIndex((i) => i.id === orig.id);
        items[k] = out;
      } else {
        out.id = 'u-' + Date.now().toString(36);
        items.push(out);
      }
      $('dlgItem').close();
      renderPanels();
      changed({ row: false });
      toast(orig ? '文献を直しました' : '文献を入れました');
    });
    form.replaceChildren(
      h('h2', { text: orig ? '文献を直す' : '文献を新しく入れる' }),
      h('div', { class: 'form-grid item-grid' }, h('label', { text: '資料の種類' }), typeSel),
      grid, langList,
      h('p', { class: 'hint' }, h('span', { class: 'req-mark', text: '*' }), ' は、この種類の書誌に欠かせない項目です。言語と題名が空のままでは保存できません。'),
      h('p', { class: 'hint', text: '人名は1行に1人、「姓, 名」の順でカンマで区切ります。和名は「山田 花子」と空白で区切ってもかまいません。カンマも空白も無い行は、団体名などとしてそのまま出します。入れた文献はこのブラウザの中にだけ保存されます。' }),
      h('div', { class: 'dlg-actions' }, h('button', { value: 'cancel' }, 'やめる'), ' ', ok));
    $('dlgItem').showModal();
  }

  // 隠す：データは残し、プレビューと組版から外す。戻すと元の位置に出る。
  function hideItem(id) {
    if (!state.hidden.includes(String(id))) state.hidden.push(String(id));
    renderPanels();
    changed({ row: false });
    toast('隠しました。プレビューの下の「隠した文献」から戻せます');
  }
  function unhideItem(id) {
    state.hidden = state.hidden.filter((x) => x !== String(id));
    renderPanels();
    changed({ row: false });
  }
  // 一覧の1行：〔図書・和文〕山田花子『デジタル史料学入門』2024
  function itemSummary(it) {
    const { sys } = G.systemOfItem(it, state.model.euroLangs, G.extraLangs(state.model));
    const tab = G.tabsOf(state.model).find((t) => t.key === G.tabOfType(it.type, state.model));
    const who = (it.author || it.editor || []).map((n) => n.literal || n.family || '').filter(Boolean);
    const y = it.issued && it.issued['date-parts'] ? it.issued['date-parts'][0][0] : '';
    return `〔${tab ? tab.label : it.type}・${sysBadge(sys)}〕` + (who.length ? who.slice(0, 2).join('・') + (who.length > 2 ? ' ほか' : '') + '　' : '') + (it.title || '（題名なし）') + (y ? `　${y}` : '');
  }
  // 「見本の書誌を編集する」：文献の一覧から選んで直す。末尾の「新しく入れる」で手入力もできる。
  function openItemList() {
    const off = new Set(state.hidden);
    const tabIdx = Object.fromEntries(G.tabsOf(state.model).map((t, k) => [t.key, k]));
    const items = currentItems().map((it, k) => ({ it, k, t: tabIdx[G.tabOfType(it.type, state.model)] ?? 99 }))
      .sort((a, b) => a.t - b.t || a.k - b.k).map((x) => x.it);
    $('itemListTitle').textContent = usingSamples() ? '見本の書誌を編集する' : '書誌を編集する';
    $('itemList').replaceChildren(...items.map((it) => h('button', { type: 'button', class: 'item-pick' + (off.has(String(it.id)) ? ' is-hidden' : ''),
      onclick: () => { $('dlgItemList').close(); openItemEditor(it.id); } },
      itemSummary(it), off.has(String(it.id)) ? h('span', { class: 'muted', text: '（隠している）' }) : '')));
    $('dlgItemList').showModal();
  }

  // ---- 読み込み・書き出し ------------------------------------------------------------
  function readFile(input, cb) {
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { cb(String(r.result), f.name); input.value = ''; };
      r.readAsText(f, 'utf-8');
    };
    input.click();
  }

  // 形式を選び間違えたときに、何の形式かを言って書き出し直しを頼む。
  const REEXPORT = 'Zotero で文献を選んで右クリック →「選択された項目をエクスポート...」で、形式を「CSL JSON」にして書き出し直してください。';
  function guessFormat(text) {
    const t = String(text).replace(/^\uFEFF/, '').trim();
    if (/^@\w+\s*[{(]/m.test(t) && !/^[\[{]/.test(t)) return 'BibTeX または BibLaTeX';
    if (/^TY {2}- /m.test(t)) return 'RIS';
    if (/<rdf:RDF/.test(t)) return 'Zotero RDF';
    if (/^"?Key"?,"?Item Type"?/.test(t)) return 'CSV';
    if (/^<\?xml/.test(t) || /^</.test(t)) return 'XML';
    return null;
  }
  function loadItems(text, name) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      const f = guessFormat(text);
      alert((f ? `このファイルは ${f} の形式なので、読み込めません。` : 'このファイルは読み込めませんでした。') + REEXPORT);
      return;
    }
    if (!Array.isArray(data)) data = data && Array.isArray(data.items) ? data.items : null;
    // Zotero 独自の JSON（Better BibTeX JSON など）は、項目の種類を itemType で持つ。CSL JSON は type。
    if (data && data.length && data.every((it) => it && it.itemType && !it.type)) {
      alert('このファイルは Zotero 独自の JSON の形式なので、読み込めません。' + REEXPORT);
      return;
    }
    if (!data || !data.length) { alert('文献が見つかりませんでした。' + REEXPORT); return; }
    const seen = new Set();
    data.forEach((it, k) => {
      let id = it.id === undefined || it.id === null ? 'item-' + k : String(it.id);
      while (seen.has(id)) id += '_';
      seen.add(id);
      it.id = id;
      if (!it.type) it.type = 'book';
    });
    state.items = data;
    state.source = name;
    state.hidden = [];
    renderPanels();
    changed({ row: false });
    toast(`${data.length}件の文献を読み込みました`);
  }

  // 読み込んだ .csl の名前：ファイル名（.csl を除く）に _edited を付ける。
  // すでに _edited で終わるなら付け足さない。言語別に書き出したもの（_ja・_en・_fr など）は、その印を外してから付ける。
  // 使えない文字は _ にし、何も残らなければファイルに埋め込んだ名前を使う。
  function editedTitle(fileName, m) {
    let base = String(fileName || '').replace(/\.(csl|xml)$/i, '');
    base = [...base].map((c) => (TITLE_OK.test(c) ? c : '_')).join('').replace(/_+/g, '_').replace(/^[_\s]+|[_\s]+$/g, '');
    if (!base || /^_*$/.test(base)) base = (m.info && m.info.title) || 'My_style';
    // 末尾の _edited と言語の印を、無くなるまで外す（X_edited_en、X_edited_edited も X に戻る）。
    const langs = ['ja', 'en', ...G.extraLangs(m)];
    for (let more = true; more;) {
      more = false;
      if (/_edited$/.test(base)) { base = base.slice(0, -'_edited'.length); more = true; }
      const lm = base.match(/_([a-z]{2,3})$/);
      if (lm && langs.includes(lm[1])) { base = base.slice(0, -lm[0].length); more = true; }
    }
    return (base || 'My_style') + '_edited';
  }

  function loadCsl(text, fileName) {
    let m = null;
    try { m = G.extractModel(text); } catch (e) { m = null; }
    if (!m || !m.systems) {
      // このアプリで書き出したものでなければ、公式のスタイルとして手直しする
      if (O.isCsl(text)) return enterOfficial(text, fileName);
      alert('引用スタイル（CSL）のファイルとして読めませんでした。拡張子が .csl のファイルを選んでください。');
      return false;
    }
    state.mode = 'chips';
    state.model = upgradeModel(m);
    ensureUids(m);
    // 名前が変わるときは ID も振り直す（同じ ID だと、Zotero で元のスタイルを上書きしてしまう）。
    // X_edited をもう一度読み込んだときは名前も ID もそのままなので、Zotero では同じスタイルの更新になる。
    if (fileName !== undefined) {
      const t = editedTitle(fileName, m);
      if (t !== m.info.title) { m.info.title = t; m.info.id = newStyleId(); }
    }
    state.ui.sel = null;
    setTitleField(m.info.title);
    renderPanels();
    changed({ row: false });
    toast('.csl を読み込みました。続きから直せます');
    return true;
  }

  // スタイル名に使える文字。日本語などはファイル名や Zotero の一覧で崩れるおそれがあるので使わせない。
  const TITLE_OK = /^[A-Za-z0-9 _\-.()]$/;
  function badTitleChars(t) {
    return [...new Set([...(t || '')].filter((c) => !TITLE_OK.test(c)))];
  }
  function titleProblem(t) {
    if (!t || !t.trim()) return '';
    const bad = badTitleChars(t);
    if (!bad.length) return '';
    return '使えない文字：' + bad.map((c) => (c === '\u3000' ? '全角の空白' : c)).join(' ') + '（半角の英字・数字と _ - . ( ) と空白だけ）';
  }
  function showTitleState() {
    const el = $('styleTitle'), msg = $('styleTitleMsg');
    const p = titleProblem(el.value);
    el.classList.toggle('bad', !!p);
    msg.textContent = p;
    msg.hidden = !p;
  }
  function setTitleField(t) {
    $('styleTitle').value = t || '';
    showTitleState();
  }

  // 書き出す前の確認：スタイル名が入っていて、使える文字だけか。
  // いまのスタイル名と ID の置き場所（型から組むときはモデル、手直しのときは state.official）。
  function curInfo() { return state.mode === 'official' ? state.official : state.model.info; }
  function titleReady() {
    const m = { info: curInfo() };
    if (!m.info.title || !m.info.title.trim()) {
      alert('上の「スタイル名」を入れてから書き出してください。Zotero の一覧にはこの名前で出ます。');
      $('styleTitle').focus();
      return false;
    }
    if (titleProblem(m.info.title)) {
      alert('スタイル名には、半角の英字・数字と _ - . ( ) と空白だけを使ってください（日本語は使えません）。\n例：thesis_japanese_history');
      $('styleTitle').focus();
      return false;
    }
    m.info.title = m.info.title.trim();
    return true;
  }
  function fileBase() { return curInfo().title.trim().replace(/[\\/:*?"<>|\s]+/g, '_'); }
  const CSL_MIME = 'application/vnd.citationstyles.style+xml';
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function exportCsl() {
    if (!titleReady()) return;
    if (state.mode === 'official') { exportOfficial(); return; }
    const name = fileBase() + '.csl';
    download(new Blob([G.generate(state.model)], { type: CSL_MIME }), name);
    toast(`${name} を書き出しました。Zotero の 設定 → 引用 →「＋」から入れてください`);
  }

  // ---- 言語別の書き出し ------------------------------------------------------------
  // 書式（和文・欧文・足した言語）ごとに、その書式だけで組む標準の CSL を作る。2つ以上なら zip にまとめる。
  function splitKeys() { return ['ja', 'en', ...G.extraLangs(state.model)]; }
  function splitLabel(k) {
    const m = state.model;
    if (k === 'ja') return '和文の書式（言語欄が ja・空欄・ほかの書式に無い言語の文献）';
    if (k === 'en') return `欧文の書式（${(m.euroLangs || ['en']).filter((l) => !G.extraLangs(m).includes(l)).join(' ')}）`;
    return `${(m.systems[k] && m.systems[k].label) || k}の書式（${k}）`;
  }
  function openSplit() {
    if (!titleReady()) return;
    const boxes = splitKeys().map((k) => h('input', { type: 'checkbox', value: k, checked: true }));
    const showFiles = () => {
      const on = boxes.filter((b) => b.checked).map((b) => b.value);
      $('splitFiles').textContent = !on.length ? '書き出す書式を1つ以上選んでください。'
        : on.length === 1 ? `書き出すファイル：${fileBase()}_${on[0]}.csl`
        : `書き出すファイル：${fileBase()}_by_language.zip（中に ${on.map((k) => `${fileBase()}_${k}.csl`).join('、')}）`;
      $('btnDoSplit').disabled = !on.length;
    };
    boxes.forEach((b) => b.addEventListener('change', showFiles));
    $('splitList').replaceChildren(...boxes.map((b) => h('label', {}, b, splitLabel(b.value))));
    showFiles();
    $('dlgSplit').showModal();
  }
  function doSplit() {
    const keys = [...document.querySelectorAll('#splitList input:checked')].map((b) => b.value);
    if (!keys.length) return;
    const files = keys.map((k) => ({ name: `${fileBase()}_${k}.csl`, text: G.generate(state.model, { only: k }) }));
    $('dlgSplit').close();
    if (files.length === 1) {
      download(new Blob([files[0].text], { type: CSL_MIME }), files[0].name);
      toast(`${files[0].name} を書き出しました。Zotero の 設定 → 引用 →「＋」から入れてください`);
    } else {
      const name = fileBase() + '_by_language.zip';
      download(makeZip(files), name);
      toast(`${name} を書き出しました。展開してから、使う .csl を入れてください`);
    }
  }

  // 無圧縮（stored）の zip を作る。外部のライブラリを使わずにネットなしで動かすため。
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeZip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const head = (sig, extra) => {
        const b = new DataView(new ArrayBuffer(extra ? 46 : 30));
        let p = 0;
        const u32 = (v) => { b.setUint32(p, v, true); p += 4; }, u16 = (v) => { b.setUint16(p, v, true); p += 2; };
        u32(sig);
        if (extra) u16(20);                  // 作成したバージョン
        u16(20); u16(0x0800); u16(0);        // 必要なバージョン、UTF-8 の名前、無圧縮
        u16(time); u16(date); u32(crc); u32(data.length); u32(data.length); u16(name.length); u16(0);
        if (extra) { u16(0); u16(0); u16(0); u32(0); u32(offset); }
        return new Uint8Array(b.buffer);
      };
      const local = head(0x04034b50, false);
      parts.push(local, name, data);
      central.push(head(0x02014b50, true), name);
      offset += local.length + name.length + data.length;
    }
    const cdSize = central.reduce((n, x) => n + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  function openStarter() {
    const list = $('starterList');
    list.replaceChildren(...Object.entries(ST.STARTERS).map(([k, s]) => h('button', {
      type: 'button',
      onclick: () => {
        state.mode = 'chips';
        state.model = freshModel(k);
        state.ui = { panel: 'ja', target: 'bib', tab: 'book', sel: null, loc: state.ui.loc };
        setTitleField(state.model.info.title);
        $('dlgStarter').close();
        renderPanels();
        changed({ row: false });
      },
    }, h('b', {}, s.name, h('span', { class: 'how', text: s.how })),
      h('span', { class: 'ex' }, h('span', { class: 'ex-k', text: '欧文' }), h('span', { text: s.en })),
      h('span', { class: 'ex' }, h('span', { class: 'ex-k', text: '和文' }), h('span', { text: s.ja })))));
    $('dlgStarter').showModal();
  }

  // 選ぶ画面から .csl を読み込む（ボタンかドロップ）。読み込めたら画面を閉じる。
  function loadCslFromDialog(text, fileName) {
    if (loadCsl(text, fileName)) $('dlgStarter').close();
  }
  function setupCslDrop() {
    const z = $('cslDrop');
    $('btnDlgLoadCsl').addEventListener('click', () => readFile($('fileCsl'), loadCslFromDialog));
    z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', (e) => {
      e.preventDefault();
      z.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => loadCslFromDialog(String(r.result), f.name);
      r.readAsText(f, 'utf-8');
    });
  }

  // ---- 公式のスタイルを手直しする ----------------------------------------------------
  // 元の CSL（state.official.xml）を正本にし、手を入れた箇所は編集の一覧（state.official.edits）で持つ。
  // 右のプレビューで押した箇所を、目印でたどった元の要素として左に出し、そこで直す。仕組みは src/official.js。
  let offBase = null;   // 元の CSL を木にしたもの
  let offView = null;   // いちばん新しい組版の結果（O.build の戻り値）
  let offItems = [];    // そのときの文献
  const ATTR_JA = { prefix: '前の文字', suffix: '後ろの文字', delimiter: '区切り', 'font-style': '斜体', 'font-weight': '太字', quotes: '引用符', 'text-case': '大文字・小文字', value: '文字' };

  function syncModeUi() {
    const off = state.mode === 'official';
    $('btnExport').textContent = off ? '書き出す' : '多言語版を書き出す';
    $('btnExportSplit').hidden = off;
  }

  function sanitizeTitle(t) {
    return [...String(t || '')].map((c) => (TITLE_OK.test(c) ? c : '_')).join('').replace(/_+/g, '_').replace(/^[_\s]+|[_\s]+$/g, '');
  }
  function enterOfficial(text, fileName) {
    let base;
    try { base = O.parse(text); } catch (e) { base = null; }
    if (!base || !/<layout[\s>]/.test(text)) { alert('引用スタイル（CSL）のファイルとして読めませんでした。'); return false; }
    if (base.count >= O.MAXN) { alert(`このスタイルは部品が多すぎて（${base.count}個）、いまのアプリでは扱えません。`); return false; }
    if (/<link[^>]*rel="independent-parent"/.test(text)) {
      alert('このファイルは、別のスタイルを親にした「依存スタイル」で、書き方の中身を持っていません。親のスタイル（ファイルの中の independent-parent のリンク先）をダウンロードして、そちらを読み込んでください。');
      return false;
    }
    const source = O.titleOf(text);
    const title = editedTitle(fileName, { info: { title: sanitizeTitle(source) || 'My_style' } });
    // 前にこのアプリで手直しして書き出したもの（名前が _edited で終わる）は、名前と ID を保つ
    const sameName = sanitizeTitle(O.titleOf(text)) === title;
    const id = sameName ? ((text.match(/<id>([^<]*)<\/id>/) || [])[1] || newStyleId()) : newStyleId();
    offBase = base;
    state.mode = 'official';
    state.official = { xml: text, edits: [], title, id, source };
    state.ui.osel = null;
    setTitleField(title);
    renderPanels();
    renderPreview();
    save();
    toast(`「${source}」を読み込みました。右のプレビューで、直したい箇所を押してください`);
    return true;
  }

  function renderOfficialPreview() {
    const items = visibleItems();
    offItems = items;
    const hiddenItems = currentItems().filter((i) => state.hidden.includes(String(i.id)));
    $('dataSource').textContent = `${state.source}・${items.length}件` + (hiddenItems.length ? `（ほかに隠した文献 ${hiddenItems.length}件）` : '') + '　組み直しています…';
    $('btnResetItems').hidden = state.items === null && !state.hidden.length;
    $('btnAddItem').textContent = usingSamples() ? '見本の書誌を編集する' : '書誌を編集する';
    const errBox = $('previewError');
    clearTimeout(renderOfficialPreview.t);
    renderOfficialPreview.t = setTimeout(() => {
      try {
        offView = O.build(window.CSL, offBase, state.official.edits, items, retrieveLocale, curLoc());
        errBox.hidden = true;
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = '組版でエラーが出ました。直前の変更を元に戻してみてください。\n' + (err && err.message ? err.message : err);
        $('dataSource').textContent = `${state.source}・${items.length}件`;
        return;
      }
      $('dataSource').textContent = `${state.source}・${items.length}件` + (hiddenItems.length ? `（ほかに隠した文献 ${hiddenItems.length}件）` : '');
      drawOfficialCards(items, hiddenItems);
      drawOfficialPanel();
    }, 30);
  }

  const OFF_TYPE_ORDER = ['book', 'chapter', 'article-journal', 'webpage'];
  function drawOfficialCards(items, hiddenItems) {
    const order = items.map((it, k) => ({ it, k, t: OFF_TYPE_ORDER.indexOf(it.type) < 0 ? 9 : OFF_TYPE_ORDER.indexOf(it.type), n: (it.author || []).length || 99 }))
      .sort((a, b) => a.t - b.t || a.n - b.n || a.k - b.k).map((x) => x.it);
    const nodes = order.map((it) => {
      const rows = offView.view[it.id] || [];
      return h('div', { class: 'item off', 'data-id': it.id, 'data-authors': authorCountLabel(it) },
        h('div', { class: 'meta' },
          h('span', { class: 'badge', text: G.cslTypeLabel(it.type || '') }),
          h('span', { class: 'badge', text: it.language ? it.language : '言語なし' }),
          h('span', { class: 'badge', text: authorCountLabel(it) }),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'small-btn', onclick: (e) => { e.stopPropagation(); openItemEditor(it.id); } }, '直す'),
          h('button', { type: 'button', class: 'small-btn', title: 'プレビューに出さないようにします。データは残り、下の「隠した文献」から戻せます', onclick: (e) => { e.stopPropagation(); hideItem(it.id); } }, '隠す')),
        h('div', { class: 'out' }, ...rows.flatMap((r) => [h('span', { class: 'k', text: r.label }),
          h('span', { class: 'v', 'data-row': r.key, html: r.html || '<span class="muted">（出ません）</span>' })])));
    });
    const hiddenBox = hiddenItems.length ? h('details', { class: 'hidden-items' },
      h('summary', { text: `隠した文献 ${hiddenItems.length}件` }),
      h('ul', {}, ...hiddenItems.map((it) => h('li', {},
        h('span', { text: itemSummary(it) }),
        h('button', { type: 'button', class: 'small-btn', onclick: () => unhideItem(it.id) }, '戻す'))))) : null;
    const list = $('previewList');
    list.replaceChildren(...nodes, h('p', { id: 'previewEmpty', class: 'muted small', hidden: true, text: '条件に合う文献がありません。' }), hiddenBox || '');
    list.onclick = (e) => {
      const seg = e.target.closest('.cslseg');
      if (!seg) return;
      const card = seg.closest('.item'), row = seg.closest('[data-row]');
      state.ui.osel = { n: +seg.dataset.n, path: seg.dataset.path.split(',').map(Number), item: card.dataset.id, row: row.dataset.row };
      drawOfficialPanel();
      offHighlight();
      save();
    };
    offHighlight();
    offFilter();
  }

  // 選んだ部品と、その内側から出た文字を光らせる（同じ部品が出ている所はすべて光る＝どこに効くかが見える）
  function offHighlight() {
    const sel = state.ui.osel;
    document.querySelectorAll('#previewList .cslseg').forEach((s) => {
      const on = !!sel && s.dataset.path.split(',').map(Number).includes(sel.n);
      s.classList.toggle('hl', on);
    });
  }
  function offFilter() {
    const who = state.ui.authors || '';
    let shown = 0, total = 0;
    document.querySelectorAll('#previewList .item').forEach((n) => { const on = !who || n.dataset.authors === who; n.hidden = !on; total++; if (on) shown++; });
    const box = $('previewFilter');
    const kinds = ['単著', '2〜3名共著', '4名以上の共著', '著者なし（編者あり）', '著者なし'];
    const present = new Set([...document.querySelectorAll('#previewList .item')].map((n) => n.dataset.authors));
    const sel = h('select', { class: 'small-sel', title: '著者の人数で絞り込む', onchange: (e) => { state.ui.authors = e.target.value; offFilter(); save(); } },
      h('option', { value: '', text: '著者：すべて' }), ...kinds.filter((k) => present.has(k) || k === who).map((k) => h('option', { value: k, text: '著者：' + k })));
    sel.value = who;
    const loc = h('select', { class: 'small-sel', id: 'locSel', title: '引用箇所：Zotero で引用するときに選ぶ種類と値。注や本文中の引用をこれで組む',
      onchange: (e) => { state.ui.loc = e.target.value; renderPreview(); save(); } },
      ...LOCS.map(([k, l]) => h('option', { value: k, text: '引用箇所：' + l })));
    loc.value = LOCS.some(([k]) => k === state.ui.loc) ? state.ui.loc : 'page:42';
    box.replaceChildren(sel, loc, h('span', { class: 'muted', text: `${shown}/${total}件` }));
    const empty = $('previewEmpty');
    if (empty) empty.hidden = shown > 0;
  }

  // ---- 左：選んだ箇所の詳細と、手を入れた箇所の一覧 ---------------------------------------
  const baseEl = (n) => O.index(offBase)[n];
  const curEl = (n) => (offView ? O.index(offView.tree)[n] : null);
  // その部品が出ている所（参考文献・注 × 資料の種類）
  function scopeOf(n) {
    const where = new Map();
    for (const it of offItems) {
      for (const r of (offView.view[it.id] || [])) {
        if (new RegExp(`data-path="(?:[\\d,]*,)?${n}(?:,[\\d,]*)?"`).test(r.html)) {
          const k = r.label;
          if (!where.has(k)) where.set(k, new Set());
          where.get(k).add(G.cslTypeLabel(it.type || ''));
        }
      }
    }
    return [...where].map(([k, ts]) => `${k}（${[...ts].join('・')}）`);
  }
  function setEdit(edit) {
    const ed = state.official.edits;
    if (edit.op === 'attr') {
      const k = ed.findIndex((x) => x.op === 'attr' && x.e === edit.e && x.name === edit.name);
      const orig = O.getAttr(O.indexEid(offBase)[edit.e], edit.name);
      if (k >= 0) ed.splice(k, 1);
      if ((edit.value || '') !== (orig || '')) ed.push(edit);
    } else ed.push(edit);
    renderPreview();
    save();
  }
  function editLabel(x) {
    const el = O.indexEid(offBase)[x.e];
    const what = el && el.ord !== undefined ? O.describe(el) : (el ? 'その部分' : '');
    if (x.op === 'attr') {
      const v = x.value;
      if (x.name === 'font-style') return `${what}：${v === 'italic' ? '斜体にする' : '斜体にしない'}`;
      if (x.name === 'font-weight') return `${what}：${v === 'bold' ? '太字にする' : '太字にしない'}`;
      if (x.name === 'quotes') return `${what}：${v === 'true' ? '引用符で囲む' : '引用符で囲まない'}`;
      return `${what}：${ATTR_JA[x.name] || x.name}を${v ? `「${v}」にする` : '空にする'}`;
    }
    if (x.op === 'delete') return `${what}：出さない`;
    if (x.op === 'swap') return `${what}：並びを入れ替える`;
    return what;
  }

  // 並べ替え：選んだ部品を含むまとまりを内側から外側へ見て、出力の上で隣に部品があるいちばん内側のまとまりの中で、
  // 隣の部品と入れ替える（出版者のすぐ外が「出版者と出版地」のまとまりで、図書では出版者しか出ていない、といった場合は、その外へ）。
  function moveTargets(sel) {
    if (!offView) return null;
    const html = ((offView.view[sel.item] || []).find((r) => r.key === sel.row) || {}).html || '';
    const path = sel.path.slice(0, sel.path.indexOf(sel.n) + 1);
    const paths = [];
    html.replace(/data-path="([\d,]+)"/g, (m, ps) => { paths.push(ps.split(',').map(Number)); return m; });
    for (let gi = path.length - 2; gi >= 0; gi--) {
      const g = curEl(path[gi]);
      if (!g || g.tag !== 'group') continue;
      const unitOf = (p) => { const inner = curEl(p[gi + 1]); return inner ? O.unitIn(g, inner) : null; };
      const mine = unitOf(path);
      if (!mine) continue;
      const head = path.slice(0, gi + 1).join();
      const units = [];
      for (const p of paths) {
        if (p.length <= gi + 1 || p.slice(0, gi + 1).join() !== head) continue;
        const u = unitOf(p);
        if (u && !units.includes(u)) units.push(u);
      }
      const k = units.indexOf(mine);
      if (k < 0 || units.length < 2) continue;
      return { group: g, mine, prev: k > 0 ? units[k - 1] : null, next: k < units.length - 1 ? units[k + 1] : null };
    }
    return null;
  }

  function drawOfficialPanel() {
    const tabs = $('panelTabs');
    tabs.replaceChildren(h('button', { type: 'button', role: 'tab', 'aria-selected': 'true' }, '公式のスタイルの手直し'));
    const body = $('panelBody');
    const off = state.official || {};
    const parts = [h('div', { class: 'off-source' },
      h('div', {}, h('span', { class: 'muted small', text: 'もとにしたスタイル：' }), h('b', { text: off.source || '' })),
      h('p', { class: 'hint', text: '欧文の文献も和文の文献も、このスタイルの書き方で組みます。和文の書式を別に足す機能は準備中です。' }))];
    const sel = state.ui.osel;
    const el = sel && curEl(sel.n);
    if (!sel || !el) {
      parts.push(h('div', { class: 'off-empty' },
        h('p', { text: '右のプレビューで、直したい箇所を押してください。' }),
        h('p', { class: 'hint', text: '押した部品と、同じ部品から出ている所がすべて光ります。ここで、前後の文字や区切り、斜体などを直したり、出さないようにしたり、並びを入れ替えたりできます。' })));
    } else {
      // 外から内への入れ子（いちばん外の「全体」から、選んだ部品まで）
      const path = sel.path.slice(0, sel.path.indexOf(sel.n) + 1);
      // 入れ子のうち、直せることのあるもの（区切りや前後の文字を持つまとまり、出力そのものを出す部品）だけを並べる
      // まとまりは、この行の出力で区切りが実際に現れている（中に部品が2つ以上出ている）か、前後の文字を持つものだけ
      const rowHtml = ((offView.view[sel.item] || []).find((r) => r.key === sel.row) || {}).html || '';
      const rowPaths = [];
      rowHtml.replace(/data-path="([\d,]+)"/g, (m, ps) => { rowPaths.push(ps.split(',').map(Number)); return m; });
      const shownInside = (i) => {
        const head = path.slice(0, i + 1).join();
        return new Set(rowPaths.filter((p) => p.length > i + 1 && p.slice(0, i + 1).join() === head).map((p) => p[i + 1])).size;
      };
      const meaningful = (x, i) => x.ord === sel.n || x.tag === 'layout'
        || (x.tag === 'group' && (O.getAttr(x, 'prefix') || O.getAttr(x, 'suffix') || (O.getAttr(x, 'delimiter') && shownInside(i) >= 2)))
        || (x.tag !== 'group' && !(x.tag === 'text' && O.getAttr(x, 'macro')));
      const crumbs = path.map((n, i) => [curEl(n), i]).filter(([x, i]) => x && meaningful(x, i)).map(([x]) => x);
      parts.push(h('div', { class: 'off-crumbs' }, ...crumbs.flatMap((x, i) => [i ? h('span', { class: 'muted', text: ' › ' }) : '',
        h('button', { type: 'button', class: 'crumb' + (x.ord === sel.n ? ' on' : ''), title: 'この範囲を選ぶ',
          onclick: () => { state.ui.osel = { ...sel, n: x.ord }; drawOfficialPanel(); offHighlight(); save(); } }, O.describe(x))])));
      const scope = scopeOf(sel.n);
      parts.push(h('h3', { text: O.describe(el) }),
        h('p', { class: scope.length > 1 ? 'warn' : 'hint', text: scope.length ? `この部品は、${scope.join('、')} に出ています。` + (scope.length > 1 ? '直すと、そのすべてが変わります。' : '') : 'この部品は、いまの文献では何も出していません。' }));
      const e = baseEl(sel.n) ? baseEl(sel.n).eid : el.eid;
      const grid = h('div', { class: 'form-grid' });
      const txt = (name, label, hint) => {
        const inp = h('input', { type: 'text', value: O.getAttr(el, name) || '', placeholder: hint || '' });
        inp.addEventListener('change', () => setEdit({ e, op: 'attr', name, value: inp.value }));
        grid.append(h('label', { text: label }), inp);
      };
      const chk = (name, label, onVal, offVal) => {
        const c = h('input', { type: 'checkbox' });
        c.checked = O.getAttr(el, name) === onVal;
        c.addEventListener('change', () => setEdit({ e, op: 'attr', name, value: c.checked ? onVal : offVal }));
        grid.append(h('label', { text: label }), h('span', {}, c));
      };
      if (el.tag === 'text' && O.getAttr(el, 'value') !== undefined) txt('value', '文字');
      txt('prefix', '前に付ける文字');
      txt('suffix', '後ろに付ける文字');
      if (['group', 'names', 'date'].includes(el.tag) || (el.tag === 'layout')) txt('delimiter', '区切り', el.tag === 'layout' ? '同じ所で複数の文献を引くときの区切り' : '');
      if (el.tag !== 'layout') {
        chk('font-style', '斜体', 'italic', 'normal');
        chk('font-weight', '太字', 'bold', 'normal');
      }
      if (el.tag === 'text' && O.getAttr(el, 'variable')) chk('quotes', '引用符（“ ”）で囲む', 'true', 'false');
      if (['text', 'label', 'names'].includes(el.tag) || el.tag === 'date') {
        const s = h('select', {}, ...[['', 'そのまま'], ['capitalize-first', '先頭だけ大文字'], ['title', '各語の頭を大文字'], ['lowercase', 'すべて小文字'], ['uppercase', 'すべて大文字']].map(([v, l]) => h('option', { value: v, text: l })));
        s.value = O.getAttr(el, 'text-case') || '';
        s.addEventListener('change', () => setEdit({ e, op: 'attr', name: 'text-case', value: s.value }));
        grid.append(h('label', { text: '大文字・小文字' }), s);
      }
      parts.push(grid);
      const mv = moveTargets(sel);
      const acts = h('div', { class: 'off-actions' });
      if (mv && (mv.prev || mv.next)) {
        acts.append(
          h('button', { type: 'button', disabled: !mv.prev, onclick: () => setEdit({ e: mv.mine.eid, op: 'swap', with: mv.prev.eid }) }, '← 前の部品と入れ替える'),
          h('button', { type: 'button', disabled: !mv.next, onclick: () => setEdit({ e: mv.mine.eid, op: 'swap', with: mv.next.eid }) }, '後ろの部品と入れ替える →'));
      }
      if (el.tag !== 'layout') acts.append(h('button', { type: 'button', class: 'danger', onclick: () => { setEdit({ e, op: 'delete' }); state.ui.osel = null; } }, 'この部品を出さない'));
      parts.push(acts);
      const mc = O.macroOf(baseEl(sel.n) || el);
      parts.push(h('p', { class: 'muted small', text: `元の CSL：<${el.tag}>` + (mc ? `（マクロ ${mc} の中）` : '') }));
    }
    // 手を入れた箇所
    const ed = off.edits || [];
    parts.push(h('h3', { text: `手を入れた箇所（${ed.length}件）` }));
    if (!ed.length) parts.push(h('p', { class: 'hint', text: 'まだありません。' }));
    else {
      parts.push(h('ul', { class: 'off-edits' }, ...ed.map((x, i) => h('li', {}, h('span', { text: editLabel(x) }),
        h('button', { type: 'button', class: 'small-btn', onclick: () => { ed.splice(i, 1); renderPreview(); save(); } }, '元に戻す')))),
        h('button', { type: 'button', class: 'small-btn', onclick: () => { if (confirm('手を入れた箇所をすべて元に戻します。よろしいですか。')) { ed.splice(0); renderPreview(); save(); } } }, 'すべて元に戻す'));
    }
    body.replaceChildren(...parts);
  }

  function exportOfficial() {
    const off = state.official;
    const xml = O.finalize(O.serialize(O.apply(offBase, off.edits)), { title: off.title.trim(), id: off.id, updated: new Date().toISOString().replace(/\.\d+Z$/, '+00:00') });
    const name = fileBase() + '.csl';
    download(new Blob([xml], { type: CSL_MIME }), name);
    toast(`${name} を書き出しました。Zotero の 設定 → 引用 →「＋」から入れてください`);
  }

  // ---- 起動 ------------------------------------------------------------------
  function init() {
    const restored = load();
    if (!restored) state.model = freshModel('chicago');
    setTitleField(curInfo().title);
    $('styleTitle').addEventListener('input', (e) => { curInfo().title = e.target.value; showTitleState(); save(); });
    $('btnStarter').addEventListener('click', openStarter);
    $('btnBrand').addEventListener('click', openStarter);
    $('btnPickItems').addEventListener('click', () => { $('dlgItemList').close(); readFile($('fileItems'), loadItems); });
    $('btnExport').addEventListener('click', exportCsl);
    $('btnExportSplit').addEventListener('click', openSplit);
    $('btnDoSplit').addEventListener('click', doSplit);
    $('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
    $('btnAddItem').addEventListener('click', openItemList);
    $('btnNewItem').addEventListener('click', () => { $('dlgItemList').close(); openItemEditor(null); });
    // 入力欄で Enter を押しても、入れかけの文献が閉じて消えないようにする。
    $('itemForm').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
    $('btnResetItems').addEventListener('click', () => {
      if (!confirm('直した文献・入れた文献・隠した文献をすべて元に戻して、見本データにします。よろしいですか。')) return;
      state.items = null;
      state.hidden = [];
      state.source = '見本データ';
      changed({ row: false });
      renderPanels();
    });
    setupCslDrop();
    renderPanels();
    renderPreview();
    if (!restored) openStarter();
  }
  window.CSLApp = { state, renderPreview, editedTitle, get offView() { return offView; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
