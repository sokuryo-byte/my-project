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
