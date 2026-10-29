/* ============================================================
 * 生徒登録の補強（v1.2.2）
 *  ・登録済みの生徒をフォームに読み込んで編集する（ダッシュボードの「編集」／登録画面のプルダウン）
 *  ・登録し直しても、その生徒の他のデータ（戦略シート・確認テスト・月次テスト・偏差値履歴・手動参考書）を残す
 *  ・主要対策科目のチェックと講師メモを保存する
 *  ・登録（保存）の直後に個別合格ロードマップを自動で作る／既にあれば登録の変更を反映する
 * ============================================================ */
var _regEditing = null;   // 編集中の生徒 { _id, name }（新規登録のときは null）
var REG_DEV_IDS = [['数学IA', 'dev-math1a'], ['数学IIB', 'dev-math2b'], ['数学IIIC', 'dev-math3c'], ['物理', 'dev-physics'], ['化学', 'dev-chemistry'], ['生物', 'dev-biology'], ['地学', 'dev-geology'],
  ['英語R', 'dev-eng-r'], ['英語L', 'dev-eng-l'], ['現代文', 'dev-gendai'], ['古文', 'dev-kobun'], ['漢文', 'dev-kanbun'], ['情報', 'dev-info']];

function _regEl(id) { return document.getElementById(id); }
function _regSet(id, v) { var el = _regEl(id); if (el) el.value = (v == null ? '' : v); }
function _regKey(s) { return s._id ? String(s._id) : 'name:' + s.name; }
function _regPad2(n) { return (n < 10 ? '0' : '') + n; }

// 登録画面のプルダウン（登録済みの生徒）
function regFillSelect() {
  var sel = _regEl('reg-edit-sel'); if (!sel) return;
  var cur = _regEditing ? (_regEditing._id ? String(_regEditing._id) : 'name:' + _regEditing.name) : '';
  sel.innerHTML = '<option value="">── 生徒を選択 ──</option>' + (_allStudents || []).map(function (s) {
    var k = _regKey(s); return '<option value="' + k.replace(/"/g, '&quot;') + '"' + (k === cur ? ' selected' : '') + '>' + String(s.name).replace(/</g, '&lt;') + '</option>';
  }).join('');
  _regUpdateStatus();
}
function _regUpdateStatus() {
  var st = _regEl('reg-edit-status'), btn = document.querySelector('button[onclick="generateRoadmap()"]');
  if (st) st.innerHTML = _regEditing
    ? '「<b>' + String(_regEditing.name).replace(/</g, '&lt;') + '</b>」さんの登録内容を編集しています。保存すると登録内容が上書きされます（戦略シート・確認テスト・合格ロードマップはそのまま残ります）。'
    : '新規登録です。登録済みの生徒を選ぶと、いまの内容がフォームに入ります。';
  if (btn) btn.innerHTML = _regEditing ? '<span>💾</span> 登録内容を保存してロードマップを更新' : '<span>🗺</span> ロードマップを自動生成する';
}

// ダッシュボードの「編集」から
function regEditStudent(name) {
  var s = (_allStudents || []).find(function (x) { return x.name === name; });
  if (!s) { showToast('生徒データが見つかりません'); return; }
  showPage('new-student');
  regLoadStudent(_regKey(s));
}

// 登録済みの生徒をフォームに読み込む
function regLoadStudent(key) {
  if (!key) { regResetForm(); return; }
  var s = (_allStudents || []).find(function (x) { return _regKey(x) === key; });
  if (!s) return;
  _regEditing = { _id: s._id || null, name: s.name };
  _regSet('f-name', s.name);
  _regSet('f-enrolled', s.enrolled || '');
  var exam = s.examMonth || ((s.goalYear != null && s.goalMonth != null && s.goalYear !== '') ? s.goalYear + '-' + _regPad2(+s.goalMonth + 1) : '');
  _regSet('f-exam-month', exam);
  _regSet('f-grade', s.grade || 'high3');
  _regSet('f-stream', s.stream || 'rikei');
  _regFillUniv(1, s.univName, s.univInfo, s.dept1);
  _regFillUniv(2, s.univName2, s.univInfo2, s.dept2);
  _regFillUniv(3, s.univName3, s.univInfo3, s.dept3);
  _regSet('f-level', s.levelVal || 2);
  _regSet('f-deviation', s.devVal || '');
  var main = Array.isArray(s.mainSubjects) ? s.mainSubjects : [];
  document.querySelectorAll('#main-subject-checks input[type="checkbox"]').forEach(function (cb) { cb.checked = main.indexOf(cb.value) >= 0; try { updateSubCheckStyle(cb); } catch (e) { } });
  var sd = s.subDevs || {};
  REG_DEV_IDS.forEach(function (x) { _regSet(x[1], sd[x[0]] != null ? sd[x[0]] : ''); });
  _regSet('f-memo', s.memo || '');
  for (var i = 1; i <= 4; i++) { var st = _regEl('step-' + i); if (st) { st.classList.remove('active', 'done'); if (i === 1) st.classList.add('active'); } }
  regFillSelect();
  var sel = _regEl('reg-edit-sel'); if (sel) sel.value = key;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function _regFillUniv(idx, name, info, dept) {
  var inp = _regEl('f-univ' + idx); if (!inp) return;
  inp.value = name || '';
  delete _univCustom[idx]; delete _selectedUniv[idx];
  _regSet('f-univ' + idx + '-dev-override', ''); _regSet('f-univ' + idx + '-unknown-dev', ''); _regSet('f-univ' + idx + '-unknown-subjects', '');
  var manualWrap = _regEl('univ-manual-dev-wrap-' + idx), unknownWrap = _regEl('univ-unknown-wrap-' + idx), result = _regEl('univ-result-' + idx);
  if (!name) { if (result) result.classList.remove('show'); if (manualWrap) manualWrap.style.display = 'none'; if (unknownWrap) unknownWrap.style.display = 'none'; updateDeptSelect(idx, ''); return; }
  var base = UNIV_DB[name];
  if (base) {
    searchUniv(idx, name);
    if (info && info.dev && +info.dev !== +base.dev) { _regSet('f-univ' + idx + '-dev-override', info.dev); applyDevOverride(idx); }
  } else {
    // 大学データにない大学：登録されている偏差値・科目・種別をそのまま入れる
    _regSet('f-univ' + idx + '-unknown-dev', info && info.dev ? info.dev : '');
    _regSet('f-univ' + idx + '-unknown-subjects', (info && Array.isArray(info.subjects) ? info.subjects : []).join(', '));
    _regSet('f-univ' + idx + '-unknown-cat', (info && info.cat) || 'private');
    if (manualWrap) manualWrap.style.display = 'none';
    if (unknownWrap) unknownWrap.style.display = 'block';
    var sg = _regEl('univ-suggest-' + idx); if (sg) sg.style.display = 'none';
    applyUnknownUniv(idx);
    updateDeptSelect(idx, name);
  }
  var dsel = _regEl('f-dept' + idx);
  if (!dsel) return;
  if (dsel.tagName === 'SELECT') {
    var has = Array.prototype.some.call(dsel.options, function (o) { return o.value === dept; });
    if (dept && has) dsel.value = dept;
    else if (dept) { switchDeptToText(idx); _regSet('f-dept' + idx, dept); }
  } else dsel.value = dept || '';
}
// フォームを空にして新規登録に戻す
function regResetForm() {
  _regEditing = null;
  _regSet('f-name', ''); _regSet('f-enrolled', ''); _regSet('f-memo', ''); _regSet('f-deviation', '');
  _regSet('f-grade', 'high3'); _regSet('f-stream', 'rikei'); _regSet('f-level', '2');
  try { autoFillExamMonth(); } catch (e) { }
  [1, 2, 3].forEach(function (i) { _regFillUniv(i, '', null, ''); });
  document.querySelectorAll('#main-subject-checks input[type="checkbox"]').forEach(function (cb) { cb.checked = false; try { updateSubCheckStyle(cb); } catch (e) { } });
  REG_DEV_IDS.forEach(function (x) { _regSet(x[1], ''); });
  for (var i = 1; i <= 4; i++) { var st = _regEl('step-' + i); if (st) { st.classList.remove('active', 'done'); if (i === 1) st.classList.add('active'); } }
  regFillSelect();
  var sel = _regEl('reg-edit-sel'); if (sel) sel.value = '';
}
// 保存前の名前チェック：編集中に別の生徒と同じ名前にしようとしていないか
function _regCheckName(name) {
  var dup = (_allStudents || []).find(function (x) { return x.name === name && (!_regEditing || (x._id ? x._id !== _regEditing._id : x.name !== _regEditing.name)); });
  if (_regEditing && dup) { showToast('同じ名前の生徒「' + name + '」がすでに登録されています。名前を変えてください'); return false; }
  return true;
}
// 登録し直し・編集のときに引き継ぐ元の生徒データ
function _regFindExisting(name) {
  var list = _allStudents || [];
  if (_regEditing) {
    var hit = _regEditing._id ? list.find(function (x) { return x._id === _regEditing._id; }) : list.find(function (x) { return x.name === _regEditing.name; });
    if (hit) return hit;
  }
  return list.find(function (x) { return x.name === name; }) || null;
}
// 保存のあと：編集状態を解除し、個別合格ロードマップを作成／更新する
function _regAfterSave(saved, prev) {
  _regEditing = null;
  try { regFillSelect(); } catch (e) { }
  if (window.GR && typeof GR.onStudentRegistered === 'function') {
    try { GR.onStudentRegistered(prev); } catch (e) { console.warn('[GR] 登録後の処理でエラー:', e); }
  }
}

// 生徒を切り替えるとき：確認テスト・月次テストなどページ共通の状態を、その生徒のデータで置き換える
// （前に表示していた生徒のデータが、次の生徒の保存に混ざらないように）
function _loadPageStateFromStudent(s) {
  try {
    var cp = function (v, d) { return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : d; };
    testData = cp(s.testData, {});
    testAnswerVisible = {};
    currentTestWeek = null;
    monthlyScores = cp(s.monthlyScores, {});
    monthlyTestData = s.monthlyTestData ? cp(s.monthlyTestData, null) : null;
    monthlyAnsVisible = false;
    if (Array.isArray(s.manualBooks)) s.manualBooks.forEach(function (b) { if (b && typeof b === 'object' && b._manual == null) b._manual = true; });
  } catch (e) { console.warn('[REG] 生徒データの読み込みでエラー:', e); }
}

// 合格戦略シートに、個別合格ロードマップから組み立てた内容（GR.sheetDataAsync の結果）を流し込む
function ssApplyRoadmap(sd) {
  if (!sd || typeof ssData === 'undefined' || !ssData) return;
  function setRow(key, val) { if (val == null || val === '') return; var r = ssData.profile.rows.find(function (x) { return x[0] === key; }); if (r) r[1] = String(val); else ssData.profile.rows.push([key, String(val)]); }
  (sd.profileRows || []).forEach(function (r) { setRow(r[0], r[1]); });
  if (sd.goal) ssData.profile.goal = sd.goal;
  if (sd.exam) {
    if (sd.exam.univ) ssData.profile.exam.univ = sd.exam.univ;
    if (sd.exam.v1) ssData.profile.exam.v1 = sd.exam.v1;
    if (sd.exam.v2) ssData.profile.exam.v2 = sd.exam.v2;
    if (sd.exam.rows && sd.exam.rows.length) { ssData.profile.exam.rows = sd.exam.rows; ssData.profile.exam.total = sd.exam.total; }
  }
  if (sd.chart && sd.chart.length) ssData.strategy.chart.rows = sd.chart;
  if (sd.legendCur) ssData.strategy.chart.legendCur = sd.legendCur;
  if (sd.legendTgt) ssData.strategy.chart.legendTgt = sd.legendTgt;
  if (sd.policies && sd.policies.length) ssData.strategy.policies = sd.policies;
  if (sd.priorities && sd.priorities.length) ssData.strategy.priorities = sd.priorities;
  if (sd.milestones && sd.milestones.length) ssData.strategy.milestones = sd.milestones;
  if (sd.materials && sd.materials.length) ssData.materials.rows = sd.materials;
  if (sd.mocks && sd.mocks.rows && sd.mocks.rows.length) { ssData.mock.header = sd.mocks.header; ssData.mock.rows = sd.mocks.rows; }
}
