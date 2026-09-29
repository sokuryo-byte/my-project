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
    const id = getNextCaseId_(sheet);
    const data = Object.assign({}, record, { id: id });

    const row = CASE_COLUMNS.map(function (c) {
      return toCellValue_(data[c.key]);
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();

    const rowNumber = sheet.getLastRow();
    return { id: id, row: rowNumber, url: buildRowUrl_(sheet, rowNumber) };
  } finally {
    lock.releaseLock();
  }
}

/** 指定行の1セルを更新する（通知結果の書き戻しなどに使用） */
function updateCaseCell_(rowNumber, key, value) {
  getSheet_(SHEET_NAMES.CASES)
    .getRange(rowNumber, colIndexOf_(key))
    .setValue(toCellValue_(value));
}

/** 次の案件IDを返す（ID列の最大値 + 1） */
function getNextCaseId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, colIndexOf_('id'), lastRow - 1, 1).getValues();
  const max = ids.reduce(function (m, r) {
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
  return sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues()
    .filter(function (r) { return r[0] && r[1]; }) // 都道府県・市区町村が空の行は無視
    .map(function (r) {
      return {
        prefecture: String(r[0]).trim(),
        municipality: String(r[1]).trim(),
        cityPlanUrl: safeUrl_(r[2]),
        noshinUrl: safeUrl_(r[3]),
      };
    });
}

/** http(s) で始まるURLだけを通す（それ以外は空文字） */
function safeUrl_(value) {
  const s = String(value || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
