"""テスト用：CDNのライブラリをローカルのコピーで返し、その他の外部通信は止める（環境によって外部への応答が止まるため）"""
import os
VD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'node_modules')
LOCAL = {
    'supabase.min.js': os.path.join(VD, '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
    'chart.umd.min.js': os.path.join(VD, 'chart.js', 'dist', 'chart.umd.js'),
    'html2pdf.bundle.min.js': os.path.join(VD, 'html2pdf.js', 'dist', 'html2pdf.bundle.min.js'),
}


def install(ctx, allow_prefixes=('http://127.0.0.1',)):
    def handler(route):
        url = route.request.url
        for key, path in LOCAL.items():
            if url.split('?')[0].endswith(key) and os.path.exists(path):
                return route.fulfill(status=200, content_type='application/javascript', path=path)
        return route.abort()
    ctx.route(lambda u: not any(u.startswith(p) for p in allow_prefixes), handler)
