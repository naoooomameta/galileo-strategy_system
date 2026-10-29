"""Supabase を模擬して、クラウド保存（テーブル未作成→作成後の同期）を確認する"""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
import vendor_route

TD = os.path.dirname(os.path.abspath(__file__))
SID = '11111111-1111-1111-1111-111111111111'
state = {'table': False, 'rows': {}, 'puts': [], 'gets': 0}
students_rows = [{'id': SID, 'name': 'クラウド 太郎', 'grade': 'high2', 'stream': 'rikei', 'univ_name': '東京科学大学', 'univ_info': {'cat': 'national', 'dev': 65, 'subjects': ['英語', '数学']},
                  'dept1': '理学院', 'dev_val': 52, 'months': 16, 'exam_month': '2028-02', 'sub_devs': {'数学IA': 50, '英語R': 56}, 'main_subjects': [], 'created_at': '2026-10-01T00:00:00Z', 'updated_at': '2026-10-27T00:00:00Z'}]

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '--bind', '127.0.0.1'], cwd=TD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
res = []
errors = []


def ok(c, label):
    res.append(('OK ' if c else 'NG ') + label)


def handle(route, request):
    from urllib.parse import urlparse, parse_qs
    from datetime import datetime
    url = request.url
    if '/rest/v1/students' in url:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(students_rows))
    if '/rest/v1/roadmap_plans' in url:
        if not state['table']:
            return route.fulfill(status=404, content_type='application/json', body=json.dumps({'code': 'PGRST205', 'message': "Could not find the table 'public.roadmap_plans' in the schema cache"}))
        q = parse_qs(urlparse(url).query)
        sel = (q.get('select', ['plan,updated_at'])[0]).split(',')
        def pick(row): return {c: row[c] for c in sel if c in row}
        if request.method == 'GET':
            state['gets'] += 1
            row = state['rows'].get(SID)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps([pick(row)] if row else []))
        body = json.loads(request.post_data)
        state['puts'].append({'m': request.method, 'url': url, 'prefer': request.headers.get('prefer'), 'auth': request.headers.get('authorization', '')[:20], 'body_keys': sorted(body.keys())})
        if request.method == 'POST':
            if body['student_id'] in state['rows'] and 'ignore-duplicates' in (request.headers.get('prefer') or ''):
                return route.fulfill(status=201, content_type='application/json', body='[]')
            state['rows'][body['student_id']] = {'plan': body['plan'], 'updated_at': body['updated_at']}
            return route.fulfill(status=201, content_type='application/json', body=json.dumps([pick(state['rows'][body['student_id']])]))
        if request.method == 'PATCH':
            row = state['rows'].get(SID)
            cond = q.get('updated_at', [''])[0][3:]
            t = lambda v: datetime.fromisoformat(v.replace('Z', '+00:00'))
            if row and cond and t(cond) == t(row['updated_at']):
                row['plan'] = body['plan']; row['updated_at'] = body['updated_at']
                return route.fulfill(status=200, content_type='application/json', body=json.dumps([pick(row)]))
            return route.fulfill(status=200, content_type='application/json', body='[]')
    if '/auth/v1/' in url:
        return route.fulfill(status=200, content_type='application/json', body='{}')
    return route.fulfill(status=200, content_type='application/json', body='[]')


session = {'access_token': 'test-access-token-abcdefghijklmnop', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 36000,
           'user': {'id': 'u1', 'email': 'staff@example.com', 'aud': 'authenticated', 'role': 'authenticated'}}
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctx)  # CDNのライブラリはローカルのコピー、他の外部通信は止める
        ctx.route('https://mock-project.supabase.co/**', handle)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.goto('http://127.0.0.1:8766/cloud.html')
        page.evaluate("(s) => { localStorage.clear(); localStorage.setItem('galileo-auth', JSON.stringify(s)); }", session)
        page.goto('http://127.0.0.1:8766/cloud.html')
        page.wait_for_timeout(2500)
        ok(page.locator('#app-body').is_visible(), 'セッションありでアプリ表示（模擬Supabase）')
        page.click('.nav-btn:has-text("合格ロードマップ")')
        page.wait_for_timeout(300)
        page.select_option('#gr-root-groad .gr-student-sel', SID)
        page.wait_for_timeout(800)
        page.click('[data-gr-act="create"]')
        page.wait_for_timeout(2500)
        st = page.inner_text('#gr-status-groad')
        ok('クラウド未設定' in st, 'テーブル未作成 → 「この端末にのみ保存中」表示: ' + st)
        page.click('#gr-status-groad')
        page.wait_for_timeout(300)
        ok('create table if not exists public.roadmap_plans' in page.inner_text('#gr-modal'), '設定用SQLを表示')
        # テーブル作成 → 接続確認
        state['table'] = True
        page.click('[data-gr-act="setup-recheck"]')
        page.wait_for_timeout(3000)
        st = page.inner_text('#gr-status-groad')
        ok('クラウドに保存済み' in st, '接続確認で端末のデータをアップロード: ' + st)
        ok(len(state['puts']) >= 1 and SID in state['rows'], 'roadmap_plans にupsertされた')
        if state['puts']:
            pu = state['puts'][0]
            ok(pu['m'] == 'POST' and 'on_conflict=student_id' in pu['url'] and 'ignore-duplicates' in (pu['prefer'] or ''), '最初の保存は新規作成のみ（既にあれば上書きしない）')
            ok(pu['auth'].startswith('Bearer test-access'), 'ログイン中のトークンで送信')
            ok(pu['body_keys'] == ['plan', 'student_id', 'updated_at'], '送信データの形')
        # 編集 → 自動保存
        n = len(state['puts'])
        page.fill('[data-gr-bind="profile.school"]', '雲高校')
        page.wait_for_timeout(2600)
        ok(len(state['puts']) > n and state['rows'][SID]['plan']['profile']['school'] == '雲高校', '編集内容が自動でクラウド保存')
        last = state['puts'][-1]
        ok(last['m'] == 'PATCH' and 'updated_at=eq.' in last['url'] and 'student_id=eq.' in last['url'], '2回目以降は「読み込んだ版のままなら」の条件付きで更新')
        # 別端末を想定：端末の保存を消してから開き直す → クラウドから読む
        page.evaluate("() => { Object.keys(localStorage).filter(k => k.indexOf('galileo_grplan_') === 0).forEach(k => localStorage.removeItem(k)); }")
        page.evaluate("() => { GR._debug.state.sid = null; GR.onStudentChanged(); }")
        page.wait_for_timeout(1500)
        pl = page.evaluate("() => GR._debug.state.plan && GR._debug.state.plan.profile.school")
        ok(pl == '雲高校', 'クラウドから計画を読み込める（別の端末想定）')
        # クラウドの方が新しい場合は上書き読込
        page.evaluate("() => GR.flush()")
        newer = json.loads(json.dumps(state['rows'][SID]))
        newer['plan']['profile']['school'] = '更新高校'
        newer['plan']['updatedAt'] = '2099-01-01T00:00:00.000Z'
        state['rows'][SID] = newer
        page.evaluate("() => { GR._debug.state.sid = null; GR.onStudentChanged(); }")
        page.wait_for_timeout(1500)
        pl = page.evaluate("() => GR._debug.state.plan.profile.school")
        ok(pl == '更新高校', '他の端末で更新された新しい計画を優先して読み込む')
        b.close()
finally:
    srv.terminate()
print('\n'.join(res))
print('errors:', errors[:10])
