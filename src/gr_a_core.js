/* ============================================================
 * 個別合格ロードマップ（GR）モジュール — 戦略管理システム v1.2.1
 * 「GALILEO｜個別合格ロードマップ システム開発構想書」のMVPを実装。
 *   ・「合格ロードマップ」タブ：合格戦略／教材・年間計画／月間ロードマップ／到達度
 *   ・「週間・毎日課題」タブ：週間学習計画／毎日の課題・採点／復習キュー
 * 生徒ごとに1つの計画データ（plan）を持ち、すべての画面を同じデータから描画する。
 * 保存先：この端末（localStorage）＋ Supabase の roadmap_plans テーブル（作成後に自動で有効）。
 * 同時編集：クラウドへは「読み込んだ版のままなら書き込む」条件付きで保存し、他の画面で先に保存されていた
 *           場合は、項目（課題・教材・復習などのID）単位で双方の変更をまとめてから保存する（v1.2.1）。
 * グローバルに公開するのは window.GR のみ（既存コードとの名前衝突を避けるため）。
 * ============================================================ */
(function () {
  'use strict';

  var PLAN_VERSION = 1;
  var LS_PREFIX = 'galileo_grplan_';
  var LS_META = 'galileo_grplan__meta';
  var LS_UI = 'galileo_grui';
  var TABLE = 'roadmap_plans';

  var SUBJECT_ORDER = ['英語', '数学', '物理', '化学', '生物', '地学', '国語', '情報', '日本史', '世界史', '地理', '公共', '倫理', '政治・経済'];
  var SUBJECT_COLORS = { '英語': '#2a7f6f', '数学': '#c84b31', '物理': '#3d6fa8', '化学': '#a8843c', '生物': '#5a8f3d', '地学': '#7a5aa8', '国語': '#9a7a20', '情報': '#4a6a7a' };
  var FALLBACK_COLORS = ['#5f7f8f', '#8f5f7f', '#7f8f5f', '#5f5f8f', '#8f7f5f'];
  var STAGE_COLORS = ['#e3efe9', '#d3e9df', '#c6e3d6', '#f6ead0', '#e4e6f4', '#f4dde3', '#eae4d6'];
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];
  var TASK_KINDS = { study: '学習', redo: '解き直し', check: '確認テスト', review: '復習', other: 'その他' };
  var TASK_STATUS = { todo: '未着手', submitted: '提出済', missing: '未提出', graded: '採点済', resubmit: '再提出' };
  var CAUSES = ['知識不足', '解法の選択', '計算ミス', '時間不足', '演習量不足', 'その他'];
  var MAT_STATUS = ['未着手', '進行中', '完了'];
  var PRIORITIES = ['高', '中', '低'];
  var EVENT_KINDS = ['模試', '節目', '面談', 'その他'];
  var LV_LABEL = { 1: 'Lv.1 要復習', 2: 'Lv.2 部分理解', 3: 'Lv.3 概ね理解', 4: 'Lv.4 到達' };
  var BOOK_SUGGEST = [
    '入門問題精講 数学I・A', '入門問題精講 数学II・B', '入門問題精講 数学III', '基礎問題精講 数学I・A', '基礎問題精講 数学II・B', '基礎問題精講 数学III・C',
    '標準問題精講 数学I・A・II・B', '青チャート', '黄チャート', 'Focus Gold', '1対1対応の演習', 'やさしい理系数学', '新数学スタンダード演習',
    '物理のエッセンス 力学・波動', '物理のエッセンス 熱・電磁気・原子', '良問の風 物理', '名問の森 物理', '物理重要問題集', 'セミナー物理', 'リードα 物理',
    '化学の新研究', '化学の新演習', '化学重要問題集', 'セミナー化学', 'リードα 化学', '鎌田の理論化学の講義', '福間の無機化学の講義', '鎌田の有機化学の講義',
    '大森徹の最強講義117講 生物', '生物 基礎問題精講', '生物 標準問題精講', '生物重要問題集', 'セミナー生物',
    'システム英単語', 'ターゲット1900', '鉄緑会東大英単語熟語 鉄壁', '英文法ポラリス1', 'Next Stage', 'Vintage', '入門英文解釈の技術70', '基礎英文解釈の技術100',
    'ポレポレ英文読解プロセス50', 'やっておきたい英語長文300', 'やっておきたい英語長文500', 'やっておきたい英語長文700',
    '共通テスト過去問研究（赤本）', '大学別過去問（赤本）'
  ];

  /* ---------- 小さなユーティリティ ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(p) { return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function parseD(s) { if (!s) return null; var p = String(s).split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function today() { return ymd(new Date()); }
  function thisMonth() { return ym(new Date()); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); }
  function dowOf(s) { return parseD(s).getDay(); }
  function mondayOf(s) { var d = parseD(s); var w = d.getDay(); d.setDate(d.getDate() - (w === 0 ? 6 : w - 1)); return ymd(d); }
  function addMonths(k, n) { var p = String(k).split('-'); return ym(new Date(+p[0], +p[1] - 1 + n, 1)); }
  function monthsRange(a, b) { var out = []; if (!a || !b || a > b) return out; var k = a, guard = 0; while (k <= b && guard++ < 72) { out.push(k); k = addMonths(k, 1); } return out; }
  function monthLabel(k) { if (!k) return ''; var p = String(k).split('-'); return p[0] + '年' + (+p[1]) + '月'; }
  function monthShort(k) { if (!k) return ''; return (+String(k).split('-')[1]) + '月'; }
  function mdLabel(s) { var d = parseD(s); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function mdw(s) { return mdLabel(s) + '（' + DOW[dowOf(s)] + '）'; }
  function jpDate(s) { var d = parseD(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + DOW[d.getDay()] + '）'; }
  function lastDayOfMonth(k) { var p = String(k).split('-'); return ymd(new Date(+p[0], +p[1], 0)); }
  function daysInMonth(k) { return +lastDayOfMonth(k).split('-')[2]; }
  function weekOfMonthLabel(mon) { var d = parseD(mon); return (d.getMonth() + 1) + '月第' + (Math.floor((d.getDate() - 1) / 7) + 1) + '週'; }
  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round5(n) { return Math.max(5, Math.round(n / 5) * 5); }
  function nowIso() { return new Date().toISOString(); }
  function toast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (e) { console.log('[GR]', msg); } }
  function userEmail() {
    try { var p = JSON.parse(localStorage.getItem('galileo-auth') || 'null'); var u = p && (p.user || (p.session && p.session.user)); return (u && u.email) || ''; } catch (e) { return ''; }
  }
  function getPath(o, path) { var ks = String(path).split('.'); for (var i = 0; i < ks.length; i++) { if (o == null) return undefined; o = o[ks[i]]; } return o; }
  function setPath(o, path, val) {
    var ks = String(path).split('.');
    for (var i = 0; i < ks.length - 1; i++) { var k = ks[i]; if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
    o[ks[ks.length - 1]] = val;
  }
  function uniq(arr) { var out = []; arr.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); return out; }

  /* ---------- 科目 ---------- */
  function normSubject(s) {
    if (!s) return '';
    s = String(s).trim();
    if (/^数学|^数[ⅠⅡⅢIＩ1-3]/.test(s)) return '数学';
    if (/^英|リーディング|リスニング/.test(s)) return '英語';
    if (/^(現代文|古文|漢文|国語)/.test(s)) return '国語';
    if (/物理/.test(s)) return '物理';
    if (/化学/.test(s)) return '化学';
    if (/生物/.test(s)) return '生物';
    if (/地学/.test(s)) return '地学';
    if (/情報/.test(s)) return '情報';
    return s;
  }
  function sortSubjects(list) {
    return uniq(list.filter(Boolean)).sort(function (a, b) {
      var ia = SUBJECT_ORDER.indexOf(a), ib = SUBJECT_ORDER.indexOf(b);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib || (a < b ? -1 : a > b ? 1 : 0);
    });
  }
  function subjectColor(s) {
    if (SUBJECT_COLORS[s]) return SUBJECT_COLORS[s];
    var h = 0; String(s || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
  }

  /* ---------- 状態 ---------- */
  var S = {
    sid: null, student: null, plan: null,
    page: 'groad',
    tab: { groad: 'strategy', gweek: 'weekly' },
    week: null, day: null, month: null, sumMonth: null,
    gradeTaskId: null, reviewFilter: 'open', matFilter: '',
    cloud: 'local', cloudMsg: '', cloudNote: '', cloudNoteAt: 0,
    saveTimer: null, cloudTimer: null, retryTimer: null, pendingCloud: false, loadSeq: 0,
    // baseJson/baseAt：この画面の計画のもとになっている「クラウド上の版」（同時編集のマージに使う）
    baseJson: null, baseAt: null, busy: false, pushQueued: false, conflicts: 0, lastCheck: 0, lastSent: null,
    renderPending: false, keepForm: false, pointerAt: 0, autoCreate: false, syncFrom: null,
    lsFailed: false
  };
  try { var _ui = JSON.parse(localStorage.getItem(LS_UI) || 'null'); if (_ui && _ui.tab) { S.tab.groad = _ui.tab.groad || S.tab.groad; S.tab.gweek = _ui.tab.gweek || S.tab.gweek; } } catch (e) { }
  function saveUi() { try { localStorage.setItem(LS_UI, JSON.stringify({ tab: S.tab })); } catch (e) { } }

  function getCurrentStudent() { try { return (typeof currentStudent !== 'undefined') ? currentStudent : null; } catch (e) { return null; } }
  function getAllStudents() { try { return (typeof _allStudents !== 'undefined' && Array.isArray(_allStudents)) ? _allStudents : []; } catch (e) { return []; } }
  function studentKey(s) { return s ? (s._id ? String(s._id) : 'name:' + s.name) : null; }
  function cloudEnabled() {
    try { return typeof _GALILEO_DEV_MODE !== 'undefined' && !_GALILEO_DEV_MODE && typeof SUPABASE_URL === 'string' && typeof SUPABASE_ANON_KEY === 'string'; } catch (e) { return false; }
  }
  function cloudFor(st) { return cloudEnabled() && st && st._id; }

  /* ---------- 端末保存（localStorage） ----------
   * クラウド未設定のときは端末のデータが唯一のコピーになるため、
   * 容量不足でも「クラウドに同期済みの計画」以外は消さない。 */
  function metaGet() { try { return JSON.parse(localStorage.getItem(LS_META) || '{}') || {}; } catch (e) { return {}; } }
  function metaSet(m) { try { localStorage.setItem(LS_META, JSON.stringify(m)); } catch (e) { } }
  function lsGet(key) { try { var raw = localStorage.getItem(LS_PREFIX + key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function lsRemove(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch (e) { } var m = metaGet(); delete m[key]; metaSet(m); }
  function lsEvictOne(exceptKey) {
    var m = metaGet(), cands = Object.keys(m).filter(function (k) { return k !== exceptKey && m[k].s && m[k].s >= (m[k].u || ''); });
    if (!cands.length) return false;
    cands.sort(function (a, b) { return (m[a].t || 0) - (m[b].t || 0); });
    lsRemove(cands[0]);
    return true;
  }
  function lsSet(key, plan) {
    var data = JSON.stringify(plan);
    for (var i = 0; i < 6; i++) {
      try {
        localStorage.setItem(LS_PREFIX + key, data);
        var m = metaGet(); m[key] = { t: Date.now(), u: plan.updatedAt || '', s: (m[key] && m[key].s) || '' }; metaSet(m);
        S.lsFailed = false;
        return true;
      } catch (e) { if (!lsEvictOne(key)) break; }
    }
    S.lsFailed = true;
    return false;
  }
  function markSynced(key, updatedAt) { var m = metaGet(); if (m[key]) { m[key].s = updatedAt; metaSet(m); } }

  /* ---------- クラウド保存（Supabase REST） ---------- */
  function sbHeaders(extra) {
    var token = null;
    try { token = (typeof _getAccessToken === 'function') ? _getAccessToken() : null; } catch (e) { }
    var h = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY), 'Content-Type': 'application/json' };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function isMissingTable(status, text) {
    return (status === 404 || status === 400) && /roadmap_plans/.test(text || '') && /(schema cache|does not exist|PGRST205|42P01)/i.test(text || '');
  }
  function fetchT(url, opts, ms) {
    var ctl = new AbortController(); var t = setTimeout(function () { ctl.abort(); }, ms || 15000);
    opts = opts || {}; opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  function sameTime(a, b) { if (!a || !b) return false; var x = Date.parse(a), y = Date.parse(b); return isFinite(x) && x === y; }
  // metaOnly：更新日時だけを取る（他の画面で保存されたかの確認用。軽い）
  function cloudGet(key, metaOnly) {
    var url = SUPABASE_URL + '/rest/v1/' + TABLE + '?student_id=eq.' + encodeURIComponent(key) + '&select=' + (metaOnly ? 'updated_at' : 'plan,updated_at');
    return fetchT(url, { headers: sbHeaders() }).then(function (res) {
      if (res.ok) return res.json().then(function (arr) { return { row: (arr && arr[0]) || null }; });
      return res.text().then(function (txt) {
        if (isMissingTable(res.status, txt)) return { missing: true };
        throw new Error('HTTP ' + res.status);
      });
    });
  }
  // 条件付きの書き込み。クラウドの版が baseAt（この画面が読み込んだ版）のままのときだけ上書きする。
  // まだ行が無いとき（baseAt なし）は新規作成だけを行う（既にあれば何もしない）。書けなかったら conflict を返す。
  function cloudWrite(key, json, at, baseAt, keepalive) {
    var url, body, prefer;
    if (baseAt) {
      url = SUPABASE_URL + '/rest/v1/' + TABLE + '?student_id=eq.' + encodeURIComponent(key) + '&updated_at=eq.' + encodeURIComponent(baseAt) + '&select=updated_at';
      body = '{"plan":' + json + ',"updated_at":' + JSON.stringify(at) + '}';
      prefer = 'return=representation';
    } else {
      url = SUPABASE_URL + '/rest/v1/' + TABLE + '?on_conflict=student_id&select=updated_at';
      body = '{"student_id":' + JSON.stringify(key) + ',"plan":' + json + ',"updated_at":' + JSON.stringify(at) + '}';
      prefer = 'resolution=ignore-duplicates,return=representation';
    }
    var opts = { method: baseAt ? 'PATCH' : 'POST', headers: sbHeaders({ 'Prefer': prefer }), body: body };
    if (keepalive && body.length < 60000) opts.keepalive = true;
    return fetchT(url, opts, 20000).then(function (res) {
      if (res.ok) return res.text().then(function (txt) {
        var arr = null; try { arr = txt ? JSON.parse(txt) : []; } catch (e) { arr = null; }
        return (Array.isArray(arr) && arr.length) ? { ok: true } : { conflict: true };
      });
      return res.text().then(function (txt) {
        if (isMissingTable(res.status, txt)) return { missing: true };
        if (res.status === 409) return { conflict: true };
        throw new Error('HTTP ' + res.status + (txt ? '：' + txt.slice(0, 120) : ''));
      });
    });
  }

  /* ---------- 読み込み・保存 ----------
   * ・端末（localStorage）へは変更のたびに保存し、クラウドへは少し待ってまとめて保存する。
   * ・クラウドへの保存は条件付き。他の画面で先に保存されていたら、その版を取り寄せて
   *   「この画面の変更」と「他の画面の変更」を項目単位でまとめてから保存し直す（mergePlans）。
   * ・画面を開いた時・タブに戻った時・30秒ごとに、他の画面の保存を確認して取り込む。
   * ・入力欄に文字を打っている間・クリックの途中は画面を描き直さない（データは取り込み、表示は入力欄から離れた時に更新）。 */
  function isTyping() {
    var ae = document.activeElement;
    return !!(ae && ae.closest && ae.closest('.gr-root') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)
      && ae.type !== 'checkbox' && ae.type !== 'radio' && !(ae.classList && ae.classList.contains('gr-student-sel')));
  }
  function setCloudNote(msg) { S.cloudNote = msg; S.cloudNoteAt = Date.now(); setTimeout(renderStatus, 15500); }
  function pointerBusy() { return S.pointerAt && Date.now() - S.pointerAt < 3000; }
  // 他の画面の変更を取り込んだ後の再描画（入力中・クリック中は待つ。採点欄の書きかけは残す）
  function refreshView() {
    if (isTyping() || pointerBusy()) { S.renderPending = true; return; }
    S.renderPending = false; S.keepForm = true;
    try { rerender(); } finally { S.keepForm = false; }
  }
  function ensureLoaded() {
    var st = getCurrentStudent();
    var key = studentKey(st);
    if (key && key === S.sid) { S.student = st; return; }
    if (S.sid && S.plan) flush();
    S.sid = key; S.student = st; S.plan = null; S.gradeTaskId = null; S.pendingCloud = false;
    S.baseJson = null; S.baseAt = null; S.conflicts = 0; S.renderPending = false; S.pushQueued = false; S.cloudNote = ''; S.busy = false;
    clearTimeout(S.cloudTimer); clearTimeout(S.retryTimer);
    if (!st) { S.cloud = 'local'; return; }
    var local = lsGet(key);
    if (!local && st._id) {
      // 生徒がDBに登録される前（名前キー）で作った計画を引き継ぐ
      var byName = lsGet('name:' + st.name);
      if (byName) { local = byName; lsSet(key, byName); lsRemove('name:' + st.name); }
    }
    S.plan = local ? migrate(local) : null;
    if (!cloudFor(st)) { S.cloud = 'local'; return; }
    var meta = metaGet()[key] || {};
    // unsynced：端末の計画に、まだクラウドへ保存できていない変更がある
    var unsynced = !!(S.plan && !(S.plan.updatedAt && sameTime(meta.s, S.plan.updatedAt)));
    var loadedJson = S.plan ? JSON.stringify(S.plan) : null;
    if (S.plan && !unsynced) { S.baseJson = loadedJson; S.baseAt = meta.s; }
    else if (S.plan && meta.s) S.baseAt = meta.s;
    S.cloud = 'syncing';
    var seq = ++S.loadSeq, tok = {};
    S.busy = tok; S.lastCheck = Date.now();
    cloudGet(key).then(function (r) {
      if (seq !== S.loadSeq || S.sid !== key) return;
      if (r.missing) { S.cloud = 'missing'; return; }
      var row = r.row;
      if (!row || !row.plan) {
        // クラウドにまだ無い → 端末の計画があればアップロードする
        S.baseJson = null; S.baseAt = null;
        if (S.plan) S.pendingCloud = true; else S.cloud = 'ok';
        return;
      }
      var remote = migrate(row.plan), rj = JSON.stringify(remote);
      if (!S.plan || (S.plan.createdAt && remote.createdAt && S.plan.createdAt !== remote.createdAt)) { adoptRemote(remote, rj, row.updated_at, ''); return; }
      if (!unsynced && !S.pendingCloud) { adoptRemote(remote, rj, row.updated_at, ''); return; }
      // 端末に未保存の変更がある → クラウドの版とまとめる
      var base = !unsynced ? JSON.parse(loadedJson) : (sameTime(row.updated_at, meta.s) ? remote : null);
      applyMerge(base, remote, rj, row.updated_at);
    }).catch(function (e) {
      if (seq !== S.loadSeq) return;
      S.cloud = 'error'; S.cloudMsg = e.message || String(e);
      if (S.plan && unsynced) S.pendingCloud = true;
      clearTimeout(S.retryTimer); S.retryTimer = setTimeout(function () { if (S.cloud === 'error' && S.sid === key) { saveLocalNow(); S.sid = null; ensureLoaded(); refreshView(); } }, 30000);
    }).then(function () {
      if (S.busy === tok) S.busy = false;
      if (seq !== S.loadSeq) return;
      if (S.autoCreate) { try { finishAutoCreate(); } catch (e) { console.warn('[GR] 自動作成エラー:', e); } }
      afterBusy(); renderStatus();
    });
  }
  // クラウドの版をそのまま使う
  function adoptRemote(remote, rj, at, note) {
    var changed = !S.plan || !contentEq(S.plan, remote);
    S.plan = remote; S.baseJson = rj; S.baseAt = at; S.pendingCloud = false;
    lsSet(S.sid, remote); markSynced(S.sid, remote.updatedAt || '');
    S.cloud = 'ok'; S.cloudMsg = '';
    if (changed) { if (note) setCloudNote(note); refreshView(); }
  }
  // この画面の計画（S.plan）とクラウドの版をまとめる。base は両者の共通の元の版（不明なら null）
  function applyMerge(base, remote, rj, at) {
    var before = planSig(S.plan);
    var merged = mergePlans(base, S.plan, remote);
    S.plan = merged; normalizePlan(merged);
    S.baseJson = rj; S.baseAt = at;
    var after = planSig(merged);
    if (after === planSig(remote)) {
      // この画面の変更はすでにクラウドの版に含まれていた
      S.plan = remote; S.pendingCloud = false; lsSet(S.sid, remote); markSynced(S.sid, remote.updatedAt || ''); S.cloud = 'ok';
    } else {
      merged.updatedAt = nowIso(); merged.updatedBy = userEmail();
      S.pendingCloud = true; S.pushQueued = true; saveLocalNow();
    }
    if (after !== before) { setCloudNote('他の画面の変更を取り込みました'); refreshView(); }
  }

  // データを変更したら必ず呼ぶ：端末へは即時、クラウドへは少し待ってまとめて保存
  function touch() {
    if (!S.plan) return;
    S.plan.updatedAt = nowIso();
    S.plan.updatedBy = userEmail();
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(saveLocalNow, 250);
    if (cloudFor(S.student) && S.cloud !== 'missing') {
      S.pendingCloud = true; if (S.cloud !== 'error') S.cloud = 'syncing';
      clearTimeout(S.cloudTimer); S.cloudTimer = setTimeout(pushCloud, 1500);
    }
    renderStatus();
  }
  function saveLocalNow() {
    clearTimeout(S.saveTimer);
    if (S.plan && S.sid) {
      var ok = lsSet(S.sid, S.plan);
      if (!ok && !cloudFor(S.student)) toast('端末の保存容量が不足しています。クラウド保存を設定してください');
    }
  }
  function afterBusy() {
    var quick = S.pushQueued; S.pushQueued = false;
    if (!S.pendingCloud || S.cloud === 'missing' || S.cloud === 'error') return;
    clearTimeout(S.cloudTimer); S.cloudTimer = setTimeout(pushCloud, quick ? 250 : 1500);
  }
  function pushCloud(opt) {
    clearTimeout(S.cloudTimer);
    if (!S.pendingCloud || !S.plan || !S.sid || !cloudFor(S.student) || S.cloud === 'missing') return Promise.resolve();
    if (S.busy) { S.pushQueued = true; return Promise.resolve(); }
    var key = S.sid, tok = {}, plan = S.plan;
    if (!plan.updatedAt) plan.updatedAt = nowIso();
    var json = JSON.stringify(plan), at = plan.updatedAt, baseAt = S.baseAt;
    S.pendingCloud = false; S.busy = tok; S.cloud = 'syncing'; renderStatus();
    S.lastSent = { key: key, at: at, json: json };
    return cloudWrite(key, json, at, baseAt, opt && opt.keepalive).then(function (r) {
      if (r.ok) { onPushed(key, json, at); return; }
      if (S.sid !== key) return;
      S.pendingCloud = true;
      if (r.missing) { S.cloud = 'missing'; return; }
      return resolveConflict(key);
    }).catch(function (e) {
      if (S.sid !== key) return;
      S.cloud = 'error'; S.cloudMsg = e.message || String(e); S.pendingCloud = true;
      clearTimeout(S.retryTimer); S.retryTimer = setTimeout(function () { if (S.cloud === 'error') S.cloud = 'syncing'; pushCloud(); }, 30000);
    }).then(function () {
      if (S.busy === tok) S.busy = false;
      renderStatus();
      if (S.sid === key) afterBusy();
    });
  }
  function onPushed(key, json, at) {
    markSynced(key, at);
    if (S.sid !== key) return;
    S.baseJson = json; S.baseAt = at; S.conflicts = 0; S.cloudMsg = '';
    S.cloud = S.pendingCloud ? 'syncing' : 'ok';
  }
  // 条件付き書き込みが通らなかった＝他の画面で先に保存されていた → 取り寄せてまとめる
  function resolveConflict(key) {
    S.conflicts++;
    if (S.conflicts > 5) {
      S.cloud = 'error'; S.cloudMsg = '他の画面の保存と重なっています（自動で再試行します）';
      clearTimeout(S.retryTimer); S.retryTimer = setTimeout(function () { S.conflicts = 0; if (S.cloud === 'error') S.cloud = 'syncing'; pushCloud(); }, 20000);
      return;
    }
    return cloudGet(key).then(function (r) {
      if (S.sid !== key) return;
      if (r.missing) { S.cloud = 'missing'; return; }
      var row = r.row, ls = S.lastSent;
      if (!row || !row.plan) { S.baseJson = null; S.baseAt = null; S.pushQueued = true; return; }
      if (ls && ls.key === key && sameTime(row.updated_at, ls.at)) {
        // 実際には自分の書き込みが保存されていた（応答だけが届かなかった）
        markSynced(key, ls.at); S.baseJson = ls.json; S.baseAt = row.updated_at; S.conflicts = 0;
        S.pendingCloud = !sameTime(S.plan.updatedAt, ls.at); S.cloud = S.pendingCloud ? 'syncing' : 'ok';
        return;
      }
      var remote = migrate(row.plan), rj = JSON.stringify(remote);
      if (S.plan.createdAt && remote.createdAt && S.plan.createdAt !== remote.createdAt) {
        adoptRemote(remote, rj, row.updated_at, '');
        toast('この生徒のロードマップは別の画面で先に作成されていたため、そちらを表示します');
        return;
      }
      applyMerge(S.baseJson ? JSON.parse(S.baseJson) : null, remote, rj, row.updated_at);
    });
  }
  // 他の画面での保存を確認して取り込む（画面を開いた時・タブに戻った時・定期的に）
  function checkRemote(force) {
    if (!S.plan || !S.sid || !cloudFor(S.student) || S.cloud === 'missing' || S.busy || S.pendingCloud || !visiblePage()) return;
    var now = Date.now(); if (!force && now - S.lastCheck < 10000) return;
    S.lastCheck = now;
    var key = S.sid, tok = {};
    S.busy = tok;
    cloudGet(key, true).then(function (r) {
      if (S.sid !== key || r.missing || !r.row) return;
      if (S.baseAt && sameTime(r.row.updated_at, S.baseAt)) return;
      return cloudGet(key).then(function (r2) {
        if (S.sid !== key || !r2.row || !r2.row.plan || !S.plan) return;
        var row = r2.row, remote = migrate(row.plan), rj = JSON.stringify(remote);
        if (!S.pendingCloud || (S.plan.createdAt && remote.createdAt && S.plan.createdAt !== remote.createdAt)) adoptRemote(remote, rj, row.updated_at, '他の画面の変更を反映しました');
        else applyMerge(S.baseJson ? JSON.parse(S.baseJson) : null, remote, rj, row.updated_at);
      });
    }).catch(function () { }).then(function () {
      if (S.busy === tok) S.busy = false;
      if (S.sid === key) { afterBusy(); renderStatus(); }
    });
  }
  // 入力欄から離れた・クリックが終わった時に、待たせていた再描画を行う
  function resumeAfterInput() { if (S.renderPending && !isTyping() && !pointerBusy()) refreshView(); }
  function flush(ev) { saveLocalNow(); if (S.pendingCloud) pushCloud({ keepalive: !!(ev && ev.type === 'beforeunload') }); }

  /* ---------- 同時編集のマージ ----------
   * 3つの版（共通の元 base・この画面 local・クラウド remote）を比べ、片方だけが変えた所はその変更を、
   * 両方が変えた所は中身をさらに細かく比べてまとめる。
   *  ・id を持つ行の配列（課題・教材・復習・段階・模試など）は id ごとに対応づける
   *    （追加は両方とも残す／削除は相手が変えていなければ反映／片方が変更していれば残す）
   *  ・文字列などの配列（科目・方針など）は集合として扱う
   *  ・同じ欄を両方が書き換えた場合は、この画面（後から保存した側）の値を採る
   * base が不明（null）のときは削除を判断できないため、両方にあるものをすべて残す。 */
  function canonStr(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonStr).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ':' + canonStr(v[k]); }).join(',') + '}';
  }
  function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  // 計画の中身の比較用（保存日時・保存者は除く）
  function planSig(p) { var o = {}; Object.keys(p || {}).forEach(function (k) { if (k !== 'updatedAt' && k !== 'updatedBy') o[k] = p[k]; }); return canonStr(o); }
  function contentEq(a, b) { return planSig(a) === planSig(b); }
  function mergePlans(base, local, remote) {
    var memo = typeof WeakMap === 'function' ? new WeakMap() : null;
    function canon(v) {
      if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
      var c = memo && memo.get(v); if (c !== undefined && c !== null) return c;
      if (Array.isArray(v)) c = '[' + v.map(canon).join(',') + ']';
      else c = '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
      if (memo) memo.set(v, c);
      return c;
    }
    function same(a, b) { return canon(a) === canon(b); }
    function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
    function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined; }
    function m3(b, l, r) {
      if (same(l, r)) return l;
      if (b !== undefined && same(l, b)) return r;
      if (b !== undefined && same(r, b)) return l;
      if (isObj(l) && isObj(r)) {
        var out = {};
        uniq(Object.keys(l).concat(Object.keys(r))).forEach(function (k) {
          var inL = has(l, k), inR = has(r, k), inB = has(b, k);
          if (inL && inR) out[k] = m3(inB ? b[k] : undefined, l[k], r[k]);
          else if (inL) { if (!(inB && same(l[k], b[k]))) out[k] = l[k]; }
          else if (inR) { if (!(inB && same(r[k], b[k]))) out[k] = r[k]; }
        });
        return out;
      }
      if (Array.isArray(l) && Array.isArray(r)) {
        var ba = Array.isArray(b) ? b : [], all = l.concat(r, ba);
        if (all.length && all.every(function (x) { return isObj(x) && x.id != null && x.id !== ''; })) return byId(ba, l, r);
        return asSet(ba, l, r);
      }
      return l;
    }
    function byId(ba, l, r) {
      var bm = {}, rm = {}, seen = {}, out = [];
      ba.forEach(function (x) { bm[x.id] = x; });
      r.forEach(function (x) { rm[x.id] = x; });
      l.forEach(function (x) {
        if (seen[x.id]) return; seen[x.id] = 1;
        if (rm[x.id]) out.push(m3(bm[x.id], x, rm[x.id]));
        else if (bm[x.id]) { if (!same(x, bm[x.id])) out.push(x); }   // 相手が削除：こちらが変更していなければ削除を反映
        else out.push(x);                                             // こちらで追加
      });
      r.forEach(function (x) {
        if (seen[x.id]) return; seen[x.id] = 1;
        if (bm[x.id]) { if (!same(x, bm[x.id])) out.push(x); }       // こちらが削除：相手が変更していなければ削除を反映
        else out.push(x);                                             // 相手が追加
      });
      return out;
    }
    function asSet(ba, l, r) {
      var bk = {}, lk = {}, rk = {}, out = [];
      ba.forEach(function (x) { bk[canon(x)] = 1; });
      l.forEach(function (x) { lk[canon(x)] = 1; });
      r.forEach(function (x) { rk[canon(x)] = 1; });
      l.forEach(function (x) { var k = canon(x); if (bk[k] && !rk[k]) return; out.push(x); });
      r.forEach(function (x) { var k = canon(x); if (lk[k] || bk[k]) return; out.push(x); });
      return out;
    }
    return m3(base == null ? undefined : base, local, remote);
  }
  // マージ後の整理：同じ教材・日・種類の自動課題や、同じ日の復習課題が二重になっていたら1つにまとめる
  function normalizePlan(p) {
    var rank = { graded: 4, submitted: 3, resubmit: 2, missing: 1, todo: 0 }, keep = {}, drop = {}, remap = {};
    p.tasks.forEach(function (t) {
      if (!t.auto || !t.materialId || t.kind === 'review') return;
      var k = t.materialId + '|' + (t.origDate || t.date) + '|' + t.kind, cur = keep[k];
      if (!cur) { keep[k] = t; return; }
      var a = rank[t.status] || 0, c = rank[cur.status] || 0;
      if (a > c || (a === c && t.edited && !cur.edited)) { drop[cur.id] = 1; remap[cur.id] = t.id; keep[k] = t; }
      else { drop[t.id] = 1; remap[t.id] = cur.id; }
    });
    var rkeep = {}, touched = {};
    p.tasks.forEach(function (t) {
      if (t.kind !== 'review' || t.status !== 'todo' || drop[t.id]) return;
      var k = t.date + '|' + (t.subject || ''), cur = rkeep[k];
      if (!cur) { rkeep[k] = t; return; }
      cur.reviewIds = cur.reviewIds || [];
      (t.reviewIds || []).forEach(function (id) { if (cur.reviewIds.indexOf(id) < 0) cur.reviewIds.push(id); });
      drop[t.id] = 1; remap[t.id] = cur.id; touched[cur.id] = 1;
    });
    if (Object.keys(drop).length) p.tasks = p.tasks.filter(function (t) { return !drop[t.id]; });
    var tids = {}, rids = {};
    p.tasks.forEach(function (t) { tids[t.id] = t; });
    p.reviews.forEach(function (r) { rids[r.id] = r; });
    p.reviews.forEach(function (r) {
      if (r.taskId && remap[r.taskId]) r.taskId = remap[r.taskId];
      if (r.fromTaskId && remap[r.fromTaskId]) r.fromTaskId = remap[r.fromTaskId];
      if (r.taskId && !tids[r.taskId]) r.taskId = null;
      var rt = r.taskId && tids[r.taskId];
      if (rt && rt.kind === 'review' && r.status !== 'done') { rt.reviewIds = rt.reviewIds || []; if (rt.reviewIds.indexOf(r.id) < 0) { rt.reviewIds.push(r.id); touched[rt.id] = 1; } }
    });
    p.tasks.forEach(function (t) {
      if (t.kind !== 'review') return;
      var n = (t.reviewIds || []).length;
      t.reviewIds = (t.reviewIds || []).filter(function (id) { return rids[id]; });
      if (t.status === 'todo' && (touched[t.id] || n !== t.reviewIds.length)) refreshReviewTaskIn(p, t);
    });
    p.tasks = p.tasks.filter(function (t) { return !(t.kind === 'review' && t.auto && t.status === 'todo' && !(t.reviewIds || []).length); });
    p.skips = uniq(p.skips || []);
    p.history = (p.history || []).slice().sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
    return p;
  }

  /* ---------- 計画データの作成・補完 ---------- */
  function emptyProfile() {
    return { school: '', altUnivs: '', examType: '', examSubjects: '', examDate: '', hoursWeekday: '', hoursHoliday: '', teacher: '', goalText: '', memo: '',
      commonRatio: '', secondRatio: '', weights: [], priorities: [], policies: [], strengths: [], weaknesses: [], issues: [], targets: {}, currents: {} };
  }
  function migrate(p) {
    p = p || {};
    p.v = p.v || PLAN_VERSION;
    var prof = emptyProfile();
    p.profile = p.profile || {};
    Object.keys(prof).forEach(function (k) { if (p.profile[k] == null) p.profile[k] = prof[k]; });
    ['subjects', 'materials', 'stages', 'events', 'tasks', 'reviews', 'mocks', 'history', 'skips'].forEach(function (k) { if (!Array.isArray(p[k])) p[k] = []; });
    if (!p.months || typeof p.months !== 'object') p.months = {};
    if (!p.weeks || typeof p.weeks !== 'object') p.weeks = {};   // 週間目標：weeks[週の月曜].goals[教材ID]
    // IDのない行には内容から決まるIDを付ける（どの画面で読み込んでも同じIDになり、同時編集のマージで行を対応づけられる）
    function fixIds(arr, prefix) { arr.forEach(function (row, i) { if (row && typeof row === 'object' && !row.id) row.id = prefix + i + '_' + hashStr(canonStr(row)); }); }
    fixIds(p.materials, 'm'); fixIds(p.tasks, 't'); fixIds(p.reviews, 'r'); fixIds(p.stages, 'st'); fixIds(p.events, 'ev'); fixIds(p.mocks, 'mk'); fixIds(p.history, 'h');
    ['priorities', 'weights', 'issues'].forEach(function (k) { if (Array.isArray(p.profile[k])) fixIds(p.profile[k], k.slice(0, 2)); });
    p.materials.forEach(function (m) {
      if (!m.days || !m.days.length) m.days = [1, 2, 3, 4, 5];
      if (!m.pattern) m.pattern = 'straight';
      if (m.rounds == null) m.rounds = 1;
      if (!m.status) m.status = '未着手';
    });
    p.tasks.forEach(function (t) { if (!t.status) t.status = 'todo'; if (!t.kind) t.kind = 'other'; });
    p.reviews.forEach(function (r) { if (!r.status) r.status = 'open'; });
    return p;
  }
  function examMonthOf(st) {
    if (st && st.examMonth && /^\d{4}-\d{2}/.test(st.examMonth)) return String(st.examMonth).slice(0, 7);
    if (st && st.goalYear != null && st.goalMonth != null && st.goalYear !== '') return st.goalYear + '-' + pad(+st.goalMonth + 1);
    var d = new Date(); var y = d.getMonth() >= 2 ? d.getFullYear() + 1 : d.getFullYear();
    return y + '-02';
  }
  function deriveSubjects(st) {
    var list = [];
    (st.mainSubjects || []).concat(Object.keys(st.subDevs || {})).forEach(function (s) { var n = normSubject(s); if (n) list.push(n); });
    list = sortSubjects(list);
    if (!list.length) list = st.stream === 'bunkei' ? ['英語', '数学', '国語'] : ['英語', '数学', '物理', '化学'];
    return list;
  }
  // 学習段階を入試月から逆算して割り振る。
  // 標準の長さ（基礎理解2・典型定着3・標準演習3・応用演習3・過去問演習3・最終調整1＝15か月）より期間が短いときは、
  // 入試に近い段階（最終調整→過去問演習→…）から標準の長さで確保し、足りない分は前半の段階を短くするか省く。
  // 15か月以上あるときは、比率を保ったまま全体を引き延ばす。
  function autoStages(from, to) {
    var months = monthsRange(from, to), T = months.length;
    if (!T) return [];
    var defs = [['基礎理解', 2], ['典型定着', 3], ['標準演習', 3], ['応用演習', 3], ['過去問演習', 3], ['最終調整', 1]];
    var W = defs.reduce(function (a, d) { return a + d[1]; }, 0), al;
    if (T < W) {
      var left = T; al = defs.map(function () { return 0; });
      for (var i = defs.length - 1; i >= 0 && left > 0; i--) { var n = Math.min(defs[i][1], left); al[i] = n; left -= n; }
    } else {
      var raw = defs.map(function (d) { return T * d[1] / W; });
      al = raw.map(function (r) { return Math.max(1, Math.floor(r)); });
      var sum = al.reduce(function (a, b) { return a + b; }, 0);
      var order = raw.map(function (r, j) { return [r - Math.floor(r), j]; }).sort(function (a, b) { return b[0] - a[0]; });
      var oi = 0; while (sum < T) { al[order[oi % order.length][1]]++; sum++; oi++; }
    }
    var out = [], k = 0;
    defs.forEach(function (d, n) {
      if (!al[n]) return;
      out.push({ id: uid('st'), label: d[0], start: months[k], end: months[Math.min(months.length - 1, k + al[n] - 1)], color: STAGE_COLORS[n % STAGE_COLORS.length], note: '' });
      k += al[n];
    });
    return out;
  }
  function booksToMaterials(books) {
    var out = [];
    (books || []).forEach(function (b) {
      if (!b || !b.name) return;
      var hasRange = b.startY != null && b.startM != null && b.endY != null && b.endM != null;
      out.push({
        id: uid('m'), subject: normSubject(b.subLabel || b._displayLabel || b._filterKey || ''), name: b.name, purpose: '', range: '', unitLabel: '問題',
        count: '', rounds: 1, pattern: 'straight', days: [1, 2, 3, 4, 5], minPerItem: 15,
        start: hasRange ? (b.startY + '-' + pad(+b.startM + 1) + '-01') : '', end: hasRange ? lastDayOfMonth(b.endY + '-' + pad(+b.endM + 1)) : '',
        criteria: '', passPct: 80, evalMethod: '', priority: '中', prereq: '', teacher: '', status: '未着手'
      });
    });
    return out;
  }
  // 生徒登録の情報から決まる値（作成時に取り込み、登録内容が変わったときは「手で直していなければ」追随させる）
  function derivedFrom(st) {
    var subjects = deriveSubjects(st), currents = {}, targets = {};
    var sd = st.subDevs || {};
    Object.keys(sd).forEach(function (k) { var n = normSubject(k), v = num(sd[k]); if (v == null || !n) return; currents[n] = currents[n] == null ? v : Math.round((currents[n] + v) / 2); });
    var tdev = st.univInfo && num(st.univInfo.dev);
    if (tdev) subjects.forEach(function (s) { targets[s] = tdev; });
    var exam = (st.univInfo && Array.isArray(st.univInfo.subjects) && st.univInfo.subjects.length) ? st.univInfo.subjects.join('・')
      : sortSubjects((st.mainSubjects || []).map(normSubject)).join('・');
    return { subjects: subjects, currents: currents, targets: targets, altUnivs: [st.univName2, st.univName3].filter(Boolean).join('・'), examSubjects: exam, memo: String(st.memo || '') };
  }
  function createPlanFor(st) {
    var d = derivedFrom(st), prof = emptyProfile();
    prof.altUnivs = d.altUnivs; prof.examSubjects = d.examSubjects; prof.memo = d.memo;
    prof.priorities = [{ id: uid('row'), title: '', desc: '' }];
    prof.targets = d.targets; prof.currents = d.currents;
    return migrate({
      v: PLAN_VERSION, createdAt: nowIso(), updatedAt: '', updatedBy: '',
      profile: prof, subjects: d.subjects, materials: booksToMaterials(st.manualBooks),
      stages: autoStages(thisMonth(), examMonthOf(st)), events: [], months: {}, tasks: [], reviews: [], mocks: [], history: []
    });
  }
  // 生徒登録が変わったとき：作成時に取り込んだままの値（手で直していない値）だけを新しい登録内容に合わせる。科目は増やすだけで減らさない
  function syncFromStudent(prev, now) {
    if (!S.plan || !prev || !now) return 0;
    var a = derivedFrom(prev), b = derivedFrom(now), prof = S.plan.profile, n = 0;
    function follow(key) { var cur = prof[key] == null ? '' : String(prof[key]); if (a[key] !== b[key] && (cur === '' || cur === a[key])) { prof[key] = b[key]; n++; } }
    follow('altUnivs'); follow('examSubjects'); follow('memo');
    ['targets', 'currents'].forEach(function (k) {
      prof[k] = prof[k] || {};
      Object.keys(b[k]).forEach(function (s) { if (b[k][s] !== a[k][s] && (prof[k][s] == null || prof[k][s] === a[k][s])) { prof[k][s] = b[k][s]; n++; } });
    });
    b.subjects.forEach(function (s) { if (S.plan.subjects.indexOf(s) < 0) { S.plan.subjects = sortSubjects(S.plan.subjects.concat([s])); n++; } });
    if (n) touch();
    return n;
  }
  // 生徒登録の直後：計画がなければ自動で作る（クラウドの読み込みが終わってから判断する）
  function finishAutoCreate() {
    if (!S.autoCreate) return;
    S.autoCreate = false;
    var prev = S.syncFrom; S.syncFrom = null;
    if (!S.student) return;
    if (!S.plan) {
      S.plan = createPlanFor(S.student);
      addHistory('個別ロードマップ', '', '新規作成（生徒登録から自動作成）', '', '');
      touch(); saveLocalNow(); S.tab.groad = 'strategy'; saveUi();
      toast('個別ロードマップを作成しました。合格戦略と教材を入力してください');
    } else if (prev) {
      var n = syncFromStudent(prev, S.student);
      if (n) toast('生徒登録の変更をロードマップに反映しました');
    }
    rerender();
  }

  /* ---------- 教材の範囲を日ごとに割り振る（年→月→週→日の共通の土台） ----------
   * 進め方 straight：周回×問題数を、期間中の課題日に均等に割り振る。
   * 進め方 redo   ：週の課題日を「新規→翌日解き直し」の組にし、奇数日の週は最終日を確認問題にする。
   *                 解き直しが2周目を兼ねる（周回数2なら新規1周＋解き直し1周）。
   * 戻り値の units は「問題×周」の進捗単位（解き直しは周回数の範囲内のときだけ数える）。 */
  function matDays(m) { return (m.days && m.days.length) ? m.days.map(Number) : [1, 2, 3, 4, 5]; }
  function teachingDates(m) {
    if (!m.start || !m.end || m.start > m.end) return [];
    var out = [], d = m.start, days = matDays(m), guard = 0;
    while (d <= m.end && guard++ < 1200) { if (days.indexOf(dowOf(d)) >= 0) out.push(d); d = addDays(d, 1); }
    return out;
  }
  // a〜b は 0 始まりの通し番号（終わりは含まない）。off は開始番号−1（途中から始める教材）
  function rangeText(label, a, b, off) { off = off || 0; return (label || '') + (b - a <= 1 ? String(off + a + 1) : (off + a + 1) + '〜' + (off + b)); }
  // 開始番号（途中まで進んだ教材を、例えば「問題61」から割り振るとき）
  function startNo(m) { var v = Math.floor(num(m && m.startNo) || 1); return v > 1 ? v : 1; }
  // 数の単位：「例題」「問題」なら「題」、それ以外（テーマ・小単元・ページなど）はその呼び方を使う
  function unitOf(m) { var l = String((m && m.unitLabel) || '').trim(); return (!l || /題$/.test(l)) ? '題' : l; }
  // 自動で表示する範囲（例：問題61〜100）
  function autoRange(m) { var C = Math.floor(num(m.count) || 0); if (!C) return ''; var a = startNo(m); return (m.unitLabel || '') + a + '〜' + (a + C - 1); }
  function splitPasses(a, b, C) {
    var segs = [], p = a;
    while (p < b) { var cyc = Math.floor(p / C), from = p % C, end = Math.min(b, (cyc + 1) * C); segs.push({ cycle: cyc, from: from, to: from + (end - p) }); p = end; }
    return segs;
  }
  var _allocCache = {};
  function allocKey(m) { return [m.id, m.start, m.end, m.count, m.rounds, m.pattern, matDays(m).join(''), m.unitLabel, m.minPerItem, startNo(m)].join('|'); }
  function alloc(m) {
    var k = allocKey(m);
    if (!_allocCache[k]) { _allocCache[k] = computeAlloc(m); }
    return _allocCache[k];
  }
  function computeAlloc(m) {
    var C = Math.max(0, Math.floor(num(m.count) || 0)), R = Math.max(1, Math.floor(num(m.rounds) || 1));
    var dates = teachingDates(m), label = m.unitLabel || '', mpi = num(m.minPerItem) || 15, slots = [], off = startNo(m) - 1;
    if (!C || !dates.length) return slots;
    if (m.pattern === 'redo') {
      var weeks = {}, order = [];
      dates.forEach(function (d) { var w = mondayOf(d); if (!weeks[w]) { weeks[w] = []; order.push(w); } weeks[w].push(d); });
      var roles = [];
      order.forEach(function (w) {
        var ds = weeks[w], n = ds.length;
        ds.forEach(function (d, i) {
          var role = (n >= 3 && n % 2 === 1 && i === n - 1) ? 'check' : (i % 2 === 0 ? 'new' : 'redo');
          if (n === 1) role = 'new';
          roles.push({ date: d, role: role, week: w });
        });
      });
      var newDays = roles.filter(function (r) { return r.role === 'new'; });
      var K = Math.ceil(R / 2), P = C * K, N = newDays.length;
      newDays.forEach(function (r, j) { r.a = Math.floor(j * P / N); r.b = Math.floor((j + 1) * P / N); });
      var lastNew = {}, weekItems = {};
      roles.forEach(function (r) {
        if (r.role === 'new') {
          if (!(r.b > r.a)) { lastNew[r.week] = null; return; }
          var segs = splitPasses(r.a, r.b, C);
          slots.push({ date: r.date, kind: 'study', units: r.b - r.a, qty: r.b - r.a, items: segs, minutes: round5((r.b - r.a) * mpi),
            text: segs.map(function (s) { return rangeText(label, s.from, s.to, off) + '（' + (2 * s.cycle + 1) + '周目）'; }).join('、') });
          lastNew[r.week] = segs;
          weekItems[r.week] = (weekItems[r.week] || []).concat(segs);
        } else if (r.role === 'redo') {
          var prev = lastNew[r.week];
          if (!prev) return;
          var cnt = 0, units = 0;
          prev.forEach(function (s) { cnt += s.to - s.from; if (2 * s.cycle + 2 <= R) units += s.to - s.from; });
          slots.push({ date: r.date, kind: 'redo', units: units, qty: cnt, items: prev, minutes: round5(cnt * mpi * 0.6),
            text: prev.map(function (s) { return rangeText(label, s.from, s.to, off); }).join('、') + '：解き直し（' + uniq(prev.map(function (s) { return (2 * s.cycle + 2) + '周目'; })).join('・') + '）' });
          lastNew[r.week] = null;
        } else {
          var its = weekItems[r.week] || [];
          if (!its.length) return;
          var mn = Math.min.apply(null, its.map(function (s) { return s.from; })), mx = Math.max.apply(null, its.map(function (s) { return s.to; }));
          var c3 = its.reduce(function (a, s) { return a + (s.to - s.from); }, 0);
          slots.push({ date: r.date, kind: 'check', units: 0, qty: c3, items: [], minutes: round5(Math.min(60, Math.max(20, c3 * mpi * 0.4))), text: rangeText(label, mn, mx, off) + '：確認問題' });
        }
      });
    } else {
      var P2 = C * R, D = dates.length;
      dates.forEach(function (d, i) {
        var a = Math.floor(i * P2 / D), b = Math.floor((i + 1) * P2 / D);
        if (b <= a) return;
        var segs = splitPasses(a, b, C);
        slots.push({ date: d, kind: 'study', units: b - a, qty: b - a, items: segs, minutes: round5((b - a) * mpi),
          text: segs.map(function (s) { return rangeText(label, s.from, s.to, off) + (R > 1 ? '（' + (s.cycle + 1) + '周目）' : ''); }).join('、') });
      });
    }
    return slots;
  }
  // ある月にかかる週（月曜の日付）を並べる。月をまたぐ週も含める
  function weeksOfMonth(M) {
    var last = lastDayOfMonth(M), mon = mondayOf(M + '-01'), out = [], guard = 0;
    while (mon <= last && guard++ < 8) { out.push(mon); mon = addDays(mon, 7); }
    return out;
  }
  // その週の教材の範囲（自動）：「例題41〜46（1・2周目）」。割り振りがなければ ''
  function weekAutoRange(m, mon) { return rangeSummary(m, mon, addDays(mon, 6)); }
  // その週の目標：手で入れた週間目標があればそれ、なければ自動の範囲
  function weekGoal(m, mon) {
    var w = S.plan.weeks && S.plan.weeks[mon], g = w && w.goals && w.goals[m.id];
    return (g && String(g).trim()) || weekAutoRange(m, mon);
  }
  // その週に関係する教材（期間が重なる、または週間目標が入力されている）
  function weekMaterials(mon) {
    var sun = addDays(mon, 6), w = S.plan.weeks && S.plan.weeks[mon];
    return sortedMaterials().filter(function (m) { return (m.start && m.end && m.start <= sun && m.end >= mon) || !!(w && w.goals && w.goals[m.id] && String(w.goals[m.id]).trim()); });
  }
  // ある期間（[from, to]）の割り振りを「例題1〜30（1周目）」のような文にまとめる
  function rangeSummary(m, from, to) {
    var slots = alloc(m).filter(function (s) { return s.date >= from && s.date <= to && s.kind === 'study'; });
    if (!slots.length) return '';
    var byCycle = {}, cycles = [];
    slots.forEach(function (s) { s.items.forEach(function (it) {
      var c = it.cycle; if (!byCycle[c]) { byCycle[c] = { a: it.from, b: it.to }; cycles.push(c); }
      byCycle[c].a = Math.min(byCycle[c].a, it.from); byCycle[c].b = Math.max(byCycle[c].b, it.to);
    }); });
    var R = Math.max(1, num(m.rounds) || 1), label = m.unitLabel || '';
    return cycles.sort(function (a, b) { return a - b; }).map(function (c) {
      var r = byCycle[c], t = rangeText(label, r.a, r.b, startNo(m) - 1);
      if (m.pattern === 'redo') return t + '（' + (2 * c + 1) + (2 * c + 2 <= R ? '・' + (2 * c + 2) : '') + '周目）';
      return t + (R > 1 ? '（' + (c + 1) + '周目）' : '');
    }).join('／');
  }
  function matPerDay(m) {
    var C = num(m.count) || 0, R = Math.max(1, num(m.rounds) || 1), D = teachingDates(m).length;
    if (!C || !D) return null;
    if (m.pattern === 'redo') { var nd = alloc(m).filter(function (s) { return s.kind === 'study'; }).length; return nd ? (C * Math.ceil(R / 2) / nd) : null; }
    return C * R / D;
  }

  /* ---------- 進捗・到達度の集計 ---------- */
  function isDone(t) { return t.status === 'submitted' || t.status === 'graded'; }
  function level(acc, pass) { if (acc == null) return null; if (acc >= pass) return 4; if (acc >= pass - 15) return 3; if (acc >= 50) return 2; return 1; }
  // 予定・提出の判定に入れる課題：前日までの課題と、今日の課題のうち提出済みのもの
  // （今日の課題は、まだ提出していなくても遅れ扱いにしない）。過去の日で区切るときはその日までをすべて入れる。
  function isDueBy(date, done, upto, t0) { return upto < t0 ? date <= upto : (date < t0 || (date === t0 && done)); }
  function matStats(m, upto) {
    var p = S.plan, C = num(m.count) || 0, R = Math.max(1, num(m.rounds) || 1), U = C * R, t0 = today();
    upto = upto || t0;
    var doneKey = {};
    p.tasks.forEach(function (t) { if (t.materialId === m.id && isDone(t)) doneKey[(t.origDate || t.date) + '|' + t.kind] = 1; });
    var planned = 0;
    alloc(m).forEach(function (s) { if (isDueBy(s.date, !!doneKey[s.date + '|' + s.kind], upto, t0)) planned += s.units; });
    planned = U ? Math.min(planned, U) : planned;
    var done = 0, cor = 0, tot = 0, due = 0, sub = 0;
    p.tasks.forEach(function (t) {
      if (t.materialId !== m.id) return;
      if (isDone(t)) done += num(t.units) || 0;
      if (t.status === 'graded' && num(t.total) > 0) { cor += num(t.correct) || 0; tot += num(t.total); }
      if (isDueBy(t.date, isDone(t), upto, t0)) { due++; if (isDone(t)) sub++; }
    });
    if (U) done = Math.min(done, U);
    var acc = tot > 0 ? Math.round(cor / tot * 100) : null, pass = num(m.passPct) || 80;
    return {
      U: U, planned: planned, done: done,
      prog: U ? Math.round(done / U * 100) : null, plannedPct: U ? Math.round(planned / U * 100) : null,
      diff: done - planned, acc: acc, cor: cor, tot: tot, pass: pass, lv: level(acc, pass), due: due, sub: sub,
      openReviews: p.reviews.filter(function (r) { return r.materialId === m.id && r.status !== 'done'; }).length
    };
  }
  function subjectStats(sub, upto) {
    var p = S.plan, t0 = today(); upto = upto || t0;
    var U = 0, done = 0, planned = 0, cor = 0, tot = 0, passSum = 0, passN = 0;
    p.materials.forEach(function (m) {
      if (m.subject !== sub) return;
      var st = matStats(m, upto); U += st.U; done += st.done; planned += st.planned; passSum += st.pass; passN++;
    });
    var due = 0, subm = 0, from28 = addDays(upto, -27);
    p.tasks.forEach(function (t) {
      if (t.subject !== sub) return;
      if (t.status === 'graded' && num(t.total) > 0 && !t.materialId) { cor += num(t.correct) || 0; tot += num(t.total); }
      if (t.date >= from28 && isDueBy(t.date, isDone(t), upto, t0)) { due++; if (isDone(t)) subm++; }
    });
    p.materials.forEach(function (m) { if (m.subject !== sub) return; var st = matStats(m, upto); cor += st.cor; tot += st.tot; });
    var acc = tot > 0 ? Math.round(cor / tot * 100) : null, pass = passN ? Math.round(passSum / passN) : 80;
    return { U: U, done: done, planned: planned, prog: U ? Math.round(done / U * 100) : null, plannedPct: U ? Math.round(planned / U * 100) : null,
      acc: acc, pass: pass, lv: level(acc, pass), due: due, sub: subm, subRate: due ? Math.round(subm / due * 100) : null };
  }
  function planSubjects() {
    var p = S.plan, list = (p.subjects || []).slice();
    p.materials.forEach(function (m) { if (m.subject && list.indexOf(m.subject) < 0) list.push(m.subject); });
    return list;
  }
  function matById(id) { return S.plan && S.plan.materials.filter(function (m) { return m.id === id; })[0]; }
  function taskById(id) { return S.plan && S.plan.tasks.filter(function (t) { return t.id === id; })[0]; }
  function addHistory(target, before, after, reason, approver) {
    S.plan.history.unshift({ id: uid('h'), at: nowIso(), by: userEmail(), target: target || '', before: before || '', after: after || '', reason: reason || '', approver: approver || '' });
  }
