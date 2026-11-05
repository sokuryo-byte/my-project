const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGas } = require('./load');

const g = loadGas();
// vm内の配列・オブジェクトは別realmなのでJSON経由で比較
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

test('徒歩分: 80m/分・端数切り上げ', () => {
  assert.equal(g.walkMinutes_(80, 80), 1);
  assert.equal(g.walkMinutes_(81, 80), 2);
  assert.equal(g.walkMinutes_(800, 80), 10);
  assert.equal(g.walkMinutes_(801, 80), 11);
  assert.equal(g.walkMinutes_(0, 80), 1);
  assert.equal(g.walkMinutes_(null, 80), null);
});

test('表示距離は10m単位で切り上げ（短く見せない）', () => {
  assert.equal(g.displayMeters_(201), 210);
  assert.equal(g.displayMeters_(200), 200);
  assert.equal(g.displayKm_(18210), '18.3');
});

test('距離の異常検出', () => {
  eq(Array.from(g.distanceFlags_(500, 400, 2.0)), []);
  assert.match(g.distanceFlags_(300, 400, 2.0)[0], /直線距離より短い/);
  assert.match(g.distanceFlags_(1000, 400, 2.0)[0], /迂回率/);
  assert.match(g.distanceFlags_(null, 400, 2.0)[0], /取得できない/);
});

test('ブランド判定: 長いキーワード優先・カテゴリ限定', () => {
  const dict = g.buildBrandDict_([
    ['ガスト', 'ガスト', 'chain_restaurant'],
    ['ステーキガスト', 'ステーキガスト', 'chain_restaurant'],
    ['セブン-イレブン', 'セブン-イレブン,セブンイレブン', 'convenience']
  ]);
  assert.equal(g.resolveBrand_('ステーキガスト 名東店', 'chain_restaurant', dict).brand, 'ステーキガスト');
  assert.equal(g.resolveBrand_('ガスト 栄店', 'chain_restaurant', dict).brand, 'ガスト');
  assert.equal(g.resolveBrand_('セブンｰイレブン 名古屋栄3丁目店', 'convenience', dict).brand, 'セブン-イレブン');
  assert.equal(g.resolveBrand_('セブン-イレブン 栄店', 'chain_restaurant', dict).fromDict, false);
  const r = g.resolveBrand_('まちのパン屋 本店', 'chain_restaurant', dict);
  assert.equal(r.brand, 'まちのパン屋');
  assert.equal(r.fromDict, false);
});

function cat(over) {
  return Object.assign({
    id: 'x', label: 'x', limitMin: 10, minCount: 1, maxCount: null,
    distinctBrand: true, chainRequired: false, includeWords: [], excludeWords: []
  }, over);
}
const c = (id, brand, roadM, fromDict) => ({ placeId: id, brand, roadM, minutes: g.walkMinutes_(roadM, 80), fromDict: fromDict !== false });

test('選定: 圏内の他社を全て・同一ブランドは最寄りのみ', () => {
  const sel = g.selectFacilities_([
    c('a', 'A', 300), c('b', 'A', 200), c('c', 'B', 700), c('d', 'C', 900)
  ], cat());
  eq(sel.map((s) => s.cand.placeId), ['b', 'c']);
});

test('選定: 圏内になければ最低件数まで最寄りを採用', () => {
  const sel = g.selectFacilities_([c('a', 'A', 1500), c('b', 'B', 2500)], cat());
  eq(sel.map((s) => s.cand.placeId), ['a']);
  assert.match(sel[0].reason, /最低件数/);
});

test('選定: チェーン系飲食は辞書一致のみ・最低3件', () => {
  const sel = g.selectFacilities_([
    c('a', 'X', 100, false), c('b', 'すき家', 300), c('c', '松屋', 1200), c('d', 'ガスト', 1500), c('e', 'サイゼリヤ', 2000)
  ], cat({ minCount: 3, chainRequired: true }));
  eq(sel.map((s) => s.cand.placeId), ['b', 'c', 'd']);
});

test('選定: 最寄りのみ（郵便局・内科）', () => {
  const sel = g.selectFacilities_([c('a', 'A', 900), c('b', 'B', 400)],
    cat({ limitMin: null, minCount: 1, maxCount: 1, distinctBrand: false }));
  eq(sel.map((s) => s.cand.placeId), ['b']);
  assert.equal(sel[0].reason, '最寄り');
});

test('選定: 「あれば」カテゴリは圏外を採用しない', () => {
  const sel = g.selectFacilities_([c('a', 'A', 900)], cat({ minCount: 0 }));
  assert.equal(sel.length, 0);
});

test('公園: 面積下限・閉業の除外', () => {
  const park = cat({ minAreaM2: 10000 });
  const vp = (d) => ({ low: { latitude: 35, longitude: 137 }, high: { latitude: 35 + d, longitude: 137 + d } });
  assert.equal(g.filterPlace_({ name: '小公園', viewport: vp(0.0003) }, park).ok, false);
  assert.equal(g.filterPlace_({ name: '大公園', viewport: vp(0.002) }, park).ok, true);
  assert.equal(g.filterPlace_({ name: 'A', businessStatus: 'CLOSED_PERMANENTLY' }, cat()).ok, false);
  assert.equal(g.filterPlace_({ name: 'ゆうちょ銀行 ATM' }, cat({ excludeWords: ['ATM'] })).ok, false);
});

test('駅: マイソクとGoogleの短い方を採用', () => {
  eq({ ...g.adoptStationMinutes_(8, 6) }, { minutes: 6, from: 'Google（マイソクより短い）' });
  eq({ ...g.adoptStationMinutes_(5, 7) }, { minutes: 5, from: 'マイソク' });
  eq({ ...g.adoptStationMinutes_(null, 7) }, { minutes: 7, from: 'Google' });
});

test('駅: マイソク不足分をGoogleの近い順で補う', () => {
  const gl = [
    { key: '大曽根', place: { name: '大曽根駅' }, roadM: 400, minutes: 5 },
    { key: '砂田橋', place: { name: '砂田橋駅' }, roadM: 900, minutes: 12 },
    { key: '森下', place: { name: '森下駅' }, roadM: 1200, minutes: 15 }
  ];
  const slots = g.buildStationSlots_([{ name: '砂田橋駅', line: '名城線', minutes: 10 }], gl, 3);
  eq(slots.map((s) => s.source + ':' + s.key), ['マイソク:砂田橋', 'Google:大曽根', 'Google:森下']);
  assert.equal(slots[0].g.minutes, 12);
});

test('駅名正規化', () => {
  assert.equal(g.normStationName_('名古屋駅（JR）'), '名古屋');
  assert.equal(g.normStationName_(' 栄 駅 '), '栄');
});

test('出力: 駅（徒歩/30分以上のバス・車）', () => {
  const base = { '路線': '名鉄瀬戸線', '駅名': '大曽根駅' };
  eq({ ...g.formatStation_({ ...base, '採用徒歩分': 5 }, 30, true) },
    { label: '名鉄瀬戸線「大曽根」駅', walk: '5', other: '' });
  assert.equal(g.formatStation_({ ...base, '採用徒歩分': 35, '代替手段': 'バス', '代替所要分': 18 }, 30, true).other, 'バスで18分');
  const car = g.formatStation_({ ...base, '採用徒歩分': 40, '代替手段': '車', '代替所要分': 12, '代替距離m': 6420, '代替有料道路': '' }, 30, true);
  assert.equal(car.walk, '');
  assert.equal(car.other, '車で12分（約6.5km）');
  assert.equal(g.formatStation_({ '駅名': '森下', '採用徒歩分': 3 }, 30, true).label, '（路線未入力）「森下」駅');
});

test('出力: バス停・空港', () => {
  assert.equal(g.formatBusStop_({ '名称': '砂田橋', '運行会社': '名古屋市営バス', '徒歩分': 4 }), '名古屋市営バス「砂田橋」停から徒歩約4分');
  assert.equal(g.formatBusStop_({ '名称': '砂田橋', '運行会社': '', '徒歩分': 4 }), '○○バス「砂田橋」停から徒歩約4分');
  assert.equal(g.formatAirport_({ '名称': '県営名古屋空港', '車所要分': 25, '車距離m': 15000, '有料道路': 'あり' }, false),
    '県営名古屋空港から車で約25分（有料道路あり）');
  assert.equal(g.formatAirport_({ '名称': '中部国際空港', '車所要分': 40, '車距離m': 45010, '有料道路': 'あり' }, true),
    '中部国際空港から車で約40分（約45.1km・有料道路あり）');
  assert.equal(g.cleanBusStopName_('砂田橋（バス）'), '砂田橋');
  assert.equal(g.cleanBusStopName_('砂田橋 バス停'), '砂田橋');
});

test('出力: 周辺施設は掲載例の書式（徒歩/車）・掲載チェックのみ', () => {
  const cats = [{ id: 'convenience', label: 'コンビニ', order: 2 }, { id: 'supermarket', label: 'スーパー', order: 1 }];
  const txt = g.formatFacilities_([
    { 'カテゴリID': 'convenience', '名称': 'セブンイレブン 豊田市小川町店', '掲載': true, '徒歩分': 2, '道路距離m': 150, '車所要分': '' },
    { 'カテゴリID': 'convenience', '名称': 'ファミリーマート 豊田三軒町店', '掲載': true, '徒歩分': 7, '道路距離m': 530, '車所要分': '' },
    { 'カテゴリID': 'convenience', '名称': 'ローソン 未承認', '掲載': false, '徒歩分': 1, '道路距離m': 50 },
    { 'カテゴリID': 'supermarket', '名称': 'スーパーマーケットバロー 東新町店', '掲載': true, '徒歩分': 26, '道路距離m': 2050, '車所要分': 6, '車距離m': 2300 }
  ], cats, false);
  assert.equal(txt, [
    'スーパーマーケットバロー 東新町店まで車で約6分',
    'セブンイレブン 豊田市小川町店まで徒歩約2分',
    'ファミリーマート 豊田三軒町店まで徒歩約7分'
  ].join('\n'));
});

const T_SETTINGS = { title_max_length: '60', title_station_walk_max_min: '10', title_room_format: '{建物名} {号室}' };

test('タイトル: 例の再現と規則', () => {
  const p = { 'エリア': '千種区', '建物名': 'casa桜・千種', '号室': '201', 'バストイレ別': true };
  const t = g.buildTitle_(p, { name: '今池', minutes: 4 }, '', T_SETTINGS);
  assert.equal(t.title, '【千種区/今池駅徒歩4分/バストイレ別】casa桜・千種 201');
  assert.equal(t.notes.length, 0);
  // 10分超は駅名のみ・USEN AIR除外・駐車場ありなら駐輪を書かない・洋室7帖以上
  const t2 = g.buildTitle_({ ...p, '駐車場': true, '自転車駐輪可能': true, '無料Wi-Fi': true, 'Wi-Fiサービス名': 'USEN AIR',
    '最大洋室帖数': 7.5, 'バストイレ別': true, '独立洗面台': true }, { name: '今池', minutes: 12 }, '', T_SETTINGS);
  assert.equal(t2.title, '【千種区/今池駅/駐車場/バストイレ別・独立洗面台/洋室7.5帖】casa桜・千種 201');
  assert.match(t2.notes.join(), /USEN/);
  // 6帖以上
  assert.match(g.buildTitle_({ ...p, '全居室6帖以上': true, '最大洋室帖数': 6 }, null, '', T_SETTINGS).title, /全居室6帖以上/);
});

test('タイトル: 60文字超は後ろの要素から削る', () => {
  const p = { 'エリア': '愛知県豊田市', '建物名': 'グランドメゾン豊田ステーションフロント', '号室': '1203',
    '駐車場': true, '無料Wi-Fi': true, '角部屋': true, 'バストイレ別': true, '独立洗面台': true, '最大洋室帖数': 8,
    'リフォーム済': true, 'オートロック': true, 'エレベーター': true, '宅配BOX': true, 'その他アピール': 'T-FACE徒歩5分' };
  const t = g.buildTitle_(p, { name: '豊田市', minutes: 6 }, '', T_SETTINGS);
  assert.ok(g.charLen_(t.title) <= 60, t.title);
  assert.ok(t.title.startsWith('【愛知県豊田市/豊田市駅徒歩6分/駐車場'));
  assert.ok(t.title.endsWith('】グランドメゾン豊田ステーションフロント 1203'));
  assert.doesNotMatch(t.title, /T-FACE|宅配BOX/);
  assert.match(t.notes.join(), /削除: .*宅配BOX.*T-FACE徒歩5分/);
});

test('タイトル: エリア表記', () => {
  const comps = [
    { long_name: '今池', types: ['sublocality', 'sublocality_level_2'] },
    { long_name: '千種区', types: ['political', 'sublocality', 'sublocality_level_1'] },
    { long_name: '名古屋市', types: ['locality', 'political'] },
    { long_name: '愛知県', types: ['administrative_area_level_1', 'political'] }
  ];
  assert.equal(g.areaFromGeocode_(comps, '', { wardCities: ['名古屋市'] }), '千種区');
  const toyota = [{ long_name: '豊田市', types: ['locality'] }, { long_name: '愛知県', types: ['administrative_area_level_1'] }];
  assert.equal(g.areaFromGeocode_(toyota, '', { wardCities: ['名古屋市'], otherStyle: '県+市' }), '愛知県豊田市');
  assert.equal(g.areaFromGeocode_(toyota, '', { wardCities: ['名古屋市'], otherStyle: '市のみ' }), '豊田市');
  assert.equal(g.areaFromGeocode_([], '日本、〒464-0850 愛知県名古屋市千種区今池１丁目', { wardCities: ['名古屋市'] }), '千種区');
  assert.equal(g.areaFromGeocode_([], '日本、〒480-0000 愛知県西春日井郡豊山町豊場', {}), '愛知県西春日井郡豊山町');
});

test('タイトル: 最寄り駅は採用徒歩分が最短の駅', () => {
  eq(g.nearestStation_([{ '駅名': '砂田橋駅', '採用徒歩分': 15 }, { '駅名': '大曽根駅', '採用徒歩分': 9 }]), { name: '大曽根', minutes: 9 });
});

test('出発時刻: 次の03:00(JST)・平日指定', () => {
  // 2026-11-05(木) 12:00 JST
  const now = Date.UTC(2026, 10, 5, 3, 0);
  assert.equal(g.nextDepartureIso_('03:00', false, now), '2026-11-05T18:00:00Z'); // 11/6 03:00 JST
  // 2026-11-06(金) 12:00 JST → 次の平日10:00は11/9(月)
  const fri = Date.UTC(2026, 10, 6, 3, 0);
  assert.equal(g.nextDepartureIso_('10:00', true, fri), '2026-11-09T01:00:00Z');
});

test('TRANSIT要約: バス区間がなければnull', () => {
  assert.equal(g.summarizeTransit_({ duration: '600s', legs: [{ steps: [{ travelMode: 'WALK', distanceMeters: 800 }] }] }, '2026-11-09T01:00:00Z'), null);
  const s = g.summarizeTransit_({
    duration: '1500s', distanceMeters: 6000,
    legs: [{ steps: [
      { travelMode: 'WALK', distanceMeters: 300 },
      { travelMode: 'TRANSIT', staticDuration: '900s', transitDetails: {
        transitLine: { name: '幹名駅1', agencies: [{ name: '名古屋市交通局' }], vehicle: { type: 'BUS' } },
        stopDetails: { departureStop: { name: 'A' }, arrivalStop: { name: 'B' } } } },
      { travelMode: 'WALK', distanceMeters: 150 }
    ] }]
  }, '2026-11-09T01:00:00Z');
  assert.equal(s.minutes, 25);
  assert.equal(s.walkMeters, 450);
  assert.match(s.detail, /名古屋市交通局 幹名駅1 「A」→「B」乗車15分/);
});

test('費用節約: 距離計算は直線距離の近い順に上限まで・同一ブランドは最寄りのみ', () => {
  const cands = [
    { placeId: 'a', brand: 'A', straightM: 500, fromDict: true }, { placeId: 'b', brand: 'A', straightM: 100, fromDict: true },
    { placeId: 'c', brand: 'B', straightM: 300, fromDict: true }, { placeId: 'd', brand: 'C', straightM: 200, fromDict: false },
    { placeId: 'e', brand: 'D', straightM: 900, fromDict: true }
  ];
  eq(g.pickForRouting_(cands, { distinctBrand: true }, 3).map((c) => c.placeId), ['b', 'd', 'c']);
  eq(g.pickForRouting_(cands, { distinctBrand: false, chainRequired: true }, 2).map((c) => c.placeId), ['b', 'c']);
  eq(g.pickForRouting_(cands, {}, 0), []);
});

test('必須の種別：Googleの分類が一致するか、チェーン辞書の店なら対象', () => {
  const cat = { requiredTypes: ['supermarket'] };
  assert.equal(g.typeAllowed_({ types: ['supermarket', 'grocery_store'] }, cat, { fromDict: false }), true);
  assert.equal(g.typeAllowed_({ types: ['grocery_store'] }, cat, { fromDict: true }), true, '食料品店に分類されたマックスバリュ');
  assert.equal(g.typeAllowed_({ types: ['grocery_store'] }, cat, { fromDict: false }), false, '個人の食料品店');
  assert.equal(g.typeAllowed_({ types: ['restaurant'] }, {}, { fromDict: false }), true, '指定なしは全部');
});

test('ふりがな：カナだけの建物名はひらがなに、漢字・英字を含む名前は空（手入力）', () => {
  assert.equal(g.kanaFromName_('サンコーレジデンス'), 'さんこーれじでんす');
  assert.equal(g.kanaFromName_('ハイツ・サクラ'), 'はいつさくら');
  assert.equal(g.kanaFromName_('ｸﾞﾗﾝｼｴﾙ'), 'ぐらんしえる');
  assert.equal(g.kanaFromName_('名信ビル'), '');
  assert.equal(g.kanaFromName_('casa桜・千種'), '');
  assert.equal(g.kanaFromName_('Ｓ－ＦＯＲＴ'), '');
});

test('エリア：所在地の文字列から（名古屋市は区のみ、それ以外は県＋市）', () => {
  const o = { wardCities: ['名古屋市'], otherStyle: '県+市' };
  assert.equal(g.areaFromAddress_('愛知県名古屋市千種区今池3丁目39-21', o), '千種区');
  assert.equal(g.areaFromAddress_('愛知県名古屋市天白区鴻の巣1丁目703', o), '天白区');
  assert.equal(g.areaFromAddress_('愛知県豊田市小川町1-1', o), '愛知県豊田市');
  assert.equal(g.areaFromAddress_('愛知県西春日井郡豊山町豊場', o), '愛知県西春日井郡豊山町');
});
