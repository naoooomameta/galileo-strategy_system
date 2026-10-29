
  /* ============================================================
   * モーダル
   * ============================================================ */
  function showModal(html, small) {
    var ov = document.getElementById('gr-modal'), box = document.getElementById('gr-modal-box');
    if (!ov || !box) return;
    box.className = 'gr-modal-box' + (small ? ' sm' : '');
    box.innerHTML = html; ov.style.display = 'flex';
    var first = box.querySelector('input:not([type=checkbox]), select, textarea'); if (first && !small) setTimeout(function () { try { first.focus(); } catch (e) { } }, 30);
  }
  function closeModal() {
    var ov = document.getElementById('gr-modal'), box = document.getElementById('gr-modal-box');
    if (ov) ov.style.display = 'none'; if (box) box.innerHTML = '';
    S.modal = null; S.confirmCb = null;
  }
  function modalHtml(title, body, footer) {
    return '<div class="gr-modal-h"><span>' + title + '</span><button class="gr-x" data-gr-act="modal-close" title="閉じる">×</button></div><div class="gr-modal-b">' + body + '</div><div class="gr-modal-f">' + footer + '</div>';
  }
  function mField(label, html, full) { return '<div class="gr-field' + (full ? ' full' : '') + '"><label>' + label + '</label>' + html + '</div>'; }
  function mInput(id, v, o) {
    o = o || {};
    return '<input' + attrs({ 'class': 'gr-in' + (o.num ? ' num' : ''), id: id, type: o.type || 'text', value: v == null ? '' : v, placeholder: o.ph || null, list: o.list || null, min: o.min, max: o.max, step: o.step }) + '>';
  }
  function mSelect(id, v, opts) {
    return '<select class="gr-in" id="' + id + '">' + opts.map(function (o) { var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (String(val) === String(v == null ? '' : v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>';
  }
  function modalFooter(saveAct, delHtml, saveLabel) {
    return (delHtml || '') + '<span class="gr-spacer"></span><button class="btn btn-secondary gr-btn-sm" data-gr-act="modal-close">キャンセル</button><button class="btn btn-primary gr-btn-sm" data-gr-act="' + saveAct + '">' + (saveLabel || '保存') + '</button>';
  }
  function confirmModal(title, msg, onOk, okLabel) {
    S.confirmCb = onOk;
    showModal(modalHtml(esc(title), '<div style="font-size:13px;line-height:1.8">' + esc(msg) + '</div>',
      '<span class="gr-spacer"></span><button class="btn btn-secondary gr-btn-sm" data-gr-act="modal-close">キャンセル</button><button class="btn btn-primary gr-btn-sm" style="background:#b0412a" data-gr-act="confirm-ok">' + esc(okLabel || '削除する') + '</button>'), true);
  }
  function gv(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  /* ---------- 教材 ---------- */
  function openMaterialModal(id) {
    var m = id ? matById(id) : null;
    var d = m ? JSON.parse(JSON.stringify(m)) : { id: uid('m'), subject: S.matFilter || planSubjects()[0] || '', name: '', purpose: '', range: '', unitLabel: '例題', count: '', rounds: 2, pattern: 'straight', days: [1, 2, 3, 4, 5], minPerItem: 15, start: today(), end: addDays(today(), 55), criteria: '', passPct: 80, evalMethod: '', priority: '中', prereq: '', teacher: '', status: '未着手' };
    S.modal = { type: 'material', isNew: !m, orig: m ? JSON.parse(JSON.stringify(m)) : null, id: d.id, driveId: d.driveId || null, link: d.link || '' };
    var subs = sortSubjects(planSubjects().concat(SUBJECT_ORDER.slice(0, 8)));
    if (d.subject && subs.indexOf(d.subject) < 0) subs.push(d.subject);
    var days = matDays(d);
    var dayBoxes = [1, 2, 3, 4, 5, 6, 0].map(function (w) { return '<label><input type="checkbox" class="gr-m-day" value="' + w + '"' + (days.indexOf(w) >= 0 ? ' checked' : '') + '>' + DOW[w] + '</label>'; }).join('');
    var catField = catalogBooks().length ? mField(esc(catalogNote() || '参考書フォルダから選ぶ'), '<select class="gr-in" id="gr-m-catalog">' + catalogSelectHtml(d.subject, d.driveId || '') + '</select>' + (d.link ? '<div class="gr-note" style="margin-top:4px">この教材は参考書フォルダの本と結びついています' + bookLink(d) + '</div>' : ''), true) : '';
    var body = '<div class="gr-form">'
      + mField('科目', mSelect('gr-m-subject', d.subject, subs.map(function (x) { return [x, x]; }).concat([['__custom', 'その他（入力する）']])) + '<input class="gr-in" id="gr-m-subject-custom" style="margin-top:4px;display:none" placeholder="科目名">')
      + mField('教材名', mInput('gr-m-name', d.name, { ph: '入門問題精講 数学II・B', list: 'gr-books' }))
      + catField
      + mField('教材の目的（なぜこの教材を使うか）', mInput('gr-m-purpose', d.purpose, { ph: '公式の背景理解と典型問題の習得' }), true)
      + mField('対象範囲（表示用）', mInput('gr-m-range', d.range, { ph: '例題1〜60（指定単元）' }))
      + mField('問題の呼び方', mInput('gr-m-unitLabel', d.unitLabel, { ph: '例題', list: 'gr-unitlabels' }))
      + mField('問題数（自動配分に使用）', mInput('gr-m-count', d.count, { type: 'number', num: true, min: 0, ph: '60' }))
      + mField('開始番号（途中から始めるとき）', mInput('gr-m-startNo', d.startNo, { type: 'number', num: true, min: 1, ph: '1' }))
      + mField('周回数', mInput('gr-m-rounds', d.rounds, { type: 'number', num: true, min: 1, ph: '2' }))
      + mField('開始日', mInput('gr-m-start', d.start, { type: 'date' }))
      + mField('終了日', mInput('gr-m-end', d.end, { type: 'date' }))
      + mField('進め方', mSelect('gr-m-pattern', d.pattern, [['straight', '毎日新しい範囲を進める'], ['redo', '新規→翌日に解き直し（金曜は確認問題）']]))
      + mField('1問あたりの目安時間（分）', mInput('gr-m-minPerItem', d.minPerItem, { type: 'number', num: true, min: 1, ph: '15' }))
      + mField('課題を出す曜日（土＝予備日・日＝復習日のため通常は月〜金）', '<div class="gr-days">' + dayBoxes + '</div>', true)
      + '<div class="full gr-calc" id="gr-m-calc"></div>'
      + mField('到達基準（「できる」の定義）', mInput('gr-m-criteria', d.criteria, { ph: '初見類題80%以上、解法を説明できる' }), true)
      + mField('基準とする正答率（%）', mInput('gr-m-passPct', d.passPct, { type: 'number', num: true, min: 0, max: 100, ph: '80' }))
      + mField('評価方法', mInput('gr-m-evalMethod', d.evalMethod, { ph: '初見類題10題／単元別テスト' }))
      + mField('優先度', mSelect('gr-m-priority', d.priority, PRIORITIES))
      + mField('前提（先に必要な単元・教材）', mInput('gr-m-prereq', d.prereq, { ph: '数Iの該当単元を理解済み' }))
      + mField('担当講師', mInput('gr-m-teacher', d.teacher, { ph: '担当講師名' }))
      + mField('状態', mSelect('gr-m-status', d.status, MAT_STATUS))
      + '</div>'
      + (m ? '<div class="gr-field" style="margin-top:12px"><label>変更理由（期間・量・到達基準を変えた場合、計画変更履歴に残ります）</label>' + mInput('gr-m-reason', '', { ph: '例：立式の理解が不十分なため、1日の量を減らして説明を追加' }) + '</div>' : '')
      + '<div class="gr-err" id="gr-m-err"></div>';
    showModal(modalHtml(m ? '教材を編集' : '教材を追加', body, modalFooter('mat-save', m ? '<button class="gr-link danger" data-gr-act="mat-del" data-id="' + esc(m.id) + '">この教材を削除</button>' : '')));
    updateMatCalc();
  }
  function readMaterialForm() {
    var subj = gv('gr-m-subject'); if (subj === '__custom') subj = gv('gr-m-subject-custom').trim();
    var days = [].slice.call(document.querySelectorAll('.gr-m-day')).filter(function (c) { return c.checked; }).map(function (c) { return +c.value; });
    var pp = num(gv('gr-m-passPct'));
    // 参考書フォルダの本との結びつき：選んだ本と教材名が一致していれば残す。名前がカタログの本と一致すれば自動で結びつける
    var name = gv('gr-m-name').trim(), driveId = S.modal ? S.modal.driveId : null, link = S.modal ? S.modal.link : '';
    var linked = driveId ? catalogById(driveId) : null;
    if (linked && normBook(linked.name) !== normBook(name)) { driveId = null; link = ''; linked = null; }
    if (!driveId) { var byName = catalogBookByName(name); if (byName) { driveId = byName.id; link = byName.url; } }
    return { id: S.modal ? S.modal.id : uid('m'), subject: subj, name: name, purpose: gv('gr-m-purpose').trim(), range: gv('gr-m-range').trim(), unitLabel: gv('gr-m-unitLabel').trim(), driveId: driveId || null, link: link || '',
      count: num(gv('gr-m-count')), startNo: (Math.floor(num(gv('gr-m-startNo')) || 1) > 1 ? Math.floor(num(gv('gr-m-startNo'))) : null), rounds: Math.max(1, Math.floor(num(gv('gr-m-rounds')) || 1)), start: gv('gr-m-start'), end: gv('gr-m-end'), pattern: gv('gr-m-pattern') || 'straight',
      minPerItem: num(gv('gr-m-minPerItem')) || 15, days: days.length ? days : [1, 2, 3, 4, 5], criteria: gv('gr-m-criteria').trim(), passPct: pp == null ? 80 : clamp(pp, 0, 100),
      evalMethod: gv('gr-m-evalMethod').trim(), priority: gv('gr-m-priority'), prereq: gv('gr-m-prereq').trim(), teacher: gv('gr-m-teacher').trim(), status: gv('gr-m-status') || '未着手' };
  }
  function updateMatCalc() {
    var el = document.getElementById('gr-m-calc');
    if (!el || !S.modal || S.modal.type !== 'material') return;
    var d = readMaterialForm(); d.id = '__calc';
    if (!d.start || !d.end) { el.textContent = '開始日と終了日を入れると、1日あたりの量を自動で計算します。'; return; }
    if (d.start > d.end) { el.textContent = '終了日が開始日より前になっています。'; return; }
    var dates = teachingDates(d), C = num(d.count) || 0;
    if (!C) { el.innerHTML = '課題日は <b>' + dates.length + '</b> 日です。問題数を入れると1日あたりの量を計算します。'; return; }
    var slots = computeAlloc(d), study = slots.filter(function (s) { return s.kind === 'study'; });
    var perDay = study.length ? study.reduce(function (a, s) { return a + s.qty; }, 0) / study.length : 0;
    var mins = slots.length ? Math.round(slots.reduce(function (a, s) { return a + s.minutes; }, 0) / slots.length) : 0;
    el.innerHTML = '範囲 <b>' + esc(autoRange(d)) + '</b>／課題日 <b>' + dates.length + '</b>日（新しい範囲を進める日 ' + study.length + '日）／1日あたり 約<b>' + (Math.round(perDay * 10) / 10) + '</b>' + esc(unitOf(d)) + '・目安 約' + mins + '分／合計 ' + C + esc(unitOf(d)) + ' × ' + d.rounds + '周'
      + (d.pattern === 'redo' ? '<br>解き直しが偶数周目を兼ねます（周回数2なら「新規1周＋翌日の解き直し1周」）。' : '');
  }
  function schedSummary(m) {
    return [m.start && m.end ? mdLabel(m.start) + '〜' + mdLabel(m.end) : '期間未設定', (num(m.count) ? (startNo(m) > 1 ? autoRange(m) + '・' : '') + m.count + unitOf(m) : '問題数未設定') + '×' + (m.rounds || 1) + '周' + (m.pattern === 'redo' ? '（解き直し型）' : ''),
      '到達基準：' + (m.criteria || '—') + (num(m.passPct) != null ? '（' + m.passPct + '%）' : '')].join('／');
  }
  function saveMaterial() {
    var d = readMaterialForm(), err = document.getElementById('gr-m-err'), md = S.modal, p = S.plan;
    if (!d.name) { err.textContent = '教材名を入力してください'; return; }
    if (!d.subject) { err.textContent = '科目を選んでください'; return; }
    if (d.start && d.end && d.start > d.end) { err.textContent = '終了日は開始日より後にしてください'; return; }
    if ((d.start && !d.end) || (!d.start && d.end)) { err.textContent = '開始日と終了日は両方入れてください'; return; }
    if (md.isNew) p.materials.push(d);
    else {
      var m = matById(d.id); if (!m) { closeModal(); toast('この教材は他の画面で削除されたため、保存できませんでした'); rerender(); return; }
      var before = schedSummary(md.orig), after = schedSummary(d);
      Object.keys(d).forEach(function (k) { m[k] = d[k]; });
      if (before !== after) addHistory('教材：' + d.name, before, after, gv('gr-m-reason').trim(), '');
    }
    if (d.subject && p.subjects.indexOf(d.subject) < 0) p.subjects = sortSubjects(p.subjects.concat([d.subject]));
    touch(); closeModal(); rerender(); toast(md.isNew ? '教材を追加しました' : '教材を更新しました');
  }

  /* ---------- 課題 ---------- */
  // withCatalog：参考書フォルダの本（この生徒にまだ登録していないもの）も「cat:ID」として選べるようにする
  function materialOptions(subject, selected, withCatalog) {
    var list = sortedMaterials().filter(function (m) { return !subject || m.subject === subject; });
    var own = list.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('');
    if (withCatalog && list.length) own = '<optgroup label="この生徒の教材">' + own + '</optgroup>';
    var cat = withCatalog ? catalogOptionsHtml(subject, selected && selected.indexOf('cat:') === 0 ? selected.slice(4) : '', {}) : '';
    return '<option value="">（教材なし）</option>' + own + cat;
  }
  function openTaskModal(id, preset) {
    var t = id ? taskById(id) : null; preset = preset || {};
    var d = t ? JSON.parse(JSON.stringify(t)) : { id: uid('t'), date: preset.date || S.day || today(), subject: preset.subject != null ? preset.subject : '', materialId: '', kind: 'study', content: '', minutes: 30, qty: '', status: 'todo' };
    S.modal = { type: 'task', isNew: !t, id: d.id };
    var subs = planSubjects(); if (d.subject && subs.indexOf(d.subject) < 0) subs = subs.concat([d.subject]);
    var revNote = '';
    if (t && t.kind === 'review') revNote = '<div class="gr-note">復習課題です（対象：' + esc((t.reviewIds || []).map(reviewById).filter(Boolean).map(function (r) { return r.item; }).join('、') || 'なし') + '）。採点で全問正解にすると、復習キューの該当問題が完了になります。</div>';
    var body = '<div class="gr-form">'
      + mField('日付', mInput('gr-t-date', d.date, { type: 'date' }))
      + mField('科目', mSelect('gr-t-subject', d.subject, [['', '（科目なし）']].concat(subs.map(function (s) { return [s, s]; }))))
      + mField('教材', '<select class="gr-in" id="gr-t-material">' + materialOptions(d.subject, d.materialId, true) + '</select><div class="gr-note" id="gr-t-mnote" style="display:none;margin-top:4px">参考書フォルダの本です。保存するとこの生徒の教材一覧に追加されます（期間・問題数は「教材・年間計画」で設定できます）。</div>')
      + mField('種類', mSelect('gr-t-kind', d.kind, Object.keys(TASK_KINDS).map(function (k) { return [k, TASK_KINDS[k]]; })))
      + mField('学習内容', mInput('gr-t-content', d.content, { ph: '例題4〜6：講義＋演習' }), true)
      + mField('目安時間（分）', mInput('gr-t-minutes', d.minutes, { type: 'number', num: true, min: 0 }))
      + mField('問題数（採点の初期値）', mInput('gr-t-qty', d.qty, { type: 'number', num: true, min: 0 }))
      + mField('状態', mSelect('gr-t-status', d.status, Object.keys(TASK_STATUS).map(function (k) { return [k, TASK_STATUS[k]]; })))
      + '</div>' + (t && t.auto && t.kind !== 'review' ? '<div class="gr-note">教材から自動で作成された課題です。内容・日付などを変更すると、「この週の課題を作成」を押しても上書きされなくなります。</div>' : '') + revNote
      + '<div class="gr-err" id="gr-t-err"></div>';
    showModal(modalHtml(t ? '課題を編集' : '課題を追加', body, modalFooter('task-save', t ? '<button class="gr-link danger" data-gr-act="task-del" data-id="' + esc(t.id) + '">この課題を削除</button>' : '')));
  }
  function saveTask() {
    var md = S.modal, date = gv('gr-t-date');
    if (!date) { document.getElementById('gr-t-err').textContent = '日付を入力してください'; return; }
    var d = { date: date, subject: gv('gr-t-subject'), materialId: gv('gr-t-material') || null, kind: gv('gr-t-kind') || 'other', content: gv('gr-t-content').trim(), minutes: num(gv('gr-t-minutes')), qty: num(gv('gr-t-qty')), status: gv('gr-t-status') || 'todo' };
    var t = md.isNew ? null : taskById(md.id);
    if (!md.isNew && !t) { closeModal(); toast('この課題は他の画面で削除されたため、保存できませんでした'); rerender(); return; }
    var addedBook = null;
    if (d.materialId && d.materialId.indexOf('cat:') === 0) {
      // 参考書フォルダの本 → この生徒の教材一覧に（まだ無ければ）追加して、その教材を課題に結びつける
      var before = S.plan.materials.length, bm = ensureMaterialFromBook(d.materialId.slice(4), d.subject);
      if (!bm) { document.getElementById('gr-t-err').textContent = 'この参考書は一覧に見つかりませんでした。画面を再読み込みしてからもう一度お試しください'; return; }
      d.materialId = bm.id; if (!d.subject && bm.subject) d.subject = bm.subject;
      if (S.plan.materials.length > before) addedBook = bm;
    }
    var counts = d.materialId && (d.kind === 'study' || d.kind === 'redo');
    if (!t) {
      t = { id: md.id, auto: false, edited: true, units: counts ? (d.qty || 0) : 0 };
      Object.keys(d).forEach(function (k) { t[k] = d[k]; });
      if ((d.status === 'submitted' || d.status === 'graded') && !t.submittedAt) t.submittedAt = nowIso();
      S.plan.tasks.push(t);
    } else {
      var changed = t.date !== d.date || (t.content || '') !== d.content || (t.materialId || null) !== d.materialId || t.kind !== d.kind || num(t.qty) !== d.qty;
      if (changed) t.edited = true;
      if (t.auto && t.date !== d.date && !t.origDate) t.origDate = t.date;
      if (num(t.qty) !== d.qty) {
        if (t.auto && num(t.qty)) t.units = Math.round((num(t.units) || 0) * (d.qty || 0) / num(t.qty));
        else t.units = counts ? (d.qty || 0) : 0;
      } else if (!t.auto) t.units = counts ? (d.qty || 0) : 0;
      if ((d.status === 'submitted' || d.status === 'graded') && !t.submittedAt) t.submittedAt = nowIso();
      if (d.status === 'todo' || d.status === 'missing') t.submittedAt = '';
      Object.keys(d).forEach(function (k) { t[k] = d[k]; });
    }
    touch(); closeModal(); rerender(); toast((md.isNew ? '課題を追加しました' : '課題を更新しました') + (addedBook ? '（教材一覧に「' + addedBook.name + '」を追加しました）' : ''));
  }
  function deleteTask(id) {
    var t = taskById(id); if (!t) return;
    if (t.kind === 'review') unlinkReviewsOf(t);
    if (t.auto && t.materialId) { var k = t.materialId + '|' + (t.origDate || t.date) + '|' + t.kind; if (S.plan.skips.indexOf(k) < 0) S.plan.skips.push(k); }
    S.plan.tasks = S.plan.tasks.filter(function (x) { return x.id !== id; });
    if (S.gradeTaskId === id) S.gradeTaskId = null;
    touch(); closeModal(); rerender(); toast('課題を削除しました');
  }

  /* ---------- 復習・履歴・科目・クラウド設定 ---------- */
  function openReviewModal() {
    var subs = planSubjects(), s0 = subs[0] || '';
    S.modal = { type: 'review' };
    var body = '<div class="gr-form">'
      + mField('科目', mSelect('gr-rv-subject', s0, [['', '（科目なし）']].concat(subs.map(function (s) { return [s, s]; }))))
      + mField('教材', '<select class="gr-in" id="gr-rv-material">' + materialOptions(s0, '') + '</select>')
      + mField('問題', mInput('gr-rv-item', '', { ph: '例題6' }))
      + mField('原因', mSelect('gr-rv-cause', '', [['', '— 選択 —']].concat(CAUSES.map(function (c) { return [c, c]; }))))
      + '</div><div class="gr-err" id="gr-rv-err"></div>';
    showModal(modalHtml('復習を追加', body, modalFooter('rev-save', '', '追加')));
  }
  function openHistoryModal() {
    S.modal = { type: 'history' };
    var body = '<div class="gr-form">'
      + mField('対象', mInput('gr-h-target', '', { ph: '物理：物理のエッセンス' }), true)
      + mField('変更前', mInput('gr-h-before', '', { ph: '毎日3題' }))
      + mField('変更後', mInput('gr-h-after', '', { ph: '毎日2題＋図示と説明を追加' }))
      + mField('理由（判定）', mInput('gr-h-reason', '', { ph: '立式の理解が不十分' }), true)
      + mField('承認者', mInput('gr-h-approver', '', { ph: '塾長 今西' }))
      + '</div><div class="gr-err" id="gr-h-err"></div>';
    showModal(modalHtml('計画の変更を記録', body, modalFooter('hist-save', '', '記録する')));
  }
  function openSubjectModal() {
    S.modal = { type: 'subject' };
    showModal(modalHtml('科目を追加', mField('科目名', mInput('gr-sub-name', '', { ph: '例：倫理' })), modalFooter('subject-save', '', '追加')), true);
    setTimeout(function () { var el = document.getElementById('gr-sub-name'); if (el) el.focus(); }, 30);
  }
  function addSubject(s) {
    s = String(s || '').trim(); if (!s) return;
    if (S.plan.subjects.indexOf(s) < 0) { S.plan.subjects = sortSubjects(S.plan.subjects.concat([s])); touch(); }
    rerender();
  }
  var SETUP_SQL = [
    '-- 個別合格ロードマップの保存用テーブル（1回だけ実行）',
    'create table if not exists public.roadmap_plans (',
    '  student_id text primary key,',
    "  plan jsonb not null default '{}'::jsonb,",
    '  updated_at timestamptz not null default now()',
    ');',
    'alter table public.roadmap_plans enable row level security;',
    'drop policy if exists "roadmap_plans_staff_all" on public.roadmap_plans;',
    'create policy "roadmap_plans_staff_all" on public.roadmap_plans',
    '  for all to authenticated using (true) with check (true);'
  ].join('\n');
  function openSetup() {
    S.modal = { type: 'setup' };
    var body = '<div style="font-size:13px;line-height:1.8">いまは個別ロードマップがこの端末（ブラウザ）にだけ保存されています。Supabaseに保存用のテーブルを1つ作ると、どのPCからでも同じロードマップを開いて編集できるようになります。作成後、この端末のデータは自動でクラウドへアップロードされます。</div>'
      + '<ol class="gr-steps"><li>Supabaseダッシュボードで、このシステムのプロジェクト（Galileo-Strategy）を開く</li><li>左メニューの「SQL Editor」で新しいクエリを開く</li><li>下のSQLを貼り付けて「Run」を押す</li><li>このシステムに戻り「接続を確認」を押す</li></ol>'
      + '<pre class="gr-sql">' + esc(SETUP_SQL) + '</pre><div class="gr-note">ログインしたスタッフだけが読み書きできる設定（RLS）になっています。同じ生徒を複数の端末で同時に編集しても、課題・教材などの項目ごとに双方の変更をまとめて保存します（同じ欄を同時に書き換えた場合は、後から保存した内容が残ります）。</div>';
    showModal(modalHtml('クラウド保存の設定', body, '<button class="btn btn-secondary gr-btn-sm" data-gr-act="copy-sql">SQLをコピー</button><span class="gr-spacer"></span><button class="btn btn-secondary gr-btn-sm" data-gr-act="modal-close">閉じる</button><button class="btn btn-primary gr-btn-sm" data-gr-act="setup-recheck">接続を確認</button>'));
  }
  function recheckCloud() {
    if (!S.student) return;
    flush(); S.sid = null; ensureLoaded(); closeModal(); rerender();
    toast('クラウドへの接続を確認しています');
  }

  /* ============================================================
   * 印刷・PDF（表示中の入力欄を文字に置き換えて、A4横で出力）
   * ============================================================ */
  function rootVars() {
    var cs = getComputedStyle(document.documentElement), out = '';
    ['--ink', '--ink-light', '--paper', '--paper-dark', '--accent', '--accent-soft', '--gold', '--teal', '--teal-light', '--text', '--text-muted', '--border', '--white'].forEach(function (k) { var v = cs.getPropertyValue(k); if (v) out += k + ':' + v.trim() + ';'; });
    return out + '--shadow:none;--shadow-lg:none;';
  }
  function staticize(src) {
    var clone = src.cloneNode(true);
    var sc = src.querySelectorAll('canvas'), dc = clone.querySelectorAll('canvas');
    for (var i = 0; i < dc.length; i++) {
      try { var img = document.createElement('img'); img.src = sc[i].toDataURL('image/png'); img.style.cssText = 'width:100%;height:auto'; dc[i].parentNode.replaceChild(img, dc[i]); } catch (e) { dc[i].parentNode.removeChild(dc[i]); }
    }
    var sf = src.querySelectorAll('input, select, textarea'), df = clone.querySelectorAll('input, select, textarea');
    for (var j = 0; j < df.length; j++) {
      var s = sf[j], span = document.createElement('span'), v = '';
      if (!s) { df[j].parentNode.removeChild(df[j]); continue; }
      if (s.tagName === 'SELECT') { v = (s.selectedIndex >= 0 && s.value !== '') ? s.options[s.selectedIndex].text : ''; }
      else if (s.type === 'checkbox') v = s.checked ? '✓' : '';
      else v = s.value;
      if (!v && s.getAttribute('data-gr-default') && s.placeholder) { v = s.placeholder; span.className = 'gr-pv'; }
      else span.className = 'gr-pv';
      if (s.type === 'month' && v) v = monthLabel(v);
      if (s.type === 'date' && v) v = mdLabel(v);
      if (s.getAttribute('style')) span.setAttribute('style', s.getAttribute('style'));
      var narrow = /(^|\s)w\d+(\s|$)/.test(s.className || '');
      if (!narrow && (s.tagName === 'TEXTAREA' || s.tagName === 'SELECT' || (s.tagName === 'INPUT' && s.type !== 'checkbox'))) span.style.display = 'block';
      try { if ((parseInt(getComputedStyle(s).fontWeight, 10) || 400) >= 600) span.style.fontWeight = '700'; } catch (e) { }
      span.textContent = v;
      df[j].parentNode.replaceChild(span, df[j]);
    }
    [].slice.call(clone.querySelectorAll('.gr-noprint, details > summary')).forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
    [].slice.call(clone.querySelectorAll('details')).forEach(function (n) { n.setAttribute('open', ''); });
    return clone.innerHTML;
  }
  function printDoc(html) {
    var old = document.getElementById('gr-print-frame'); if (old) old.parentNode.removeChild(old);
    var f = document.createElement('iframe');
    f.id = 'gr-print-frame'; f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    var fired = false;
    function go() { if (fired) return; fired = true; try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('印刷を開始できませんでした'); } }
    setTimeout(function () {
      try { if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { setTimeout(go, 120); }); } catch (e) { }
      setTimeout(go, 2500);
    }, 300);
  }
  function printView(all) {
    var pg = visiblePage(); if (!pg || !S.plan) return;
    var cur = S.tab[pg], tabs = all ? ['strategy', 'materials', 'monthly'] : [cur];
    var savedMonth = S.month; if (all) S.month = thisMonth();
    var parts = tabs.map(function (t) {
      var html;
      if (t === cur && !(all && t === 'monthly' && savedMonth && savedMonth !== thisMonth())) html = staticize(document.getElementById('gr-view-' + pg));
      else {
        var tmp = document.createElement('div'); tmp.style.cssText = 'position:absolute;left:-99999px;top:0;width:1120px';
        tmp.innerHTML = VIEWS[t](); document.body.appendChild(tmp); html = staticize(tmp); tmp.parentNode.removeChild(tmp);
      }
      return '<section class="gr-print-sec"><h2 class="gr-print-h">' + esc(tabLabel(t)) + '</h2>' + html + '</section>';
    });
    if (all) S.month = savedMonth;
    var css = (document.getElementById('gr-style') || {}).textContent || '';
    var title = PAGES[pg].title + '｜' + S.student.name;
    var doc = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>' + esc(title) + '</title>'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Serif+JP:wght@700&family=DM+Mono&display=swap">'
      + '<style>:root{' + rootVars() + '}*{box-sizing:border-box}body{font-family:"Noto Sans JP",sans-serif;color:#1a1f1c;margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px}'
      + css
      + '@page{size:A4 landscape;margin:9mm}.gr-noprint{display:none!important}.gr-card{box-shadow:none;break-inside:avoid;page-break-inside:avoid;margin-bottom:8px}.gr-grid{gap:8px;margin-bottom:8px}'
      + '.gr-print-sec{break-after:page;page-break-after:always}.gr-print-sec:last-child{break-after:auto;page-break-after:auto}'
      + '.gr-print-h{font-family:"Noto Serif JP",serif;font-size:15px;color:#1f3329;border-left:4px solid #a8843c;padding-left:8px;margin:0 0 8px}'
      + '.gr-print-top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f3329;padding-bottom:6px;margin-bottom:10px}'
      + '.gr-print-top .t{font-family:"Noto Serif JP",serif;font-size:18px;font-weight:700;color:#1f3329}.gr-print-top .s{font-size:11px;color:#7a857e}'
      + '.gr-pv{white-space:pre-wrap;word-break:break-word}.gr-table td,.gr-table th{padding:5px 6px}.gr-gantt{min-width:0}.gr-table-wrap{overflow:visible}.gr-mocks{min-width:0!important}.gr-booklink{display:none}'
      + '.gr-grid-3{grid-template-columns:1.15fr 1fr 1fr!important}.gr-grid-2{grid-template-columns:1fr 1fr!important}.gr-grid-21{grid-template-columns:1.6fr 1fr!important}'
      + '</style></head><body><div class="gr-print-top"><div class="t">ガリレオ ' + esc(PAGES[pg].title) + '｜' + esc(S.student.name) + ' さん</div><div class="s">出力日：' + esc(jpDate(today())) + '</div></div>'
      + parts.join('') + '</body></html>';
    printDoc(doc);
  }

  /* ============================================================
   * 操作（ボタン）
   * ============================================================ */
  var ACT = {
    'create': function () {
      if (!S.student) return;
      S.plan = createPlanFor(S.student);
      addHistory('個別ロードマップ', '', '新規作成（生徒データから下書き）', '', '');
      touch(); saveLocalNow(); S.tab.groad = 'strategy'; saveUi(); rerender();
      toast('個別ロードマップを作成しました');
    },
    'tab': function (el) { var pg = el.getAttribute('data-page'), t = el.getAttribute('data-tab'); S.tab[pg] = t; saveUi(); renderPage(pg); },
    'goto': function (el) { var pg = el.getAttribute('data-page'), t = el.getAttribute('data-tab'); S.tab[pg] = t; saveUi(); if (typeof showPage === 'function') showPage(pg); else renderPage(pg); },
    'print': function () { printView(false); },
    'legacy': function () {
      // 置き換え前の「ロードマップ」画面（AI戦略分析・参考書ルート）を一時的に表示する
      document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
      var pg = document.getElementById('page-roadmap'); if (pg) pg.classList.add('active');
      window.scrollTo(0, 0);
    },
    'print-all': function () { printView(true); },
    'setup': openSetup,
    'setup-recheck': recheckCloud,
    'copy-sql': function () { copyText(SETUP_SQL); },
    'modal-close': closeModal,
    'confirm-ok': function () { var cb = S.confirmCb; S.confirmCb = null; if (cb) cb(); },
    'list-add': function (el) {
      var path = el.getAttribute('data-path'), arr = getPath(S.plan, path);
      if (!Array.isArray(arr)) { arr = []; setPath(S.plan, path, arr); }
      arr.push(''); touch(); rerender();
      var inpEl = document.querySelector('[data-gr-bind="' + path + '.' + (arr.length - 1) + '"]'); if (inpEl) inpEl.focus();
    },
    'list-del': function (el) { var arr = getPath(S.plan, el.getAttribute('data-path')); if (Array.isArray(arr)) { arr.splice(+el.getAttribute('data-i'), 1); touch(); rerender(); } },
    'row-add': function (el) {
      var path = el.getAttribute('data-path'), tpl = {};
      try { tpl = JSON.parse(el.getAttribute('data-tpl') || '{}'); } catch (e) { }
      var arr = getPath(S.plan, path); if (!Array.isArray(arr)) { arr = []; setPath(S.plan, path, arr); }
      var row = JSON.parse(JSON.stringify(tpl)); row.id = row.id || uid('row');
      if (path === 'stages') row.color = STAGE_COLORS[arr.length % STAGE_COLORS.length];
      if (path === 'mocks') arr.unshift(row); else arr.push(row);
      touch(); rerender();
    },
    'row-del': function (el) { var arr = getPath(S.plan, el.getAttribute('data-path')); if (Array.isArray(arr)) { arr.splice(+el.getAttribute('data-i'), 1); touch(); rerender(); } },
    'subject-del': function (el) {
      var i = +el.getAttribute('data-i'), s = S.plan.subjects[i];
      if (S.plan.materials.some(function (m) { return m.subject === s; })) { toast('「' + s + '」の教材が登録されているため外せません'); return; }
      S.plan.subjects.splice(i, 1); touch(); rerender();
    },
    'subject-save': function () { var v = gv('gr-sub-name').trim(); closeModal(); addSubject(v); },
    'weights-fill': function () {
      var w = S.plan.profile.weights, have = w.map(function (r) { return r.subject; });
      planSubjects().forEach(function (s) { if (have.indexOf(s) < 0) w.push({ id: uid('row'), subject: s, points: '' }); });
      touch(); rerender();
    },
    'stages-auto': function () {
      confirmModal('学習段階を作り直しますか？', '入試時期（' + monthLabel(examMonthOf(S.student)) + '）から逆算して、基礎理解→典型定着→標準演習→応用演習→過去問演習→最終調整を割り振り直します。入試まで短い場合は、入試に近い段階から優先して確保します。いまの段階の設定は置き換わります。', function () {
        var before = S.plan.stages.map(function (s) { return s.label + '(' + periodShort(s.start, s.end) + ')'; }).join('・');
        S.plan.stages = autoStages(thisMonth(), examMonthOf(S.student));
        addHistory('学習段階', before, S.plan.stages.map(function (s) { return s.label + '(' + periodShort(s.start, s.end) + ')'; }).join('・'), '入試時期から逆算して再計算', '');
        touch(); closeModal(); rerender(); toast('学習段階を作り直しました');
      }, '作り直す');
    },
    'mat-new': function () { openMaterialModal(null); },
    'mat-edit': function (el) { openMaterialModal(el.getAttribute('data-id')); },
    'mat-save': saveMaterial,
    'mat-del': function (el) {
      var id = el.getAttribute('data-id'), m = matById(id); if (!m) return;
      confirmModal('「' + m.name + '」を削除しますか？', 'まだ着手していない課題も一緒に削除されます。提出・採点済みの課題の記録は残ります。', function () {
        S.plan.materials = S.plan.materials.filter(function (x) { return x.id !== id; });
        S.plan.tasks = S.plan.tasks.filter(function (t) { return !(t.materialId === id && t.status === 'todo'); });
        addHistory('教材：' + m.name, schedSummary(m), '削除', '', '');
        touch(); closeModal(); rerender(); toast('教材を削除しました');
      });
    },
    'goto-month': function (el) { S.month = el.getAttribute('data-month') || thisMonth(); S.tab.groad = 'monthly'; saveUi(); if (typeof showPage === 'function') showPage('groad'); else renderPage('groad'); },
    'month-prev': function () { S.month = addMonths(S.month || thisMonth(), -1); rerender(); },
    'month-next': function () { S.month = addMonths(S.month || thisMonth(), 1); rerender(); },
    'month-today': function () { S.month = thisMonth(); rerender(); },
    'judge-log': function (el) {
      var M = el.getAttribute('data-month'), id = el.getAttribute('data-id'), m = matById(id);
      var r = getPath(S.plan, 'months.' + M + '.rows.' + id) || {};
      if (!m) return;
      if (!r.change) { toast('「翌月への変更」を入力してから記録してください'); return; }
      addHistory('教材：' + m.name + '（' + monthLabel(M) + '末判定）', schedSummary(m), r.change, '未達' + (r.cause ? '：' + r.cause : ''), '');
      setPath(S.plan, 'months.' + M + '.rows.' + id + '.logged', true);
      touch(); rerender(); toast('計画変更履歴に記録しました。必要に応じて教材の期間・量も修正してください');
    },
    'sum-prev': function () { S.sumMonth = addMonths(S.sumMonth || thisMonth(), -1); rerender(); },
    'sum-next': function () { S.sumMonth = addMonths(S.sumMonth || thisMonth(), 1); rerender(); },
    'week-prev': function () { S.week = addDays(S.week || mondayOf(today()), -7); rerender(); },
    'week-next': function () { S.week = addDays(S.week || mondayOf(today()), 7); rerender(); },
    'week-today': function () { S.week = mondayOf(today()); rerender(); },
    'week-gen': function () {
      if (!S.plan.materials.length) { toast('先に「教材・年間計画」で教材を登録してください'); return; }
      var mon0 = S.week || mondayOf(today()), sun0 = addDays(mon0, 6);
      var had = S.plan.tasks.some(function (t) { return t.auto && t.date >= mon0 && t.date <= sun0; });
      var r = genWeek(mon0);
      touch(); rerender();
      var msg = [];
      if (r.created) msg.push(r.created + '件作成'); if (r.updated) msg.push(r.updated + '件更新'); if (r.removed) msg.push(r.removed + '件削除'); if (r.reviews) msg.push('復習' + r.reviews + '件を日曜に割当');
      toast(msg.length ? 'この週の課題：' + msg.join('・') : had ? 'この週の課題は作成済みです（教材の設定に変更はありません）' : 'この週に割り振る課題はありませんでした（教材の期間・問題数を確認してください）');
    },
    'week-move': function () { var n = moveUnfinished(S.week || mondayOf(today())); if (n) { touch(); rerender(); } toast(n ? n + '件の課題を土曜（予備日）に振り替えました' : '振り替える課題はありません（今日より前の未着手・未提出が対象）'); },
    'week-copy': function () { copyText(weekText(S.week || mondayOf(today()))); },
    'day-prev': function () { S.day = addDays(S.day || today(), -1); S.gradeTaskId = null; rerender(); },
    'day-next': function () { S.day = addDays(S.day || today(), 1); S.gradeTaskId = null; rerender(); },
    'day-today': function () { S.day = today(); S.gradeTaskId = null; rerender(); },
    'day-copy': function () { copyText(dayText(S.day || today())); },
    'task-new': function (el) { openTaskModal(null, { date: el.getAttribute('data-date'), subject: el.getAttribute('data-subject') }); },
    'task-edit': function (el) { openTaskModal(el.getAttribute('data-id')); },
    'task-save': saveTask,
    'task-del': function (el) { var id = el.getAttribute('data-id'), t = taskById(id); if (!t) return; confirmModal('この課題を削除しますか？', (t.content || '') + (t.status === 'graded' ? '（採点の記録も削除されます）' : ''), function () { deleteTask(id); }); },
    'grade-pick': function (el) { S.gradeTaskId = el.getAttribute('data-id'); rerender(); },
    'grade-save': function (el) { gradeSave(el.getAttribute('data-id')); },
    'grade-clear': function (el) { var id = el.getAttribute('data-id'); confirmModal('採点を取り消しますか？', '正誤・講評の記録が消え、状態が「提出済」に戻ります。この採点で追加した未割当の復習も削除されます。', function () { closeModal(); gradeClear(id); }, '取り消す'); },
    'rev-filter': function (el) { S.reviewFilter = el.getAttribute('data-f'); rerender(); },
    'rev-today': function (el) { var r = reviewById(el.getAttribute('data-id')); if (!r) return; assignOne(r, today()); touch(); rerender(); toast('今日の課題に追加しました'); },
    'rev-sunday': function (el) { var r = reviewById(el.getAttribute('data-id')); if (!r) return; var sun = addDays(mondayOf(today()), 6); assignOne(r, sun); touch(); rerender(); toast(mdw(sun) + 'の復習に割り当てました'); },
    'rev-done': function (el) { var r = reviewById(el.getAttribute('data-id')); if (!r) return; r.status = 'done'; r.doneAt = today(); touch(); rerender(); },
    'rev-reopen': function (el) { var r = reviewById(el.getAttribute('data-id')); if (!r) return; r.status = 'open'; r.doneAt = ''; r.taskId = null; touch(); rerender(); },
    'rev-del': function (el) {
      var id = el.getAttribute('data-id'), r = reviewById(id); if (!r) return;
      if (r.taskId) { var t = taskById(r.taskId); if (t) { t.reviewIds = (t.reviewIds || []).filter(function (x) { return x !== id; }); if (!t.reviewIds.length && t.status === 'todo') S.plan.tasks = S.plan.tasks.filter(function (x) { return x.id !== t.id; }); else if (t.status === 'todo') refreshReviewTask(t); } }
      S.plan.reviews = S.plan.reviews.filter(function (x) { return x.id !== id; }); touch(); rerender();
    },
    'rev-assign-all': function () {
      var open = S.plan.reviews.filter(function (r) { return r.status !== 'done' && !r.taskId; });
      if (!open.length) { toast('未割当の復習はありません'); return; }
      var sun = addDays(mondayOf(today()), 6), bySub = {};
      open.forEach(function (r) { var k = r.subject || ''; (bySub[k] = bySub[k] || []).push(r); });
      Object.keys(bySub).forEach(function (k) { assignReviews(bySub[k], sun); });
      touch(); rerender(); toast(open.length + '件を' + mdw(sun) + 'の復習に割り当てました');
    },
    'rev-new': openReviewModal,
    'rev-save': function () {
      var item = gv('gr-rv-item').trim(); if (!item) { document.getElementById('gr-rv-err').textContent = '問題を入力してください'; return; }
      S.plan.reviews.push({ id: uid('r'), subject: gv('gr-rv-subject'), materialId: gv('gr-rv-material') || null, item: item, cause: gv('gr-rv-cause'), fromTaskId: null, addedAt: today(), status: 'open', taskId: null });
      touch(); closeModal(); rerender(); toast('復習キューに追加しました');
    },
    'hist-new': openHistoryModal,
    'hist-save': function () {
      var target = gv('gr-h-target').trim(), after = gv('gr-h-after').trim();
      if (!target || !after) { document.getElementById('gr-h-err').textContent = '対象と変更後の内容を入力してください'; return; }
      addHistory(target, gv('gr-h-before').trim(), after, gv('gr-h-reason').trim(), gv('gr-h-approver').trim());
      touch(); closeModal(); rerender(); toast('計画変更履歴に記録しました');
    }
  };

  /* ---------- プルダウンの変更 ---------- */
  var CHG = {
    'student': function (el) {
      var k = el.value; if (!k) return;
      var s = getAllStudents().filter(function (x) { return studentKey(x) === k; })[0]; if (!s) return;
      try { if (typeof _switchToStudent === 'function') _switchToStudent(s, false); } catch (e) { console.warn('[GR] 生徒切替中に他の画面でエラー:', e); }
      ensureLoaded(); render();
    },
    'subject-add': function (el) { var v = el.value; el.value = ''; if (!v) return; if (v === '__custom') openSubjectModal(); else addSubject(v); },
    'mat-filter': function (el) { S.matFilter = el.value; rerender(); },
    'task-status': function (el) {
      var t = taskById(el.getAttribute('data-id')); if (!t) return;
      var v = el.value;
      if (v === 'graded' && !(num(t.total) > 0)) { S.gradeTaskId = t.id; el.value = t.status; rerender(); toast('採点結果は右の「採点・フィードバック」で入力してください'); return; }
      t.status = v;
      if ((v === 'submitted' || v === 'graded') && !t.submittedAt) t.submittedAt = nowIso();
      if (v === 'todo' || v === 'missing') t.submittedAt = '';
      if (v === 'submitted') S.gradeTaskId = t.id;
      touch(); rerender();
    }
  };
  function castVal(el) { if (el.type === 'checkbox') return !!el.checked; return el.getAttribute('data-gr-type') === 'num' ? num(el.value) : el.value; }
  function modalChange(el) {
    if (el.id === 'gr-m-subject') {
      var c = document.getElementById('gr-m-subject-custom'); if (c) c.style.display = el.value === '__custom' ? '' : 'none';
      var cs = document.getElementById('gr-m-catalog'); if (cs) cs.innerHTML = catalogSelectHtml(el.value === '__custom' ? '' : el.value, S.modal && S.modal.driveId || '');
    }
    if (el.id === 'gr-m-catalog') {
      // 参考書フォルダの本を選ぶ → 教材名に入れ、Driveのファイルと結びつける
      var bk = el.value && el.value.indexOf('cat:') === 0 ? catalogById(el.value.slice(4)) : null;
      if (bk && S.modal) { var nm = document.getElementById('gr-m-name'); if (nm) nm.value = bk.name; S.modal.driveId = bk.id; S.modal.link = bk.url; }
      else if (S.modal) { S.modal.driveId = null; S.modal.link = ''; }
      updateMatCalc(); return;
    }
    if (el.id === 'gr-t-subject') { var ms = document.getElementById('gr-t-material'); if (ms) { ms.innerHTML = materialOptions(el.value, '', true); var mn0 = document.getElementById('gr-t-mnote'); if (mn0) mn0.style.display = 'none'; } }
    if (el.id === 'gr-t-material') { var mn1 = document.getElementById('gr-t-mnote'); if (mn1) mn1.style.display = el.value.indexOf('cat:') === 0 ? '' : 'none'; }
    if (el.id === 'gr-rv-subject') { var rs = document.getElementById('gr-rv-material'); if (rs) rs.innerHTML = materialOptions(el.value, ''); }
    if ((el.id && el.id.indexOf('gr-m-') === 0) || (el.classList && el.classList.contains('gr-m-day'))) updateMatCalc();
  }

  /* ---------- イベント（1回だけ登録） ---------- */
  function bindEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.closest) return;
      if (t.id === 'gr-modal') { closeModal(); return; }
      var root = t.closest('.gr-root, #gr-modal'); if (!root) return;
      var el = t.closest('[data-gr-act]'); if (!el || !root.contains(el)) return;
      if (el.tagName === 'TR' && t.closest('select, input, textarea, button, a, label')) return;
      var fn = ACT[el.getAttribute('data-gr-act')];
      if (fn) { e.preventDefault(); try { fn(el, e); } catch (err) { console.error('[GR] action error', err); toast('処理中にエラーが発生しました：' + err.message); } }
    });
    document.addEventListener('input', function (e) {
      var el = e.target; if (!el.closest) return;
      if (el.closest('#gr-modal')) { if (el.id && el.id.indexOf('gr-m-') === 0) updateMatCalc(); return; }
      if (!el.closest('.gr-root')) return;
      if (el.id === 'gr-g-correct' || el.id === 'gr-g-total') { updateGradePreview(); return; }
      var path = el.getAttribute('data-gr-bind');
      if (!path || !S.plan || el.tagName === 'SELECT' || el.type === 'checkbox') return;
      setPath(S.plan, path, castVal(el)); touch();
    });
    document.addEventListener('change', function (e) {
      var el = e.target; if (!el.closest) return;
      if (el.closest('#gr-modal')) { modalChange(el); return; }
      if (!el.closest('.gr-root')) return;
      var ch = el.getAttribute('data-gr-change');
      if (ch && CHG[ch]) { try { CHG[ch](el); } catch (err) { console.error('[GR] change error', err); } return; }
      var path = el.getAttribute('data-gr-bind'); if (!path || !S.plan) return;
      setPath(S.plan, path, castVal(el)); touch();
      if (el.getAttribute('data-gr-rerender')) rerender();
    });
    document.addEventListener('focusin', function (e) {
      var el = e.target;
      if (el.classList && el.classList.contains('gr-student-sel')) { var html = studentOptions(); if (el.innerHTML !== html) el.innerHTML = html; }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var ov = document.getElementById('gr-modal'); if (ov && ov.style.display !== 'none') closeModal(); }
      if (e.key === 'Enter' && e.target && e.target.id === 'gr-sub-name') { e.preventDefault(); ACT['subject-save'](); }
    });
    // 入力欄から離れた・クリックし終えた時に、待たせていた再描画を行う（他の画面の変更の表示）
    document.addEventListener('focusout', function () { if (S.renderPending) setTimeout(resumeAfterInput, 300); });
    document.addEventListener('mousedown', function () { S.pointerAt = Date.now(); }, true);
    document.addEventListener('mouseup', function () { S.pointerAt = 0; if (S.renderPending) setTimeout(resumeAfterInput, 300); }, true);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); else checkRemote(true); });
    window.addEventListener('focus', function () { checkRemote(false); });
    setInterval(function () {
      if (S.pendingCloud && !S.busy && S.cloud !== 'missing') pushCloud();
      else if (document.visibilityState === 'visible') checkRemote(false);
      if (S.renderPending) resumeAfterInput();
    }, 30000);
  }

  var VIEWS = { strategy: viewStrategy, materials: viewMaterials, monthly: viewMonthly, progress: viewProgress, weekly: viewWeekly, daily: viewDaily, reviews: viewReviews };
  var AFTER = { progress: afterProgress, daily: updateGradePreview };

  function init() {
    if (!document.getElementById('gr-books')) {
      var dl = document.createElement('datalist'); dl.id = 'gr-books';
      document.body.appendChild(dl);
      refreshBookList();
      loadCatalog();
      var dl2 = document.createElement('datalist'); dl2.id = 'gr-unitlabels';
      dl2.innerHTML = ['例題', '問題', '小単元', '単元', '章', '課', 'ページ', 'セクション'].map(function (n) { return '<option value="' + n + '">'; }).join('');
      document.body.appendChild(dl2);
    }
    bindEvents();
    if (visiblePage()) render();
  }

  window.GR = {
    onShow: function (pg) { S.page = pg; render(); checkRemote(true); },
    onStudentChanged: function () { ensureLoaded(); render(); },
    // 生徒登録の保存直後に呼ぶ：計画がなければ自動作成、あれば登録の変更（志望校・偏差値・併願校・メモ）を反映する
    onStudentRegistered: function (prev) {
      S.autoCreate = true; S.syncFrom = prev || null;
      ensureLoaded();
      if (!S.busy) finishAutoCreate();
      render();
    },
    flush: flush,
    render: render,
    // 他の画面との連携（ダッシュボード・合格戦略シート）
    mockTrendHtml: mockTrendHtml,
    planFor: planFor,
    sheetDataAsync: function (st) { return planForAsync(st).then(function (p) { return sheetDataFrom(st, p); }); },
    // 参考書フォルダのカタログ（books.json）
    loadCatalog: loadCatalog,
    catalog: function () { return S.catalog; },
    _debug: { state: S, alloc: alloc, computeAlloc: computeAlloc, matStats: matStats, subjectStats: subjectStats, genWeek: genWeek, autoStages: autoStages, createPlanFor: createPlanFor,
      mergePlans: mergePlans, normalizePlan: normalizePlan, migrate: migrate, checkRemote: checkRemote, pushCloud: pushCloud, derivedFrom: derivedFrom, syncFromStudent: syncFromStudent,
      weeksOfMonth: weeksOfMonth, weekAutoRange: weekAutoRange, weekGoal: weekGoal, weekText: weekText,
      catalogOptionsHtml: catalogOptionsHtml, ensureMaterialFromBook: ensureMaterialFromBook, catalogBookByName: catalogBookByName, materialOptions: materialOptions }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
