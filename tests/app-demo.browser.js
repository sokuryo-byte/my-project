// デモ版アプリ（dist/demo.html）を Chromium で操作して一連の流れを検証する: node tests/app-demo.browser.js
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const SHOT = process.env.SHOT_DIR;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // フォントはテストで遮断しているため、その読み込み失敗は除外
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'demo.html'));

  // 一覧と、確認待ちの物件が手順4で開く
  await page.waitForSelector('.q-item');
  assert.equal(await page.locator('.q-item').count(), 3);
  await page.waitForSelector('.tabs');
  assert.match(await page.locator('.step.current').innerText(), /確認/);
  if (SHOT) await page.screenshot({ path: SHOT + '/review.png' });

  // 取り込み直後の物件 → 位置
  await page.locator('.q-item', { hasText: 'グランシエル高岳' }).click();
  await page.waitForSelector('#map img');
  assert.match(await page.locator('.step.current').innerText(), /位置/);
  assert.match(await page.locator('.note.warn').first().innerText(), /精度/);
  const before = await page.locator('.kv td').first().innerText();
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.40);
  const after = await page.locator('.kv td').first().innerText();
  assert.notEqual(before, after, 'クリックでピンが動く');
  if (SHOT) await page.screenshot({ path: SHOT + '/map.png' });
  await page.getByRole('button', { name: 'この位置で確定 →' }).click();
  await page.waitForSelector('text=調査する内容');

  // 調査
  await page.getByRole('button', { name: '調査を開始する' }).click();
  await page.waitForSelector('.progress');
  await page.waitForSelector('.tabs', { timeout: 10000 });
  const pendingBefore = await page.locator('.actionbar .msg').innerText();
  assert.match(pendingBefore, /確認が\d+件/);

  // 要確認をすべて「確認した」にする（施設→駅→バス）
  for (const tab of ['周辺施設', '最寄り駅', 'バス・空港']) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click();
    for (let i = 0; i < 40; i++) {
      const btn = page.getByRole('button', { name: '確認した', exact: true }).first();
      if (!(await btn.count())) break;
      await btn.click();
      await page.waitForTimeout(250);
    }
  }
  await page.getByRole('tab', { name: /最寄り駅/ }).click();
  const lineInputs = page.locator('input[data-line]');
  for (let i = 0; i < await lineInputs.count(); i++) {
    if (!(await lineInputs.nth(i).inputValue())) { await lineInputs.nth(i).fill('名古屋市東山線'); await lineInputs.nth(i).press('Tab'); await page.waitForTimeout(300); }
  }
  await page.getByRole('tab', { name: /バス・空港/ }).click();
  const op = page.locator('input[data-operator]').first();
  await op.fill('名古屋市営バス'); await op.press('Tab'); await page.waitForTimeout(400);
  assert.match(await page.locator('.actionbar .msg').innerText(), /すべて確認しました/);

  // 掲載の切り替え（周辺施設）
  await page.getByRole('tab', { name: /周辺施設/ }).click();
  const sw = page.locator('[data-publish]').first();
  const was = await sw.getAttribute('aria-checked');
  await sw.click(); await page.waitForTimeout(300);
  assert.notEqual(await page.locator('[data-publish]').first().getAttribute('aria-checked'), was);

  // 出力
  await page.getByRole('button', { name: 'ウェルモ入力へ →' }).click();
  await page.waitForSelector('text=入力される内容');
  const title = await page.locator('.out tr').first().locator('td.val').innerText();
  assert.match(title, /^【東区\/.*】グランシエル高岳/);
  assert.match(await page.locator('.out tr', { hasText: 'その他アクセス' }).innerText(), /名古屋市営バス「.*」停から徒歩約3分/);
  assert.match(await page.locator('.howto').first().innerText(), /周辺調査から入力/);
  if (SHOT) await page.screenshot({ path: SHOT + '/output.png', fullPage: false });
  assert.match(await page.locator('.q-item[aria-current="true"] .tag').innerText(), /準備ができました/);

  // マイソクPDFのドロップ（2件まとめて）
  await page.evaluate(() => {
    const dt = new DataTransfer();
    ['ハイツ若宮A.pdf', 'ハイツ若宮B.pdf'].forEach((n) => dt.items.add(new File(['%PDF-1.4 demo'], n, { type: 'application/pdf' })));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  });
  await page.waitForSelector('text=2件のマイソクを取り込みました', { timeout: 10000 });
  await page.waitForSelector('#f-建物名');
  assert.equal(await page.locator('#f-建物名').inputValue(), 'ハイツ若宮(ハイツ若宮A)');
  assert.equal(await page.locator('.q-item', { hasText: 'ハイツ若宮(ハイツ若宮B)' }).count(), 1);
  assert.equal(await page.locator('#drop').isHidden(), true);
  assert.equal(await page.locator('[data-toggle="TVドアホン"]').getAttribute('aria-pressed'), 'true');
  // 入力中にフォーカスが外れない
  await page.locator('#f-ふりがな').click();
  await page.keyboard.type('はいつわかみや');
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'f-ふりがな');
  assert.match(await page.locator('#save-state').innerText(), /保存しました/);
  if (SHOT) await page.screenshot({ path: SHOT + '/info.png' });

  // スマホ幅でも横スクロールしない
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, '横スクロール ' + overflow + 'px');
  if (SHOT) await page.screenshot({ path: SHOT + '/phone.png' });

  assert.deepEqual(errors, [], errors.join('\n'));
  await browser.close();
  console.log('app demo browser test: OK');
})().catch((e) => { console.error(e); process.exit(1); });
