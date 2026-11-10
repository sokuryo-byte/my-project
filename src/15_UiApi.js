/**
 * 15_UiApi.js
 * アプリ画面（App.html）から google.script.run で呼ばれる関数。
 * 戻り値は画面でそのまま使える素のオブジェクト（Date は文字列に変換）にする。
 */

var APP_TITLE = 'マンスリー周辺調査';

/** スプレッドシートのメニューから開く（大きめのダイアログ） */
function menuOpenApp() {
  var html = HtmlService.createHtmlOutputFromFile('App').setWidth(1360).setHeight(860).setTitle(APP_TITLE);
  SpreadsheetApp.getUi().showModelessDialog(html, APP_TITLE);
}

/**
 * ウェブアプリとして開く（ブラウザのタブ全体を使える。推奨）。
 * ?api=… のときはウェルモ自動入力（Tampermonkey）向けのJSONを返す。
 */
function doGet(e) {
  var api = e && e.parameter ? e.parameter.api : '';
  if (api) return wellmoApi_(api, e.parameter);
  return HtmlService.createHtmlOutputFromFile('App')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * ウェルモ自動入力からの呼び出し。
 *  wellmo-list : 入力できる物件（確認まで進んだ物件）の一覧
 *  wellmo-data : 1物件分のウェルモ入力データ
 *  wellmo-mark : ウェルモで保存されたことを記録
 * ウェブアプリのアクセス権（組織内のユーザー）で保護される。
 */
function wellmoApi_(api, p) {
  var body;
  try {
    if (api === 'wellmo-list') {
      body = { ok: true, items: api_listProperties().filter(function (it) { return it.stage >= 4; }) };
    } else if (api === 'wellmo-data') {
      var out = rowsOf_(SHEETS.OUTPUT, p.id)[0];
      if (!out || !out['ウェルモJSON']) throw new Error('この物件はまだ出力ができていません。周辺調査アプリで調査を済ませてください。');
      var prop = findProp_(p.id);
      body = { ok: true, id: p.id, name: String(prop['建物名'] || prop['物件名'] || ''), data: JSON.parse(out['ウェルモJSON']),
        pending: toNum_(out['未確認の要確認件数']) || 0 };
    } else if (api === 'wellmo-mark') {
      updateRow_(SHEETS.PROPERTIES, findProp_(p.id)._row, { 'ウェルモ入力日時': formatJst_() });
      appendLog_('', p.id, 'ウェルモ入力', '保存', 0, '');
      body = { ok: true };
    } else {
      throw new Error('不明な要求です: ' + api);
    }
  } catch (err) {
    body = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- 共通 ---------------- */

function plain_(v) {
  return v instanceof Date ? formatJst_(v) : v;
}

function plainRow_(r) {
  var o = {};
  Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = plain_(r[k]); });
  return o;
}

function findProp_(id) {
  var p = readTable_(SHEETS.PROPERTIES).rows.filter(function (r) { return String(r['物件ID']) === String(id); })[0];
  if (!p) throw new Error('物件（' + id + '）が見つかりません。一覧を更新してください。');
  return p;
}

function rowsOf_(sheetName, id) {
  return readTable_(sheetName).rows.filter(function (r) { return String(r['物件ID']) === String(id); });
}

/** 作業段階（1:情報 2:位置 3:調査 4:確認 5:出力） */
function stageOf_(p, hasResults, pending) {
  if (!String(p['住所'] || '').trim()) return { stage: 1, label: '物件情報の入力待ち' };
  if (!bool_(p['起点確認済'])) return { stage: 2, label: '位置の確認待ち' };
  if (!hasResults || p['ステータス'] === '要再調査') return { stage: 3, label: '調査待ち' };
  if (pending > 0) return { stage: 4, label: '確認が' + pending + '件残っています' };
  if (plain_(p['ウェルモ入力日時'])) return { stage: 5, label: 'ウェルモ入力済（' + plain_(p['ウェルモ入力日時']) + '）', entered: true };
  return { stage: 5, label: 'ウェルモ入力の準備ができました' };
}

/** 物件IDが空の行に採番する */
/** IDのない行にIDを振る。振り直しがなければ読んだ表をそのまま返す（読み直しを省く） */
function ensureIds_() {
  var t = readTable_(SHEETS.PROPERTIES), changed = false;
  t.rows.forEach(function (p) {
    if (!String(p['物件ID'] || '').trim() && (p['住所'] || p['マイソクPDF'] || p['建物名'] || p['物件名'])) {
      updateRow_(SHEETS.PROPERTIES, p._row, { '物件ID': 'P' + ('0000' + p._row).slice(-5) });
      changed = true;
    }
  });
  return changed ? readTable_(SHEETS.PROPERTIES) : t;
}

/**
 * 画面でGoogleマップ（Maps JavaScript API）を表示するためのキー。
 * サーバー用のキーとは別に作り、「ウェブサイト（HTTPリファラー）」で *.googleusercontent.com に制限する。
 * スクリプト プロパティ MAPS_BROWSER_KEY に登録すると、地図がドラッグ・ピンのドラッグ対応のGoogleマップになる。
 */
function mapsBrowserKey_() {
  return PropertiesService.getScriptProperties().getProperty('MAPS_BROWSER_KEY') || '';
}

function webAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/** アプリ起動時の状態（APIキーの有無など） */
function api_status() {
  migrate_();
  return {
    hasApiKey: !!(PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_API_KEY) || BOOTSTRAP.apiKey),
    webAppUrl: webAppUrl_(),
    spreadsheetUrl: ss_().getUrl()
  };
}

/** 画面からAPIキーを登録する */
function api_setApiKey(key) {
  var k = String(key || '').trim();
  if (!/^AIza[0-9A-Za-z_\-]{30,}$/.test(k)) throw new Error('APIキーの形式が正しくありません（「AIza」で始まる文字列です）');
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROP_API_KEY, k);
  return api_status();
}

/* ---------------- 自動更新（シートの列・カテゴリ設定） ---------------- */

/**
 * プログラム更新後に必要なシートの変更を、アプリを開いたときに1回だけ行う。
 * - 新しい列・設定キーの追加（既存のデータは動かさない）
 * - カテゴリ設定の版が上がっていたら「カテゴリ設定」「チェーン辞書」を初期値で書き直す
 */
var SCHEMA_VERSION = 3;
function migrate_() {
  var props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty('SCHEMA_VERSION') || 0) >= SCHEMA_VERSION) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    setupSheets_();
    var settings = loadSettings_();
    if ((toNum_(settings.categories_version) || 0) < CATEGORIES_VERSION) {
      var cat = sheet_(SHEETS.CATEGORIES);
      cat.clearContents();
      var ch = HEADERS[SHEETS.CATEGORIES];
      cat.getRange(1, 1, 1, ch.length).setValues([ch]).setFontWeight('bold').setBackground('#e8eaed');
      cat.getRange(2, 1, DEFAULT_CATEGORIES.length, ch.length).setValues(DEFAULT_CATEGORIES);
      var br = sheet_(SHEETS.BRANDS);
      br.clearContents();
      br.getRange(1, 1, 1, 3).setValues([HEADERS[SHEETS.BRANDS]]).setFontWeight('bold').setBackground('#e8eaed');
      br.getRange(2, 1, DEFAULT_BRANDS.length, 3).setValues(DEFAULT_BRANDS);
      var t = readTable_(SHEETS.SETTINGS);
      var row = t.rows.filter(function (r) { return r['キー'] === 'categories_version'; })[0];
      if (row) updateRow_(SHEETS.SETTINGS, row._row, { '値': String(CATEGORIES_VERSION) });
    }
    CacheService.getScriptCache().removeAll(['ui_settings_v1', 'ui_categories_v1']);
    props.setProperty('SCHEMA_VERSION', String(SCHEMA_VERSION));
  } finally {
    lock.releaseLock();
  }
}

/**
 * アプリ起動時に1回だけ呼ぶ：一覧と、全物件の詳細をまとめて返す（各シートを1回ずつ読むだけ）。
 * 以降、物件をクリックしたときはすぐに表示できる。
 */
function api_bootstrap() {
  migrate_();
  var props = ensureIds_().rows.filter(function (p) { return String(p['物件ID'] || '').trim(); });
  var group = function (name) {
    var m = {};
    readTable_(name).rows.forEach(function (r) { var k = String(r['物件ID']); (m[k] = m[k] || []).push(plainRow_(r)); });
    return m;
  };
  var fac = group(SHEETS.FACILITIES), st = group(SHEETS.STATIONS), ac = group(SHEETS.ACCESS), out = group(SHEETS.OUTPUT);
  var settings = loadSettings_();
  var categories = loadCategories_().filter(function (c) { return c.enabled; }).map(function (c) { return { id: c.id, label: c.label, order: c.order }; });
  var config = {
    titleMax: toNum_(settings.title_max_length) || 60,
    welmoLimit: toNum_(settings.welmo_walk_limit_min) || 30,
    hasApiKey: !!(PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_API_KEY) || BOOTSTRAP.apiKey),
    webAppUrl: webAppUrl_(),
    mapsBrowserKey: mapsBrowserKey_()
  };
  var list = [], details = {};
  props.forEach(function (p) {
    var id = String(p['物件ID']);
    var f = fac[id] || [], s = st[id] || [], a = ac[id] || [];
    var pending = countUnconfirmed_(f, s, a);
    var stg = stageOf_(p, f.length + s.length + a.length > 0, pending);
    list.push({ id: id, name: String(p['建物名'] || p['物件名'] || ''), address: String(p['住所'] || ''), stage: stg.stage, stageLabel: stg.label,
      pending: pending, wellmoAt: String(plain_(p['ウェルモ入力日時']) || ''), updated: plain_(p['最終調査日時'] || p['マイソク取込日時'] || '') });
    details[id] = { prop: plainRow_(p), facilities: f, stations: s, access: a, output: (out[id] || [])[0] || null,
      categories: categories, stage: stg.stage, stageLabel: stg.label, pending: pending, config: config };
  });
  return { list: list, details: details, status: { hasApiKey: config.hasApiKey } };
}

/* ---------------- 調査（工程ごとに分けて実行し、画面で進み具合を出す） ---------------- */

/**
 * 調査の1工程を実行する。画面から順番に呼ぶ。
 *  'plan'      … 工程の一覧を返す
 *  'fac:<ID>'  … そのカテゴリの周辺施設
 *  'stations'  … 最寄り駅
 *  'access'    … バス停・空港
 *  'finish'    … 状態を「調査済」にして出力を作る
 */
function api_surveyPart(id, part, runId) {
  var ctx = buildContext_();
  var p = findProp_(id);
  ctx.propertyId = String(id);
  ctx.propertyAddress = String(p['住所'] || '');
  ctx.runId = runId || makeRunId_();
  var lat = toNum_(p['起点緯度']), lng = toNum_(p['起点経度']);
  if (part === 'plan') {
    if (lat == null || lng == null || !bool_(p['起点確認済'])) throw new Error('位置が確定していません。「位置」の手順で建物の出入口を確定してください。');
    var parts = ctx.categories.filter(function (c) { return c.enabled; }).sort(function (a, b) { return a.order - b.order; })
      .map(function (c) { return { part: 'fac:' + c.id, label: c.label }; });
    parts.push({ part: 'stations', label: '最寄り駅' }, { part: 'access', label: 'バス停・空港' }, { part: 'finish', label: '結果のまとめ' });
    return { runId: ctx.runId, parts: parts };
  }
  var origin = { lat: lat, lng: lng };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ほかの調査が実行中です。少し待ってからもう一度押してください。');
  try {
    if (part.indexOf('fac:') === 0) {
      var catId = part.slice(4);
      var cat = ctx.categories.filter(function (c) { return c.id === catId; })[0];
      if (!cat) throw new Error('カテゴリが見つかりません: ' + catId);
      var rows;
      try { rows = surveyCategory_(ctx, cat, origin); } catch (e) {
        rows = [{ '物件ID': ctx.propertyId, '実行ID': ctx.runId, 'カテゴリID': cat.id, 'カテゴリ': cat.label, '採否': 'エラー',
          '要確認理由': 'API取得エラー: ' + e.message, '確認済': false, '掲載': false, '取得日時': formatJst_() }];
      }
      replacePropertyRows_(SHEETS.FACILITIES, id, rows,
        function (r) { return r['物件ID'] + '|' + r['カテゴリID'] + '|' + r['place_id']; }, ['確認済', '掲載', '備考'],
        function (r) { return r['カテゴリID'] === catId; });
      return { ok: true, count: rows.filter(function (r) { return r['採否'] === '採用'; }).length, apiCalls: ctx.apiCalls };
    }
    if (part === 'stations') {
      replacePropertyRows_(SHEETS.STATIONS, id, surveyStations_(ctx, p, origin),
        function (r) { return r['物件ID'] + '|' + normStationName_(r['駅名']); }, ['路線', '確認済', '備考']);
      return { ok: true, apiCalls: ctx.apiCalls };
    }
    if (part === 'access') {
      replacePropertyRows_(SHEETS.ACCESS, id, surveyBusStop_(ctx, origin).concat(surveyAirports_(ctx, origin)),
        function (r) { return r['物件ID'] + '|' + r['種別'] + '|' + (r['place_id'] || r['名称']); }, ['運行会社', '確認済', '備考']);
      return { ok: true, apiCalls: ctx.apiCalls };
    }
    if (part === 'finish') {
      // 無効にしたカテゴリの古い結果は消す
      var enabled = ctx.categories.filter(function (c) { return c.enabled; }).map(function (c) { return c.id; });
      replacePropertyRows_(SHEETS.FACILITIES, id, [], function () { return ''; }, [], function (r) { return enabled.indexOf(r['カテゴリID']) < 0; });
      updateRow_(SHEETS.PROPERTIES, p._row, { 'ステータス': '調査済', '最終調査日時': formatJst_(), 'メッセージ': '結果の「要確認」を確認し、掲載する施設を選んでください。' });
      regenerateOutput_(id);
      appendLog_(ctx.runId, id, '調査', '調査済', 0, '画面から工程ごとに実行');
      return { ok: true, data: api_getProperty(id) };
    }
    throw new Error('不明な工程です: ' + part);
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- 一覧・詳細 ---------------- */

function api_listProperties() {
  ensureIds_();
  var fac = readTable_(SHEETS.FACILITIES).rows;
  var st = readTable_(SHEETS.STATIONS).rows;
  var ac = readTable_(SHEETS.ACCESS).rows;
  var by = function (rows, id) { return rows.filter(function (r) { return String(r['物件ID']) === String(id); }); };
  return readTable_(SHEETS.PROPERTIES).rows.filter(function (p) { return String(p['物件ID'] || '').trim(); }).map(function (p) {
    var f = by(fac, p['物件ID']);
    var s = by(st, p['物件ID']);
    var a = by(ac, p['物件ID']);
    var pending = countUnconfirmed_(f, s, a);
    var stg = stageOf_(p, f.length + s.length + a.length > 0, pending);
    return {
      id: String(p['物件ID']),
      name: String(p['建物名'] || p['物件名'] || ''),
      address: String(p['住所'] || ''),
      stage: stg.stage,
      stageLabel: stg.label,
      pending: pending,
      wellmoAt: String(plain_(p['ウェルモ入力日時']) || ''),
      updated: plain_(p['最終調査日時'] || p['マイソク取込日時'] || '')
    };
  });
}

/** 変更の少ない設定は少しの間キャッシュして、画面の表示を速くする（調査処理は常に最新を読む） */
function cachedJson_(key, seconds, fn) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* 読み直す */ } }
  var v = fn();
  try { cache.put(key, JSON.stringify(v), seconds); } catch (e) { /* 大きすぎる場合はキャッシュしない */ }
  return v;
}

function api_getProperty(id) {
  var p = findProp_(id);
  var f = rowsOf_(SHEETS.FACILITIES, id);
  var s = rowsOf_(SHEETS.STATIONS, id);
  var a = rowsOf_(SHEETS.ACCESS, id);
  var out = rowsOf_(SHEETS.OUTPUT, id)[0];
  var settings = cachedJson_('ui_settings_v1', 120, loadSettings_);
  var pending = countUnconfirmed_(f, s, a);
  var stg = stageOf_(p, f.length + s.length + a.length > 0, pending);
  return {
    prop: plainRow_(p),
    facilities: f.map(plainRow_),
    stations: s.map(plainRow_),
    access: a.map(plainRow_),
    output: out ? plainRow_(out) : null,
    categories: cachedJson_('ui_categories_v1', 120, function () {
      return loadCategories_().filter(function (c) { return c.enabled; })
        .map(function (c) { return { id: c.id, label: c.label, order: c.order }; });
    }),
    stage: stg.stage,
    stageLabel: stg.label,
    pending: pending,
    config: {
      titleMax: toNum_(settings.title_max_length) || 60,
      welmoLimit: toNum_(settings.welmo_walk_limit_min) || 30,
      hasApiKey: !!PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_API_KEY),
      webAppUrl: webAppUrl_(),
      mapsBrowserKey: mapsBrowserKey_()
    }
  };
}

/* ---------------- 物件情報の編集 ---------------- */

var UI_EDITABLE_EXCLUDE = ['物件ID', 'ステータス', '最終調査日時', 'メッセージ', 'ウェルモ入力日時', 'マイソク取込日時', 'マイソク取込メモ',
  'Geocode種別', 'Geocode部分一致', 'Geocode住所', 'Googleマップ', '起点緯度', '起点経度', '起点確認済'];

function api_saveProperty(id, patch) {
  var p = findProp_(id);
  var allowed = HEADERS[SHEETS.PROPERTIES].filter(function (h) { return UI_EDITABLE_EXCLUDE.indexOf(h) < 0; });
  var clean = {};
  Object.keys(patch || {}).forEach(function (k) {
    if (allowed.indexOf(k) >= 0) clean[k] = patch[k];
  });
  // エリア・ふりがなが空なら、所在地・建物名から自動で入れる
  var settings = loadSettings_();
  var addr = '住所' in clean ? clean['住所'] : p['住所'];
  if (addr && !String(('エリア' in clean ? clean['エリア'] : p['エリア']) || '').trim()) {
    var area = areaFromAddress_(addr, { wardCities: splitList_(settings.title_ward_cities), otherStyle: nfkc_(settings.title_area_other_style).trim() });
    if (area) clean['エリア'] = area;
  }
  var bname = '建物名' in clean ? clean['建物名'] : p['建物名'];
  if (bname && !String(('ふりがな' in clean ? clean['ふりがな'] : p['ふりがな']) || '').trim()) {
    var kana = kanaFromName_(bname);
    if (kana) clean['ふりがな'] = kana;
  }
  // 住所が変わったら起点をやり直す
  if ('住所' in clean && String(clean['住所']) !== String(p['住所']) && p['起点緯度'] !== '') {
    clean['起点緯度'] = '';
    clean['起点経度'] = '';
    clean['起点確認済'] = false;
    clean['ステータス'] = '要再調査';
    clean['メッセージ'] = '住所が変更されたため、位置の確認からやり直してください。';
  }
  updateRow_(SHEETS.PROPERTIES, p._row, clean);
  if (rowsOf_(SHEETS.OUTPUT, id).length) regenerateOutput_(id);
  return api_getProperty(id);
}

/* ---------------- 削除 ---------------- */

/**
 * 物件を削除する。物件の行と、調査結果・出力の行を消す。
 * マイソクPDFはGoogleドライブのゴミ箱へ（30日間は元に戻せる）。
 */
function api_deleteProperty(id) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('ほかの処理が実行中です。少し待ってからもう一度押してください。');
  try {
    var p = findProp_(id);
    var fileId = driveFileId_(p['マイソクPDF']);
    var none = function () { return ''; };
    [SHEETS.FACILITIES, SHEETS.STATIONS, SHEETS.ACCESS, SHEETS.OUTPUT].forEach(function (name) {
      replacePropertyRows_(name, id, [], none, []);
    });
    sheet_(SHEETS.PROPERTIES).deleteRow(p._row);
    var trashed = false;
    if (fileId) {
      try { DriveApp.getFileById(fileId).setTrashed(true); trashed = true; } catch (e) { /* 見つからない・権限なしは無視 */ }
    }
    appendLog_('', id, '削除', '完了', 0, (p['建物名'] || p['物件名'] || '') + (trashed ? '（マイソクPDFはゴミ箱へ）' : ''));
    return { ok: true, trashedPdf: trashed };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- マイソク ---------------- */

/** 画面からアップロードされたPDFを保存し、物件を作って取り込む */
function api_uploadMysoku(fileName, base64) {
  var settings = loadSettings_();
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', fileName || 'マイソク.pdf');
  var folderSetting = String(settings.mysoku_folder_id || '');
  var m = folderSetting.match(/folders\/([-\w]{20,})/);
  var folderId = m ? m[1] : folderSetting.trim();
  var folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  var file = folder.createFile(blob);
  var prop = addPropertyRowForFile_(file);
  var r = importMysokuForRow_(prop);
  return { id: prop['物件ID'], filled: r.filled, notes: r.skipped };
}

function api_reimportMysoku(id) {
  var r = importMysokuForRow_(findProp_(id));
  return { filled: r.filled, skipped: r.skipped, data: api_getProperty(id) };
}

/** 手入力で物件を追加（マイソクがない場合） */
function api_createProperty(name) {
  var sh = sheet_(SHEETS.PROPERTIES);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var rowNum = nextEmptyPropertyRow_();
  var id = 'P' + ('0000' + rowNum).slice(-5);
  var row = headers.map(function (h) {
    if (h === '物件ID') return id;
    if (h === '建物名' || h === '物件名') return name || '';
    return (CHECKBOX_COLUMNS[SHEETS.PROPERTIES] || []).indexOf(h) >= 0 ? false : '';
  });
  sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);
  applyCheckboxes_(sh, headers, SHEETS.PROPERTIES, rowNum, 1);
  return { id: id };
}

/* ---------------- 位置 ---------------- */

/** 起点がなければ住所から求める。注意事項も返す */
function api_locate(id) {
  var p = findProp_(id);
  var warnings = [];
  if (toNum_(p['起点緯度']) == null || toNum_(p['起点経度']) == null) {
    if (!p['住所']) throw new Error('住所が入力されていません。「物件情報」で住所を入力してください。');
    var ctx = buildContext_();
    warnings = geocodeProperty_(p, ctx).warnings;
    p = findProp_(id);
  } else {
    if (p['Geocode種別'] && p['Geocode種別'] !== 'ROOFTOP') warnings.push('住所から求めた位置の精度が建物単位ではありません（' + p['Geocode種別'] + '）');
    if (p['Geocode部分一致']) warnings.push('住所の一部だけが一致しました');
  }
  return {
    lat: toNum_(p['起点緯度']),
    lng: toNum_(p['起点経度']),
    confirmed: bool_(p['起点確認済']),
    geocodedAddress: String(p['Geocode住所'] || ''),
    warnings: warnings
  };
}

/**
 * 地図画像（Maps Static API）。画面でクリックした位置を緯度経度に換算するため、中心・ズーム・サイズも返す。
 * Maps Static API が無効の場合は error を返し、画面側で座標の手入力に切り替える。
 */
function api_mapImage(lat, lng, zoom) {
  var z = Math.max(14, Math.min(20, Math.round(zoom || 18)));
  var url = 'https://maps.googleapis.com/maps/api/staticmap?center=' + lat + ',' + lng +
    '&zoom=' + z + '&size=640x400&scale=2&maptype=roadmap&language=ja&region=JP&key=' + encodeURIComponent(getApiKey_());
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    return { error: '地図を表示できません（Maps Static API が有効か確認してください）。HTTP ' + resp.getResponseCode() };
  }
  return {
    dataUrl: 'data:image/png;base64,' + Utilities.base64Encode(resp.getBlob().getBytes()),
    lat: lat, lng: lng, zoom: z, width: 640, height: 400
  };
}

function api_confirmOrigin(id, lat, lng) {
  var p = findProp_(id);
  var moved = toNum_(p['起点緯度']) !== lat || toNum_(p['起点経度']) !== lng;
  var patch = { '起点緯度': lat, '起点経度': lng, '起点確認済': true, 'Googleマップ': mapUrl_(lat, lng) };
  if (moved && rowsOf_(SHEETS.FACILITIES, id).length) {
    patch['ステータス'] = '要再調査';
    patch['メッセージ'] = '位置を変更したため、再調査してください。';
  }
  updateRow_(SHEETS.PROPERTIES, p._row, patch);
  return api_getProperty(id);
}

/* ---------------- 調査 ---------------- */

function api_runSurvey(id) {
  var lock = LockService.getScriptLock(); // スプレッドシートに紐付かないスクリプトでも使えるロック
  if (!lock.tryLock(15000)) throw new Error('他の調査が実行中です。1分ほど待ってからもう一度押してください。');
  try {
    var ctx = buildContext_();
    var r = processProperty_(findProp_(id), ctx);
    var p = findProp_(id);
    return { status: r.status, message: String(p['メッセージ'] || ''), apiCalls: ctx.apiCalls, data: api_getProperty(id) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- 結果の確認・編集 ---------------- */

var UI_RESULT_SHEETS = {
  facility: { sheet: SHEETS.FACILITIES, cols: ['掲載', '確認済', '備考'],
    key: function (r) { return r['カテゴリID'] + '|' + (r['place_id'] || r['採否']); } },
  station: { sheet: SHEETS.STATIONS, cols: ['路線', '確認済', '備考'],
    key: function (r) { return String(r['枠']); } },
  access: { sheet: SHEETS.ACCESS, cols: ['運行会社', '確認済', '備考', '採用'],
    key: function (r) { return r['種別'] + '|' + (r['place_id'] || r['名称']); } }
};

/** 結果シートの1行を更新して出力を作り直す */
function api_updateResult(kind, id, key, patch) {
  var def = UI_RESULT_SHEETS[kind];
  if (!def) throw new Error('不明な種類: ' + kind);
  var rows = rowsOf_(def.sheet, id);
  var target = rows.filter(function (r) { return def.key(r) === key; })[0];
  if (!target) throw new Error('対象の行が見つかりません。画面を更新してください。');
  var clean = {};
  Object.keys(patch || {}).forEach(function (k) { if (def.cols.indexOf(k) >= 0) clean[k] = patch[k]; });
  updateRow_(def.sheet, target._row, clean);
  // バス停の採用は1件だけ
  if (kind === 'access' && clean['採用'] === true) {
    rows.forEach(function (r) {
      if (r !== target && r['種別'] === target['種別'] && bool_(r['採用'])) updateRow_(def.sheet, r._row, { '採用': false });
    });
  }
  regenerateOutput_(id);
  return api_getProperty(id);
}
