import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
import vendor_route

TD = os.path.dirname(os.path.abspath(__file__))
PAGE = sys.argv[1] if len(sys.argv) > 1 else 'dev.html'
SHOTS = os.path.join(TD, 'shots'); os.makedirs(SHOTS, exist_ok=True)

students = [
    {'_id': '11111111-1111-1111-1111-111111111111', 'name': 'ガリレオ ラボ', 'grade': 'high2', 'stream': 'rikei', 'univName': '東京科学大学',
     'univInfo': {'cat': 'national', 'dev': 65, 'subjects': ['英語', '数学', '物理', '化学', '国語']}, 'dept1': '理学院', 'levelVal': 2, 'devVal': 52,
     'enrolled': '2026-10', 'months': 16, 'goalYear': 2028, 'goalMonth': 1, 'examMonth': '2028-02',
     'subDevs': {'数学IA': 50, '数学IIB': 48, '物理': 48, '化学': 52, '英語R': 56}, 'mainSubjects': ['英語リーディング', '数学1A'],
     'manualBooks': [{'name': '物理のエッセンス 力学・波動', 'sub': 'sci', 'subLabel': '物理', '_manual': True, 'startY': 2026, 'startM': 10, 'endY': 2027, 'endM': 1}],
     'updated_at': '2026-10-27T00:00:00Z'},
    {'name': 'テスト 花子', 'grade': 'high3', 'stream': 'rikei', 'univName': '東京理科大学', 'univInfo': {'cat': 'private', 'dev': 60, 'subjects': ['英語', '数学', '化学']},
     'dept1': '工学部', 'devVal': 55, 'months': 4, 'examMonth': '2027-02', 'subDevs': {'数学IA': 55, '化学': 57}, 'mainSubjects': []},
]

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=TD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
results = []


def ok(cond, label):
    results.append(('OK ' if cond else 'NG ') + label)
    if not cond:
        print('NG', label)


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=True)


def plan(page):
    return page.evaluate('() => JSON.parse(JSON.stringify(window.GR._debug.state.plan))')


try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctx)  # CDNのライブラリはローカルのコピー、他の外部通信は止める
        page = ctx.new_page()
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.goto('http://127.0.0.1:8765/' + PAGE)
        page.evaluate("(s) => { localStorage.clear(); localStorage.setItem('galileo_students', JSON.stringify(s)); }", students)
        page.fill('#login-email', 'tester@example.com')
        page.click('#login-btn')
        page.wait_for_timeout(1200)
        ok(page.locator('#app-body').is_visible(), 'ログイン（DEVモード）でアプリ表示')

        # ナビ
        navs = page.eval_on_selector_all('.nav-btn', 'els => els.map(e => e.textContent.trim())')
        ok('合格ロードマップ' in navs and '週間・毎日課題' in navs and 'ロードマップ' not in navs and '1ヶ月プラン' not in navs, 'ナビが新タブに置き換わっている: ' + ','.join(navs))
        page.click('.nav-btn:has-text("合格ロードマップ")')
        page.wait_for_timeout(300)
        ok(page.locator('#page-groad').is_visible(), '合格ロードマップのページが表示される')
        ok(page.locator('.nav-btn.active').inner_text().strip() == '合格ロードマップ', 'ナビが点灯')
        ok('生徒を選択してください' in page.inner_text('#gr-root-groad'), '生徒未選択の案内')

        # 生徒を選択 → 作成
        page.select_option('#gr-root-groad .gr-student-sel', '11111111-1111-1111-1111-111111111111')
        page.wait_for_timeout(500)
        ok('まだ作成されていません' in page.inner_text('#gr-root-groad'), '未作成の案内')
        page.click('[data-gr-act="create"]')
        page.wait_for_timeout(500)
        pl = plan(page)
        ok(pl is not None and pl['subjects'] == ['英語', '数学', '物理', '化学'], '科目を生徒データから作成: %s' % (pl and pl['subjects']))
        ok(len(pl['materials']) == 1 and pl['materials'][0]['subject'] == '物理', '手動参考書を教材として取り込み')
        ok(len(pl['stages']) == 6, '学習段階を自動作成: %d' % len(pl['stages']))
        ok(pl['profile']['currents'].get('数学') == 49 and pl['profile']['targets'].get('英語') == 65, '現在・目標偏差値の取り込み %s %s' % (pl['profile']['currents'], pl['profile']['targets']))
        shot(page, '01_strategy')

        # 入力のバインド
        page.fill('[data-gr-bind="profile.school"]', '○○高校')
        page.fill('[data-gr-bind="profile.goalText"]', '東京科学大学に合格する')
        page.click('[data-gr-act="list-add"][data-path="profile.policies"]')
        page.fill('[data-gr-bind="profile.policies.0"]', '基礎を固める')
        page.fill('[data-gr-bind="profile.targets.数学"]', '62')
        page.keyboard.press('Tab')
        page.wait_for_timeout(400)
        pl = plan(page)
        ok(pl['profile']['school'] == '○○高校' and pl['profile']['policies'] == ['基礎を固める'] and pl['profile']['targets']['数学'] == 62, 'プロフィール入力が保存される')
        page.click('[data-gr-act="row-add"][data-path="mocks"]')
        page.fill('[data-gr-bind="mocks.0.name"]', '全統模試')
        page.fill('[data-gr-bind="mocks.0.devs.英語"]', '56')
        page.fill('[data-gr-bind="mocks.0.devs.数学"]', '50')
        page.click('[data-gr-act="row-add"][data-path="mocks"]')
        page.fill('[data-gr-bind="mocks.0.month"]', '2026-12')
        page.fill('[data-gr-bind="mocks.0.devs.英語"]', '59')
        page.fill('[data-gr-bind="mocks.0.devs.数学"]', '54')
        page.wait_for_timeout(300)

        # 教材・年間
        page.click('[data-gr-act="tab"][data-tab="materials"]')
        page.wait_for_timeout(300)
        page.click('[data-gr-act="mat-new"]')
        page.select_option('#gr-m-subject', '数学')
        page.fill('#gr-m-name', '入門問題精講 数学II・B')
        page.fill('#gr-m-purpose', '基本原理の理解')
        page.fill('#gr-m-count', '60')
        page.fill('#gr-m-rounds', '2')
        page.fill('#gr-m-start', '2026-10-26')
        page.fill('#gr-m-end', '2026-12-20')
        page.select_option('#gr-m-pattern', 'redo')
        page.fill('#gr-m-criteria', '初見類題80%以上')
        calc = page.inner_text('#gr-m-calc')
        ok('課題日' in calc and '1日あたり' in calc, '教材フォームの自動計算: ' + calc.replace('\n', ' '))
        shot(page, '02_material_modal')
        page.click('[data-gr-act="mat-save"]')
        page.wait_for_timeout(300)
        page.click('[data-gr-act="mat-new"]')
        page.select_option('#gr-m-subject', '英語')
        page.fill('#gr-m-name', '英文法ポラリス1')
        page.fill('#gr-m-unitLabel', '小単元')
        page.fill('#gr-m-count', '30')
        page.fill('#gr-m-rounds', '3')
        page.fill('#gr-m-start', '2026-11-02')
        page.fill('#gr-m-end', '2026-12-25')
        page.click('[data-gr-act="mat-save"]')
        page.wait_for_timeout(300)
        # 物理の教材を編集（問題数を入れる）→ 履歴
        page.click('tr[data-gr-act="mat-edit"]:has-text("物理のエッセンス")')
        page.fill('#gr-m-count', '40')
        page.fill('#gr-m-unitLabel', '例題')
        page.fill('#gr-m-reason', '問題数を確定')
        page.click('[data-gr-act="mat-save"]')
        page.wait_for_timeout(300)
        pl = plan(page)
        ok(len(pl['materials']) == 3, '教材3件')
        ok(any('物理のエッセンス' in h['target'] and h['reason'] == '問題数を確定' for h in pl['history']), '教材の変更が履歴に残る')
        ok(page.locator('.gr-gantt .gr-g-bar').count() >= 9, 'タイムラインの描画: %d本' % page.locator('.gr-gantt .gr-g-bar').count())
        shot(page, '03_materials')

        # 月間
        page.click('[data-gr-act="tab"][data-tab="monthly"]')
        page.wait_for_timeout(300)
        txt = page.inner_text('#gr-view-groad')
        ok('2026年10月' in txt, '月間：今月表示')
        page.click('[data-gr-act="month-next"]')
        page.wait_for_timeout(200)
        txt = page.inner_text('#gr-view-groad')
        ok('2026年11月' in txt and '入門問題精講' in txt and '小単元1〜' in txt, '11月の範囲が自動計算される')
        mid = [m['id'] for m in pl['materials'] if m['name'].startswith('入門')][0]
        page.select_option('[data-gr-bind="months.2026-11.rows.%s.judge"]' % mid, '未達')
        page.wait_for_timeout(200)
        page.select_option('[data-gr-bind="months.2026-11.rows.%s.cause"]' % mid, '計算ミス')
        page.fill('[data-gr-bind="months.2026-11.rows.%s.change"]' % mid, '毎日2題＋計算チェック')
        page.click('[data-gr-act="judge-log"]')
        page.wait_for_timeout(200)
        pl = plan(page)
        ok(any('月末判定' in h['target'] for h in pl['history']), '月末判定の変更を履歴に記録')
        shot(page, '04_monthly')

        # 週間
        page.click('.nav-btn:has-text("週間・毎日課題")')
        page.wait_for_timeout(300)
        ok(page.locator('#page-gweek').is_visible(), '週間・毎日課題ページ表示')
        page.click('[data-gr-act="week-gen"]')
        page.wait_for_timeout(300)
        pl = plan(page)
        wk = [t for t in pl['tasks'] if '2026-10-26' <= t['date'] <= '2026-11-01']
        ok(len(wk) >= 5, '今週の課題を自動作成: %d件' % len(wk))
        kinds = sorted(set(t['kind'] for t in wk))
        ok('redo' in kinds and 'check' in kinds, '解き直し型の課題（%s）' % kinds)
        shot(page, '05_weekly')
        page.click('[data-gr-act="week-next"]')
        page.click('[data-gr-act="week-gen"]')
        page.wait_for_timeout(300)
        pl = plan(page)
        nov = [t for t in pl['tasks'] if '2026-11-02' <= t['date'] <= '2026-11-08']
        ok(len(nov) >= 10, '翌週の課題: %d件' % len(nov))
        # 2回押しても増えない
        page.click('[data-gr-act="week-gen"]')
        page.wait_for_timeout(200)
        pl2 = plan(page)
        ok(len(pl2['tasks']) == len(pl['tasks']), '再作成で重複しない')
        shot(page, '06_weekly_next')

        # 毎日（今日 10/27）
        page.click('[data-gr-act="tab"][data-tab="daily"]')
        page.wait_for_timeout(300)
        rows = page.locator('#gr-view-gweek tr[data-gr-act="grade-pick"]').count()
        ok(rows >= 1, '今日の課題の一覧: %d件' % rows)
        first = page.locator('#gr-view-gweek tr[data-gr-act="grade-pick"]').first
        tid = first.get_attribute('data-id')
        page.select_option('select[data-gr-change="task-status"][data-id="%s"]' % tid, 'submitted')
        page.wait_for_timeout(300)
        ok(page.locator('#gr-g-correct').count() == 1, '提出にすると採点パネルが開く')
        page.fill('#gr-g-correct', '2')
        page.fill('#gr-g-total', '3')
        page.fill('#gr-g-wrong', '例題2')
        page.select_option('#gr-g-cause', '計算ミス')
        page.fill('#gr-g-comment', '途中式を丁寧に')
        ok('67%' in page.inner_text('#gr-g-rate'), '正答率プレビュー')
        page.click('[data-gr-act="grade-save"]')
        page.wait_for_timeout(300)
        pl = plan(page)
        t = [x for x in pl['tasks'] if x['id'] == tid][0]
        ok(t['status'] == 'graded' and t['correct'] == 2 and t['total'] == 3, '採点が保存される')
        ok(len([r for r in pl['reviews'] if r['status'] == 'open']) == 1, '誤答が復習キューに追加される')
        shot(page, '07_daily')

        # 復習キュー → 日曜に割当
        page.click('[data-gr-act="tab"][data-tab="reviews"]')
        page.wait_for_timeout(200)
        page.click('[data-gr-act="rev-assign-all"]')
        page.wait_for_timeout(300)
        pl = plan(page)
        rv = [x for x in pl['tasks'] if x['kind'] == 'review']
        ok(len(rv) == 1 and rv[0]['date'] == '2026-11-01', '復習を今週の日曜に割当: %s' % [x['date'] for x in rv])
        shot(page, '08_reviews')
        # 復習課題を全問正解で採点 → 完了
        page.click('[data-gr-act="tab"][data-tab="daily"]')
        page.evaluate("() => { GR._debug.state.day = '2026-11-01'; GR._debug.state.gradeTaskId = null; GR.render(); }")
        page.wait_for_timeout(200)
        page.click('#gr-view-gweek tr[data-gr-act="grade-pick"]:has-text("復習")')
        page.fill('#gr-g-correct', '1')
        page.fill('#gr-g-total', '1')
        page.click('[data-gr-act="grade-save"]')
        page.wait_for_timeout(300)
        pl = plan(page)
        ok(all(r['status'] == 'done' for r in pl['reviews']), '復習課題を全問正解 → 復習完了')

        # 到達度
        page.click('.nav-btn:has-text("合格ロードマップ")')
        page.click('[data-gr-act="tab"][data-tab="progress"]')
        page.wait_for_timeout(600)
        txt = page.inner_text('#gr-view-groad')
        ok('科目別の進捗と理解度' in txt and '教材ごとの到達状況' in txt, '到達度ビュー表示')
        ok(page.locator('#gr-mock-chart').count() == 1, '模試推移グラフ')
        shot(page, '09_progress')

        # 印刷（iframeが作られる）
        page.evaluate("() => { window.__printCalls = 0; }")
        page.click('[data-gr-act="print-all"]')
        page.wait_for_timeout(800)
        fr = page.evaluate("() => { const f = document.getElementById('gr-print-frame'); return f ? f.contentDocument.body.innerText.slice(0, 300) : null; }")
        ok(fr is not None and '合格戦略' in fr, '印刷用ページ生成')
        html_len = page.evaluate("() => document.getElementById('gr-print-frame').contentDocument.documentElement.outerHTML.length")
        inputs_left = page.evaluate("() => document.getElementById('gr-print-frame').contentDocument.querySelectorAll('input,select,textarea,button').length")
        ok(inputs_left == 0, '印刷版に入力欄が残らない（%d）' % inputs_left)
        with open(os.path.join(SHOTS, 'print.html'), 'w', encoding='utf-8') as fh:
            fh.write(page.evaluate("() => document.getElementById('gr-print-frame').contentDocument.documentElement.outerHTML"))

        # 生徒の切替
        page.select_option('#gr-root-groad .gr-student-sel', 'name:テスト 花子')
        page.wait_for_timeout(400)
        ok('まだ作成されていません' in page.inner_text('#gr-root-groad'), '別の生徒は未作成')
        page.click('[data-gr-act="create"]')
        page.wait_for_timeout(300)
        p2 = plan(page)
        ok(p2['subjects'] == ['数学', '化学'], '2人目の科目: %s' % p2['subjects'])
        page.select_option('#gr-root-groad .gr-student-sel', '11111111-1111-1111-1111-111111111111')
        page.wait_for_timeout(400)
        p1 = plan(page)
        ok(len(p1['materials']) == 3, '1人目に戻すと計画が残っている')

        # 旧ページ名での遷移
        page.evaluate("() => showPage('weekly-plan')")
        page.wait_for_timeout(300)
        ok(page.locator('#page-gweek').is_visible() and not page.locator('#page-weekly-plan').is_visible(), "showPage('weekly-plan') は新ページへ")

        # 他のタブ（v1.2.5：確認テスト・実力診断・推移予測はナビから外した）
        for label in ['生徒登録', '戦略シート', 'ダッシュボード']:
            page.click('.nav-btn:has-text("%s")' % label)
            page.wait_for_timeout(400)
        ok(page.locator('#page-dashboard').is_visible(), '他のタブも表示できる')
        hidden = page.eval_on_selector_all('.nav-btn[data-retired]', 'els => els.map(e => [e.textContent.trim(), getComputedStyle(e).display])')
        ok(len(hidden) == 3 and all(h[1] == 'none' for h in hidden), '確認テスト・実力診断・推移予測がナビに出ない %s' % hidden)
        visible = page.eval_on_selector_all('.nav-btn', 'els => els.filter(e => getComputedStyle(e).display !== "none").map(e => e.textContent.trim())')
        ok(visible == ['ダッシュボード', '生徒登録', '合格ロードマップ', '週間・毎日課題', '戦略シート'], '残るタブは5つ: %s' % visible)
        page.evaluate("() => showPage('monthly')"); page.wait_for_timeout(300)
        ok(page.locator('#page-groad').is_visible() and not page.locator('#page-monthly').is_visible(), "showPage('monthly') は合格ロードマップへ")
        page.evaluate("() => showPage('tests')"); page.wait_for_timeout(300)
        ok(page.locator('#page-gweek').is_visible(), "showPage('tests') は週間・毎日課題へ")
        page.evaluate("() => showPage('prediction')"); page.wait_for_timeout(300)
        ok(page.locator('#page-groad').is_visible(), "showPage('prediction') は合格ロードマップへ")
        page.click('.nav-btn:has-text("ダッシュボード")'); page.wait_for_timeout(400)

        # 再読み込み → 復元
        page.evaluate("() => GR.flush()")
        page.evaluate("() => { localStorage.setItem('galileo_lastPage', 'gweek'); }")
        page.reload()
        page.fill('#login-email', 'tester@example.com')
        page.click('#login-btn')
        page.wait_for_timeout(1200)
        page.click('.nav-btn:has-text("週間・毎日課題")')
        page.wait_for_timeout(400)
        p3 = plan(page)
        ok(p3 is not None and len(p3['materials']) == 3 and len(p3['tasks']) >= 15, '再読み込み後も計画が残る（端末保存）')
        shot(page, '10_after_reload')
        b.close()
finally:
    srv.terminate()

print('\n'.join(results))
print('--- errors (%d) ---' % len(errors))
for e in errors[:40]:
    print(e[:300])
