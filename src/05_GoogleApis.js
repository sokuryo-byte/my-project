/**
 * 05_GoogleApis.js
 * Geocoding API / Places API (New) / Routes API の呼び出し。
 * 取得項目はフィールドマスクで最小限に絞る（課金SKUの抑制）。
 */

var PLACE_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.types', 'places.primaryType', 'places.businessStatus', 'places.viewport'
].join(',');

var PLACES_MAX_RESULTS = 20; // Places API (New) の1リクエスト上限
var MATRIX_CHUNK = 25;

/* ---------------- Geocoding API ---------------- */

function geocode_(ctx, address) {
  var url = 'https://maps.googleapis.com/maps/api/geocode/json' +
    '?address=' + encodeURIComponent(address) +
    '&language=ja&region=jp&key=' + encodeURIComponent(ctx.apiKey);
  var res = fetchJson_(ctx, 'Geocoding', url, { method: 'get' });
  if (res.status !== 'OK' || !res.results || !res.results.length) {
    throw new Error('Geocoding失敗: ' + res.status + (res.error_message ? ' ' + res.error_message : ''));
  }
  var r = res.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    locationType: r.geometry.location_type,
    partialMatch: !!r.partial_match,
    formattedAddress: r.formatted_address,
    placeId: r.place_id,
    components: r.address_components || [],
    resultCount: res.results.length
  };
}

/* ---------------- Places API (New) ---------------- */

function normalizePlace_(p) {
  return {
    placeId: p.id,
    name: p.displayName ? p.displayName.text : '',
    address: p.formattedAddress || '',
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    types: p.types || [],
    primaryType: p.primaryType || '',
    businessStatus: p.businessStatus || '',
    viewport: p.viewport || null
  };
}

function circle_(origin, radius) {
  return { circle: { center: { latitude: origin.lat, longitude: origin.lng }, radius: Math.min(50000, radius) } };
}

/** Nearby Search (New)。rankPreference=DISTANCE で近い順に最大20件 */
function placesNearby_(ctx, origin, types, radius) {
  var body = {
    includedTypes: types,
    maxResultCount: PLACES_MAX_RESULTS,
    rankPreference: 'DISTANCE',
    languageCode: 'ja',
    regionCode: 'JP',
    locationRestriction: circle_(origin, radius)
  };
  var res = postJson_(ctx, 'Places Nearby', 'https://places.googleapis.com/v1/places:searchNearby', body, PLACE_FIELD_MASK);
  return (res.places || []).map(normalizePlace_);
}

/** Text Search (New)。locationBiasで物件周辺に寄せ、距離順で取得 */
function placesText_(ctx, query, origin, radius, includedType) {
  var body = {
    textQuery: query,
    pageSize: PLACES_MAX_RESULTS,
    rankPreference: 'DISTANCE',
    languageCode: 'ja',
    regionCode: 'JP',
    locationBias: circle_(origin, radius)
  };
  if (includedType) body.includedType = includedType;
  var res = postJson_(ctx, 'Places Text', 'https://places.googleapis.com/v1/places:searchText', body, PLACE_FIELD_MASK);
  return (res.places || []).map(normalizePlace_);
}

/* ---------------- Routes API ---------------- */

/** 座標があれば座標を優先（住所文字列での経路計算は位置がずれるため）。空港など座標がない場合のみ住所 */
function waypoint_(p) {
  if (p.lat != null && p.lng != null) return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
  return { address: p.address };
}

/**
 * 徒歩の道路距離をまとめて取得（Compute Route Matrix）。
 * @return {Array<{distanceMeters:number, durationSec:number}|null>} destsと同じ順序
 */
function walkMatrix_(ctx, origin, dests) {
  var out = dests.map(function () { return null; });
  for (var start = 0; start < dests.length; start += MATRIX_CHUNK) {
    var chunk = dests.slice(start, start + MATRIX_CHUNK);
    var body = {
      origins: [{ waypoint: waypoint_(origin) }],
      destinations: chunk.map(function (d) { return { waypoint: waypoint_(d) }; }),
      travelMode: 'WALK',
      languageCode: 'ja',
      regionCode: 'JP'
    };
    var res = postJson_(ctx, 'Routes Matrix', 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', body,
      'originIndex,destinationIndex,status,condition,distanceMeters,duration');
    (res || []).forEach(function (el) {
      if (el.condition !== 'ROUTE_EXISTS') return;
      var idx = start + (el.destinationIndex || 0);
      out[idx] = {
        distanceMeters: el.distanceMeters || 0,
        durationSec: parseDurationSec_(el.duration)
      };
    });
  }
  return out;
}

/**
 * 車の経路（Compute Routes, DRIVE）。
 * @param {Object} opt {departureTime, avoidTolls}
 */
function driveRoute_(ctx, origin, dest, opt) {
  var body = {
    origin: waypoint_(origin),
    destination: waypoint_(dest),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: opt.departureTime,
    languageCode: 'ja',
    regionCode: 'JP',
    extraComputations: ['TOLLS'],
    routeModifiers: { avoidTolls: !!opt.avoidTolls }
  };
  var res = postJson_(ctx, 'Routes Drive', 'https://routes.googleapis.com/directions/v2:computeRoutes', body,
    'routes.duration,routes.staticDuration,routes.distanceMeters,routes.travelAdvisory.tollInfo,routes.warnings');
  var r = res.routes && res.routes[0];
  if (!r) return null;
  return {
    durationSec: parseDurationSec_(r.duration),
    staticDurationSec: parseDurationSec_(r.staticDuration),
    distanceMeters: r.distanceMeters || 0,
    hasTollInfo: !!(r.travelAdvisory && r.travelAdvisory.tollInfo),
    warnings: r.warnings || []
  };
}

/**
 * 車の所要時間＋有料道路判定。
 * 有料道路の判定：tollInfoが返る、または「有料道路回避」ルートと距離が一定以上異なる場合に「あり」。
 */
function driveWithTollCheck_(ctx, origin, dest) {
  var dep = nextDepartureIso_(ctx.settings.drive_departure_time, false);
  var normal = driveRoute_(ctx, origin, dest, { departureTime: dep, avoidTolls: false });
  if (!normal) return null;
  var avoid = driveRoute_(ctx, origin, dest, { departureTime: dep, avoidTolls: true });
  var diffLimit = toNum_(ctx.settings.toll_detect_diff_m) || 100;
  var toll = normal.hasTollInfo || (avoid != null && Math.abs(avoid.distanceMeters - normal.distanceMeters) > diffLimit);
  return {
    minutes: ceilMinutes_(normal.durationSec),
    distanceMeters: normal.distanceMeters,
    toll: toll,
    departureTime: dep,
    detail: '出発' + formatJst_(Date.parse(dep)) + '想定 / 道路距離' + displayKm_(normal.distanceMeters) + 'km' +
      (toll ? ' / 有料道路利用' : '') +
      (avoid ? ' / 有料回避時' + ceilMinutes_(avoid.durationSec) + '分・' + displayKm_(avoid.distanceMeters) + 'km' : '')
  };
}

/**
 * バス経路（Compute Routes, TRANSIT, BUSのみ）。所要時間は徒歩区間を含む。
 * 日本では公共交通データが返らない地域・事業者がある。返らない場合はnull。
 */
function busRoute_(ctx, origin, dest) {
  var dep = nextDepartureIso_(ctx.settings.transit_departure_time, true);
  var body = {
    origin: waypoint_(origin),
    destination: waypoint_(dest),
    travelMode: 'TRANSIT',
    departureTime: dep,
    languageCode: 'ja',
    regionCode: 'JP',
    transitPreferences: { allowedTravelModes: ['BUS'] }
  };
  var res = postJson_(ctx, 'Routes Transit', 'https://routes.googleapis.com/directions/v2:computeRoutes', body,
    'routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.distanceMeters,' +
    'routes.legs.steps.staticDuration,routes.legs.steps.transitDetails');
  var r = res.routes && res.routes[0];
  if (!r) return null;
  return summarizeTransit_(r, dep);
}

/** TRANSITルートの要約（純粋関数） */
function summarizeTransit_(route, dep) {
  var walkM = 0;
  var rides = [];
  (route.legs || []).forEach(function (leg) {
    (leg.steps || []).forEach(function (st) {
      if (st.travelMode === 'TRANSIT' && st.transitDetails) {
        var td = st.transitDetails;
        var line = td.transitLine || {};
        var agency = line.agencies && line.agencies[0] ? line.agencies[0].name : '';
        var vehicle = line.vehicle ? line.vehicle.type : '';
        rides.push({
          agency: agency,
          line: line.nameShort || line.name || '',
          vehicle: vehicle,
          from: td.stopDetails && td.stopDetails.departureStop ? td.stopDetails.departureStop.name : '',
          to: td.stopDetails && td.stopDetails.arrivalStop ? td.stopDetails.arrivalStop.name : '',
          rideMin: ceilMinutes_(parseDurationSec_(st.staticDuration))
        });
      } else if (st.travelMode === 'WALK') {
        walkM += st.distanceMeters || 0;
      }
    });
  });
  if (rides.length === 0) return null; // 徒歩のみ＝バス経路なし
  var minutes = ceilMinutes_(parseDurationSec_(route.duration));
  var detail = '出発' + formatJst_(Date.parse(dep)) + '想定 / ' + rides.map(function (x) {
    return (x.agency ? x.agency + ' ' : '') + (x.line ? x.line + ' ' : '') + '「' + x.from + '」→「' + x.to + '」乗車' + x.rideMin + '分';
  }).join(' → ') + ' / 徒歩区間計' + displayMeters_(walkM) + 'm（所要時間に含む・待ち時間を含む場合あり）';
  return {
    minutes: minutes,
    distanceMeters: route.distanceMeters || 0,
    walkMeters: walkM,
    rides: rides,
    departureTime: dep,
    detail: detail
  };
}
