# ガリレオ 戦略管理システム — ソース構成

公開ファイルはリポジトリ直下の `index.html`（1ファイル完結）と `books.json` です。
`index.html` は「v1.1 のベース」に「個別合格ロードマップ（GR）モジュール」を組み込んで生成します。

```
src/
  base/index_v11.html   … ベース（ダッシュボード・生徒登録・戦略シートなど v1.1 の本体）
  apply_gr.py           … ビルドスクリプト（ベースに GR モジュールを組み込んで index.html を作る）
  gr_a_core.js          … GR：状態・保存（端末＋Supabase roadmap_plans）・同時編集のマージ・自動配分
  gr_f_catalog.js       … GR：参考書フォルダ（books.json）のカタログ
  gr_b_views1.js        … GR：合格戦略／教材・年間計画／月間ロードマップ／到達度
  gr_c_views2.js        … GR：週間学習計画／毎日の課題・採点／復習キュー
  gr_e_bridge.js        … GR：ダッシュボード・戦略シートとの連携
  gr_d_ui.js            … GR：モーダル・印刷・イベント・window.GR
  gr.css / gr_pages.html… GR：スタイルとページ枠
  reg_patch.js / reg_bar.html … 生徒登録の編集機能
  test/                 … Playwright（python）の自動テスト
tools/
  crawl_books.py        … 参考書フォルダ（Google Drive）を巡回して books.json を更新
```

## ビルド

```
python3 -I src/apply_gr.py src/base/index_v11.html index.html
```

バージョン番号は `src/apply_gr.py` の `VERSION` で指定します。

## 参考書フォルダ（books.json）の更新

```
python3 -I tools/crawl_books.py --out books.json
```

Drive のフォルダ「プラトン・ガリレオ共通.（参考書）毎日課題」（リンクを知っている全員が閲覧可）を認証なしで読み、
`books.json`（id・名前・科目・フォルダ・URL）を書き出します。変更がなければファイルは触りません。
毎週月曜の早朝にスケジュールタスクが実行し、変更があればコミット・push します（Netlify が自動で配信）。

## テスト

```
cd src/test
python3 -m venv .venv && . .venv/bin/activate && pip install playwright && playwright install chromium
mkdir -p vendor && cd vendor && npm i @supabase/supabase-js chart.js html2pdf.js && cd ..
sed "s#const SUPABASE_URL = 'https://mwzdqkugawferbttxvey.supabase.co';#const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';#" ../../index.html > dev.html
sed "s#const SUPABASE_URL = 'https://mwzdqkugawferbttxvey.supabase.co';#const SUPABASE_URL = 'https://mock-project.supabase.co';#" ../../index.html > cloud.html
python3 run_test.py; python3 run_unit.py; python3 run_cloud_test.py; python3 run_conflict_test.py; python3 run_register_test.py; python3 run_catalog_test.py
```
