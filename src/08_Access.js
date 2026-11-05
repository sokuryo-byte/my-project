/**
 * 08_Access.js
 * 「その他アクセス」（最寄りバス停からの徒歩分）と「空港からのアクセス」（車の所要時間）。
 */

var BUS_STOP_TYPES = ['bus_stop', 'bus_station'];

/** バス停名の整形（「（バス）」「バス停」「停留所」などの付記を除く） */
function cleanBusStopName_(name) {
  return nfkc_(name).trim()
    .replace(/\s*[（(][^）)]*[）)]\s*$/, '')
    .replace(/\s*(バス停留所|バス停|停留所)$/, '')
    .trim();
}

function surveyBusStop_(ctx, origin) {
  var radius = toNum_(ctx.settings.bus_stop_radius_m) || 1000;
  var places = placesNearby_(ctx, origin, BUS_STOP_TYPES, radius);
  if (!places.length) places = placesNearby_(ctx, origin, BUS_STOP_TYPES, radius * 3);
  var seen = {};
  var cands = places.filter(function (p) {
    if (!p.placeId || seen[p.placeId] || p.lat == null) return false;
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return false;
    seen[p.placeId] = true;
    return true;
  }).map(function (p) {
    return { place: p, straightM: Math.round(haversineM_(origin, p)), roadM: null, minutes: null };
  }).sort(function (a, b) { return a.straightM - b.straightM; }).slice(0, 5);

  var now = formatJst_();
  if (!cands.length) {
    return [{ '物件ID': ctx.propertyId, '実行ID': ctx.runId, '種別': 'バス停', '採用': false,
      '要確認理由': 'バス停が見つからない。手動で確認', '確認済': false, '取得日時': now }];
  }
  var routes = walkMatrix_(ctx, origin, cands.map(function (c) { return c.place; }));
  cands.forEach(function (c, i) {
    if (routes[i]) {
      c.roadM = routes[i].distanceMeters;
      c.minutes = walkMinutes_(c.roadM, ctx.mPerMin);
    }
  });
  // 同じ名前のバス停（上り・下りなど）は近い1つにまとめる
  var seenName = {};
  cands = cands.filter(function (c) { return c.roadM != null; })
    .sort(function (a, b) { return a.roadM - b.roadM; })
    .filter(function (c) { var k = cleanBusStopName_(c.place.name); if (seenName[k]) return false; seenName[k] = true; return true; })
    .slice(0, 3);
  return cands.map(function (c, idx) {
    var flags = distanceFlags_(c.roadM, c.straightM, toNum_(ctx.settings.detour_ratio_max));
    if (idx === 0) addFlag_(flags, '運行会社（○○バス）を入力');
    return {
      '物件ID': ctx.propertyId, '実行ID': ctx.runId, '種別': 'バス停', '名称': cleanBusStopName_(c.place.name),
      '運行会社': '', '道路距離m': c.roadM, '徒歩分': c.minutes, '車所要分': '', '車距離m': '', '有料道路': '',
      '採用': idx === 0, '詳細': 'Places上の名称: ' + c.place.name,
      '要確認理由': flags.join(' / '), '確認済': false, '備考': '',
      'place_id': c.place.placeId, '緯度': c.place.lat, '経度': c.place.lng, '取得日時': now
    };
  });
}

function surveyAirports_(ctx, origin) {
  var now = formatJst_();
  var rows = [];
  [1, 2].forEach(function (i) {
    var name = nfkc_(ctx.settings['airport_' + i + '_name']).trim();
    var address = nfkc_(ctx.settings['airport_' + i + '_address']).trim();
    if (!name || !address) return;
    var r = null;
    var err = '';
    try {
      r = driveWithTollCheck_(ctx, origin, { address: address });
    } catch (e) {
      err = e.message;
    }
    rows.push({
      '物件ID': ctx.propertyId, '実行ID': ctx.runId, '種別': '空港', '名称': name, '運行会社': '',
      '道路距離m': '', '徒歩分': '',
      '車所要分': r ? r.minutes : '', '車距離m': r ? r.distanceMeters : '', '有料道路': r && r.toll ? 'あり' : '',
      '採用': false, '詳細': r ? r.detail : '',
      '要確認理由': r ? '' : '車経路が取得できない' + (err ? ': ' + err : ''),
      '確認済': false, '備考': '', 'place_id': '', '緯度': '', '経度': '', '取得日時': now
    });
  });
  // 所要時間の短い方の空港を採用
  var best = null;
  rows.forEach(function (row) {
    if (row['車所要分'] === '') return;
    if (!best || row['車所要分'] < best['車所要分']) best = row;
  });
  if (best) best['採用'] = true;
  return rows;
}
