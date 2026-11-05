// tools/wellmo-filler.js からブックマークレットと登録用ページ（dist/）を作る
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'wellmo-filler.js'), 'utf8');
// 先頭のブロックコメントだけ除去（文字列内を壊さないよう、行コメントは残す）
const body = src.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
const bookmarklet = 'javascript:' + encodeURIComponent(body);

const dist = path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'wellmo-bookmarklet.txt'), bookmarklet + '\n');
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ウェルモ自動入力 登録</title>
<style>body{font-family:sans-serif;max-width:640px;margin:32px auto;padding:0 16px;line-height:1.7;color:#222}
a.bm{display:inline-block;padding:10px 18px;background:#f08300;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold}
ol li{margin:6px 0}</style></head><body>
<h1>ウェルモ自動入力 ブックマークレット</h1>
<p>下のボタンをブラウザのブックマークバーにドラッグして登録してください。</p>
<p><a class="bm" href="${bookmarklet.replace(/"/g, '&quot;')}">ウェルモ自動入力</a></p>
<ol>
<li>スプレッドシート「出力」シートの「ウェルモJSON」セルをコピー</li>
<li>ウェルモの「建物管理｜編集」画面を開き、ブックマーク「ウェルモ自動入力」を押す</li>
<li>貼り付けてOK → 右上の結果を確認 → 内容を確認してから担当者が「保存」</li>
</ol>
<p>うまく入らない項目がある場合は、貼り付ける代わりに「診断」と入力して実行し、コピーされた内容を開発担当に送ってください（入力値は含みません）。</p>
</body></html>
`;
fs.writeFileSync(path.join(dist, 'wellmo-bookmarklet.html'), html);
console.log('dist/wellmo-bookmarklet.html (' + bookmarklet.length + ' chars)');
