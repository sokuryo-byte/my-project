// ウェルモ自動入力ツールを作る
//   dist/wellmo-autofill.user.js … Tampermonkey用（推奨。一覧から選ぶだけで入力）
//   dist/wellmo-bookmarklet.html … ブックマークレット登録ページ（予備。JSONを貼り付けて入力）
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const core = read('wellmo-core.js');
const version = (core.match(/VERSION = '([\d.]+)'/) || [])[1] || '0.0.0';
const dist = path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });

// Tampermonkey用
const header = `// ==UserScript==
// @name         ウェルモ自動入力（マンスリー周辺調査）
// @namespace    monthly-nearby-survey
// @version      ${version}
// @description  周辺調査アプリの結果を、ウェルモ「建物管理｜編集」画面に一括入力する（保存は担当者が押す）
// @match        https://wm-system.com/build/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;
const userscript = header + '\n' + core + '\n' + read('wellmo-userscript.js');
fs.writeFileSync(path.join(dist, 'wellmo-autofill.user.js'), userscript);

// ブックマークレット（予備）
const body = (core + '\n' + read('wellmo-bookmarklet-runner.js')).replace(/^\/\*[\s\S]*?\*\/\s*/, '');
const bookmarklet = 'javascript:' + encodeURIComponent(body);
fs.writeFileSync(path.join(dist, 'wellmo-bookmarklet.txt'), bookmarklet + '\n');
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ウェルモ自動入力 予備ツール</title>
<style>body{font-family:sans-serif;max-width:640px;margin:32px auto;padding:0 16px;line-height:1.7;color:#1d2a33}
a.bm{display:inline-block;padding:10px 18px;background:#1c3a52;color:#fff;border-radius:2px;text-decoration:none;font-weight:bold}
ol li{margin:6px 0}</style></head><body>
<h1>ウェルモ自動入力（予備のブックマークレット）</h1>
<p>通常は Tampermonkey 用スクリプト（wellmo-autofill.user.js）を使ってください。Tampermonkey を使えないパソコン向けの予備です。</p>
<p><a class="bm" href="${bookmarklet.replace(/"/g, '&quot;')}">ウェルモ自動入力</a>（ブックマークバーにドラッグ）</p>
<ol>
<li>周辺調査アプリの「出力」で「データをコピー（予備）」を押す</li>
<li>ウェルモの「建物管理｜編集」画面でこのブックマークを押し、貼り付けてOK</li>
<li>右上の結果を確認し、内容を確認してから「保存」</li>
</ol>
</body></html>
`;
fs.writeFileSync(path.join(dist, 'wellmo-bookmarklet.html'), html);
console.log('dist/wellmo-autofill.user.js (v' + version + '), dist/wellmo-bookmarklet.html');

// Tampermonkey への追加を手伝うページ（スクリプトを同梱。1クリック追加とコピーの両方に対応）
const escHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const install = `<title>ウェルモ自動入力の追加</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 1列の手順書。手順番号は実際の作業順 */
:root { --bg: #eef1f3; --surface: #ffffff; --ink: #1b2730; --muted: #5a6872; --line: #d4dbe0; --nav: #1c3a52; --accent: #1f5f8f; --accent-ink: #ffffff; --ok: #1d6b40; --ok-soft: #e4f1e9; --warn-soft: #fff4dc; --warn-line: #e1b955;
  --font: "BIZ UDPGothic", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #10171c; --surface: #172128; --ink: #e3eaee; --muted: #9aabb5; --line: #2b3a44; --nav: #0c1a24; --accent: #6fb0de; --accent-ink: #0a1822; --ok: #62c58c; --ok-soft: #15301f; --warn-soft: #352a10; --warn-line: #7a6024; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #10171c; --surface: #172128; --ink: #e3eaee; --muted: #9aabb5; --line: #2b3a44; --nav: #0c1a24; --accent: #6fb0de; --accent-ink: #0a1822; --ok: #62c58c; --ok-soft: #15301f; --warn-soft: #352a10; --warn-line: #7a6024; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.7 var(--font); }
header { background: var(--nav); color: #fff; padding-block: 14px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header h1 { margin: 0; font-size: 18px; }
main { max-width: 760px; margin: 0 auto; padding-block: 20px 40px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 14px; }
section { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; }
section h2 { margin: 0; padding: 10px 16px; font-size: 15px; border-bottom: 1px solid var(--line); display: flex; gap: 10px; align-items: center; }
section h2 .no { font-family: ui-monospace, monospace; font-weight: 700; width: 24px; height: 24px; display: grid; place-items: center; background: var(--nav); color: #fff; border-radius: 2px; font-size: 13px; }
.body { padding: 12px 16px 16px; display: grid; gap: 10px; }
.body p, .body ol { margin: 0; }
.body ol { padding-left: 1.3em; display: grid; gap: 4px; }
code { font-family: ui-monospace, monospace; background: var(--bg); border: 1px solid var(--line); padding: 0 5px; border-radius: 2px; overflow-wrap: anywhere; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 3px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; width: fit-content; }
.btn.sub { background: var(--surface); color: var(--accent); }
.or { color: var(--muted); font-size: 13px; }
.tip { background: var(--warn-soft); border-left: 4px solid var(--warn-line); padding: 8px 12px; font-size: 14px; }
.done { background: var(--ok-soft); border-left: 4px solid var(--ok); padding: 8px 12px; font-size: 14px; }
#copied { color: var(--ok); font-weight: 700; }
textarea { width: 100%; height: 120px; font: 12px/1.4 ui-monospace, monospace; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
:focus-visible { outline: 2px solid #e09a00; outline-offset: 2px; }
</style>
<header><h1>ウェルモ自動入力を Tampermonkey に追加する</h1></header>
<main>
<section><h2><span class="no">1</span>Tampermonkey の「ユーザースクリプトを許可する」をオンにする</h2><div class="body">
<ol><li>Chrome のアドレスバーに <code>chrome://extensions</code> と入力して開く</li>
<li>Tampermonkey の「<b>詳細</b>」を押す</li>
<li>「<b>ユーザースクリプトを許可する</b>」をオンにする（項目がない場合は、右上の「デベロッパー モード」をオン）</li></ol>
<p class="tip">これをオンにしないと、追加してもウェルモにボタンが出ません。</p></div></section>

<section><h2><span class="no">2</span>スクリプトを追加する</h2><div class="body">
<p><b>方法A（かんたん）</b>：下のボタンを押すと Tampermonkey の画面が開くので、「<b>インストール</b>」を押します。</p>
<a class="btn" href="wellmo-autofill.user.js" target="_blank" rel="noopener">スクリプトを追加（Tampermonkeyが開きます）</a>
<p class="or">Tampermonkey の画面が開かず、文字だらけのページが出た場合は、方法Bを使ってください。</p>
<p><b>方法B（コピーして貼り付け）</b></p>
<ol><li>下の「スクリプトをコピー」を押す</li>
<li>Chrome右上のパズルのアイコン →「Tampermonkey」→「<b>新規スクリプトを作成</b>」</li>
<li>最初から書かれている文字を <b>Ctrl+A → Delete</b> で消し、<b>Ctrl+V</b> で貼り付けて <b>Ctrl+S</b> で保存</li></ol>
<button class="btn sub" type="button" id="copy">スクリプトをコピー</button> <span id="copied" role="status"></span>
<label for="src" class="or">コピーできない場合は、この中をクリックして Ctrl+A → Ctrl+C</label>
<textarea id="src" readonly>${escHtml(userscript)}</textarea>
</div></section>

<section><h2><span class="no">3</span>追加できたか確かめる</h2><div class="body">
<p>ウェルモの「建物管理｜編集」画面を開き直し、右下に「<b>周辺調査から入力</b>」ボタンが出ていれば完了です。</p>
<p class="done">ボタンを押したときに出る「設定」には、周辺調査アプリ（本番）のURLを入れます。本番のアプリを用意した後で設定してください。</p>
</div></section>
<p class="or">ウェルモ自動入力 v${version}</p>
</main>
<script>
document.getElementById('copy').addEventListener('click', function () {
  var ta = document.getElementById('src');
  var ok = function () { document.getElementById('copied').textContent = '✓ コピーしました。Tampermonkey に貼り付けてください'; };
  var fallback = function () { ta.focus(); ta.select(); try { if (document.execCommand('copy')) { ok(); return; } } catch (e) {} document.getElementById('copied').textContent = '下の枠の中を Ctrl+A → Ctrl+C でコピーしてください'; };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, fallback); else fallback();
});
</script>
`;
fs.writeFileSync(path.join(dist, 'install.html'), install);
console.log('dist/install.html');
