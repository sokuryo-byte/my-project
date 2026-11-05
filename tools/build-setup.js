// 本番の Apps Script に貼り付けるファイル（3つ）と、その手順ページ（dist/setup.html）を作る
//   dist/gas/コード.gs        … src/*.js を1つにまとめたもの
//   dist/gas/App.html         … アプリ画面
//   dist/gas/appsscript.json  … マニフェスト
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist', 'gas');
fs.mkdirSync(out, { recursive: true });
const files = fs.readdirSync(src).filter((f) => f.endsWith('.js')).sort();
const code = '/**\n * マンスリー周辺調査（自動生成：tools/build-setup.js）\n * src/ の ' + files.length + ' ファイルを1つにまとめたもの。直接編集せず、src/ を直してから作り直すこと。\n */\n\n' +
  files.map((f) => '/* ======== ' + f + ' ======== */\n' + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const app = fs.readFileSync(path.join(src, 'App.html'), 'utf8');
const manifest = fs.readFileSync(path.join(src, 'appsscript.json'), 'utf8');
fs.writeFileSync(path.join(out, 'コード.gs'), code);
fs.writeFileSync(path.join(out, 'App.html'), app);
fs.writeFileSync(path.join(out, 'appsscript.json'), manifest);

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const box = (id, label, text) => `<div class="copy"><div class="copy-head"><b>${label}</b><button class="btn" type="button" data-copy="${id}">${label}をコピー</button><span class="ok" id="ok-${id}" role="status"></span></div>
<textarea id="${id}" readonly aria-label="${label}">${esc(text)}</textarea></div>`;

const html = `<title>周辺調査アプリの本番準備</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 1列の作業手順書。番号は実際の作業順 */
:root { --bg: #eef1f3; --surface: #ffffff; --ink: #1b2730; --muted: #5a6872; --line: #d4dbe0; --nav: #1c3a52; --accent: #1f5f8f; --accent-ink: #ffffff; --ok: #1d6b40; --warn-soft: #fff4dc; --warn-line: #e1b955; --code: #f4f6f8;
  --font: "BIZ UDPGothic", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #10171c; --surface: #172128; --ink: #e3eaee; --muted: #9aabb5; --line: #2b3a44; --nav: #0c1a24; --accent: #6fb0de; --accent-ink: #0a1822; --ok: #62c58c; --warn-soft: #352a10; --warn-line: #7a6024; --code: #1c2830; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #10171c; --surface: #172128; --ink: #e3eaee; --muted: #9aabb5; --line: #2b3a44; --nav: #0c1a24; --accent: #6fb0de; --accent-ink: #0a1822; --ok: #62c58c; --warn-soft: #352a10; --warn-line: #7a6024; --code: #1c2830; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.75 var(--font); }
header { background: var(--nav); color: #fff; padding-block: 14px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header h1 { margin: 0; font-size: 18px; } header p { margin: 2px 0 0; font-size: 13px; opacity: .8; }
main { max-width: 820px; margin: 0 auto; padding-block: 20px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 14px; }
section { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; min-width: 0; }
section h2 { margin: 0; padding: 10px 16px; font-size: 15px; border-bottom: 1px solid var(--line); display: flex; gap: 10px; align-items: center; }
.no { font-family: ui-monospace, monospace; font-weight: 700; width: 24px; height: 24px; display: grid; place-items: center; background: var(--nav); color: #fff; border-radius: 2px; font-size: 13px; flex: none; }
.body { padding: 12px 16px 16px; display: grid; gap: 10px; min-width: 0; }
.body p, .body ol, .body ul { margin: 0; } .body ol, .body ul { padding-left: 1.3em; display: grid; gap: 4px; }
b.ui { background: var(--code); border: 1px solid var(--line); padding: 0 5px; border-radius: 2px; font-weight: 700; }
code { font-family: ui-monospace, monospace; background: var(--code); border: 1px solid var(--line); padding: 0 5px; border-radius: 2px; overflow-wrap: anywhere; }
.tip { background: var(--warn-soft); border-left: 4px solid var(--warn-line); padding: 8px 12px; font-size: 14px; }
.copy { border: 1px solid var(--line); border-radius: 3px; min-width: 0; }
.copy-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 8px 10px; background: var(--code); border-bottom: 1px solid var(--line); }
.copy-head b { flex: 1; min-width: 120px; }
.btn { min-height: 40px; padding: 0 16px; border-radius: 3px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 700; cursor: pointer; }
.ok { color: var(--ok); font-weight: 700; font-size: 13px; }
textarea { display: block; width: 100%; height: 90px; border: 0; padding: 8px 10px; font: 11.5px/1.4 ui-monospace, monospace; background: var(--surface); color: var(--muted); resize: vertical; }
:focus-visible { outline: 2px solid #e09a00; outline-offset: 2px; }
</style>
<header><h1>周辺調査アプリの本番準備（第1段階：アプリを置く）</h1><p>マンスリー部門のGoogleアカウントで作業してください。所要時間 約15分</p></header>
<main>
<section><h2><span class="no">1</span>スプレッドシートを作る</h2><div class="body">
<ol><li>マンスリー部門のGoogleアカウントでGoogleドライブを開く（共有ドライブがあればその中が推奨。担当者が替わってもファイルが残ります）</li>
<li><b class="ui">＋ 新規</b> → <b class="ui">Google スプレッドシート</b></li>
<li>左上のファイル名を「<b>マンスリー周辺調査</b>」に変更</li>
<li>メニューの <b class="ui">拡張機能</b> → <b class="ui">Apps Script</b> を押す（新しいタブで編集画面が開きます）</li></ol>
</div></section>

<section><h2><span class="no">2</span>設定ファイルを表示させる</h2><div class="body">
<ol><li>Apps Script の画面左端の <b class="ui">⚙ プロジェクトの設定</b>（歯車）を押す</li>
<li>「<b>「appsscript.json」マニフェスト ファイルをエディタで表示する</b>」にチェックを入れる</li>
<li>左端の <b class="ui">&lt;&gt; エディタ</b> に戻る（ファイル一覧に <code>appsscript.json</code> が増えています）</li></ol>
</div></section>

<section><h2><span class="no">3</span>3つのファイルを貼り付ける</h2><div class="body">
<p>それぞれ「コピー」を押し、Apps Script の該当ファイルを開いて <b>Ctrl+A → Ctrl+V</b> で中身を置き換えます。</p>
<p><b>(1) コード.gs</b>：ファイル一覧の <code>コード.gs</code> を開いて置き換え</p>
${box('code', 'コード.gs', code)}
<p><b>(2) appsscript.json</b>：ファイル一覧の <code>appsscript.json</code> を開いて置き換え</p>
${box('manifest', 'appsscript.json', manifest)}
<p><b>(3) App.html</b>：ファイル一覧の上の <b class="ui">＋</b> → <b class="ui">HTML</b> → 名前を <code>App</code> にして作成（「.html」は自動で付きます）→ 中身を置き換え</p>
${box('app', 'App.html', app)}
<p>最後に <b>Ctrl+S</b>（または💾ボタン）で保存します。</p>
<p class="tip">ファイル名は <code>App</code> ちょうどにしてください（大文字のA）。違うと画面が開きません。</p>
</div></section>

<section><h2><span class="no">4</span>初期セットアップを実行する</h2><div class="body">
<ol><li>スプレッドシートのタブに戻り、<b>再読み込み（F5）</b></li>
<li>メニューに <b class="ui">周辺調査</b> が出るまで数秒待ち、<b class="ui">周辺調査</b> → <b class="ui">初期セットアップ（シート作成）</b></li>
<li>「承認が必要です」→ <b class="ui">続行</b> → 部門のアカウントを選ぶ</li>
<li>「このアプリは Google で確認されていません」と出たら <b class="ui">詳細</b> → <b class="ui">（安全ではないページ）に移動</b> → <b class="ui">許可</b>
<br><span style="color:var(--muted);font-size:13px">自分たちで作ったアプリなので Google の審査を受けていないという意味です。許可する権限は、このスプレッドシート・Googleドライブ（マイソクPDFの保存と読み取り）・外部への接続（Google Maps API）です。</span></li>
<li>もう一度 <b class="ui">周辺調査</b> → <b class="ui">初期セットアップ</b> を押し、「セットアップが完了しました」と出れば完了</li></ol>
<p class="tip">シート（物件・施設結果・駅結果・設定 など）が下に並んでいれば成功です。終わったら、画面のスクリーンショットを送ってください。次は Google Maps の APIキー を作ります。</p>
</div></section>
</main>
<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy]'); if (!b) return;
  var id = b.getAttribute('data-copy'), ta = document.getElementById(id), ok = document.getElementById('ok-' + id);
  var done = function () { ok.textContent = '✓ コピーしました'; };
  var fallback = function () { ta.focus(); ta.select(); try { if (document.execCommand('copy')) return done(); } catch (x) {} ok.textContent = '枠の中をクリックして Ctrl+A → Ctrl+C'; };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback); else fallback();
});
</script>
`;
fs.writeFileSync(path.join(root, 'dist', 'setup.html'), html);
console.log('dist/gas/ (' + files.length + ' files → コード.gs ' + Math.round(code.length / 1024) + 'KB), dist/setup.html');
