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
