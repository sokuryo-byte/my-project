import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_URL =
  process.env.APP_URL || 'https://familia-workspace-video-app-31130680210.asia-northeast1.run.app/';
// Googleログイン済みのブラウザプロファイル（Cookie等）を保存する場所。gitには含めない。
export const PROFILE_DIR = path.join(ROOT, '.auth', 'profile');
export const REPORT_DIR = path.join(ROOT, 'reports');

export async function launch({ headless }) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    // Googleログインは通常のChromeで行う方が弾かれにくい。未インストールなら同梱Chromiumを使う。
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1280, height: 900 },
    locale: 'ja-JP',
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      // 社内プロキシ等の特殊環境向けの追加引数（空白区切り）。通常は不要。
      ...(process.env.PW_EXTRA_ARGS || '').split(/\s+/).filter(Boolean),
    ],
  });
}

export function log(...args) {
  const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  console.log(`[${ts}]`, ...args);
}

// トップ画面（ログイン済み）が表示されているか
export async function isLoggedIn(page) {
  return page.locator('.monthly-card').isVisible().catch(() => false);
}
