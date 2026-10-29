"""v1.2.1 の修正点の確認：学習段階の逆算・開始番号・予定比（今日の分）・印刷の段落・マージの細部"""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright
import vendor_route

TD = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(TD, 'shots'); os.makedirs(SHOTS, exist_ok=True)
students = [
    {'_id': '44444444-4444-4444-4444-444444444444', 'name': '単体 テスト', 'grade': 'high3', 'stream': 'rikei', 'univName': '東京科学大学',
     'univInfo': {'cat': 'national', 'dev': 65, 'subjects': ['英語', '数学', '物理']}, 'dept1': '理学院', 'devVal': 52, 'months': 5,
     'examMonth': '2027-02', 'subDevs': {'数学IA': 50, '物理': 42}, 'mainSubjects': [], 'manualBooks': []},
]
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--bind', '127.0.0.1'], cwd=TD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
res, errors = [], []


def ok(c, label):
    res.append(('OK ' if c else 'NG ') + label)
    if not c:
        print('NG', label)


try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ja-JP', timezone_id='Asia/Tokyo')
        vendor_route.install(ctx)  # CDNのライブラリはローカルのコピー、他の外部通信は止める
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.goto('http://127.0.0.1:8769/dev.html')
        page.evaluate("(s) => { localStorage.clear(); localStorage.setItem('galileo_students', JSON.stringify(s)); }", students)
        page.fill('#login-email', 'tester@example.com')
        page.click('#login-btn')
        page.wait_for_timeout(1200)
        page.click('.nav-btn:has-text("合格ロードマップ")')
        page.wait_for_timeout(300)
        page.select_option('#gr-root-groad .gr-student-sel', '44444444-4444-4444-4444-444444444444')
        page.wait_for_timeout(400)
        page.click('[data-gr-act="create"]')
        page.wait_for_timeout(400)

        # ---------- 学習段階：入試から逆算 ----------
        st = page.evaluate("() => GR._debug.state.plan.stages.map(s => [s.label, s.start, s.end])")
        ok(st == [['応用演習', '2026-10', '2026-10'], ['過去問演習', '2026-11', '2027-01'], ['最終調整', '2027-02', '2027-02']], '高3・10月（残り5か月）：応用演習→過去問演習3か月→最終調整: %s' % st)
        cases = page.evaluate("""() => {
          const A = GR._debug.autoStages, f = (a, b) => A(a, b).map(s => s.label + ':' + s.start + '~' + s.end);
          return { t1: f('2027-02', '2027-02'), t3: f('2026-12', '2027-02'), t11: f('2026-04', '2027-02'), t17: A('2026-10', '2028-02').map(s => s.label), t17len: A('2026-10', '2028-02').reduce((n, s) => n, 0) };
        }""")
        ok(cases['t1'] == ['最終調整:2027-02~2027-02'], '入試月だけ：最終調整のみ %s' % cases['t1'])
        ok(cases['t3'] == ['過去問演習:2026-12~2027-01', '最終調整:2027-02~2027-02'], '残り3か月：過去問演習2か月＋最終調整 %s' % cases['t3'])
        ok(cases['t11'][0].startswith('典型定着:2026-04~2026-04') and cases['t11'][-1] == '最終調整:2027-02~2027-02' and len(cases['t11']) == 5, '高3・4月（11か月）：典型定着から %s' % cases['t11'])
        ok(cases['t17'] == ['基礎理解', '典型定着', '標準演習', '応用演習', '過去問演習', '最終調整'], '高2（17か月）：6段階すべて')
        months17 = page.evaluate("() => { const ms = GR._debug.autoStages('2026-10', '2028-02'); return ms[0].start + '|' + ms[ms.length - 1].end; }")
        ok(months17 == '2026-10|2028-02', '高2：期間全体をカバー')

        # ---------- 開始番号 ----------
        r = page.evaluate("""() => {
          const D = GR._debug;
          const base = { id: 'mx', subject: '物理', name: 'X', unitLabel: '問題', count: 40, rounds: 1, pattern: 'straight', days: [1,2,3,4,5], minPerItem: 15, start: '2026-10-26', end: '2026-11-27' };
          const s1 = D.computeAlloc(Object.assign({}, base, { startNo: 61 }));
          const s2 = D.computeAlloc(Object.assign({}, base, { id: 'my', startNo: 61, pattern: 'redo', rounds: 2 }));
          const s0 = D.computeAlloc(base);
          return { first: s1[0].text, last: s1[s1.length - 1].text, redo: s2.slice(0, 5).map(s => s.kind + ':' + s.text), plain: s0[0].text };
        }""")
        ok(r['first'].startswith('問題61') and r['last'].endswith('100'), '開始番号61・40題 → 問題61〜100で割り振り: %s … %s' % (r['first'], r['last']))
        ok(r['plain'].startswith('問題1'), '開始番号なしは問題1から: %s' % r['plain'])
        ok(all('問題6' in x or '問題7' in x for x in r['redo'][:3]) and any(x.startswith('check:') for x in r['redo']), '解き直し型・確認問題も開始番号つき: %s' % r['redo'])

        # 教材フォームから開始番号を入力
        page.click('[data-gr-act="tab"][data-tab="materials"]')
        page.wait_for_timeout(200)
        page.click('[data-gr-act="mat-new"]')
        page.select_option('#gr-m-subject', '物理')
        page.fill('#gr-m-name', '良問の風 物理')
        page.fill('#gr-m-unitLabel', '問題')
        page.fill('#gr-m-count', '40')
        page.fill('#gr-m-startNo', '61')
        page.fill('#gr-m-rounds', '1')
        page.fill('#gr-m-start', '2026-10-26')
        page.fill('#gr-m-end', '2026-11-27')
        calc = page.inner_text('#gr-m-calc')
        ok('問題61〜100' in calc, '教材フォームに範囲（問題61〜100）を表示: ' + calc.replace('\n', ' '))
        page.click('[data-gr-act="mat-save"]')
        page.wait_for_timeout(300)
        row = page.inner_text('#gr-view-groad tr[data-gr-act="mat-edit"]:has-text("良問の風")')
        ok('問題61〜100' in row and '40題 × 1周' in row, '教材の表に範囲を表示: ' + row.replace('\n', ' / '))
        page.click('[data-gr-act="mat-new"]')
        page.select_option('#gr-m-subject', '数学')
        page.fill('#gr-m-name', '志田晶の数学III')
        page.fill('#gr-m-unitLabel', 'テーマ')
        page.fill('#gr-m-count', '8')
        page.fill('#gr-m-rounds', '1')
        page.fill('#gr-m-start', '2026-10-27')
        page.fill('#gr-m-end', '2026-10-30')
        page.click('[data-gr-act="mat-save"]')
        page.wait_for_timeout(300)
        row = page.inner_text('#gr-view-groad tr[data-gr-act="mat-edit"]:has-text("志田晶")')
        ok('8テーマ × 1周' in row and '1日 約2テーマ' in row, '「テーマ」などの単位で表示: ' + row.replace('\n', ' / '))
        # 開始番号を変更すると履歴に範囲が残る
        page.click('tr[data-gr-act="mat-edit"]:has-text("良問の風")')
        page.fill('#gr-m-startNo', '71')
        page.fill('#gr-m-count', '30')
        page.fill('#gr-m-reason', '前回までに70番まで終了')
        page.click('[data-gr-act="mat-save"]')
        page.wait_for_timeout(300)
        h = page.evaluate("() => GR._debug.state.plan.history.find(x => x.target.indexOf('良問の風') >= 0)")
        ok(h and '問題61〜100' in h['before'] and '問題71〜100' in h['after'], '計画変更履歴に範囲の変更が残る: %s → %s' % (h and h['before'], h and h['after']))

        # ---------- 今日の分は、提出するまで遅れ扱いにしない ----------
        page.click('.nav-btn:has-text("週間・毎日課題")')
        page.wait_for_timeout(200)
        page.evaluate("() => { const S = GR._debug.state; S.week = '2026-10-26'; GR.render(); }")
        page.click('[data-gr-act="week-gen"]')
        page.wait_for_timeout(300)
        stats = page.evaluate("""() => {
          const D = GR._debug, S = D.state, m = S.plan.materials.find(x => x.name === '良問の風 物理');
          const t0 = new Date(); const today = t0.getFullYear() + '-' + String(t0.getMonth() + 1).padStart(2, '0') + '-' + String(t0.getDate()).padStart(2, '0');
          const tasks = S.plan.tasks.filter(t => t.materialId === m.id).sort((a, b) => a.date < b.date ? -1 : 1);
          const past = tasks.filter(t => t.date < today), todayT = tasks.find(t => t.date === today);
          if (!todayT) return { skip: true, today, dates: tasks.map(t => t.date) };
          const pastU = past.reduce((n, t) => n + (t.units || 0), 0);
          const s0 = D.matStats(m), sub0 = D.subjectStats('物理');
          todayT.status = 'submitted';
          const s1 = D.matStats(m), sub1 = D.subjectStats('物理');
          past.forEach(t => { t.status = 'submitted'; });
          const s2 = D.matStats(m), sub2 = D.subjectStats('物理');
          return { pastU, nPast: past.length, todU: todayT.units, s0: [s0.planned, s0.done, s0.diff], s1: [s1.planned, s1.done, s1.diff], s2: [s2.planned, s2.done, s2.diff],
                   sub: [[sub0.sub, sub0.due], [sub1.sub, sub1.due], [sub2.sub, sub2.due]] };
        }""")
        if stats.get('skip'):
            ok(False, '今日の課題が見つからない（土日に実行？）%s' % stats)
        else:
            pu, tod, npast = stats['pastU'], stats['todU'], stats['nPast']
            ok(stats['s0'] == [pu, 0, -pu], '何も提出していない：遅れは前日までの分だけ（今日の分は含めない）%s' % stats['s0'])
            ok(stats['s1'] == [pu + tod, tod, -pu], '今日の分を提出：今日の分が予定にも完了にも加わる %s' % stats['s1'])
            ok(stats['s2'] == [pu + tod, pu + tod, 0], '前日までの分も提出：予定どおり %s' % stats['s2'])
            ok(stats['sub'] == [[0, npast], [1, npast + 1], [npast + 1, npast + 1]], '提出率も今日の未提出は数えない %s' % stats['sub'])

        # ---------- 印刷：優先課題の見出しと説明が別の行・見出しは太字 ----------
        page.click('.nav-btn:has-text("合格ロードマップ")')
        page.click('[data-gr-act="tab"][data-tab="strategy"]')
        page.wait_for_timeout(200)
        page.fill('[data-gr-bind="profile.priorities.0.title"]', '数学Ⅲ・Cを得点源にする')
        page.fill('[data-gr-bind="profile.priorities.0.desc"]', '11月中に典型問題を仕上げる')
        page.fill('[data-gr-bind="profile.hoursWeekday"]', '4')
        page.keyboard.press('Tab')
        page.evaluate("() => { window.print = () => {}; }")
        page.click('[data-gr-act="print"]')
        page.wait_for_timeout(500)
        pr = page.evaluate("""() => {
          const d = document.getElementById('gr-print-frame').contentDocument;
          d.defaultView.print = () => {};
          const spans = [...d.querySelectorAll('.gr-prio .gr-pv')];
          const cs = spans.map(s => d.defaultView.getComputedStyle(s));
          const hours = [...d.querySelectorAll('.gr-kv .gr-pv')].find(s => s.textContent === '4');
          return { texts: spans.map(s => s.textContent), display: cs.map(c => c.display), weight: cs.map(c => c.fontWeight),
                   tops: spans.map(s => Math.round(s.getBoundingClientRect().top)), hoursDisplay: hours ? (hours.style.display || 'inline') : null, hoursRow: hours ? Array.from(hours.parentElement.textContent).filter(c => c.trim()).join('') : null };
        }""")
        ok(pr['texts'][:2] == ['数学Ⅲ・Cを得点源にする', '11月中に典型問題を仕上げる'], '印刷：優先課題の文字 %s' % pr['texts'][:2])
        ok(pr['display'][:2] == ['block', 'block'] and pr['tops'][1] > pr['tops'][0], '印刷：見出しと説明が別の行になる %s %s' % (pr['display'][:2], pr['tops'][:2]))
        ok(int(pr['weight'][0]) >= 700 and int(pr['weight'][1]) < 600, '印刷：見出しは太字・説明は通常 %s' % pr['weight'][:2])
        ok(pr['hoursDisplay'] == 'inline' and '平日4時間' in (pr['hoursRow'] or ''), '印刷：「平日4時間」のような短い欄は文中のまま %s %s' % (pr['hoursDisplay'], pr['hoursRow']))
        page.evaluate("() => { const f = document.getElementById('gr-print-frame'); f.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:900px;z-index:99999;background:#fff;visibility:visible;border:0'; }")
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(SHOTS, 'u_print_strategy.png'))
        page.evaluate("() => { const f = document.getElementById('gr-print-frame'); if (f) f.remove(); }")

        # ---------- タイムライン：模試・節目のラベルが1か月の幅に収まる ----------
        page.click('[data-gr-act="tab"][data-tab="materials"]')
        page.wait_for_timeout(200)
        page.evaluate("""() => { const S = GR._debug.state; S.plan.events.push({id: 'e1', date: '2027-01', label: '大学入学共通テスト', kind: '節目'}, {id: 'e2', date: '2027-02', label: '東京科学大学 個別学力検査（前期）', kind: '節目'}); GR.render(); }""")
        page.wait_for_timeout(200)
        ev = page.evaluate("""() => { const els = [...document.querySelectorAll('#gr-view-groad .gr-g-ev')]; const r = els.map(e => e.getBoundingClientRect());
            const overlap = r.some((a, i) => r.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
            const cut = els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
            return { n: els.length, overlap, cut, lanes: [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))].length, titles: els.map(e => e.title) }; }""")
        ok(ev['n'] == 2 and not ev['overlap'] and not ev['cut'], '模試・節目の名前が重ならず、全文が読める %s' % ev)
        # 17か月の長い計画（高2）でも、隣り合う節目の名前が省略されない
        page.evaluate("""() => { const S = GR._debug.state; S.student = Object.assign({}, S.student, { examMonth: '2028-02' }); S.plan.stages = GR._debug.autoStages('2026-10', '2028-02');
            S.plan.events = [{id: 'e0', date: '2026-11', label: '11月 記述模試', kind: '模試'}, {id: 'e1', date: '2028-01', label: '大学入学共通テスト', kind: '節目'}, {id: 'e2', date: '2028-02', label: '大阪大学 個別学力検査（前期）', kind: '節目'}]; GR.render(); }""")
        page.wait_for_timeout(200)
        ev2 = page.evaluate("""() => { const els = [...document.querySelectorAll('#gr-view-groad .gr-g-ev')]; const r = els.map(e => e.getBoundingClientRect());
            const overlap = r.some((a, i) => r.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
            const cut = els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
            const track = document.querySelector('#gr-view-groad .gr-g-row:nth-child(3) .gr-g-track') || els[0].parentElement; const tb = track.getBoundingClientRect();
            const inside = r.every(x => x.left >= tb.left - 1 && x.right <= tb.right + 1);
            return { n: els.length, overlap, cut, inside, lanes: [...new Set(r.map(x => Math.round(x.top)))].length }; }""")
        ok(ev2['n'] == 3 and not ev2['overlap'] and not ev2['cut'] and ev2['inside'], '17か月の計画でも3つの節目の名前が全文・重なりなし・枠内に収まる %s' % ev2)
        page.screenshot(path=os.path.join(SHOTS, 'u_timeline17.png'), full_page=True)
        page.screenshot(path=os.path.join(SHOTS, 'u_materials.png'), full_page=True)

        # ---------- 週ごとの範囲・目標（月間ロードマップ ⇄ 週間学習計画 ⇄ 配信用テキスト） ----------
        page.click('[data-gr-act="tab"][data-tab="monthly"]')
        page.evaluate("() => { GR._debug.state.month = '2026-10'; GR.render(); }")
        page.wait_for_timeout(300)
        wk = page.evaluate("""() => { const D = GR._debug, S = D.state, m = S.plan.materials.find(x => x.name === '良問の風 物理');
            const weeks = D.weeksOfMonth('2026-10'); const heads = [...document.querySelectorAll('#gr-view-groad .gr-weeks th')].map(h => h.textContent.replace(/\\s+/g, ' ').trim());
            const row = [...document.querySelectorAll('#gr-view-groad .gr-weeks tr')].find(tr => tr.textContent.indexOf('良問の風') >= 0);
            const cells = row ? [...row.querySelectorAll('td')].slice(1).map(td => td.textContent.trim()) : [];
            const inputs = row ? row.querySelectorAll('input[data-gr-bind^="weeks."]').length : 0;
            return { weeks, heads, cells, inputs, auto1026: D.weekAutoRange(m, '2026-10-26'), auto1102: D.weekAutoRange(m, '2026-11-02'), month: S.plan.months && Object.keys(S.plan.months) }; }""")
        ok(wk['weeks'] == ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'] and len(wk['heads']) == 6 and '第1週' in wk['heads'][1] and '第5週' in wk['heads'][5], '10月の週が5つ（月またぎの週を含む）: %s' % wk['weeks'])
        ok(wk['cells'][:4] == ['—', '—', '—', '—'] and wk['auto1026'].startswith('問題71〜') and wk['auto1026'] in wk['cells'][4], '期間外の週は「—」、期間内の週は自動の範囲（%s）' % wk['auto1026'])
        ok(wk['inputs'] == 1 and wk['auto1102'].startswith('問題7'), '週間目標の入力欄は期間内の週にだけ出る（翌週の自動範囲 %s）' % wk['auto1102'])
        # 月の範囲と週の範囲がつながっている（10/26週の最後の番号＋1 = 11/2週の最初の番号）
        import re as _re
        a_end = int(_re.findall(r'(\d+)', wk['auto1026'])[-1]); b_start = int(_re.findall(r'(\d+)', wk['auto1102'])[0])
        ok(b_start == a_end + 1, '週の範囲が連続している（%d → %d）' % (a_end, b_start))
        mid = page.evaluate("() => GR._debug.state.plan.materials.find(x => x.name === '良問の風 物理').id")
        page.fill('[data-gr-bind="weeks.2026-10-26.goals.%s"]' % mid, '問題71〜75を図を書いて解く')
        page.keyboard.press('Tab')
        page.wait_for_timeout(300)
        ok(page.evaluate("() => GR._debug.state.plan.weeks['2026-10-26'].goals['%s']" % mid) == '問題71〜75を図を書いて解く', '週間目標が保存される（weeks.週の月曜.goals.教材ID）')
        # 週間学習計画に同じ目標が出る
        page.click('.nav-btn:has-text("週間・毎日課題")')
        page.click('[data-gr-act="tab"][data-tab="weekly"]')
        page.evaluate("() => { GR._debug.state.week = '2026-10-26'; GR.render(); }")
        page.wait_for_timeout(300)
        wg = page.evaluate("""() => { const box = document.querySelector('#gr-view-gweek .gr-wgoals'); const inp = box && box.querySelector('input[data-gr-bind="weeks.2026-10-26.goals.%s"]');
            return { box: !!box, val: inp && inp.value, items: box ? box.querySelectorAll('.gr-wgoal').length : 0, text: GR._debug.weekText('2026-10-26') }; }""" % mid)
        ok(wg['box'] and wg['val'] == '問題71〜75を図を書いて解く' and wg['items'] >= 1, '週間学習計画の「今週の範囲・目標」に同じ目標が出る')
        ok('■今週の目標' in wg['text'] and '良問の風 物理：問題71〜75を図を書いて解く' in wg['text'], '配信用テキストに「今週の目標」が入る')
        # 空欄の教材は自動の範囲が目標になる（志田晶：10/27〜10/30）
        ok('志田晶の数学III：テーマ1〜' in wg['text'], '目標が空欄の教材は自動の範囲を使う: %s' % [l for l in wg['text'].split('\n') if '志田晶' in l][:1])
        page.screenshot(path=os.path.join(SHOTS, 'u_weekly_goals.png'), full_page=True)
        # 月間ロードマップへ戻るリンク
        page.click('#gr-view-gweek [data-gr-act="goto-month"]')
        page.wait_for_timeout(300)
        ok(page.locator('#page-groad').is_visible() and page.evaluate("() => GR._debug.state.tab.groad") == 'monthly' and page.evaluate("() => GR._debug.state.month") == '2026-10', '「月間ロードマップで見る」で該当月へ移動')
        page.screenshot(path=os.path.join(SHOTS, 'u_monthly_weeks.png'), full_page=True)
        # 印刷に週ごとの表が入る
        page.evaluate("() => { window.print = () => {}; }")
        page.click('[data-gr-act="print"]')
        page.wait_for_timeout(500)
        pr2 = page.evaluate("""() => { const d = document.getElementById('gr-print-frame').contentDocument; d.defaultView.print = () => {}; const t = d.body.innerText; return { has: t.indexOf('週ごとの範囲・目標') >= 0, goal: t.indexOf('問題71〜75を図を書いて解く') >= 0, inputs: d.querySelectorAll('input').length }; }""")
        ok(pr2['has'] and pr2['goal'] and pr2['inputs'] == 0, '印刷に週ごとの範囲・目標が入る %s' % pr2)
        page.evaluate("() => { const f = document.getElementById('gr-print-frame'); if (f) f.remove(); }")

        # ---------- ダッシュボード：直近の模試（ロードマップの模試結果から） ----------
        page.click('.nav-btn:has-text("合格ロードマップ")')
        page.click('[data-gr-act="tab"][data-tab="strategy"]')
        page.wait_for_timeout(200)
        page.evaluate("""() => { const S = GR._debug.state; S.plan.mocks = [{id: 'mk1', month: '2026-08', name: '記述模試', devs: {数学: 47, 物理: 44}, judge: 'D'}, {id: 'mk2', month: '2026-10', name: '記述模試', devs: {数学: 48, 物理: 45}, judge: 'D'}];
            S.plan.profile.altUnivs = '神戸大学 工学部'; S.plan.profile.commonRatio = 32; S.plan.profile.secondRatio = 68; S.plan.profile.weights = [{id: 'w1', subject: '共通テスト', points: 325}, {id: 'w2', subject: '個別：数学', points: 250}, {id: 'w3', subject: '個別：英語', points: 200}, {id: 'w4', subject: '個別：理科', points: 250}];
            S.plan.profile.policies = ['平日は数学1.5時間']; S.plan.profile.priorities = [{id: 'p1', title: '力学を得点源に', desc: '立式の型'}]; S.plan.profile.goalText = '阪大に現役合格'; S.plan.updatedAt = new Date().toISOString(); GR.flush(); }""")
        page.click('.nav-btn:has-text("ダッシュボード")')
        page.wait_for_timeout(500)
        row = page.inner_text('.student-row:has-text("単体 テスト")')
        ok('10月模試' in row and '数学48' in row and '（+1）' in row and '物理45' in row and '判定D' in row and '2回記録' in row, 'ダッシュボードにロードマップの直近の模試が出る: %s' % [l for l in row.split('\n') if '模試' in l][:1])
        ok('直近実績' not in row, '推移予測の「直近実績」は表示しない')
        # ---------- 戦略シート：生徒データから反映（ロードマップの内容も取り込む） ----------
        page.click('.nav-btn:has-text("戦略シート")')
        page.wait_for_timeout(600)
        page.select_option('#ss-student-sel', '単体 テスト')
        page.wait_for_timeout(500)
        page.click('button:has-text("生徒データから反映")')
        page.wait_for_timeout(300)
        ok('個別合格ロードマップの内容' in page.inner_text('#ss-confirm-msg'), '確認文にロードマップの反映が書かれている')
        page.click('#ss-confirm-ok')
        page.wait_for_timeout(1500)
        sd = page.evaluate("""() => ({ rows: Object.fromEntries(ssData.profile.rows), chart: ssData.strategy.chart.rows, legend: ssData.strategy.chart.legendCur, exam: ssData.profile.exam, pol: ssData.strategy.policies, pri: ssData.strategy.priorities, miles: ssData.strategy.milestones.slice(0, 2), mats: ssData.materials.rows.map(m => [m.sub, m.name, m.start, m.end, m.cycles]), mock: { header: ssData.mock.header, rows: ssData.mock.rows }, goal: ssData.profile.goal })""")
        ok(sd['rows'].get('併願校') == '神戸大学 工学部' and sd['rows'].get('現状の学力', '').startswith('模試偏差値（10月）'), '併願校・現状の学力がロードマップから入る %s' % {k: sd['rows'].get(k) for k in ['併願校', '現状の学力']})
        ok(sd['chart'] == [{'sub': '数学', 'cur': 55, 'tgt': 65}, {'sub': '物理', 'cur': 50, 'tgt': 65}] or (len(sd['chart']) == 2 and sd['chart'][0]['sub'] == '数学' and sd['chart'][0]['tgt'] == 65), '偏差値グラフは現在・目標の値から %s' % sd['chart'])
        ok(sd['legend'] == '現在（2026年10月模試）', '凡例に直近の模試の月 %s' % sd['legend'])
        ok(sd['exam']['v1'] == '32%' and sd['exam']['v2'] == '68%' and sd['exam']['rows'][1] == ['個別：数学', '250'] and sd['exam']['total'] == '1,025', '配点が入る %s' % sd['exam']['total'])
        ok(sd['pol'] == ['平日は数学1.5時間'] and sd['pri'] == [{'t': '力学を得点源に', 'd': '立式の型'}] and sd['goal'] == '阪大に現役合格', '方針・優先課題・目標が入る')
        ok(sd['miles'][0][1] in ('基礎理解', '応用演習') and sd['miles'][0][0].startswith('2026年10'), 'マイルストーンは学習段階から %s' % sd['miles'][0])
        ok(any(m[1].startswith('良問の風 物理（問題71〜100）') and m[2] == '10月' and m[3] == '11月' for m in sd['mats']), '教材一覧に開始番号つきの範囲と期間 %s' % sd['mats'][:2])
        ok(sd['mock']['header'] == ['実施時期', '数学', '物理', '判定'] and sd['mock']['rows'][-1] == ['2026年10月 記述模試', '48', '45', 'D'], '模試の表がロードマップの模試結果から %s' % sd['mock']['rows'][-1])
        page.screenshot(path=os.path.join(SHOTS, 'u_sheet_import.png'), full_page=True)

        # ---------- マージの細部 ----------
        mr = page.evaluate("""() => {
          const M = GR._debug.mergePlans, mig = GR._debug.migrate, c = x => JSON.parse(JSON.stringify(x));
          const base = mig({ createdAt: 'c1', subjects: ['数学', '物理'], profile: { policies: ['a', 'b'], school: 'S0', goalText: 'G0', targets: { 数学: 60 } },
                             months: { '2026-11': { can: '' } }, materials: [{ id: 'm1', name: 'M', count: 10 }], tasks: [], reviews: [] });
          const l = c(base), r = c(base);
          l.subjects.push('化学'); r.subjects = ['数学'];
          l.profile.policies.push('c'); r.profile.policies[1] = 'b2';
          l.profile.school = 'SL'; r.profile.school = 'SR'; r.profile.goalText = 'GR';
          l.months['2026-11'].can = 'できた'; r.months['2026-11'].next = '次は';
          l.materials[0].count = 20; r.materials[0].name = 'M2';
          l.profile.targets.数学 = 62; r.profile.targets.物理 = 58;
          const m = M(base, l, r);
          const u = M(null, { createdAt: 'c1', tasks: [{ id: 't1', status: 'graded' }], subjects: ['数学'] }, { createdAt: 'c1', tasks: [{ id: 't2', status: 'todo' }], subjects: ['物理'] });
          // 内容から決まるID：同じ内容ならどの画面でも同じID
          const p1 = mig({ profile: { priorities: [{ title: 'x', desc: 'y' }] } }), p2 = mig({ profile: { priorities: [{ title: 'x', desc: 'y' }] } });
          return { subjects: m.subjects, policies: m.profile.policies, school: m.profile.school, goal: m.profile.goalText, months: m.months['2026-11'], mat: m.materials[0],
                   targets: m.profile.targets, union: u.tasks.map(t => t.id).sort(), unionSub: u.subjects.slice().sort(), ids: [p1.profile.priorities[0].id, p2.profile.priorities[0].id] };
        }""")
        ok(mr['subjects'] == ['数学', '化学'], '科目：追加と削除の両方を反映 %s' % mr['subjects'])
        ok(mr['policies'] == ['a', 'c', 'b2'], '方針（文字の一覧）：両方の追加・変更を反映 %s' % mr['policies'])
        ok(mr['school'] == 'SL' and mr['goal'] == 'GR', '同じ欄はこの画面の値・別の欄は相手の値 %s %s' % (mr['school'], mr['goal']))
        ok(mr['months'] == {'can': 'できた', 'next': '次は'}, '月次サマリー：別々の欄を両方反映 %s' % mr['months'])
        ok(mr['mat']['count'] == 20 and mr['mat']['name'] == 'M2', '同じ教材の別々の項目を両方反映 %s' % mr['mat'])
        ok(mr['targets'] == {'数学': 62, '物理': 58}, '目標偏差値：科目ごとに反映 %s' % mr['targets'])
        ok(mr['union'] == ['t1', 't2'] and mr['unionSub'] == ['数学', '物理'], '元の版が不明なときは、両方にあるものをすべて残す')
        ok(mr['ids'][0] == mr['ids'][1] and mr['ids'][0], 'IDのない行には内容から同じIDが付く %s' % mr['ids'])
        b.close()
finally:
    srv.terminate()
print('\n'.join(res))
print('--- errors (%d) ---' % len(errors))
for e in errors[:20]:
    print(e[:300])
