
  /* ============================================================
   * 他の画面との連携（v1.2.5）
   *  ・ダッシュボードの生徒一覧：ロードマップの模試結果から「直近の模試」を表示
   *  ・合格戦略シート：「生徒データから反映」でロードマップの内容（戦略・配点・教材・段階・模試）も取り込む
   * ============================================================ */
  // その生徒の計画：表示中ならその計画、なければこの端末の保存分
  function planFor(st) {
    if (!st) return null;
    var key = studentKey(st);
    if (key && key === S.sid && S.plan) return S.plan;
    var local = key ? lsGet(key) : null;
    return local ? migrate(local) : null;
  }
  // 計画をクラウドからも探す（戦略シートへの反映用）
  function planForAsync(st) {
    var p = planFor(st);
    if (p || !cloudFor(st)) return Promise.resolve(p);
    return cloudGet(studentKey(st)).then(function (r) { return (r && r.row && r.row.plan) ? migrate(r.row.plan) : null; }).catch(function () { return null; });
  }
  function mocksSorted(list) {
    return (list || []).filter(function (m) { return m && m.month; }).slice().sort(function (a, b) { return a.month < b.month ? -1 : a.month > b.month ? 1 : 0; });
  }
  // ダッシュボード用：全生徒の模試結果だけをまとめて取り寄せる（60秒に1回まで）
  S.dash = { at: 0, busy: false, mocks: {} };
  function prefetchMocks() {
    if (!cloudEnabled()) return;
    var now = Date.now();
    if (S.dash.busy || now - S.dash.at < 60000) return;
    S.dash.busy = true; S.dash.at = now;
    fetchT(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=student_id,mocks:plan->mocks', { headers: sbHeaders() }).then(function (res) { return res.ok ? res.json() : []; }).then(function (rows) {
      var changed = false;
      (rows || []).forEach(function (row) { var j = JSON.stringify(row.mocks || []); if (S.dash.mocks[row.student_id] !== j) { S.dash.mocks[row.student_id] = j; changed = true; } });
      S.dash.busy = false;
      var pg = document.getElementById('page-dashboard');
      if (changed && pg && pg.classList.contains('active') && typeof renderStudentList === 'function') { try { renderStudentList(); } catch (e) { } }
    }).catch(function () { S.dash.busy = false; });
  }
  function mocksFor(st) {
    var p = planFor(st);
    if (p) return mocksSorted(p.mocks);
    var j = st && st._id && S.dash.mocks[String(st._id)];
    if (j) { try { return mocksSorted(JSON.parse(j)); } catch (e) { } }
    return [];
  }
  // 生徒一覧の1行に出す「直近の模試」
  function mockTrendHtml(st) {
    try { prefetchMocks(); } catch (e) { }
    var list = mocksFor(st);
    if (!list.length) return '';
    var last = list[list.length - 1], prev = list[list.length - 2];
    var subs = sortSubjects(Object.keys(last.devs || {}).filter(function (k) { return num(last.devs[k]) != null; }));
    if (!subs.length && !last.judge) return '';
    var parts = subs.map(function (k) {
      var v = num(last.devs[k]), d = prev ? num(prev.devs && prev.devs[k]) : null, diff = d != null ? v - d : null;
      var col = diff > 0 ? '#2a7f6f' : diff < 0 ? '#c84b31' : '#6b6b80';
      return esc(k) + v + (diff != null ? '<span style="color:' + col + ';font-weight:600">（' + (diff > 0 ? '+' : '') + diff + '）</span>' : '');
    });
    return '<div style="font-size:10px;margin-top:3px;color:var(--ink);font-weight:600;white-space:nowrap;" title="合格ロードマップの模試結果（' + esc(monthLabel(last.month)) + (last.name ? ' ' + esc(last.name) : '') + '）">📈 ' + esc(monthShort(last.month)) + '模試 ' + parts.join('・') + (last.judge ? '　判定' + esc(last.judge) : '')
      + '<span style="color:var(--text-muted);font-weight:400;margin-left:4px;">' + list.length + '回記録</span></div>';
  }
  // 合格戦略シートに流し込む内容を、計画から組み立てる
  function sheetDataFrom(st, p) {
    if (!p) return null;
    var prof = p.profile || {}, subs = (p.subjects || []).slice(), mocks = mocksSorted(p.mocks), last = mocks[mocks.length - 1];
    var cur = prof.currents || {}, tgt = prof.targets || {};
    var rows = [];
    if (prof.school) rows.push(['高校', prof.school]);
    if (prof.altUnivs) rows.push(['併願校', prof.altUnivs]);
    if (prof.examType) rows.push(['入試方式', prof.examType]);
    if (prof.examSubjects) rows.push(['受験科目', prof.examSubjects]);
    var curSubs = subs.filter(function (k) { return num(cur[k]) != null; });
    if (curSubs.length) rows.push(['現状の学力', '模試偏差値' + (last ? '（' + monthShort(last.month) + '）' : '') + '：' + curSubs.map(function (k) { return k + num(cur[k]); }).join(' / ')]);
    if (num(prof.hoursWeekday) != null || num(prof.hoursHoliday) != null) rows.push(['学習可能時間', '平日 ' + (num(prof.hoursWeekday) != null ? prof.hoursWeekday : '—') + '時間　土日 ' + (num(prof.hoursHoliday) != null ? prof.hoursHoliday : '—') + '時間']);
    if (prof.teacher) rows.push(['担当講師', prof.teacher]);
    var weights = (prof.weights || []).filter(function (w) { return w && w.subject && num(w.points) != null; });
    var total = weights.reduce(function (a, w) { return a + num(w.points); }, 0);
    var exam = { univ: (st.univName || '') + (st.dept1 ? ' ' + st.dept1 : ''),
      v1: num(prof.commonRatio) != null ? prof.commonRatio + '%' : '', v2: num(prof.secondRatio) != null ? prof.secondRatio + '%' : '',
      rows: weights.map(function (w) { return [w.subject, String(w.points)]; }), total: weights.length ? String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '' };
    var chart = subs.map(function (k) { return { sub: k, cur: num(cur[k]) != null ? num(cur[k]) : '', tgt: num(tgt[k]) != null ? num(tgt[k]) : '' }; }).filter(function (r) { return r.cur !== '' || r.tgt !== ''; });
    var mockSubs = sortSubjects(uniq([].concat.apply([], mocks.map(function (m) { return Object.keys(m.devs || {}).filter(function (k) { return num(m.devs[k]) != null; }); }))));
    var mockRows = mocks.map(function (m) { return [monthLabel(m.month) + (m.name ? ' ' + m.name : '')].concat(mockSubs.map(function (k) { return num(m.devs && m.devs[k]) != null ? String(m.devs[k]) : '-'; })).concat([m.judge || '-']); });
    return {
      profileRows: rows, goal: prof.goalText || '',
      exam: exam, chart: chart,
      legendCur: last ? '現在（' + monthLabel(last.month) + '模試）' : '', legendTgt: '目標（' + monthLabel(examMonthOf(st)) + '入試）',
      policies: (prof.policies || []).filter(Boolean),
      priorities: (prof.priorities || []).filter(function (x) { return x && (x.title || x.desc); }).map(function (x) { return { t: x.title || '', d: x.desc || '' }; }),
      milestones: (p.stages || []).filter(function (s) { return s.start; }).map(function (s) { return [periodLabel(s.start, s.end), (s.label || '') + (s.note ? '：' + s.note : '')]; }),
      materials: sortedMaterialsOf(p).map(function (m) { return { sub: m.subject || '', name: m.name + (startNo(m) > 1 && num(m.count) ? '（' + autoRange(m) + '）' : ''), purpose: m.purpose || '', start: m.start ? monthShort(m.start.slice(0, 7)) : '', end: m.end ? monthShort(m.end.slice(0, 7)) : '', cycles: (m.rounds || 1) + '周', crit: m.criteria || '' }; }),
      mocks: { header: ['実施時期'].concat(mockSubs).concat(['判定']), rows: mockRows }
    };
  }
  function sortedMaterialsOf(p) {
    return (p.materials || []).slice().sort(function (a, b) {
      var ia = SUBJECT_ORDER.indexOf(a.subject), ib = SUBJECT_ORDER.indexOf(b.subject);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib || String(a.start || '9').localeCompare(String(b.start || '9'));
    });
  }
