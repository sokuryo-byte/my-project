// このファイルは tools/build_dist.py で src/ から自動生成しています。修正は src/ で行ってください。

// ===== Config.gs =====
/**
 * ============================================================
 *  農地転用見積・調査支援システム ― 設定ファイル
 * ============================================================
 *  シート名・通知先・選択肢など「運用で変わりうる値」はここに集約します。
 *  ※見積金額はスプレッドシートの「見積設定」シートで変更できます（コード修正不要）。
 *    ここにある金額は、そのシートが無い／読めないときの予備（初期値）です。
 */

// ------------------------------------------------------------
// スプレッドシート
// ------------------------------------------------------------

/**
 * 保存先スプレッドシートのID。
 * ・スプレッドシートに紐づいたスクリプト（拡張機能 > Apps Script から作成）の場合は空文字のままでOK。
 * ・スタンドアロンのスクリプトで使う場合は、URLの /d/ と /edit の間の文字列を設定してください。
 */
const SPREADSHEET_ID = '';

/** シート名（変更する場合は、実際のシート名も合わせて変更してください） */
const SHEET_NAMES = {
  CASES: '案件一覧',
  LOTS: '物件明細',
  MASTER: 'マスタ',
  FEES: '見積設定',
};

// ------------------------------------------------------------
// Google Chat 通知
// ------------------------------------------------------------

/**
 * Google Chat の Incoming Webhook URL。
 * Chat のスペース > アプリと統合 > Webhook を追加 で発行したURLを貼り付けてください。
 * ※スクリプト プロパティ「CHAT_WEBHOOK_URL」に登録した場合はそちらが優先されます。
 */
const CHAT_WEBHOOK_URL = '';

// ------------------------------------------------------------
// Google ドライブ（添付資料の保存先）
// ------------------------------------------------------------

/**
 * 添付資料を保存するフォルダのID（URLの /folders/ の後ろの文字列）。
 * 空の場合は「初期セットアップ」実行時に「農地転用_案件資料」フォルダを自動作成し、
 * そのIDをスクリプト プロパティ「DRIVE_ROOT_FOLDER_ID」に保存します。
 * 行政班のメンバーには、このフォルダを共有しておいてください。
 */
const DRIVE_ROOT_FOLDER_ID = '';

/** 送信前にアップロードされたファイルを一時的に置くサブフォルダ名 */
const DRIVE_PENDING_FOLDER_NAME = '_受付中（未送信）';

/** 1ファイルあたりの上限（MB） */
const MAX_UPLOAD_MB = 10;

/** アップロードを許可するファイル形式 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/tiff',
];

// ------------------------------------------------------------
// 行政班（受任側）の管理画面
// ------------------------------------------------------------

/**
 * 管理画面（Webアプリの URL に ?page=admin を付けたもの）を使えるメールアドレス。
 * スクリプト プロパティ「ADMIN_EMAILS」にカンマ区切りで登録した場合はそちらが優先されます。
 */
const ADMIN_EMAILS = [
  // 'sho@example.co.jp',
];

/** 案件の対応状況（管理画面のプルダウン）。先頭が新規受付時の初期値 */
const CASE_STATUSES = ['新規', '調査中', '正式見積提示済', '受任', '完了', '失注・取下げ'];

// ------------------------------------------------------------
// 概算見積のルール（予備の初期値。実際の金額は「見積設定」シートで管理）
// ------------------------------------------------------------

/**
 * 見積の項目。key は「見積設定」シートのキー列と対応します（key は変更しないでください）。
 * zone を持つ項目は基本報酬、それ以外は加算です。
 */
const DEFAULT_FEES = [
  { key: 'BASE_SHIGAIKA', zone: '市街化区域', label: '基本報酬（市街化区域：農地法第4条/5条 届出）', amount: 50000,
    note: '市街化区域、または区域が「分からない」場合に適用' },
  { key: 'BASE_CHOSEI', zone: '市街化調整区域', label: '基本報酬（市街化調整区域：農地法第4条/5条 許可）', amount: 120000,
    note: '市街化調整区域の場合に適用' },
  { key: 'BASE_HISENBIKI', zone: '非線引き区域', label: '基本報酬（非線引き区域：農地法第4条/5条 許可）', amount: 120000,
    note: '非線引き区域の場合に適用' },
  { key: 'ADD_NOSHIN', label: '農振除外手続き 加算', amount: 150000,
    note: '農振農用地「はい」の場合に加算' },
  { key: 'ADD_LAND_IMPROVEMENT', label: '土地改良区 地区除外手続き 加算', amount: 50000,
    note: '土地改良区「はい」の場合に加算' },
  { key: 'ADD_ALREADY_CONVERTED', label: '現況是正・事後手続き（始末書等）加算', amount: 50000,
    note: '既に転用済み「はい」、または現況が駐車場・宅地・資材置場の物件がある場合に加算' },
  { key: 'ADD_PER_EXTRA_LOT', label: '物件（筆）追加 加算（1筆あたり）', amount: 10000,
    note: '同じ申請に含まれる2筆目以降の物件1筆ごとに加算' },
];

/**
 * 区域が「分からない」場合に仮で使う区域区分。
 * 原則として届出（市街化区域）前提で計算し、区域の確認は行政班が行います。
 */
const FALLBACK_ZONE_FOR_UNKNOWN = '市街化区域';

/** 「既に転用済み」とみなす現況利用（事後手続き加算の対象） */
const CONVERTED_LAND_USES = ['駐車場', '宅地', '資材置場'];

/** 「現況が農地」とみなす現況利用（この場合「今後の転用計画」が必須） */
const FARMLAND_LAND_USES = ['耕作中', '休耕・荒地'];

/** 1件の依頼で入力できる物件（筆）の上限 */
const MAX_LOTS = 30;

// ------------------------------------------------------------
// フォームの選択肢（ここを編集すると画面の選択肢が変わります）
// ------------------------------------------------------------

/** 物件所在地の都道府県の初期値（プルダウンの先頭に表示） */
const DEFAULT_PREFECTURE = '愛知県';

const FORM_OPTIONS = {
  zones: ['市街化区域', '市街化調整区域', '非線引き区域', '分からない'],
  yesNoUnknown: ['はい', 'いいえ', '分からない'],
  yesNo: ['はい', 'いいえ'],
  chimoku: ['田', '畑', '宅地', '雑種地', '山林', '原野', 'その他'],
  landUses: ['耕作中', '休耕・荒地', '駐車場', '宅地', '資材置場', 'その他'],
  documents: ['謄本', '公図', '住宅地図', '課税明細', 'その他'],
};

// ------------------------------------------------------------
// 案件一覧シートの列定義
// ------------------------------------------------------------

/**
 * 案件一覧シートの列。上から順に A列, B列, ... となります。
 * 列を追加したい場合は、この配列の「末尾」に追加し、
 * メニュー「初期セットアップ」を再実行すると見出しが追記されます。
 */
const CASE_COLUMNS = [
  { key: 'id', header: 'ID' },
  { key: 'receivedAt', header: '受付日時' },
  { key: 'requesterName', header: '依頼者名' },
  // 物件ごとの詳細は「物件明細」シート。ここは全物件のまとめ（一覧で見やすくするため）
  { key: 'address', header: '物件所在地（1件目）' },
  { key: 'lotNumber', header: '地番（全物件）' },
  { key: 'chimoku', header: '地目（全物件）' },
  { key: 'area', header: '面積合計（登記地積㎡）' },
  { key: 'zone', header: '区域区分（全物件）' },
  { key: 'isNoshin', header: '農振農用地（いずれか）' },
  { key: 'landUse', header: '現況利用（全物件）' },
  { key: 'isConverted', header: '既に転用済み（いずれか）' },
  { key: 'plan', header: '今後の転用計画' },
  { key: 'landImprovement', header: '土地改良区の有無（全物件）' },
  { key: 'documents', header: '添付資料の有無' },
  { key: 'estimate', header: '概算見積金額' },
  { key: 'requestFlag', header: '見積調査依頼フラグ' },
  // ---- 補助列 ----
  { key: 'prefecture', header: '都道府県' },
  { key: 'municipality', header: '市区町村（所在から自動）' },
  { key: 'waterAssociation', header: '水利組合・農事組合の有無' },
  { key: 'estimateDetail', header: '見積内訳' },
  { key: 'submittedBy', header: '入力者（Googleアカウント）' },
  { key: 'notifyResult', header: 'Chat通知結果' },
  // ---- 添付資料・行政班の対応管理 ----
  { key: 'folderUrl', header: '資料フォルダURL' },
  { key: 'fileCount', header: 'アップロード件数' },
  { key: 'status', header: '対応状況' },
  { key: 'assignee', header: '担当者' },
  { key: 'formalEstimate', header: '正式見積金額' },
  { key: 'adminMemo', header: '対応メモ' },
  { key: 'updatedAt', header: '最終更新' },
  { key: 'lotCount', header: '物件数（筆）' },
];

/**
 * 物件明細シートの列（1物件＝1行）。案件IDで案件一覧とつながります。
 * 列を追加する場合は末尾に追加してください。
 */
const LOT_COLUMNS = [
  { key: 'caseId', header: '案件ID' },
  { key: 'no', header: '物件No' },
  { key: 'address', header: '所在' },
  { key: 'lotNumber', header: '地番' },
  { key: 'chimoku', header: '地目' },
  { key: 'area', header: '面積（登記地積㎡）' },
  { key: 'zone', header: '区域区分' },
  { key: 'isNoshin', header: '農振農用地' },
  { key: 'landUse', header: '現況利用' },
  { key: 'isConverted', header: '既に転用済み' },
  { key: 'landImprovement', header: '土地改良区' },
  { key: 'municipality', header: '市区町村（所在から自動）' },
  { key: 'readFromTohon', header: '謄本から読取' },
];

/** 管理画面から編集できる列（これ以外は管理画面から書き換えない） */
const ADMIN_EDITABLE_KEYS = ['status', 'assignee', 'formalEstimate', 'adminMemo'];

/** マスタシートの列（見出し） */
const MASTER_HEADERS = ['都道府県', '市区町村', '都市計画情報URL', '農振図URL', '備考'];

/** 見積設定シートの列（見出し） */
const FEE_HEADERS = ['キー（変更しない）', '項目名（見積に表示）', '金額（円・税込）', '適用条件（説明）'];


// ===== Setup.gs =====
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


// ===== WebApp.gs =====
/**
 * ============================================================
 *  Webアプリ（画面表示と、依頼画面から呼ばれるAPI）
 * ============================================================
 *  URL                → 依頼画面（Index.html）
 *  URL?page=admin     → 行政班の管理画面（Admin.html、ADMIN_EMAILS のみ）
 *
 *  依頼画面からは google.script.run で以下の関数だけを呼びます。
 *    - getInitialData()          : プルダウン用のマスタ・選択肢
 *    - previewEstimate(form)     : 概算見積の再計算（保存しない）
 *    - uploadAttachment(file)    : 資料ファイルを一時フォルダへ保存
 *    - removeAttachment(fileId)  : アップロードの取り消し
 *    - submitCase(form, request) : 保存（＋ request=true なら Chat 通知）
 *  関数名の末尾が「_」の関数は、画面から直接呼べない内部用関数です。
 */

/** Webアプリの入口 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.page === 'admin') {
    if (!isAdmin_()) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:sans-serif;padding:24px">管理画面を表示する権限がありません。' +
        '行政班の担当者にお問い合わせください。</p>').setTitle('権限がありません');
    }
    const t = HtmlService.createTemplateFromFile('Admin');
    t.initialId = String(params.id || '').replace(/\D/g, ''); // 通知のリンクから開いた案件
    return t.evaluate()
      .setTitle('農地転用 案件管理（行政班）')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('農地転用 見積・調査依頼フォーム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // 社内ポータル（Google サイト等）のページに埋め込めるようにする。
    // アクセスできる人は Webアプリのデプロイ設定（組織内のみ）で制限されている。管理画面は埋め込み不可のまま。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** HTMLテンプレートから別ファイル（CSS/JS）を読み込む */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 画面の初期表示に必要なデータを返す */
function getInitialData() {
  return {
    options: FORM_OPTIONS,
    farmlandUses: FARMLAND_LAND_USES,
    defaultPrefecture: DEFAULT_PREFECTURE,
    maxLots: MAX_LOTS,
    master: getMasterList_(),
    userEmail: getUserEmail_(),
    upload: { maxMb: MAX_UPLOAD_MB, mimeTypes: ALLOWED_MIME_TYPES },
  };
}

/** 入力途中の内容で概算見積を計算して返す（保存はしない） */
function previewEstimate(form) {
  return calculateEstimate_(normalizeInput_(form));
}

/** 資料ファイルを一時フォルダへ保存する（ドラッグ直後に呼ばれる） */
function uploadAttachment(file) {
  return saveUploadedFile_(file);
}

/** アップロードを取り消す（一時フォルダ内のファイルのみ削除可能） */
function removeAttachment(fileId) {
  return trashPendingFile_(fileId);
}

/**
 * アップロード済みの謄本を読み取り、物件の候補を返す。
 * 読み取りに失敗しても例外にはせず、メッセージを返す（手入力で続けられるように）。
 */
function readTohon(fileId) {
  try {
    return readTohonFile_(fileId);
  } catch (e) {
    return { lots: [], message: '謄本を読み取れませんでした（' + (e && e.message || e) + '）。手入力してください。' };
  }
}

/**
 * 案件を保存し、依頼の場合は Chat に通知する。
 * @param {Object} form 画面の入力値
 * @param {boolean} requestInvestigation true=見積調査依頼（通知あり） / false=保存のみ
 */
function submitCase(form, requestInvestigation) {
  const input = normalizeInput_(form);
  const errors = validateInput_(input);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  const estimate = calculateEstimate_(input);
  const isRequest = requestInvestigation === true;
  const summary = summarizeLots_(input.lots);

  // 1) 保存（通知より先に保存し、以降が失敗しても記録が残るようにする）
  const saved = appendCase_(Object.assign({}, summary, {
    receivedAt: new Date(),
    requesterName: input.requesterName,
    plan: input.plan,
    documents: input.documents.join(','),
    estimate: estimate.ok ? estimate.total : '',
    requestFlag: isRequest,
    prefecture: input.prefecture,
    waterAssociation: input.waterAssociation,
    estimateDetail: estimateToText_(estimate),
    submittedBy: input.submittedBy,
    notifyResult: isRequest ? '送信中' : '通知なし（保存のみ）',
    status: CASE_STATUSES[0],
    updatedAt: new Date(),
    lotCount: input.lots.length,
  }));
  appendLots_(saved.id, input.lots.map(function (l) {
    return {
      address: l.address, lotNumber: l.lotNumber, chimoku: l.chimoku, area: l.area === null ? '' : l.area,
      zone: l.zone, isNoshin: toSheetBool_(l.isNoshin), landUse: l.landUseText,
      isConverted: toSheetBool_(l.isConverted), landImprovement: l.landImprovement,
      municipality: l.municipality, readFromTohon: l.readFromTohon ? '謄本から読取' : '',
    };
  }));

  // 2) 資料フォルダの作成とファイル移動（失敗しても案件は残す）
  let attach = { folderUrl: '', count: 0, errors: [] };
  try {
    attach = attachFilesToCase_(saved.id, input);
    updateCaseCells_(saved.row, { folderUrl: attach.folderUrl, fileCount: attach.count });
  } catch (e) {
    attach.errors.push('資料フォルダの作成に失敗：' + (e && e.message || e));
  }

  // 3) 通知（依頼の場合のみ）→ 結果をシートに書き戻す
  let notify = { ok: false, message: '通知なし（保存のみ）' };
  if (isRequest) {
    notify = postToChat_(buildRequestMessage_(saved.id, input, estimate, saved.url, attach));
    updateCaseCell_(saved.row, 'notifyResult', notify.ok ? '送信済み' : '失敗：' + notify.message);
  }

  return {
    id: saved.id,
    estimate: estimate,
    notified: notify.ok,
    notifyMessage: notify.message,
    fileCount: attach.count,
    attachErrors: attach.errors,
  };
}

/**
 * 複数物件を、案件一覧の1行に載せるための「まとめ」にする。
 * 物件ごとの正確な値は物件明細シートにある。
 */
function summarizeLots_(lots) {
  const uniq = function (key) {
    return lots.map(function (l) { return l[key]; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('・');
  };
  const any = function (key, value) { return lots.some(function (l) { return l[key] === value; }); };
  const areas = lots.map(function (l) { return l.area; }).filter(function (a) { return a !== null; });
  const triState = function (key) {
    if (any(key, 'はい')) return true;
    if (any(key, '分からない')) return '不明';
    if (lots.length && lots.every(function (l) { return l[key] === 'いいえ'; })) return false;
    return '';
  };
  return {
    address: lots.length ? lots[0].address + (lots.length > 1 ? ' 他' + (lots.length - 1) + '件' : '') : '',
    lotNumber: lots.map(function (l) { return l.lotNumber; }).join('、'),
    chimoku: uniq('chimoku'),
    area: areas.length ? Math.round(areas.reduce(function (s, a) { return s + a; }, 0) * 100) / 100 : '',
    zone: uniq('zone'),
    isNoshin: triState('isNoshin'),
    landUse: uniq('landUseText'),
    isConverted: triState('isConverted'),
    landImprovement: any('landImprovement', 'はい') ? 'はい' : any('landImprovement', '分からない') ? '分からない' : uniq('landImprovement'),
    municipality: uniq('municipality'),
  };
}

// ------------------------------------------------------------
// 入力の整形・チェック
// ------------------------------------------------------------

/** 文字列を整える（前後空白の除去・長さ制限） */
function str_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);
}

/** 選択肢に含まれる値だけを通す（それ以外は空文字） */
function pick_(v, list) {
  const s = str_(v);
  return list.indexOf(s) >= 0 ? s : '';
}

/**
 * 画面の入力値を扱いやすい形に整える（前後空白の除去、選択肢外の値の除外など）。
 * 画面側の値を信用しすぎないよう、サーバー側で必ずここを通す。
 */
function normalizeInput_(form) {
  const f = form || {};
  const prefecture = str_(f.prefecture, 10) || DEFAULT_PREFECTURE;

  // アップロード済みファイル（ID と資料種別）
  const attachments = (Array.isArray(f.attachments) ? f.attachments : [])
    .map(function (a) { return { fileId: str_(a && a.fileId, 100), docType: pick_(a && a.docType, FORM_OPTIONS.documents) }; })
    .filter(function (a) { return a.fileId && a.docType; })
    .slice(0, 50);

  // 手元にある資料 ＝ チェックされた種別 ＋ ファイルがアップロードされた種別
  const types = (Array.isArray(f.documents) ? f.documents : [])
    .map(function (d) { return pick_(d, FORM_OPTIONS.documents); })
    .concat(attachments.map(function (a) { return a.docType; }));
  const docsOther = str_(f.documentsOther, 100);
  const documents = FORM_OPTIONS.documents
    .filter(function (d) { return types.indexOf(d) >= 0; })
    .map(function (d) { return d === 'その他' && docsOther ? 'その他（' + docsOther + '）' : d; });

  const master = getMasterList_();
  const lots = (Array.isArray(f.lots) ? f.lots : [])
    .slice(0, MAX_LOTS)
    .map(function (l) { return normalizeLot_(l || {}, prefecture, master); });

  return {
    requesterName: str_(f.requesterName, 50),
    prefecture: prefecture,
    lots: lots,
    plan: str_(f.plan, 1000),
    waterAssociation: pick_(f.waterAssociation, FORM_OPTIONS.yesNoUnknown),
    documents: documents,
    attachments: attachments,
    submittedBy: getUserEmail_(),
  };
}

/** 物件1件分の入力を整える */
function normalizeLot_(l, prefecture, master) {
  // 所在は「市区町村〜」を1欄で受け取り、市区町村はマスタとの前方一致で取り出す（一致しなければ空欄）
  let address = str_(l.address);
  if (address.indexOf(prefecture) === 0) address = address.slice(prefecture.length).trim();

  const areaText = str_(l.area).replace(/[,，]/g, '');
  const landUse = pick_(l.landUse, FORM_OPTIONS.landUses);
  const landUseOther = str_(l.landUseOther, 100);

  return {
    address: address,
    municipality: detectMunicipality_(prefecture, address, master),
    lotNumber: str_(l.lotNumber, 100),
    chimoku: pick_(l.chimoku, FORM_OPTIONS.chimoku),
    area: areaText === '' ? null : Number(areaText),
    zone: pick_(l.zone, FORM_OPTIONS.zones),
    isNoshin: pick_(l.isNoshin, FORM_OPTIONS.yesNoUnknown),
    landUse: landUse,
    // シートには「選択肢（補足）」の形で保存する
    landUseText: landUseOther ? (landUse ? landUse + '（' + landUseOther + '）' : landUseOther) : landUse,
    isConverted: pick_(l.isConverted, FORM_OPTIONS.yesNo),
    landImprovement: pick_(l.landImprovement, FORM_OPTIONS.yesNoUnknown),
    readFromTohon: l.readFromTohon === true,
  };
}

/**
 * 所在の先頭がマスタの市区町村名と一致すれば、その市区町村名を返す（長い名前を優先）。
 * 文字列の前方一致だけで、推測はしない。
 */
function detectMunicipality_(prefecture, address, master) {
  return (master || getMasterList_())
    .filter(function (m) { return m.prefecture === prefecture && address.indexOf(m.municipality) === 0; })
    .map(function (m) { return m.municipality; })
    .sort(function (a, b) { return b.length - a.length; })[0] || '';
}

/** 保存前の必須チェック。エラーメッセージの配列を返す（空ならOK） */
function validateInput_(input) {
  const errors = [];
  if (!input.requesterName) errors.push('依頼者名を入力してください。');
  if (!input.lots.length) errors.push('物件を1件以上入力してください。');
  input.lots.forEach(function (l, i) {
    const name = '物件' + (i + 1) + '：';
    if (!l.lotNumber) errors.push(name + '地番を入力してください。');
    if (!l.zone) errors.push(name + '区域区分を選択してください（不明な場合は「分からない」）。');
    if (l.area !== null && (isNaN(l.area) || l.area < 0)) errors.push(name + '面積は0以上の数値で入力してください。');
  });
  const farmland = input.lots.filter(function (l) { return FARMLAND_LAND_USES.indexOf(l.landUse) >= 0; });
  if (farmland.length && !input.plan) {
    errors.push('現況が農地（' + farmland[0].landUse + '）の物件があるため、今後の転用計画を入力してください。');
  }
  return errors;
}

/** 「はい／いいえ／分からない」をシート保存用の値にする（はい=TRUE, いいえ=FALSE, 分からない=「不明」） */
function toSheetBool_(answer) {
  if (answer === 'はい') return true;
  if (answer === 'いいえ') return false;
  if (answer === '分からない') return '不明';
  return '';
}

/** アクセス中のユーザーのメールアドレス（取得できない場合は空文字） */
function getUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}


// ===== Repository.gs =====
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

/**
 * 物件明細シートに、案件の物件をまとめて追加する（1物件＝1行）。
 * @param {number} caseId
 * @param {Array<Object>} lots LOT_COLUMNS の key を持つオブジェクト（caseId, no は不要）
 */
function appendLots_(caseId, lots) {
  if (!lots.length) return;
  const sheet = getSheet_(SHEET_NAMES.LOTS);
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


// ===== Estimate.gs =====
/**
 * ============================================================
 *  概算見積の計算（ルールベース）
 * ============================================================
 *  概算見積金額 = 基本報酬 + 各種加算の合計
 *  金額・項目名は「見積設定」シートで変更できます（再デプロイ不要）。
 *  シートの値が読めない項目は、Config.gs の DEFAULT_FEES を使います。
 *  AI等による自動判定は行わず、入力値だけで機械的に計算します。
 */

/**
 * 見積設定を読み込む。
 * @return {Object<string, {label:string, amount:number, zone:string}>} key → 設定
 */
function getFeeSettings_() {
  const fees = {};
  DEFAULT_FEES.forEach(function (d) {
    fees[d.key] = { label: d.label, amount: d.amount, zone: d.zone || '' };
  });

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.FEES);
  if (!sheet || sheet.getLastRow() < 2) return fees;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (r) {
    const key = String(r[0]).trim();
    if (!fees[key]) return; // 知らないキーは無視
    const label = String(r[1]).trim();
    const amount = Number(String(r[2]).replace(/[,，¥円\s]/g, ''));
    if (label) fees[key].label = label;
    if (r[2] !== '' && !isNaN(amount) && amount >= 0) fees[key].amount = amount;
  });
  return fees;
}

/**
 * 入力内容から概算見積を計算する（複数物件対応）。
 *  ・基本報酬：区域区分ごとに1回（同じ区域の物件は1つの申請にまとめる想定）
 *  ・物件追加：申請数を超える物件1筆ごとに加算
 *  ・農振除外／地区除外／事後手続き：該当する物件が1つでもあれば1回加算
 * @param {Object} input normalizeInput_() で整えた入力（input.lots に物件の配列）
 * @return {{ok:boolean, total:number, items:Array<{label:string, amount:number}>, notes:string[]}}
 */
function calculateEstimate_(input) {
  const fees = getFeeSettings_();
  const lots = input.lots || [];
  const items = [];
  const notes = [];
  const item = function (key, times) {
    const n = times || 1;
    return { label: fees[key].label + (n > 1 ? ' × ' + n : ''), amount: fees[key].amount * n };
  };
  const lotName = function (lot, i) { return '物件' + (i + 1) + (lot.lotNumber ? '（' + lot.lotNumber + '）' : ''); };

  if (!lots.length || lots.some(function (l) { return !l.zone; })) {
    return { ok: false, total: 0, items: [], notes: ['すべての物件の区域区分を選択すると概算見積が表示されます。'] };
  }

  // --- 1. 基本報酬（区域区分ごとに1回） ---
  const zones = [];
  lots.forEach(function (lot, i) {
    let zone = lot.zone;
    if (zone === '分からない') {
      zone = FALLBACK_ZONE_FOR_UNKNOWN;
      notes.push(lotName(lot, i) + 'は区域が不明のため「' + zone + '」（届出）として仮計算しています。区域は行政班が確認します。');
    }
    if (zones.indexOf(zone) < 0) zones.push(zone);
  });
  for (let z = 0; z < zones.length; z++) {
    const baseKey = Object.keys(fees).filter(function (k) { return fees[k].zone === zones[z]; })[0];
    if (!baseKey) {
      return { ok: false, total: 0, items: [], notes: ['区域「' + zones[z] + '」の基本報酬が設定されていません。'] };
    }
    items.push(item(baseKey));
  }
  if (zones.length > 1) {
    notes.push('区域区分の異なる物件が含まれるため、申請を' + zones.length + '件に分ける想定で計算しています。');
  }

  // --- 2. 物件（筆）追加 加算 ---
  const extraLots = lots.length - zones.length;
  if (extraLots > 0) items.push(item('ADD_PER_EXTRA_LOT', extraLots));

  // --- 3. 農振除外 加算 ---
  const noshinYes = lots.filter(function (l) { return l.isNoshin === 'はい'; });
  if (noshinYes.length) {
    items.push(item('ADD_NOSHIN'));
    if (noshinYes.some(function (l) { return l.zone === '市街化区域'; })) {
      notes.push('市街化区域の物件で農振農用地「はい」となっています。通常は重複しないため、農振図を再確認してください。');
    }
  } else if (lots.some(function (l) { return l.isNoshin === '分からない'; })) {
    notes.push('農振農用地の物件がある場合は +' + formatYen_(fees.ADD_NOSHIN.amount) + '（農振除外）が見込まれます。');
  }

  // --- 4. 土地改良区 地区除外 加算 ---
  if (lots.some(function (l) { return l.landImprovement === 'はい'; })) {
    items.push(item('ADD_LAND_IMPROVEMENT'));
  } else if (lots.some(function (l) { return l.landImprovement === '分からない'; })) {
    notes.push('土地改良区の区域内の物件がある場合は +' + formatYen_(fees.ADD_LAND_IMPROVEMENT.amount) + '（地区除外）が見込まれます。');
  }

  // --- 5. 現況是正・事後手続き 加算 ---
  const converted = lots.filter(function (l) {
    return l.isConverted === 'はい' || CONVERTED_LAND_USES.indexOf(l.landUse) >= 0;
  });
  if (converted.length) {
    items.push(item('ADD_ALREADY_CONVERTED'));
    converted.forEach(function (l) {
      if (l.isConverted !== 'はい') {
        notes.push(lotName(l, lots.indexOf(l)) + 'は現況が「' + l.landUse + '」のため、転用済み（事後手続き）として加算しています。');
      }
    });
  }

  const total = items.reduce(function (sum, it) { return sum + it.amount; }, 0);
  notes.push('ルールに基づく目安です。正式なお見積りは行政班の調査後にご案内します。');
  return { ok: true, total: total, items: items, notes: notes };
}

/** 見積内訳をシート保存用の1つの文字列にする */
function estimateToText_(estimate) {
  if (!estimate.ok) return estimate.notes.join('\n');
  return estimate.items
    .map(function (it) { return '・' + it.label + '：' + formatYen_(it.amount); })
    .concat(estimate.notes.map(function (n) { return '※' + n; }))
    .join('\n');
}

/** 金額を「¥123,456」形式にする */
function formatYen_(amount) {
  // toLocaleString は実行環境差があるため、正規表現で3桁区切りにする
  return '¥' + String(Math.round(Number(amount) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}


// ===== Drive.gs =====
/**
 * ============================================================
 *  添付資料（Google ドライブ）
 * ============================================================
 *  流れ：
 *   1) 画面でファイルをドラッグ → すぐに「_受付中（未送信）」フォルダへアップロード
 *   2) 送信時に、案件ごとのフォルダ（例：0042_豊田市_123番1）へ移動し、ファイル名に資料種別を付ける
 *   3) 送信されずに残った一時ファイルは、メニューから一括削除できる
 *  ファイルはWebアプリをデプロイしたアカウントのドライブに保存されます。
 */

/** 資料保存用のルートフォルダ（無ければ作成してIDを記録） */
function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = DRIVE_ROOT_FOLDER_ID || props.getProperty('DRIVE_ROOT_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);

  const folder = DriveApp.createFolder('農地転用_案件資料');
  props.setProperty('DRIVE_ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/** 送信前ファイルを置く一時フォルダ（ルート直下。無ければ作成） */
function getPendingFolder_() {
  const root = getRootFolder_();
  const it = root.getFoldersByName(DRIVE_PENDING_FOLDER_NAME);
  return it.hasNext() ? it.next() : root.createFolder(DRIVE_PENDING_FOLDER_NAME);
}

/**
 * 画面から受け取ったファイルを一時フォルダに保存する。
 * @param {{name:string, mimeType:string, data:string}} file data は Base64
 * @return {{fileId:string, name:string, size:number}}
 */
function saveUploadedFile_(file) {
  const mimeType = String(file && file.mimeType || '');
  if (ALLOWED_MIME_TYPES.indexOf(mimeType) < 0) {
    throw new Error('この形式のファイルはアップロードできません（PDF・画像のみ）：' + (file && file.name));
  }
  const bytes = Utilities.base64Decode(String(file.data || ''));
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error('ファイルサイズが上限（' + MAX_UPLOAD_MB + 'MB）を超えています：' + file.name);
  }
  const name = sanitizeFileName_(file.name);
  const saved = getPendingFolder_().createFile(Utilities.newBlob(bytes, mimeType, name));
  saved.setDescription('アップロード者：' + getUserEmail_());
  return { fileId: saved.getId(), name: name, size: bytes.length };
}

/**
 * 一時フォルダ内のファイルだけを取得する。
 * デプロイ者のドライブにある他のファイルを画面から操作されないよう、必ずここを通す。
 */
function getPendingFileOrNull_(fileId) {
  try {
    const file = DriveApp.getFileById(String(fileId));
    const pendingId = getPendingFolder_().getId();
    const parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === pendingId) return file;
    }
  } catch (e) {
    // IDが不正・削除済みなど
  }
  return null;
}

/** 送信前に取り消したファイルをゴミ箱へ移動する */
function trashPendingFile_(fileId) {
  const file = getPendingFileOrNull_(fileId);
  if (file) file.setTrashed(true);
  return true;
}

/**
 * 案件フォルダを作り、一時フォルダのファイルを移動する。
 * @param {number} caseId
 * @param {Object} input normalizeInput_() の結果
 * @return {{folderUrl:string, count:number, errors:string[]}}
 */
function attachFilesToCase_(caseId, input) {
  const first = input.lots[0] || { municipality: '', address: '', lotNumber: '' };
  const folderName = [('0000' + caseId).slice(-4), first.municipality || first.address.slice(0, 20),
    first.lotNumber + (input.lots.length > 1 ? '他' + (input.lots.length - 1) + '筆' : '')]
    .filter(String).join('_');
  const folder = getRootFolder_().createFolder(sanitizeFileName_(folderName));
  const errors = [];
  let count = 0;

  input.attachments.forEach(function (a) {
    const file = getPendingFileOrNull_(a.fileId);
    if (!file) {
      errors.push('ファイルが見つかりません（' + a.fileId + '）');
      return;
    }
    file.setName('[' + a.docType + '] ' + file.getName());
    file.moveTo(folder);
    count++;
  });
  return { folderUrl: folder.getUrl(), count: count, errors: errors };
}

/** 7日以上前に一時フォルダへアップロードされ、送信されなかったファイルを削除する（メニューから実行） */
function cleanupPendingUploads() {
  const limit = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const files = getPendingFolder_().getFiles();
  let n = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated() < limit) {
      f.setTrashed(true);
      n++;
    }
  }
  notifyUser_(n + '件の未送信ファイルをゴミ箱へ移動しました。');
}

/** ファイル名・フォルダ名に使えない文字を除去する */
function sanitizeFileName_(name) {
  const s = String(name || 'file').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return s.slice(0, 120) || 'file';
}


// ===== Tohon.gs =====
/**
 * ============================================================
 *  謄本（登記事項証明書）の読み取り
 * ============================================================
 *  1) アップロードされた謄本（PDF・画像）を Google ドライブの OCR で文字にする
 *  2) 決まったパターン（「所在」「○番○ 畑 496」など）に当てはまる部分だけを取り出す
 *  AI による推測はしません。読み取れなかった項目は空欄のまま返し、
 *  画面では「謄本から読取・要確認」と表示して、必ず人が確認する前提です。
 *
 *  ※Apps Script の「サービス」で Drive API（v3）を有効にしておく必要があります
 *    （appsscript.json に設定済み）。
 */

/** 地目として認識する語（長い語を先に並べる：「用悪水路」と「水路」などの誤一致を防ぐ） */
const TOHON_CHIMOKU_WORDS = [
  '公衆用道路', '用悪水路', '学校用地', '鉄道用地', '水道用地', '境内地', '雑種地', '保安林', 'ため池',
  '宅地', '山林', '原野', '牧場', '池沼', '墓地', '井溝', '鉱泉地', '塩田', '運河用地', '堤', '田', '畑',
];

/**
 * 一時フォルダ内の謄本ファイルを読み取る。
 * @param {string} fileId アップロード済みファイルのID（一時フォルダ内のものに限る）
 * @return {{lots: Array<{address:string, lotNumber:string, chimoku:string, chimokuRaw:string, area:string}>, message:string}}
 */
function readTohonFile_(fileId) {
  const file = getPendingFileOrNull_(fileId);
  if (!file) throw new Error('読み取るファイルが見つかりません。');

  const text = ocrToText_(file);
  const lots = parseTohonText_(text);
  return {
    lots: lots,
    message: lots.length
      ? lots.length + '件の物件を読み取りました。内容を必ず確認してください。'
      : '謄本から所在・地番を読み取れませんでした。手入力してください。',
  };
}

/** ドライブの OCR で文字を取り出す（変換用に作った一時ドキュメントは必ず削除） */
function ocrToText_(file) {
  const doc = Drive.Files.copy(
    { name: 'OCR_' + file.getName(), mimeType: 'application/vnd.google-apps.document', parents: [getPendingFolder_().getId()] },
    file.getId(),
    { ocrLanguage: 'ja' }
  );
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    DriveApp.getFileById(doc.id).setTrashed(true);
  }
}

/**
 * OCR の文字から物件（所在・地番・地目・地積）を取り出す。
 * 1つのファイルに複数の謄本が入っている場合は「表題部」ごとに分けて読む。
 * 変更履歴がある場合は、最後の行（最新の記載）を採用する。
 * ※抹消事項の下線は OCR では判別できないため、最終行を最新とみなしている。
 */
function parseTohonText_(rawText) {
  const text = normalizeTohonText_(rawText);
  const sections = text.split(/表\s*題\s*部/).slice(1);
  if (!sections.length) sections.push(text);

  const chimokuPattern = TOHON_CHIMOKU_WORDS.join('|');
  // 例）「123番1 畑 496」「123番1 宅地 165 28」「123番 田 1,024」
  const rowRe = new RegExp('(\\d+番(?:\\d+)?)\\s+(' + chimokuPattern + ')\\s+(\\d[\\d,]*)(?:\\s*[:.]?\\s*(\\d{2}))?(?=\\s|$)', 'g');

  const lots = [];
  sections.forEach(function (sec) {
    // 所在：最後に出てくる「所在」行（行政区画変更などで書き換わっている場合に最新を採る）
    let address = '';
    const addrRe = /所\s*在\s+([^\n]+)/g;
    let m;
    while ((m = addrRe.exec(sec)) !== null) {
      const v = cleanTohonAddress_(m[1]);
      if (v) address = v;
    }

    // 地番・地目・地積：最後に一致した行を採用
    let row = null;
    rowRe.lastIndex = 0;
    while ((m = rowRe.exec(sec)) !== null) row = m;
    if (!row && !address) return;

    const chimokuRaw = row ? row[2] : '';
    const area = row ? row[3].replace(/,/g, '') + (row[4] ? '.' + row[4] : '') : '';
    const lot = {
      address: address,
      lotNumber: row ? row[1] : '',
      chimoku: FORM_OPTIONS.chimoku.indexOf(chimokuRaw) >= 0 ? chimokuRaw : (chimokuRaw ? 'その他' : ''),
      chimokuRaw: chimokuRaw,
      area: area,
    };
    const dup = lots.some(function (l) { return l.address === lot.address && l.lotNumber === lot.lotNumber; });
    if (!dup) lots.push(lot);
  });
  return lots;
}

/** 全角英数字・全角スペースを半角にし、改行以外の空白をそろえる */
function normalizeTohonText_(text) {
  return String(text || '')
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/　/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '');
}

/** 所在の値から「余白」や原因・日付の欄を取り除く */
function cleanTohonAddress_(value) {
  return String(value)
    .split(/余白|〔|【|\[|昭和|平成|令和|原因/)[0]
    .replace(/\s+/g, '')
    .trim();
}


// ===== Notify.gs =====
/**
 * ============================================================
 *  Google Chat 通知
 * ============================================================
 *  Incoming Webhook に JSON を POST するだけのシンプルな実装です。
 *  通知に失敗しても例外は投げず、結果を返します（保存処理を巻き戻さないため）。
 */

/** 使用する Webhook URL（スクリプトプロパティ優先 → Config.gs の定数） */
function getWebhookUrl_() {
  const fromProps = PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK_URL');
  return (fromProps || CHAT_WEBHOOK_URL || '').trim();
}

/**
 * Chat にテキストを送る。
 * @param {string} text
 * @return {{ok:boolean, message:string}}
 */
function postToChat_(text) {
  const url = getWebhookUrl_();
  if (!url) {
    return { ok: false, message: 'Webhook URLが未設定です（Config.gs の CHAT_WEBHOOK_URL）' };
  }
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true, // HTTPエラーでも例外にせず、ステータスで判定する
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true, message: '送信済み' };
    return { ok: false, message: 'HTTP ' + code + ': ' + res.getContentText().slice(0, 200) };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
}

/**
 * 見積調査依頼の通知文を組み立てる。
 * Chat の書式： *太字*、<URL|リンク文字>
 */
function buildRequestMessage_(caseId, input, estimate, rowUrl, attach) {
  const adminUrl = getAdminUrl_(caseId);
  const lines = [
    '*【農地転用】見積調査依頼が届きました*',
    '案件ID：' + caseId,
    '依頼者名：' + (input.requesterName || '（未入力）'),
    '物件：' + input.lots.length + '件（' + input.prefecture + '）',
  ];
  input.lots.forEach(function (l, i) {
    lines.push('　' + (i + 1) + '. ' + (l.address || '（所在未入力）') + ' ' + l.lotNumber +
      '／' + (l.chimoku || '地目-') + (l.area !== null ? ' ' + l.area + '㎡' : '') +
      '／' + (l.zone || '区域-') + '／農振:' + (l.isNoshin || '-') + '／現況:' + (l.landUse || '-') +
      (l.readFromTohon ? '（謄本読取）' : ''));
  });
  lines.push(
    '概算見積金額：' + (estimate.ok ? formatYen_(estimate.total) : '算出不可'),
    '手元資料：' + (input.documents.join('、') || 'なし'),
    '入力者：' + (input.submittedBy || '不明')
  );
  if (attach && attach.folderUrl) {
    lines.push('<' + attach.folderUrl + '|アップロード資料（' + attach.count + '件）を開く>');
  }
  if (attach && attach.errors.length) {
    lines.push('⚠ 資料の保存でエラー：' + attach.errors.join(' / '));
  }
  if (adminUrl) lines.push('<' + adminUrl + '|管理画面で案件を開く>');
  lines.push('<' + rowUrl + '|スプレッドシートで案件行を開く>');
  return lines.join('\n');
}

/** 管理画面で案件を開くURL（Webアプリとしてデプロイされていない場合は空文字） */
function getAdminUrl_(caseId) {
  try {
    const base = ScriptApp.getService().getUrl();
    return base ? base + '?page=admin&id=' + caseId : '';
  } catch (e) {
    return '';
  }
}


// ===== Admin.gs =====
/**
 * ============================================================
 *  行政班（受任側）の管理画面 API
 * ============================================================
 *  管理画面（Admin.html）から google.script.run で呼ばれます。
 *  すべての関数の先頭で requireAdmin_() を呼び、権限のない人には何も返しません。
 *  管理画面から書き換えられるのは ADMIN_EDITABLE_KEYS の列だけです。
 */

/** 管理画面の初期データ（案件一覧・選択肢） */
function getAdminData() {
  requireAdmin_();
  return {
    cases: getAllCases_(),
    lotsByCase: getLotsByCase_(),
    statuses: CASE_STATUSES,
    userEmail: getUserEmail_(),
  };
}

/**
 * 管理画面からの更新（対応状況・担当者・正式見積・メモ）。
 * @param {number} caseId
 * @param {Object} patch { status, assignee, formalEstimate, adminMemo }
 * @return {Object} 更新後の案件
 */
function updateCaseByAdmin(caseId, patch) {
  requireAdmin_();
  const p = patch || {};
  const values = {};

  if (p.status !== undefined) {
    if (CASE_STATUSES.indexOf(p.status) < 0) throw new Error('対応状況の値が不正です。');
    values.status = p.status;
  }
  if (p.assignee !== undefined) values.assignee = String(p.assignee).trim().slice(0, 50);
  if (p.adminMemo !== undefined) values.adminMemo = String(p.adminMemo).slice(0, 2000);
  if (p.formalEstimate !== undefined) {
    const s = String(p.formalEstimate).replace(/[,，¥円\s]/g, '');
    const n = Number(s);
    if (s !== '' && (isNaN(n) || n < 0)) throw new Error('正式見積金額は数値で入力してください。');
    values.formalEstimate = s === '' ? '' : n;
  }
  Object.keys(values).forEach(function (k) {
    if (ADMIN_EDITABLE_KEYS.indexOf(k) < 0) delete values[k]; // 念のため
  });
  values.updatedAt = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    const row = findCaseRow_(caseId);
    if (!row) throw new Error('案件ID ' + caseId + ' が見つかりません。');
    updateCaseCells_(row, values);
  } finally {
    lock.releaseLock();
  }
  return getAllCases_().filter(function (c) { return Number(c.id) === Number(caseId); })[0];
}

/** 管理者かどうか（スクリプトプロパティ ADMIN_EMAILS が優先） */
function isAdmin_() {
  const email = getUserEmail_().toLowerCase();
  if (!email) return false;
  const fromProps = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  const list = (fromProps ? fromProps.split(',') : ADMIN_EMAILS)
    .map(function (s) { return String(s).trim().toLowerCase(); })
    .filter(String);
  return list.indexOf(email) >= 0;
}

function requireAdmin_() {
  if (!isAdmin_()) throw new Error('この操作を行う権限がありません。');
}
