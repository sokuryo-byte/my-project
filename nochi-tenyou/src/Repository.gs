/**
 * ============================================================
 *  保存処理（スプレッドシートの読み書き）
 * ============================================================
 *  シートへのアクセスはこのファイルに集約しています。
 *  列の並びは Config.gs の CASE_COLUMNS で決まるため、ここは列番号を直接持ちません。
 */

// ---- 1回の処理（サーバー呼び出し）の中での使い回し ----
// スプレッドシートを開く・シートを探す・全行を読むのは1回の呼び出しにつき1回だけにする（毎回シートへ問い合わせると遅いため）。
// 案件一覧・物件明細の読み取り結果は、この中の書き込み関数で同じ内容に直す（または捨てて読み直す）。
var SS_MEMO_ = null;
var SHEET_MEMO_ = {};
var CASES_RAW_ = null; // 案件一覧の2行目以降（getValues の結果）
var LOTS_RAW_ = null;  // 物件明細の2行目以降

/** 保存先スプレッドシートを取得する */
function getSpreadsheet_() {
  if (!SS_MEMO_) {
    SS_MEMO_ = SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  }
  return SS_MEMO_;
}

/** シート名からシートを取得する（無ければ分かりやすいエラーにする） */
function getSheet_(name) {
  if (SHEET_MEMO_[name]) return SHEET_MEMO_[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('シート「' + name + '」が見つかりません。メニュー「初期セットアップ」を実行してください。');
  }
  SHEET_MEMO_[name] = sheet;
  return sheet;
}

/** 行の追加・削除など、読み取り結果をそのまま直せない書き込みの後に呼ぶ（次の読み取りでシートから読み直す） */
function forgetSheetCache_() {
  CASES_RAW_ = null;
  LOTS_RAW_ = null;
}

function casesRaw_() {
  if (!CASES_RAW_) {
    const sheet = getSheet_(SHEET_NAMES.CASES);
    const lastRow = sheet.getLastRow();
    CASES_RAW_ = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, CASE_COLUMNS.length).getValues();
  }
  return CASES_RAW_;
}

function lotsRaw_() {
  if (!LOTS_RAW_) {
    const sheet = getSheet_(SHEET_NAMES.LOTS);
    const lastRow = sheet.getLastRow();
    LOTS_RAW_ = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, LOT_COLUMNS.length).getValues();
  }
  return LOTS_RAW_;
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
    forgetSheetCache_();

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
    forgetSheetCache_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * 保存した案件を上書きする（受付番号・ID・受付日時・行政班の対応欄はそのまま）。物件明細は入れ替える。
 * @param {number} caseId
 * @param {Object} record CASE_COLUMNS の key を持つオブジェクト（書く列だけ）
 * @param {Array<Object>} lots appendLots_ と同じ形
 */
function replaceCase_(caseId, record, lots) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  let result;
  try {
    const sheet = getSheet_(SHEET_NAMES.CASES);
    if (sheet.getLastColumn() < CASE_COLUMNS.length) ensureHeaders_(sheet, CASE_COLUMNS.map(function (c) { return c.header; }));
    const row = findCaseRow_(caseId);
    if (!row) throw new Error('案件ID ' + caseId + ' が見つかりません。');
    const keep = ['id', 'caseNo', 'receivedAt', 'status', 'assignee', 'formalEstimate', 'adminMemo', 'appointments', 'localFee', 'localFeeNote', 'karteNo',
      'estimatePdfUrl', 'estimatePdfAt', 'reportResult'];
    const current = sheet.getRange(row, 1, 1, CASE_COLUMNS.length).getValues()[0];
    const next = CASE_COLUMNS.map(function (c, i) {
      return keep.indexOf(c.key) < 0 && record[c.key] !== undefined ? toCellValue_(record[c.key]) : current[i];
    });
    sheet.getRange(row, 1, 1, CASE_COLUMNS.length).setValues([next]);
    // 物件明細：この案件の行を下から消して入れ直す
    const ls = getSheet_(SHEET_NAMES.LOTS);
    if (ls.getLastRow() >= 2) {
      const ids = ls.getRange(2, 1, ls.getLastRow() - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) if (Number(ids[i][0]) === Number(caseId)) ls.deleteRow(i + 2);
    }
    SpreadsheetApp.flush();
    forgetSheetCache_();
    result = { id: Number(caseId), caseNo: current[colIndexOf_('caseNo') - 1], row: row, url: buildRowUrl_(sheet, row) };
  } finally {
    lock.releaseLock();
  }
  appendLots_(caseId, lots); // appendLots_ は自分でロックを取る
  return result;
}

/** 物件明細を案件IDごとにまとめて返す { 案件ID: [物件, ...] } */
function getLotsByCase_() {
  const result = {};
  const tz = Session.getScriptTimeZone();
  lotsRaw_().forEach(function (r) {
    if (r[0] === '') return;
    const lot = {};
    // 「2020/06/01」などはシートが日付に変換して保存する。日付のまま画面へ渡すと google.script.run が失敗する（管理画面が読み込めない）ため文字にする
    LOT_COLUMNS.forEach(function (c, i) { lot[c.key] = r[i] instanceof Date ? Utilities.formatDate(r[i], tz, 'yyyy/MM/dd') : r[i]; });
    (result[lot.caseId] = result[lot.caseId] || []).push(lot);
  });
  return result;
}

/** 物件明細の行番号（案件ID・物件No で探す）。無ければ 0 */
function findLotRow_(caseId, no) {
  const v = lotsRaw_();
  for (let i = 0; i < v.length; i++) {
    if (Number(v[i][0]) === Number(caseId) && Number(v[i][1]) === Number(no)) return i + 2;
  }
  return 0;
}

/** 物件明細の1行の複数セルを更新する（patch は LOT_COLUMNS の key → 値） */
function updateLotCells_(rowNumber, patch) {
  const sheet = getSheet_(SHEET_NAMES.LOTS);
  const raw = LOTS_RAW_ && LOTS_RAW_[rowNumber - 2];
  Object.keys(patch).forEach(function (key) {
    const idx = LOT_COLUMNS.map(function (c) { return c.key; }).indexOf(key);
    if (idx < 0) return;
    sheet.getRange(rowNumber, idx + 1).setValue(toCellValue_(patch[key])); // 書き込みはまとめて送られる（間に読み取りを挟まない）
    if (raw) raw[idx] = patch[key];
  });
}

/** 指定行の1セルを更新する（通知結果の書き戻しなどに使用） */
function updateCaseCell_(rowNumber, key, value) {
  getSheet_(SHEET_NAMES.CASES)
    .getRange(rowNumber, colIndexOf_(key))
    .setValue(toCellValue_(value));
  const raw = CASES_RAW_ && CASES_RAW_[rowNumber - 2];
  if (raw) raw[colIndexOf_(key) - 1] = value === undefined || value === null ? '' : (typeof value === 'string' && value.charAt(0) === "'" ? value.slice(1) : value); // シートは先頭の ' を表示しない
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
    forgetSheetCache_();
    return { lots: lotRows.length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 個別のデータ修正（指定の受付番号の案件だけ）：許可・届出の履歴がある物件の「再申請の要否」が空欄なら「不要」にし、
 * 物件明細から概算見積を計算し直して案件一覧に書き込む。ほかの案件・ほかの列は変更しない。
 * @return {string} 結果（スクリプトプロパティ FIX_261001_02_RESULT に記録）
 */
function fixCaseSaiShinseiAndRecalc_(caseNo) {
  const c = getAllCases_().filter(function (x) { return String(x.caseNo) === caseNo; })[0];
  if (!c) return caseNo + '：案件なし';
  const lotsSheet = getSheet_(SHEET_NAMES.LOTS);
  ensureHeaders_(lotsSheet, LOT_COLUMNS.map(function (x) { return x.header; }));
  const col = function (key) { return LOT_COLUMNS.findIndex(function (x) { return x.key === key; }); };
  const values = lotsSheet.getRange(2, 1, lotsSheet.getLastRow() - 1, LOT_COLUMNS.length).getValues();
  let fixed = 0;
  values.forEach(function (r, i) {
    if (Number(r[0]) !== Number(c.id)) return;
    if (r[col('tenyoRireki')] === 'あり' && !r[col('saiShinsei')]) {
      lotsSheet.getRange(i + 2, col('saiShinsei') + 1).setValue('不要');
      fixed++;
    }
  });
  SpreadsheetApp.flush();
  forgetSheetCache_();
  // 概算は共通の再計算で（物件明細の内容と現在の金額設定から）
  recalcCaseEstimate_(c, getLotsByCase_()[c.id]);
  const est = getAllCases_().filter(function (x) { return x.id === c.id; })[0].estimate;
  return caseNo + '：再申請の要否を' + fixed + '筆「不要」に／概算 ' + est;
}

/** 案件IDから行番号を探す（見つからなければ 0） */
function findCaseRow_(caseId) {
  const rows = casesRaw_();
  const col = colIndexOf_('id') - 1;
  for (let i = 0; i < rows.length; i++) {
    if (Number(rows[i][col]) === Number(caseId)) return i + 2;
  }
  return 0;
}

/**
 * 案件一覧の全行を、CASE_COLUMNS の key を持つオブジェクトの配列で返す（新しい順）。
 * 日付は画面へ渡せるよう文字列に変換する。
 */
function getAllCases_() {
  const values = casesRaw_();
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
  forgetSheetCache_();
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
