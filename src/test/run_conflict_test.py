"""同時編集のテスト：PostgREST の条件付き更新を模擬した Supabase に、2台の端末（別コンテキスト）と
同じブラウザの2つのタブからつないで、変更が消えずにまとまるかを確かめる。"""
import json, subprocess, sys, time, os, copy
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
import vendor_route

TD = os.path.dirname(os.path.abspath(__file__))
SID = '22222222-2222-2222-2222-222222222222'
SID2 = '33333333-3333-3333-3333-333333333333'
students_rows = [
    {'id': SID, 'name': '同時 編集', 'grade': 'high3', 'stream': 'rikei', 'univ_name': '東京科学大学', 'univ_info': {'cat': 'national', 'dev': 65, 'subjects': ['英語', '数学', '物理']},
     'dept1': '理学院', 'dev_val': 52, 'months': 5, 'exam_month': '2027-02', 'sub_devs': {'数学IA': 50, '物理': 45}, 'main_subjects': [], 'created_at': '2026-10-01T00:00:00Z', 'updated_at': '2026-10-27T00:00:00Z'},
    {'id': SID2, 'name': '新規 作成', 'grade': 'high2', 'stream': 'rikei', 'univ_name': '大阪大学', 'univ_info': {'cat': 'national', 'dev': 62, 'subjects': ['数学', '物理']},
     'dept1': '基礎工学部', 'dev_val': 50, 'months': 16, 'exam_month': '2028-02', 'sub_devs': {'数学IA': 50}, 'main_subjects': [], 'created_at': '2026-10-01T00:00:00Z', 'updated_at': '2026-10-27T00:00:00Z'},
]
DB = {'rows': {}, 'log': [], 'drop_next_patch_response': False}


def ts(s):
    s = s.replace('Z', '+00:00')
    return datetime.fromisoformat(s)


def pg_ts(s):
    # Postgres の timestamptz の返し方に寄せる（"+00:00" 形式）
    return ts(s).astimezone(timezone.utc).isoformat(timespec='milliseconds')


def pick(row, select):
    cols = (select or 'plan,updated_at,student_id').split(',')
    return {c: row[c] for c in cols if c in row}


def handle(route, request):
    url = request.url
    if '/rest/v1/students' in url:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(students_rows))
    if '/auth/v1/' in url:
        return route.fulfill(status=200, content_type='application/json', body='{}')
    if '/rest/v1/roadmap_plans' not in url:
        return route.fulfill(status=200, content_type='application/json', body='[]')
    q = parse_qs(urlparse(url).query)
    sel = q.get('select', [None])[0]
    sid = (q.get('student_id', ['eq.'])[0] or 'eq.')[3:]
    prefer = request.headers.get('prefer', '') or ''
    m = request.method
    DB['log'].append({'m': m, 'q': {k: v[0] for k, v in q.items()}, 'prefer': prefer})
    if m == 'GET':
        row = DB['rows'].get(sid)
        return route.fulfill(status=200, content_type='application/json', body=json.dumps([pick(row, sel)] if row else []))
    if m == 'POST':
        body = json.loads(request.post_data)
        sid = body['student_id']
        if sid in DB['rows']:
            if 'ignore-duplicates' in prefer:
                return route.fulfill(status=201, content_type='application/json', body='[]')
            if 'merge-duplicates' not in prefer:
                return route.fulfill(status=409, content_type='application/json', body=json.dumps({'code': '23505', 'message': 'duplicate key'}))
        row = {'student_id': sid, 'plan': body['plan'], 'updated_at': pg_ts(body['updated_at'])}
        DB['rows'][sid] = row
        if 'return=representation' in prefer:
            return route.fulfill(status=201, content_type='application/json', body=json.dumps([pick(row, sel)]))
        return route.fulfill(status=201, body='')
    if m == 'PATCH':
        body = json.loads(request.post_data)
        row = DB['rows'].get(sid)
        cond = q.get('updated_at', [None])[0]
        match = row is not None and (cond is None or ts(cond[3:]) == ts(row['updated_at']))
        if match:
            row['plan'] = body['plan']
            row['updated_at'] = pg_ts(body['updated_at'])
            if DB['drop_next_patch_response']:
                DB['drop_next_patch_response'] = False
                return route.fulfill(status=503, content_type='application/json', body='{"message":"timeout"}')
        out = [pick(row, sel)] if match else []
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    return route.fulfill(status=405, body='')


srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--bind', '127.0.0.1'], cwd=TD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
res, errors = [], []


def ok(c, label):
    res.append(('OK ' if c else 'NG ') + label)
    if not c:
        print('NG', label)


def session(email):
    return {'access_token': 'tok-' + email, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 36000,
            'user': {'id': email, 'email': email, 'aud': 'authenticated', 'role': 'authenticated'}}


def open_page(ctx, email, sid=SID, fresh=True):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: errors.append('console.error ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.goto('http://127.0.0.1:8768/cloud.html')
    if fresh:
        page.evaluate("(s) => { localStorage.clear(); localStorage.setItem('galileo-auth', JSON.stringify(s)); }", session(email))
        page.goto('http://127.0.0.1:8768/cloud.html')
    page.wait_for_timeout(1800)
    page.click('.nav-btn:has-text("合格ロードマップ")')
    page.wait_for_timeout(200)
    page.select_option('#gr-root-groad .gr-student-sel', sid)
    page.wait_for_timeout(900)
    return page


def st(page):
    return page.evaluate("() => { const S = GR._debug.state; return {cloud: S.cloud, pending: S.pendingCloud, busy: !!S.busy, baseAt: S.baseAt, msg: S.cloudMsg}; }")


def settle(page, ms=9000):
    end = time.time() + ms / 1000
    while time.time() < end:
        s = st(page)
        if s['cloud'] == 'ok' and not s['pending'] and not s['busy']:
            return True
        page.wait_for_timeout(200)
    return False


def plan(page):
    return page.evaluate('() => JSON.parse(JSON.stringify(GR._debug.state.plan))')


def cloud_plan(sid=SID):
    return copy.deepcopy(DB['rows'][sid]['plan'])


def js(page, code, arg=None):
    return page.evaluate(code, arg)


# 計画を1つ作り、教材と今週の課題を用意する（端末A）
SETUP = r"""
() => {
  const D = GR._debug, S = D.state;
  const m = { id: 'm_math', subject: '数学', name: '入門問題精講 数学III', purpose: '', range: '', unitLabel: '例題', count: 20, rounds: 1, pattern: 'straight',
    days: [1,2,3,4,5], minPerItem: 15, start: '2026-10-26', end: '2026-11-13', criteria: '', passPct: 80, evalMethod: '', priority: '中', prereq: '', teacher: '', status: '進行中' };
  const p = S.plan; p.materials.push(m);
  D.genWeek('2026-10-26');
  return p.tasks.length;
}
"""
TOUCH = "() => { GR._debug.state.plan.updatedAt = new Date().toISOString(); }"

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctxA = b.new_context(viewport={'width': 1360, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctxA)  # CDNのライブラリはローカルのコピー、他の外部通信は止める
        ctxB = b.new_context(viewport={'width': 1360, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctxB)  # CDNのライブラリはローカルのコピー、他の外部通信は止める
        for c in (ctxA, ctxB):
            c.route('https://mock-project.supabase.co/**', handle)

        # ---------- 準備：端末Aで作成 ----------
        A = open_page(ctxA, 'a@example.com')
        A.click('[data-gr-act="create"]')
        A.wait_for_timeout(300)
        n = js(A, SETUP)
        js(A, "() => { GR._debug.state.plan.updatedAt = new Date().toISOString(); GR.flush(); }")
        js(A, "() => { const S = GR._debug.state; S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A), '端末Aで作成した計画がクラウドに保存される')
        posts = [x for x in DB['log'] if x['m'] == 'POST']
        ok(posts and 'ignore-duplicates' in posts[0]['prefer'], '新規作成は「既にあれば何もしない」で送る（他の画面の計画を上書きしない）')
        ok(len(cloud_plan()['tasks']) == n and n >= 4, '課題もクラウドへ: %d件' % n)

        # ---------- 端末Bで同じ生徒を開く ----------
        B = open_page(ctxB, 'b@example.com')
        ok(settle(B), '端末Bはクラウドの計画を読み込む')
        ok(len(plan(B)['tasks']) == n, '端末Bにも同じ課題: %d件' % len(plan(B)['tasks']))

        # ---------- 1) 2台で同時に別の項目を変更 ----------
        tasks = plan(A)['tasks']
        t1, t2 = tasks[0]['id'], tasks[1]['id']
        DB['log'].clear()
        js(A, """(id) => { const S = GR._debug.state; const t = S.plan.tasks.find(x => x.id === id); t.status = 'graded'; t.correct = 2; t.total = 3; t.wrong = '例題2'; S.plan.profile.school = 'A高校'; }""", t1)
        js(B, """(id) => { const S = GR._debug.state; const t = S.plan.tasks.find(x => x.id === id); t.status = 'submitted'; S.plan.profile.goalText = 'Bの目標'; }""", t2)
        # どちらもまだクラウドに送っていない状態から、ほぼ同時に保存
        js(A, "() => { const S = GR._debug.state; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        js(B, "() => { const S = GR._debug.state; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A) and settle(B), '両方の保存が完了する（競合は自動で解消）')
        cp = cloud_plan()
        ct = {t['id']: t for t in cp['tasks']}
        ok(ct[t1]['status'] == 'graded' and ct[t2]['status'] == 'submitted', '端末Aの採点も端末Bの提出も残る')
        ok(cp['profile']['school'] == 'A高校' and cp['profile']['goalText'] == 'Bの目標', '別々の欄の変更が両方残る')
        patches = [x for x in DB['log'] if x['m'] == 'PATCH']
        ok(patches and all('updated_at' in x['q'] for x in patches), '上書きは「読み込んだ版のままなら」の条件付き（PATCH + updated_at）')
        ok(len(patches) >= 3, '先に保存された側を取り込んでから保存し直している（PATCH %d回）' % len(patches))
        js(A, "() => GR._debug.checkRemote(true)")
        A.wait_for_timeout(1200)
        pa = plan(A)
        ok(pa['profile']['goalText'] == 'Bの目標' and {t['id']: t for t in pa['tasks']}[t2]['status'] == 'submitted', '端末Aの画面にも端末Bの変更が反映される')

        # ---------- 2) 古い画面（開きっぱなし）からの保存でも消えない ----------
        js(B, "() => { const S = GR._debug.state; S.plan.profile.examType = '一般選抜'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(B), '端末Bが保存')
        # 端末Aは確認しないまま（古いまま）別の欄を変更して保存
        js(A, "() => { const S = GR._debug.state; S.plan.profile.teacher = '山田'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A), '古い画面からの保存も完了')
        cp = cloud_plan()
        ok(cp['profile']['examType'] == '一般選抜' and cp['profile']['teacher'] == '山田', '古い画面から保存しても、他の画面の変更が消えない')

        # ---------- 3) 削除と採点が重なった場合は採点を残す ----------
        js(B, "() => GR._debug.checkRemote(true)")
        settle(B)
        t3 = plan(A)['tasks'][2]['id']
        js(A, "(id) => { const S = GR._debug.state; S.plan.tasks = S.plan.tasks.filter(t => t.id !== id); S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }", t3)
        js(B, "(id) => { const S = GR._debug.state; const t = S.plan.tasks.find(x => x.id === id); t.status = 'graded'; t.correct = 1; t.total = 1; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }", t3)
        ok(settle(A) and settle(B), '削除と採点の保存が完了')
        ct = {t['id']: t for t in cloud_plan()['tasks']}
        ok(t3 in ct and ct[t3]['status'] == 'graded', '片方が削除・もう片方が採点した課題は、採点の記録を残す')
        # 変更していない課題の削除はそのまま反映
        js(A, "() => GR._debug.checkRemote(true)"); settle(A)
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        t4 = [t for t in plan(A)['tasks'] if t['status'] == 'todo'][0]['id']
        js(A, "(id) => { const S = GR._debug.state; S.plan.tasks = S.plan.tasks.filter(t => t.id !== id); S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }", t4)
        js(B, "() => { const S = GR._debug.state; S.plan.profile.hoursWeekday = 3; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A) and settle(B), '削除と別の変更の保存が完了')
        cp = cloud_plan()
        ok(t4 not in [t['id'] for t in cp['tasks']] and cp['profile']['hoursWeekday'] == 3, '他で触っていない課題の削除はそのまま反映される')

        # ---------- 4) 2台で同じ週の課題を作っても二重にならない ----------
        js(A, "() => GR._debug.checkRemote(true)"); settle(A)
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        js(A, "() => { const S = GR._debug.state; GR._debug.genWeek('2026-11-02'); S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        js(B, "() => { const S = GR._debug.state; GR._debug.genWeek('2026-11-02'); S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A) and settle(B), '同じ週の課題作成の保存が完了')
        nov = [t for t in cloud_plan()['tasks'] if '2026-11-02' <= t['date'] <= '2026-11-08' and t.get('auto') and t['kind'] != 'review']
        keys = [(t['materialId'], t.get('origDate') or t['date'], t['kind']) for t in nov]
        ok(len(nov) == 5 and len(set(keys)) == len(keys), '同じ週を2台で作成しても課題は1つずつ: %d件' % len(nov))

        # ---------- 5) 復習の割当が2台で重なってもまとまる ----------
        js(A, "() => GR._debug.checkRemote(true)"); settle(A)
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        js(A, """() => { const S = GR._debug.state; S.plan.reviews.push({id: 'r_a', subject: '数学', materialId: 'm_math', item: '例題2', cause: '', fromTaskId: null, addedAt: '2026-10-27', status: 'open', taskId: null});
                 S.plan.tasks.push({id: 't_ra', date: '2026-11-01', subject: '数学', materialId: null, kind: 'review', content: '', minutes: 15, units: 0, qty: 1, auto: true, edited: false, status: 'todo', reviewIds: ['r_a']});
                 S.plan.reviews.find(r => r.id === 'r_a').taskId = 't_ra'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }""")
        js(B, """() => { const S = GR._debug.state; S.plan.reviews.push({id: 'r_b', subject: '数学', materialId: 'm_math', item: '例題5', cause: '', fromTaskId: null, addedAt: '2026-10-27', status: 'open', taskId: null});
                 S.plan.tasks.push({id: 't_rb', date: '2026-11-01', subject: '数学', materialId: null, kind: 'review', content: '', minutes: 15, units: 0, qty: 1, auto: true, edited: false, status: 'todo', reviewIds: ['r_b']});
                 S.plan.reviews.find(r => r.id === 'r_b').taskId = 't_rb'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }""")
        ok(settle(A) and settle(B), '復習の保存が完了')
        cp = cloud_plan()
        rts = [t for t in cp['tasks'] if t['kind'] == 'review' and t['date'] == '2026-11-01']
        ok(len(rts) == 1 and sorted(rts[0]['reviewIds']) == ['r_a', 'r_b'], '同じ日の復習課題は1つにまとまる: %s' % [t['reviewIds'] for t in rts])
        ok(all(r['taskId'] == rts[0]['id'] for r in cp['reviews'] if r['id'] in ('r_a', 'r_b')), '復習の割当先もまとめた課題を指す')
        ok('例題2' in rts[0]['content'] and '例題5' in rts[0]['content'], '復習課題の内容も更新: ' + rts[0]['content'])

        # ---------- 6) 入力中は画面を書き換えず、離れたら取り込む ----------
        js(A, "() => GR._debug.checkRemote(true)"); settle(A)
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        A.click('[data-gr-act="tab"][data-tab="strategy"]')
        A.wait_for_timeout(200)
        A.click('[data-gr-bind="profile.altUnivs"]')
        A.keyboard.type('東京理科大学')
        A.wait_for_timeout(2200)   # Aの入力は保存される
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        js(B, "() => { const S = GR._debug.state; S.plan.profile.examSubjects = '英・数・理'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(B), '端末Bが別の欄を保存')
        A.keyboard.type('・芝浦工業大学')     # 入力を続ける（この間に保存→競合）
        A.wait_for_timeout(2500)
        val = A.input_value('[data-gr-bind="profile.altUnivs"]')
        focused = js(A, "() => document.activeElement && document.activeElement.getAttribute('data-gr-bind')")
        ok(val == '東京理科大学・芝浦工業大学' and focused == 'profile.altUnivs', '入力中は欄が書き換わらない（フォーカスも保たれる）: %s' % val)
        shown_before = A.input_value('[data-gr-bind="profile.examSubjects"]')
        A.click('#gr-root-groad .section-title')   # 入力欄から離れる
        A.wait_for_timeout(2500)
        ok(settle(A), '入力欄から離れると取り込み・保存が完了')
        shown_after = A.input_value('[data-gr-bind="profile.examSubjects"]')
        cp = cloud_plan()
        ok(shown_after == '英・数・理' and cp['profile']['altUnivs'] == '東京理科大学・芝浦工業大学' and cp['profile']['examSubjects'] == '英・数・理',
           '離れた後に他の画面の変更が表示され、両方の変更がクラウドに残る（表示 %s → %s）' % (shown_before, shown_after))

        # ---------- 7) 採点の書きかけは、他の画面の変更を取り込んでも消えない ----------
        A.click('.nav-btn:has-text("週間・毎日課題")')
        A.wait_for_timeout(200)
        A.click('[data-gr-act="tab"][data-tab="daily"]')
        js(A, "() => { const S = GR._debug.state; S.day = '2026-10-27'; S.gradeTaskId = null; GR.render(); }")
        A.wait_for_timeout(300)
        row = A.locator('#gr-view-gweek tr[data-gr-act="grade-pick"]').first
        row.click()
        A.wait_for_timeout(200)
        A.fill('#gr-g-correct', '1')
        A.fill('#gr-g-comment', '書きかけのコメント')
        A.click('#gr-root-gweek .section-title')
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        js(B, "() => { const S = GR._debug.state; S.plan.profile.hoursHoliday = 8; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        settle(B)
        js(A, "() => GR._debug.checkRemote(true)")
        A.wait_for_timeout(1500)
        ok(plan(A)['profile']['hoursHoliday'] == 8, '端末Aが他の画面の変更を取り込んだ')
        ok(A.input_value('#gr-g-comment') == '書きかけのコメント' and A.input_value('#gr-g-correct') == '1', '採点欄の書きかけは残る')

        # ---------- 8) 自分の保存は通ったのに応答だけ失敗した場合 ----------
        js(A, "() => GR._debug.checkRemote(true)"); settle(A)
        DB['drop_next_patch_response'] = True
        js(A, "() => { const S = GR._debug.state; S.plan.profile.goalText = '応答なしテスト'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        A.wait_for_timeout(1500)
        s = st(A)
        ok(s['cloud'] == 'error' and s['pending'], '応答が失敗したら「未同期（再試行）」になる')
        js(A, "() => { const S = GR._debug.state; S.cloud = 'syncing'; GR._debug.pushCloud(); }")
        ok(settle(A), '再試行で同期済みに戻る（自分の保存を検出して二重に書かない）')
        ok(cloud_plan()['profile']['goalText'] == '応答なしテスト', 'クラウドの内容も正しい')

        # ---------- 9) 同じブラウザの2つのタブ ----------
        A2 = open_page(ctxA, 'a@example.com', fresh=False)
        ok(settle(A2), '同じブラウザの2つ目のタブで読み込み')
        js(A2, "() => { const S = GR._debug.state; S.plan.profile.school = 'タブ2の高校'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A2), 'タブ2が保存')
        js(A, "() => { const S = GR._debug.state; S.plan.profile.altUnivs = 'タブ1の併願'; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A), 'タブ1（古い）が保存')
        cp = cloud_plan()
        ok(cp['profile']['school'] == 'タブ2の高校' and cp['profile']['altUnivs'] == 'タブ1の併願', '同じブラウザの2つのタブでも、両方の変更が残る')
        js(A2, "() => document.dispatchEvent(new Event('visibilitychange'))")
        A2.wait_for_timeout(1200)
        ok(plan(A2)['profile']['altUnivs'] == 'タブ1の併願', 'タブに戻ると最新の内容に更新される')

        # ---------- 10) 端末に未保存の変更が残ったまま閉じた → 次に開いた時にまとめる ----------
        js(B, "() => GR._debug.checkRemote(true)"); settle(B)
        B_ls = js(B, """() => { const S = GR._debug.state; S.plan.profile.policies = (S.plan.profile.policies || []).concat(['端末Bの未送信の方針']); S.plan.updatedAt = new Date().toISOString();
                 localStorage.setItem('galileo_grplan_' + S.sid, JSON.stringify(S.plan)); return true; }""")
        B.close()   # クラウドには送らずに閉じた想定（beforeunload の送信は模擬サーバーまで届かないことがある）
        js(A, "() => { const S = GR._debug.state; S.plan.profile.strengths = ['端末Aの得意']; S.plan.updatedAt = new Date().toISOString(); S.pendingCloud = true; GR._debug.pushCloud(); }")
        ok(settle(A), '端末Aが別の変更を保存')
        B2 = ctxB.new_page()
        B2.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        B2.goto('http://127.0.0.1:8768/cloud.html')
        B2.wait_for_timeout(1800)
        B2.click('.nav-btn:has-text("合格ロードマップ")')
        B2.wait_for_timeout(200)
        B2.select_option('#gr-root-groad .gr-student-sel', SID)
        B2.wait_for_timeout(1000)
        ok(settle(B2), '端末Bを開き直すと同期が完了')
        cp = cloud_plan()
        ok('端末Bの未送信の方針' in cp['profile']['policies'] and cp['profile']['strengths'] == ['端末Aの得意'], '閉じる前の未送信の変更と、他の端末の変更の両方が残る')

        # ---------- 11) 新規作成が2台で重なった場合 ----------
        C1 = open_page(ctxA, 'a@example.com', sid=SID2, fresh=False)
        C2 = open_page(ctxB, 'b@example.com', sid=SID2, fresh=False)
        C1.click('[data-gr-act="create"]')
        C2.click('[data-gr-act="create"]')
        ok(settle(C1) and settle(C2), '同時の新規作成の保存が完了')
        p1, p2, cp = plan(C1), plan(C2), cloud_plan(SID2)
        ok(p1['createdAt'] == cp['createdAt'] and p2['createdAt'] == cp['createdAt'], '先に保存された1つの計画に揃う（教材の二重登録なし）')

        b.close()
finally:
    srv.terminate()
print('\n'.join(res))
print('--- errors (%d) ---' % len(errors))
for e in errors[:20]:
    print(e[:300])
