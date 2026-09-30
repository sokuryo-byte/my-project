/**
 * ============================================================
 *  保存処理（スプレッドシートの読み書き）
 * ============================================================
 *  シートへのアクセスはこのファイルに集約しています。
 *  列の並びは Config.gs の CASE_COLUMNS で決まるため、ここは列番号を直接持ちません。
 */

/** 保存先スプレッドシートを取得する */
function getSpreadsheet_() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

/** シート名からシートを取得する（無ければ分かりやすいエラーにする） */
function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('シート「' + name + '」が見つかりません。メニュー「初期セットアップ」を実行してください。');
  }
  return sheet;
}

/** CASE_COLUMNS の key から列番号（1始まり）を返す */
function colIndexOf_(key) {
  const idx = CASE_COLUMNS.findIndex(function (c) { return c.key === key; });
  if (idx < 0) throw new Error('列定義に存在しないキーです: ' + key);
  return idx + 1;
}

/**
 * 案件を1行追加する。
 * 同時送信でIDが重複しないよう、スクリプトロックをかけて採番〜書き込みを行う。
 * @param {Object} record CASE_COLUMNS の key をプロパティに持つオブジェクト（id は不要）
 * @return {{id:number, row:number, url:string}}
 */
function appendCase_(record) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000); // 最大20秒待つ（取れなければ例外）
  try {
    const sheet = getSheet_(SHEET_NAMES.CASES);
    if (sheet.getLastColumn() < CASE_COLUMNS.length) ensureHeaders_(sheet, CASE_COLUMNS.map(function (c) { return c.header; })); // 列を追加した後の初回
    const id = getNextCaseId_(sheet);
    const caseNo = getNextCaseNo_(sheet, record.receivedAt || new Date());
    const data = Object.assign({}, record, { id: id, caseNo: caseNo });

    const row = CASE_COLUMNS.map(function (c) {
      return toCellValue_(data[c.key]);
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();

    const rowNumber = sheet.getLastRow();
    return { id: id, caseNo: caseNo, row: rowNumber, url: buildRowUrl_(sheet, rowNumber) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 物件明細シートに、案件の物件をまとめて追加する（1物件＝1行）。
 * @param {number} caseId
 * @param {Array<Object>} lots LOT_COLUMNS の key を持つオブジェクト（caseId, no は不要）
 */
function appendLots_(caseId, lots) {
  if (!lots.length) return;
  const sheet = getSheet_(SHEET_NAMES.LOTS);
  if (sheet.getLastColumn() < LOT_COLUMNS.length) ensureHeaders_(sheet, LOT_COLUMNS.map(function (c) { return c.header; })); // 列を追加した後の初回
  const rows = lots.map(function (lot, i) {
    const data = Object.assign({}, lot, { caseId: caseId, no: i + 1 });
    return LOT_COLUMNS.map(function (c) { return toCellValue_(data[c.key]); });
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOT_COLUMNS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

/** 物件明細を案件IDごとにまとめて返す { 案件ID: [物件, ...] } */
function getLotsByCase_() {
  const sheet = getSheet_(SHEET_NAMES.LOTS);
  const lastRow = sheet.getLastRow();
  const result = {};
  if (lastRow < 2) return result;
  sheet.getRange(2, 1, lastRow - 1, LOT_COLUMNS.length).getValues().forEach(function (r) {
    if (r[0] === '') return;
    const lot = {};
    LOT_COLUMNS.forEach(function (c, i) { lot[c.key] = r[i]; });
    (result[lot.caseId] = result[lot.caseId] || []).push(lot);
  });
  return result;
}

/** 指定行の1セルを更新する（通知結果の書き戻しなどに使用） */
function updateCaseCell_(rowNumber, key, value) {
  getSheet_(SHEET_NAMES.CASES)
    .getRange(rowNumber, colIndexOf_(key))
    .setValue(toCellValue_(value));
}

/** 指定行の複数セルをまとめて更新する（patch は CASE_COLUMNS の key → 値） */
function updateCaseCells_(rowNumber, patch) {
  Object.keys(patch).forEach(function (key) {
    updateCaseCell_(rowNumber, key, patch[key]);
  });
}

/**
 * 案件を削除する：案件一覧の行と物件明細の行を「削除した案件」「削除した物件明細」シートへ移してから消す。
 * 資料フォルダ（ドライブ）はそのまま残す。
 * @return {{lots:number}} 移した物件の件数
 */
function deleteCase_(caseId, deletedBy) {
  const ss = getSpreadsheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    const row = findCaseRow_(caseId);
    if (!row) throw new Error('案件ID ' + caseId + ' が見つかりません。');
    const cases = getSheet_(SHEET_NAMES.CASES);
    const now = new Date();

    const delCases = getOrCreateSheet_(ss, SHEET_NAMES.DELETED_CASES);
    ensureHeaders_(delCases, ['削除日時', '削除者'].concat(CASE_COLUMNS.map(function (c) { return c.header; })));
    const caseValues = cases.getRange(row, 1, 1, CASE_COLUMNS.length).getValues()[0];
    delCases.appendRow([now, deletedBy].concat(caseValues));

    // 物件明細：下の行から消す（行番号がずれないように）
    const lots = getSheet_(SHEET_NAMES.LOTS);
    const lastRow = lots.getLastRow();
    const lotRows = [];
    if (lastRow >= 2) {
      lots.getRange(2, 1, lastRow - 1, LOT_COLUMNS.length).getValues().forEach(function (r, i) {
        if (Number(r[0]) === Number(caseId)) lotRows.push({ row: i + 2, values: r });
      });
    }
    if (lotRows.length) {
      const delLots = getOrCreateSheet_(ss, SHEET_NAMES.DELETED_LOTS);
      ensureHeaders_(delLots, ['削除日時'].concat(LOT_COLUMNS.map(function (c) { return c.header; })));
      lotRows.forEach(function (l) { delLots.appendRow([now].concat(l.values)); });
      lotRows.slice().reverse().forEach(function (l) { lots.deleteRow(l.row); });
    }
    cases.deleteRow(row);
    SpreadsheetApp.flush();
    return { lots: lotRows.length };
  } finally {
    lock.releaseLock();
  }
}

/** 案件IDから行番号を探す（見つからなければ 0） */
function findCaseRow_(caseId) {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, colIndexOf_('id'), lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(caseId)) return i + 2;
  }
  return 0;
}

/**
 * 案件一覧の全行を、CASE_COLUMNS の key を持つオブジェクトの配列で返す（新しい順）。
 * 日付は画面へ渡せるよう文字列に変換する。
 */
function getAllCases_() {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, CASE_COLUMNS.length).getValues();
  const tz = Session.getScriptTimeZone();
  return values
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) {
      const obj = {};
      CASE_COLUMNS.forEach(function (c, i) {
        const v = r[i];
        obj[c.key] = v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy/MM/dd HH:mm') : v;
      });
      return obj;
    })
    .reverse();
}

/**
 * 受付番号を返す：受付日（yyMMdd）-その日の連番2桁。例）260930-01
 * 削除した案件の番号も使わない。
 */
function getNextCaseNo_(sheet, date) {
  const prefix = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyMMdd') + '-';
  const nos = caseNoColumn_(sheet, 0).concat(caseNoColumn_(getSpreadsheet_().getSheetByName(SHEET_NAMES.DELETED_CASES), 2));
  const max = nos.reduce(function (m, v) {
    const s = String(v);
    return s.indexOf(prefix) === 0 ? Math.max(m, Number(s.slice(prefix.length)) || 0) : m;
  }, 0);
  return prefix + ('0' + (max + 1)).slice(-2);
}

/** シートの受付番号の列の値（offset：削除した案件シートは先頭に2列多い） */
function caseNoColumn_(sheet, offset) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const col = offset + colIndexOf_('caseNo');
  if (sheet.getLastColumn() < col) return [];
  return sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; });
}

/** 受付番号の無い既存の案件に、受付日時から受付番号を付ける（受付番号の導入前の案件用。1回だけ） */
function fillCaseNos_() {
  const sheet = getSheet_(SHEET_NAMES.CASES);
  ensureHeaders_(sheet, CASE_COLUMNS.map(function (c) { return c.header; }));
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const idCol = colIndexOf_('id'), recCol = colIndexOf_('receivedAt'), noCol = colIndexOf_('caseNo');
  const rows = sheet.getRange(2, 1, lastRow - 1, CASE_COLUMNS.length).getValues()
    .map(function (r, i) { return { row: i + 2, id: Number(r[idCol - 1]), at: r[recCol - 1], no: r[noCol - 1] }; })
    .filter(function (x) { return x.id && !x.no && x.at instanceof Date; })
    .sort(function (a, b) { return a.id - b.id; });
  rows.forEach(function (x) {
    sheet.getRange(x.row, noCol).setValue(getNextCaseNo_(sheet, x.at));
  });
  return rows.length;
}

/** 次の案件IDを返す（ID列の最大値 + 1） */
function getNextCaseId_(sheet) {
  const lastRow = sheet.getLastRow();
  const ids = lastRow >= 2 ? sheet.getRange(2, colIndexOf_('id'), lastRow - 1, 1).getValues() : [];
  // 削除した案件のIDも使わない（Chat 通知の「管理画面で開く」リンクが別の案件を指さないように）
  const del = getSpreadsheet_().getSheetByName(SHEET_NAMES.DELETED_CASES);
  const delIds = del && del.getLastRow() >= 2 ? del.getRange(2, 2 + colIndexOf_('id'), del.getLastRow() - 1, 1).getValues() : [];
  const max = ids.concat(delIds).reduce(function (m, r) {
    const n = Number(r[0]);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return max + 1;
}

/** 案件行を直接開けるURL（シートID＋セル範囲指定） */
function buildRowUrl_(sheet, rowNumber) {
  return getSpreadsheet_().getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + rowNumber;
}

/**
 * セルに書き込む値を整える。
 * ・undefined/null は空欄
 * ・「=」「+」「-」「@」で始まる文字列は数式として解釈されないよう先頭に ' を付ける
 */
function toCellValue_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

/**
 * マスタシートの内容を返す（画面のプルダウン用）。
 * @return {Array<{prefecture:string, municipality:string, cityPlanUrl:string, noshinUrl:string}>}
 */
function getMasterList_() {
  const sheet = getSheet_(SHEET_NAMES.MASTER);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const cols = Math.min(Math.max(sheet.getLastColumn(), 4), MASTER_HEADERS.length);
  return sheet.getRange(2, 1, lastRow - 1, cols).getDisplayValues()
    .filter(function (r) { return r[0] && r[1]; }) // 都道府県・市区町村が空の行は無視
    .map(function (r) {
      return {
        prefecture: String(r[0]).trim(),
        municipality: String(r[1]).trim(),
        cityPlanUrl: safeUrl_(r[2]),
        noshinUrl: safeUrl_(r[3]),
        nogyoTel: String(r[5] || '').replace(/[^0-9０-９\-－()（）]/g, '').slice(0, 20),
      };
    });
}

/** http(s) で始まるURLだけを通す（それ以外は空文字） */
function safeUrl_(value) {
  const s = String(value || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
