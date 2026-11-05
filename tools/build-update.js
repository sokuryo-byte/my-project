// 本番のプログラム（コード.gs）を貼り替えて更新するための手順ページ（dist/update.html）を作る。
// APIキー・スプレッドシートIDは初回の setup() でスクリプトに保存済みなので、ここには含めない。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const files = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const code = '/**\n * マンスリー周辺調査（自動生成：tools/build-update.js）\n * src/ の ' + files.length + ' ファイルを1つにまとめたもの。修正は src/ で行うこと。\n */\n\n' +
  files.map((f) => '/* ======== ' + f + ' ======== */\n' + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const deploy = fs.existsSync(path.join(root, 'dist', 'deploy.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'dist', 'deploy.json'), 'utf8')) : {};
const scriptUrl = (deploy.scriptUrl || 'https://script.google.com/') + (deploy.scriptUrl ? '?authuser=info@monthly-familia.com' : '');
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const html = `<title>周辺調査プログラムの更新</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 1列の作業手順。番号は作業順 */
:root { --bg: #eef1f3; --surface: #ffffff; --ink: #1b2730; --muted: #5a6872; --line: #d4dbe0; --nav: #1c3a52; --accent: #1f5f8f; --accent-ink: #ffffff; --ok: #1d6b40; --code: #f4f6f8;
  --font: "BIZ UDPGothic", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #10171c; --surface: #172128; --ink: #e3eaee; --muted: #9aabb5; --line: #2b3a44; --nav: #0c1a24; --accent: #6fb0de; --accent-ink: #0a1822; --ok: #62c58c; --code: #1c2830; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #10171c; --surface: #172128; --ink: #e3eaee; --muted: #9aabb5; --line: #2b3a44; --nav: #0c1a24; --accent: #6fb0de; --accent-ink: #0a1822; --ok: #62c58c; --code: #1c2830; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.75 var(--font); }
header { background: var(--nav); color: #fff; padding-block: 14px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header h1 { margin: 0; font-size: 18px; } header p { margin: 2px 0 0; font-size: 13px; opacity: .8; }
main { max-width: 780px; margin: 0 auto; padding-block: 20px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 14px; }
section { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; min-width: 0; }
section h2 { margin: 0; padding: 10px 16px; font-size: 15px; border-bottom: 1px solid var(--line); display: flex; gap: 10px; align-items: center; }
.no { font-family: ui-monospace, monospace; font-weight: 700; width: 24px; height: 24px; display: grid; place-items: center; background: var(--nav); color: #fff; border-radius: 2px; font-size: 13px; flex: none; }
.body { padding: 12px 16px 16px; display: grid; gap: 10px; min-width: 0; }
.body p, .body ol { margin: 0; } .body ol { padding-left: 1.3em; display: grid; gap: 4px; }
b.ui { background: var(--code); border: 1px solid var(--line); padding: 0 5px; border-radius: 2px; }
a { color: var(--accent); overflow-wrap: anywhere; }
.btn { min-height: 44px; padding: 0 20px; border-radius: 3px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 700; cursor: pointer; width: fit-content; }
.ok { color: var(--ok); font-weight: 700; }
textarea { width: 100%; height: 80px; border: 1px solid var(--line); background: var(--code); color: var(--muted); font: 11.5px/1.4 ui-monospace, monospace; }
:focus-visible { outline: 2px solid #e09a00; outline-offset: 2px; }
</style>
<header><h1>周辺調査プログラムの更新</h1><p>${stamp} 版（施設の選び方の改善・マイソク読み取りの改善） ／ info@monthly-familia.com で作業</p></header>
<main>
<section><h2><span class="no">1</span>新しいプログラムをコピーする</h2><div class="body">
<p><button class="btn" type="button" id="copy">プログラムをコピー</button> <span class="ok" id="ok" role="status"></span></p>
<label for="code" style="font-size:13px;color:var(--muted)">コピーできない場合は、枠の中をクリックして Ctrl+A → Ctrl+C</label>
<textarea id="code" readonly>${esc(code)}</textarea>
</div></section>
<section><h2><span class="no">2</span>Apps Script に貼り付けて保存する</h2><div class="body">
<ol><li>プログラムを開く：<a href="${esc(scriptUrl)}" target="_blank" rel="noopener">${esc(scriptUrl)}</a></li>
<li>左の一覧で <b class="ui">コード.gs</b> を選ぶ（App.html は変更不要）</li>
<li>コードの部分をクリックして <b>Ctrl+A</b> → <b>Ctrl+V</b> → <b>Ctrl+S</b></li></ol>
</div></section>
<section><h2><span class="no">3</span>新しいバージョンとして公開する</h2><div class="body">
<ol><li>右上 <b class="ui">デプロイ ▼</b> → <b class="ui">デプロイを管理</b></li>
<li>「本番」を選んで <b class="ui">鉛筆マーク</b></li>
<li>「バージョン」を <b class="ui">新バージョン</b> にする（アクセスできるユーザーは「ファミリアグループ 内の全員」のまま）</li>
<li><b class="ui">デプロイ</b> → <b class="ui">完了</b></li></ol>
<p>アプリのURLは変わりません。ウェルモ側の設定もそのままで使えます。</p>
</div></section>
</main>
<script>
document.getElementById('copy').addEventListener('click', function () {
  var ta = document.getElementById('code'), ok = document.getElementById('ok');
  var done = function () { ok.textContent = '✓ コピーしました'; };
  var fb = function () { ta.focus(); ta.select(); try { if (document.execCommand('copy')) return done(); } catch (e) {} ok.textContent = '枠の中をクリックして Ctrl+A → Ctrl+C'; };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fb); else fb();
});
</script>
`;
fs.writeFileSync(path.join(root, 'dist', 'update.html'), html);
console.log('dist/update.html (' + Math.round(code.length / 1024) + 'KB)');
