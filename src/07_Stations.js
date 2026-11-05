/**
 * 07_Stations.js
 * 最寄り駅（3駅）の調査。
 *
 * ルール（マンスリー部門の運用）:
 *  1. マイソク記載の駅をベースにする。
 *  2. マイソクに3駅なければGoogle（Places API）の近い順で補う。
 *  3. Googleの道路距離から80m/分で算出した徒歩分の方が短ければ、そちらを採用する。
 *  4. 採用徒歩分が30分以上（ウェルモの入力上限）の場合は、徒歩分を空欄にしてバス/車の所要時間を出す。
 *  5. 複数路線のうち「利用者の多い路線」の選択はGoogle APIから取得できないため、担当者が「路線」列に入力する。
 */

var STATION_TYPES = ['train_station', 'subway_station', 'light_rail_station'];

function mysokuStations_(prop) {
  var list = [];
  for (var i = 1; i <= 3; i++) {
    var name = nfkc_(prop['マイソク駅' + i + '_駅名']).trim();
    if (!name) continue;
    list.push({
      name: name,
      line: nfkc_(prop['マイソク駅' + i + '_路線']).trim(),
      minutes: toNum_(prop['マイソク駅' + i + '_徒歩分'])
    });
  }
  return list;
}

/**
 * 採用徒歩分の決定（純粋関数）。マイソクとGoogle算出値のうち短い方。
 * @return {{minutes:number|null, from:string}}
 */
function adoptStationMinutes_(mysokuMin, googleMin) {
  if (mysokuMin == null && googleMin == null) return { minutes: null, from: '' };
  if (mysokuMin == null) return { minutes: googleMin, from: 'Google' };
  if (googleMin == null) return { minutes: mysokuMin, from: 'マイソク' };
  if (googleMin < mysokuMin) return { minutes: googleMin, from: 'Google（マイソクより短い）' };
  return { minutes: mysokuMin, from: 'マイソク' };
}

/**
 * マイソク駅とGoogle候補から枠を組む（純粋関数）。
 * @param {Array} mysoku mysokuStations_の結果
 * @param {Array} googleList {key, place, roadM, minutes} 道路距離順
 * @param {number} count 登録駅数
 */
function buildStationSlots_(mysoku, googleList, count) {
  var slots = [];
  var used = {};
  mysoku.forEach(function (m) {
    var key = normStationName_(m.name);
    var g = null;
    for (var i = 0; i < googleList.length; i++) {
      if (googleList[i].key === key) { g = googleList[i]; break; }
    }
    used[key] = true;
    slots.push({ source: 'マイソク', name: m.name, line: m.line, mysokuMin: m.minutes, g: g, key: key });
  });
  googleList.forEach(function (g) {
    if (slots.length >= count || used[g.key] || g.roadM == null) return;
    used[g.key] = true;
    slots.push({ source: 'Google', name: g.place.name, line: '', mysokuMin: null, g: g, key: g.key });
  });
  return slots.slice(0, Math.max(count, mysoku.length));
}

function surveyStations_(ctx, prop, origin) {
  var count = toNum_(ctx.settings.station_count) || 3;
  var radii = splitList_(ctx.settings.station_search_radii_m).map(Number).filter(function (n) { return n > 0; });
  if (!radii.length) radii = [2000, 5000, 10000];
  var byKey = {};
  for (var ri = 0; ri < radii.length; ri++) {
    placesNearby_(ctx, origin, STATION_TYPES, radii[ri]).forEach(function (p) {
      if (p.lat == null) return;
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return;
      var key = normStationName_(p.name);
      var straight = haversineM_(origin, p);
      if (!byKey[key] || straight < byKey[key].straightM) {
        byKey[key] = { key: key, place: p, straightM: Math.round(straight), roadM: null, minutes: null };
      }
    });
    if (Object.keys(byKey).length >= count + 2) break;
  }
  var googleList = Object.keys(byKey).map(function (k) { return byKey[k]; })
    .sort(function (a, b) { return a.straightM - b.straightM; })
    .slice(0, count + 5);

  // マイソク記載駅がGoogle候補にない場合は駅名で個別に検索
  var mysoku = mysokuStations_(prop);
  mysoku.forEach(function (m) {
    var key = normStationName_(m.name);
    if (googleList.some(function (g) { return g.key === key; })) return;
    var res = placesText_(ctx, key + '駅', origin, 20000, null);
    var hit = null;
    for (var i = 0; i < res.length; i++) {
      if (normStationName_(res[i].name) === key && res[i].lat != null) { hit = res[i]; break; }
    }
    if (hit) googleList.push({ key: key, place: hit, straightM: Math.round(haversineM_(origin, hit)), roadM: null, minutes: null });
  });

  var routes = walkMatrix_(ctx, origin, googleList.map(function (g) { return g.place; }));
  googleList.forEach(function (g, i) {
    if (routes[i]) {
      g.roadM = routes[i].distanceMeters;
      g.minutes = walkMinutes_(g.roadM, ctx.mPerMin);
    }
  });
  googleList.sort(function (a, b) {
    return (a.roadM == null ? Infinity : a.roadM) - (b.roadM == null ? Infinity : b.roadM);
  });

  var slots = buildStationSlots_(mysoku, googleList, count);
  var limit = toNum_(ctx.settings.welmo_walk_limit_min) || 30;
  var now = formatJst_();
  return slots.map(function (s, idx) {
    var flags = [];
    var g = s.g;
    var googleMin = g ? g.minutes : null;
    var adopted = adoptStationMinutes_(s.mysokuMin, googleMin);
    if (!g) addFlag_(flags, 'Googleで駅を特定できない（マイソク値のみ）');
    if (g) distanceFlags_(g.roadM, g.straightM, toNum_(ctx.settings.detour_ratio_max)).forEach(function (f) { addFlag_(flags, f); });
    if (adopted.from.indexOf('Google') === 0) addFlag_(flags, '駅の座標は代表点。駅出入口までの距離か地図で確認');
    if (!s.line) addFlag_(flags, '路線を入力（複数路線の場合は利用者の多い路線）');
    if (s.source === 'マイソク' && s.mysokuMin == null) addFlag_(flags, 'マイソク徒歩分が空欄');

    var row = {
      '物件ID': ctx.propertyId, '実行ID': ctx.runId, '枠': idx + 1, '出典': s.source,
      '駅名': s.name, '路線': s.line, 'マイソク徒歩分': s.mysokuMin,
      '道路距離m': g ? g.roadM : null, 'Google徒歩分': googleMin,
      '採用徒歩分': adopted.minutes, '採用元': adopted.from,
      '代替手段': '', '代替所要分': '', '代替距離m': '', '代替有料道路': '', '代替詳細': '',
      '要確認理由': '', '確認済': false, '備考': '',
      'place_id': g ? g.place.placeId : '', '緯度': g ? g.place.lat : '', '経度': g ? g.place.lng : '',
      '取得日時': now
    };

    if (adopted.minutes != null && adopted.minutes >= limit) {
      var alt = null;
      if (g) {
        try {
          alt = alternativeTransport_(ctx, origin, g.place);
        } catch (e) {
          addFlag_(flags, '代替手段の取得エラー: ' + e.message);
        }
      } else {
        addFlag_(flags, '徒歩' + limit + '分以上だが駅の座標がなくバス/車の所要時間を取得できない');
      }
      if (alt) {
        row['代替手段'] = alt.mode;
        row['代替所要分'] = alt.minutes;
        row['代替距離m'] = alt.distanceMeters;
        row['代替有料道路'] = alt.toll ? 'あり' : '';
        row['代替詳細'] = alt.detail;
        if (alt.note) addFlag_(flags, alt.note);
      }
    }
    row['要確認理由'] = flags.join(' / ');
    return row;
  });
}

/** 徒歩30分以上の駅への代替手段（バス優先→なければ車） */
function alternativeTransport_(ctx, origin, dest) {
  var mode = nfkc_(ctx.settings.alt_transport_mode).trim();
  if (mode !== '車のみ') {
    var bus = busRoute_(ctx, origin, dest);
    if (bus) {
      return { mode: 'バス', minutes: bus.minutes, distanceMeters: bus.distanceMeters, toll: false, detail: bus.detail,
        note: 'バス所要時間は検索時刻の時刻表による。停留所名・乗車時間を確認' };
    }
  }
  var car = driveWithTollCheck_(ctx, origin, dest);
  if (!car) return null;
  return { mode: '車', minutes: car.minutes, distanceMeters: car.distanceMeters, toll: car.toll, detail: car.detail,
    note: mode !== '車のみ' ? 'Googleでバス経路が取得できないため車で算出' : '' };
}
