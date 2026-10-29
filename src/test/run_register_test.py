"""生徒登録（v1.2.2）のテスト：模擬Supabase（students / roadmap_plans）につないで、
主要対策科目・講師メモの保存、登録し直しでのデータ保持、編集（名前変更を含む）、登録直後のロードマップ自動作成、
登録変更のロードマップへの反映、同名チェック、フォームのリセットを確かめる。"""
import json, subprocess, sys, time, os, uuid, copy
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
import vendor_route

TD = os.path.dirname(os.path.abspath(__file__))
DB = {'students': [], 'plans': {}, 'log': []}
OTHER_ID = '99999999-9999-9999-9999-999999999999'
DB['students'].append({'id': OTHER_ID, 'name': '既存 花子', 'grade': 'high3', 'stream': 'rikei', 'univ_name': '東京理科大学', 'univ_info': {'cat': 'private', 'dev': 60, 'subjects': ['英語', '数学', '化学']},
                       'dept1': '工学部', 'dev_val': 55, 'months': 4, 'exam_month': '2027-02', 'sub_devs': {'数学IA': 55}, 'main_subjects': ['数学IA', '数学2BC'], 'created_at': '2026-10-01T00:00:00Z', 'updated_at': '2026-10-27T00:00:00Z',
                       'strategy_sheet': {'memo': '花子の戦略シート'}, 'test_data': {'1': {'title': 'Week1'}}})


def pick(row, select):
    if not select or select == '*':
        return row
    cols = select.split(',')
    return {c: row.get(c) for c in cols if c in row}


def handle(route, request):
    url = request.url
    q = parse_qs(urlparse(url).query)
    sel = q.get('select', ['*'])[0]
    m = request.method
    if '/auth/v1/' in url:
        return route.fulfill(status=200, content_type='application/json', body='{}')
    if '/rest/v1/students' in url:
        if m == 'GET':
            rows = DB['students']
            idq = q.get('id', [None])[0]
            if idq:
                rows = [r for r in rows if r['id'] == idq[3:]]
            return route.fulfill(status=200, content_type='application/json', body=json.dumps([pick(r, sel) for r in rows]))
        body = json.loads(request.post_data or '{}')
        DB['log'].append({'table': 'students', 'm': m, 'url': url, 'body': body})
        if m == 'POST':
            row = dict(body); row['id'] = str(uuid.uuid4()); row.setdefault('created_at', '2026-10-28T00:00:00Z')
            DB['students'].append(row)
            return route.fulfill(status=201, content_type='application/json', body=json.dumps([row]))
        if m == 'PATCH':
            sid = q.get('id', ['eq.'])[0][3:]
            row = next((r for r in DB['students'] if r['id'] == sid), None)
            if row is None:
                return route.fulfill(status=200, content_type='application/json', body='[]')
            row.update(body)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps([row]))
        if m == 'DELETE':
            sid = q.get('id', ['eq.'])[0][3:]
            DB['students'] = [r for r in DB['students'] if r['id'] != sid]
            return route.fulfill(status=204, body='')
    if '/rest/v1/roadmap_plans' in url:
        sid = (q.get('student_id', ['eq.'])[0] or 'eq.')[3:]
        if m == 'GET':
            row = DB['plans'].get(sid)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps([pick(row, sel)] if row else []))
        body = json.loads(request.post_data or '{}')
        DB['log'].append({'table': 'plans', 'm': m, 'url': url})
        if m == 'POST':
            sid = body['student_id']
            if sid in DB['plans']:
                return route.fulfill(status=201, content_type='application/json', body='[]')
            DB['plans'][sid] = {'student_id': sid, 'plan': body['plan'], 'updated_at': body['updated_at']}
            return route.fulfill(status=201, content_type='application/json', body=json.dumps([pick(DB['plans'][sid], sel)]))
        if m == 'PATCH':
            row = DB['plans'].get(sid)
            cond = q.get('updated_at', [None])[0]
            if row and cond and cond[3:].replace('+00:00', 'Z') == row['updated_at'].replace('+00:00', 'Z'):
                row['plan'] = body['plan']; row['updated_at'] = body['updated_at']
                return route.fulfill(status=200, content_type='application/json', body=json.dumps([pick(row, sel)]))
            return route.fulfill(status=200, content_type='application/json', body='[]')
    return route.fulfill(status=200, content_type='application/json', body='[]')


srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '--bind', '127.0.0.1'], cwd=TD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
res, errors = [], []


def ok(c, label):
    res.append(('OK ' if c else 'NG ') + label)
    if not c:
        print('NG', label)


session = {'access_token': 'tok-staff', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 36000,
           'user': {'id': 'u1', 'email': 'staff@example.com', 'aud': 'authenticated', 'role': 'authenticated'}}


def gr(page, code):
    return page.evaluate(code)


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctx)  # CDNのライブラリはローカルのコピー、他の外部通信は止める
        ctx.route('https://mock-project.supabase.co/**', handle)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.on('console', lambda m_: errors.append('console.error ' + m_.text) if m_.type == 'error' and 'Failed to load resource' not in m_.text else None)
        page.goto('http://127.0.0.1:8771/cloud.html')
        page.evaluate("(s) => { localStorage.clear(); localStorage.setItem('galileo-auth', JSON.stringify(s)); }", session)
        page.goto('http://127.0.0.1:8771/cloud.html')
        page.wait_for_timeout(2000)
        ok(page.locator('#app-body').is_visible(), 'アプリ表示（模擬Supabase）')

        # ---------- 新規登録 ----------
        page.click('.nav-btn:has-text("生徒登録")')
        page.wait_for_timeout(300)
        ok(page.locator('#reg-edit-bar').is_visible() and '新規登録です' in page.inner_text('#reg-edit-status'), '登録画面に「登録済みの生徒を編集」の欄がある')
        opts = page.eval_on_selector_all('#reg-edit-sel option', 'els => els.map(e => e.textContent)')
        ok('既存 花子' in opts, '編集のプルダウンに登録済みの生徒が出る')
        page.fill('#f-name', '登録 一郎')
        page.select_option('#f-grade', 'high2')
        page.fill('#f-exam-month', '2028-02')
        page.fill('#f-univ1', '大阪大学')
        page.wait_for_timeout(300)
        page.select_option('#f-dept1', '基礎工学部')
        page.fill('#f-univ2', '神戸大学')
        page.wait_for_timeout(200)
        for cid in ['sub-math1a', 'sub-math2b', 'sub-math3c', 'sub-physics', 'sub-chemistry', 'sub-eng-r']:
            page.check('#' + cid)
        page.fill('#dev-math1a', '50'); page.fill('#dev-math2b', '48'); page.fill('#dev-physics', '45'); page.fill('#dev-eng-r', '55')
        page.fill('#f-memo', '入塾時メモ：物理の立式が苦手')
        page.click('button[onclick="generateRoadmap()"]')
        page.wait_for_timeout(4500)
        posts = [x for x in DB['log'] if x['table'] == 'students' and x['m'] == 'POST']
        ok(len(posts) == 1, '生徒がDBに1件登録される（POST %d回）' % len(posts))
        row = posts[0]['body'] if posts else {}
        ok(sorted(row.get('main_subjects') or []) == sorted(['数学IA', '数学IIB', '数学IIIC', '物理', '化学', '英語R']), '主要対策科目のチェックがすべて保存される: %s' % row.get('main_subjects'))
        ok(row.get('memo') == '入塾時メモ：物理の立式が苦手', '講師メモが保存される')
        ok(row.get('dept1') == '基礎工学部' and row.get('univ_name') == '大阪大学' and row.get('univ_name2') == '神戸大学', '志望校・学部・第2志望が保存される')
        st = gr(page, "() => _allStudents.find(x => x.name === '登録 一郎')")
        ok(bool(st and st.get('_id')), '登録した生徒にIDが付く')
        ok(page.evaluate("() => (document.querySelector('.page.active') || {}).id") == 'page-groad', '登録後は合格ロードマップの画面へ')
        S = gr(page, "() => { const S = GR._debug.state; return { hasPlan: !!S.plan, sid: S.sid, subjects: S.plan && S.plan.subjects, memo: S.plan && S.plan.profile.memo, alt: S.plan && S.plan.profile.altUnivs, currents: S.plan && S.plan.profile.currents, targets: S.plan && S.plan.profile.targets, hist: S.plan && S.plan.history.map(h => h.after), selected: (document.querySelector('#gr-root-groad .gr-student-sel') || {}).value, status: (document.getElementById('gr-status-groad') || {}).textContent }; }")
        ok(S['hasPlan'] and S['sid'] == st['_id'], '登録と同時に個別合格ロードマップが作られる（生徒IDに紐づく）')
        ok(S['subjects'] == ['英語', '数学', '物理', '化学'], '対象科目に化学も入る: %s' % S['subjects'])
        ok(S['memo'] == '入塾時メモ：物理の立式が苦手', '講師メモがロードマップに取り込まれる')
        ok(S['alt'] == '神戸大学' and S['currents'] == {'数学': 49, '物理': 45, '英語': 55} and S['targets'].get('化学') == 66, '併願校・偏差値の取り込み %s %s' % (S['alt'], S['currents']))
        ok(S['selected'] == st['_id'], '画面上部の生徒選択欄に登録した生徒が表示される')
        ok(any('生徒登録から自動作成' in h for h in S['hist']), '計画変更履歴に自動作成の記録')
        ok(st['_id'] in DB['plans'] and S['status'].strip().startswith('クラウドに保存済み'), 'ロードマップがクラウドに保存される: %s' % S['status'])
        ok(page.locator('#gr-root-groad textarea[data-gr-bind="profile.memo"]').count() == 1, '合格戦略に講師メモの欄がある')

        # ---------- ダッシュボードから編集 ----------
        page.click('.nav-btn:has-text("ダッシュボード")')
        page.wait_for_timeout(400)
        rowsel = page.locator('.student-row:has-text("登録 一郎")')
        ok(rowsel.locator('button:has-text("編集")').count() == 1, 'ダッシュボードの生徒行に「編集」ボタン')
        rowsel.locator('button:has-text("編集")').click()
        page.wait_for_timeout(500)
        ok(page.evaluate("() => (document.querySelector('.page.active') || {}).id") == 'page-new-student', '編集で登録画面へ')
        form = page.evaluate("""() => ({ name: document.getElementById('f-name').value, grade: document.getElementById('f-grade').value, exam: document.getElementById('f-exam-month').value, univ1: document.getElementById('f-univ1').value,
            dept1: document.getElementById('f-dept1').value, univ2: document.getElementById('f-univ2').value, memo: document.getElementById('f-memo').value, physics: document.getElementById('dev-physics').value,
            checks: [...document.querySelectorAll('#main-subject-checks input:checked')].map(e => e.value), status: document.getElementById('reg-edit-status').textContent, btn: document.querySelector('button[onclick="generateRoadmap()"]').textContent.trim(),
            resultShown: document.getElementById('univ-result-1').classList.contains('show'), sel: document.getElementById('reg-edit-sel').value })""")
        ok(form['name'] == '登録 一郎' and form['grade'] == 'high2' and form['exam'] == '2028-02' and form['univ1'] == '大阪大学' and form['dept1'] == '基礎工学部' and form['univ2'] == '神戸大学', '基本情報・志望校がフォームに入る %s' % {k: form[k] for k in ['name', 'grade', 'exam', 'univ1', 'dept1', 'univ2']})
        ok(sorted(form['checks']) == sorted(['数学IA', '数学IIB', '数学IIIC', '物理', '化学', '英語R']) and form['physics'] == '45' and form['memo'] == '入塾時メモ：物理の立式が苦手', '科目チェック・偏差値・メモがフォームに入る')
        ok('編集しています' in form['status'] and '保存してロードマップを更新' in form['btn'] and form['resultShown'] and form['sel'] == st['_id'], '編集中の表示（状態・ボタン名・志望校の判定・プルダウン）')

        # 合格戦略で手で直した値は、登録を変えても上書きされないことを確認するため、先に数学の現在偏差値を手で変える
        page.evaluate("() => { const S = GR._debug.state; S.plan.profile.currents.数学 = 55; S.plan.updatedAt = new Date().toISOString(); }")
        # 他のデータを持たせる（戦略シート・確認テストなど）
        page.evaluate("() => { const s = _allStudents.find(x => x.name === '登録 一郎'); s.strategySheet = { memo: '一郎の戦略シート' }; s.testData = { 1: { title: 'Week1' } }; s.monthlyScores = { '2026-10': { 数学: 60 } }; s.devHistory = { '2026-10': 50 }; s.manualBooks = [{ name: 'テスト参考書', subLabel: '物理', _manual: true }]; }")

        # ---------- 編集して保存（名前も変更） ----------
        page.fill('#f-name', '登録 一郎（改）')
        page.check('#sub-biology')
        page.fill('#dev-physics', '50')
        page.fill('#dev-math1a', '52')
        page.fill('#f-memo', '入塾時メモ：物理の立式が苦手。10月から改善')
        DB['log'].clear()
        page.click('button[onclick="generateRoadmap()"]')
        page.wait_for_timeout(4500)
        ms = [x for x in DB['log'] if x['table'] == 'students']
        ok(len(ms) >= 1 and all(x['m'] == 'PATCH' for x in ms) and all(('id=eq.' + st['_id']) in x['url'] for x in ms), '編集の保存は同じ生徒の更新（PATCH）になる: %s' % [(x['m']) for x in ms])
        names = gr(page, "() => _allStudents.map(x => x.name)")
        ok('登録 一郎（改）' in names and '登録 一郎' not in names and names.count('登録 一郎（改）') == 1, '名前を変えても生徒が増えない: %s' % names)
        s2 = gr(page, "() => { const s = _allStudents.find(x => x.name === '登録 一郎（改）'); return { id: s._id, ss: s.strategySheet, td: Object.keys(s.testData || {}).length, msc: Object.keys(s.monthlyScores || {}).length, dh: Object.keys(s.devHistory || {}).length, mb: (s.manualBooks || []).length, main: s.mainSubjects, memo: s.memo }; }")
        ok(s2['id'] == st['_id'] and s2['ss'] == {'memo': '一郎の戦略シート'} and s2['td'] == 1 and s2['msc'] == 1 and s2['dh'] == 1 and s2['mb'] == 1, '登録し直しても戦略シート・確認テスト・月次テスト・偏差値履歴・参考書が残る %s' % s2)
        dbrow = next(r for r in DB['students'] if r['id'] == st['_id'])
        ok(dbrow.get('strategy_sheet') == {'memo': '一郎の戦略シート'} and dbrow.get('name') == '登録 一郎（改）' and '生物' in (dbrow.get('main_subjects') or []), 'DBの行も上書きで消えない（戦略シート・名前・科目）')
        P = gr(page, "() => { const S = GR._debug.state; return { sid: S.sid, subjects: S.plan.subjects, currents: S.plan.profile.currents, memo: S.plan.profile.memo, created: S.plan.createdAt, hist: S.plan.history.length, student: S.student && S.student.name }; }")
        ok(P['sid'] == st['_id'] and P['student'] == '登録 一郎（改）', '同じロードマップが表示される（作り直されない）')
        ok('生物' in P['subjects'], '追加した科目（生物）がロードマップの対象科目に加わる %s' % P['subjects'])
        ok(P['currents'].get('物理') == 50 and P['currents'].get('数学') == 55, '登録で変えた偏差値は反映され、手で直した値（数学55）は守られる %s' % P['currents'])
        ok(P['memo'] == '入塾時メモ：物理の立式が苦手。10月から改善', '講師メモの変更がロードマップにも反映される')

        # ---------- 同じ名前のチェック ----------
        page.click('.nav-btn:has-text("生徒登録")')
        page.wait_for_timeout(300)
        page.select_option('#reg-edit-sel', st['_id'])
        page.wait_for_timeout(400)
        page.fill('#f-name', '既存 花子')
        DB['log'].clear()
        page.click('button[onclick="generateRoadmap()"]')
        page.wait_for_timeout(1500)
        ok(not DB['log'] and '既存 花子' in page.inner_text('#toast-msg') and page.evaluate("() => (document.querySelector('.page.active') || {}).id") == 'page-new-student', '編集中に別の生徒と同じ名前にすると保存せずに知らせる')

        # ---------- フォームのリセット ----------
        page.click('button:has-text("新規登録に戻す")')
        page.wait_for_timeout(300)
        f2 = page.evaluate("() => ({ name: document.getElementById('f-name').value, univ1: document.getElementById('f-univ1').value, memo: document.getElementById('f-memo').value, checks: document.querySelectorAll('#main-subject-checks input:checked').length, status: document.getElementById('reg-edit-status').textContent, sel: document.getElementById('reg-edit-sel').value })")
        ok(f2['name'] == '' and f2['univ1'] == '' and f2['memo'] == '' and f2['checks'] == 0 and '新規登録です' in f2['status'] and f2['sel'] == '', 'フォームが空になり新規登録に戻る')

        # ---------- 同じ名前を新規として打ち直しても、既存データを引き継ぐ ----------
        page.fill('#f-name', '既存 花子')
        page.fill('#f-univ1', '東京理科大学')
        page.wait_for_timeout(300)
        page.check('#sub-chemistry')
        DB['log'].clear()
        page.click('button[onclick="generateRoadmap()"]')
        page.wait_for_timeout(4500)
        ms = [x for x in DB['log'] if x['table'] == 'students']
        hz = next(r for r in DB['students'] if r['id'] == OTHER_ID)
        ok(all(x['m'] == 'PATCH' for x in ms) and hz.get('strategy_sheet') == {'memo': '花子の戦略シート'} and hz.get('test_data') == {'1': {'title': 'Week1'}} and '化学' in (hz.get('main_subjects') or []), '同じ名前で登録し直しても既存の行を更新し、戦略シート・確認テストが残る')
        ok('数学2BC' in (hz.get('main_subjects') or []) and '数学IA' not in (hz.get('main_subjects') or []), 'チェック欄のない古い科目名（数学2BC）は残り、外したチェック（数学IA）は外れる: %s' % hz.get('main_subjects'))
        ok(len([r for r in DB['students'] if r['name'] == '既存 花子']) == 1, '生徒が二重に増えない')
        ok(gr(page, "() => !!GR._debug.state.plan && GR._debug.state.sid === '" + OTHER_ID + "'"), '既存の生徒にもロードマップが自動で作られる')
        b.close()
finally:
    srv.terminate()
print('\n'.join(res))
print('--- errors (%d) ---' % len(errors))
for e in errors[:20]:
    print(e[:300])
