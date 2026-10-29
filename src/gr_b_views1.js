
  /* ============================================================
   * 画面の骨組み
   * ============================================================ */
  var PAGES = {
    groad: { title: '個別合格ロードマップ', desc: '志望校から逆算した計画を、教材・年間・月間・到達度まで同じデータでつなぎます',
      tabs: [['strategy', '合格戦略'], ['materials', '教材・年間計画'], ['monthly', '月間ロードマップ'], ['progress', '到達度']] },
    gweek: { title: '週間計画・毎日の課題', desc: '教材の範囲から週の課題を作り、提出・採点・復習までを記録します',
      tabs: [['weekly', '週間学習計画'], ['daily', '毎日の課題・採点'], ['reviews', '復習キュー']] }
  };
  var KIND_ORDER = { study: 0, redo: 1, check: 2, review: 3, other: 4 };

  function isVisible(pg) { var el = document.getElementById('page-' + pg); return !!(el && el.classList.contains('active')); }
  function visiblePage() { return isVisible('groad') ? 'groad' : isVisible('gweek') ? 'gweek' : null; }
  function tabLabel(t) { var out = t; Object.keys(PAGES).forEach(function (pg) { PAGES[pg].tabs.forEach(function (x) { if (x[0] === t) out = x[1]; }); }); return out; }
  function render() { ensureLoaded(); var pg = visiblePage(); if (pg) renderPage(pg); }
  function rerender() { var pg = visiblePage(); if (pg) renderPage(pg); }

  function renderPage(pg) {
    var root = document.getElementById('gr-root-' + pg);
    if (!root) return;
    var y = window.scrollY, cfg = PAGES[pg], tab = S.tab[pg];
    if (!cfg.tabs.some(function (t) { return t[0] === tab; })) tab = S.tab[pg] = cfg.tabs[0][0];
    var html = '<div class="gr-head"><div><div class="section-title">' + cfg.title + '</div><div class="section-desc">' + cfg.desc + '</div></div>'
      + '<div class="gr-head-actions gr-noprint">' + studentSelect() + '<span class="gr-status" id="gr-status-' + pg + '"></span>'
      + (S.plan ? '<button class="btn btn-secondary gr-btn-sm" data-gr-act="print">🖨 このタブを印刷・PDF</button>'
        + (pg === 'groad' ? '<button class="btn btn-secondary gr-btn-sm" data-gr-act="print-all" title="合格戦略・教材と年間計画・今月の月間ロードマップをまとめて印刷します">面談用にまとめて印刷</button>' : '') : '')
      + '</div></div>';
    if (!S.student) html += emptyNoStudent();
    else if (!S.plan) html += emptyNoPlan();
    else {
      html += '<div class="tabs gr-tabs gr-noprint">' + cfg.tabs.map(function (t) {
        return '<button class="tab' + (t[0] === tab ? ' active' : '') + '" data-gr-act="tab" data-page="' + pg + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      var body;
      try { body = VIEWS[tab](); } catch (e) { console.error('[GR] render error', e); body = '<div class="gr-callout">画面の表示中にエラーが発生しました：' + esc(e.message) + '</div>'; }
      html += '<div class="gr-view" id="gr-view-' + pg + '" data-tab="' + tab + '">' + body + '</div>';
    }
    var keep = null;
    if (S.keepForm) {
      keep = { task: S.gradeTaskId, v: {} };
      [].slice.call(root.querySelectorAll('input[id^="gr-g-"], textarea[id^="gr-g-"], select[id^="gr-g-"]')).forEach(function (el) { keep.v[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    }
    root.innerHTML = html;
    if (keep && keep.task && keep.task === S.gradeTaskId) Object.keys(keep.v).forEach(function (id) { var el = document.getElementById(id); if (!el) return; if (el.type === 'checkbox') el.checked = keep.v[id]; else el.value = keep.v[id]; });
    renderStatus();
    if (S.plan && AFTER[tab]) { try { AFTER[tab](); } catch (e) { console.warn('[GR] after-render', e); } }
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  }
  function studentOptions() {
    var list = getAllStudents(), cur = S.sid;
    return '<option value="">── 生徒を選択 ──</option>' + list.map(function (s) {
      var k = studentKey(s); return '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
  }
  function studentSelect() { return '<select class="gr-student-sel" data-gr-change="student">' + studentOptions() + '</select>'; }
  function renderStatus() {
    ['groad', 'gweek'].forEach(function (pg) {
      var el = document.getElementById('gr-status-' + pg);
      if (!el) return;
      if (!S.plan) { el.style.display = 'none'; return; }
      el.style.display = '';
      var st = S.cloud, txt, title = '';
      if (st === 'ok') txt = 'クラウドに保存済み';
      else if (st === 'syncing') txt = '保存中…';
      else if (st === 'error') { txt = '未同期（自動で再試行します）'; title = S.cloudMsg || ''; }
      else if (st === 'missing') { txt = 'この端末にのみ保存中（クラウド未設定）'; title = 'クリックで設定方法を表示'; }
      else { txt = cloudEnabled() ? 'この端末に保存（生徒のDB登録後にクラウド保存）' : 'この端末に保存'; }
      if (S.cloudNote && Date.now() - S.cloudNoteAt < 15000 && (st === 'ok' || st === 'syncing')) txt += '・' + S.cloudNote;
      if (S.lsFailed) txt += '・端末の容量不足';
      el.className = 'gr-status ' + st; el.textContent = txt; el.title = title;
      if (st === 'missing') el.setAttribute('data-gr-act', 'setup'); else el.removeAttribute('data-gr-act');
    });
  }
  function emptyNoStudent() {
    var n = getAllStudents().length;
    return '<div class="gr-card"><div class="gr-card-b"><div class="gr-empty"><div class="gr-empty-icon">🧭</div><div class="gr-empty-title">' + (n ? '生徒を選択してください' : '生徒が登録されていません') + '</div>'
      + (n ? '右上のプルダウンから生徒を選ぶと、その生徒の個別ロードマップを表示します。' : '「生徒登録」タブから生徒を登録してください。') + '</div></div></div>';
  }
  function emptyNoPlan() {
    var st = S.student;
    return '<div class="gr-card"><div class="gr-card-h"><span>' + esc(st.name) + ' さんの個別ロードマップ</span></div><div class="gr-card-b"><div class="gr-empty"><div class="gr-empty-icon">🗺️</div><div class="gr-empty-title">まだ作成されていません</div>'
      + '<div style="max-width:600px;margin:0 auto 16px;line-height:1.85;">生徒登録の情報（志望校・入試時期・科目・偏差値・ロードマップに手動で追加した参考書）を下書きとして取り込み、合格までの段階（基礎理解→典型定着→標準演習→応用演習→過去問演習→最終調整）を入試時期から逆算して割り振ります（入試まで短い場合は、過去問演習・最終調整など入試に近い段階を優先して確保します）。作成後はすべての項目を自由に修正できます。</div>'
      + '<button class="btn btn-primary" data-gr-act="create">この生徒のロードマップを作成する</button></div></div></div>';
  }

  /* ---------- 部品 ---------- */
  function attrs(o) { var s = ''; Object.keys(o).forEach(function (k) { if (o[k] != null && o[k] !== false) s += ' ' + k + '="' + esc(o[k]) + '"'; }); return s; }
  function inp(path, opts) {
    opts = opts || {};
    var v = getPath(S.plan, path); if (v == null) v = '';
    var type = opts.type || 'text';
    return '<input' + attrs({ 'class': 'gr-in' + (type === 'number' ? ' num' : '') + (opts.cls ? ' ' + opts.cls : ''), type: type, 'data-gr-bind': path,
      'data-gr-type': type === 'number' ? 'num' : null, 'data-gr-rerender': opts.rerender ? '1' : null, 'data-gr-default': opts.isDefault ? '1' : null,
      value: v, placeholder: opts.ph || null, min: opts.min, max: opts.max, step: opts.step, style: opts.style || null, list: opts.list || null }) + '>';
  }
  function ta(path, opts) {
    opts = opts || {}; var v = getPath(S.plan, path); if (v == null) v = '';
    return '<textarea' + attrs({ 'class': 'gr-in', 'data-gr-bind': path, rows: opts.rows || 3, placeholder: opts.ph || null }) + '>' + esc(v) + '</textarea>';
  }
  function sel(path, options, opts) {
    opts = opts || {}; var v = getPath(S.plan, path); if (v == null) v = '';
    return '<select' + attrs({ 'class': 'gr-in' + (opts.cls ? ' ' + opts.cls : ''), 'data-gr-bind': path, 'data-gr-rerender': opts.rerender ? '1' : null, style: opts.style || null }) + '>'
      + options.map(function (o) { var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>';
  }
  function card(title, body, opts) {
    opts = opts || {};
    return '<div class="gr-card' + (opts.cls ? ' ' + opts.cls : '') + '"><div class="gr-card-h' + (opts.h ? ' ' + opts.h : '') + '"><span>' + title + '</span>' + (opts.right || '') + '</div><div class="gr-card-b">' + body + '</div></div>';
  }
  function kv(k, v, strong) { return '<div class="k">' + k + '</div><div class="v' + (strong ? ' strong' : '') + '">' + v + '</div>'; }
  function listEditor(path, opts) {
    opts = opts || {}; var arr = getPath(S.plan, path) || [];
    var rows = arr.map(function (v, i) {
      var mk = opts.marker === 'check' ? '<span class="gr-check">✓</span>' : opts.marker === 'num' ? '<span class="gr-num">' + (i + 1) + '</span>' : '<span class="gr-check">・</span>';
      return '<div class="gr-list-item">' + mk + inp(path + '.' + i, { ph: opts.ph }) + '<button class="gr-x gr-noprint" title="削除" data-gr-act="list-del" data-path="' + esc(path) + '" data-i="' + i + '">×</button></div>';
    }).join('');
    return '<div class="gr-list">' + (rows || '<div class="gr-muted">まだありません</div>') + '</div><button class="gr-add gr-noprint" data-gr-act="list-add" data-path="' + esc(path) + '">＋ 追加</button>';
  }
  function tableEditor(path, cols, opts) {
    opts = opts || {}; var arr = getPath(S.plan, path) || [];
    var head = '<tr>' + cols.map(function (c) { return '<th' + (c.w ? ' style="width:' + c.w + '"' : '') + (c.type === 'number' ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '<th class="gr-noprint" style="width:28px"></th></tr>';
    var body = arr.map(function (row, i) {
      return '<tr>' + cols.map(function (c) {
        var p = path + '.' + i + '.' + c.key;
        if (c.type === 'select') return '<td>' + sel(p, c.options) + '</td>';
        if (c.type === 'textarea') return '<td>' + ta(p, { rows: 2, ph: c.ph }) + '</td>';
        return '<td>' + inp(p, { type: c.type || 'text', ph: c.ph, rerender: c.rerender }) + '</td>';
      }).join('') + '<td class="gr-noprint"><button class="gr-x" title="削除" data-gr-act="row-del" data-path="' + esc(path) + '" data-i="' + i + '">×</button></td></tr>';
    }).join('');
    if (!arr.length) body = '<tr><td colspan="' + (cols.length + 1) + '" class="gr-muted" style="text-align:center;padding:12px;">' + esc(opts.empty || 'まだありません') + '</td></tr>';
    return '<div class="gr-table-wrap"><table class="gr-table">' + head + body + '</table></div><button class="gr-add gr-noprint" data-gr-act="row-add" data-path="' + esc(path) + '" data-tpl="' + esc(JSON.stringify(opts.tpl || {})) + '">' + esc(opts.addLabel || '＋ 行を追加') + '</button>';
  }
  function sortedMaterials() {
    return S.plan.materials.slice().sort(function (a, b) {
      var ia = SUBJECT_ORDER.indexOf(a.subject), ib = SUBJECT_ORDER.indexOf(b.subject);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib || String(a.subject).localeCompare(String(b.subject)) || String(a.start || '9').localeCompare(String(b.start || '9')) || String(a.name).localeCompare(String(b.name));
    });
  }
  function periodLabel(a, b) {
    if (!a) return '—';
    var pa = a.split('-'), pb = (b || a).split('-');
    if (a === b || !b) return pa[0] + '年' + (+pa[1]) + '月';
    if (pa[0] === pb[0]) return pa[0] + '年' + (+pa[1]) + '〜' + (+pb[1]) + '月';
    return pa[0] + '年' + (+pa[1]) + '月〜' + pb[0] + '年' + (+pb[1]) + '月';
  }
  function periodShort(a, b) { if (!a) return '—'; return (a === b || !b) ? monthShort(a) : monthShort(a) + '〜' + monthShort(b); }
  function matStatusPill(s) { var c = s === '完了' ? 'done' : s === '進行中' ? 'doing' : ''; return '<span class="gr-pill ' + c + '">' + esc(s || '未着手') + '</span>'; }
  function prioPill(p) { if (!p) return ''; return ' <span class="gr-pill ' + ({ '高': 'hi', '中': 'mid', '低': 'lo' }[p] || '') + '">優先度：' + esc(p) + '</span>'; }
  function diffText(d, unit) { if (!d) return '<span class="gr-diff">予定どおり</span>'; return '<span class="gr-diff ' + (d > 0 ? 'plus' : 'minus') + '">予定比' + (d > 0 ? '+' : '') + d + esc(unit || '題') + '</span>'; }
  function lvBadge(lv) { return lv ? '<span class="gr-lv l' + lv + '">' + LV_LABEL[lv] + '</span>' : '<span class="gr-lv l0">未評価</span>'; }
  function progBar(prog, plannedPct) {
    return '<div class="gr-bar"><i style="width:' + clamp(prog || 0, 0, 100) + '%"></i>' + (plannedPct != null ? '<b style="left:' + clamp(plannedPct, 0, 100) + '%" title="予定（前日までの分。今日の分は提出したら加算）"></b>' : '') + '</div>';
  }
  function progCell(st, unit) {
    if (st.prog == null) return '<span class="gr-muted">問題数・期間を入れると表示</span>';
    return progBar(st.prog, st.plannedPct) + '<div class="gr-muted" style="margin-top:3px">完了' + st.prog + '%（予定' + st.plannedPct + '%）<br>' + diffText(st.diff, unit) + '</div>';
  }
  function fmtDT(iso) { if (!iso) return ''; var d = new Date(iso); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function stageAt(k) { return S.plan.stages.filter(function (s) { return s.start && s.end && k >= s.start && k <= s.end; })[0]; }

  /* ============================================================
   * ① 合格戦略（生徒プロフィール・合格目標）
   * ============================================================ */
  function viewStrategy() {
    var p = S.plan, st = S.student, prof = p.profile;
    var gradeLabel = { high1: '高校1年', high2: '高校2年', high3: '高校3年', ronin: '既卒' }[st.grade] || (st.grade || '—');
    var exam = examMonthOf(st), remain = monthsRange(thisMonth(), exam).length;
    var univ = (st.univName || '—') + (st.dept1 ? '　' + st.dept1 : '');
    var basic = '<div class="gr-kv">'
      + kv('氏名', esc(st.name), true)
      + kv('学年', esc(gradeLabel) + (st.stream === 'bunkei' ? '（文系）' : st.stream ? '（理系）' : ''))
      + kv('高校', inp('profile.school', { ph: '○○高等学校' }))
      + kv('志望校', esc(univ), true)
      + kv('併願校', inp('profile.altUnivs', { ph: '横浜国立大学・早稲田大学（理工）' }))
      + kv('入試方式', inp('profile.examType', { ph: '一般選抜（前期）' }))
      + kv('受験科目', inp('profile.examSubjects', { ph: '英・数・理（物理・化学）・国' }))
      + kv('入試時期', esc(monthLabel(exam)) + ' <span class="gr-muted">（残り約' + remain + 'か月）</span>')
      + kv('学習可能時間', '<div class="gr-row-inline" style="font-size:12px">平日' + inp('profile.hoursWeekday', { type: 'number', cls: 'w60', min: 0, step: 0.5 }) + '時間　休日' + inp('profile.hoursHoliday', { type: 'number', cls: 'w60', min: 0, step: 0.5 }) + '時間</div>')
      + kv('担当講師', inp('profile.teacher', { ph: '山田 先生' }))
      + '</div><div class="gr-flabel" style="margin-top:12px">対象科目</div>' + subjectChips()
      + '<div class="gr-note">氏名・学年・志望校・入試時期は「生徒登録」の情報を表示しています。対象科目は登録時の主要対策科目と科目別偏差値から作り、受験科目は大学データの科目を入れています（必要に応じて書き換えてください）。</div>';

    var w = prof.weights || [];
    var wTotal = w.reduce(function (a, r) { return a + (num(r.points) || 0); }, 0);
    var examInfo = '<div style="font-weight:700;color:var(--ink);margin-bottom:8px">' + esc(st.univName || '志望校未設定') + (st.univInfo && st.univInfo.cat ? ' <span class="gr-pill">' + (st.univInfo.cat === 'national' ? '国公立' : '私立') + '</span>' : '') + (st.univInfo && st.univInfo.dev ? ' <span class="gr-muted">目安偏差値 ' + esc(st.univInfo.dev) + '</span>' : '') + '</div>'
      + '<div class="gr-row-inline" style="margin-bottom:10px;font-size:12px">共通テスト' + inp('profile.commonRatio', { type: 'number', cls: 'w60', min: 0, max: 100 }) + '%　2次試験' + inp('profile.secondRatio', { type: 'number', cls: 'w60', min: 0, max: 100 }) + '%</div>'
      + tableEditor('profile.weights', [{ key: 'subject', label: '科目', ph: '英語' }, { key: 'points', label: '配点', type: 'number', w: '90px', rerender: true }], { tpl: { subject: '', points: '' }, empty: '配点を入力すると、科目ごとの重みが一目で分かります' })
      + '<div class="gr-row-inline" style="justify-content:space-between;margin-top:6px;font-size:12.5px"><button class="gr-link gr-noprint" data-gr-act="weights-fill">対象科目から行を作る</button><span>合計 <b>' + wTotal + '</b> 点</span></div>';

    var subs = planSubjects(), minD = 35, maxD = 75;
    var devRows = subs.map(function (s) {
      var cur = num(prof.currents[s]), tgt = num(prof.targets[s]);
      var cw = cur != null ? clamp((cur - minD) / (maxD - minD) * 100, 2, 100) : 0, tw = tgt != null ? clamp((tgt - minD) / (maxD - minD) * 100, 2, 100) : 0;
      var gap = (cur != null && tgt != null) ? tgt - cur : null;
      return '<div class="gr-devrow"><div style="font-weight:700">' + esc(s) + '</div><div class="gr-devtrack"><div class="cur" style="width:' + cw + '%"></div><div class="tgt" style="width:' + tw + '%"></div></div>'
        + '<div class="gr-row-inline">' + inp('profile.currents.' + s, { type: 'number', cls: 'w52', rerender: true }) + inp('profile.targets.' + s, { type: 'number', cls: 'w52', rerender: true })
        + '<span class="gap">' + (gap != null ? (gap > 0 ? '+' : '') + gap : '') + '</span></div></div>';
    }).join('');
    var devHead = '<div class="gr-devrow head"><div></div><div class="sc"><span>35</span><span>55</span><span>75</span></div><div class="gr-row-inline"><span style="width:52px;text-align:center">現在</span><span style="width:52px;text-align:center">目標</span><span class="gap">差</span></div></div>';
    var devCard = '<div class="gr-legend"><span style="--c:#7fa3c9">現在の偏差値</span><span style="--c:var(--teal)">目標偏差値</span></div><div class="gr-devbars">' + (devRows ? devHead + devRows : '<div class="gr-muted">対象科目を追加してください</div>') + '</div>';

    var prio = (prof.priorities || []).map(function (r, i) {
      return '<div class="gr-prio" style="margin-bottom:8px"><span class="gr-num">' + (i + 1) + '</span><div>' + inp('profile.priorities.' + i + '.title', { ph: '数学の基礎力強化', style: 'font-weight:700;margin-bottom:4px' })
        + inp('profile.priorities.' + i + '.desc', { ph: '高2のうちに数IIIまでの基礎を完成' }) + '</div><button class="gr-x gr-noprint" title="削除" data-gr-act="row-del" data-path="profile.priorities" data-i="' + i + '">×</button></div>';
    }).join('');
    var prioCard = (prio || '<div class="gr-muted">まだありません</div>') + '<button class="gr-add gr-noprint" data-gr-act="row-add" data-path="profile.priorities" data-tpl="' + esc(JSON.stringify({ title: '', desc: '' })) + '">＋ 優先課題を追加</button>';

    var nowK = thisMonth();
    var ms = p.stages.map(function (sg) {
      var now = sg.start && sg.end && nowK >= sg.start && nowK <= sg.end;
      return '<div class="gr-ms-row' + (now ? ' now' : '') + '"><div>' + esc(periodLabel(sg.start, sg.end)) + '</div><div>' + esc(sg.label) + (sg.note ? '<span class="gr-muted">　' + esc(sg.note) + '</span>' : '') + (now ? ' <span class="gr-pill mid">いまここ</span>' : '') + '</div></div>';
    }).join('');
    var msCard = '<div class="gr-ms-list">' + (ms || '<div class="gr-muted">段階が未設定です</div>') + '</div><button class="gr-link gr-noprint" style="margin-top:8px" data-gr-act="goto" data-page="groad" data-tab="materials">「教材・年間計画」で編集 →</button>';

    var swCard = '<div class="gr-grid gr-grid-2" style="margin-bottom:0"><div><div class="gr-flabel">👍 得意分野（優先維持）</div>' + listEditor('profile.strengths', { ph: '化学の理論分野' }) + '</div>'
      + '<div><div class="gr-flabel" style="color:#b0412a">⚠ 不得意分野（重点強化）</div>' + listEditor('profile.weaknesses', { ph: '物理の力学・波動' }) + '</div></div>';

    return '<div class="gr-grid gr-grid-3">' + card('基本情報', basic) + card('志望校の入試情報（配点）', examInfo) + card('現在の学力と目標偏差値', devCard) + '</div>'
      + '<div class="gr-grid gr-grid-2">' + card('合格に向けた優先課題', prioCard, { h: 'gold' }) + card('合格までのマイルストーン', msCard) + '</div>'
      + '<div class="gr-grid gr-grid-2">' + card('本人の目標・意気込み', ta('profile.goalText', { rows: 4, ph: '東京科学大学に合格して、将来は環境・エネルギー分野の研究をしたい。' })) + card('学習方針', listEditor('profile.policies', { marker: 'check', ph: '模試結果をもとに計画を柔軟に修正する' })) + '</div>'
      + '<div class="gr-grid gr-grid-21">' + card('現在の学習状況（模試結果）', mocksEditor(), { h: 'blue' }) + card('得意・不得意分野', swCard) + '</div>'
      + '<div class="gr-grid gr-grid-2">' + card('学習時間の実績（直近4週）', studyTimeChart()) + card('今後の課題と対策', tableEditor('profile.issues', [{ key: 'issue', label: '課題', w: '36%', ph: '数学の基礎定着' }, { key: 'action', label: '具体的な対策', type: 'textarea', ph: '教科書の例題を完璧にし、基礎問題集を2周する' }], { tpl: { issue: '', action: '' } })) + '</div>'
      + card('講師メモ（入塾時の特記事項・申し送り）', ta('profile.memo', { rows: 3, ph: '入塾時の特記事項や学習上の課題、家庭との共有事項など' }) + '<div class="gr-note">「生徒登録」の講師メモを作成時に取り込みます。ここで書き換えた内容はロードマップにだけ残ります。</div>')
      + (document.getElementById('page-roadmap') ? '<div class="gr-noprint" style="text-align:right;margin-top:-4px"><button class="gr-link" data-gr-act="legacy" title="置き換え前の画面です。偏差値ギャップ分析・AIによる戦略分析・参考書ルートを確認できます">以前のロードマップ画面（AI戦略分析・参考書ルート）を開く</button></div>' : '');
  }
  function subjectChips() {
    var p = S.plan;
    var chips = p.subjects.map(function (s, i) { return '<span class="gr-subchip" style="background:' + subjectColor(s) + '">' + esc(s) + '<button class="gr-x gr-noprint" data-gr-act="subject-del" data-i="' + i + '" title="外す">×</button></span>'; }).join('');
    var addable = SUBJECT_ORDER.filter(function (s) { return p.subjects.indexOf(s) < 0; });
    return '<div class="gr-subjects">' + chips + '<select class="gr-in gr-noprint" style="width:auto" data-gr-change="subject-add"><option value="">＋ 科目を追加</option>'
      + addable.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') + '<option value="__custom">その他（入力する）</option></select></div>';
  }
  function mocksEditor() {
    var subs = planSubjects(), p = S.plan;
    var head = '<tr><th style="width:132px">実施月</th><th>模試名</th>' + subs.map(function (s) { return '<th class="num" style="width:60px">' + esc(s) + '</th>'; }).join('') + '<th style="width:54px">判定</th><th class="gr-noprint" style="width:28px"></th></tr>';
    var rows = p.mocks.map(function (mk, i) {
      return '<tr><td>' + inp('mocks.' + i + '.month', { type: 'month' }) + '</td><td class="name">' + inp('mocks.' + i + '.name', { ph: '全統記述模試' }) + '</td>'
        + subs.map(function (s) { return '<td>' + inp('mocks.' + i + '.devs.' + s, { type: 'number', min: 0, max: 100, step: 0.1 }) + '</td>'; }).join('')
        + '<td>' + inp('mocks.' + i + '.judge', { ph: 'C' }) + '</td><td class="gr-noprint"><button class="gr-x" title="削除" data-gr-act="row-del" data-path="mocks" data-i="' + i + '">×</button></td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="' + (subs.length + 4) + '" class="gr-muted" style="text-align:center;padding:12px">模試の偏差値を入力すると「到達度」タブに推移グラフが表示されます</td></tr>';
    // 科目が多いと欄が潰れて入力した数字が見えなくなるため、表に最小幅を持たせる（入りきらない分は横スクロール）
    var minW = 132 + 126 + subs.length * 62 + 54 + 28;
    return '<div class="gr-table-wrap"><table class="gr-table gr-mocks" style="min-width:' + minW + 'px">' + head + rows + '</table></div><button class="gr-add gr-noprint" data-gr-act="row-add" data-path="mocks" data-tpl="' + esc(JSON.stringify({ month: thisMonth(), name: '', devs: {}, judge: '' })) + '">＋ 模試結果を追加</button><div class="gr-note">数値は偏差値です。新しい結果は上に追加されます。</div>';
  }
  function studyTimeChart() {
    var p = S.plan, mon = mondayOf(today()), data = [];
    for (var i = 3; i >= 0; i--) {
      var w = addDays(mon, -7 * i), end = addDays(w, 6), wd = 0, we = 0;
      p.tasks.forEach(function (t) { if (t.date >= w && t.date <= end && isDone(t)) { var d = dowOf(t.date); if (d === 0 || d === 6) we += num(t.minutes) || 0; else wd += num(t.minutes) || 0; } });
      data.push({ w: w, wd: wd, we: we });
    }
    var max = Math.max(120, Math.max.apply(null, data.map(function (d) { return d.wd + d.we; })));
    if (!data.some(function (d) { return d.wd + d.we > 0; })) return '<div class="gr-empty" style="padding:1.8rem .5rem"><div class="gr-empty-icon">⏱️</div>課題が提出されると、提出済み課題の目安時間を週ごとに集計して表示します。</div>';
    var bars = data.map(function (d) {
      var h1 = d.wd / max * 100, h2 = d.we / max * 100, tot = d.wd + d.we;
      return '<div class="gr-hbar"><div class="v">' + (tot ? (Math.round(tot / 6) / 10) + 'h' : '') + '</div><div class="stack" style="height:' + (h1 + h2) + '%"><div class="wd" style="height:' + (h1 + h2 ? h1 / (h1 + h2) * 100 : 0) + '%"></div><div class="we" style="height:' + (h1 + h2 ? h2 / (h1 + h2) * 100 : 0) + '%"></div></div></div>';
    }).join('');
    var labels = data.map(function (d) { return '<div>' + mdLabel(d.w) + '〜</div>'; }).join('');
    var sumWd = data.reduce(function (a, d) { return a + d.wd; }, 0), sumWe = data.reduce(function (a, d) { return a + d.we; }, 0);
    return '<div class="gr-legend"><span style="--c:#7fa3c9">平日</span><span style="--c:#6fb39a">休日</span></div><div class="gr-hbars">' + bars + '</div><div class="gr-hbar-l">' + labels + '</div>'
      + '<div class="gr-summary" style="margin-top:10px"><div>平日平均<b>' + (Math.round(sumWd / 20 / 6) / 10) + '</b>時間/日</div><div>休日平均<b>' + (Math.round(sumWe / 8 / 6) / 10) + '</b>時間/日</div></div>'
      + '<div class="gr-note">提出済み・採点済みの課題の「目安時間」から集計しています（実際の学習時間とは異なる場合があります）。</div>';
  }

  /* ============================================================
   * ② 教材・年間計画
   * ============================================================ */
  function viewMaterials() {
    var p = S.plan, subs = planSubjects(), f = S.matFilter;
    var toolbar = '<div class="gr-toolbar gr-noprint"><button class="btn btn-primary gr-btn-sm" data-gr-act="mat-new">＋ 教材を追加</button>'
      + '<select class="gr-in" style="width:auto" data-gr-change="mat-filter"><option value="">すべての科目</option>' + subs.map(function (s) { return '<option' + (s === f ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>'
      + '<span class="gr-spacer"></span><span class="gr-muted">行をクリックすると、目的・範囲・期間・到達条件を編集できます</span></div>';
    var mats = sortedMaterials().filter(function (m) { return !f || m.subject === f; });
    var rows = mats.map(function (m) {
      var st = matStats(m), per = matPerDay(m);
      var rng = m.range || autoRange(m), u = unitOf(m);
      return '<tr class="gr-row-click" data-gr-act="mat-edit" data-id="' + esc(m.id) + '"><td><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(m.subject) + '"></span>' + esc(m.subject || '—') + '</div></td>'
        + '<td><b>' + esc(m.name) + '</b>' + bookLink(m) + prioPill(m.priority) + (m.prereq ? '<div class="gr-muted">前提：' + esc(m.prereq) + '</div>' : '') + '</td>'
        + '<td>' + esc(m.purpose || '—') + '</td>'
        + '<td>' + esc(rng || '—') + '<div class="gr-muted">' + (num(m.count) ? m.count + esc(u) + ' × ' + (m.rounds || 1) + '周' + (m.pattern === 'redo' ? '（解き直し型）' : '') : '問題数未設定') + '</div></td>'
        + '<td style="white-space:nowrap">' + (m.start && m.end ? mdLabel(m.start) + '〜' + mdLabel(m.end) : '—') + '<div class="gr-muted">' + (per ? '1日 約' + (Math.round(per * 10) / 10) + esc(u) : '') + '</div></td>'
        + '<td>' + esc(m.criteria || '—') + (num(m.passPct) ? '<div class="gr-muted">基準 正答率' + m.passPct + '%</div>' : '') + '</td>'
        + '<td style="min-width:120px">' + progCell(st, u) + '</td>'
        + '<td>' + matStatusPill(m.status) + (m.teacher ? '<div class="gr-muted">' + esc(m.teacher) + '</div>' : '') + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="8" class="gr-muted" style="text-align:center;padding:18px;line-height:1.8">' + (f ? 'この科目の教材はまだありません。' : '教材がまだ登録されていません。<br>「＋ 教材を追加」から、教材名・使う目的・範囲・期間・到達基準をセットで登録してください。') + '</td></tr>';
    var matCard = toolbar + '<div class="gr-table-wrap"><table class="gr-table"><tr><th>科目</th><th>教材</th><th>目的</th><th>範囲・問題数</th><th>期間</th><th>到達基準</th><th>進捗</th><th>状態</th></tr>' + rows + '</table></div>'
      + '<div class="gr-note">「終わった」と「できる」を分けて管理します。進捗は提出済みの課題から、到達度は採点の正答率から自動で集計されます。予定比は前日までの課題で判定します（今日の課題は提出した時点で加わります）。</div>';

    var nowK = thisMonth();
    var stagesVis = '<div class="gr-stages">' + p.stages.map(function (sg) {
      var now = sg.start && sg.end && nowK >= sg.start && nowK <= sg.end;
      return '<div class="gr-stage' + (now ? ' now' : '') + '" style="background:' + esc(sg.color || '#e3efe9') + '"><div class="p">' + esc(periodShort(sg.start, sg.end)) + '</div><div class="l">' + esc(sg.label || '（名称未設定）') + '</div></div>';
    }).join('') + '</div>';
    var stagesEd = '<details class="gr-noprint" style="margin-top:12px"' + (p.stages.length ? '' : ' open') + '><summary style="cursor:pointer;font-size:12.5px;color:var(--teal)">段階を編集する</summary><div style="margin-top:8px">'
      + tableEditor('stages', [{ key: 'label', label: '段階', w: '24%', ph: '基礎理解' }, { key: 'start', label: '開始月', type: 'month', w: '150px', rerender: true }, { key: 'end', label: '終了月', type: 'month', w: '150px', rerender: true }, { key: 'note', label: '狙い・メモ', ph: '公式の背景理解と典型問題の習得' }], { tpl: { label: '', start: thisMonth(), end: thisMonth(), note: '' }, addLabel: '＋ 段階を追加' })
      + '<button class="gr-link" data-gr-act="stages-auto">入試時期から自動で作り直す</button></div></details>';

    return card('教材・学習目的・到達条件', matCard)
      + card('年間マイルストーン', stagesVis + stagesEd + '<div class="gr-note">計画を変更したときは、下の「計画変更履歴」に変更前・変更後・理由・承認者が残ります（教材の期間・量・到達基準を変えると自動で記録）。</div>', { h: 'blue' })
      + card('年間タイムライン', gantt() + '<div class="gr-note">赤い線が今日です。教材のバーは期間、上段は学習段階、模試・節目は下の表で追加できます。</div>')
      + card('模試・節目', tableEditor('events', [{ key: 'date', label: '月', type: 'month', w: '170px', rerender: true }, { key: 'label', label: '内容', ph: '全統記述模試' }, { key: 'kind', label: '種類', type: 'select', options: EVENT_KINDS, w: '110px' }], { tpl: { date: thisMonth(), label: '', kind: '模試' }, addLabel: '＋ 模試・節目を追加' }))
      + card('計画変更履歴', historyTable(), { right: '<button class="btn btn-secondary gr-btn-xs gr-noprint" data-gr-act="hist-new">＋ 変更を記録</button>' });
  }
  function gantt() {
    var p = S.plan, exam = examMonthOf(S.student);
    var starts = [thisMonth()], ends = [exam];
    p.stages.forEach(function (s) { if (s.start) starts.push(s.start); if (s.end) ends.push(s.end); });
    p.materials.forEach(function (m) { if (m.start) starts.push(m.start.slice(0, 7)); if (m.end) ends.push(m.end.slice(0, 7)); });
    p.events.forEach(function (e) { if (e.date) { starts.push(e.date.slice(0, 7)); ends.push(e.date.slice(0, 7)); } });
    var from = starts.sort()[0], to = ends.sort()[ends.length - 1];
    var months = monthsRange(from, to);
    if (months.length > 24) { var ci = Math.max(0, months.indexOf(thisMonth()) - 2); months = months.slice(ci, ci + 24); }
    var N = months.length;
    if (!N) return '<div class="gr-muted">期間が設定されていません</div>';
    function pos(ds, isEnd) {
      var k = ds.slice(0, 7), i = months.indexOf(k);
      if (i < 0) return k < months[0] ? 0 : N;
      var dim = daysInMonth(k), day = ds.length > 7 ? +ds.slice(8, 10) : (isEnd ? dim : 1);
      return i + (isEnd ? day / dim : (day - 1) / dim);
    }
    function bar(a, b, cls, bg, text, title) {
      if (b <= 0 || a >= N) return '';
      var l = a / N * 100, w = Math.max(0.9, (b - a) / N * 100);
      return '<div class="gr-g-bar ' + cls + '" style="left:' + l + '%;width:' + w + '%;background:' + bg + '" title="' + esc(title || text) + '">' + esc(text) + '</div>';
    }
    var cols = 'grid-template-columns:repeat(' + N + ',1fr)';
    var head = '<div class="gr-g-head"><div class="gr-g-label">項目</div><div class="gr-g-months" style="' + cols + '">' + months.map(function (k, i) { return '<div' + ((i === 0 || k.slice(5) === '01') ? ' style="font-weight:700"' : '') + '>' + ((i === 0 || k.slice(5) === '01') ? k.slice(2, 4) + '年' : '') + (+k.slice(5)) + '月</div>'; }).join('') + '</div></div>';
    var gl = months.map(function (k, i) { return i ? '<div class="gl" style="left:' + (i / N * 100) + '%"></div>' : ''; }).join('');
    var tp = pos(today(), false), tl = (tp > 0 && tp < N) ? '<div class="gr-g-today" style="left:' + (tp / N * 100) + '%" title="今日"></div>' : '';
    var rows = '<div class="gr-g-row"><div class="gr-g-label"><b>学習段階</b></div><div class="gr-g-track">' + gl + tl + p.stages.map(function (s) {
      return (s.start && s.end) ? bar(pos(s.start, false), pos(s.end, true), 'stage', s.color || '#e3efe9', s.label || '', s.label + '：' + periodLabel(s.start, s.end)) : '';
    }).join('') + '</div></div>';
    var evs = p.events.filter(function (e) { return e.date; }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (evs.length) {
      // 模試・節目の名前は、隣の節目と重ならない範囲で横に伸ばし、入りきらなければ2段目に置く（それでも足りなければ「…」で省略）
      var trackEl = document.querySelector('.gr-gantt .gr-g-track'), pxPerUnit = ((trackEl && trackEl.clientWidth) || 900) / N;
      var lanes = [[], []], evHtml = '';
      function free(lane, a, b) { return !lanes[lane].some(function (iv) { return a < iv[1] && b > iv[0]; }); }
      function clip(lane, x, w, toLeft) {
        var lim = toLeft ? 0 : N;
        lanes[lane].forEach(function (iv) { if (toLeft) { if (iv[1] <= x + 0.001) lim = Math.max(lim, iv[1]); } else { if (iv[0] >= x - 0.001) lim = Math.min(lim, iv[0]); } });
        return Math.max(0.6, Math.min(w, (toLeft ? x - lim : lim - x) - 0.08));
      }
      evs.forEach(function (e) {
        var x = pos(e.date.slice(0, 7) + '-15', false); if (x <= 0 || x >= N) return;
        var text = e.label || e.kind, w = Math.min(N * 0.6, (text.length * 10.5 + 26) / pxPerUnit);
        var toLeft = x + w > N && x - w >= 0;
        var a = toLeft ? x - w : x, b = toLeft ? x : x + w;
        var lane = free(0, a, b) ? 0 : free(1, a, b) ? 1 : (free(0, toLeft ? x - 0.6 : x, toLeft ? x : x + 0.6) ? 0 : 1);
        w = clip(lane, x, w, toLeft);
        lanes[lane].push(toLeft ? [x - w, x] : [x, x + w]);
        var pos$ = toLeft ? 'right:' + ((N - x) / N * 100) + '%;' : 'left:' + (x / N * 100) + '%;';
        evHtml += '<i class="gr-g-evdot' + (lane ? ' l1' : '') + '" style="left:' + (x / N * 100) + '%"></i>'
          + '<div class="gr-g-ev' + (lane ? ' l1' : '') + (toLeft ? ' tl' : '') + '" style="' + pos$ + 'max-width:' + (w / N * 100) + '%;' + (e.kind === '模試' ? '' : 'background:var(--teal)') + '" title="' + esc(e.kind + '：' + e.label) + '">' + esc(text) + '</div>';
      });
      rows += '<div class="gr-g-row"><div class="gr-g-label"><b>模試・節目</b></div><div class="gr-g-track"' + (lanes[1].length ? ' style="min-height:54px"' : '') + '>' + gl + tl + evHtml + '</div></div>';
    }
    planSubjects().concat(['']).forEach(function (sub) {
      var ms = sortedMaterials().filter(function (m) { return (m.subject || '') === sub && m.start && m.end; });
      if (!ms.length) return;
      rows += '<div class="gr-g-group"><span class="gr-dot" style="background:' + subjectColor(sub) + '"></span>' + esc(sub || '科目未設定') + '</div>';
      ms.forEach(function (m) {
        rows += '<div class="gr-g-row"><div class="gr-g-label" title="' + esc(m.name) + '"><span class="t">' + esc(m.name) + '</span></div><div class="gr-g-track">' + gl + tl
          + bar(pos(m.start, false), pos(m.end, true), '', subjectColor(sub), m.purpose || m.name, m.name + '：' + mdLabel(m.start) + '〜' + mdLabel(m.end)) + '</div></div>';
      });
    });
    return '<div class="gr-table-wrap"><div class="gr-gantt">' + head + rows + '</div></div>';
  }
  function historyTable() {
    var h = S.plan.history;
    if (!h.length) return '<div class="gr-muted" style="padding:6px 0">まだ記録はありません</div>';
    return '<div class="gr-table-wrap"><table class="gr-table"><tr><th>日時</th><th>対象</th><th>変更前</th><th>変更後</th><th>理由</th><th>承認者</th></tr>' + h.slice(0, 50).map(function (r) {
      return '<tr><td style="white-space:nowrap">' + esc(fmtDT(r.at)) + (r.by ? '<div class="gr-muted">' + esc(r.by.split('@')[0]) + '</div>' : '') + '</td><td>' + esc(r.target) + '</td><td>' + esc(r.before || '—') + '</td><td>' + esc(r.after || '—') + '</td><td>' + esc(r.reason || '—') + '</td><td>' + esc(r.approver || '—') + '</td></tr>';
    }).join('') + '</table></div>' + (h.length > 50 ? '<div class="gr-note">最新50件を表示しています</div>' : '');
  }

  /* ============================================================
   * ③ 月間ロードマップ
   * ============================================================ */
  function monthStats(m, from, to) {
    var planned = 0;
    alloc(m).forEach(function (s) { if (s.date >= from && s.date <= to) planned += s.units; });
    var done = 0, cor = 0, tot = 0, n = 0, sub = 0;
    S.plan.tasks.forEach(function (t) {
      if (t.materialId !== m.id || t.date < from || t.date > to) return;
      n++; if (isDone(t)) { sub++; done += num(t.units) || 0; }
      if (t.status === 'graded' && num(t.total) > 0) { cor += num(t.correct) || 0; tot += num(t.total); }
    });
    return { planned: planned, done: done, rate: planned ? Math.round(Math.min(done, planned) / planned * 100) : null, acc: tot ? Math.round(cor / tot * 100) : null, n: n, sub: sub, pass: num(m.passPct) || 80 };
  }
  function autoGoal(m, from, to) {
    var slots = alloc(m).filter(function (s) { return s.date >= from && s.date <= to; });
    if (!slots.length) return '';
    var q = slots.filter(function (s) { return s.kind === 'study'; }).reduce(function (a, s) { return a + (s.qty || 0); }, 0);
    var checks = slots.filter(function (s) { return s.kind === 'check'; }).length;
    return '新規' + q + unitOf(m) + (m.pattern === 'redo' ? '＋翌日の解き直し' : '') + (checks ? '・確認問題' + checks + '回' : '');
  }
  function viewMonthly() {
    var p = S.plan, M = S.month || (S.month = thisMonth());
    var from = M + '-01', to = lastDayOfMonth(M), mo = p.months[M] || {};
    var mats = sortedMaterials().filter(function (m) { return m.start && m.end && m.start <= to && m.end >= from; });
    var sg = stageAt(M), evs = p.events.filter(function (e) { return e.date && e.date.slice(0, 7) === M; });
    var toolbar = '<div class="gr-toolbar gr-noprint"><button class="btn btn-secondary gr-btn-xs" data-gr-act="month-prev">◀</button><span class="gr-nav-label">' + monthLabel(M) + '</span><button class="btn btn-secondary gr-btn-xs" data-gr-act="month-next">▶</button>'
      + '<button class="gr-link" data-gr-act="month-today">今月</button><span class="gr-spacer"></span><span class="gr-muted">範囲は教材の期間・問題数・周回から自動計算。目標と評価方法は月ごとに上書きできます</span></div>';
    var rows = mats.map(function (m) {
      var r = (mo.rows && mo.rows[m.id]) || {}, base = 'months.' + M + '.rows.' + m.id + '.';
      var auto = rangeSummary(m, from, to), ms = monthStats(m, from, to);
      return '<tr><td style="min-width:150px"><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(m.subject) + '"></span>' + esc(m.subject) + '</div><div style="margin-top:4px;font-weight:700">' + esc(m.name) + '</div>' + (m.purpose ? '<div class="gr-muted">' + esc(m.purpose) + '</div>' : '') + '</td>'
        + '<td style="min-width:200px"><div class="gr-muted">今月の範囲（自動）</div><div style="margin-bottom:6px">' + esc(auto || '（この月の割り振りはありません）') + '</div><div class="gr-muted">進捗目標</div>' + inp(base + 'goal', { ph: autoGoal(m, from, to) || '例：指定例題を2周', isDefault: !!autoGoal(m, from, to) }) + '</td>'
        + '<td style="min-width:200px"><div class="gr-muted">到達目標</div>' + inp(base + 'target', { ph: m.criteria || '例：初見類題で80%以上', isDefault: !!m.criteria }) + '<div class="gr-muted" style="margin-top:6px">評価方法</div>' + inp(base + 'evalMethod', { ph: m.evalMethod || '例：初見類題10題', isDefault: !!m.evalMethod }) + '</td>'
        + '<td style="min-width:140px">' + monthResultCell(ms, unitOf(m)) + '</td>'
        + '<td style="min-width:210px">' + judgeCell(M, m, r) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="5" class="gr-muted" style="text-align:center;padding:18px">この月に取り組む教材がありません。「教材・年間計画」で教材の期間を設定してください。</td></tr>';
    var right = (sg ? '<span class="gr-pill" style="background:' + esc(sg.color || '#eee') + '">段階：' + esc(sg.label) + '</span>' : '') + evs.map(function (e) { return ' <span class="gr-pill mid">' + esc(e.kind) + '：' + esc(e.label) + '</span>'; }).join('');
    var tableCard = toolbar + '<div class="gr-table-wrap"><table class="gr-table"><tr><th>科目・教材</th><th>今月の範囲・進捗目標</th><th>到達目標・評価方法</th><th>実績（自動）</th><th>月末判定</th></tr>' + rows + '</table></div>'
      + '<div class="gr-callout"><b>月末判定ルール</b>　基準達成 → 次の単元へ ／ 未達 → 原因を分類（知識不足・解法の選択・計算ミス・時間不足など）し、復習を優先して翌月の課題量を調整します。予定の変更は理由とともに履歴に残します。</div>';
    return card(monthLabel(M) + '｜科目別の目標', tableCard, { right: right })
      + card(monthLabel(M) + '｜週ごとの範囲・目標', weeklyGoalsTable(M, mats), { h: 'blue' })
      + '<div class="gr-grid gr-grid-2">'
      + card('月次サマリー（学習状況のご報告用）', '<div class="gr-field"><label>今月できるようになったこと</label>' + ta('months.' + M + '.can', { rows: 3, ph: '英文法の時制を根拠つきで判断できるようになり、確認テスト正答率が改善。' }) + '</div><div class="gr-field" style="margin-bottom:0"><label>次月の重点</label>' + ta('months.' + M + '.next', { rows: 3, ph: '数学：初見類題への対応／物理：図示と立式の反復／英語：長文読解への接続' }) + '</div>')
      + card('面談での説明例', ta('months.' + M + '.talk', { rows: 7, ph: '英文法は判断力が改善。一方、物理は図示から立式する過程に課題が残るため、翌月は問題数より説明の再現性を重視します。' }), { h: 'blue' })
      + '</div>';
  }
  // 教材×週の表：各マスに「その週の範囲（自動）」と週間目標の入力欄
  function weeklyGoalsTable(M, mats) {
    var weeks = weeksOfMonth(M), from = M + '-01', to = lastDayOfMonth(M), t0 = today(), mon0 = mondayOf(t0);
    if (!mats.length) return '<div class="gr-muted" style="padding:6px 0">この月に取り組む教材がありません。</div>';
    var head = '<tr><th style="min-width:170px">科目・教材</th>' + weeks.map(function (mon, i) {
      var sun = addDays(mon, 6), out = (mon < from ? mdLabel(from) : mdLabel(mon)) + '〜' + (sun > to ? mdLabel(to) : mdLabel(sun));
      return '<th style="min-width:150px">第' + (i + 1) + '週' + (mon === mon0 ? ' <span class="gr-pill mid">今週</span>' : '') + '<div class="gr-muted" style="font-weight:400">' + mdw(mon) + '〜' + mdw(sun) + (mon < from || sun > to ? '<br><span style="font-size:10.5px">（この月は' + out + '）</span>' : '') + '</div></th>';
    }).join('') + '</tr>';
    var body = mats.map(function (m) {
      return '<tr><td><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(m.subject) + '"></span>' + esc(m.subject) + '</div><div style="margin-top:3px;font-weight:700">' + esc(m.name) + '</div><div class="gr-muted">' + esc(rangeSummary(m, from, to) || '') + '</div></td>'
        + weeks.map(function (mon) {
          var sun = addDays(mon, 6);
          if (!(m.start && m.end && m.start <= sun && m.end >= mon)) return '<td class="gr-muted" style="text-align:center">—</td>';
          var auto = weekAutoRange(m, mon);
          return '<td><div class="gr-muted" style="margin-bottom:4px">' + esc(auto || '（この週の割り振りはありません）') + '</div>' + inp('weeks.' + mon + '.goals.' + m.id, { ph: auto || '例：例題1〜13', isDefault: !!auto }) + '</td>';
        }).join('') + '</tr>';
    }).join('');
    return '<div class="gr-table-wrap"><table class="gr-table gr-weeks">' + head + body + '</table></div>'
      + '<div class="gr-note">上の段は教材の期間・問題数・周回から自動で計算した週の範囲、下の欄は週間目標です（空欄のままなら自動の範囲が目標になります）。同じ週間目標は「週間・毎日課題」の週間学習計画と配信用テキストにも表示されます。左の教材名の下は今月の範囲です。</div>';
  }
  function monthResultCell(ms, unit) {
    if (!ms.n && !ms.planned) return '<span class="gr-muted">—</span>';
    return '<div class="gr-muted">完了（今月の予定比）</div>' + progBar(ms.rate || 0, null) + '<div style="font-size:12px;margin:3px 0 6px">' + (ms.rate != null ? ms.rate + '%' : '—') + ' <span class="gr-muted">' + ms.done + '/' + ms.planned + esc(unit || '題') + '</span></div>'
      + '<div class="gr-muted">正答率</div><div style="font-size:12px">' + (ms.acc != null ? ms.acc + '% ' + (ms.acc >= ms.pass ? '<span class="gr-lv l4">基準達成</span>' : '<span class="gr-muted">（基準' + ms.pass + '%）</span>') : '<span class="gr-muted">採点データなし</span>') + '</div>';
  }
  function judgeCell(M, m, r) {
    var base = 'months.' + M + '.rows.' + m.id + '.';
    var out = sel(base + 'judge', [['', '— 判定 —'], ['達成', '達成 → 次の単元へ'], ['未達', '未達 → 復習を優先']], { rerender: true });
    if (r.judge === '未達') {
      out += '<div class="gr-muted" style="margin-top:6px">未達の原因</div>' + sel(base + 'cause', [['', '— 選択 —']].concat(CAUSES.map(function (c) { return [c, c]; })))
        + '<div class="gr-muted" style="margin-top:6px">翌月への変更</div>' + inp(base + 'change', { ph: '例：毎日2題＋図示と説明を追加' })
        + '<button class="gr-link gr-noprint" data-gr-act="judge-log" data-month="' + M + '" data-id="' + esc(m.id) + '">' + (r.logged ? '✓ 履歴に記録済み（もう一度記録）' : '変更を履歴に記録') + '</button>';
    }
    return out;
  }

  /* ============================================================
   * ④ 到達度（進捗と理解度・模試・月次サマリー）
   * ============================================================ */
  var _chart = null;
  function viewProgress() {
    var p = S.plan, subs = planSubjects(), t0 = today();
    var openRev = p.reviews.filter(function (r) { return r.status !== 'done'; }).length;
    var mon = mondayOf(t0), sun = addDays(mon, 6), wk = p.tasks.filter(function (t) { return t.date >= mon && t.date <= sun; });
    var g = p.tasks.filter(function (t) { return t.status === 'graded' && num(t.total) > 0; });
    var gc = g.reduce(function (a, t) { return a + (num(t.correct) || 0); }, 0), gt = g.reduce(function (a, t) { return a + num(t.total); }, 0);
    var summary = '<div class="gr-summary"><div>教材<b>' + p.materials.length + '</b>冊</div><div>今週の課題<b>' + wk.length + '</b>件（提出<b>' + wk.filter(isDone).length + '</b>）</div><div>未完了の復習<b>' + openRev + '</b>件</div><div>全体の正答率<b>' + (gt ? Math.round(gc / gt * 100) : '—') + '</b>' + (gt ? '%' : '') + '</div></div>';
    var rows = subs.map(function (s) {
      var st = subjectStats(s, t0);
      return '<tr><td><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(s) + '"></span>' + esc(s) + '</div></td>'
        + '<td style="min-width:220px">' + (st.prog != null ? progBar(st.prog, st.plannedPct) + '<div class="gr-muted" style="margin-top:3px">完了' + st.prog + '%（予定' + st.plannedPct + '%）</div>' : '<span class="gr-muted">教材の問題数・期間が未設定</span>') + '</td>'
        + '<td>' + lvBadge(st.lv) + '</td><td class="num">' + (st.acc != null ? st.acc + '%' : '—') + '<div class="gr-muted">基準' + st.pass + '%</div></td>'
        + '<td class="num">' + (st.subRate != null ? st.subRate + '%' : '—') + '<div class="gr-muted">' + st.sub + '/' + st.due + '件</div></td></tr>';
    }).join('');
    var subjCard = summary + '<div class="gr-table-wrap"><table class="gr-table"><tr><th>科目</th><th>進捗（完了率）</th><th>理解度</th><th class="num">正答率</th><th class="num">提出率（直近4週）</th></tr>' + rows + '</table></div>'
      + '<div class="gr-note">進捗率と到達度は別の指標です。100%完了でも正答率が基準に届かない教材は、復習キューと翌月の計画で補強します。理解度は正答率と教材の到達基準から自動判定します（Lv.4＝基準到達／Lv.3＝基準まで15pt以内／Lv.2＝50%以上／Lv.1＝50%未満）。予定と提出率は前日までの課題で判定し、今日の課題は提出した時点で加わります。</div>';
    var mrows = sortedMaterials().map(function (m) {
      var st = matStats(m, t0);
      return '<tr class="gr-row-click" data-gr-act="mat-edit" data-id="' + esc(m.id) + '"><td><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(m.subject) + '"></span>' + esc(m.subject) + '</div></td><td><b>' + esc(m.name) + '</b><div class="gr-muted">' + (m.start && m.end ? mdLabel(m.start) + '〜' + mdLabel(m.end) : '期間未設定') + '</div></td>'
        + '<td style="min-width:150px">' + progCell(st, unitOf(m)) + '</td><td class="num">' + (st.acc != null ? st.acc + '%' : '—') + '<div class="gr-muted">基準' + st.pass + '%</div></td><td>' + lvBadge(st.lv) + '</td>'
        + '<td class="num">' + (st.openReviews ? '<b style="color:#b0412a">' + st.openReviews + '</b>件' : '0件') + '</td><td>' + matStatusPill(m.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="gr-muted" style="text-align:center;padding:14px">教材が登録されていません</td></tr>';
    var matCard = '<div class="gr-table-wrap"><table class="gr-table"><tr><th>科目</th><th>教材</th><th>完了率</th><th class="num">正答率</th><th>理解度</th><th class="num">未完了の復習</th><th>状態</th></tr>' + mrows + '</table></div>';
    var hasMock = p.mocks.some(function (mk) { return mk.month && Object.keys(mk.devs || {}).some(function (k) { return num(mk.devs[k]) != null; }); });
    var chartCard = hasMock ? '<div style="position:relative;height:240px"><canvas id="gr-mock-chart"></canvas></div>' : '<div class="gr-empty" style="padding:2rem .5rem"><div class="gr-empty-icon">📈</div>「合格戦略」タブの「現在の学習状況（模試結果）」に偏差値を入力すると、ここに推移が表示されます。</div>';
    var SM = S.sumMonth || (S.sumMonth = thisMonth());
    var sumCard = '<div class="gr-toolbar gr-noprint" style="margin-bottom:8px"><button class="btn btn-secondary gr-btn-xs" data-gr-act="sum-prev">◀</button><span class="gr-nav-label" style="font-size:14px">' + monthLabel(SM) + '</span><button class="btn btn-secondary gr-btn-xs" data-gr-act="sum-next">▶</button></div>'
      + '<div class="gr-field"><label>今月できるようになったこと</label>' + ta('months.' + SM + '.can', { rows: 3 }) + '</div><div class="gr-field" style="margin-bottom:0"><label>次月の重点</label>' + ta('months.' + SM + '.next', { rows: 3 }) + '</div>'
      + '<div class="gr-note">「月間ロードマップ」の月次サマリーと同じ内容です（どちらで編集しても反映されます）。</div>';
    return '<div class="gr-grid gr-grid-21">' + card('科目別の進捗と理解度', subjCard) + card('模試の推移', chartCard, { h: 'blue' }) + '</div>'
      + card('教材ごとの到達状況', matCard)
      + card('月次サマリーと次月の方針', sumCard);
  }
  function afterProgress() {
    if (_chart) { try { _chart.destroy(); } catch (e) { } _chart = null; }
    var cv = document.getElementById('gr-mock-chart');
    if (!cv || typeof Chart === 'undefined') return;
    var mocks = S.plan.mocks.filter(function (m) { return m.month; }).slice().sort(function (a, b) { return a.month < b.month ? -1 : a.month > b.month ? 1 : 0; });
    var subs = planSubjects().filter(function (s) { return mocks.some(function (m) { return num(m.devs && m.devs[s]) != null; }); });
    _chart = new Chart(cv.getContext('2d'), {
      type: 'line',
      data: {
        labels: mocks.map(function (m) { return monthShort(m.month) + (m.name ? ' ' + m.name : ''); }),
        datasets: subs.map(function (s) { var c = subjectColor(s); return { label: s, data: mocks.map(function (m) { return num(m.devs && m.devs[s]); }), borderColor: c, backgroundColor: c, tension: 0.25, spanGaps: true, pointRadius: 4, borderWidth: 2 }; })
      },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { y: { suggestedMin: 40, suggestedMax: 70, ticks: { font: { size: 11 } } }, x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } } } }
    });
  }
