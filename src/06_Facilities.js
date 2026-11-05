/**
 * 06_Facilities.js
 * 周辺施設の検索・選定。
 * 選定は「道路距離の近い順」「圏内上限分」「最低件数」「他社のみ」の決定的なルールのみで行う。
 */

/** カテゴリ設定シートの1行 → 設定オブジェクト */
function parseCategory_(o) {
  return {
    id: nfkc_(o['カテゴリID']).trim(),
    label: nfkc_(o['表示名']).trim(),
    enabled: bool_(o['有効']),
    method: nfkc_(o['検索方法']).trim() || 'nearby',
    types: splitList_(o['includedTypes']),
    query: nfkc_(o['検索語']).trim(),
    includeWords: splitList_(o['名称に含む']),
    excludeWords: splitList_(o['名称に含まない']),
    limitMin: toNum_(o['圏内上限分']),
    minCount: toNum_(o['最低件数']) || 0,
    maxCount: toNum_(o['最大件数']),
    distinctBrand: bool_(o['他社のみ']),
    chainRequired: bool_(o['チェーン辞書必須']),
    minAreaM2: toNum_(o['面積下限m2']),
    alwaysCheck: bool_(o['常に要確認']),
    checkMemo: nfkc_(o['要確認メモ']).trim(),
    order: toNum_(o['出力順']) || 999,
    requiredTypes: splitList_(o['必須の種別'])
  };
}

/** 「必須の種別」：Googleの分類がいずれかに一致するか、チェーン辞書の店なら対象（純粋関数） */
function typeAllowed_(p, cat, brand) {
  if (!cat.requiredTypes || !cat.requiredTypes.length) return true;
  if ((p.types || []).some(function (t) { return cat.requiredTypes.indexOf(t) >= 0; })) return true;
  return !!(brand && brand.fromDict);
}

/** 名称・営業状態・面積による候補の足切り（純粋関数） */
function filterPlace_(p, cat) {
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return { ok: false, reason: '営業状態:' + p.businessStatus };
  var n = normKey_(p.name);
  if (cat.includeWords.length && !cat.includeWords.some(function (w) { return n.indexOf(normKey_(w)) >= 0; })) {
    return { ok: false, reason: '名称条件不一致' };
  }
  if (cat.excludeWords.some(function (w) { return n.indexOf(normKey_(w)) >= 0; })) {
    return { ok: false, reason: '除外語を含む' };
  }
  var flags = [];
  var area = null;
  if (cat.minAreaM2) {
    area = viewportAreaM2_(p.viewport);
    if (area == null) {
      flags.push('面積不明（viewportなし）');
    } else if (area < cat.minAreaM2) {
      return { ok: false, reason: '面積下限未満' };
    } else {
      flags.push('面積はviewport（外接矩形）による概算');
    }
  }
  return { ok: true, flags: flags, area: area };
}

/**
 * 候補から掲載施設を選ぶ（純粋関数）。
 * @param {Array} cands {placeId, brand, fromDict, roadM, minutes}
 * @return {Array<{cand, reason}>}
 */
function selectFacilities_(cands, cat) {
  var routed = cands.filter(function (c) { return c.roadM != null; })
    .slice().sort(function (a, b) { return a.roadM - b.roadM; });
  if (cat.chainRequired) routed = routed.filter(function (c) { return c.fromDict; });
  if (cat.distinctBrand) {
    var seen = {};
    routed = routed.filter(function (c) {
      var k = normKey_(c.brand);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }
  var selected = [];
  routed.forEach(function (c) {
    if (cat.limitMin != null && c.minutes <= cat.limitMin) selected.push({ cand: c, reason: '圏内（徒歩' + cat.limitMin + '分以内）' });
  });
  var i = 0;
  while (selected.length < cat.minCount && i < routed.length) {
    var c = routed[i++];
    if (selected.some(function (s) { return s.cand === c; })) continue;
    selected.push({ cand: c, reason: cat.limitMin != null ? '圏外だが最低件数(' + cat.minCount + ')のため最寄りを採用' : '最寄り' });
  }
  selected.sort(function (a, b) { return a.cand.roadM - b.cand.roadM; });
  if (cat.maxCount && selected.length > cat.maxCount) {
    if (cat.minAreaM2) {
      // 面積の条件があるカテゴリ（公園）は、上限内で面積の大きいものを優先し、表示は距離順
      selected = selected.slice().sort(function (a, b) { return (b.cand.area || 0) - (a.cand.area || 0); })
        .slice(0, cat.maxCount).sort(function (a, b) { return a.cand.roadM - b.cand.roadM; });
    } else {
      selected = selected.slice(0, cat.maxCount);
    }
  }
  return selected;
}

/** 検索半径の段階（直線距離≦道路距離なので、圏内判定には「上限分×80m」の半径で足りる） */
function facilityRadii_(cat, mPerMin, maxRadius) {
  var first = cat.limitMin != null ? Math.ceil(cat.limitMin * mPerMin * 1.1) : 1000;
  var radii = [first];
  if (cat.minCount > 0) {
    [2000, maxRadius].forEach(function (r) { if (r > radii[radii.length - 1]) radii.push(r); });
  }
  return radii;
}

function searchCategory_(ctx, cat, origin, radius) {
  if (cat.method === 'text') {
    var res = placesText_(ctx, cat.query || cat.label, origin, radius, cat.types[0]);
    return { places: res, capped: res.length >= PLACES_MAX_RESULTS };
  }
  if (cat.method === 'nearby_each') {
    var all = [];
    var capped = false;
    cat.types.forEach(function (t) {
      var r = placesNearby_(ctx, origin, [t], radius);
      if (r.length >= PLACES_MAX_RESULTS) capped = true;
      all = all.concat(r);
    });
    return { places: all, capped: capped };
  }
  var r2 = placesNearby_(ctx, origin, cat.types, radius);
  return { places: r2, capped: r2.length >= PLACES_MAX_RESULTS };
}

/**
 * 道路距離を計算する候補を絞る（API費用の節約。純粋関数）。
 * 掲載候補になるのは近い数件だけなので、直線距離の近い順に最大 cap 件。
 * 「他社のみ」のカテゴリは同じブランドの2店目以降を、「チェーン辞書必須」は辞書外を除く。
 */
function pickForRouting_(cands, cat, cap) {
  var list = cands.filter(function (c) { return !cat.chainRequired || c.fromDict; })
    .slice().sort(function (a, b) { return a.straightM - b.straightM; });
  if (cat.distinctBrand) {
    var seen = {};
    list = list.filter(function (c) {
      var k = normKey_(c.brand);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }
  return list.slice(0, Math.max(0, cap));
}

/** 1カテゴリを調査し、施設結果シート用の行を返す */
function surveyCategory_(ctx, cat, origin) {
  var mPerMin = ctx.mPerMin;
  var radii = facilityRadii_(cat, mPerMin, toNum_(ctx.settings.facility_max_radius_m) || 5000);
  var pool = {};
  var order = [];
  var selected = [];
  var capped = false;
  var routedCount = 0;
  for (var ri = 0; ri < radii.length; ri++) {
    var s = searchCategory_(ctx, cat, origin, radii[ri]);
    if (ri === 0) capped = s.capped;
    var fresh = [];
    s.places.forEach(function (p) {
      if (!p.placeId || pool[p.placeId] || p.lat == null) return;
      var f = filterPlace_(p, cat);
      if (!f.ok) return;
      var b = resolveBrand_(p.name, cat.id, ctx.brandDict);
      // Googleの分類が対象外でも、チェーン辞書にある店（例: 食料品店に分類されたマックスバリュ）は残す
      if (!typeAllowed_(p, cat, b)) return;
      var c = {
        place: p, placeId: p.placeId, brand: b.brand, fromDict: b.fromDict,
        straightM: Math.round(haversineM_(origin, p)), area: f.area, flags: f.flags.slice(),
        roadM: null, minutes: null
      };
      pool[p.placeId] = c;
      order.push(c);
      fresh.push(c);
    });
    // チェーン辞書必須のカテゴリは辞書外を経路計算しない（API費用の節約）
    var cap = toNum_(ctx.settings.route_candidates_max) || 8;
    var toRoute = pickForRouting_(fresh, cat, Math.max(0, cap - routedCount));
    routedCount += toRoute.length;
    if (toRoute.length) {
      var routes = walkMatrix_(ctx, origin, toRoute.map(function (c) { return c.place; }));
      toRoute.forEach(function (c, i) {
        if (routes[i]) {
          c.roadM = routes[i].distanceMeters;
          c.minutes = walkMinutes_(c.roadM, mPerMin);
        }
        distanceFlags_(c.roadM, c.straightM, toNum_(ctx.settings.detour_ratio_max)).forEach(function (fl) { addFlag_(c.flags, fl); });
      });
    }
    selected = selectFacilities_(order, cat);
    if (selected.length >= cat.minCount) break;
  }

  // 徒歩分が閾値を超える採用施設は車の所要時間も取得（例:「〇〇まで車で約6分」）
  var driveTh = toNum_(ctx.settings.facility_drive_threshold_min);
  if (driveTh) {
    selected.forEach(function (s) {
      var c = s.cand;
      if (c.minutes == null || c.minutes <= driveTh) return;
      try {
        var d = driveRoute_(ctx, origin, c.place, { departureTime: nextDepartureIso_(ctx.settings.drive_departure_time, false), avoidTolls: false });
        if (d) {
          c.driveMin = ceilMinutes_(d.durationSec);
          c.driveM = d.distanceMeters;
        }
      } catch (e) {
        addFlag_(c.flags, '車の所要時間を取得できない: ' + e.message);
      }
    });
  }

  var now = formatJst_();
  var rows = [];
  var selIds = {};
  selected.forEach(function (s, idx) {
    selIds[s.cand.placeId] = true;
    var flags = s.cand.flags.slice();
    if (cat.alwaysCheck && cat.checkMemo) addFlag_(flags, cat.checkMemo);
    var row = facilityRow_(ctx, cat, s.cand, '採用', s.reason, idx + 1, flags, now);
    // 検索の上限（20件）に達した注意は参考情報。掲載は止めない
    if (idx === 0 && capped && cat.limitMin != null) row['備考'] = '検索結果が上限20件に達したため、圏内のほかの施設が漏れている可能性があります';
    rows.push(row);
  });
  if (selected.length < cat.minCount) {
    rows.push({
      '物件ID': ctx.propertyId, '実行ID': ctx.runId, 'カテゴリID': cat.id, 'カテゴリ': cat.label,
      '採否': '該当なし', '採用理由': '', '順位': '',
      '要確認理由': '最低件数(' + cat.minCount + ')を満たす施設が見つからない。手動で確認', '確認済': false, '掲載': false, '取得日時': now
    });
  }
  var maxOthers = toNum_(ctx.settings.max_unselected_saved);
  if (maxOthers == null) maxOthers = 5;
  order.filter(function (c) { return !selIds[c.placeId] && c.roadM != null && (!cat.chainRequired || c.fromDict); })
    .sort(function (a, b) { return a.roadM - b.roadM; })
    .slice(0, maxOthers)
    .forEach(function (c) { rows.push(facilityRow_(ctx, cat, c, '候補', '', '', c.flags, now)); });
  return rows;
}

/** 店名だけでは何の店か分かりにくい場合のジャンル名（純粋関数）。チェーン辞書の店・名前にジャンル語がある店は空 */
function genrePrefix_(cat, name, fromDict, settings) {
  if (settings && settings.facility_genre_prefix !== undefined && !bool_(settings.facility_genre_prefix)) return '';
  var g = GENRE_LABELS[cat.id];
  if (!g || fromDict) return '';
  return g[1].test(nfkc_(name)) ? '' : g[0];
}

function facilityRow_(ctx, cat, c, status, reason, rank, flags, now) {
  return {
    '物件ID': ctx.propertyId, '実行ID': ctx.runId, 'カテゴリID': cat.id, 'カテゴリ': cat.label,
    '採否': status, '採用理由': reason, '順位': rank,
    '名称': c.place.name, 'ジャンル表示': genrePrefix_(cat, c.place.name, c.fromDict, ctx.settings), 'ブランド': c.brand, '道路距離m': c.roadM, '徒歩分': c.minutes,
    '車所要分': c.driveMin != null ? c.driveMin : '', '車距離m': c.driveM != null ? c.driveM : '', '直線距離m': c.straightM,
    '住所': c.place.address, '緯度': c.place.lat, '経度': c.place.lng, 'place_id': c.placeId,
    '営業状態': c.place.businessStatus, '面積概算m2': c.area,
    '要確認理由': flags.join(' / '), '確認済': false,
    '掲載': status === '採用' && flags.length === 0,
    '備考': '', '取得日時': now
  };
}

function surveyFacilities_(ctx, origin) {
  var rows = [];
  var errors = [];
  ctx.categories.filter(function (c) { return c.enabled; }).forEach(function (cat) {
    try {
      rows = rows.concat(surveyCategory_(ctx, cat, origin));
    } catch (e) {
      errors.push(cat.label + ': ' + e.message);
      rows.push({
        '物件ID': ctx.propertyId, '実行ID': ctx.runId, 'カテゴリID': cat.id, 'カテゴリ': cat.label,
        '採否': 'エラー', '要確認理由': 'API取得エラー: ' + e.message, '確認済': false, '掲載': false, '取得日時': formatJst_()
      });
    }
  });
  return { rows: rows, errors: errors };
}
