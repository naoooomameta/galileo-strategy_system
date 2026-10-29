#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""参考書フォルダ（Google Drive・リンクを知っている全員が閲覧可）を巡回して books.json を作る。

使い方:  python3 -I tools/crawl_books.py [--out books.json] [--root FOLDER_ID] [--quiet]
認証不要（Drive の公開フォルダ表示 embeddedfolderview を読む）。標準ライブラリのみ。
終了コード: 0=成功（変更の有無は出力で判断）, 2=取得失敗
"""
import argparse, datetime, html, json, os, re, sys, time, urllib.request, urllib.error

ROOT_ID = '1Kr4L3IoSqlhnVIm56SdikhOI8EXJNE7V'
VIEW = 'https://drive.google.com/embeddedfolderview?id='
UA = 'Mozilla/5.0 (compatible; galileo-books-crawler/1.0)'

# フォルダ名 → ロードマップの科目名（上位フォルダが 理科・社会 のときは下位フォルダ名で判定）
SUBJECT_TOP = {'英語': '英語', '数学': '数学', '国語': '国語', '情報': '情報', '理科': '', '社会': '', 'その他': '', '志望校対策': ''}
SUBJECT_SUB = [('物理', '物理'), ('化学', '化学'), ('生物', '生物'), ('地学', '地学'), ('日本史', '日本史'), ('世界史', '世界史'), ('地理', '地理'),
               ('政治・経済', '政治・経済'), ('政治経済', '政治・経済'), ('倫理', '倫理'), ('公共', '公共'), ('歴史総合', '歴史総合'), ('公民', '公共'),
               ('英語', '英語'), ('数学', '数学'), ('国語', '国語'), ('情報', '情報')]

ENTRY = re.compile(r'<div class="flip-entry" id="entry-([^"]+)"[^>]*>(.*?)<div class="flip-entry-last-modified"><div>(.*?)</div></div>', re.S)
HREF = re.compile(r'<a href="([^"]+)"')
TITLE = re.compile(r'<div class="flip-entry-title">(.*?)</div>', re.S)
KIND = re.compile(r'aria-label="([^"]*)"')


def fetch(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ja,en'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode('utf-8', 'replace')
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError('取得に失敗しました: %s (%s)' % (url, last))


def parse(page):
    out = []
    for fid, body, modified in ENTRY.findall(page):
        href = HREF.search(body)
        title = TITLE.search(body)
        kind = KIND.search(body)
        out.append({
            'id': fid,
            'url': html.unescape(href.group(1)) if href else '',
            'title': html.unescape(re.sub(r'<[^>]+>', '', title.group(1))).strip() if title else '',
            'kind': html.unescape(kind.group(1)) if kind else '',
            'modified': html.unescape(re.sub(r'<[^>]+>', '', modified)).strip(),
        })
    return out


def is_folder(e):
    return e['kind'] == 'Folder' or '/drive/folders/' in e['url']


def clean_name(title):
    n = re.sub(r'\.(pdf|PDF|zip|docx?|xlsx?|pptx?|jpe?g|png|txt|mp4|m4a|mp3)$', '', title.strip())
    n = n.replace('_', ' ').replace('　', ' ')
    n = re.sub(r'\s+', ' ', n).strip(' .-／/')
    return n or title.strip()


def subject_of(path):
    top = path[0] if path else ''
    s = SUBJECT_TOP.get(top, '')
    if s:
        return s
    for seg in path[1:]:
        for key, subj in SUBJECT_SUB:
            if key in seg:
                return subj
    return ''


def crawl(root_id, log):
    books, folders = [], 0
    queue = [(root_id, [])]
    seen = set()
    root_title = ''
    while queue:
        fid, path = queue.pop(0)
        if fid in seen:
            continue
        seen.add(fid)
        page = fetch(VIEW + fid)
        if not root_title:
            m = re.search(r'<title>(.*?)</title>', page, re.S)
            root_title = html.unescape(m.group(1)).strip() if m else ''
        entries = parse(page)
        folders += 1
        log('%s（%d件）' % ('／'.join(path) or '（ルート）', len(entries)))
        for e in entries:
            if is_folder(e):
                queue.append((e['id'], path + [e['title']]))
            else:
                # Googleドキュメント等は一覧のリンク（docs.google.com）を、それ以外は Drive のファイル表示 URL を使う
                url = re.sub(r'[?&]usp=[^&]*', '', e['url']) if 'docs.google.com' in e['url'] else 'https://drive.google.com/file/d/%s/view' % e['id']
                books.append({
                    'id': e['id'],
                    'name': clean_name(e['title']),
                    'subject': subject_of(path),
                    'path': '／'.join(path),
                    'url': url,
                })
        time.sleep(0.25)
    books.sort(key=lambda b: (b['path'], b['name'], b['id']))
    return root_title, folders, books


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='books.json')
    ap.add_argument('--root', default=ROOT_ID)
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    log = (lambda s: None) if a.quiet else (lambda s: print(s, file=sys.stderr))
    try:
        title, folders, books = crawl(a.root, log)
    except Exception as e:
        print('ERROR: %s' % e, file=sys.stderr)
        return 2
    if not books:
        print('ERROR: 参考書が1件も取得できませんでした（フォルダの共有設定を確認してください）', file=sys.stderr)
        return 2
    old = None
    if os.path.exists(a.out):
        try:
            with open(a.out, encoding='utf-8') as f:
                old = json.load(f)
        except Exception:
            old = None
    same = old is not None and old.get('books') == books and old.get('source', {}).get('name') == title
    if same:
        print('変更なし: %d冊（%d フォルダ） %s' % (len(books), folders, a.out))
        return 0
    data = {
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'source': {'folderId': a.root, 'name': title, 'url': 'https://drive.google.com/drive/folders/' + a.root},
        'count': len(books),
        'books': books,
    }
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')
    before = {b['id']: b for b in (old or {}).get('books', [])}
    after = {b['id']: b for b in books}
    added = [after[i]['name'] for i in after if i not in before]
    removed = [before[i]['name'] for i in before if i not in after]
    print('更新: %d冊（%d フォルダ）追加 %d・削除 %d → %s' % (len(books), folders, len(added), len(removed), a.out))
    for n in added[:50]:
        print('  + ' + n)
    for n in removed[:50]:
        print('  - ' + n)
    return 0


if __name__ == '__main__':
    sys.exit(main())
