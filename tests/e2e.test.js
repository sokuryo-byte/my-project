// スプレッドシートとGoogle APIをモックして、調査～出力の一連の流れを検証する
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load');

/* ---------- 簡易スプレッドシートモック ---------- */
function makeSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getName: () => name,
    getLastRow: () => {
      for (let r = data.length - 1; r >= 0; r--) if ((data[r] || []).some((v) => v !== '' && v != null)) return r + 1;
      return 0;
    },
    getLastColumn: () => data.reduce((m, row) => {
      let last = 0;
      (row || []).forEach((v, i) => { if (v !== '' && v != null) last = i + 1; });
      return Math.max(m, last);
    }, 0),
    getRange: (r, c, nr = 1, nc = 1) => makeRange(sh, r, c, nr, nc),
    appendRow: (vals) => { data[sh.getLastRow()] = vals.slice(); },
    deleteRow: (r) => { data.splice(r - 1, 1); },
    setFrozenRows: () => {}
  };
  return sh;
}
function makeRange(sh, r, c, nr, nc) {
  const cell = (i, j) => {
    const row = sh.data[r - 1 + i] || [];
    const v = row[c - 1 + j];
    return v == null ? '' : v;
  };
  const set = (i, j, v) => {
    const ri = r - 1 + i;
    sh.data[ri] = sh.data[ri] || [];
    sh.data[ri][c - 1 + j] = v;
  };
  const rg = {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(i, j))),
    setValues: (vals) => {
      assert.equal(vals.length, nr, 'setValues 行数');
      vals.forEach((row, i) => { assert.equal(row.length, nc, 'setValues 列数'); row.forEach((v, j) => set(i, j, v)); });
      return rg;
    },
    setValue: (v) => { set(0, 0, v); return rg; },
    clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(i, j, ''); return rg; },
    clearDataValidations: () => rg,
    insertCheckboxes: () => {
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
        const v = cell(i, j);
        if (v === '' && r - 1 + i < sh.getLastRow()) set(i, j, false);
      }
      return rg;
    },
    setFontWeight: () => rg, setBackground: () => rg, setNumberFormat: () => rg, setWrap: () => rg
  };
  return rg;
}
function makeSpreadsheet() {
  const sheets = [makeSheet('シート1')];
  let active = sheets[0];
  return {
    sheets,
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
    setSpreadsheetTimeZone: () => {},
    getSpreadsheetTimeZone: () => 'Asia/Tokyo',
    getId: () => 'SHEET_ID',
    setActive: (s) => { active = s; },
    getActive: () => active
  };
}

/* ---------- Google APIモック ---------- */
const ORIGIN = { lat: 35.1915, lng: 136.9370 };
function off(dLatM, dLngM) {
  return { latitude: ORIGIN.lat + dLatM / 111320, longitude: ORIGIN.lng + dLngM / (111320 * Math.cos(ORIGIN.lat * Math.PI / 180)) };
}
const PLACES = [
  // id, name, types, north(m), east(m), extra
  ['s1', 'イオン 大曽根店', ['supermarket'], 300, 0],
  ['s2', 'マックスバリュ 大曽根店', ['supermarket'], 0, 500],
  ['s3', 'イオン 砂田橋店', ['supermarket'], 600, 0],
  ['d1', 'スギ薬局 大曽根店', ['drugstore'], 1500, 0],
  ['d2', 'さくら調剤薬局', ['pharmacy'], 100, 0],
  ['c1', 'ローソン 大曽根駅前店', ['convenience_store'], 100, 100],
  ['c2', 'ファミリーマート 大曽根店', ['convenience_store'], 200, 0],
  ['c3', 'ローソン 東大曽根店', ['convenience_store'], 0, 250],
  ['c4', 'セブン-イレブン 閉店', ['convenience_store'], 50, 0, { businessStatus: 'CLOSED_PERMANENTLY' }],
  ['h1', '大曽根クリニック（内科）', ['doctor'], 400, 0],
  ['h2', 'ほし歯科', ['dentist'], 50, 0],
  ['po1', '大曽根郵便局', ['post_office'], 700, 0],
  ['po2', 'ゆうちょ銀行 ATM', ['post_office', 'atm'], 10, 0],
  ['pk1', '大きな公園', ['park'], 500, 0, { viewport: { low: off(400, -100), high: off(600, 100) } }],
  ['pk2', '児童遊園', ['park'], 100, 0, { viewport: { low: off(90, -10), high: off(110, 10) } }],
  ['r1', 'すき家 大曽根店', ['restaurant', 'fast_food_restaurant'], 200, 200],
  ['r2', 'マクドナルド 大曽根店', ['hamburger_restaurant', 'fast_food_restaurant'], 300, 300],
  ['r3', '個人の定食屋', ['restaurant'], 50, 50],
  ['r4', 'スガキヤ 大曽根店', ['ramen_restaurant'], 1500, 0],
  ['r5', 'すき家 砂田橋店', ['restaurant'], 600, 0],
  ['st1', '大曽根駅', ['train_station'], 0, 600],
  ['st1b', '大曽根駅（地下鉄）', ['subway_station'], 0, 650],
  ['st2', '砂田橋駅', ['subway_station'], 900, 0],
  ['st3', '森下駅', ['train_station'], -1200, 0],
  ['st4', '遠方駅', ['train_station'], 4000, 0],
  ['bs1', '大曽根（バス）', ['bus_stop'], 150, 0],
  ['bs2', '東大曽根', ['bus_stop'], 0, 400]
].map(([id, name, types, n, e, extra]) => Object.assign({
  id, displayName: { text: name }, formattedAddress: '愛知県名古屋市東区 ' + name,
  location: off(n, e), types, primaryType: types[0], businessStatus: 'OPERATIONAL'
}, extra || {}));

function dist(a, b) {
  const R = 6371008.8, t = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * t, dLng = (b.longitude - a.longitude) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * t) * Math.cos(b.latitude * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const ORIGIN_LL = { latitude: ORIGIN.lat, longitude: ORIGIN.lng };
const calls = [];
const driveOps = [];
const MYSOKU_TEXT = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'mysoku_realnetpro.txt'), 'utf8');
function resp(obj, code = 200) {
  return { getResponseCode: () => code, getContentText: () => JSON.stringify(obj) };
}
const UrlFetchApp = {
  fetch(url, opt) {
    const body = opt.payload ? JSON.parse(opt.payload) : null;
    calls.push({ url, body });
    if (url.includes('geocode')) {
      return resp({ status: 'OK', results: [{ geometry: { location: { lat: ORIGIN.lat, lng: ORIGIN.lng }, location_type: 'ROOFTOP' }, address_components: [{ long_name: '千種区', types: ['political', 'sublocality', 'sublocality_level_1'] }, { long_name: '名古屋市', types: ['locality', 'political'] }, { long_name: '愛知県', types: ['administrative_area_level_1', 'political'] }], formatted_address: '日本、〒461-0000 愛知県名古屋市東区テスト1-1', place_id: 'geo1' }] });
    }
    if (url.includes('searchNearby')) {
      const c = body.locationRestriction.circle;
      const hits = PLACES.filter((p) => p.types.some((t) => body.includedTypes.includes(t)) && dist(ORIGIN_LL, p.location) <= c.radius)
        .sort((a, b) => dist(ORIGIN_LL, a.location) - dist(ORIGIN_LL, b.location)).slice(0, 20);
      return resp({ places: hits });
    }
    if (url.includes('searchText')) {
      const q = body.textQuery;
      let hits = [];
      if (q === '内科') hits = PLACES.filter((p) => ['h1', 'h2'].includes(p.id));
      if (q === '100円ショップ') hits = [];
      if (q.endsWith('駅')) hits = PLACES.filter((p) => p.displayName.text === q);
      return resp({ places: hits });
    }
    if (url.includes('computeRouteMatrix')) {
      const o = body.origins[0].waypoint.location.latLng;
      return resp(body.destinations.map((d, i) => ({
        originIndex: 0, destinationIndex: i, condition: 'ROUTE_EXISTS',
        distanceMeters: Math.round(dist(o, d.waypoint.location.latLng) * 1.25), duration: '100s'
      })));
    }
    if (url.includes('computeRoutes')) {
      if (body.travelMode === 'TRANSIT') return resp({}); // 日本でバス経路が返らないケース
      const toll = !body.routeModifiers.avoidTolls;
      return resp({ routes: [{ duration: toll ? '1500s' : '2100s', distanceMeters: toll ? 20000 : 18000 }] });
    }
    throw new Error('unexpected ' + url);
  }
};

const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const ss = makeSpreadsheet();
const alerts = [];
const g = loadGas({
  UrlFetchApp,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss,
    getActiveSheet: () => ss.getActive(),
    getUi: () => ({ alert: (m) => alerts.push(m) })
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'TEST_KEY', setProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }), getDocumentLock: () => null }, // 紐付けなしスクリプトではDocumentLockはnull
  Utilities: { sleep: () => {}, formatDate: () => '03:00' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  DriveApp: { getFileById: (id) => ({ getName: () => 'mysoku.pdf', getBlob: () => ({}), setTrashed: () => {} }) },
  Drive: { Files: {
    create: (meta, blob, opt) => { driveOps.push(['create', meta.mimeType, opt.ocrLanguage]); return { id: 'tmpdoc' }; },
    remove: (id) => driveOps.push(['remove', id])
  } },
  DocumentApp: { openById: () => ({ getBody: () => ({ getText: () => MYSOKU_TEXT }) }) }
});

function table(name) {
  return g.readTable_(name).rows;
}

test('E2E: セットアップ → 起点確認待ち → 調査 → 出力', () => {
  g.menuSetup();
  assert.ok(ss.getSheetByName('物件'));
  assert.equal(ss.getSheetByName('シート1'), null);

  const prop = ss.getSheetByName('物件');
  const H = g.HEADERS['物件'];
  const row = H.map(() => '');
  row[H.indexOf('物件名')] = 'テスト物件';
  row[H.indexOf('住所')] = '愛知県名古屋市東区テスト1-1';
  row[H.indexOf('マイソク駅1_駅名')] = '砂田橋';
  row[H.indexOf('マイソク駅1_路線')] = '地下鉄名城線';
  row[H.indexOf('マイソク駅1_徒歩分')] = '20分';
  row[H.indexOf('起点確認済')] = false;
  row[H.indexOf('建物名')] = 'テストハイツ';
  row[H.indexOf('号室')] = '101';
  row[H.indexOf('バストイレ別')] = true;
  row[H.indexOf('オートロック')] = true;
  prop.getRange(2, 1, 1, H.length).setValues([row]);

  // 1回目: Geocodeのみで停止
  g.menuSurveyPending();
  let p = table('物件')[0];
  assert.equal(p['ステータス'], '起点確認待ち');
  assert.equal(p['物件ID'], 'P00002');
  assert.equal(p['起点緯度'], ORIGIN.lat);
  assert.equal(table('施設結果').length, 0);

  // 担当者が起点確認
  g.updateRow_('物件', 2, { '起点確認済': true });
  g.menuSurveyPending();
  p = table('物件')[0];
  assert.equal(p['ステータス'], '調査済', String(p['メッセージ']));

  const fac = table('施設結果');
  const adopted = (catId) => fac.filter((r) => r['カテゴリID'] === catId && r['採否'] === '採用').map((r) => r['place_id']);
  eq(adopted('supermarket'), ['s1', 's2']); // イオンは最寄りの1店のみ（他社のみ）
  eq(adopted('drugstore'), ['d1']); // 調剤薬局除外・圏外でも最低1件
  assert.match(fac.find((r) => r['place_id'] === 'd1')['採用理由'], /最低件数/);
  eq(adopted('convenience'), ['c1', 'c2']); // 閉店除外・ローソン重複除外
  eq(adopted('clinic'), ['h1']); // 歯科除外
  eq(adopted('post_office'), ['po1']); // ATM除外
  eq(adopted('park'), ['pk1']); // 小さい公園除外
  eq(adopted('chain_restaurant'), ['r1', 'r2', 'r4']); // 個人店除外・すき家重複除外・最低3件
  assert.equal(fac.filter((r) => r['カテゴリID'] === 'hundred_yen').length, 0); // 最低件数0で該当なしなら行を作らない
  // 徒歩分は道路距離/80の切り上げ
  fac.filter((r) => r['採否'] === '採用').forEach((r) => assert.equal(r['徒歩分'], Math.ceil(r['道路距離m'] / 80)));
  // 常に要確認のカテゴリは掲載OFF
  assert.equal(fac.find((r) => r['place_id'] === 'h1')['掲載'], false);
  assert.equal(fac.find((r) => r['place_id'] === 's1')['掲載'], true);

  const st = table('駅結果');
  eq(st.map((r) => r['出典'] + ':' + r['駅名']), ['マイソク:砂田橋', 'Google:大曽根駅', 'Google:森下駅']);
  assert.equal(st[0]['Google徒歩分'], 15);
  assert.equal(st[0]['採用徒歩分'], 15); // マイソク20分よりGoogle換算15分が短い
  assert.equal(st[0]['採用元'], 'Google（マイソクより短い）');

  const ac = table('アクセス結果');
  const bus = ac.find((r) => r['種別'] === 'バス停' && r['採用'] === true);
  assert.equal(bus['名称'], '大曽根');
  const air = ac.filter((r) => r['種別'] === '空港');
  assert.equal(air.length, 2);
  assert.equal(air[0]['有料道路'], 'あり');
  assert.equal(air[0]['車所要分'], 25);

  const out = table('出力')[0];
  assert.equal(out['駅1'], '地下鉄名城線「砂田橋」駅');
  assert.equal(out['駅1_徒歩分'], '15');
  assert.equal(out['駅2'], '（路線未入力）「大曽根」駅');
  assert.equal(out['その他アクセス'], '○○バス「大曽根」停から徒歩約3分');
  assert.equal(out['空港からのアクセス'], '中部国際空港から車で約25分（有料道路あり）');
  assert.match(out['周辺施設'], /^イオン 大曽根店まで徒歩約5分\nマックスバリュ 大曽根店まで徒歩約8分\nスギ薬局 大曽根店まで車で約25分\n/);
  assert.equal(out['出典表記'], g.DEFAULT_SETTINGS.find((d) => d[0] === 'attribution')[1]);
  assert.equal(out['タイトル'], '【東区/大曽根駅徒歩10分/バストイレ別/オートロック】テストハイツ');
  assert.doesNotMatch(out['周辺施設'], /クリニック/); // 未承認は出力しない
  assert.ok(out['未確認の要確認件数'] > 0);
  const w = JSON.parse(out['ウェルモJSON']);
  assert.equal(w['マンスリー表示名'], out['タイトル']);
  assert.equal(w['周辺環境'], out['周辺施設']);
  assert.equal(w['緯度'], ORIGIN.lat);
  eq(w['最寄り駅'][0], { '路線': '地下鉄名城線', '駅': '砂田橋', '徒歩': 15, 'その他': '' });
  eq(w['建物設備'], ['オートロック']);
  assert.equal(w['空港からのアクセス'], out['空港からのアクセス']);

  // 担当者が路線・運行会社・掲載を編集 → 再調査しても引き継がれる
  const stSheet = g.readTable_('駅結果');
  g.updateRow_('駅結果', stSheet.rows[1]._row, { '路線': 'JR中央本線' });
  const acSheet = g.readTable_('アクセス結果');
  g.updateRow_('アクセス結果', acSheet.rows.find((r) => r['採用'] === true && r['種別'] === 'バス停')._row, { '運行会社': '名古屋市営バス' });
  const fSheet = g.readTable_('施設結果');
  g.updateRow_('施設結果', fSheet.rows.find((r) => r['place_id'] === 'h1')._row, { '掲載': true, '確認済': true });

  g.updateRow_('物件', 2, { 'ステータス': '' });
  g.menuSurveyPending();
  const out2 = table('出力')[0];
  assert.equal(out2['駅2'], 'JR中央本線「大曽根」駅');
  assert.equal(out2['その他アクセス'], '名古屋市営バス「大曽根」停から徒歩約3分');
  assert.match(out2['周辺施設'], /大曽根クリニック（内科）/);
  assert.equal(table('施設結果').filter((r) => r['物件ID'] === 'P00002').length, fac.length); // 重複しない
});

test('E2E: 徒歩30分以上の駅は車（バス経路なし）', () => {
  const st = g.formatStation_({ '路線': 'X線', '駅名': '遠方駅', '採用徒歩分': 63, '代替手段': '車', '代替所要分': 25, '代替距離m': 20000, '代替有料道路': 'あり' }, 30, true);
  eq({ ...st }, { label: 'X線「遠方」駅', walk: '', other: '車で25分（約20.0km・有料道路あり）' });
});

test('E2E: APIキーをログに残さない', () => {
  const ctx = { settings: { api_retries: 0 }, apiKey: 'SECRET' };
  const orig = UrlFetchApp.fetch;
  UrlFetchApp.fetch = () => resp({ error: 'bad' }, 400);
  try {
    assert.throws(() => g.fetchJson_(ctx, 'Test', 'https://x/?key=SECRET', {}), (e) => !e.message.includes('SECRET'));
  } finally {
    UrlFetchApp.fetch = orig;
  }
});

test('E2E: マイソクPDF取り込み → 物件シートの空欄に反映', () => {
  const prop = ss.getSheetByName('物件');
  const H = g.readTable_('物件').headers;
  const row = H.map((h) => (h === 'マイソクPDF' ? 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view' : ''));
  const r = prop.getLastRow() + 1;
  prop.getRange(r, 1, 1, H.length).setValues([row]);
  const p = g.readTable_('物件').rows.find((x) => x._row === r);
  g.importMysokuForRow_(p);
  const after = g.readTable_('物件').rows.find((x) => x._row === r);
  assert.equal(after['建物名'], '名信ビル');
  assert.equal(after['号室'], '6');
  assert.equal(after['住所'], '愛知県名古屋市千種区今池3丁目39-21');
  assert.equal(after['マイソク駅1_駅名'], '吹上');
  assert.equal(after['マイソク駅3_徒歩分'], 14);
  assert.equal(after['バストイレ別'], true);
  assert.equal(after['建物構造'], 'RC');
  assert.match(after['マイソク取込メモ'], /要確認: .*帖数/);
  eq(driveOps, [['create', 'application/vnd.google-apps.document', 'ja'], ['remove', 'tmpdoc']]); // 一時ドキュメントは削除
});

test('E2E: アプリ画面のAPI（詳細の取得・物件の削除）', () => {
  const before = g.api_listProperties();
  const target = before.find((p) => p.name === '名信ビル');
  assert.ok(target, '取り込んだ物件が一覧にある');
  const d = g.api_getProperty(target.id);
  assert.equal(d.prop['建物名'], '名信ビル');
  assert.ok(d.categories.length > 0);
  driveOps.length = 0;
  const r = g.api_deleteProperty(target.id);
  assert.equal(r.ok, true);
  assert.equal(r.trashedPdf, true, 'マイソクPDFはゴミ箱へ');
  const after = g.api_listProperties();
  assert.equal(after.length, before.length - 1);
  assert.equal(after.some((p) => p.id === target.id), false);
  // ほかの物件の調査結果は残る
  assert.ok(table('施設結果').some((x) => x['物件ID'] === 'P00002'));
  assert.equal(table('施設結果').some((x) => x['物件ID'] === target.id), false);
});
