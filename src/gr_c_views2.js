
  /* ============================================================
   * 課題（週・日）の共通処理
   * ============================================================ */
  function tasksOn(d) {
    return S.plan.tasks.filter(function (t) { return t.date === d; }).sort(function (a, b) {
      var ia = SUBJECT_ORDER.indexOf(a.subject), ib = SUBJECT_ORDER.indexOf(b.subject);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib || (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0);
    });
  }
  function reviewById(id) { return S.plan.reviews.filter(function (r) { return r.id === id; })[0]; }
  function shortName(n) { n = String(n || ''); return n.length > 15 ? n.slice(0, 14) + '…' : n; }
  function taskMaterialName(t) { var m = t.materialId ? matById(t.materialId) : null; return m ? m.name : (t.materialId ? '（削除された教材）' : ''); }
  function minutesText(n) { n = num(n) || 0; if (!n) return ''; return n >= 90 ? (Math.round(n / 6) / 10) + '時間' : n + '分'; }

  // 教材の割り振りから、その週の課題を作る（作成済み・着手済みの課題は残す）
  function genWeek(mon) {
    var p = S.plan, sun = addDays(mon, 6), created = 0, updated = 0, removed = 0, reviews = 0;
    p.materials.forEach(function (m) {
      if (m.status === '完了') return;
      var slots = alloc(m).filter(function (s) { return s.date >= mon && s.date <= sun; }), keys = {};
      slots.forEach(function (s) {
        keys[s.date + '|' + s.kind] = 1;
        if (p.skips.indexOf(m.id + '|' + s.date + '|' + s.kind) >= 0) return;
        var ex = p.tasks.filter(function (t) { return t.auto && t.materialId === m.id && (t.origDate || t.date) === s.date && t.kind === s.kind; })[0];
        if (ex) {
          if (ex.status === 'todo' && !ex.edited && (ex.content !== s.text || ex.units !== s.units)) { ex.content = s.text; ex.units = s.units; ex.qty = s.qty; ex.minutes = s.minutes; updated++; }
        } else {
          p.tasks.push({ id: uid('t'), date: s.date, subject: m.subject || '', materialId: m.id, kind: s.kind, content: s.text, minutes: s.minutes, units: s.units, qty: s.qty, auto: true, edited: false, status: 'todo' });
          created++;
        }
      });
      p.tasks = p.tasks.filter(function (t) {
        var d0 = t.origDate || t.date;
        if (t.auto && t.materialId === m.id && d0 >= mon && d0 <= sun && t.kind !== 'review' && !keys[d0 + '|' + t.kind] && t.status === 'todo' && !t.edited) { removed++; return false; }
        return true;
      });
    });
    var open = p.reviews.filter(function (r) { return r.status !== 'done' && !r.taskId; });
    if (open.length) {
      var bySub = {};
      open.forEach(function (r) { var k = r.subject || ''; (bySub[k] = bySub[k] || []).push(r); });
      Object.keys(bySub).forEach(function (k) { assignReviews(bySub[k], sun); reviews += bySub[k].length; });
    }
    return { created: created, updated: updated, removed: removed, reviews: reviews };
  }
  function assignReviews(list, date) {
    if (!list.length) return;
    var sub = list[0].subject || '';
    var t = S.plan.tasks.filter(function (x) { return x.kind === 'review' && x.date === date && (x.subject || '') === sub && x.status === 'todo'; })[0];
    if (!t) { t = { id: uid('t'), date: date, subject: sub, materialId: null, kind: 'review', content: '', minutes: 0, units: 0, qty: 0, auto: true, edited: false, status: 'todo', reviewIds: [] }; S.plan.tasks.push(t); }
    if (!t.reviewIds) t.reviewIds = [];
    list.forEach(function (r) { if (t.reviewIds.indexOf(r.id) < 0) t.reviewIds.push(r.id); r.taskId = t.id; });
    refreshReviewTask(t);
  }
  function refreshReviewTask(t) { refreshReviewTaskIn(S.plan, t); }
  function refreshReviewTaskIn(p, t) {
    var items = (t.reviewIds || []).map(function (id) { return p.reviews.filter(function (r) { return r.id === id; })[0]; }).filter(Boolean);
    t.content = '復習：' + items.map(function (r) { var m = r.materialId ? p.materials.filter(function (x) { return x.id === r.materialId; })[0] : null; return (m ? shortName(m.name) + ' ' : '') + r.item; }).join('、');
    t.minutes = round5(Math.max(15, items.length * 10));
    t.qty = items.length;
  }
  function unlinkReviewsOf(t) {
    (t.reviewIds || []).forEach(function (rid) { var r = reviewById(rid); if (r && r.taskId === t.id && r.status !== 'done') r.taskId = null; });
  }
  function moveUnfinished(mon) {
    var sat = addDays(mon, 5), limit = today() < sat ? today() : sat, n = 0;
    S.plan.tasks.forEach(function (t) {
      if (t.date >= mon && t.date < limit && (t.status === 'todo' || t.status === 'missing') && t.kind !== 'review') {
        t.origDate = t.origDate || t.date; t.date = sat; n++;
      }
    });
    return n;
  }
  function taskLine(t) { var mn = taskMaterialName(t); return (t.subject ? t.subject + '：' : '') + (mn ? mn + ' ' : '') + (t.content || '') + (num(t.minutes) ? '（目安' + t.minutes + '分）' : ''); }
  function copyText(txt) {
    function done(ok) { toast(ok ? 'コピーしました。LINEなどに貼り付けて送れます' : 'コピーできませんでした'); }
    function fallback() {
      var el = document.createElement('textarea'); el.value = txt; el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(el); el.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { } el.remove(); done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(function () { done(true); }, fallback); else fallback();
  }
  function weekGoalLines(mon) {
    return weekMaterials(mon).map(function (m) { var g = weekGoal(m, mon); return g ? (m.subject ? m.subject + '｜' : '') + m.name + '：' + g : ''; }).filter(Boolean);
  }
  function weekText(mon) {
    var lines = ['【' + S.student.name + 'さん　' + mdLabel(mon) + '〜' + mdLabel(addDays(mon, 6)) + 'の課題】'];
    var goals = weekGoalLines(mon);
    if (goals.length) { lines.push(''); lines.push('■今週の目標'); goals.forEach(function (g) { lines.push('・' + g); }); }
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), ts = tasksOn(d);
      lines.push(''); lines.push('■' + mdw(d) + (i === 5 ? '　予備日' : i === 6 ? '　復習日' : ''));
      if (!ts.length) lines.push(i === 5 ? '・平日の課題で終わっていないものに取り組みましょう' : '・課題なし');
      ts.forEach(function (t) { lines.push('・' + taskLine(t)); });
    }
    return lines.join('\n');
  }
  function dayText(d) {
    var ts = tasksOn(d), lines = ['【' + S.student.name + 'さん　' + jpDate(d) + 'の課題】'];
    if (!ts.length) lines.push('・課題なし');
    ts.forEach(function (t) { lines.push('・' + taskLine(t)); });
    return lines.join('\n');
  }
  function chip(t) {
    var mn = taskMaterialName(t);
    var head = mn ? shortName(mn) : (t.kind !== 'study' && t.kind !== 'other' ? TASK_KINDS[t.kind] : '');
    var st = t.status !== 'todo' ? TASK_STATUS[t.status] + (t.status === 'graded' && num(t.total) ? ' ' + (t.correct || 0) + '/' + t.total : '') : '';
    return '<div class="gr-chip st-' + esc(t.status) + ' k-' + esc(t.kind) + '" data-gr-act="task-edit" data-id="' + esc(t.id) + '" title="クリックで編集">'
      + (head ? '<span class="m">' + esc(head) + (t.origDate ? '（' + mdLabel(t.origDate) + 'から振替）' : '') + '</span>' : '')
      + '<span class="c">' + esc(t.content || '（内容未入力）') + '</span><span class="min">' + esc(minutesText(t.minutes)) + '</span><span class="s">' + esc(st) + '</span></div>';
  }

  /* ============================================================
   * ⑤ 週間学習計画
   * ============================================================ */
  function viewWeekly() {
    var p = S.plan, mon = S.week || (S.week = mondayOf(today())), sun = addDays(mon, 6), t0 = today();
    var tasks = p.tasks.filter(function (t) { return t.date >= mon && t.date <= sun; });
    var cols = planSubjects().slice();
    tasks.forEach(function (t) { var s = t.subject || 'その他'; if (cols.indexOf(s) < 0) cols.push(s); });
    var toolbar = '<div class="gr-toolbar gr-noprint"><button class="btn btn-secondary gr-btn-xs" data-gr-act="week-prev">◀</button><span class="gr-nav-label">' + mdw(mon) + '〜' + mdw(sun) + '</span><span class="gr-nav-sub">' + weekOfMonthLabel(mon) + '</span>'
      + '<button class="btn btn-secondary gr-btn-xs" data-gr-act="week-next">▶</button><button class="gr-link" data-gr-act="week-today">今週</button><span class="gr-spacer"></span>'
      + '<button class="btn btn-primary gr-btn-sm" data-gr-act="week-gen" title="教材の期間・問題数・周回から、この週の課題を作ります。作成済み・着手済みの課題はそのまま残ります">この週の課題を作成</button>'
      + '<button class="btn btn-secondary gr-btn-sm" data-gr-act="week-move" title="今日より前の未着手・未提出の課題を、その週の土曜（予備日）に移します">未完了を土曜へ振替</button>'
      + '<button class="btn btn-secondary gr-btn-sm" data-gr-act="week-copy">配信用テキストをコピー</button></div>';
    var mins = tasks.reduce(function (a, t) { return a + (num(t.minutes) || 0); }, 0);
    var summary = '<div class="gr-summary"><div>課題<b>' + tasks.length + '</b>件</div><div>提出<b>' + tasks.filter(isDone).length + '</b>件</div><div>採点<b>' + tasks.filter(function (t) { return t.status === 'graded'; }).length + '</b>件</div><div>目安合計<b>' + (Math.round(mins / 6) / 10) + '</b>時間</div></div>';
    var head = '<tr><th style="width:92px">曜日</th>' + cols.map(function (s) { return '<th><span class="gr-dot" style="background:' + subjectColor(s) + ';margin-right:5px"></span>' + esc(s) + '</th>'; }).join('') + '<th style="width:64px;text-align:right">合計</th></tr>';
    var body = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), dts = tasks.filter(function (t) { return t.date === d; });
      var cls = (i === 5 ? 'sat' : i === 6 ? 'sun' : '') + (d === t0 ? ' today' : '');
      body += '<tr class="' + cls + '"><td class="gr-day"><div class="d">' + DOW[dowOf(d)] + '　' + mdLabel(d) + '</div>' + (i === 5 ? '<span class="t">予備日</span>' : i === 6 ? '<span class="t sun">復習日</span>' : '') + (d === t0 ? ' <span class="gr-pill mid">今日</span>' : '') + '</td>';
      cols.forEach(function (s) {
        var ct = dts.filter(function (t) { return (t.subject || 'その他') === s; }).sort(function (a, b) { return (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0); });
        body += '<td>' + ct.map(chip).join('') + '<button class="gr-cell-add gr-noprint" data-gr-act="task-new" data-date="' + d + '" data-subject="' + esc(s === 'その他' ? '' : s) + '">＋</button></td>';
      });
      body += '<td class="gr-sum">' + esc(minutesText(dts.reduce(function (a, t) { return a + (num(t.minutes) || 0); }, 0))) + '</td></tr>';
    }
    var wms = weekMaterials(mon), M0 = mon.slice(0, 7);
    var goalsBox = '<div class="gr-wgoals"><div class="gr-wgoals-h">今週の範囲・目標<span class="gr-muted" style="font-weight:400;margin-left:8px">（「月間ロードマップ」の週ごとの目標と同じ欄です）</span>'
      + '<button class="gr-link gr-noprint" style="margin-left:auto" data-gr-act="goto-month" data-month="' + M0 + '">月間ロードマップで見る →</button></div>'
      + (wms.length ? '<div class="gr-wgoals-grid">' + wms.map(function (m) {
          var auto = weekAutoRange(m, mon);
          return '<div class="gr-wgoal"><div class="gr-wgoal-m"><span class="gr-dot" style="background:' + subjectColor(m.subject) + '"></span>' + esc(m.subject || '') + '｜' + esc(m.name) + '</div>' + inp('weeks.' + mon + '.goals.' + m.id, { ph: auto || '例：例題1〜13', isDefault: !!auto }) + '</div>';
        }).join('') + '</div>' : '<div class="gr-muted">この週に期間がかかる教材はありません。</div>') + '</div>';
    var empty = !tasks.length ? '<div class="gr-callout" style="margin-bottom:10px">この週の課題はまだありません。' + (p.materials.length ? '「この週の課題を作成」を押すと、教材の範囲から月〜金の課題を自動で作ります。' : '先に「合格ロードマップ」タブの「教材・年間計画」で教材（問題数・期間）を登録してください。') + '</div>' : '';
    return card(weekOfMonthLabel(mon) + '｜' + (cols.length ? cols.join('・') : '科目未設定'), toolbar + summary + goalsBox + empty
      + '<div class="gr-table-wrap"><table class="gr-week">' + head + body + '</table></div>'
      + '<div class="gr-callout blue">運用：月間目標 → 週間課題 → 毎日の配信。土曜は平日の予備日、日曜はその週の復習日です。採点で誤答を入力すると復習キューに追加され、「この週の課題を作成」で日曜の復習に割り当てられます。課題をクリックすると内容・日付・状態を変更できます。</div>');
  }

  /* ============================================================
   * ⑥ 毎日の課題・採点
   * ============================================================ */
  function viewDaily() {
    var d = S.day || (S.day = today()), ts = tasksOn(d), t0 = today();
    var selT = S.gradeTaskId ? taskById(S.gradeTaskId) : null;
    if (selT && selT.date !== d) selT = null;
    if (!selT) { selT = ts.filter(function (t) { return t.status === 'submitted'; })[0] || null; if (selT) S.gradeTaskId = selT.id; }
    var dw = dowOf(d);
    var toolbar = '<div class="gr-toolbar gr-noprint"><button class="btn btn-secondary gr-btn-xs" data-gr-act="day-prev">◀</button><span class="gr-nav-label">' + jpDate(d) + '</span>'
      + (dw === 6 ? '<span class="gr-pill">予備日</span>' : dw === 0 ? '<span class="gr-pill hi">復習日</span>' : '') + (d === t0 ? '<span class="gr-pill mid">今日</span>' : '')
      + '<button class="btn btn-secondary gr-btn-xs" data-gr-act="day-next">▶</button><button class="gr-link" data-gr-act="day-today">今日</button><span class="gr-spacer"></span>'
      + '<button class="btn btn-secondary gr-btn-sm" data-gr-act="task-new" data-date="' + d + '">＋ 課題を追加</button><button class="btn btn-secondary gr-btn-sm" data-gr-act="day-copy">配信用テキストをコピー</button></div>';
    var mins = ts.reduce(function (a, t) { return a + (num(t.minutes) || 0); }, 0);
    var summary = '<div class="gr-summary"><div>課題<b>' + ts.length + '</b>件</div><div>提出<b>' + ts.filter(isDone).length + '</b>/' + ts.length + '</div><div>採点<b>' + ts.filter(function (t) { return t.status === 'graded'; }).length + '</b>/' + ts.length + '</div><div>目安合計<b>' + mins + '</b>分</div></div>';
    var statusOpts = Object.keys(TASK_STATUS);
    var rows = ts.map(function (t) {
      var mn = taskMaterialName(t);
      return '<tr class="gr-row-click' + (selT && selT.id === t.id ? ' gr-row-sel' : '') + '" data-gr-act="grade-pick" data-id="' + esc(t.id) + '"><td><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(t.subject) + '"></span>' + esc(t.subject || (t.kind === 'review' ? '復習' : '—')) + '</div></td>'
        + '<td>' + (mn ? '<div class="gr-muted">' + esc(mn) + bookLink(t.materialId ? matById(t.materialId) : null) + '</div>' : '') + esc(t.content || '（内容未入力）') + (t.kind !== 'study' ? ' <span class="gr-pill">' + esc(TASK_KINDS[t.kind] || '') + '</span>' : '') + '</td>'
        + '<td class="num">' + esc(minutesText(t.minutes) || '—') + '</td>'
        + '<td><select class="gr-in" style="width:96px" data-gr-change="task-status" data-id="' + esc(t.id) + '">' + statusOpts.map(function (k) { return '<option value="' + k + '"' + (t.status === k ? ' selected' : '') + '>' + TASK_STATUS[k] + '</option>'; }).join('') + '</select></td>'
        + '<td class="num">' + (t.status === 'graded' && num(t.total) ? (t.correct || 0) + '/' + t.total : '<span class="gr-muted">—</span>') + '</td>'
        + '<td class="gr-noprint"><button class="gr-link" data-gr-act="task-edit" data-id="' + esc(t.id) + '">編集</button></td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="6" class="gr-muted" style="text-align:center;padding:16px;line-height:1.8">この日の課題はありません。<br>「週間・毎日課題」の「週間学習計画」で週の課題を作成するか、「＋ 課題を追加」から追加してください。</td></tr>';
    var left = card(jpDate(d) + '｜今日やること', toolbar + summary + '<div class="gr-table-wrap"><table class="gr-table"><tr><th>科目</th><th>学習内容</th><th class="num">目安</th><th>状態</th><th class="num">採点</th><th class="gr-noprint"></th></tr>' + rows + '</table></div>');
    return '<div class="gr-grid gr-grid-21">' + left + gradePanel(selT) + '</div>'
      + '<div class="gr-flow"><span><b>生徒</b>：答案を提出</span><span>→</span><span><b>講師</b>：採点・講評（誤答は復習キューへ）</span><span>→</span><span><b>塾長</b>：遅れ・弱点を「到達度」で確認</span></div>';
  }
  function gradePanel(t) {
    if (!t) return card('採点・フィードバック', '<div class="gr-empty" style="padding:1.5rem .5rem"><div class="gr-empty-icon">✍️</div>左の表で課題を選ぶと、正誤と講評を記録できます。<br>誤答した問題は復習キューに自動で追加されます。</div>', { h: 'blue' });
    var mn = taskMaterialName(t), tot = num(t.total), cor = num(t.correct);
    var defTotal = tot != null ? tot : (num(t.qty) || null);
    var body = '<div class="gr-grade-h">' + esc(t.subject || '') + (mn ? '｜' + esc(mn) + bookLink(t.materialId ? matById(t.materialId) : null) : '') + '</div><div class="gr-grade-sub">' + esc(t.content || '') + '　<span class="gr-st ' + esc(t.status) + '">' + esc(TASK_STATUS[t.status] || '') + '</span></div>'
      + '<div class="gr-field"><label>正解数／問題数</label><div class="gr-grade-score"><input class="gr-in num w60" id="gr-g-correct" type="number" min="0" value="' + (cor != null ? cor : '') + '">題 ／ <input class="gr-in num w60" id="gr-g-total" type="number" min="0" value="' + (defTotal != null ? defTotal : '') + '">題中　<b id="gr-g-rate"></b></div><div class="gr-bar thick"><i id="gr-g-bar" style="width:0%"></i></div></div>'
      + '<div class="gr-field"><label>誤答した問題（「、」や「,」で区切る）</label><input class="gr-in" id="gr-g-wrong" value="' + esc(t.wrong || '') + '" placeholder="例：例題6、例題9"></div>'
      + '<div class="gr-form" style="grid-template-columns:1fr 1fr;margin-bottom:10px"><div class="gr-field"><label>誤答の原因</label><select class="gr-in" id="gr-g-cause"><option value="">— 選択 —</option>' + CAUSES.map(function (c) { return '<option' + (c === t.cause ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>'
      + '<div class="gr-field" style="display:flex;align-items:flex-end"><label style="display:flex;gap:6px;align-items:center;color:var(--text);font-weight:400;margin:0 0 6px"><input type="checkbox" id="gr-g-addrev"' + (t.kind === 'review' ? '' : ' checked') + ' style="width:auto;margin:0">' + (t.kind === 'review' ? '（復習課題：全問正解で復習完了）' : '誤答を復習キューに追加') + '</label></div></div>'
      + '<div class="gr-field"><label>講師コメント</label><textarea class="gr-in" id="gr-g-comment" rows="3" placeholder="方針は適切。例題6は途中式の符号を見直し、明日もう一度自力で解こう。">' + esc(t.comment || '') + '</textarea></div>'
      + '<div class="gr-field"><label>次のアクション</label><input class="gr-in" id="gr-g-next" value="' + esc(t.nextAction || '') + '" placeholder="例：確認テストで再評価"></div>'
      + '<div class="gr-row-inline" style="justify-content:flex-end;gap:10px;margin-top:4px">' + (t.status === 'graded' ? '<button class="gr-link danger" data-gr-act="grade-clear" data-id="' + esc(t.id) + '">採点を取り消す</button>' : '') + '<button class="btn btn-primary gr-btn-sm" data-gr-act="grade-save" data-id="' + esc(t.id) + '">採点を保存</button></div>'
      + '<div class="gr-callout blue" style="margin-top:10px">' + (t.status === 'graded' ? '採点済み（' + esc(fmtDT(t.gradedAt)) + (t.gradedBy ? '・' + esc(t.gradedBy.split('@')[0]) : '') + '）。' : '') + '採点結果は「到達度」と「月間ロードマップ」の実績に自動で反映されます。</div>';
    return card('採点・フィードバック', body, { h: 'blue' });
  }
  function updateGradePreview() {
    var c = document.getElementById('gr-g-correct'), t = document.getElementById('gr-g-total');
    if (!c || !t) return;
    var cv = num(c.value), tv = num(t.value), r = (cv != null && tv) ? Math.round(clamp(cv / tv, 0, 1) * 100) : null;
    var rate = document.getElementById('gr-g-rate'), bar = document.getElementById('gr-g-bar');
    if (rate) rate.textContent = r != null ? '正答率 ' + r + '%' : '';
    if (bar) bar.style.width = (r || 0) + '%';
  }
  function fval(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function gradeSave(id) {
    var t = taskById(id); if (!t) return;
    var cor = num(fval('gr-g-correct')), tot = num(fval('gr-g-total'));
    if (tot == null || tot <= 0) { toast('問題数を入力してください'); return; }
    if (cor == null) cor = 0;
    if (cor < 0 || cor > tot) { toast('正解数は0〜問題数の範囲で入力してください'); return; }
    var items = fval('gr-g-wrong').split(/[,、，\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var addRev = document.getElementById('gr-g-addrev'); addRev = !!(addRev && addRev.checked);
    t.correct = cor; t.total = tot; t.wrong = items.join('、'); t.cause = fval('gr-g-cause'); t.comment = fval('gr-g-comment'); t.nextAction = fval('gr-g-next').trim();
    t.status = 'graded'; t.gradedAt = nowIso(); t.gradedBy = userEmail();
    if (!t.submittedAt) t.submittedAt = t.gradedAt;
    var added = 0, closed = 0;
    if (t.kind === 'review') {
      var allRight = cor >= tot;
      (t.reviewIds || []).forEach(function (rid) {
        var r = reviewById(rid); if (!r) return;
        var again = !allRight && (!items.length || items.some(function (it) { return it === r.item || r.item.indexOf(it) >= 0 || it.indexOf(r.item) >= 0; }));
        if (again) { r.taskId = null; r.attempts = (r.attempts || 0) + 1; } else if (r.status !== 'done') { r.status = 'done'; r.doneAt = today(); closed++; }
      });
    } else if (addRev && items.length) {
      items.forEach(function (it) {
        var dup = S.plan.reviews.some(function (r) { return r.status !== 'done' && r.item === it && (r.materialId || null) === (t.materialId || null) && (r.subject || '') === (t.subject || ''); });
        if (dup) return;
        S.plan.reviews.push({ id: uid('r'), subject: t.subject || '', materialId: t.materialId || null, item: it, cause: t.cause || '', fromTaskId: t.id, addedAt: today(), status: 'open', taskId: null });
        added++;
      });
    }
    touch(); rerender();
    toast('採点を保存しました' + (added ? '（復習キューに' + added + '件追加）' : '') + (closed ? '（復習' + closed + '件を完了）' : ''));
  }
  function gradeClear(id) {
    var t = taskById(id); if (!t) return;
    t.correct = null; t.total = null; t.wrong = ''; t.cause = ''; t.comment = ''; t.nextAction = ''; t.gradedAt = ''; t.gradedBy = '';
    t.status = t.submittedAt ? 'submitted' : 'todo';
    var before = S.plan.reviews.length;
    S.plan.reviews = S.plan.reviews.filter(function (r) { return !(r.fromTaskId === t.id && r.status !== 'done' && !r.taskId); });
    touch(); rerender();
    toast('採点を取り消しました' + (before !== S.plan.reviews.length ? '（未割当の復習を' + (before - S.plan.reviews.length) + '件削除）' : ''));
  }

  /* ============================================================
   * ⑦ 復習キュー
   * ============================================================ */
  function viewReviews() {
    var p = S.plan, f = S.reviewFilter || 'open';
    var nOpen = p.reviews.filter(function (r) { return r.status !== 'done'; }).length, nDone = p.reviews.length - nOpen;
    var list = p.reviews.filter(function (r) { return f === 'all' ? true : f === 'done' ? r.status === 'done' : r.status !== 'done'; })
      .slice().sort(function (a, b) { return (a.status === 'done') - (b.status === 'done') || String(b.addedAt).localeCompare(String(a.addedAt)); });
    var sun = addDays(mondayOf(today()), 6);
    var toolbar = '<div class="gr-toolbar gr-noprint"><div class="tabs" style="margin:0">'
      + [['open', '未完了 ' + nOpen], ['done', '完了 ' + nDone], ['all', 'すべて']].map(function (x) { return '<button class="tab' + (f === x[0] ? ' active' : '') + '" data-gr-act="rev-filter" data-f="' + x[0] + '">' + x[1] + '</button>'; }).join('')
      + '</div><span class="gr-spacer"></span><button class="btn btn-primary gr-btn-sm" data-gr-act="rev-assign-all">未割当を今週の日曜（' + mdLabel(sun) + '）に割り当て</button><button class="btn btn-secondary gr-btn-sm" data-gr-act="rev-new">＋ 復習を追加</button></div>';
    var rows = list.map(function (r) {
      var m = r.materialId ? matById(r.materialId) : null, src = r.fromTaskId ? taskById(r.fromTaskId) : null, as = r.taskId ? taskById(r.taskId) : null;
      var plan = r.status === 'done' ? '<span class="gr-st graded">完了 ' + esc(r.doneAt ? mdLabel(r.doneAt) : '') + '</span>' : as ? mdw(as.date) + ' <span class="gr-st ' + esc(as.status) + '">' + esc(TASK_STATUS[as.status]) + '</span>' : '<span class="gr-muted">未割当</span>';
      var ops = r.status === 'done'
        ? '<button class="gr-link" data-gr-act="rev-reopen" data-id="' + esc(r.id) + '">未完了に戻す</button><button class="gr-link danger" data-gr-act="rev-del" data-id="' + esc(r.id) + '">削除</button>'
        : '<button class="gr-link" data-gr-act="rev-today" data-id="' + esc(r.id) + '">今日に割当</button><button class="gr-link" data-gr-act="rev-sunday" data-id="' + esc(r.id) + '">日曜に割当</button><button class="gr-link" data-gr-act="rev-done" data-id="' + esc(r.id) + '">完了</button><button class="gr-link danger" data-gr-act="rev-del" data-id="' + esc(r.id) + '">削除</button>';
      return '<tr><td><div class="gr-sub-cell"><span class="gr-dot" style="background:' + subjectColor(r.subject) + '"></span>' + esc(r.subject || '—') + '</div></td><td>' + esc(m ? m.name : '—') + '</td><td><b>' + esc(r.item) + '</b>' + (r.attempts ? ' <span class="gr-pill hi">' + (r.attempts + 1) + '回目</span>' : '') + '</td><td>' + esc(r.cause || '—') + '</td>'
        + '<td style="white-space:nowrap">' + esc(r.addedAt ? mdLabel(r.addedAt) : '') + '</td><td>' + (src ? '<span class="gr-muted">' + esc(mdLabel(src.date)) + '</span> ' + esc(shortName(src.content)) : '<span class="gr-muted">手動追加</span>') + '</td><td style="white-space:nowrap">' + plan + '</td><td class="gr-noprint" style="white-space:nowrap">' + ops + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="8" class="gr-muted" style="text-align:center;padding:16px">' + (f === 'done' ? '完了した復習はまだありません' : '復習が必要な問題はありません') + '</td></tr>';
    return card('復習キュー', toolbar + '<div class="gr-table-wrap"><table class="gr-table"><tr><th>科目</th><th>教材</th><th>問題</th><th>原因</th><th>追加日</th><th>元の課題</th><th>予定</th><th class="gr-noprint">操作</th></tr>' + rows + '</table></div>'
      + '<div class="gr-callout blue">採点で誤答を入力するとここに追加されます。「週間学習計画」で週の課題を作成すると、未割当の復習はその週の日曜（復習日）にまとめて割り当てられます。復習課題を全問正解で採点すると自動で「完了」になり、誤答が残った問題は次の復習日に回ります。</div>');
  }
  function assignOne(r, date) {
    if (r.taskId) { var old = taskById(r.taskId); if (old) { old.reviewIds = (old.reviewIds || []).filter(function (x) { return x !== r.id; }); if (!old.reviewIds.length && old.status === 'todo') S.plan.tasks = S.plan.tasks.filter(function (x) { return x.id !== old.id; }); else refreshReviewTask(old); } r.taskId = null; }
    assignReviews([r], date);
  }
