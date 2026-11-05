// ウェルモ自動入力（ブックマークレット版・Tampermonkey版）を、実画面の構造に合わせた模擬ページで検証する
//   node tests/wellmo-filler.browser.js
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
  'ふりがな': 'めいしんびる',
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

async function checkFilled(page) {
  const v = (name, i = 0) => page.$$eval(`[name="${name}"]`, (els, i) => els.filter((e) => e.id !== 'tmpStationSelect')[i].value, i);
  const c = (sel) => page.$eval(sel, (e) => e.checked);
  assert.equal(await v('display_name'), DATA['マンスリー表示名']);
  assert.equal(await v('display_kana'), 'めいしんびる');
  assert.equal(await v('buildName'), '名信ビル');
  assert.equal(await c('input[name=build_type][value="1"]'), true, '物件種別（隠れたラジオ）');
  assert.equal(await v('buildAddress'), '〒464-0850 愛知県 名古屋市 千種区今池３丁目', '所在地（住所検索）');
  assert.equal(await v('address_detail_text'), '39-21', '所在地の残り');
  assert.equal(await v('build_address_lat'), '35.166');
  assert.equal(await v('address_memo'), DATA['周辺環境']);
  assert.equal(await v('use_stations[station_codes][]', 0), '9930121', '吹上（検索して選択）');
  assert.equal(await v('use_stations[walk_minutes][]', 0), '7');
  assert.equal(await v('use_stations[station_codes][]', 1), '9930306', '今池');
  assert.equal(await v('use_stations[station_codes][]', 2), '9930305', '東山線の千種（JRと区別）／＋で行を追加');
  assert.equal(await v('use_stations[walk_minutes][]', 2), '', '30分以上は徒歩を空欄');
  assert.equal(await v('use_stations[info][]', 2), 'バスで31分');
  assert.equal(await v('access_other'), DATA['その他アクセス']);
  assert.equal(await v('access_airport'), DATA['空港からのアクセス']);
  assert.equal(await c('input[name="facilities[]"][value="2"]'), true, 'オートロック');
  assert.equal(await c('input[name="facilities[]"][value="6"]'), true, '既にONは維持');
  assert.equal(await c('input[name="facilities[]"][value="1"]'), false, 'データにない設備は触らない');
  assert.equal(await v('structure'), '1', 'RC(鉄筋コンクリート)を選ぶ（WRC・PCではない）');
  assert.equal(await v('floor_up'), '4');
  assert.equal(await v('build_year'), '1969');
  assert.equal(await v('build_month'), '5');
  assert.equal(await v('total_units'), '9');
  assert.equal(await v('area_size'), '');
  assert.equal(await page.evaluate(() => window.__saved), undefined, '保存は押さない');
}

(async () => {
  const browser = await chromium.launch();

  // ---- ブックマークレット版（JSONを貼り付け。スプレッドシートのセルコピーの引用符付きでも読める） ----
  const page = await browser.newPage();
  await page.setContent(PAGE);
  const pasted = '"' + JSON.stringify(DATA).replace(/"/g, '""') + '"';
  await page.evaluate((p) => { window.prompt = () => p; }, pasted);
  await page.evaluate(SRC);
  await page.waitForFunction(() => /名信ビル/.test((document.getElementById('wm-autofill-panel') || {}).innerText || ''), null, { timeout: 20000 });
  await checkFilled(page);
  const panel = await page.$eval('#wm-autofill-panel', (e) => e.innerText);
  assert.match(panel, /TVドアホン.*ボタンが見つからない/);

  // ---- 診断（値を含まない） ----
  const page2 = await browser.newPage();
  await page2.setContent(PAGE);
  await page2.evaluate(() => { window.prompt = () => '診断'; });
  await page2.evaluate(SRC);
  await page2.waitForSelector('#wm-autofill-panel');
  const diag = await page2.$eval('#wm-autofill-panel textarea', (e) => e.value).catch(() => '');
  assert.match(diag, /display_name/);
  assert.match(diag, /stationWidget/);
  assert.doesNotMatch(diag, /旧データ/, '入力値は出さない');

  // ---- Tampermonkey版：一覧から選ぶ → 入力 → 保存で「入力済」を記録 ----
  const page3 = await browser.newPage();
  await page3.setContent(PAGE);
  const marks = [];
  await page3.exposeFunction('__fakeApp', (url) => {
    const q = new URL(url).searchParams;
    if (q.get('api') === 'wellmo-list') return JSON.stringify({ ok: true, items: [
      { id: 'P00009', name: '別の物件', address: '名古屋市中区', stage: 5, pending: 0, wellmoAt: '' },
      { id: 'P00002', name: '名信ビル', address: '愛知県名古屋市千種区今池3丁目39-21', stage: 5, pending: 0, wellmoAt: '' }] });
    if (q.get('api') === 'wellmo-data') return JSON.stringify({ ok: true, id: q.get('id'), name: '名信ビル', data: DATA, pending: 0 });
    if (q.get('api') === 'wellmo-mark') { marks.push(q.get('id')); return JSON.stringify({ ok: true }); }
    return JSON.stringify({ ok: false, error: 'unknown' });
  });
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
  await page3.waitForFunction(() => /名信ビル/.test((document.getElementById('wm-autofill-panel') || {}).innerText || ''), null, { timeout: 20000 });
  await checkFilled(page3);
  await page3.click('#wm-autofill-panel-close');
  // 既存の建物を開き直すと、その建物が一覧の先頭に出る
  await page3.click('text=周辺調査から入力');
  await page3.waitForSelector('tr.wm-match [data-id="P00002"]');
  await page3.click('#wm-survey-launcher [data-a=close]');
  await page3.click('#save');
  await page3.waitForTimeout(300);
  assert.deepEqual(marks, ['P00002'], '保存ボタンで入力済みを記録');
  if (process.env.SHOT) await page3.screenshot({ path: process.env.SHOT, fullPage: true });

  await browser.close();
  console.log('wellmo autofill browser test (bookmarklet + Tampermonkey): OK');
})().catch((e) => { console.error(e); process.exit(1); });
