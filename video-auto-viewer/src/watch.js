// 自動視聴テスト本体。
// 画面操作のみで「動画を選ぶ → 指定速度で再生 → 80%到達を待つ → タグ/コメント入力 → 視聴登録」を行う。
// アプリのAPIを直接呼んだり、シーク位置・計測値を操作したりはしない（ブラックボックス試験）。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { APP_URL, REPORT_DIR, launch, log, isLoggedIn } from './common.js';

const TAGS = [
  'すぐ使ってみたい',
  '新しい発見があった',
  'みんなに見て欲しい',
  '基本を確認できた',
  'ちょっと気になる',
  '今の業務では使わなさそう',
];

const { values: opts } = parseArgs({
  options: {
    count: { type: 'string', default: '1' },
    tag: { type: 'string', multiple: true, default: [] },
    comment: { type: 'string', default: '' },
    'comments-file': { type: 'string' },
    rate: { type: 'string', default: '2' },
    video: { type: 'string' },
    'max-minutes': { type: 'string', default: '40' },
    'dry-run': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(`使い方: npm run watch -- [オプション]
  --count N          視聴登録する本数（既定 1）
  --rate 倍率         再生速度（既定 2。YouTubeの選択肢 0.25〜2 の範囲）
  --tag タグ          付けるタグ。複数指定可（既定 なし）
                     選択肢: ${TAGS.join(' / ')}
  --comment 文字列    自由コメント（全動画共通）
  --comments-file パス 1行1コメントのテキストファイル。動画ごとに順番に使う
  --video 文字列      タイトルにこの文字列を含む動画だけを対象にする
  --max-minutes N    これより長い動画はスキップ（既定 40 分）
  --dry-run          80%到達まで確認し、「視聴登録する」は押さない
  --headed           ブラウザ画面を表示して実行`);
  process.exit(0);
}

const count = Number(opts.count);
const maxSeconds = Number(opts['max-minutes']) * 60;
const tags = opts.tag.filter(Boolean);
const rate = Number(opts.rate);
if (!(rate > 0 && rate <= 2)) throw new Error('--rate は 0 より大きく 2 以下で指定してください。');
const comments = opts['comments-file']
  ? fs.readFileSync(opts['comments-file'], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  : [opts.comment.trim()].filter(Boolean);
const commentFor = (i) => (comments.length ? comments[i % comments.length] : '');
for (const t of tags) {
  if (!TAGS.includes(t)) throw new Error(`不明なタグ: ${t}（選択肢: ${TAGS.join(' / ')}）`);
}
// アプリ側の仕様で、タグかコメントのどちらかが無いと登録できない
if (tags.length === 0 && comments.length === 0) {
  throw new Error('タグを付けない場合は --comment か --comments-file でコメントを指定してください。');
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(REPORT_DIR, runId);
fs.mkdirSync(runDir, { recursive: true });
const results = [];
const saveReport = () =>
  fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify({ runId, opts, results }, null, 2));

function parseDuration(text) {
  const parts = text.trim().split(':').map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

async function readProgress(page) {
  // 画面内の読み上げ用テキスト「現在位置 X 秒、実視聴 Y 秒」を読む
  const sr = await page.locator('.player-page .sr-only').innerText().catch(() => '');
  const m = sr.match(/現在位置\s*(\d+)\s*秒、実視聴\s*(\d+)\s*秒/);
  const status = await page.locator('.progress-panel__label strong').innerText().catch(() => '');
  const hint = await page.locator('.progress-panel .hint', { hasText: '実視聴' }).innerText().catch(() => '');
  return { position: m ? Number(m[1]) : 0, watched: m ? Number(m[2]) : 0, status, hint };
}

async function clickPlay(page) {
  const frame = page.frameLocator('.player-host iframe');
  const bigButton = frame.locator('.ytp-large-play-button');
  if (await bigButton.isVisible().catch(() => false)) {
    await bigButton.click().catch(() => {});
    return;
  }
  // 一時停止中なら動画領域をクリックして再開
  const paused = await frame.locator('.html5-video-player.paused-mode').count().catch(() => 0);
  if (paused) await frame.locator('video').click().catch(() => {});
}

// YouTube埋め込みプレーヤー自身のAPIで再生速度を設定する（アプリが読む getPlaybackRate() と一致させるため）
async function applyRate(page) {
  const frame = page.frames().find((f) => /youtube(-nocookie)?\.com\/embed\//.test(f.url()));
  if (!frame) return null;
  return frame
    .evaluate((r) => {
      const player = document.getElementById('movie_player');
      if (!player?.setPlaybackRate) return null;
      if (player.getPlaybackRate() !== r) player.setPlaybackRate(r);
      return player.getPlaybackRate();
    }, rate)
    .catch(() => null);
}

async function pickVideo(page, attempted) {
  await page.locator('.video-grid').waitFor({ timeout: 30_000 });
  const cards = page.locator('.video-card:not(.is-watched)');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const title = (await card.locator('h3').innerText()).trim();
    const duration = parseDuration(await card.locator('.video-card__topline span').last().innerText());
    if (attempted.has(title)) continue;
    if (opts.video && !title.includes(opts.video)) continue;
    if (duration > maxSeconds) {
      log(`スキップ（${Math.round(duration / 60)}分 > 上限）: ${title}`);
      attempted.add(title);
      continue;
    }
    return { card, title, duration };
  }
  return null;
}

async function watchOne(page, { card, title, duration }) {
  const result = { title, duration, startedAt: new Date().toISOString() };
  log(`▶ 視聴開始: ${title}（${Math.round(duration / 60)}分）`);
  await card.locator('.video-card__button').click();
  await page.locator('.player-host iframe').waitFor({ timeout: 60_000 });

  // 80%分の再生時間 + 余裕を持たせたタイムアウト
  const deadline = Date.now() + ((duration * 0.8) / rate + 600) * 1000 * 1.5;
  let lastWatched = -1;
  let stalledSince = Date.now();
  let lastLog = 0;

  while (true) {
    const err = await page.locator('.player-page .alert--error').innerText().catch(() => '');
    if (err) throw new Error(`プレーヤーエラー: ${err}`);

    const currentRate = await applyRate(page);
    const p = await readProgress(page);
    if (p.status === '視聴を記録できます') {
      log(`  80%到達: ${p.hint}`);
      result.progress = p;
      break;
    }
    if (p.watched !== lastWatched) {
      lastWatched = p.watched;
      stalledSince = Date.now();
    } else if (Date.now() - stalledSince > 10_000) {
      // 再生が進んでいなければ再生ボタンを押す（初回・広告後・自動停止時）
      await clickPlay(page);
      stalledSince = Date.now();
    }
    if (Date.now() - lastLog > 60_000) {
      log(`  ${p.status || '準備中'} ${p.hint} 速度 ${currentRate ?? '-'}x`);
      lastLog = Date.now();
    }
    if (Date.now() > deadline) throw new Error(`タイムアウト（${p.hint}）`);
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: path.join(runDir, `${results.length + 1}-ready.png`), fullPage: true });

  if (opts['dry-run']) {
    log('  --dry-run のため登録せずに一覧へ戻ります（進捗はアプリ側で保存されます）。');
    await page.getByRole('button', { name: '← 一覧へ戻る' }).click();
    await page.locator('.monthly-card').waitFor();
    return { ...result, registered: false, dryRun: true };
  }

  for (const t of tags) await page.getByRole('button', { name: t, exact: true }).click();
  const comment = commentFor(results.length);
  if (comment) await page.locator('.comment-input').fill(comment);
  await page.getByRole('button', { name: '視聴登録する' }).click();

  // 成功するとトップ画面に戻り、成功メッセージが出る
  const success = page.locator('.app-shell .alert--success');
  const failure = page.locator('.player-page .alert--error');
  await Promise.race([
    success.waitFor({ timeout: 60_000 }),
    failure.waitFor({ timeout: 60_000 }),
  ]);
  if (await failure.isVisible().catch(() => false)) {
    throw new Error(`視聴登録エラー: ${await failure.innerText()}`);
  }
  const message = await success.innerText();
  const monthly = await page.locator('.monthly-card strong').innerText().catch(() => '');
  log(`  ✓ ${message}（今月の動画視聴数: ${monthly}）`);
  await page.screenshot({ path: path.join(runDir, `${results.length + 1}-registered.png`), fullPage: true });
  return { ...result, rate, comment, registered: true, message, monthlyCount: monthly };
}

const context = await launch({ headless: !opts.headed });
const page = context.pages()[0] ?? (await context.newPage());
page.on('dialog', (d) => d.accept()); // 「視聴途中です。進捗を保存して一覧へ戻りますか？」等

let exitCode = 0;
try {
  await page.goto(APP_URL);
  await page.waitForTimeout(3000);
  if (!(await isLoggedIn(page))) {
    throw new Error('ログインしていません。先に npm run login を実行してください。');
  }
  const user = await page.locator('.app-header h1').innerText();
  const before = await page.locator('.monthly-card strong').innerText();
  log(`ログイン中: ${user} / 今月の動画視聴数: ${before} / 目標本数: ${count} / 速度: ${rate}x`);

  const attempted = new Set();
  let done = 0;
  while (done < count) {
    const target = await pickVideo(page, attempted);
    if (!target) {
      log('対象となる未視聴動画がありません。');
      break;
    }
    attempted.add(target.title);
    try {
      const r = await watchOne(page, target);
      results.push(r);
      done++;
    } catch (e) {
      log(`  ✗ 失敗: ${e.message}`);
      await page.screenshot({ path: path.join(runDir, `${results.length + 1}-error.png`), fullPage: true }).catch(() => {});
      results.push({ title: target.title, error: e.message });
      exitCode = 1;
      // 一覧へ戻って次の動画へ
      await page.goto(APP_URL);
      await page.locator('.monthly-card').waitFor({ timeout: 30_000 });
    }
    saveReport();
  }
  log(`完了: ${done}/${count} 本。レポート: ${path.relative(process.cwd(), runDir)}`);
} catch (e) {
  log(`エラー: ${e.message}`);
  exitCode = 1;
} finally {
  saveReport();
  await context.close();
}
process.exit(exitCode);
