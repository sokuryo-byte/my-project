/**
 * ============================================================
 *  初期セットアップ・スプレッドシートのメニュー
 * ============================================================
 *  setupSpreadsheet() は何度実行しても安全です（既存データは消しません）。
 *  ・シートが無ければ作成
 *  ・見出しが無い／足りなければ追記
 *  ・マスタ／見積設定が空のときだけ初期値を投入
 *  ・資料保存用のドライブフォルダが未設定なら作成
 */

/** スプレッドシートを開いたときにメニューを追加する */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('農地転用システム')
    .addItem('初期セットアップ（シート・フォルダ作成）', 'setupSpreadsheet')
    .addItem('Google Chat 通知テスト', 'testChatNotification')
    .addItem('未送信の一時ファイルを削除（7日以上前）', 'cleanupPendingUploads')
    .addToUi();
}

/** 各シートとドライブフォルダを作成／整備する */
function setupSpreadsheet() {
  const ss = getSpreadsheet_();

  // --- 案件一覧 ---
  const caseSheet = getOrCreateSheet_(ss, SHEET_NAMES.CASES);
  ensureHeaders_(caseSheet, CASE_COLUMNS.map(function (c) { return c.header; }));
  formatCaseSheet_(caseSheet);

  // --- 物件明細 ---
  const lotSheet = getOrCreateSheet_(ss, SHEET_NAMES.LOTS);
  ensureHeaders_(lotSheet, LOT_COLUMNS.map(function (c) { return c.header; }));
  lotSheet.getRange(2, 6, Math.max(lotSheet.getMaxRows() - 1, 1), 1).setNumberFormat('#,##0.00');

  // --- マスタ ---
  const masterSheet = getOrCreateSheet_(ss, SHEET_NAMES.MASTER);
  ensureHeaders_(masterSheet, MASTER_HEADERS);
  if (masterSheet.getLastRow() <= 1) {
    const rows = getSampleMasterRows_();
    masterSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  masterSheet.setColumnWidth(2, 140);
  masterSheet.setColumnWidths(3, 2, 320);

  // --- 見積設定 ---
  const feeSheet = getOrCreateSheet_(ss, SHEET_NAMES.FEES);
  ensureHeaders_(feeSheet, FEE_HEADERS);
  addMissingFeeRows_(feeSheet);

  // --- ドライブフォルダ ---
  const root = getRootFolder_();

  notifyUser_('初期セットアップが完了しました。\n資料フォルダ：' + root.getUrl() +
    '\n※行政班のメンバーにこのフォルダを共有してください。');
}

/** 見積設定シートに、まだ無い項目だけを追記する（既存の金額は上書きしない） */
function addMissingFeeRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const existing = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); })
    : [];
  const rows = DEFAULT_FEES
    .filter(function (d) { return existing.indexOf(d.key) < 0; })
    .map(function (d) { return [d.key, d.label, d.amount, d.note]; });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  sheet.getRange(2, 3, Math.max(sheet.getLastRow() - 1, 1), 1).setNumberFormat('#,##0');
  sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).setBackground('#eeeeee'); // キー列はグレー
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(4, 420);
}

/** シートを取得し、無ければ作成する */
function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/**
 * 1行目の見出しを整える。
 * 既存の見出しは上書きせず、足りない列だけ右側に追記する（列追加に対応）。
 */
function ensureHeaders_(sheet, headers) {
  const lastCol = sheet.getLastColumn();
  const current = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (current.length < headers.length) {
    const missing = headers.slice(current.length);
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#e8f0e3');
  sheet.setFrozenRows(1);
}

/** 案件一覧の表示形式（日時・金額）を設定する */
function formatCaseSheet_(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  const n = maxRows - 1;
  sheet.getRange(2, colIndexOf_('receivedAt'), n, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  sheet.getRange(2, colIndexOf_('updatedAt'), n, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  sheet.getRange(2, colIndexOf_('area'), n, 1).setNumberFormat('#,##0.00');
  sheet.getRange(2, colIndexOf_('estimate'), n, 1).setNumberFormat('¥#,##0');
  sheet.getRange(2, colIndexOf_('formalEstimate'), n, 1).setNumberFormat('¥#,##0');
  sheet.setColumnWidth(colIndexOf_('estimateDetail'), 320);
  sheet.setColumnWidth(colIndexOf_('plan'), 240);
  sheet.setColumnWidth(colIndexOf_('adminMemo'), 280);
}

/**
 * マスタのサンプル行（愛知・岐阜・三重）。
 * URLは各自治体のページを確認のうえ、シート上で直接入力してください（参照用リンクとして表示するだけです）。
 */
function getSampleMasterRows_() {
  const list = {
    '愛知県': ['名古屋市', '豊橋市', '岡崎市', '一宮市', '春日井市', '豊田市', '安城市', '西尾市', '小牧市', '稲沢市'],
    '岐阜県': ['岐阜市', '大垣市', '各務原市', '多治見市', '可児市', '関市'],
    '三重県': ['津市', '四日市市', '鈴鹿市', '桑名市', '松阪市', '伊勢市'],
  };
  const rows = [];
  Object.keys(list).forEach(function (pref) {
    list[pref].forEach(function (city) {
      rows.push([pref, city, '', '', 'URL未設定']);
    });
  });
  return rows;
}

/** Chat 通知の疎通確認用（メニューから実行） */
function testChatNotification() {
  const result = postToChat_('【テスト】農地転用見積システムからの通知テストです。');
  notifyUser_(result.ok ? 'Chat への通知に成功しました。' : 'Chat への通知に失敗しました：' + result.message);
}

/** スプレッドシート上ならダイアログ、そうでなければログに出す */
function notifyUser_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log(message); // エディタから直接実行した場合など
  }
}
