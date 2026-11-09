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
  // ＋／−を押してもピン（緯度経度）は動かない
  await page.getByRole('button', { name: '拡大' }).click();
  await page.waitForFunction(() => !document.querySelector('.map-loading'));
  assert.equal(await page.locator('.kv td').first().innerText(), after, '拡大でピンが飛ばない');
  await page.getByRole('button', { name: '縮小' }).click();
  await page.waitForFunction(() => !document.querySelector('.map-loading'));
  assert.equal(await page.locator('.kv td').first().innerText(), after, '縮小でピンが飛ばない');
  if (SHOT) await page.screenshot({ path: SHOT + '/map.png' });
  // ピンをドラッグして動かせる
  const pinBox = await page.locator('#map-pin').boundingBox();
  const beforeDrag = await page.locator('.kv td').first().innerText();
  await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(pinBox.x + pinBox.width / 2 - 60, pinBox.y + pinBox.height * 0.3 + 40, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await page.locator('.kv td').first().innerText();
  assert.notEqual(afterDrag, beforeDrag, 'ピンのドラッグで緯度が変わる');
  // 地図をドラッグすると周りを読み込む（ピンの座標は変わらない）
  const mapBox = await page.locator('#map').boundingBox();
  const srcBefore = await page.locator('#map-img').getAttribute('src');
  await page.mouse.move(mapBox.x + 80, mapBox.y + mapBox.height - 60);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + 280, mapBox.y + mapBox.height - 160, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((s) => document.getElementById('map-img') && document.getElementById('map-img').getAttribute('src') !== s, srcBefore, { timeout: 5000 });
  assert.equal(await page.locator('.kv td').first().innerText(), afterDrag, '地図の移動ではピンの座標は変わらない');
  await page.getByRole('button', { name: 'この位置で確定 →' }).click();
  await page.waitForSelector('text=調査する内容');

  // 調査
  await page.getByRole('button', { name: '調査を開始する' }).click();
  // 進み具合（n / 全体 と ％）が表示され、進んでいく
  await page.waitForSelector('#survey-progress');
  await page.waitForFunction(() => /^(?:[3-9]|1\d) \/ \d+/.test(document.querySelector('#survey-progress .ptext')?.textContent || ''), null, { timeout: 10000 });
  assert.match(await page.locator('#survey-progress .ptext').innerText(), /\d+ \/ 13　.+を調べています/);
  if (SHOT) await page.screenshot({ path: SHOT + '/progress.png' });
  await page.waitForSelector('.tabs', { timeout: 15000 });
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
  assert.match(await page.locator('.howto').first().innerText(), /新規作成画面/);
  const href = await page.locator('a', { hasText: 'ウェルモ新規作成' }).first().getAttribute('href');
  assert.match(href, /^https:\/\/wm-system\.com\/build\/create#wmfill=P\d+$/, 'ウェルモの新規作成画面へ物件IDつきで開く');
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

  // 削除（1回目は確認に切り替わり、もう一度押すと削除）
  const countBefore = await page.locator('.q-item').count();
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await page.waitForSelector('text=本当に削除する');
  await page.getByRole('button', { name: 'やめる' }).click();
  assert.equal(await page.locator('.q-item').count(), countBefore, '「やめる」なら消えない');
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await page.getByRole('button', { name: '本当に削除する' }).click();
  await page.waitForSelector('text=削除しました');
  assert.equal(await page.locator('.q-item').count(), countBefore - 1);
  // 一度開いた物件は、2回目はすぐ表示される（先読み・キャッシュ）
  await page.locator('.q-item', { hasText: '名信ビル' }).click();
  await page.waitForSelector('.tabs');
  // 「確認した」を素早く3回続けて押しても、表示が戻ったりせず3件とも確認済みになる
  const doneBefore = await page.locator('.r-flag.done').count();
  for (let k = 0; k < 3; k++) { await page.getByRole('button', { name: '確認した', exact: true }).first().click({ delay: 0 }); }
  const seen = [];
  for (let k = 0; k < 15; k++) { seen.push(await page.locator('.r-flag.done').count()); await page.waitForTimeout(100); }
  assert.ok(seen.every((c) => c === doneBefore + 3), '途中で表示が戻らない（確認済みの件数）: ' + doneBefore + ' → ' + seen.join(','));
  await page.locator('.q-item', { hasText: 'サンコーレジデンス' }).click();
  await page.waitForSelector('text=入力される内容');
  const t0 = Date.now();
  await page.locator('.q-item', { hasText: '名信ビル' }).click();
  await page.waitForSelector('.tabs');
  assert.ok(Date.now() - t0 < 120, '2回目はキャッシュですぐ表示（' + (Date.now() - t0) + 'ms）');

  // スマホ幅でも横スクロールしない
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, '横スクロール ' + overflow + 'px');
  if (SHOT) await page.screenshot({ path: SHOT + '/phone.png' });

  assert.deepEqual(errors, [], errors.join('\n'));

  // ---- 地図表示用キーがある場合はGoogleマップ（ここではGoogleの部品を模擬）：ピンのドラッグで座標が変わる ----
  const page2 = await ctx.newPage();
  await page2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page2.addInitScript(() => {
    window.DEMO_MAPS_KEY = 'TEST';
    const ls = (o) => { o.l = {}; o.addListener = (n, f) => { o.l[n] = f; }; return o; };
    window.google = { maps: {
      Map: function (el, opt) { el.innerHTML = '<div id="fake-gmap">Google Map</div>'; ls(this); this.getCenter = () => ({ toJSON: () => opt.center }); this.getZoom = () => opt.zoom; this.panTo = () => {}; window.__gm = this; },
      Marker: function (opt) { ls(this); this.pos = opt.position; this.setPosition = (p) => { this.pos = p; }; window.__mk = this; }
    } };
  });
  await page2.goto('file://' + path.join(__dirname, '..', 'dist', 'demo.html'));
  await page2.waitForSelector('.q-item');
  await page2.locator('.q-item', { hasText: 'グランシエル高岳' }).click();
  await page2.waitForSelector('#fake-gmap');
  const lat0 = await page2.locator('#coord-lat').innerText();
  await page2.evaluate(() => window.__mk.l.dragend({ latLng: { lat: () => 35.181234, lng: () => 136.912345 } }));
  assert.equal(await page2.locator('#coord-lat').innerText(), '35.181234', 'Googleマップでピンをドラッグすると座標が変わる');
  assert.notEqual(lat0, '35.181234');
  assert.equal(await page2.getByRole('button', { name: 'この位置で確定 →' }).isEnabled(), true);
  await browser.close();
  console.log('app demo browser test: OK');
})().catch((e) => { console.error(e); process.exit(1); });
