/**
 * 画面の自動確認（テスト専用）。先に `python3 build.py` を実行してください。
 *   node e2e.js
 * 謄本読取 → 複数物件 → 見積 → 必須チェック → 送信 → シート保存 → Chat通知 → 管理画面 の順に確認します。
 * Playwright が必要です（グローバルに入っている場合は NODE_PATH=$(npm root -g) node e2e.js）。
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'out');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.text().includes('SERVER ERROR')) errors.push(m.text()); });
  };

  // ---------------- 依頼画面 ----------------
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  watch(p);
  await p.goto('file://' + path.join(OUT, 'index.html'));
  await p.waitForSelector('.lot');
  await p.fill('#requesterName', '田中 一郎');

  // 謄本を入れる → 2筆が読み取られ、物件が2件になる
  await p.setInputFiles('#tohonFile', { name: '謄本.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF dummy') });
  await p.waitForFunction(() => document.querySelectorAll('.lot').length === 2 &&
    document.querySelector('#tohonStatus li .st').textContent.includes('読み取りました'), null, { timeout: 5000 });
  const lots = await p.$$eval('.lot', (ls) => ls.map((l) => ({
    city: l.querySelector('[data-f=municipality]').value, address: l.querySelector('[data-f=address]').value,
    chimoku: l.querySelector('[data-f=chimoku]').value, area: l.querySelector('[data-f=area]').value,
    yellow: l.querySelectorAll('.from-tohon').length,
  })));
  assert.deepStrictEqual(lots, [
    { city: '豊田市', address: '○○町字△△ 123番1', chimoku: '畑', area: '496', yellow: 4 },
    { city: '豊田市', address: '○○町字△△ 123番2', chimoku: '田', area: '1024', yellow: 4 },
  ]);

  // 区域などを選ぶ（物件1：調整区域・耕作中、物件2：分からない・農振はい）
  const cards = await p.$$('.lot');
  await (await cards[0].$('input[value="市街化調整区域"]')).check({ force: true });
  await (await cards[0].$('[data-f=landUse]')).selectOption('耕作中');
  await (await cards[1].$('input[value="分からない"]')).check({ force: true });
  await (await cards[1].$$('input[value="はい"]'))[0].check();

  // 引き継いで追加 → 区域・所在が引き継がれる → 削除
  await p.click('#copyLotBtn');
  const third = (await p.$$('.lot'))[2];
  assert.strictEqual(await third.$eval('input[value="分からない"]', (e) => e.checked), true);
  // 市区町村と町名・字は引き継ぎ、地番は引き継がない
  assert.strictEqual(await third.$eval('[data-f=municipality]', (e) => e.value), '豊田市');
  assert.strictEqual(await third.$eval('[data-f=address]', (e) => e.value), '○○町字△△');
  await (await third.$('.lot-del')).click();

  // 見積：調整区域(許可) + 分からない(届出で仮計算) + 農振除外
  await p.waitForTimeout(800);
  assert.strictEqual(await p.textContent('#estimateTotal'), '¥679,300'); // 報酬(235,000+58,000+300,000)+消費税10% 59,300 + 調査実費 25,000+2,000

  // 地目変更登記：チェックした物件があれば 48,000（税抜）を1回 → +52,800
  await p.check('.lot [data-f=chimokuHenko]');
  await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#estimateTotal'), '¥732,100');
  await p.uncheck('.lot [data-f=chimokuHenko]');
  await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#estimateTotal'), '¥679,300');

  // 現況が農地なのに転用計画が空 → 送信できない
  await p.click('#requestBtn');
  assert.ok((await p.textContent('#formErrors')).includes('今後の転用計画'));

  await p.fill('#plan', '自己用住宅の建築');
  await p.click('#requestBtn');
  await p.waitForSelector('#resultBox:not(.hidden)', { timeout: 5000 });
  assert.ok((await p.textContent('#resultText')).includes('物件 2 件'));

  const saved = await p.evaluate(() => ({
    lotRows: SHEETS['物件明細'].rows.length - 1,
    caseLots: SHEETS['案件一覧'].rows[1][4],
    lot1: SHEETS['物件明細'].rows[1].slice(0, 4),
    chat: CHAT_LOG[0],
  }));
  assert.strictEqual(saved.lotRows, 2);
  assert.strictEqual(saved.caseLots, '123番1、123番2');
  // シートには 所在＝市区町村＋町名・字、地番＝末尾の地番 に分けて保存
  assert.deepStrictEqual(saved.lot1.slice(2), ['豊田市○○町字△△', '123番1']);
  assert.ok(saved.chat.includes('物件：2件') && saved.chat.includes('管理画面で案件を開く'));
  await p.screenshot({ path: path.join(OUT, 'index.png'), fullPage: true });

  // ---------------- 謄本をまとめて入れる（同時処理の上限より多い4通） ----------------
  const bulk = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  watch(bulk);
  await bulk.goto('file://' + path.join(OUT, 'index.html'));
  await bulk.waitForSelector('.lot');
  await bulk.evaluate(() => {
    window.OCR_BY_NAME = {};
    [10, 11, 12, 13].forEach((n) => { window.OCR_BY_NAME['t' + n + '.pdf'] = '表題部\n所在 岡崎市××町\n' + n + '番 畑 ' + (n * 10) + ' 余白'; });
  });
  await bulk.setInputFiles('#tohonFile', [10, 11, 12, 13].map((n) => ({ name: 't' + n + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })));
  assert.ok((await bulk.textContent('#tohonStatus')).includes('待機中'), '4通目は待機中になるはず');
  await bulk.waitForFunction(() => document.querySelectorAll('.lot').length === 4 &&
    !document.querySelector('#tohonStatus').textContent.match(/待機中|アップロード中|読み取り中/), null, { timeout: 8000 });
  const bulkLots = await bulk.$$eval('.lot [data-f=address]', (e) => e.map((x) => x.value).sort());
  assert.deepStrictEqual(bulkLots, ['××町 10番', '××町 11番', '××町 12番', '××町 13番']);

  // ---------------- 謄本：登記情報提供サービス形式（罫線の表・全角数字・所在と地積の更正） ----------------
  const tableText = '┏━━━┓ ┃ 表 題 部 （土地の表示） │調製│ ┃ ┠──┨ ┃所 在│○○郡○○町大字△△字□□ │ ┃ ┃ ├───┼───┨ ┃ │○○市□□ │平成２４年１月４日市制施行 ┃ ┠──┨ ' +
    '┃ ① 地 番 │ ②地 目 │ ③ 地 積 ㎡ │ 原因及びその日付 ┃ ┠──┨ ┃１００番 │宅地 │ ４１３：２２│ ┃ ┠──┨ ┃ │ │ ： │昭和６３年法務省令第３７号附則第２条第２項┃ ' +
    '┠──┨ ┃ │ │ ４８８：７０│③錯誤 ┃ ┗━━┛ ┏━━┓ ┃ 権 利 部 （ 甲 区 ） ┃';
  const parsed = await bulk.evaluate((t) => parseTohonText_(t), tableText);
  assert.deepStrictEqual(parsed, [{ address: '○○市□□', lotNumber: '100番', chimoku: '宅地', chimokuRaw: '宅地', area: '488.70' }]);

  // ---------------- 謄本：紙の全部事項証明書のスキャン（ページ上部の所在地番を優先。地番変更・崩れた所在行） ----------------
  const scanText = ['愛知県○○市△△町5丁目10', '表題部 (土地の表示)', '所 在「○○市△△町五丁目', '①地番', '②地目', '26番', '田', '52', '10番', '①変更', '権利部 (甲区)', '所有者 ○○市□□町四丁目173番地'].join(String.fromCharCode(10));
  const scanned = await bulk.evaluate((t) => parseTohonText_(t), scanText);
  assert.deepStrictEqual(scanned.map((l) => [l.address, l.lotNumber, l.chimoku]), [['○○市△△町5丁目', '10番', '田']]);

  // ---------------- 管理画面 ----------------
  const a = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  watch(a);
  await a.goto('file://' + path.join(OUT, 'admin.html'));
  await a.waitForSelector('#rows .case-card');
  await a.click('#rows .case-card');
  await a.waitForSelector('#detail .lot-card');
  assert.strictEqual((await a.$$('#detail .lot-card')).length, 2);
  await a.selectOption('#aStatus', '調査中');
  await a.click('#detail .primary');
  await a.waitForFunction(() => document.querySelector('#rows .pill').textContent === '調査中', null, { timeout: 5000 });
  await a.screenshot({ path: path.join(OUT, 'admin.png'), fullPage: true });

  await browser.close();
  assert.deepStrictEqual(errors, [], 'ページでエラーが発生しました');
  console.log('OK: すべての確認に合格しました（スクリーンショット：test/out/*.png）');
})().catch((e) => { console.error('NG:', e.message); process.exit(1); });
