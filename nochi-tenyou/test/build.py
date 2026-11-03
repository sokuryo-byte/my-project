"""
画面（Index.html / Admin.html）と .gs のコードを1つのHTMLにまとめ、ブラウザで直接動かせるようにする（テスト専用）。
  python3 build.py  →  out/index.html, out/admin.html
google.script.run は、同じページ内の .gs の関数を少し遅らせて呼ぶ形に置き換えています。
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src')
OUT = os.path.join(HERE, 'out')

GS_FILES = ['Config.gs', 'Repository.gs', 'Estimate.gs', 'Drive.gs', 'Tohon.gs',
            'Notify.gs', 'Setup.gs', 'WebApp.gs', 'Admin.gs']


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def gs_code():
    return '\n'.join(read(os.path.join(SRC, f)) for f in GS_FILES)


RUN_STUB = '''
setupSpreadsheet();
// マスタの豊田市に参照用URLを入れておく（リンク表示の確認用）
SHEETS['マスタ'].rows.forEach(function (r) { if (r[1] === '豊田市') r[2] = 'https://example.com/toyota-toshikeikaku'; });
var google = { script: { get run() {
  var ok = function () {}, ng = function () {};
  var p = new Proxy({}, { get: function (t, name) {
    if (name === 'withSuccessHandler') return function (f) { ok = f; return p; };
    if (name === 'withFailureHandler') return function (f) { ng = f; return p; };
    return function () {
      var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
      setTimeout(function () {
        try {
          // 本番は呼び出しごとに新しく実行される：1回の処理の中での使い回し（読み取り結果など）を消してから呼ぶ
          SS_MEMO_ = null; SHEET_MEMO_ = {}; forgetSheetCache_();
          var r = window[name].apply(null, args);
          // 本番の google.script.run は戻り値に Date が混じると受け渡しに失敗する（null になる）ので、同じく失敗させる
          var hasDate = function (v) { return v instanceof Date || (v && typeof v === 'object' && Object.keys(v).some(function (k) { return hasDate(v[k]); })); };
          if (hasDate(r)) throw new Error(name + ' の戻り値に日付（Date）が含まれています');
          ok(r === undefined ? null : JSON.parse(JSON.stringify(r)));
        }
        catch (e) { console.log('SERVER ERROR ' + name + ': ' + e.message); ng(e); }
      }, 30);
    };
  } });
  return p;
} } };
'''

# 管理画面用のサンプル案件（2筆）
SEED = '''
submitCase({ requesterName: '田中 一郎', prefecture: '愛知県', plan: '自己用住宅', waterAssociation: '分からない', documents: ['謄本'],
  lots: [
    { municipality: '豊田市', address: '○○町字△△ 123番1', chimoku: '畑', area: '496', zone: '市街化調整区域', isNoshin: 'いいえ', landUse: '耕作中', isConverted: 'いいえ', landImprovement: 'はい', readFromTohon: true },
    { municipality: '豊田市', address: '○○町字△△ 123番2', chimoku: '田', area: '1024', zone: '市街化調整区域', isNoshin: 'はい', landUse: '駐車場', isConverted: 'はい', landImprovement: 'いいえ' }
  ] }, true);
'''


def page(name, seed=''):
    html = read(os.path.join(SRC, name + '.html'))
    # EstimateLib（見積の計算コード）は、テストではページ内の .gs がそのまま使えるので空にする
    html = re.sub(r"<\?!= include\('(\w+)'\); \?>",
                  lambda m: '' if m.group(1) == 'EstimateLib' else read(os.path.join(SRC, m.group(1) + '.html')), html)
    html = html.replace('<?!= bootData ?>', 'null').replace('<?= initialId ?>', '').replace('<?= portalUrl ?>', 'http://192.168.24.54:8000/')
    stub = '<script>' + read(os.path.join(HERE, 'mocks.js')) + '\n' + gs_code() + '\n' + RUN_STUB + seed + '</script>'
    return html.replace('<head>', '<head>' + stub, 1)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page('Index'))
    with open(os.path.join(OUT, 'admin.html'), 'w', encoding='utf-8') as f:
        f.write(page('Admin', SEED))
    print('built:', os.path.join(OUT, 'index.html'), os.path.join(OUT, 'admin.html'))
