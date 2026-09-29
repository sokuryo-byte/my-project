/**
 * ============================================================
 *  初期セットアップ・スプレッドシートのメニュー
 * ============================================================
 *  setupSpreadsheet() は何度実行しても安全です（既存データは消しません）。
 *  ・シートが無ければ作成
 *  ・見出しが無い／足りなければ追記
 *  ・マスタが空のときだけサンプル行を投入
 */

/** スプレッドシートを開いたときにメニューを追加する */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('農地転用システム')
    .addItem('初期セットアップ（シート作成）', 'setupSpreadsheet')
    .addItem('Google Chat 通知テスト', 'testChatNotification')
    .addToUi();
}

/** 案件一覧シート・マスタシートを作成／整備する */
function setupSpreadsheet() {
  const ss = getSpreadsheet_();

  // --- 案件一覧 ---
  const caseSheet = getOrCreateSheet_(ss, SHEET_NAMES.CASES);
  ensureHeaders_(caseSheet, CASE_COLUMNS.map(function (c) { return c.header; }));
  formatCaseSheet_(caseSheet);

  // --- マスタ ---
  const masterSheet = getOrCreateSheet_(ss, SHEET_NAMES.MASTER);
  ensureHeaders_(masterSheet, MASTER_HEADERS);
  if (masterSheet.getLastRow() <= 1) {
    const rows = getSampleMasterRows_();
    masterSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  masterSheet.setColumnWidth(2, 140);
  masterSheet.setColumnWidths(3, 2, 320);

  notifyUser_('初期セットアップが完了しました。');
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

/** 案件一覧の表示形式（日時・金額・チェックボックス）を設定する */
function formatCaseSheet_(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  sheet.getRange(2, colIndexOf_('receivedAt'), maxRows - 1, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  sheet.getRange(2, colIndexOf_('area'), maxRows - 1, 1).setNumberFormat('#,##0.00');
  sheet.getRange(2, colIndexOf_('estimate'), maxRows - 1, 1).setNumberFormat('¥#,##0');
  sheet.setColumnWidth(colIndexOf_('estimateDetail'), 320);
  sheet.setColumnWidth(colIndexOf_('plan'), 240);
}

/**
 * マスタのサンプル行（愛知・岐阜・三重）。
 * URLは各自治体のページを確認のうえ、シート上で直接入力してください。
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
