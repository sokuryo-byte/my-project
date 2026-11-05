/**
 * 12_Title.js
 * 物件タイトルの自動生成。
 *
 * 書式:
 *  【エリア/最寄り駅&徒歩分数/駐車場/無料Wi-Fi/角部屋/バストイレ別(・独立洗面台)/洋室〇帖 or 全居室6帖以上/
 *    リフォーム済/オートロック/エレベーター/宅配BOX/自転車駐輪可能/その他アピール】建物名 号室
 *  - エリア・最寄り駅・建物名・号室は必須。それ以降は該当するもののみ。
 *  - 最寄り駅は徒歩10分以内なら「今池駅徒歩4分」、超える場合は「今池駅」のみ。
 *  - USEN AIRは無料Wi-Fiとして扱わない。
 *  - 自転車駐輪可能は、駐車場ありの物件では書かない。
 *  - 60文字を超える場合は、後ろの要素から順に削る。
 *
 * エリアと最寄り駅は調査結果（Geocoding / Places / Routes）から、設備は物件シートの入力値から作る。
 * 「著名な施設」かどうかの判断はAPIではできないため、その他アピールは担当者入力、
 * または担当者が掲載チェックした大型商業施設のみを使う。
 */

function charLen_(s) {
  return Array.from(String(s)).length;
}

/**
 * Geocodingのaddress_componentsからエリア表記を作る（純粋関数）。
 * @param {Array} comps address_components（language=ja）
 * @param {string} formatted formatted_address（componentsで判定できない場合の予備）
 * @param {Object} opt {wardCities:string[], otherStyle:'県+市'|'市のみ'}
 */
function areaFromGeocode_(comps, formatted, opt) {
  var has = function (c, t) { return (c.types || []).indexOf(t) >= 0; };
  var find = function (pred) {
    for (var i = 0; i < (comps || []).length; i++) if (pred(comps[i])) return comps[i].long_name;
    return '';
  };
  var pref = find(function (c) { return has(c, 'administrative_area_level_1'); });
  var city = find(function (c) { return has(c, 'locality'); });
  var ward = find(function (c) {
    return has(c, 'ward') || ((has(c, 'sublocality_level_1') || has(c, 'locality')) && /区$/.test(c.long_name) && c.long_name !== city);
  });
  if (!pref || !city) {
    // 予備: 住所文字列から抽出（例: 日本、〒464-0850 愛知県名古屋市千種区今池1丁目）
    var addr = nfkc_(formatted).replace(/^日本、?\s*/, '').replace(/^〒?\d{3}-?\d{4}\s*/, '');
    var m = addr.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)(.+?郡.+?[町村]|.+?市)(.+?区)?/);
    if (m) {
      pref = pref || m[1];
      city = city || m[2];
      ward = ward || m[3] || '';
    }
  }
  if (!city) return '';
  var wardCities = (opt && opt.wardCities) || ['名古屋市'];
  if (ward && wardCities.indexOf(city) >= 0) return ward;
  if (opt && opt.otherStyle === '市のみ') return city;
  return pref + city;
}

/** 採用徒歩分の最も短い駅（純粋関数） */
function nearestStation_(stRows) {
  var best = null;
  (stRows || []).forEach(function (r) {
    var m = toNum_(r['採用徒歩分']);
    if (m == null || !r['駅名']) return;
    if (!best || m < best.minutes) best = { name: stationBaseName_(r['駅名']), minutes: m };
  });
  return best;
}

/**
 * タイトルを組み立てる（純粋関数）。
 * @param {Object} p 物件シートの1行
 * @param {{name:string, minutes:number}|null} station 最寄り駅
 * @param {string} autoAppeal 自動のその他アピール（空可）
 * @param {Object} settings
 * @return {{title:string, length:number, notes:string[]}}
 */
function buildTitle_(p, station, autoAppeal, settings) {
  var notes = [];
  var maxLen = toNum_(settings.title_max_length) || 60;
  var walkMax = toNum_(settings.title_station_walk_max_min) || 10;

  var area = nfkc_(p['エリア']).trim();
  if (!area) notes.push('エリアが未設定');
  var st = '';
  if (station) {
    st = station.name + '駅' + (station.minutes <= walkMax ? '徒歩' + station.minutes + '分' : '');
  } else {
    notes.push('最寄り駅が未取得');
  }
  var building = String(p['建物名'] || '').trim();
  var room = String(p['号室'] || '').trim();
  if (!building) notes.push('建物名が未入力');
  if (!room) notes.push('号室が未入力');

  var opts = [];
  var parking = bool_(p['駐車場']);
  if (parking) opts.push('駐車場');
  if (bool_(p['無料Wi-Fi'])) {
    if (/USEN/i.test(nfkc_(p['Wi-Fiサービス名']))) notes.push('USEN AIRは無料Wi-Fiとして扱わないため除外');
    else opts.push('無料Wi-Fi');
  }
  if (bool_(p['角部屋'])) opts.push('角部屋');
  if (bool_(p['バストイレ別'])) opts.push('バストイレ別' + (bool_(p['独立洗面台']) ? '・独立洗面台' : ''));
  else if (bool_(p['独立洗面台'])) opts.push('独立洗面台');
  var jo = toNum_(p['最大洋室帖数']);
  if (jo != null && jo >= 7) opts.push('洋室' + jo + '帖');
  else if (bool_(p['全居室6帖以上'])) opts.push('全居室6帖以上');
  if (bool_(p['リフォーム済'])) opts.push('リフォーム済');
  if (bool_(p['オートロック'])) opts.push('オートロック');
  if (bool_(p['エレベーター'])) opts.push('エレベーター');
  if (bool_(p['宅配BOX'])) opts.push('宅配BOX');
  if (bool_(p['自転車駐輪可能']) && !parking) opts.push('自転車駐輪可能');
  var appeal = String(p['その他アピール'] || '').trim() || autoAppeal || '';
  if (appeal) opts.push(appeal);

  var tail = String(settings.title_room_format || '{建物名} {号室}')
    .replace('{建物名}', building).replace('{号室}', room).trim();
  var compose = function (o) {
    return '【' + [area, st].filter(function (x) { return x; }).concat(o).join('/') + '】' + tail;
  };
  var title = compose(opts);
  var cut = [];
  while (charLen_(title) > maxLen && opts.length) {
    cut.unshift(opts.pop());
    title = compose(opts);
  }
  if (cut.length) notes.push(maxLen + '文字超過のため削除: ' + cut.join('、'));
  if (charLen_(title) > maxLen) notes.push('必須項目だけで' + maxLen + '文字を超過。手動で調整');
  return { title: title, length: charLen_(title), notes: notes };
}

/** 調査結果シートの行からタイトルを作る */
function buildTitleFromResults_(prop, stRows, facRows, settings) {
  var auto = '';
  if (bool_(settings.title_auto_appeal) && !String(prop['その他アピール'] || '').trim()) {
    var malls = (facRows || []).filter(function (r) {
      return r['カテゴリID'] === 'mall' && r['採否'] === '採用' && bool_(r['掲載']) && r['名称'] && r['車所要分'] === '';
    }).sort(function (a, b) { return toNum_(a['道路距離m']) - toNum_(b['道路距離m']); });
    if (malls[0]) auto = malls[0]['名称'] + '徒歩' + malls[0]['徒歩分'] + '分';
  }
  return buildTitle_(prop, nearestStation_(stRows), auto, settings);
}
