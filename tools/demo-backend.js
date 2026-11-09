/*
 * デモ用バックエンド（ブラウザ内のメモリで動く）。
 * 本番の google.script.run と同じ関数名・戻り値の形にしてある。
 * 出力文・タイトル・ウェルモJSONの生成は本番と同じコード（src/*.js）を使う。
 * 施設名・距離は架空のサンプル（実在の店舗・距離ではない）。
 */
(function () {
  'use strict';

  var SETTINGS = {};
  DEFAULT_SETTINGS.forEach(function (d) { SETTINGS[d[0]] = d[1]; });
  var CATEGORIES = DEFAULT_CATEGORIES.map(function (r) {
    return { id: r[0], label: r[1], enabled: r[2], order: r[16] };
  });

  var MYSOKU_SAMPLE = [
    '物件種目 [住居用] マンション', '物件名 ハイツ若宮（デモ取込）', '号室名 301（3階部分）',
    '所在地 愛知県名古屋市千種区今池3丁目39-21', '〒464-0850',
    '交通', '桜通線「吹上」徒歩7分', '東山線「今池」徒歩9分',
    '建築構造 鉄筋コンクリート造 地上5階 総戸数12戸', '築年 1998年03月', '駐車場 なし',
    '設 備', '【水廻り】 バス・トイレ別・洗面台（独立） 【セキュリティ】 オートロック・TVモニター付インターホン 【その他】 エレベーター・宅配ボックス・駐輪場・専用ごみ置場',
    '条　件', '2人入居可能'
  ].join('\n');

  function blankProp(id) {
    var p = {};
    HEADERS[SHEETS.PROPERTIES].forEach(function (h) {
      p[h] = (CHECKBOX_COLUMNS[SHEETS.PROPERTIES] || []).indexOf(h) >= 0 ? false : '';
    });
    p['物件ID'] = id;
    return p;
  }
  function assign(o, patch) { Object.keys(patch).forEach(function (k) { o[k] = patch[k]; }); return o; }

  /* ---------- サンプル物件 ---------- */
  var DB = { props: [], fac: [], st: [], ac: [], out: {}, seq: 5 };

  // 1. 調査済み・確認待ち
  DB.props.push(assign(blankProp('P00002'), {
    '物件名': '名信ビル', '建物名': '名信ビル', 'ふりがな': 'めいしんびる', '号室': '6', '物件種別': 'マンション',
    '住所': '愛知県名古屋市千種区今池3丁目39-21', '郵便番号': '464-0850', 'エリア': '千種区',
    'マイソク駅1_駅名': '吹上', 'マイソク駅1_路線': '桜通線', 'マイソク駅1_徒歩分': 7,
    'マイソク駅2_駅名': '今池', 'マイソク駅2_路線': '東山線', 'マイソク駅2_徒歩分': 9,
    'マイソク駅3_駅名': '千種', 'マイソク駅3_路線': '東山線', 'マイソク駅3_徒歩分': 14,
    'バストイレ別': true, '独立洗面台': true, 'ゴミ捨て場': true,
    '建物構造': 'RC', '地上階数': 4, '地下階数': 0, '総戸数': 9, '築年': 1969, '築月': 5,
    '起点緯度': 35.164462, '起点経度': 136.933913, '起点確認済': true, 'Geocode種別': 'ROOFTOP',
    'ステータス': '調査済', '最終調査日時': '2026/11/05 10:12',
    'マイソク取込日時': '2026/11/05 10:05',
    'マイソク取込メモ': '反映: 物件名、建物名、号室、住所、物件種別、郵便番号、建物構造、地上階数、地下階数、総戸数、築年、築月、マイソク駅3件、バストイレ別、独立洗面台、ゴミ捨て場 / 要確認: 洋室の帖数を読み取れない（間取図を確認）'
  }));
  // 2. 完了（ウェルモの画面例を基にした物件）
  DB.props.push(assign(blankProp('P00003'), {
    '物件名': 'サンコーレジデンス', '建物名': 'サンコーレジデンス', 'ふりがな': 'さんこーれじでんす', '物件種別': 'マンション',
    '住所': '愛知県名古屋市天白区鴻の巣1丁目703', '郵便番号': '468-0003', 'エリア': '天白区',
    'マイソク駅1_駅名': '塩釜口', 'マイソク駅1_路線': '鶴舞線', 'マイソク駅2_駅名': '植田', 'マイソク駅2_路線': '鶴舞線',
    'マイソク駅3_駅名': '原', 'マイソク駅3_路線': '鶴舞線',
    '駐車場': true, '無料Wi-Fi': true, '自転車駐輪可能': true, 'ゴミ捨て場': true, 'その他アピール': '植田ICまで車で3分',
    '建物構造': 'RC', '地上階数': 5, '地下階数': 0, '総戸数': 9, '築年': 1988, '築月': 7,
    '起点緯度': 35.143826, '起点経度': 136.997531, '起点確認済': true, 'Geocode種別': 'ROOFTOP',
    'ステータス': '調査済', '最終調査日時': '2026/11/04 16:10', 'ウェルモ入力日時': '2026/11/04 16:16'
  }));
  // 3. 取り込み直後（位置の確認から試せる）
  DB.props.push(assign(blankProp('P00004'), {
    '物件名': 'グランシエル高岳', '建物名': 'グランシエル高岳', '物件種別': 'マンション',
    '住所': '愛知県名古屋市東区泉1丁目21-27', '郵便番号': '461-0001',
    'マイソク駅1_駅名': '高岳', 'マイソク駅1_路線': '桜通線', 'マイソク駅1_徒歩分': 4,
    'オートロック': true, 'エレベーター': true, '宅配BOX': true, 'バストイレ別': true, '最大洋室帖数': 7.5,
    '建物構造': 'RC', '地上階数': 10, '地下階数': 0, '総戸数': 40, '築年': 2006, '築月': 2,
    'マイソク取込日時': '2026/11/05 11:40',
    'マイソク取込メモ': '反映: 物件名、建物名、住所、物件種別、郵便番号、建物構造、地上階数、地下階数、総戸数、築年、築月、マイソク駅1件、オートロック、エレベーター、宅配BOX、バストイレ別、最大洋室帖数'
  }));
  var GEO = {
    'P00004': { lat: 35.177214, lng: 136.913842, type: 'RANGE_INTERPOLATED', addr: '日本、〒461-0001 愛知県名古屋市東区泉１丁目２１−２７' }
  };

  /* ---------- 架空の調査結果 ---------- */
  function rnd(seed) { var x = 0; for (var i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) % 2147483647; return function () { x = (x * 48271) % 2147483647; return x / 2147483647; }; }

  var FAKE = {
    supermarket: ['フレッシュ市場', 'まちかどスーパー', 'グリーンマート'],
    drugstore: ['あおば薬局ドラッグ', 'ヘルスプラス', 'くすりのミドリ'],
    convenience: ['デイリーステーション', 'サンライズマート', 'ハッピー24'],
    hundred_yen: ['プチプライス100'],
    mall: ['ショッピングプラザ'],
    clinic: ['さくら内科クリニック', 'みなみ内科'],
    hospital: ['市民総合病院'],
    post_office: ['郵便局'],
    park: ['中央公園'],
    chain_restaurant: ['うどん処まるや', 'バーガーステーション', '牛丼たかはし', 'ファミリーダイニング']
  };

  function makeResults(p) {
    var id = p['物件ID'];
    var r = rnd(id + p['住所']);
    var town = (String(p['住所']).match(/(?:区|市)([^\d０-９]+?)\d/) || [])[1] || '駅前';
    var now = formatJst_();
    var fac = [];
    CATEGORIES.forEach(function (c) {
      var names = FAKE[c.id] || [];
      names.forEach(function (base, i) {
        var road = Math.round(120 + r() * (c.id === 'drugstore' && i === 0 ? 1900 : 900) + i * 180);
        var walk = walkMinutes_(road, 80);
        var straight = Math.round(road * (0.7 + r() * 0.25));
        var limit = { supermarket: 10, drugstore: 10, convenience: 10, hundred_yen: 10, mall: 15, hospital: 15, park: 10, chain_restaurant: 10 }[c.id];
        var adopted = limit ? walk <= limit || i === 0 : i === 0;
        if (c.id === 'chain_restaurant') adopted = i < 3 || walk <= 10;
        var flags = [];
        if (c.id === 'clinic') flags.push('内科系の診療科か確認');
        if (c.id === 'mall') flags.push('大型ショッピングモール・商業施設に該当するか確認');
        if (c.id === 'hospital') flags.push('総合病院（複数診療科）に該当するか確認');
        if (c.id === 'park') flags.push('面積はviewport（外接矩形）による概算');
        if (c.id === 'convenience' && i === 1) { straight = road + 40; flags.push('道路距離が直線距離より短い（起点/施設の位置ずれの可能性）'); }
        var car = walk > 20 ? Math.max(3, Math.round(road / 400)) : '';
        var name = c.id === 'post_office' ? town + '郵便局' : base + ' ' + town + '店';
        if (c.id === 'park' || c.id === 'hospital' || c.id === 'clinic') name = c.id === 'park' ? town + base : base;
        fac.push({
          '物件ID': id, '実行ID': 'DEMO', 'カテゴリID': c.id, 'カテゴリ': c.label, '採否': adopted ? '採用' : '候補',
          '採用理由': adopted ? (limit && walk <= limit ? '圏内（徒歩' + limit + '分以内）' : '最寄り') : '', '順位': i + 1,
          '名称': name, 'ブランド': base, '道路距離m': road, '徒歩分': walk, '車所要分': car, '車距離m': car ? road + 200 : '',
          '直線距離m': straight, '住所': '愛知県名古屋市' + town + '（架空）', '緯度': '', '経度': '', 'place_id': 'demo-' + id + '-' + c.id + '-' + i,
          '営業状態': 'OPERATIONAL', '面積概算m2': c.id === 'park' ? 18000 : '', '要確認理由': flags.join(' / '),
          '確認済': false, '掲載': adopted && !flags.length, '備考': '', '取得日時': now
        });
      });
    });
    var st = [];
    var ms = [1, 2, 3].map(function (i) {
      return { name: p['マイソク駅' + i + '_駅名'], line: p['マイソク駅' + i + '_路線'], min: n(p['マイソク駅' + i + '_徒歩分']) };
    }).filter(function (x) { return x.name; });
    var extra = [{ name: '新栄町', line: '' }, { name: '車道', line: '' }, { name: '市役所', line: '' }];
    while (ms.length < 3) ms.push(assign({ min: null, google: true }, extra[ms.length - 1] || extra[0]));
    ms.forEach(function (m, i) {
      var road = Math.round(380 + i * 330 + r() * 200);
      var g = walkMinutes_(road, 80);
      var adopt = adoptStationMinutes_(m.min, g);
      var flags = [];
      if (adopt.from.indexOf('Google') === 0) flags.push('駅の座標は代表点。駅出入口までの距離か地図で確認');
      if (!m.line) flags.push('路線を入力（複数路線の場合は利用者の多い路線）');
      st.push({
        '物件ID': id, '実行ID': 'DEMO', '枠': i + 1, '出典': m.google ? 'Google' : 'マイソク', '駅名': m.name + (m.google ? '駅' : ''), '路線': m.line || '',
        'マイソク徒歩分': m.min == null ? '' : m.min, '道路距離m': road, 'Google徒歩分': g, '採用徒歩分': adopt.minutes, '採用元': adopt.from,
        '代替手段': '', '代替所要分': '', '代替距離m': '', '代替有料道路': '', '代替詳細': '',
        '要確認理由': flags.join(' / '), '確認済': false, '備考': '', 'place_id': 'demo-st-' + i, '緯度': '', '経度': '', '取得日時': now
      });
    });
    var ac = [
      { '種別': 'バス停', '名称': town, '運行会社': '', '道路距離m': 210, '徒歩分': 3, '採用': true, '要確認理由': '運行会社（○○バス）を入力', 'place_id': 'demo-bs-1' },
      { '種別': 'バス停', '名称': town + '二丁目', '運行会社': '', '道路距離m': 390, '徒歩分': 5, '採用': false, '要確認理由': '', 'place_id': 'demo-bs-2' },
      { '種別': '空港', '名称': '中部国際空港', '車所要分': 41, '車距離m': 47200, '有料道路': 'あり', '採用': false, '詳細': '出発 03:00想定 / 道路距離47.2km / 有料道路利用', '要確認理由': '' },
      { '種別': '空港', '名称': '県営名古屋空港', '車所要分': 22, '車距離m': 13100, '有料道路': 'あり', '採用': true, '詳細': '出発 03:00想定 / 道路距離13.1km / 有料道路利用', '要確認理由': '' }
    ].map(function (x) { return assign({ '物件ID': id, '実行ID': 'DEMO', '確認済': false, '備考': '', '車所要分': '', '車距離m': '', '有料道路': '', '詳細': '', '取得日時': now }, x); });
    return { fac: fac, st: st, ac: ac };
  }

  function n(v) { return toNum_(v); }
  function rowsOf(list, id) { return list.filter(function (r) { return r['物件ID'] === id; }); }
  function setResults(id, res) {
    DB.fac = DB.fac.filter(function (r) { return r['物件ID'] !== id; }).concat(res.fac);
    DB.st = DB.st.filter(function (r) { return r['物件ID'] !== id; }).concat(res.st);
    DB.ac = DB.ac.filter(function (r) { return r['物件ID'] !== id; }).concat(res.ac);
  }
  function regen(id) {
    var p = findProp(id);
    if (!rowsOf(DB.fac, id).length) { delete DB.out[id]; return; }
    DB.out[id] = buildOutputRow_(p, rowsOf(DB.fac, id), rowsOf(DB.st, id), rowsOf(DB.ac, id), CATEGORIES, SETTINGS);
  }
  function findProp(id) {
    var p = DB.props.filter(function (x) { return x['物件ID'] === id; })[0];
    if (!p) throw new Error('物件（' + id + '）が見つかりません');
    return p;
  }
  function stage(p) {
    var f = rowsOf(DB.fac, p['物件ID']), s = rowsOf(DB.st, p['物件ID']), a = rowsOf(DB.ac, p['物件ID']);
    var pending = countUnconfirmed_(f, s, a);
    var has = f.length + s.length + a.length > 0;
    if (!String(p['住所'] || '').trim()) return { stage: 1, label: '物件情報の入力待ち', pending: pending };
    if (!bool_(p['起点確認済'])) return { stage: 2, label: '位置の確認待ち', pending: pending };
    if (!has || p['ステータス'] === '要再調査') return { stage: 3, label: '調査待ち', pending: pending };
    if (pending > 0) return { stage: 4, label: '確認が' + pending + '件残っています', pending: pending };
    if (p['ウェルモ入力日時']) return { stage: 5, label: 'ウェルモ入力済（' + p['ウェルモ入力日時'] + '）', pending: pending };
    return { stage: 5, label: 'ウェルモ入力の準備ができました', pending: pending };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // サンプルの初期結果
  setResults('P00002', makeResults(DB.props[0]));
  (function () {
    var res = makeResults(DB.props[1]);
    var real = [['supermarket', 'アミカ 高針店', 520], ['supermarket', 'イオンスタイル高針原', 540], ['supermarket', 'フィールRISE やき山店', 610]];
    res.fac = res.fac.filter(function (r) { return r['カテゴリID'] !== 'supermarket'; });
    real.forEach(function (x, i) {
      res.fac.unshift({ '物件ID': 'P00003', '実行ID': 'DEMO', 'カテゴリID': x[0], 'カテゴリ': 'スーパー', '採否': '採用', '採用理由': '圏内（徒歩10分以内）', '順位': 3 - i,
        '名称': x[1], 'ブランド': x[1], '道路距離m': x[2], '徒歩分': walkMinutes_(x[2], 80), '車所要分': '', '車距離m': '', '直線距離m': Math.round(x[2] * 0.8),
        '住所': '', 'place_id': 'demo-p3-s' + i, '営業状態': 'OPERATIONAL', '要確認理由': '', '確認済': false, '掲載': true, '取得日時': '2026/11/04 16:10' });
    });
    res.st.forEach(function (s, i) {
      var road = [2500, 1950, 2300][i];
      assign(s, { '出典': 'マイソク', '駅名': ['塩釜口', '植田', '原'][i], '路線': '名古屋市鶴舞線', '道路距離m': road * 1.1, 'Google徒歩分': 34 + i, 'マイソク徒歩分': 36 + i,
        '採用徒歩分': 34 + i, '採用元': 'Google（マイソクより短い）', '代替手段': 'バス', '代替所要分': [26, 24, 25][i],
        '代替詳細': '出発 10:00想定 / 名古屋市交通局 「植田大久手」→「' + ['塩釜口', '植田', '原'][i] + '」 / 徒歩区間を含む', '要確認理由': '' });
    });
    res.ac[0]['名称'] = '植田大久手'; res.ac[0]['運行会社'] = '名古屋市営バス'; res.ac[0]['徒歩分'] = 4;
    res.ac[3]['車所要分'] = 24;
    [res.fac, res.st, res.ac].forEach(function (list) { list.forEach(function (r) { r['確認済'] = true; if (r['採否'] === '採用') r['掲載'] = true; }); });
    setResults('P00003', res);
  })();
  regen('P00002'); regen('P00003');

  /* ---------- 地図（デモ用の簡易地図。実際は Google Maps Static API） ---------- */
  function demoMap(lat, lng, zoom) {
    var W = 640, H = 400, s = 256 * Math.pow(2, zoom);
    var proj = function (la, ln) { var sin = Math.sin(la * Math.PI / 180); return { x: (ln + 180) / 360 * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s }; };
    var c = proj(lat, lng);
    var px = function (la, ln) { var p = proj(la, ln); return { x: p.x - c.x + W / 2, y: p.y - c.y + H / 2 }; };
    var step = 0.0008, svg = [];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W * 2 + '" height="' + H * 2 + '" viewBox="0 0 ' + W + ' ' + H + '">');
    svg.push('<rect width="' + W + '" height="' + H + '" fill="#ece8df"/>');
    var tl = { lat: lat + 0.01, lng: lng - 0.012 };
    var lat0 = Math.floor(lat / step) * step, lng0 = Math.floor(lng / step) * step;
    for (var i = -14; i <= 14; i++) {
      for (var j = -14; j <= 14; j++) {
        var a = px(lat0 + i * step, lng0 + j * step), bb = px(lat0 + (i + 1) * step, lng0 + (j + 1) * step);
        var hue = (Math.abs(i * 7 + j * 13) % 9 === 0) ? '#cfe5c4' : '#f8f6f1';
        svg.push('<rect x="' + (Math.min(a.x, bb.x) + 3) + '" y="' + (Math.min(a.y, bb.y) + 3) + '" width="' + Math.max(0, Math.abs(bb.x - a.x) - 6) + '" height="' + Math.max(0, Math.abs(bb.y - a.y) - 6) + '" fill="' + hue + '" stroke="#d9d3c6"/>');
        if (zoom >= 18 && Math.abs(i) < 8 && Math.abs(j) < 8 && (i + j) % 2 === 0) {
          var cx = (a.x + bb.x) / 2, cy = (a.y + bb.y) / 2, w = Math.abs(bb.x - a.x) * 0.3, h = Math.abs(bb.y - a.y) * 0.3;
          svg.push('<rect x="' + (cx - w) + '" y="' + (cy - h) + '" width="' + w * 1.6 + '" height="' + h * 1.4 + '" fill="#e2dccf" stroke="#cbc3b2"/>');
        }
      }
    }
    var main = px(lat0 + 2 * step, lng0), main2 = px(lat0, lng0 - 3 * step);
    svg.push('<rect x="0" y="' + (main.y - 6) + '" width="' + W + '" height="12" fill="#ffe08a" stroke="#e8c45a"/>');
    svg.push('<rect x="' + (main2.x - 6) + '" y="0" width="12" height="' + H + '" fill="#ffffff" stroke="#d9d3c6"/>');
    svg.push('<text x="12" y="' + (H - 12) + '" font-size="12" fill="#8a8170" font-family="sans-serif">デモ用の簡易地図（実際はGoogleマップ）</text>');
    svg.push('</svg>');
    void tl;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.join(''));
  }

  /* ---------- API ---------- */
  var api = {
    api_bootstrap: function () {
      var details = {};
      DB.props.forEach(function (p) { details[p['物件ID']] = api.api_getProperty(p['物件ID']); });
      return { list: api.api_listProperties(), details: details, status: { hasApiKey: true } };
    },
    api_surveyPart: function (id, part) {
      if (part === 'plan') {
        var parts = CATEGORIES.slice().sort(function (a, b) { return a.order - b.order; }).map(function (c) { return { part: 'fac:' + c.id, label: c.label }; });
        parts.push({ part: 'stations', label: '最寄り駅' }, { part: 'access', label: 'バス停・空港' }, { part: 'finish', label: '結果のまとめ' });
        return { runId: 'DEMO', parts: parts };
      }
      if (part === 'finish') { var r = api.api_runSurvey(id); return { ok: true, data: r.data }; }
      return { ok: true, apiCalls: 2 };
    },
    api_status: function () { return { hasApiKey: true, webAppUrl: '', spreadsheetUrl: '' }; },
    api_setApiKey: function () { return { hasApiKey: true }; },
    api_listProperties: function () {
      return DB.props.map(function (p) {
        var s = stage(p);
        return { id: p['物件ID'], name: p['建物名'] || p['物件名'], address: p['住所'], stage: s.stage, stageLabel: s.label, pending: s.pending,
          wellmoAt: p['ウェルモ入力日時'] || '', updated: p['最終調査日時'] || p['マイソク取込日時'] };
      });
    },
    api_getProperty: function (id) {
      var p = findProp(id), s = stage(p);
      return {
        prop: clone(p), facilities: clone(rowsOf(DB.fac, id)), stations: clone(rowsOf(DB.st, id)), access: clone(rowsOf(DB.ac, id)),
        output: DB.out[id] ? clone(DB.out[id]) : null,
        categories: CATEGORIES.map(function (c) { return { id: c.id, label: c.label, order: c.order }; }),
        stage: s.stage, stageLabel: s.label, pending: s.pending,
        config: { titleMax: 60, welmoLimit: 30, hasApiKey: true, webAppUrl: 'https://script.google.com/macros/s/（デモ）/exec', mapsBrowserKey: window.DEMO_MAPS_KEY || '' }
      };
    },
    api_saveProperty: function (id, patch) {
      var p = findProp(id);
      if ('住所' in patch && String(patch['住所']) !== String(p['住所']) && p['起点緯度'] !== '') {
        assign(patch, { '起点緯度': '', '起点経度': '', '起点確認済': false, 'ステータス': rowsOf(DB.fac, id).length ? '要再調査' : '' });
        delete GEO[id];
      }
      assign(p, patch);
      if (DB.out[id]) regen(id);
      return api.api_getProperty(id);
    },
    api_uploadMysoku: function (fileName) {
      var name = String(fileName || '').replace(/\.pdf$/i, '');
      var id = 'P' + ('0000' + (++DB.seq)).slice(-5);
      var p = blankProp(id);
      p['マイソクPDF'] = fileName;
      DB.props.push(p);
      var r = mysokuPatch_(p, parseMysokuText_(MYSOKU_SAMPLE.replace('ハイツ若宮（デモ取込）', 'ハイツ若宮（' + (name || 'デモ取込') + '）')));
      assign(p, r.patch);
      p['マイソク取込日時'] = formatJst_();
      p['マイソク取込メモ'] = 'デモのため、選んだPDFではなくサンプルの内容を読み取りました / 反映: ' + r.filled.join('、');
      return { id: id, filled: r.filled, notes: [] };
    },
    api_deleteProperty: function (id) {
      findProp(id);
      DB.props = DB.props.filter(function (p) { return p['物件ID'] !== id; });
      ['fac', 'st', 'ac'].forEach(function (k) { DB[k] = DB[k].filter(function (r) { return r['物件ID'] !== id; }); });
      delete DB.out[id];
      return { ok: true, trashedPdf: true };
    },
    api_reimportMysoku: function (id) { return { filled: [], skipped: [], data: api.api_getProperty(id) }; },
    api_createProperty: function (name) {
      var id = 'P' + ('0000' + (++DB.seq)).slice(-5);
      DB.props.push(assign(blankProp(id), { '物件名': name, '建物名': name }));
      return { id: id };
    },
    api_locate: function (id) {
      var p = findProp(id);
      var warnings = [];
      if (n(p['起点緯度']) == null) {
        if (!p['住所']) throw new Error('住所が入力されていません。「物件情報」で住所を入力してください。');
        var g = GEO[id] || { lat: 35.1657 + Math.random() * 0.004, lng: 136.9352 + Math.random() * 0.004, type: 'ROOFTOP', addr: '日本、' + p['住所'] };
        assign(p, { '起点緯度': Math.round(g.lat * 1e6) / 1e6, '起点経度': Math.round(g.lng * 1e6) / 1e6, 'Geocode種別': g.type, 'Geocode住所': g.addr,
          'エリア': p['エリア'] || areaFromGeocode_([], g.addr, { wardCities: ['名古屋市'] }) });
      }
      if (p['Geocode種別'] && p['Geocode種別'] !== 'ROOFTOP') warnings.push('住所から求めた位置の精度が建物単位ではありません（' + p['Geocode種別'] + '）');
      return { lat: n(p['起点緯度']), lng: n(p['起点経度']), confirmed: bool_(p['起点確認済']), geocodedAddress: p['Geocode住所'], warnings: warnings };
    },
    api_mapImage: function (lat, lng, zoom) {
      return { dataUrl: demoMap(lat, lng, zoom), lat: lat, lng: lng, zoom: zoom, width: 640, height: 400 };
    },
    api_confirmOrigin: function (id, lat, lng) {
      var p = findProp(id);
      var moved = n(p['起点緯度']) !== lat || n(p['起点経度']) !== lng;
      assign(p, { '起点緯度': lat, '起点経度': lng, '起点確認済': true });
      if (moved && rowsOf(DB.fac, id).length) p['ステータス'] = '要再調査';
      return api.api_getProperty(id);
    },
    api_runSurvey: function (id) {
      var p = findProp(id);
      var old = { fac: rowsOf(DB.fac, id), st: rowsOf(DB.st, id), ac: rowsOf(DB.ac, id) };
      var res = makeResults(p);
      // 本番と同じく、担当者の入力は引き継ぐ
      res.fac.forEach(function (r) { var o = old.fac.filter(function (x) { return x['place_id'] === r['place_id']; })[0]; if (o) { r['掲載'] = o['掲載']; r['確認済'] = o['確認済']; } });
      res.st.forEach(function (r) { var o = old.st.filter(function (x) { return x['枠'] === r['枠']; })[0]; if (o && !r['路線']) r['路線'] = o['路線']; });
      res.ac.forEach(function (r) { var o = old.ac.filter(function (x) { return x['place_id'] && x['place_id'] === r['place_id']; })[0]; if (o) r['運行会社'] = o['運行会社']; });
      setResults(id, res);
      assign(p, { 'ステータス': '調査済', '最終調査日時': formatJst_(), 'メッセージ': '結果の「要確認」を確認し、掲載する施設を選んでください。' });
      regen(id);
      return { status: '調査済', message: p['メッセージ'] + '（デモ：架空のサンプル結果です）', apiCalls: 0, data: api.api_getProperty(id) };
    },
    api_updateResult: function (kind, id, key, patch) {
      var list = kind === 'facility' ? DB.fac : kind === 'station' ? DB.st : DB.ac;
      var keyOf = kind === 'facility' ? function (r) { return r['カテゴリID'] + '|' + (r['place_id'] || r['採否']); }
        : kind === 'station' ? function (r) { return String(r['枠']); } : function (r) { return r['種別'] + '|' + (r['place_id'] || r['名称']); };
      var row = list.filter(function (r) { return r['物件ID'] === id && keyOf(r) === key; })[0];
      if (!row) throw new Error('対象の行が見つかりません');
      assign(row, patch);
      if (kind === 'access' && patch['採用'] === true) list.forEach(function (r) { if (r !== row && r['物件ID'] === id && r['種別'] === row['種別']) r['採用'] = false; });
      regen(id);
      return api.api_getProperty(id);
    }
  };

  var DELAY = { api_runSurvey: 2600, api_surveyPart: 280, api_bootstrap: 400, api_uploadMysoku: 1400, api_locate: 500, api_mapImage: 300 };
  window.DEMO_BACKEND = {
    call: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(clone(api[fn].apply(null, args))); } catch (e) { reject(e); }
        }, DELAY[fn] || 160);
      });
    }
  };
})();
