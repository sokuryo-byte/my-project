// ブラウザ（Chromium）で自動入力ツールを模擬ページに実行して検証する: node tests/wellmo-filler.browser.js
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const tool = (f) => fs.readFileSync(path.join(__dirname, '..', 'tools', f), 'utf8');
// ブックマークレット（予備）＝共通部分＋貼り付け実行
const SRC = tool('wellmo-core.js') + '\n' + tool('wellmo-bookmarklet-runner.js');
const USERSCRIPT = path.join(__dirname, '..', 'dist', 'wellmo-autofill.user.js');
const PAGE = fs.readFileSync(path.join(__dirname, 'fixtures', 'wellmo_mock.html'), 'utf8');
const DATA = {
  'マンスリー表示名': '【千種区/吹上駅徒歩7分/バストイレ別・独立洗面台】名信ビル',
  '建物名': '名信ビル',
  '物件種別': 'マンション',
  '所在地': { '郵便番号': '464-0850', '住所': '愛知県名古屋市千種区今池3丁目39-21' },
  '緯度': 35.1660, '経度': 136.9365,
  '周辺環境': 'セブンイレブン 今池店まで徒歩約2分\nスギ薬局 今池店まで徒歩約5分',
  '最寄り駅': [
    { '路線': '桜通線', '駅': '吹上', '徒歩': 7, 'その他': '' },
    { '路線': '東山線', '駅': '今池', '徒歩': 9, 'その他': '' },
    { '路線': '東山線', '駅': '千種', '徒歩': '', 'その他': 'バスで31分' }
  ],
  'その他アクセス': '名古屋市営バス「今池」停から徒歩約3分',
  '空港からのアクセス': '県営名古屋空港から車で約24分（有料道路あり）',
  '建物設備': ['オートロック', '駐輪場', 'ゴミ捨て場', 'TVドアホン'],
  '建物構造': 'RC',
  '建物階数': { '地上': 4, '地下': 0 },
  '築年月': { '年': 1969, '月': 5 },
  '総戸数': 9
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(PAGE);
  // スプレッドシートのセルコピー相当（引用符付き）でも読めること
  const pasted = '"' + JSON.stringify(DATA).replace(/"/g, '""') + '"';
  await page.evaluate((p) => { window.prompt = () => p; }, pasted);
  await page.evaluate(SRC);
  const v = (name) => page.$eval(`[name="${name}"]`, (e) => e.value);
  const c = (name) => page.$eval(`[name="${name}"]`, (e) => e.checked);
  assert.equal(await v('monthly_name'), DATA['マンスリー表示名']);
  assert.equal(await v('kana'), ''); // データにないので触らない
  assert.equal(await v('build_name'), '名信ビル');
  assert.equal(await c('show_name'), true);
  assert.equal(await page.$eval('input[name=kind][value="1"]', (e) => e.checked), true);
  assert.equal(await v('address2'), '703'); // 所在地は触らない
  assert.equal(await v('lat'), '35.166');
  assert.equal(await v('lng'), '136.9365');
  assert.equal(await v('around'), DATA['周辺環境']);
  assert.equal(await v('station[0]'), '201');
  assert.equal(await v('walk[0]'), '7');
  assert.equal(await v('station[1]'), '202');
  assert.equal(await v('station[2]'), '203'); // 東山線の千種（JR千種と区別）
  assert.equal(await v('walk[2]'), ''); // 30分以上は徒歩を空欄
  assert.equal(await v('other[2]'), 'バスで31分');
  assert.equal(await v('other_access'), DATA['その他アクセス']);
  assert.equal(await v('airport'), DATA['空港からのアクセス']);
  assert.equal(await c('eq_al'), true);
  assert.equal(await c('eq_bike'), true); // 既にONのものはOFFにしない
  assert.equal(await c('eq_gomi'), true);
  assert.equal(await c('eq_ev'), false); // データにない設備は触らない
  assert.equal(await v('structure'), '4');
  assert.equal(await v('floor_up'), '4');
  assert.equal(await v('floor_down'), '0');
  assert.equal(await v('built_y'), '1969');
  assert.equal(await v('built_m'), '5');
  assert.equal(await v('units'), '9');
  assert.equal(await v('area'), '');
  assert.equal(await page.evaluate(() => window.__saved), undefined); // 保存は押さない
  const panel = await page.$eval('#wm-autofill-panel', (e) => e.innerText);
  assert.match(panel, /TVドアホン.*ボタンが見つからない/);
  assert.match(panel, /所在地は「住所検索」で選択：464-0850/);
  assert.ok((await page.evaluate(() => window.__changes)) > 10);

  // 診断モード（値を含まない）
  const page2 = await browser.newPage();
  await page2.setContent(PAGE);
  await page2.evaluate(() => { window.prompt = () => '診断'; });
  await page2.evaluate(SRC);
  const diag = await page2.$eval('#wm-autofill-panel textarea', (e) => e.value).catch(() => null)
    || await page2.evaluate(() => document.getElementById('wm-autofill-panel').innerText);
  assert.match(diag, /monthly_name|診断/);
  assert.doesNotMatch(diag, /旧データ/); // 入力値は出さない

  // ---- Tampermonkey版：一覧から選ぶ → 入力 → 保存で「入力済」を記録 ----
  const page3 = await browser.newPage();
  await page3.setContent(PAGE);
  await page3.exposeFunction('__fakeApp', (url) => {
    const q = new URL(url).searchParams;
    if (q.get('api') === 'wellmo-list') return JSON.stringify({ ok: true, items: [
      { id: 'P00009', name: '別の物件', address: '名古屋市中区', stage: 5, pending: 0, wellmoAt: '' },
      { id: 'P00002', name: '名信ビル', address: '愛知県名古屋市千種区今池3丁目39-21', stage: 5, pending: 0, wellmoAt: '' }] });
    if (q.get('api') === 'wellmo-data') return JSON.stringify({ ok: true, id: q.get('id'), name: '名信ビル', data: DATA, pending: 0 });
    if (q.get('api') === 'wellmo-mark') { marks.push(q.get('id')); return JSON.stringify({ ok: true }); }
    return JSON.stringify({ ok: false, error: 'unknown' });
  });
  const marks = [];
  await page3.evaluate(() => {
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_xmlhttpRequest = (o) => { window.__fakeApp(o.url).then((t) => o.onload({ responseText: t, status: 200 })); };
  });
  await page3.addScriptTag({ path: USERSCRIPT });
  await page3.click('text=周辺調査から入力');
  await page3.fill('#wm-url', 'https://script.google.com/macros/s/TEST/exec');
  await page3.click('#wm-save');
  await page3.waitForSelector('[data-id="P00002"]');
  await page3.click('[data-id="P00002"]');
  await page3.waitForSelector('#wm-autofill-panel');
  assert.equal(await page3.$eval('[name="monthly_name"]', (e) => e.value), DATA['マンスリー表示名']);
  assert.equal(await page3.$eval('[name="station[2]"]', (e) => e.value), '203');
  assert.equal(await page3.evaluate(() => window.__saved), undefined); // 自動では保存しない
  await page3.click('#wm-autofill-panel-close');
  // 既存の建物を開き直すと、その建物が一覧の先頭に出る
  await page3.click('text=周辺調査から入力');
  await page3.waitForSelector('tr.wm-match [data-id="P00002"]');
  await page3.click('#wm-survey-launcher [data-a=close]');
  await page3.click('#save');
  await page3.waitForTimeout(300);
  assert.deepEqual(marks, ['P00002']); // 保存ボタンで入力済みを記録
  if (process.env.SHOT) await page3.screenshot({ path: process.env.SHOT, fullPage: true });
  await browser.close();
  console.log('wellmo autofill browser test (bookmarklet + Tampermonkey): OK');
})().catch((e) => { console.error(e); process.exit(1); });
