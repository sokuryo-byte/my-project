// 初回のみ実行: ブラウザを画面付きで開き、手動でGoogleログインしてもらう。
// ログイン状態は .auth/profile に保存され、watch.js から再利用される。
import { APP_URL, launch, log, isLoggedIn } from './common.js';

const context = await launch({ headless: false });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(APP_URL);

log('ブラウザで「Googleでログイン」を押し、@touki.bz のアカウントでログインしてください。');
log('トップ画面（今月の動画視聴数）が表示されると自動で終了します。（最大10分待機）');

const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  if (await isLoggedIn(page)) {
    const name = await page.locator('.app-header h1').innerText().catch(() => '');
    log(`ログインを確認しました: ${name}`);
    await context.close();
    process.exit(0);
  }
  await page.waitForTimeout(2000);
}
log('タイムアウトしました。もう一度 npm run login を実行してください。');
await context.close();
process.exit(1);
