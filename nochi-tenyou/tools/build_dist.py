"""
本番に貼り付ける「4ファイル」を作る。
  python3 tools/build_dist.py  →  dist/Code.gs, dist/Index.html, dist/Admin.html, dist/appsscript.json
src/ の .gs を1つにまとめ、HTML の include（Stylesheet / JavaScript）を中に展開します。
src/ を直したら、これを実行して dist/ を作り直してください（dist/ は手で編集しない）。
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src')
DIST = os.path.join(HERE, '..', 'dist')
GS_ORDER = ['Config.gs', 'Setup.gs', 'WebApp.gs', 'Repository.gs', 'Estimate.gs',
            'Drive.gs', 'Tohon.gs', 'Notify.gs', 'Admin.gs']
HEADER = '// このファイルは tools/build_dist.py で src/ から自動生成しています。修正は src/ で行ってください。\n'


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


def inline_includes(html):
    return re.sub(r"<\?!= include\('(\w+)'\); \?>", lambda m: read(m.group(1) + '.html'), html)


def main():
    os.makedirs(DIST, exist_ok=True)
    gs_names = sorted(f for f in os.listdir(SRC) if f.endswith('.gs'))
    missing = set(gs_names) - set(GS_ORDER)
    assert not missing, 'GS_ORDER に追加してください: %s' % missing
    code = HEADER + '\n'.join('\n// ===== ' + n + ' =====\n' + read(n) for n in GS_ORDER)
    out = {
        'Code.gs': code,
        'Index.html': inline_includes(read('Index.html')),
        'Admin.html': inline_includes(read('Admin.html')),
        'appsscript.json': read('appsscript.json'),
    }
    for name, text in out.items():
        # テンプレートとして評価されるため、展開後のHTMLに想定外の scriptlet が無いか確認
        if name.endswith('.html'):
            extra = [s for s in re.findall(r'<\?.*?\?>', text, re.S) if s != '<?= initialId ?>']
            assert not extra, '%s に想定外の scriptlet: %s' % (name, extra)
        with open(os.path.join(DIST, name), 'w', encoding='utf-8') as f:
            f.write(text)
        print('%-16s %6d bytes' % (name, len(text.encode('utf-8'))))


if __name__ == '__main__':
    main()
