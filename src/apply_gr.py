#!/usr/bin/env python3
"""戦略管理システムの index.html に「個別合格ロードマップ（v1.2）」を組み込む。
使い方: python3 -I apply_gr.py <元のindex.html> <出力先>
元ファイルは変更しない。差し込み位置が見つからない場合は停止する。"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSION = 'v1.2.7'


def fail(msg):
    sys.exit('[apply_gr] 失敗: ' + msg)


def func_range(src, name):
    """`function name(` から対応する閉じ括弧までの範囲を返す（文字列・コメントは単純に扱う）"""
    m = re.search(r'\n(?:async )?function ' + re.escape(name) + r'\s*\(', src)
    if not m:
        fail(name + ' が見つかりません')
    i = src.index('{', m.end())
    depth = 0
    j = i
    in_str = None
    while j < len(src):
        c = src[j]
        if in_str:
            if c == '\\':
                j += 2
                continue
            if c == in_str:
                in_str = None
        elif c in '\'"`':
            in_str = c
        elif c == '/' and src[j + 1:j + 2] == '/':
            j = src.index('\n', j)
            continue
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return m.start() + 1, j + 1
        j += 1
    fail(name + ' の終わりが見つかりません')


def replace_once(src, old, new, label):
    n = src.count(old)
    if n != 1:
        fail('%s（%d箇所見つかりました）' % (label, n))
    return src.replace(old, new)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = Path(sys.argv[1]).read_text(encoding='utf-8')
    if 'id="page-groad"' in src:
        fail('すでに組み込み済みのファイルです')

    css = (HERE / 'gr.css').read_text(encoding='utf-8')
    pages = (HERE / 'gr_pages.html').read_text(encoding='utf-8')
    js = ''.join((HERE / f).read_text(encoding='utf-8') for f in ['gr_a_core.js', 'gr_f_catalog.js', 'gr_b_views1.js', 'gr_c_views2.js', 'gr_e_bridge.js', 'gr_d_ui.js'])
    reg_js = (HERE / 'reg_patch.js').read_text(encoding='utf-8')
    reg_bar = (HERE / 'reg_bar.html').read_text(encoding='utf-8')

    # 1) バージョン表記
    src, n1 = re.subn(r'<title>ガリレオ 戦略管理システム v[\d.]+</title>', '<title>ガリレオ 戦略管理システム ' + VERSION + '</title>', src, count=1)
    src, n2 = re.subn(r'GALILEO SCIENCE EXAM STRATEGY — v[\d.]+', 'GALILEO SCIENCE EXAM STRATEGY — ' + VERSION, src, count=1)
    if not (n1 and n2):
        fail('バージョン表記の場所が見つかりません')

    # 2) CSS（専用の<style>ブロックとして最初の</style>の直後に追加）
    k = src.index('</style>') + len('</style>')
    src = src[:k] + '\n<style id="gr-style">' + css + '</style>' + src[k:]

    # 3) ナビ：旧2タブを新機能へ
    src = replace_once(src, '''onclick="showPage('roadmap')">ロードマップ</button>''', '''onclick="showPage('groad')">合格ロードマップ</button>''', 'ロードマップのナビボタン')
    src = replace_once(src, '''onclick="showPage('weekly-plan')">1ヶ月プラン</button>''', '''onclick="showPage('gweek')">週間・毎日課題</button>''', '1ヶ月プランのナビボタン')
    # v1.2.5：確認テスト・実力診断・推移予測はナビから外す（ページとデータは残す。ボタンの並び順を保つため非表示にする）
    for label, pg in [('確認テスト', 'tests'), ('実力診断', 'monthly'), ('推移予測', 'prediction')]:
        src = replace_once(src, '''<button class="nav-btn" onclick="showPage('%s')">%s</button>''' % (pg, label),
                           '''<button class="nav-btn" onclick="showPage('%s')" style="display:none" data-retired="1">%s</button>''' % (pg, label), label + 'のナビボタン')

    # 4) ページ（メインスクリプトの直前に追加）
    anchor = '\n<script>\n// ===== DATA ====='
    if src.count(anchor) != 1:
        fail('メインスクリプトの開始位置が見つかりません')
    src = src.replace(anchor, pages + anchor)

    # 5) showPage：旧ページ名の読み替え・ナビの点灯・新ページの描画
    a, b = func_range(src, 'showPage')
    f = src[a:b]
    f = f.replace('function showPage(name) {', "function showPage(name) {\n  // v1.2：旧「ロードマップ」「1ヶ月プラン」は個別合格ロードマップに置き換え（旧ページは非表示のまま残す）\n  if (name === 'roadmap') name = 'groad';\n  if (name === 'weekly-plan') name = 'gweek';\n  // v1.2.5：確認テストは週間・毎日課題へ、実力診断・推移予測は合格ロードマップへ（旧ページは残すがナビからは外す）\n  if (name === 'tests') name = 'gweek';\n  if (name === 'monthly' || name === 'prediction') name = 'groad';", 1)
    if "'weekly-plan':3" not in f:
        fail('showPage のナビ対応表が見つかりません')
    f = f.replace("'weekly-plan':3", "'weekly-plan':3, 'groad':2, 'gweek':3", 1)
    if 'window.scrollTo(' not in f:
        fail('showPage の scrollTo が見つかりません')
    f = f.replace('  window.scrollTo(', "  // 個別合格ロードマップの描画\n  if ((name === 'groad' || name === 'gweek') && window.GR) { try { GR.onShow(name); } catch (e) { console.warn('[GR] 表示エラー:', e); } }\n\n  window.scrollTo(", 1)
    src = src[:a] + f + src[b:]

    # 6) 生徒切替：個別合格ロードマップにも通知。
    #    旧画面（非表示）の描画でエラーが出ても、他の画面の初期化と通知が止まらないようにする
    a, b = func_range(src, '_initAllPagesForStudent')
    f = src[a:b]
    f2 = re.sub(r'^(\s+)(\w+)\(\);\s*$', lambda m: "%stry { %s(); } catch (e) { console.warn('[INIT] %s でエラー（他の画面は続行）:', e); }" % (m.group(1), m.group(2), m.group(2)), f, flags=re.M)
    if f2 == f:
        fail('_initAllPagesForStudent の中身が想定と違います')
    src = src[:a] + f2 + src[b:]

    a, b = func_range(src, '_switchToStudent')
    f = src[a:b]
    if f.count('  renderRoadmap();') != 1:
        fail('_switchToStudent の renderRoadmap が見つかりません')
    f = f.replace('  renderRoadmap();', "  try { renderRoadmap(); } catch (e) { console.warn('[INIT] renderRoadmap でエラー（他の画面は続行）:', e); }", 1)
    hook = "    if (window.GR) { try { GR.onStudentChanged(); } catch (e) { console.warn('[GR] 生徒切替エラー:', e); } }\n"
    if f.count('    return;\n  }\n  // キャッシュなし') != 1:
        fail('_switchToStudent のキャッシュ復元分岐が見つかりません')
    f = f.replace('    return;\n  }\n  // キャッシュなし', hook + '    return;\n  }\n  // キャッシュなし', 1)
    f = f[:f.rindex('}')] + "  if (window.GR) { try { GR.onStudentChanged(); } catch (e) { console.warn('[GR] 生徒切替エラー:', e); } }\n}"
    if f.count('  currentStudent = s;\n') != 1:
        fail('_switchToStudent の currentStudent 代入が見つかりません')
    f = f.replace('  currentStudent = s;\n', "  currentStudent = s;\n  // v1.2.2：確認テスト・月次テストなどページ共通の状態を、この生徒のデータに置き換える（前の生徒のデータが混ざらないように）\n  if (typeof _loadPageStateFromStudent === 'function') _loadPageStateFromStudent(s);\n", 1)
    src = src[:a] + f + src[b:]

    a, b = func_range(src, '_restoreLastStudent')
    f = src[a:b]
    f = f.replace('      renderRoadmap();', "      try { renderRoadmap(); } catch (e2) { console.warn('[INIT] renderRoadmap でエラー（他の画面は続行）:', e2); }", 1)
    tail = "  } catch(e) { console.warn('[RESTORE] 復元失敗:', e); }"
    if f.count(tail) != 1:
        fail('_restoreLastStudent の終わりが見つかりません')
    f = f.replace(tail, hook + tail, 1)
    src = src[:a] + f + src[b:]

    # 6b) 生徒登録：編集バー
    src = replace_once(src, '''      <div class="section-desc">生徒情報を入力すると、合格ロードマップが自動生成されます</div>
    </div>
''', '''      <div class="section-desc">生徒情報を入力すると、合格ロードマップが自動生成されます</div>
    </div>
''' + reg_bar, '生徒登録の見出し')

    # 6c) 生徒登録：主要対策科目をすべて保存・講師メモ・既存データの引き継ぎ・保存後の処理
    a, b = func_range(src, 'generateRoadmap')
    f = src[a:b]
    def rep_f(old, new, label):
        nonlocal f
        if f.count(old) != 1:
            fail('関数の修正: %s（%d箇所）' % (label, f.count(old)))
        f = f.replace(old, new)
    rep_f("  const name     = document.getElementById('f-name').value || '新規生徒';\n",
          "  const name     = (document.getElementById('f-name').value || '').trim() || '新規生徒';\n  if (typeof _regCheckName === 'function' && !_regCheckName(name)) return;\n", '名前の取得')
    rep_f("""  const subCheckIds = ['sub-eng-r','sub-eng-l','sub-math1a','sub-math2bc','sub-gendai','sub-kobun','sub-kanbun','sub-jpnhist','sub-wldhist','sub-geo','sub-civics','sub-sci-basic','sub-info'];
  subCheckIds.forEach(function(id) {
    const el = document.getElementById(id);
    if (el && el.checked) mainSubjects.push(el.value);
  });""",
          """  // 画面にある主要対策科目のチェックをすべて集める（理系・文系どちらの科目構成でも保存できるように）
  document.querySelectorAll('#main-subject-checks input[type="checkbox"]:checked').forEach(function(el) {
    if (el.value && mainSubjects.indexOf(el.value) < 0) mainSubjects.push(el.value);
  });""", '主要対策科目の収集')
    rep_f("""  var _existingStudent = _allStudents.find(function(x) { return x.name === name; });
  var _newStudentObj = { name, grade, stream, univName, univInfo, dept1, levelVal, devVal, enrolled, months, goalYear, goalMonth,
    examMonth: examMonthInput || null,
    univName2, univInfo2, dept2, univName3, univInfo3, dept3, subDevs, mainSubjects,
    timelineData: _existingStudent ? _existingStudent.timelineData : null,
    adviceData: _existingStudent ? _existingStudent.adviceData : null };""",
          """  // 既存の生徒（編集中の生徒、または同じ名前の生徒）のデータを引き継ぎ、フォームの内容で上書きする
  // （戦略シート・確認テスト・月次テスト・偏差値履歴・手動で追加した参考書などが消えないように）
  var _existingStudent = (typeof _regFindExisting === 'function') ? _regFindExisting(name) : _allStudents.find(function(x) { return x.name === name; });
  var _prevStudentCopy = _existingStudent ? JSON.parse(JSON.stringify(_existingStudent)) : null;
  var _newStudentObj = Object.assign({}, _existingStudent || {}, { name, grade, stream, univName, univInfo, dept1, levelVal, devVal, enrolled, months, goalYear, goalMonth,
    examMonth: examMonthInput || null,
    univName2, univInfo2, dept2, univName3, univInfo3, dept3, subDevs, mainSubjects,
    memo: ((document.getElementById('f-memo') || {}).value || '').trim(),
    timelineData: _existingStudent ? _existingStudent.timelineData : null,
    adviceData: _existingStudent ? _existingStudent.adviceData : null });
  if (_existingStudent && _existingStudent._id) _newStudentObj._id = _existingStudent._id;
  // 画面にチェック欄のない古い科目名（例：数学2BC）は、既存の登録から引き継ぐ（外す手段がないため消さない）
  if (_existingStudent && Array.isArray(_existingStudent.mainSubjects)) {
    var _knownSubs = Array.prototype.map.call(document.querySelectorAll('#main-subject-checks input[type="checkbox"]'), function(el) { return el.value; });
    _existingStudent.mainSubjects.forEach(function(v) { if (v && _knownSubs.indexOf(v) < 0 && mainSubjects.indexOf(v) < 0) mainSubjects.push(v); });
  }""", '生徒データの組み立て')
    rep_f("""      var _existingForCount = _allStudents.find(function(x) { return x.name === _newStudentObj.name; });
      _newStudentObj.roadmapCount = (_existingForCount ? (_existingForCount.roadmapCount || 0) : 0) + 1;""",
          """      _newStudentObj.roadmapCount = (_existingStudent ? (_existingStudent.roadmapCount || 0) : 0) + 1;""", 'ロードマップ回数')
    rep_f("""      var saved = _allStudents.find(function(x) { return x.name === _newStudentObj.name; });
      if (saved && saved._id && currentStudent && currentStudent.name === _newStudentObj.name) {
        currentStudent._id = saved._id;
      }""",
          """      var saved = _allStudents.find(function(x) { return x.name === _newStudentObj.name; });
      if (saved && saved._id && currentStudent && currentStudent.name === _newStudentObj.name) {
        currentStudent._id = saved._id;
      }
      if (saved && saved.memo == null) saved.memo = _newStudentObj.memo;""", '保存後のID反映')
    rep_f("""    renderStudentList();
    showToast('ロードマップを生成しました ✓');""",
          """    renderStudentList();
    showToast('ロードマップを生成しました ✓');
    if (typeof _regAfterSave === 'function') { try { _regAfterSave(_newStudentObj, _prevStudentCopy); } catch (e) { console.warn('[REG] 登録後の処理でエラー:', e); } }""", '保存後の処理')
    src = src[:a] + f + src[b:]

    # 6d) 保存：IDがあればIDで既存行を探す（名前を直したときも同じ生徒として更新する）
    a, b = func_range(src, '_saveStudentToListInner')
    f = src[a:b]
    rep_f("  const existingIdx = _allStudents.findIndex(x => x.name === s.name);\n",
          "  let existingIdx = s._id ? _allStudents.findIndex(x => x._id === s._id) : -1;\n  if (existingIdx < 0) existingIdx = _allStudents.findIndex(x => x.name === s.name);\n", '既存行の検索')
    src = src[:a] + f + src[b:]

    # 6e) DB⇄JS の変換に講師メモを追加
    src = replace_once(src, "    strategySheet: _parseJsonCol(row.strategy_sheet, null),\n",
        "    strategySheet: _parseJsonCol(row.strategy_sheet, null),\n    memo: row.memo || '',\n"
        "    univName2: row.univ_name2 || '', univInfo2: _parseJsonCol(row.univ_info2, null), dept2: row.dept2 || '',\n"
        "    univName3: row.univ_name3 || '', univInfo3: _parseJsonCol(row.univ_info3, null), dept3: row.dept3 || '',\n", '行→生徒の変換（memo・第2第3志望）')
    src = replace_once(src, "    strategy_sheet: s.strategySheet || null,\n",
        "    strategy_sheet: s.strategySheet || null,\n    memo: s.memo || '',\n"
        "    univ_name2: s.univName2 || '', univ_info2: s.univInfo2 || null, dept2: s.dept2 || '',\n"
        "    univ_name3: s.univName3 || '', univ_info3: s.univInfo3 || null, dept3: s.dept3 || '',\n", '生徒→行の変換（memo・第2第3志望）')

    # 6f) ダッシュボードの生徒一覧に「編集」
    src = replace_once(src, '''        + '<button onclick="event.stopPropagation();deleteStudentFromList(\\'' + dn + '\\')" style="margin-left:8px;padding:2px 8px;font-size:10px;background:transparent;border:1px solid #e0c0b8;border-radius:4px;color:#c84b31;cursor:pointer;font-family:inherit;">削除</button></div>\'''',
        '''        + '<button onclick="event.stopPropagation();regEditStudent(\\'' + dn + '\\')" style="margin-left:8px;padding:2px 8px;font-size:10px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--ink);cursor:pointer;font-family:inherit;">編集</button>'
        + '<button onclick="event.stopPropagation();deleteStudentFromList(\\'' + dn + '\\')" style="margin-left:6px;padding:2px 8px;font-size:10px;background:transparent;border:1px solid #e0c0b8;border-radius:4px;color:#c84b31;cursor:pointer;font-family:inherit;">削除</button></div>\'''', '生徒一覧の削除ボタン')

    # 6f2) ダッシュボードの生徒一覧：「直近実績」（推移予測の記録）→ ロードマップの模試結果
    a, b = func_range(src, 'renderStudentList')
    f = src[a:b]
    i = f.find('      // 推移実績の最新値を取得\n      var trendHtml = \'\';\n')
    j = f.find("      return '<div class=\"student-row\" onclick=\"loadStudentFromList(", i)
    if i < 0 or j < 0:
        fail('renderStudentList の推移実績ブロックが見つかりません')
    f = f[:i] + "      // v1.2.5：直近の模試は個別合格ロードマップの模試結果から表示\n      var trendHtml = '';\n      try { if (window.GR && GR.mockTrendHtml) trendHtml = GR.mockTrendHtml(s) || ''; } catch (e) { }\n\n" + f[j:]
    src = src[:a] + f + src[b:]

    # 6f3) 合格戦略シート「生徒データから反映」：ロードマップの内容も取り込む
    a, b = func_range(src, 'ssApplyStudent')
    f = src[a:b]
    rep_f("""  ssConfirm('選択中の生徒「'+ssEsc(currentStudent.name)+'」の登録データ（氏名・学年・志望校・偏差値など）をシートに反映します。<br>該当する欄は上書きされます。よろしいですか？', function(){""",
          """  ssConfirm('選択中の生徒「'+ssEsc(currentStudent.name)+'」の登録データ（氏名・学年・志望校・偏差値など）と、個別合格ロードマップの内容（合格戦略・配点・教材・学習段階・模試結果）をシートに反映します。<br>該当する欄は上書きされます。よろしいですか？', function(){""", '反映の確認文')
    rep_f("""    ssRender(); ssSave(false);
    ssToast('生徒データを反映しました。細部は直接編集で調整してください');
  });""",
          """    var _ssDone=function(withPlan){ ssRender(); ssSave(false); ssToast(withPlan?'生徒データとロードマップの内容を反映しました。細部は直接編集で調整してください':'生徒データを反映しました（ロードマップは未作成）。細部は直接編集で調整してください'); };
    if(window.GR && GR.sheetDataAsync){
      ssToast('ロードマップの内容を読み込んでいます…');
      GR.sheetDataAsync(s).then(function(sd){ var ok=false; if(sd){ try{ ssApplyRoadmap(sd); ok=true; }catch(e){ console.warn('[SS] ロードマップ反映エラー', e); } } _ssDone(ok); }).catch(function(){ _ssDone(false); });
    } else _ssDone(false);
  });""", '反映の実行')
    src = src[:a] + f + src[b:]

    # 6g) 登録画面を開いたらプルダウンを更新
    a, b = func_range(src, 'showPage')
    f = src[a:b]
    rep_f("  // 個別合格ロードマップの描画\n", "  if (name === 'new-student' && typeof regFillSelect === 'function') { try { regFillSelect(); } catch (e) { } }\n\n  // 個別合格ロードマップの描画\n", '登録画面の初期化')
    src = src[:a] + f + src[b:]

    # 7) モジュール本体（</body>の直前）
    if src.count('</body>') < 1:
        fail('</body> が見つかりません')
    k = src.rindex('</body>')
    src = src[:k] + '<script>\n' + reg_js + '\n</script>\n<script>\n' + js + '\n</script>\n' + src[k:]

    Path(sys.argv[2]).write_text(src, encoding='utf-8')
    print('[apply_gr] 完了:', sys.argv[2], len(src.encode('utf-8')), 'bytes')


if __name__ == '__main__':
    main()
