"""参考書フォルダ（books.json）のカタログ機能と、模試結果の数値欄の表示を確認する（DEVモード）"""
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
]

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--bind', '127.0.0.1'], cwd=TD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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


def options(page, sel):
    return page.eval_on_selector_all(sel + ' option', 'els => els.map(e => [e.value, e.textContent, e.parentElement.tagName === "OPTGROUP" ? e.parentElement.label : ""])')


def login(page):
    page.fill('#login-email', 'tester@example.com')
    page.click('#login-btn')
    page.wait_for_timeout(1200)


try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctx)
        page = ctx.new_page()
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.goto('http://127.0.0.1:8768/' + PAGE)
        page.evaluate("(s) => { localStorage.clear(); localStorage.setItem('galileo_students', JSON.stringify(s)); }", students)
        login(page)
        ok(page.locator('#app-body').is_visible(), 'ログイン（DEVモード）')

        # カタログの読み込み
        page.wait_for_function('() => window.GR && GR.catalog() && GR.catalog().books.length > 0', timeout=5000)
        cat = page.evaluate('() => GR.catalog()')
        ok(cat['count'] == 7 and len(cat['books']) == 7, 'books.json を読み込む: %d冊' % len(cat['books']))
        dl = page.eval_on_selector_all('#gr-books option', 'els => els.map(e => e.value)')
        ok('【青】チャート式 基礎からの数学I+A チャート研究所' in dl and '入門問題精講 数学I・A' in dl, '教材名の入力候補にカタログの本が加わる（%d件）' % len(dl))
        ls = page.evaluate("() => JSON.parse(localStorage.getItem('galileo_grbooks') || 'null')")
        ok(ls and ls.get('count') == 7, '端末にもカタログを保存')

        # 生徒 → 計画作成
        page.click('.nav-btn:has-text("合格ロードマップ")'); page.wait_for_timeout(300)
        page.select_option('#gr-root-groad .gr-student-sel', '11111111-1111-1111-1111-111111111111'); page.wait_for_timeout(400)
        page.click('[data-gr-act="create"]'); page.wait_for_timeout(500)
        pl = plan(page)
        ok(pl and len(pl['materials']) == 1 and pl['materials'][0]['name'] == '物理のエッセンス 力学・波動', '計画を作成（手動参考書1件）')

        # --- 模試結果の数値欄 ---
        page.click('[data-gr-act="row-add"][data-path="mocks"]'); page.wait_for_timeout(300)
        info = page.evaluate('''() => { var t = document.querySelector('table.gr-mocks'); var ins = [].slice.call(document.querySelectorAll('.gr-mocks input[type=number]'));
            return { minW: t && t.style.minWidth, n: ins.length, widths: ins.map(function (e) { return Math.round(e.getBoundingClientRect().width); }), spin: ins.length ? getComputedStyle(ins[0], '::-webkit-inner-spin-button').webkitAppearance : '' }; }''')
        ok(info['n'] == 4 and min(info['widths']) >= 48, '模試結果の偏差値欄は48px以上（%s・表の最小幅 %s）' % (info['widths'], info['minW']))
        app = page.evaluate("() => getComputedStyle(document.querySelector('.gr-mocks input[type=number]')).appearance")
        ok(app == 'textfield' or info['spin'] == 'none', '数値欄の増減ボタンを非表示: appearance=%r' % app)
        page.fill('[data-gr-bind="mocks.0.devs.数学"]', '55'); page.wait_for_timeout(200)
        page.fill('[data-gr-bind="mocks.0.devs.英語"]', '61.5'); page.wait_for_timeout(200)
        pl = plan(page)
        ok(pl['mocks'][0]['devs'].get('数学') == 55 and pl['mocks'][0]['devs'].get('英語') == 61.5, '偏差値の入力が保存される: %s' % pl['mocks'][0]['devs'])
        vis = page.evaluate('''() => { var e = document.querySelector('[data-gr-bind="mocks.0.devs.数学"]'); return [e.value, e.clientWidth - parseFloat(getComputedStyle(e).paddingLeft) - parseFloat(getComputedStyle(e).paddingRight)]; }''')
        ok(vis[0] == '55' and vis[1] >= 30, '入力した数字が見える幅がある（内側 %spx）' % round(vis[1]))
        shot(page, 'c01_mocks')

        # --- 教材モーダル：参考書フォルダから選ぶ ---
        page.click('[data-gr-act="tab"][data-tab="materials"]'); page.wait_for_timeout(300)
        page.click('[data-gr-act="mat-new"]'); page.wait_for_timeout(200)
        ok(page.locator('#gr-m-catalog').count() == 1, '教材モーダルに「参考書フォルダから選ぶ」がある')
        page.select_option('#gr-m-subject', '数学'); page.wait_for_timeout(150)
        opts = options(page, '#gr-m-catalog')
        groups = sorted(set(o[2] for o in opts if o[2]))
        vals = [o[0] for o in opts]
        ok('cat:b1' in vals and 'cat:b3' in vals and 'cat:b6' in vals and 'cat:b4' not in vals and 'cat:b7' not in vals, '科目で絞り込み（数学＋科目なしの本）: %s' % vals)
        ok(groups == ['参考書フォルダ：志望校対策', '参考書フォルダ：数学／１A', '参考書フォルダ：数学／２B'], 'フォルダごとのグループ: %s' % groups)
        page.select_option('#gr-m-catalog', 'cat:b1'); page.wait_for_timeout(150)
        ok(page.input_value('#gr-m-name') == '1対1対応の演習 数学1 大学への数学', '選ぶと教材名に入る')
        page.fill('#gr-m-count', '50'); page.fill('#gr-m-start', '2026-11-02'); page.fill('#gr-m-end', '2026-12-25')
        page.click('[data-gr-act="mat-save"]'); page.wait_for_timeout(300)
        pl = plan(page)
        m1 = [m for m in pl['materials'] if m.get('driveId') == 'b1']
        ok(len(m1) == 1 and m1[0]['link'] == 'https://drive.google.com/file/d/b1/view' and m1[0]['subject'] == '数学', '保存した教材に driveId / link が付く')
        ok(page.locator('#gr-view-groad a.gr-booklink[href*="/b1/"]').count() == 1, '教材一覧に Drive リンク（📄）')
        # 手動参考書（物理のエッセンス）を編集して保存 → 名前の一致で自動的に結びつく
        page.click('tr[data-gr-act="mat-edit"]:has-text("物理のエッセンス")'); page.wait_for_timeout(200)
        ok('結びついています' not in page.inner_text('#gr-modal-box'), '未結びつきの教材には結びつき表示がない')
        page.fill('#gr-m-count', '40'); page.click('[data-gr-act="mat-save"]'); page.wait_for_timeout(300)
        pl = plan(page)
        m4 = [m for m in pl['materials'] if m['name'].startswith('物理のエッセンス')][0]
        ok(m4.get('driveId') == 'b4' and 'b4' in m4.get('link', ''), '教材名がカタログの本と一致すると自動で結びつく')
        # フォルダの本を選んでから名前を変える → 結びつけない
        page.click('[data-gr-act="mat-new"]'); page.wait_for_timeout(150)
        page.select_option('#gr-m-subject', '数学'); page.wait_for_timeout(100)
        page.select_option('#gr-m-catalog', 'cat:b2'); page.wait_for_timeout(100)
        page.fill('#gr-m-name', '青チャート（抜粋）')
        page.click('[data-gr-act="mat-save"]'); page.wait_for_timeout(300)
        pl = plan(page)
        m2 = [m for m in pl['materials'] if m['name'] == '青チャート（抜粋）'][0]
        ok(not m2.get('driveId') and not m2.get('link'), '名前を変えた教材には結びつけない')
        shot(page, 'c02_materials')

        # --- 課題モーダル：参考書フォルダの本を選ぶ ---
        page.click('.nav-btn:has-text("週間・毎日課題")'); page.wait_for_timeout(300)
        page.click('[data-gr-act="tab"][data-tab="daily"]'); page.wait_for_timeout(300)
        page.click('.gr-toolbar [data-gr-act="task-new"]'); page.wait_for_timeout(200)
        opts = options(page, '#gr-t-material')
        vals = [o[0] for o in opts]
        own = [o for o in opts if o[2] == 'この生徒の教材']
        ok(len(own) == 3 and 'cat:b1' not in vals and 'cat:b4' not in vals and 'cat:b2' in vals and 'cat:b7' in vals and 'cat:b6' in vals, '科目なし：この生徒の教材＋未登録の本すべて: %s' % vals)
        page.select_option('#gr-t-subject', '数学'); page.wait_for_timeout(150)
        opts = options(page, '#gr-t-material'); vals = [o[0] for o in opts]
        ok('cat:b3' in vals and 'cat:b2' in vals and 'cat:b6' in vals and 'cat:b7' not in vals and 'cat:b5' not in vals and m1[0]['id'] in vals, '数学で絞り込み: %s' % vals)
        ok(page.locator('#gr-t-mnote').is_hidden(), '案内は最初は非表示')
        page.select_option('#gr-t-material', 'cat:b3'); page.wait_for_timeout(150)
        ok(page.locator('#gr-t-mnote').is_visible(), 'フォルダの本を選ぶと案内が出る')
        page.fill('#gr-t-date', '2026-11-04')
        page.fill('#gr-t-content', '例題1〜5')
        page.fill('#gr-t-qty', '5')
        shot(page, 'c03_task_modal')
        page.click('[data-gr-act="task-save"]'); page.wait_for_timeout(400)
        pl = plan(page)
        m3 = [m for m in pl['materials'] if m.get('driveId') == 'b3']
        t3 = [t for t in pl['tasks'] if t['content'] == '例題1〜5']
        ok(len(m3) == 1 and m3[0]['subject'] == '数学' and m3[0]['status'] == '進行中' and m3[0]['name'] == '基礎問題精講 数学II・B' and m3[0].get('fromCatalog'), '課題を保存すると教材一覧に追加される: %s' % (m3 and m3[0]['name']))
        ok(len(t3) == 1 and t3[0]['materialId'] == m3[0]['id'] and t3[0]['subject'] == '数学' and t3[0]['units'] == 5, '課題はその教材に結びつく')
        toast = page.evaluate("() => (document.querySelector('.toast, #toast, .gr-toast') || {}).textContent || ''")
        # 2件目：同じ本はもう「この生徒の教材」側に出る（重複して教材を作らない）
        page.click('.gr-toolbar [data-gr-act="task-new"]'); page.wait_for_timeout(200)
        page.select_option('#gr-t-subject', '数学'); page.wait_for_timeout(150)
        opts = options(page, '#gr-t-material'); vals = [o[0] for o in opts]
        ok('cat:b3' not in vals and m3[0]['id'] in vals, '登録済みの本はフォルダ側に出ない')
        page.select_option('#gr-t-material', 'cat:b2'); page.wait_for_timeout(100)
        page.fill('#gr-t-date', '2026-11-05'); page.fill('#gr-t-content', '例題6〜10')
        page.click('[data-gr-act="task-save"]'); page.wait_for_timeout(400)
        pl = plan(page)
        ok(len([m for m in pl['materials'] if m.get('driveId') == 'b2']) == 1 and len(pl['materials']) == 5, '別の本を選ぶと教材が増える（計5件）')
        # 科目なしのまま 志望校対策 の本を選ぶ → 科目は空のまま
        page.click('.gr-toolbar [data-gr-act="task-new"]'); page.wait_for_timeout(200)
        page.select_option('#gr-t-material', 'cat:b6'); page.wait_for_timeout(100)
        page.fill('#gr-t-date', '2026-11-06'); page.fill('#gr-t-content', '2020年 大問1')
        page.click('[data-gr-act="task-save"]'); page.wait_for_timeout(400)
        pl = plan(page)
        m6 = [m for m in pl['materials'] if m.get('driveId') == 'b6']
        ok(len(m6) == 1 and m6[0]['subject'] == '' and '' not in pl['subjects'], '科目の決まっていない本は科目なしで追加（科目一覧は汚さない）')
        # 毎日の課題：Drive リンク
        page.evaluate("() => { GR._debug.state.day = '2026-11-04'; GR.render(); }"); page.wait_for_timeout(300)
        ok(page.locator('#gr-view-gweek a.gr-booklink[href*="/b3/"]').count() >= 1, '毎日の課題に Drive リンク')
        txt = page.inner_text('#gr-view-gweek')
        ok('基礎問題精講 数学II・B' in txt and '例題1〜5' in txt, '課題の表示')
        shot(page, 'c04_daily')
        # 「この週の課題を作成」で、問題数・期間のない教材からは課題が作られない
        page.click('[data-gr-act="tab"][data-tab="weekly"]'); page.wait_for_timeout(300)
        page.evaluate("() => { GR._debug.state.week = '2026-11-02'; GR.render(); }"); page.wait_for_timeout(300)
        n_before = len(plan(page)['tasks'])
        page.click('[data-gr-act="week-gen"]'); page.wait_for_timeout(400)
        pl = plan(page)
        auto_from_b3 = [t for t in pl['tasks'] if t.get('auto') and t['materialId'] == m3[0]['id']]
        ok(len(auto_from_b3) == 0 and len(pl['tasks']) > n_before, '期間未設定のフォルダ教材からは自動課題を作らない（他の教材からは作る）')

        # --- 再読み込み：端末のカタログが先に使われる／取得失敗でも消えない ---
        page.evaluate("() => GR.flush()")
        page.route('http://127.0.0.1:8768/books.json', lambda r: r.fulfill(status=404, body='nope'))
        page.reload(); login(page)
        c2 = page.evaluate('() => GR.catalog()')
        ok(c2 and c2['count'] == 7, '取得に失敗しても端末に保存した一覧を使う')
        st = page.evaluate('() => GR._debug.state.catalogState')
        ok(st == 'error', '取得失敗の状態: %s' % st)
        page.unroute('http://127.0.0.1:8768/books.json')
        page.evaluate('() => GR.loadCatalog()'); page.wait_for_timeout(600)
        ok(page.evaluate('() => GR._debug.state.catalogState') == 'ok', '再取得できる')
        b.close()
finally:
    srv.terminate()

print('\n'.join(results))
print('--- errors (%d) ---' % len(errors))
for e in errors[:40]:
    print(e[:300])
