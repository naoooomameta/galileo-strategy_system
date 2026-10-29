
  /* ============================================================
   * 参考書フォルダ（Google Drive「プラトン・ガリレオ共通（参考書）毎日課題」）のカタログ
   *  サイト直下の books.json（tools/crawl_books.py が週1回自動更新）を読み込み、
   *  「課題を追加」「教材を追加」の画面でフォルダ内の本を選べるようにする。
   *  カタログは全生徒共通の読み取り専用データで、生徒ごとの計画（plan）やクラウド同期とは別。
   *  本を選んで課題を保存すると、その生徒の教材一覧に（まだ無ければ）教材として追加され、
   *  教材には driveId / link（Driveのファイル）が付く。
   * ============================================================ */
  var CATALOG_URL = 'books.json';
  var LS_CATALOG = 'galileo_grbooks';
  S.catalog = null;          // { updatedAt, source:{name,url}, count, books:[{id,name,subject,path,url}] }
  S.catalogState = 'idle';   // idle | loading | ok | error

  function catalogBooks() { return (S.catalog && Array.isArray(S.catalog.books)) ? S.catalog.books : []; }
  function catalogById(id) { return catalogBooks().filter(function (b) { return b.id === id; })[0] || null; }
  function normBook(s) { return String(s || '').replace(/[\s　_・･]+/g, '').toLowerCase(); }
  // 科目をまたぐフォルダ（科目で絞り込んでも常に出す）
  var CATALOG_CROSS = ['志望校対策', 'その他'];
  function topFolder(b) { return String(b.path || '').split('／')[0]; }
  // 科目が決まっていれば、その科目の本＋科目をまたぐフォルダの本
  function catalogBooksFor(subject) {
    var all = catalogBooks();
    return subject ? all.filter(function (b) { return b.subject === subject || (!b.subject && CATALOG_CROSS.indexOf(topFolder(b)) >= 0); }) : all;
  }
  // グループ（フォルダ）の並び：科目の順（英語・数学・物理…）→ 科目の決まっていないフォルダ → 科目をまたぐフォルダは最後
  function groupRank(books) {
    var b = books[0] || {}, i = SUBJECT_ORDER.indexOf(b.subject);
    return CATALOG_CROSS.indexOf(topFolder(b)) >= 0 ? 99 : (b.subject ? (i < 0 ? 50 : i) : 80);
  }
  // この生徒の教材一覧に同じ本があればその教材
  function planMaterialForBook(b) {
    if (!S.plan || !b) return null;
    return S.plan.materials.filter(function (m) { return (m.driveId && m.driveId === b.id) || (m.name && b.name && normBook(m.name) === normBook(b.name)); })[0] || null;
  }
  function catalogBookByName(name) {
    var k = normBook(name); if (!k) return null;
    return catalogBooks().filter(function (b) { return normBook(b.name) === k; })[0] || null;
  }
  // <optgroup>（フォルダごと）の HTML。opts.includeRegistered が偽なら、すでに教材一覧にある本は除く
  function catalogOptionsHtml(subject, selectedId, opts) {
    opts = opts || {};
    var groups = [], map = {};
    catalogBooksFor(subject).forEach(function (b) {
      if (!opts.includeRegistered && planMaterialForBook(b)) return;
      var g = b.path || '（未分類）';
      if (!map[g]) { map[g] = []; groups.push(g); }
      map[g].push(b);
    });
    groups.sort(function (a, b) { var ra = groupRank(map[a]), rb = groupRank(map[b]); return ra - rb || (a < b ? -1 : a > b ? 1 : 0); });
    return groups.map(function (g) {
      return '<optgroup label="' + esc('参考書フォルダ：' + g) + '">' + map[g].map(function (b) {
        return '<option value="cat:' + esc(b.id) + '"' + (b.id === selectedId ? ' selected' : '') + '>' + esc(b.name) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }
  // 参考書フォルダの本を、この生徒の教材一覧に（まだ無ければ）追加して教材を返す
  function ensureMaterialFromBook(bookId, subject) {
    var b = catalogById(bookId); if (!b || !S.plan) return null;
    var ex = planMaterialForBook(b);
    if (ex) { if (!ex.driveId) { ex.driveId = b.id; ex.link = b.url; } return ex; }
    var subj = subject || b.subject || '';
    var m = { id: uid('m'), subject: subj, name: b.name, purpose: '', range: '', unitLabel: '問題', count: null, startNo: null, rounds: 1, pattern: 'straight', days: [1, 2, 3, 4, 5], minPerItem: 15,
      start: '', end: '', criteria: '', passPct: 80, evalMethod: '', priority: '中', prereq: '', teacher: '', status: '進行中', driveId: b.id, link: b.url, fromCatalog: true };
    S.plan.materials.push(m);
    if (subj && S.plan.subjects.indexOf(subj) < 0) S.plan.subjects = sortSubjects(S.plan.subjects.concat([subj]));
    return m;
  }
  // 教材に付いた Drive ファイルへのリンク（📄）
  function bookLink(m) {
    return (m && m.link) ? ' <a class="gr-booklink" href="' + esc(m.link) + '" target="_blank" rel="noopener" title="参考書フォルダのファイルを開く（' + esc(m.name || '') + '）">📄</a>' : '';
  }
  // 教材名の入力候補（datalist）と、開いている画面の「参考書フォルダから選ぶ」欄を更新
  function refreshBookList() {
    var dl = document.getElementById('gr-books');
    if (dl) {
      var names = BOOK_SUGGEST.slice();
      try { if (typeof ALL_TEXTBOOKS !== 'undefined' && Array.isArray(ALL_TEXTBOOKS)) ALL_TEXTBOOKS.forEach(function (b) { if (b && b.name && names.indexOf(b.name) < 0) names.push(b.name); }); } catch (e) { }
      catalogBooks().forEach(function (b) { if (b.name && names.indexOf(b.name) < 0) names.push(b.name); });
      dl.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    }
    var ms = document.getElementById('gr-m-catalog');
    if (ms) { var msub = gv('gr-m-subject'); ms.innerHTML = catalogSelectHtml(msub === '__custom' ? '' : msub, ms.value && ms.value.indexOf('cat:') === 0 ? ms.value.slice(4) : ''); }
    var ts = document.getElementById('gr-t-material');
    if (ts && S.modal && S.modal.type === 'task') { var cur = ts.value; ts.innerHTML = materialOptions(gv('gr-t-subject'), cur, true); if (cur) ts.value = cur; }
  }
  function catalogSelectHtml(subject, selectedId) {
    return '<option value="">（フォルダの本を選ぶと教材名に入ります）</option>' + catalogOptionsHtml(subject, selectedId, { includeRegistered: true });
  }
  function catalogNote() {
    var c = S.catalog;
    if (!c) return S.catalogState === 'error' ? '参考書フォルダの一覧を読み込めませんでした' : '';
    return '参考書フォルダ' + (c.count ? '（' + c.count + '冊' + (c.updatedAt ? '・' + c.updatedAt.slice(0, 10).replace(/-/g, '/') + '更新' : '') + '）' : '');
  }
  // books.json を読み込む（端末に前回の一覧があれば先にそれを使う）
  function loadCatalog() {
    if (!S.catalog) { try { var c = JSON.parse(localStorage.getItem(LS_CATALOG) || 'null'); if (c && Array.isArray(c.books)) { S.catalog = c; refreshBookList(); } } catch (e) { } }
    if (S.catalogState === 'loading' || typeof fetch !== 'function') return Promise.resolve();
    S.catalogState = 'loading';
    return fetch(CATALOG_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
      if (!j || !Array.isArray(j.books)) throw new Error('形式が違います');
      var changed = !S.catalog || S.catalog.updatedAt !== j.updatedAt || catalogBooks().length !== j.books.length;
      S.catalog = j; S.catalogState = 'ok';
      try { localStorage.setItem(LS_CATALOG, JSON.stringify(j)); } catch (e) { }
      if (changed) refreshBookList();
    }).catch(function (e) { S.catalogState = 'error'; console.warn('[GR] 参考書フォルダの一覧（books.json）を読み込めませんでした:', e && e.message || e); });
  }
