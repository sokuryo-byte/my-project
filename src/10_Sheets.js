/**
 * 10_Sheets.js
 * スプレッドシートの読み書き。列は見出し名で参照する（列の並べ替えに強くするため）。
 */

var SCRIPT_PROP_SHEET_ID = 'SPREADSHEET_ID';

/** 対象のスプレッドシート（ウェブアプリから呼ばれた場合は初期セットアップ時に記録したIDで開く） */
// openById は1回あたり数百ミリ秒かかるため、1回の実行の中では使い回す
var ss_cached_ = null;
function ss_() {
  if (ss_cached_) return ss_cached_;
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return (ss_cached_ = active);
  var id = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_SHEET_ID) || BOOTSTRAP.spreadsheetId;
  if (!id) throw new Error('スプレッドシートが特定できません。スプレッドシートのメニューから「初期セットアップ」を実行してください。');
  return (ss_cached_ = SpreadsheetApp.openById(id));
}

function ensureSheet_(name) {
  var headers = HEADERS[name];
  var sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  var current = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (current.filter(String).length === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);
  } else {
    // 不足している列を末尾に追加（既存データは動かさない）
    var missing = headers.filter(function (h) { return current.indexOf(h) < 0; });
    if (missing.length) {
      sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e8eaed');
    }
  }
  return sh;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」がありません。メニュー「初期セットアップ」を実行してください。');
  return sh;
}

/** @return {{sheet, headers:string[], rows:Object[]}} rows[i]._row は行番号 */
function readTable_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return { sheet: sh, headers: [], rows: [] };
  var values = sh.getRange(1, 1, Math.max(1, lastRow), lastCol).getValues();
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 };
    var empty = true;
    headers.forEach(function (h, c) {
      o[h] = values[i][c];
      // 未チェックのチェックボックス(FALSE)だけの行は空行とみなす
      if (values[i][c] !== '' && values[i][c] !== null && values[i][c] !== false) empty = false;
    });
    if (!empty) rows.push(o);
  }
  return { sheet: sh, headers: headers, rows: rows };
}

function rowsToValues_(headers, objs) {
  return objs.map(function (o) {
    return headers.map(function (h) {
      var v = o[h];
      return v == null ? '' : v;
    });
  });
}

function applyCheckboxes_(sh, headers, name, firstRow, numRows) {
  if (numRows <= 0) return;
  (CHECKBOX_COLUMNS[name] || []).forEach(function (h) {
    var c = headers.indexOf(h);
    if (c >= 0) sh.getRange(firstRow, c + 1, numRows, 1).insertCheckboxes();
  });
}

/**
 * 結果シートの該当物件の行を差し替える。担当者が入力した列はキーで引き継ぐ。
 * @param {function(Object):string} keyFn 引継ぎ用キー
 * @param {string[]} preserveCols 引き継ぐ列（例: 路線, 確認済, 掲載, 備考）
 */
function replacePropertyRows_(name, propertyId, newRows, keyFn, preserveCols, onlyIf) {
  var t = readTable_(name);
  var sh = t.sheet;
  var headers = t.headers;
  var kept = [];
  var preserved = {};
  t.rows.forEach(function (r) {
    if (String(r['物件ID']) === String(propertyId) && (!onlyIf || onlyIf(r))) {
      var k = keyFn(r);
      if (k) preserved[k] = r;
    } else {
      kept.push(r);
    }
  });
  newRows.forEach(function (r) {
    var old = preserved[keyFn(r)];
    if (!old) return;
    // 距離や要確認理由が変わった行は、確認済・掲載の判断を引き継がない（再確認させる）
    var sameData = String(old['道路距離m']) === String(r['道路距離m'] == null ? '' : r['道路距離m']) &&
      String(old['要確認理由']) === String(r['要確認理由'] == null ? '' : r['要確認理由']);
    preserveCols.forEach(function (c) {
      if ((c === '確認済' || c === '掲載' || c === '採用') && !sameData) return;
      var ov = old[c];
      // 担当者入力（空でない値・チェック済み）だけを引き継ぐ
      if (ov !== '' && ov != null && !(c === '路線' && r[c])) r[c] = ov;
    });
  });
  var all = kept.concat(newRows);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var body = sh.getRange(2, 1, lastRow - 1, headers.length);
    body.clearContent();
    body.clearDataValidations();
  }
  if (all.length) {
    sh.getRange(2, 1, all.length, headers.length).setValues(rowsToValues_(headers, all));
    applyCheckboxes_(sh, headers, name, 2, all.length);
  }
}

/** 1行の一部の列を更新 */
function updateRow_(name, rowNum, patch) {
  var sh = sheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Object.keys(patch).forEach(function (h) {
    var c = headers.indexOf(h);
    if (c >= 0) sh.getRange(rowNum, c + 1).setValue(patch[h]);
  });
}

function appendLog_(runId, propertyId, action, result, apiCalls, message) {
  var sh = ensureSheet_(SHEETS.LOG);
  sh.appendRow([formatJst_(), runId, propertyId, action, result, apiCalls, String(message || '').slice(0, 1000)]);
}

/* ---------------- 設定の読み込み ---------------- */

function loadSettings_() {
  var t = readTable_(SHEETS.SETTINGS);
  var s = {};
  DEFAULT_SETTINGS.forEach(function (d) { s[d[0]] = d[1]; });
  t.rows.forEach(function (r) {
    var k = String(r['キー']).trim();
    var v = r['値'];
    if (v instanceof Date) v = Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'HH:mm');
    if (k) s[k] = v;
  });
  return s;
}

function loadCategories_() {
  return readTable_(SHEETS.CATEGORIES).rows.map(parseCategory_).filter(function (c) { return c.id; });
}

function loadBrandDict_() {
  var t = readTable_(SHEETS.BRANDS);
  return buildBrandDict_(t.rows.map(function (r) { return [r['ブランド名'], r['照合キーワード'], r['対象カテゴリID']]; }));
}

/* ---------------- 初期セットアップ ---------------- */

function setupSheets_() {
  ss_().setSpreadsheetTimeZone('Asia/Tokyo');
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROP_SHEET_ID, ss_().getId());
  [SHEETS.PROPERTIES, SHEETS.FACILITIES, SHEETS.STATIONS, SHEETS.ACCESS, SHEETS.OUTPUT,
    SHEETS.CATEGORIES, SHEETS.BRANDS, SHEETS.SETTINGS, SHEETS.LOG].forEach(ensureSheet_);

  var st = sheet_(SHEETS.SETTINGS);
  if (st.getLastRow() < 2) {
    var defaults = DEFAULT_SETTINGS.map(function (d) {
      return d[0] === 'mysoku_folder_id' && BOOTSTRAP.mysokuFolderId ? [d[0], BOOTSTRAP.mysokuFolderId, d[2]] : d;
    });
    st.getRange(2, 1, defaults.length, 3).setNumberFormat('@').setValues(defaults);
  } else {
    // 新しい設定キーだけを追加
    var existing = readTable_(SHEETS.SETTINGS).rows.map(function (r) { return String(r['キー']); });
    DEFAULT_SETTINGS.filter(function (d) { return existing.indexOf(d[0]) < 0; }).forEach(function (d) {
      var r = st.getLastRow() + 1;
      st.getRange(r, 1, 1, 3).setNumberFormat('@').setValues([d]);
    });
  }
  var cat = sheet_(SHEETS.CATEGORIES);
  if (cat.getLastRow() < 2) {
    cat.getRange(2, 1, DEFAULT_CATEGORIES.length, DEFAULT_CATEGORIES[0].length).setValues(DEFAULT_CATEGORIES);
  }
  var br = sheet_(SHEETS.BRANDS);
  if (br.getLastRow() < 2) {
    br.getRange(2, 1, DEFAULT_BRANDS.length, 3).setValues(DEFAULT_BRANDS);
  }
  var prop = sheet_(SHEETS.PROPERTIES);
  var ph = HEADERS[SHEETS.PROPERTIES];
  applyCheckboxes_(prop, ph, SHEETS.PROPERTIES, 2, 500);
  var def = ss_().getSheets()[0];
  if (def && def.getName() === 'シート1' && def.getLastRow() === 0) ss_().deleteSheet(def);
}
