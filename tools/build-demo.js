// src/App.html にデモ用バックエンドを差し込み、ブラウザだけで試せる dist/demo.html を作る
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.html'), 'utf8');
// 本番と同じ出力生成コードを使う（GASのサービスに触れる関数は呼ばない）
const shared = ['00_Config.js', '01_Util.js', '02_DistanceRule.js', '07_Stations.js', '09_Output.js', '12_Title.js', '13_Mysoku.js', '14_Wellmo.js']
  .map((f) => '/* ---- src/' + f + ' ---- */\n' + fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const backend = fs.readFileSync(path.join(__dirname, 'demo-backend.js'), 'utf8');
const marker = '<script>\n(function () {';
if (!app.includes(marker)) throw new Error('App.html のスクリプト開始位置が見つかりません');
const inject = '<script>\n' + shared.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<script>\n' + backend + '\n</script>\n';
const out = app.replace(marker, () => inject + marker); // 関数で置換（コード中の $' などを置換パターンと解釈させない）
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'demo.html'), out);
console.log('dist/demo.html (' + Math.round(out.length / 1024) + ' KB)');
