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
  ERRORS: 'エラーログ', // 謄本読取・アップロードの失敗内容（原因調査用。初回のエラー時に自動作成）
  DELETED_CASES: '削除した案件',     // 管理画面で削除した案件の控え（初回の削除時に自動作成。戻すときはここから行をコピー）
  DELETED_LOTS: '削除した物件明細',
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
  'sokuryo@touki.bz',
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
  // 金額（税抜）は「2026基本料金改定案」行政書士シートに合わせています（備考欄に値があればそれを最新として採用、なければ報酬欄）
  { key: 'BASE_SHIGAIKA', zone: '市街化区域', label: '農地転用 第4条/第5条届出（市街化区域）', amount: 58000,
    note: '市街化区域、または区域が「分からない」場合に適用（料金表 4101/4102）' },
  { key: 'BASE_CHOSEI', zone: '市街化調整区域', label: '農地法第5条許可申請（市街化調整区域）', amount: 235000,
    note: '市街化調整区域の場合に適用（料金表 4103）' },
  { key: 'BASE_HISENBIKI', zone: '非線引き区域', label: '農地法第5条許可申請（非線引き区域）', amount: 120000,
    note: '非線引き区域の場合に適用（料金表 4103 非線引き）' },
  { key: 'BASE_KUIKIGAI', zone: '都市計画区域外', label: '農地法第5条許可申請（都市計画区域外）', amount: 150000,
    note: '都市計画区域外の場合に適用（料金表 4103 都市計画区域外）' },
  // 調査実費（区域区分ごとに1回。surveyZone で区域と対応）
  { key: 'SURVEY_SHIGAIKA', surveyZone: '市街化区域', label: '調査実費（市街化区域）', amount: 2000,
    note: '市街化区域、または区域が「分からない」場合に加算' },
  { key: 'SURVEY_CHOSEI', surveyZone: '市街化調整区域', label: '調査実費（市街化調整区域）', amount: 25000,
    note: '市街化調整区域の場合に加算' },
  { key: 'SURVEY_HISENBIKI', surveyZone: '非線引き区域', label: '調査実費（非線引き区域）', amount: 15000,
    note: '非線引き区域の場合に加算' },
  { key: 'SURVEY_KUIKIGAI', surveyZone: '都市計画区域外', label: '調査実費（都市計画区域外）', amount: 15000,
    note: '都市計画区域外の場合に加算（金額は仮に非線引き区域と同額）' },
  { key: 'ADD_NOSHIN', label: '農振除外申出', amount: 300000,
    note: '農振農用地「はい」の場合に加算（料金表 4006）' },
  { key: 'ADD_LAND_IMPROVEMENT', label: '土地改良区除外申請', amount: 40000,
    note: '土地改良区「はい」または「分からない」の物件がある場合に加算。受益地に該当しない、または地区除外の手続きが不要と確認できた物件は除く（料金表 4201）' },
  { key: 'ADD_WATER_ASSOCIATION', label: '地元承諾書（区長・水利組合等）', amount: 20000,
    note: '土地改良区に確認した地元関係者の同意（押印）が「必要」「未確認」、または土地改良区が「分からない」物件がある場合に加算' },
  { key: 'ADD_BUNKE', label: '分家建築許可申請（都市計画法43条）', amount: 300000,
    note: '転用目的が「分家住宅」で、市街化調整区域の物件がある場合に加算（料金表 4001。開発許可（29条）となる場合は 4002）' },
  { key: 'ADD_DRAINAGE', label: '排水承諾手続', amount: 40000,
    note: '転用目的が「分家住宅」で、排水承諾が「必要」「未確認」（未回答を含む）の物件がある場合に加算（料金表 4203）' },
  { key: 'ADD_GENKYO', label: '現況証明（非農地証明）願出', amount: 120000,
    note: '市街化区域外で、既に宅地など農地以外として利用されている（現況が宅地・駐車場・資材置場、または転用済み「はい」）物件がある場合に加算（料金表 4100）' },
  { key: 'ADD_CHIMOKU', label: '地目変更登記', amount: 48000,
    note: '「地目変更登記が必要」にチェックした物件がある場合に1回加算（料金表 3201。2筆以上の筆数加算は都度調整）' },
  { key: 'ADD_PER_EXTRA_LOT', label: '物件（筆）追加 加算（1筆あたり）', amount: 10000,
    note: '同じ申請に含まれる2筆目以降の物件1筆ごとに加算' },
];

/**
 * 区域が「分からない」場合に仮で使う区域区分。
 * 原則として届出（市街化区域）前提で計算し、区域の確認は行政班が行います。
 */
const FALLBACK_ZONE_FOR_UNKNOWN = '市街化区域';

/** 農地転用が「許可」となる区域区分（事後手続き加算の対象。市街化区域は届出のため対象外） */
const PERMIT_ZONES = ['市街化調整区域', '非線引き区域', '都市計画区域外'];

/**
 * 料金表の改定。FEE_TABLE_VERSION を変えてデプロイすると、次に画面が開かれたとき
 * 「見積設定」シートの項目名・金額を DEFAULT_FEES の値で1回だけ上書きします（それ以降はシートでの変更が優先）。
 */
const FEE_TABLE_VERSION = '2026-01';

/** 社内ポータル（依頼画面・管理画面・送信後の画面からのリンク先） */
const PORTAL_URL = 'http://192.168.24.54:8000/';

/**
 * 料金の個別修正。キーに版を付け、未適用の版だけ「見積設定」シートの該当項目を DEFAULT_FEES の値で上書きする
 * （ほかの項目のシート上の変更は残す）。
 */
const FEE_PATCHES = {
  '2026-02': ['ADD_LAND_IMPROVEMENT'], // 土地改良区除外申請 35,000 → 40,000
  '2026-03': ['ADD_NOSHIN', 'ADD_WATER_ASSOCIATION', 'ADD_BUNKE', 'ADD_DRAINAGE'], // 料金表の備考（最新）を採用
};

/** 報酬にかける消費税率（実費にはかけない） */
const TAX_RATE = 0.10;

/**
 * 所在・地番欄の末尾から地番を切り出す正規表現（1=町名・字、2=地番）。
 * 例：「○○町字△△123番1」「○○町5丁目12番3」「○○町123-1」「○○町123」
 */
const LOT_NUMBER_TAIL_RE = /^(.*?)\s*([0-9０-９]+(?:番地?[0-9０-９]*)?(?:[-－‐ー][0-9０-９]+)*)$/;

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

/**
 * 都市計画税を課していない市町村（区域区分の目安「課税明細書の都市計画税」が使えない）。公的資料で確認したもののみ。
 * 出典：総務省 令和6年度市町村別決算状況調（都市計画税収入なし）、岐阜県 令和6年度税率採用状況、
 *       三重県 令和7年度市町村税の概要（税率一覧）、各市の例規集・公式ページ（2026年9月確認）。
 * 蟹江町は令和7年度から課税のため対象外。年度が変わったら見直すこと。
 * { 都道府県: { 市区町村: 補足（空文字可） } }
 */
const NO_CITY_PLANNING_TAX = {
  '愛知県': {
    '弥富市': '', '愛西市': '', '大口町': '（税率0%）', '大治町': '', '飛島村': '', '南知多町': '',
    '設楽町': '', '東栄町': '', '豊根村': '',
    'あま市': '（令和8年度までは課税なし。令和9年度から課税）',
  },
  '岐阜県': {
    '瑞穂市': '', '岐南町': '', '笠松町': '', '北方町': '', '垂井町': '', '神戸町': '', '安八町': '',
    '山県市': '', '飛騨市': '', '本巣市': '', '郡上市': '', '下呂市': '', '海津市': '', '養老町': '', '関ケ原町': '',
    '輪之内町': '', '揖斐川町': '', '大野町': '', '池田町': '', '坂祝町': '', '富加町': '', '川辺町': '', '七宗町': '',
    '八百津町': '', '白川町': '', '東白川村': '', '御嵩町': '', '白川村': '',
  },
  '三重県': {
    'いなべ市': '', '木曽岬町': '', '東員町': '', '菰野町': '', '朝日町': '', '川越町': '',
    '名張市': '', '熊野市': '', '志摩市': '', '伊賀市': '', '多気町': '', '明和町': '', '大台町': '', '玉城町': '',
    '度会町': '', '大紀町': '', '南伊勢町': '', '紀北町': '', '御浜町': '', '紀宝町': '',
  },
};

/** 信託手続きに付随する場合、農地転用の基本報酬（届出・許可）に掛ける倍率 */
const TRUST_MULTIPLIER = 1.5;

/** 委員・地元関係者の連絡先を1物件あたり何人まで入力できるか */
const MAX_CONTACTS = 5;

/**
 * 農業委員会の問い合わせ先（土地改良区の確認電話用）。各市町村の公式サイトで確認した番号。
 * 「マスタ」シートの「農業委員会 電話番号」列に入力した番号があれば、そちらを優先します。
 * { 都道府県: { 市区町村: { office: 窓口名, tel: 電話番号, url: 確認したページ } } }
 */
const NOGYO_IINKAI = {
  '愛知県': {
    '名古屋市': { office: '名古屋市農業委員会事務局 農政課（転用は区担当の農政課へ：東部・緑 052-625-3932／西部・守山 052-796-4551／中川 052-363-4360／港 052-301-8209）', tel: '052-972-2469', url: 'https://www.city.nagoya.jp/nogyou/soshiki_list.html' },
    '豊橋市': { office: '豊橋市農業委員会事務局', tel: '0532-51-2950', url: 'https://www.city.toyohashi.lg.jp/2914.htm' },
    '岡崎市': { office: '岡崎市農業委員会事務局 総務係', tel: '0564-23-6196', url: 'https://www.city.okazaki.lg.jp/1400/1404/1414/p004117.html' },
    '一宮市': { office: '一宮市 農業振興課 農業委員会グループ', tel: '0586-28-9137', url: 'https://www.city.ichinomiya.aichi.jp/shisei/shingikai/1009967/1000219/1005461.html' },
    '瀬戸市': { office: '瀬戸市 農林課（農業委員会事務局）', tel: '0561-88-2654', url: 'https://www.city.seto.aichi.jp/docs/2016/06/17/00061/' },
    '半田市': { office: '半田市 農政課', tel: '0569-84-0636', url: 'https://www.city.handa.lg.jp/jigyosha/norin/1003586/1003592.html' },
    '春日井市': { office: '春日井市農業委員会', tel: '0568-85-6239', url: 'https://www.city.kasugai.lg.jp/business/1009248/nougyo/1009326/1009327.html' },
    '豊川市': { office: '豊川市 農務課 農業委員会・農地担当', tel: '0533-95-0262', url: 'https://www.city.toyokawa.lg.jp/shigoto_sangyo/norinchikusangyo/2/7/15899.html' },
    '津島市': { office: '津島市農業委員会事務局（代表から呼出）', tel: '0567-24-1111', url: 'https://www.city.tsushima.lg.jp/shisei/shigotokanren/nougyou/nougyouiinkai.html' },
    '碧南市': { office: '碧南市農業委員会事務局', tel: '0566-95-9898', url: 'https://www.city.hekinan.lg.jp/soshiki/keizai_kankyo/nogyo_suisan/2/4971.html' },
    '刈谷市': { office: '刈谷市 農政課（農業委員会事務局）', tel: '0566-62-1015', url: 'https://www.city.kariya.lg.jp/sangyo/nougyo/nouchi/1006308.html' },
    '豊田市': { office: '豊田市農業委員会事務局', tel: '0565-34-6639', url: 'https://www.city.toyota.aichi.jp/kurashi/nougyou/seido/1003891.html' },
    '安城市': { office: '安城市 農務課 農地係（農業委員会事務局）', tel: '0566-71-2234', url: 'https://www.city.anjo.aichi.jp/zigyo/nogyo/nochitenyo/nochitenyo.html' },
    '西尾市': { office: '西尾市 農水振興課（農業委員会）', tel: '0563-65-2134', url: 'https://www.city.nishio.aichi.jp/sangyo/norinsuisan/1005703/1003058.html' },
    '蒲郡市': { office: '蒲郡市 農林水産課 農地・農業委員会担当', tel: '0533-66-1127', url: 'https://www.city.gamagori.lg.jp/unit/digital/sosiki.html' },
    '犬山市': { office: '犬山市 産業課 農政担当（農業委員会事務局）', tel: '0568-44-0341', url: 'https://www.city.inuyama.aichi.jp/kurashi/nogyo/1004302.html' },
    '常滑市': { office: '常滑市 農業水産課（農業委員会）', tel: '0569-47-6118', url: 'https://www.city.tokoname.aichi.jp/jigyosha/nogyo/1005063/1001231.html' },
    '江南市': { office: '江南市農業委員会（農政課内）', tel: '0587-50-0195', url: 'https://www.city.konan.lg.jp/kurashi/nougyou/1005755/1003119/1003123.html' },
    '小牧市': { office: '小牧市 農政課 農地係', tel: '0568-76-1132', url: 'https://www.city.komaki.aichi.jp/admin/soshiki/chiikikassei/nousei/2/1/5397.html' },
    '稲沢市': { office: '稲沢市農業委員会事務局 農地グループ', tel: '0587-32-1483', url: 'https://www.city.inazawa.aichi.jp/soshiki/15-1-0-0-0_1.html' },
    '新城市': { office: '新城市 農業課（農業委員会事務局）', tel: '0536-23-7632', url: 'https://www.city.shinshiro.lg.jp/faq/noringyo/nochitenyo.html' },
    '東海市': { office: '東海市農業委員会事務局', tel: '052-613-7848', url: 'https://www.city.tokai.aichi.jp/shisei/1003386/1004053/1004054.html' },
    '大府市': { office: '大府市農業委員会事務局', tel: '0562-45-6246', url: 'https://www.city.obu.aichi.jp/shisei/information/soshiki/1002393/1002394.html' },
    '知多市': { office: '知多市農業委員会事務局', tel: '0562-36-2683', url: 'https://www.city.chita.lg.jp/soshiki/nogyoiinkai/nougyouiinkaijimukyoku/' },
    '知立市': { office: '知立市 産業振興課 農業振興係（農業委員会兼務）', tel: '0566-95-0153', url: 'https://www.city.chiryu.aichi.jp/soshiki/1450690105894.html' },
    '尾張旭市': { office: '尾張旭市 公園農政課 農政係（農業委員会）', tel: '0561-76-8133', url: 'https://www.city.owariasahi.lg.jp/page/3085.html' },
    '高浜市': { office: '高浜市 経済環境グループ 農務', tel: '0566-95-9521', url: 'https://www.city.takahama.lg.jp/soshiki/keizai/951.html' },
    '岩倉市': { office: '岩倉市 商工農政課（農業委員会）', tel: '0587-38-5812', url: 'https://www.city.iwakura.aichi.jp/soshiki/5-8-0-0-0_8.html' },
    '豊明市': { office: '豊明市農業委員会事務局', tel: '0562-92-8312', url: 'https://www.city.toyoake.lg.jp/1014.htm' },
    '日進市': { office: '日進市 農政課（農業委員会事務局）', tel: '0561-73-2197', url: 'https://www.city.nisshin.lg.jp/department/toshisangyo/nousei/kurashi/nougyou/nougyouiinkai/3276.html' },
    '田原市': { office: '田原市農業委員会事務局', tel: '0531-23-3519', url: 'https://www.city.tahara.aichi.jp/kankou/nogyou/1001917/1001922.html' },
    '愛西市': { office: '愛西市 産業振興課（農業委員会）', tel: '0567-55-7128', url: 'https://www.city.aisai.lg.jp/soshiki/1-7-1-0-0_6.html' },
    '清須市': { office: '清須市 産業課（農地の窓口）', tel: '052-400-2959', url: 'https://www.city.kiyosu.aichi.jp/kurashi_joho/seikatsu_kankyo/nogyo/nochi_baibai_chimoku.html' },
    '北名古屋市': { office: '北名古屋市 商工農政課 農業委員会担当', tel: '0568-48-0210', url: 'https://www.city.kitanagoya.lg.jp/sangyo/nogyo/1004173/1004174.html' },
    '弥富市': { office: '弥富市 産業振興課 農地グループ（代表から呼出）', tel: '0567-65-1111', url: 'https://www.city.yatomi.lg.jp/jigyo/1000838/1006178/1000839.html' },
    'みよし市': { office: 'みよし市農業委員会事務局', tel: '0561-32-8015', url: 'https://www.city.aichi-miyoshi.lg.jp/soshiki/shiminkeizai/sangyo/nougyouiinnkai/index.html' },
    'あま市': { office: 'あま市 農政課 農政係（農業委員会）', tel: '052-441-7114', url: 'https://www.city.ama.aichi.jp/soshiki/kensetu/1004522.html' },
    '長久手市': { office: '長久手市 みどりの推進課 農政係（農業委員会事務局）', tel: '0561-56-0620', url: 'https://www.city.nagakute.lg.jp/soshiki/kensetsubu/suishinka/nougyou_iinkai/2201.html' },
    '東郷町': { office: '東郷町 産業振興課（農業委員会事務局）', tel: '0561-56-0740', url: 'https://www.town.aichi-togo.lg.jp/soshikikarasagasu/sangyoshinkoka/gyomuannai/6/1_1/3/2608.html' },
    '豊山町': { office: '豊山町 建設課 土木・農政グループ（農業委員会）', tel: '0568-28-0380', url: 'https://www.town.toyoyama.lg.jp/sangyo/1001037/1001041/1001042.html' },
    '大口町': { office: '大口町 まちづくり推進課（農業委員会事務局）', tel: '0587-95-1614', url: 'https://www.town.oguchi.lg.jp/2174.htm' },
    '扶桑町': { office: '扶桑町 土木農政課 農政グループ（農業委員会）', tel: '0587-92-4124', url: 'https://www.town.fuso.lg.jp/sangyo/1002317/1002147/1002162.html' },
    '大治町': { office: '大治町 産業環境課（農業委員会）', tel: '052-444-2711', url: 'https://www.town.oharu.aichi.jp/1390.htm' },
    '蟹江町': { office: '蟹江町 土木農政課 農政係（代表から呼出）', tel: '0567-95-1111', url: 'https://www.town.kanie.aichi.jp/soshiki/13/nouchi-kenriidou.html' },
    '飛島村': { office: '飛島村 経済課 農業委員会事務局', tel: '0567-97-3469', url: 'https://www.vill.tobishima.aichi.jp/shigotosngyo/nougyou/1002110.html' },
    '阿久比町': { office: '阿久比町農業委員会事務局（産業観光課 農業振興係）', tel: '0569-84-3808', url: 'https://www.town.agui.lg.jp/0000003710.html' },
    '東浦町': { office: '東浦町農業委員会事務局（商工農政課内・役場代表）', tel: '0562-83-3111', url: 'https://www.town.aichi-higashiura.lg.jp/soshiki/nougyou/jimukyoku/gyomu/1478672994910.html' },
    '南知多町': { office: '南知多町 産業振興課（農業委員会窓口）', tel: '0569-65-0711', url: 'https://www.town.minamichita.lg.jp/kankosangyou/nougyou/1003435/1001444.html' },
    '美浜町': { office: '美浜町 産業課 農業振興係（代表・内線265）', tel: '0569-82-1111', url: 'https://www.town.aichi-mihama.lg.jp/soshiki/sangyo/nogyoshinko/1/3/2/3/555.html' },
    '武豊町': { office: '武豊町農業委員会事務局（産業課・役場代表）', tel: '0569-72-1111', url: 'https://www.town.taketoyo.lg.jp/kurashi/1001508/1001590/1001801.html' },
    '幸田町': { office: '幸田町 産業振興課 農業委員会（代表・内線263）', tel: '0564-62-1111', url: 'https://www.town.kota.lg.jp/soshiki/13/771.html' },
    '設楽町': { office: '設楽町 産業課（農業委員会担当）', tel: '0536-62-0527', url: 'https://www.town.shitara.lg.jp/soshiki/7/1332.html' },
    '東栄町': { office: '東栄町 経済課（農業委員会担当）', tel: '0536-76-1812', url: 'http://www.town.toei.aichi.jp/1413.htm' },
    '豊根村': { office: '豊根村農業委員会事務局（産業課）', tel: '0536-85-1314', url: 'https://www.vill.toyone.aichi.jp/soshiki/sangyo/84.html' },
  },
  '岐阜県': {
    '岐阜市': { office: '岐阜市農業委員会事務局 農業振興係', tel: '058-214-2074', url: 'https://www.city.gifu.lg.jp/info/soshiki/1010589.html' },
    '大垣市': { office: '大垣市農業委員会事務局（市役所代表）', tel: '0584-81-4111', url: 'https://www.city.ogaki.lg.jp/0000002112.html' },
    '高山市': { office: '高山市農業委員会事務局', tel: '0577-35-3141', url: 'https://www.city.takayama.lg.jp/soshiki/1005520.html' },
    '多治見市': { office: '多治見市農業委員会事務局', tel: '0572-22-1258', url: 'https://www.city.tajimi.lg.jp/shisei/soshiki_gyomuannai/1007086/1007087/1007092.html' },
    '関市': { office: '関市農業委員会', tel: '0575-23-6765', url: 'https://www.city.seki.lg.jp/0000000046.html' },
    '中津川市': { office: '中津川市農業委員会事務局（代表・内線4029）', tel: '0573-66-1111', url: 'https://www.city.nakatsugawa.lg.jp/soshikikarasagasu/nogyoiinkaijimukyoku/2/1/2076.html' },
    '美濃市': { office: '美濃市 農林振興課 農業委員会（代表・内線265）', tel: '0575-33-1122', url: 'https://www.city.mino.gifu.jp/docs/1314.html' },
    '瑞浪市': { office: '瑞浪市農業委員会事務局', tel: '0572-68-9800', url: 'https://www.city.mizunami.lg.jp/shisei/soshikiannai/1004225/1003254.html' },
    '羽島市': { office: '羽島市農業委員会事務局', tel: '058-392-9963', url: 'https://www.city.hashima.lg.jp/2756.html' },
    '恵那市': { office: '恵那市農業委員会事務局', tel: '0573-26-6854', url: 'https://www.city.ena.lg.jp/soshikiichiran/nogyoiinkaijimukyoku/index.html' },
    '美濃加茂市': { office: '美濃加茂市農業委員会事務局', tel: '0574-28-1133', url: 'https://www.city.minokamo.lg.jp/soshiki/14/1644.html' },
    '土岐市': { office: '土岐市農業委員会', tel: '0572-54-1214', url: 'https://www.city.toki.lg.jp/shisei/soshiki/1008512/1006322.html' },
    '各務原市': { office: '各務原市 農政課 農政係（農業委員会）', tel: '058-383-1129', url: 'https://www.city.kakamigahara.lg.jp/shisei/soshiki/1006489/1006499.html' },
    '可児市': { office: '可児市農業委員会事務局（市役所代表）', tel: '0574-62-1111', url: 'https://www.city.kani.lg.jp/13108.htm' },
    '山県市': { office: '山県市農業委員会事務局（農林商工課内）', tel: '0581-22-6830', url: 'https://www.city.yamagata.gifu.jp/soshiki/nougyou/1753.html' },
    '瑞穂市': { office: '瑞穂市 商工農政観光課（農業委員会）', tel: '058-327-2103', url: 'https://www.city.mizuho.lg.jp/1239.htm' },
    '飛騨市': { office: '飛騨市農業委員会事務局', tel: '0577-62-9393', url: 'https://www.city.hida.gifu.jp/soshiki/7.html' },
    '本巣市': { office: '本巣市 農政課（農業委員会）', tel: '058-323-7755', url: 'https://www.city.motosu.lg.jp/soshiki/1-7-1-0-0_4.html' },
    '郡上市': { office: '郡上市 農務水産課（農地法の窓口）', tel: '0575-67-1835', url: 'https://www.city.gujo.gifu.jp/business/detail/post-72.html' },
    '下呂市': { office: '下呂市農業委員会事務局（農務課）', tel: '0576-53-2010', url: 'https://www.city.gero.lg.jp/soshiki/14/1130.html' },
    '海津市': { office: '海津市農業委員会事務局', tel: '0584-53-3429', url: 'https://www.city.kaizu.lg.jp/soshiki/13-0-0-0-0_16.html' },
    '岐南町': { office: '岐南町 建設課（農地の申請・届出窓口）', tel: '058-247-1332', url: 'https://www.town.ginan.lg.jp/6034.htm' },
    '笠松町': { office: '笠松町農業委員会事務局（環境経済課内）', tel: '058-388-1114', url: 'https://www.town.kasamatsu.gifu.jp/docs/2025091700026/' },
    '養老町': { office: '養老町 産業観光課', tel: '0584-32-1108', url: 'https://www.town.yoro.gifu.jp/business/agriculture/1002136/1002604.html' },
    '垂井町': { office: '垂井町農業委員会事務局（産業課内）', tel: '0584-22-7516', url: 'https://www.town.tarui.lg.jp/page/5594.html' },
    '関ケ原町': { office: '関ケ原町 産業建設課 農業委員会事務局', tel: '0584-43-3054', url: 'https://www.town.sekigahara.gifu.jp/4133.htm' },
    '神戸町': { office: '神戸町 産業環境課 産業振興係', tel: '0584-27-0178', url: 'https://www.town.godo.gifu.jp/life/other/other32.html' },
    '輪之内町': { office: '輪之内町 農業振興課（農業委員会）', tel: '0584-69-3138', url: 'https://town.wanouchi.gifu.jp/portal/town/government-office-information/post0025867/' },
    '安八町': { office: '安八町 農業委員会（農政課）', tel: '0584-64-7113', url: 'https://www.town.anpachi.lg.jp/0000000435.html' },
    '揖斐川町': { office: '揖斐川町 農林振興課', tel: '0585-22-2809', url: 'https://www.town.ibigawa.lg.jp/page/1056.html' },
    '大野町': { office: '大野町 農林課', tel: '0585-35-5373', url: 'https://www.town-ono.jp/0000000017.html' },
    '池田町': { office: '池田町 農業委員会事務局（産業課・役場代表）', tel: '0585-45-3111', url: 'https://www.town.gifu-ikeda.lg.jp/soshiki_list.html' },
    '北方町': { office: '北方町 農業委員会事務局（都市環境課）', tel: '058-323-1114', url: 'https://www.town.kitagata.gifu.jp/soshiki/somukikikanri/1/20/372.html' },
    '坂祝町': { office: '坂祝町 産業環境課（農業委員会）', tel: '0574-66-2408', url: 'https://www.town.sakahogi.gifu.jp/administration/administration04.html' },
    '富加町': { office: '富加町農業委員会（産業環境課内）', tel: '0574-54-2113', url: 'https://www.town.tomika.gifu.jp/docs/354.html' },
    '川辺町': { office: '川辺町農業委員会（産業環境課）', tel: '0574-53-7212', url: 'https://www.kawabe-gifu.jp/?page_id=8269' },
    '七宗町': { office: '七宗町農業委員会事務局', tel: '0574-48-1101', url: 'https://www.hichiso.jp/top/sangyo/commission/' },
    '八百津町': { office: '八百津町 農林課 農業振興係（役場代表）', tel: '0574-43-2111', url: 'https://www.town.yaotsu.lg.jp/4439.htm' },
    '白川町': { office: '白川町農業委員会（農林課 農務係）', tel: '0574-70-1317', url: 'https://www.town.shirakawa.lg.jp/kankou/nougyou/1002628/index.html' },
    '東白川村': { office: '東白川村農業委員会事務局（役場代表）', tel: '0574-78-3111', url: 'https://www.vill.higashishirakawa.gifu.jp/kurashi/sangyou/nougyou/iinkai/' },
    '御嵩町': { office: '御嵩町 農林課（代表・内線2142）', tel: '0574-67-2111', url: 'https://www.town.mitake.lg.jp/business/business/agriculture/post0008502/' },
    '白川村': { office: '白川村 産業課', tel: '05769-6-1311', url: 'https://www.vill.shirakawa.lg.jp/2093.htm' },
  },
  '三重県': {
    '津市': { office: '津市農業委員会事務局 農地・農業振興担当', tel: '059-229-3176', url: 'https://www.info.city.tsu.mie.jp/www/contents/1554895460381/index.html' },
    '四日市市': { office: '四日市市農業委員会事務局', tel: '059-354-8271', url: 'https://www.city.yokkaichi.lg.jp/www/contents/1001000001404/index.html' },
    '伊勢市': { office: '伊勢市農業委員会事務局', tel: '0596-21-5652', url: 'https://www.city.ise.mie.jp/shisei/information/soshiki/1005696.html' },
    '松阪市': { office: '松阪市農業委員会事務局', tel: '0598-53-4137', url: 'https://www.city.matsusaka.mie.jp/site/nougyou/tenyou.html' },
    '桑名市': { office: '桑名市農業委員会事務局', tel: '0594-24-1206', url: 'https://www.city.kuwana.lg.jp/nogyo/shigoto/sangyou/20250313.html' },
    '鈴鹿市': { office: '鈴鹿市農業委員会事務局', tel: '059-382-9018', url: 'https://www.city.suzuka.lg.jp/sangyo/nousui/1003361/1003373/1003375.html' },
    '名張市': { office: '名張市農業委員会事務局', tel: '0595-63-7665', url: 'https://www.city.nabari.lg.jp/s066/100/020/040/201502053888.html' },
    '尾鷲市': { office: '尾鷲市 水産農林事業推進課 農林振興係（農業委員会）', tel: '0597-23-8224', url: 'https://www.city.owase.lg.jp/0000020386.html' },
    '亀山市': { office: '亀山市農業委員会事務局', tel: '0595-84-5048', url: 'https://www.city.kameyama.mie.jp/soshiki/sankan/nougyou_iinkai/' },
    '鳥羽市': { office: '鳥羽市農業委員会事務局（農林水産課 農林係）', tel: '0599-25-1231', url: 'https://www.city.toba.mie.jp/soshiki/norin/gyomu/nogyo_ringyo_suisan/nogyo/3024.html' },
    '熊野市': { office: '熊野市農業委員会事務局（代表・内線471）', tel: '0597-89-4111', url: 'https://www.city.kumano.lg.jp/life/?content=288' },
    'いなべ市': { office: 'いなべ市農業委員会事務局', tel: '0594-86-7834', url: 'https://www.city.inabe.mie.jp/sangyo/kaihatsu/nochi/1012261.html' },
    '志摩市': { office: '志摩市農業委員会事務局', tel: '0599-44-0288', url: 'https://www.city.shima.mie.jp/kakuka/nogyoiinkaijimukyoku/noutihousinsei.html' },
    '伊賀市': { office: '伊賀市農業委員会事務局', tel: '0595-22-9720', url: 'https://www.city.iga.lg.jp/soshiki/33-0-0-0-0_14.html' },
    '木曽岬町': { office: '木曽岬町 産業課（農業委員会）', tel: '0567-68-6105', url: 'https://www.town.kisosaki.lg.jp/0000001060.html' },
    '東員町': { office: '東員町農業委員会（産業課内）', tel: '0594-86-2808', url: 'https://www.town.toin.lg.jp/soshiki/1012/4/818.html' },
    '菰野町': { office: '菰野町 観光産業課 農地調整係（農業委員会事務局）', tel: '059-391-1145', url: 'https://www2.town.komono.mie.jp/soshiki/11/' },
    '朝日町': { office: '朝日町農業委員会（産業建設課内）', tel: '059-377-5658', url: 'https://www2.town.asahi.mie.jp/www/contents/1756348734727/index.html' },
    '川越町': { office: '川越町 産業建設課（農業委員会）', tel: '059-366-7117', url: 'https://www.town.kawagoe.mie.jp/sangyo_business/nouringyo/1002751/index.html' },
    '多気町': { office: '多気町農業委員会事務局', tel: '0598-38-1117', url: 'https://www.town.taki.mie.jp/life/soshiki/nogyo_iinkai_jimukyoku/981.html' },
    '明和町': { office: '明和町農業委員会事務局 農地係', tel: '0596-52-7149', url: 'https://www.town.meiwa.mie.jp/shinsei_dl/1812.html' },
    '大台町': { office: '大台町 産業課（農業委員会）', tel: '0598-82-3786', url: 'https://www.odaitown.jp/soshiki/yakuba/7/2/3/810.html' },
    '玉城町': { office: '玉城町 産業振興課（農業委員会）', tel: '0596-58-8204', url: 'https://kizuna.town.tamaki.mie.jp/sangyobusiness/noringyo/nouchihoutetsuduki.html' },
    '度会町': { office: '度会町農業委員会（産業振興課内）', tel: '0596-62-2416', url: 'https://www.town.watarai.lg.jp/contents_detail.php?co=kak&frmId=2642' },
    '大紀町': { office: '大紀町 産業振興課（農業委員会）', tel: '0598-86-2243', url: 'https://www.town.taiki.mie.jp/soshiki/norin/gyomu/norinsui/nogyo/nogyoiin/564.html' },
    '南伊勢町': { office: '南伊勢町農業委員会（南島庁舎）', tel: '0596-77-0007', url: 'https://www.town.minamiise.lg.jp/admin/shoshiki/suisannourin/nougyouiinkai/2040.html' },
    '紀北町': { office: '紀北町 農林水産課（農業委員会）', tel: '0597-46-3116', url: 'https://www.town.mie-kihoku.lg.jp/2025/02/25/1188/' },
    '御浜町': { office: '御浜町 農林水産課 農業振興係（農業委員会）', tel: '05979-3-0517', url: 'https://www.town.mihama.mie.jp/soshikikarasagasu/norinsuisanka/shigoto_sangyo/1/noutinituite/258.html' },
    '紀宝町': { office: '紀宝町農業委員会（産業振興課内）', tel: '0735-33-0336', url: 'https://www.town.kiho.lg.jp/life/infra/agriculture/rights_movement/' },
  },
};

/**
 * 市区町村の一覧（市区町村欄の入力候補、謄本の所在を「市区町村／町名・字」に分けるのに使用）。
 * 町村は謄本の所在に合わせて郡名付きで記載（画面の市区町村欄には郡名を除いた名前が入る）。
 * 「マスタ」シートに行を追加した市区町村も候補に加わります。
 */
const MUNICIPALITIES = {
  '愛知県': [
    '名古屋市', '豊橋市', '岡崎市', '一宮市', '瀬戸市', '半田市', '春日井市', '豊川市', '津島市', '碧南市',
    '刈谷市', '豊田市', '安城市', '西尾市', '蒲郡市', '犬山市', '常滑市', '江南市', '小牧市', '稲沢市',
    '新城市', '東海市', '大府市', '知多市', '知立市', '尾張旭市', '高浜市', '岩倉市', '豊明市', '日進市',
    '田原市', '愛西市', '清須市', '北名古屋市', '弥富市', 'みよし市', 'あま市', '長久手市',
    '愛知郡東郷町', '西春日井郡豊山町', '丹羽郡大口町', '丹羽郡扶桑町', '海部郡大治町', '海部郡蟹江町', '海部郡飛島村',
    '知多郡阿久比町', '知多郡東浦町', '知多郡南知多町', '知多郡美浜町', '知多郡武豊町', '額田郡幸田町',
    '北設楽郡設楽町', '北設楽郡東栄町', '北設楽郡豊根村',
  ],
  '岐阜県': [
    '岐阜市', '大垣市', '高山市', '多治見市', '関市', '中津川市', '美濃市', '瑞浪市', '羽島市', '恵那市',
    '美濃加茂市', '土岐市', '各務原市', '可児市', '山県市', '瑞穂市', '飛騨市', '本巣市', '郡上市', '下呂市', '海津市',
    '羽島郡岐南町', '羽島郡笠松町', '養老郡養老町', '不破郡垂井町', '不破郡関ケ原町', '安八郡神戸町', '安八郡輪之内町',
    '安八郡安八町', '揖斐郡揖斐川町', '揖斐郡大野町', '揖斐郡池田町', '本巣郡北方町', '加茂郡坂祝町', '加茂郡富加町',
    '加茂郡川辺町', '加茂郡七宗町', '加茂郡八百津町', '加茂郡白川町', '加茂郡東白川村', '可児郡御嵩町', '大野郡白川村',
  ],
  '三重県': [
    '津市', '四日市市', '伊勢市', '松阪市', '桑名市', '鈴鹿市', '名張市', '尾鷲市', '亀山市', '鳥羽市',
    '熊野市', 'いなべ市', '志摩市', '伊賀市',
    '桑名郡木曽岬町', '員弁郡東員町', '三重郡菰野町', '三重郡朝日町', '三重郡川越町', '多気郡多気町', '多気郡明和町',
    '多気郡大台町', '度会郡玉城町', '度会郡度会町', '度会郡大紀町', '度会郡南伊勢町', '北牟婁郡紀北町',
    '南牟婁郡御浜町', '南牟婁郡紀宝町',
  ],
};

const FORM_OPTIONS = {
  zones: ['市街化区域', '市街化調整区域', '非線引き区域', '都市計画区域外', '分からない'],
  yesNoUnknown: ['はい', 'いいえ', '分からない'],
  yesNo: ['はい', 'いいえ'],
  kairyoBenefit: ['該当する', '該当しない', '未確認'],     // 土地改良区の受益地に該当するか（土地改良区へ電話確認）
  kairyoSettlement: ['必要', '不要', '未確認'],           // 地区除外の決済金
  settlementUnits: ['総額', '㎡あたり', 'haあたり'],        // 決済金の単位（多くは㎡単価・ha単価）
  kairyoFeeUnits: ['1申請あたり', '1筆あたり'],             // 土地改良区の手数料等：1申請につき／1筆ごと
  tenyoRireki: ['あり', 'なし', '未確認'],
  shimatsusho: ['必要', '不要', '未確認'],                  // 無断転用の始末書（顛末書）の提出（農業委員会に確認）                  // 転用済みの物件：過去の転用届出（市街化）・転用許可（調整区域等）の履歴
  kairyoProcedure: ['必要', '不要', '未確認'],            // 地区除外の手続き（決済金がなくても手続きが必要な改良区がある）
  iinStamp: ['必要', '不要', '未確認'],                   // 地元の農業委員・農地利用最適化推進委員の押印（意見書等）
  localConsent: ['必要', '不要', '未確認'],               // 地元関係者（自治会長・水利組合・地元委員・理事等）の同意（押印）。土地改良区へ確認
  purposes: ['分家住宅', '駐車場', '資材置場', 'その他'],  // 転用目的（市街化調整区域の物件のみ。分家住宅は排水先の確認を行う）
  tenyoUkeModes: ['毎月の期間', '毎月の締切日', '締切日を指定'], // 農地転用の受付：毎月○日～○日／毎月○日締切／特定の日
  tenyoKanou: ['見込みあり', '難しい', '要相談・未確認'],  // 許可区域で、農業委員会に聞いた転用の見込み
  noutiKubun: ['甲種', '第1種', '第2種', '第3種', '未確認'], // 農地区分（甲種・第1種は原則転用不可）
  hojoKuiki: ['区域内', '区域外', '未確認'],               // ほ場整備などの土地改良事業の区域か
  hojo8nen: ['経過', '未経過', '未確認'],                  // 事業完了から8年経過したか（未経過は除外の要件を満たさない）
  jogaiJisseki: ['あり', 'なし', '未確認'],                // 近隣の除外実績
  drainAdjacent: ['ある', 'ない', '未確認'],               // 隣接に水路があるか（ない場合は側溝へ）
  drainConsent: ['必要', '不要', '未確認'],                // 排水承諾の要否（農業用水などへの排水）
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
  { key: 'municipality', header: '市区町村' },
  { key: 'waterAssociation', header: '地元関係者の同意（押印）' },
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
  { key: 'localConsentNote', header: '同意が必要な方（氏名／住所／電話）' },
  { key: 'purpose', header: '転用目的' },
  { key: 'trust', header: '信託手続きに付随' },
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
  { key: 'municipality', header: '市区町村' },
  { key: 'readFromTohon', header: '謄本から読取' },
  { key: 'kairyoName', header: '土地改良区名' },
  { key: 'kairyoTel', header: '土地改良区 電話' },
  { key: 'kairyoBenefit', header: '受益地該当' },
  { key: 'kairyoProcedure', header: '地区除外の手続き' },
  { key: 'kairyoSettlement', header: '地区除外決済金' },
  { key: 'kairyoSettlementNote', header: '決済金（金額）' },
  { key: 'kairyoFee', header: '土地改良区 手数料等（決済金以外）' },
  { key: 'iinStamp', header: '農業委員・推進委員の押印' },
  { key: 'iinContacts', header: '委員（氏名／住所／電話）' },
  { key: 'localConsent', header: '地元関係者の同意（押印）' },
  { key: 'localContacts', header: '同意が必要な方（氏名／住所／電話）' },
  { key: 'purpose', header: '転用目的（調整区域）' },
  { key: 'tenyoKanou', header: '転用の見込み（農業委員会）' },
  { key: 'noutiKubun', header: '農地区分（農業委員会）' },
  { key: 'kanouNote', header: '転用が難しい理由・指摘事項' },
  { key: 'jogaiKanou', header: '農振除外の見込み' },
  { key: 'hojoKuiki', header: 'ほ場整備等の事業区域' },
  { key: 'hojo8nen', header: '事業完了から8年' },
  { key: 'jogaiJisseki', header: '近隣の除外実績' },
  { key: 'jogaiUketsuke', header: '除外の受付（年何回・時期）' },
  { key: 'tenyoUketsuke', header: '農地転用の受付期間' },
  { key: 'jogaiNote', header: '除外の指摘事項' },
  { key: 'drainAdjacent', header: '隣接の水路' },
  { key: 'drainConsent', header: '排水承諾' },
  { key: 'drainName', header: '用水（管理者）名' },
  { key: 'drainTel', header: '用水 電話' },
  { key: 'drainFee', header: '用水 手数料（金額・備考）' },
  { key: 'drainLocalConsent', header: '排水の地元承諾' },
  { key: 'drainContacts', header: '排水の地元承諾が必要な方（氏名／住所／電話）' },
  { key: 'prefecture', header: '都道府県' },
  { key: 'tenyoRireki', header: '過去の転用届出・許可の履歴' },
  { key: 'rirekiDate', header: '受理・許可年月日' },
  { key: 'rirekiNo', header: '受理・許可番号' },
  { key: 'rirekiNote', header: '履歴の内容（転用目的など）' },
  { key: 'shimatsusho', header: '始末書の提出' },
  { key: 'shimatsuStamp', header: '始末書の押印' },
  { key: 'shimatsuNote', header: '始末書の備考（押印者・印の種類など）' },
  { key: 'chimokuHenko', header: '地目変更登記が必要' },
];

/** 管理画面から編集できる列（これ以外は管理画面から書き換えない） */
const ADMIN_EDITABLE_KEYS = ['status', 'assignee', 'formalEstimate', 'adminMemo'];

/** マスタシートの列（見出し） */
const MASTER_HEADERS = ['都道府県', '市区町村', '都市計画情報URL', '農振図URL', '備考', '農業委員会 電話番号'];

/** 見積設定シートの列（見出し） */
const FEE_HEADERS = ['キー（変更しない）', '項目名（見積に表示）', '金額（円・報酬は税抜）', '適用条件（説明）'];


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

/**
 * 見積設定シートに、まだ無い項目だけを追記する（既存の金額・項目名は上書きしない）。
 * 「適用条件」列は計算ルール（Estimate.gs）の説明なので、既存の行も最新の文言に更新する。
 */
function addMissingFeeRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const existing = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); })
    : [];
  existing.forEach(function (key, i) {
    const d = DEFAULT_FEES.filter(function (f) { return f.key === key; })[0];
    if (d) sheet.getRange(i + 2, 4).setValue(d.note);
  });
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
  ensureSetup_();
  runMigrations_();
  const params = (e && e.parameter) || {};
  if (params.page === 'admin') {
    if (!isAdmin_()) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:sans-serif;padding:24px">管理画面を表示する権限がありません。' +
        '行政班の担当者にお問い合わせください。</p>').setTitle('権限がありません');
    }
    const t = HtmlService.createTemplateFromFile('Admin');
    t.initialId = String(params.id || '').replace(/\D/g, ''); // 通知のリンクから開いた案件
    t.portalUrl = PORTAL_URL;
    return t.evaluate()
      .setTitle('農地転用 案件管理（行政班）')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const index = HtmlService.createTemplateFromFile('Index');
  index.portalUrl = PORTAL_URL;
  return index.evaluate()
    .setTitle('農地転用 見積・調査依頼フォーム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // 社内ポータル（Google サイト等）のページに埋め込めるようにする。
    // アクセスできる人は Webアプリのデプロイ設定（組織内のみ）で制限されている。管理画面は埋め込み不可のまま。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 初回アクセス時に、シートやフォルダが無ければ自動で初期セットアップする。
 * （エディタで setupSpreadsheet を実行する手順を省くため。2回目以降はシートの有無を見るだけ）
 */
function ensureSetup_() {
  if (getSpreadsheet_().getSheetByName(SHEET_NAMES.CASES)) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    if (!getSpreadsheet_().getSheetByName(SHEET_NAMES.CASES)) setupSpreadsheet();
  } finally {
    lock.releaseLock();
  }
}

/**
 * デプロイ後に1回だけ行う更新（画面が開かれたときに実行）。
 *  ・料金表の改定：FEE_TABLE_VERSION が変わったら「見積設定」シートを DEFAULT_FEES の値で上書き
 */
function runMigrations_() {
  const props = PropertiesService.getScriptProperties();
  runFeePatches_(props);
  if (props.getProperty('FEE_TABLE_VERSION') === FEE_TABLE_VERSION) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    if (props.getProperty('FEE_TABLE_VERSION') !== FEE_TABLE_VERSION) { // 他の人が先に実行していないか再確認
      const sheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.FEES);
      ensureHeaders_(sheet, FEE_HEADERS);
      addMissingFeeRows_(sheet);
      const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
      DEFAULT_FEES.forEach(function (d) {
        const i = keys.indexOf(d.key);
        if (i >= 0) sheet.getRange(i + 2, 2, 1, 3).setValues([[d.label, d.amount, d.note]]);
      });
      props.setProperty('FEE_TABLE_VERSION', FEE_TABLE_VERSION);
    }
  } finally {
    lock.releaseLock();
  }
}

/** 料金の個別修正（FEE_PATCHES）のうち、まだ適用していない版を適用する */
function runFeePatches_(props) {
  const done = String(props.getProperty('FEE_PATCHES_DONE') || '').split(',').filter(String);
  const todo = Object.keys(FEE_PATCHES).filter(function (v) { return done.indexOf(v) < 0; });
  if (!todo.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    const sheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.FEES);
    ensureHeaders_(sheet, FEE_HEADERS);
    addMissingFeeRows_(sheet);
    const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
    todo.forEach(function (v) {
      FEE_PATCHES[v].forEach(function (key) {
        const d = DEFAULT_FEES.filter(function (f) { return f.key === key; })[0];
        const i = keys.indexOf(key);
        if (d && i >= 0) sheet.getRange(i + 2, 2, 1, 3).setValues([[d.label, d.amount, d.note]]);
      });
      done.push(v);
    });
    sheet.getRange(1, 3).setValue(FEE_HEADERS[2]); // 見出し（報酬は税抜）を最新に
    props.setProperty('FEE_PATCHES_DONE', done.join(','));
  } finally {
    lock.releaseLock();
  }
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
    municipalities: MUNICIPALITIES,
    nogyoIinkai: NOGYO_IINKAI,
    noCityPlanningTax: NO_CITY_PLANNING_TAX,
    fees: getFeeSettings_(), // 画面で概算見積を即時計算するための料金（見積設定シート）
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
  try {
    return saveUploadedFile_(file);
  } catch (e) {
    logError_('uploadAttachment', e, file && file.name);
    throw e;
  }
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
    logError_('readTohon', e, 'fileId=' + fileId);
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
    waterAssociation: summary.localConsent,
    purpose: input.purpose,
    trust: input.trust,
    localConsentNote: summary.localContacts,
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
      kairyoName: l.kairyoName, kairyoTel: l.kairyoTel, kairyoBenefit: l.kairyoBenefit, kairyoProcedure: l.kairyoProcedure,
      kairyoSettlement: l.kairyoSettlement, kairyoSettlementNote: l.kairyoSettlementNote, kairyoFee: l.kairyoFee,
      iinStamp: l.iinStamp, iinContacts: contactsToText_(l.iinContacts),
      localConsent: l.localConsent, localContacts: contactsToText_(l.localContacts),
      prefecture: l.prefecture, purpose: l.purpose,
      tenyoRireki: l.tenyoRireki, rirekiDate: l.rirekiDate, rirekiNo: l.rirekiNo, rirekiNote: l.rirekiNote,
      shimatsusho: l.shimatsusho, shimatsuStamp: l.shimatsuStamp, shimatsuNote: l.shimatsuNote,
      chimokuHenko: l.chimokuHenko ? 'はい' : '',
      tenyoKanou: l.tenyoKanou, noutiKubun: l.noutiKubun, kanouNote: l.kanouNote,
      jogaiKanou: l.jogaiKanou, hojoKuiki: l.hojoKuiki, hojo8nen: l.hojo8nen, jogaiJisseki: l.jogaiJisseki,
      jogaiUketsuke: l.jogaiUketsuke, tenyoUketsuke: l.tenyoUketsuke, jogaiNote: l.jogaiNote,
      drainAdjacent: l.drainAdjacent, drainConsent: l.drainConsent,
      drainName: l.drainName, drainTel: l.drainTel, drainFee: l.drainFee,
      drainLocalConsent: l.drainLocalConsent, drainContacts: contactsToText_(l.drainContacts),
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
    // 地元関係者の同意（土地改良区に確認）：必要 ＞ 未確認 ＞ 不要
    localConsent: any('localConsent', '必要') ? '必要' : any('localConsent', '未確認') ? '未確認' : uniq('localConsent'),
    localContacts: lots.map(function (l) { return contactsToText_(l.localContacts); })
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('\n'),
  };
}

/** 金額の数値（数字以外・負数は0） */
function numOrZero_(v) {
  const n = Number(String(v === undefined || v === null ? '' : v).replace(/[,，円¥\s]/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

/** 金額 → 「300,000円」（数字以外は空文字） */
function yenText_(v) {
  const s = String(v === undefined || v === null ? '' : v).replace(/[,，円¥\s]/g, '');
  const n = Number(s);
  return s !== '' && !isNaN(n) && n >= 0 ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円' : '';
}

/**
 * 決済金の表示。単価（㎡・ha）の場合は物件の面積から概算の総額も添える。
 * 例：「1㎡あたり 300円（496㎡ → 約148,800円）」「300,000円」
 */
function settlementText_(amount, unit, area) {
  const yen = yenText_(amount);
  if (!yen) return '';
  if (unit !== '㎡あたり' && unit !== 'haあたり') return yen;
  const n = Number(String(amount).replace(/[,，円¥\s]/g, ''));
  const total = area > 0 ? (unit === '㎡あたり' ? n * area : n * area / 10000) : null;
  return (unit === '㎡あたり' ? '1㎡あたり ' : '1haあたり ') + yen +
    (total !== null ? '（' + area + '㎡ → 約' + yenText_(Math.round(total)) + '）' : '');
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（それ以外は空文字） */
function dateText_(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[1] + '/' + m[2] + '/' + m[3] : '';
}

/** 期間の表示「A～B」（片方だけなら「A～」「～B」） */
function rangeText_(a, b) {
  return a || b ? (a || '') + '～' + (b || '') : '';
}

/** 農地転用の受付：「毎月1日～10日」「毎月5日締切」「締切 2026/10/15」 */
function tenyoUketsukeText_(l) {
  const mode = pick_(l.tenyoUkeMode, FORM_OPTIONS.tenyoUkeModes);
  const day = function (v) { const n = Number(v); return n >= 1 && n <= 31 && Math.floor(n) === n ? n : 0; };
  if (mode === '締切日を指定') return dateText_(l.tenyoUkeDate) ? '締切 ' + dateText_(l.tenyoUkeDate) : '';
  if (mode === '毎月の締切日') return day(l.tenyoUkeDay) ? '毎月' + day(l.tenyoUkeDay) + '日締切' : '';
  return monthlyText_(l.tenyoUkeFrom, l.tenyoUkeTo);
}

/** 農振除外の受付：「年2回（5月・11月）」 */
function jogaiUketsukeText_(kaisu, jiki) {
  const n = Number(kaisu);
  const k = n >= 1 && n <= 12 && Math.floor(n) === n ? '年' + n + '回' : '';
  const j = str_(jiki, 100);
  return k && j ? k + '（' + j + '）' : k || j;
}

/** 毎月の受付期間「毎月1日～10日」（1〜31以外は無視） */
function monthlyText_(from, to) {
  const d = function (v) { const n = Number(v); return n >= 1 && n <= 31 && Math.floor(n) === n ? n + '日' : ''; };
  const t = rangeText_(d(from), d(to));
  return t ? '毎月' + t : '';
}

/** 連絡先の配列 → 「氏名／住所／電話」を1行ずつ並べた文字列 */
function contactsToText_(list) {
  return (list || []).map(function (c) { return [c.name, c.address, c.tel].join('／'); }).join('\n');
}

/** 画面から受け取った連絡先（氏名・住所・電話）を整える。空行は除き、最大 MAX_CONTACTS 件 */
function normalizeContacts_(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (c) { return { name: str_(c && c.name, 50), address: str_(c && c.address, 100), tel: str_(c && c.tel, 20) }; })
    .filter(function (c) { return c.name || c.address || c.tel; })
    .slice(0, MAX_CONTACTS);
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

  // 資料 ＝ ファイルをアップロードした種別
  const uploaded = attachments.map(function (a) { return a.docType; });
  const docsOther = str_(f.documentsOther, 100);
  const documents = FORM_OPTIONS.documents
    .filter(function (d) { return uploaded.indexOf(d) >= 0; })
    .map(function (d) { return d === 'その他' && docsOther ? 'その他（' + docsOther + '）' : d; });

  const master = getMasterList_();
  const lots = (Array.isArray(f.lots) ? f.lots : [])
    .slice(0, MAX_LOTS)
    .map(function (l) {
      // 都道府県は物件ごと（未指定なら案件の都道府県）
      const lp = str_(l && l.prefecture, 10) || prefecture;
      return Object.assign(normalizeLot_(l || {}, lp, master), { prefecture: lp });
    });

  return {
    requesterName: str_(f.requesterName, 50),
    trust: f.trust === true,
    prefecture: prefecture,
    lots: lots,
    plan: str_(f.plan, 1000),
    // 転用目的は物件ごと（調整区域のみ）。案件には各物件の目的をまとめて記録
    purpose: lots.map(function (l) { return l.purpose; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('・'),
    documents: documents,
    attachments: attachments,
    submittedBy: getUserEmail_(),
  };
}

/** 物件1件分の入力を整える */
function normalizeLot_(l, prefecture, master) {
  // 画面は「市区町村」と「所在・地番（町名・字〜地番）」の2欄。
  // シートには 所在＝市区町村＋町名・字、地番＝末尾の地番 に分けて保存する（末尾の数字部分を切り出すだけ・推測なし）
  let municipality = str_(l.municipality, 50);
  if (municipality.indexOf(prefecture) === 0) municipality = municipality.slice(prefecture.length).trim();
  let place = str_(l.address);
  if (place.indexOf(prefecture) === 0) place = place.slice(prefecture.length).trim();
  if (municipality && place.indexOf(municipality) === 0) place = place.slice(municipality.length).trim(); // 市区町村を重ねて入力した場合
  const split = splitLotNumber_(place);
  const kairyoOn = pick_(l.landImprovement, FORM_OPTIONS.yesNoUnknown) === 'はい';
  const benefitOn = kairyoOn && pick_(l.kairyoBenefit, FORM_OPTIONS.kairyoBenefit) === '該当する';
  const permitZone = PERMIT_ZONES.indexOf(pick_(l.zone, FORM_OPTIONS.zones)) >= 0; // 許可が必要な区域
  const jogaiOn = pick_(l.zone, FORM_OPTIONS.zones) !== '市街化区域' &&
    ['はい', '分からない'].indexOf(pick_(l.isNoshin, FORM_OPTIONS.yesNoUnknown)) >= 0; // 青地（または不明）
  const purpose = pick_(l.zone, FORM_OPTIONS.zones) === '市街化調整区域' ? pick_(l.purpose, FORM_OPTIONS.purposes) : '';
  const drainOn = purpose === '分家住宅';
  const convOn = pick_(l.isConverted, FORM_OPTIONS.yesNo) === 'はい';
  const rirekiOn = convOn && pick_(l.tenyoRireki, FORM_OPTIONS.tenyoRireki) === 'あり';
  const shimatsuOn = convOn && !rirekiOn && pick_(l.shimatsusho, FORM_OPTIONS.shimatsusho) === '必要';                                        // 分家住宅は排水先を確認
  const drainConsentOn = drainOn && pick_(l.drainConsent, FORM_OPTIONS.drainConsent) === '必要';
  const drainLocalOn = drainConsentOn && pick_(l.drainLocalConsent, FORM_OPTIONS.localConsent) === '必要';

  const areaText = str_(l.area).replace(/[,，]/g, '');
  const landUse = pick_(l.landUse, FORM_OPTIONS.landUses);
  const landUseOther = str_(l.landUseOther, 100);

  return {
    address: municipality + split.place,
    municipality: municipality,
    lotNumber: split.lotNumber.slice(0, 100),
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
    chimokuHenko: l.chimokuHenko === true,
    // 土地改良区への電話確認の結果（「はい（かかっている）」のときだけ保存）
    kairyoName: kairyoOn ? str_(l.kairyoName, 100) : '',
    kairyoTel: kairyoOn ? str_(l.kairyoTel, 20) : '',
    kairyoBenefit: kairyoOn ? pick_(l.kairyoBenefit, FORM_OPTIONS.kairyoBenefit) : '',
    // 受益地に該当する場合だけ：手続きの要否・決済金（決済金が「必要」のときだけ金額）
    kairyoProcedure: benefitOn ? pick_(l.kairyoProcedure, FORM_OPTIONS.kairyoProcedure) : '',
    kairyoSettlement: benefitOn ? pick_(l.kairyoSettlement, FORM_OPTIONS.kairyoSettlement) : '',
    kairyoSettlementNote: benefitOn && pick_(l.kairyoSettlement, FORM_OPTIONS.kairyoSettlement) === '必要'
      ? settlementText_(l.kairyoSettlementNote, pick_(l.kairyoSettlementUnit, FORM_OPTIONS.settlementUnits), areaText === '' ? null : Number(areaText)) : '',
    // 決済金とは別の手数料など（金額・内容）
    kairyoFee: benefitOn && yenText_(l.kairyoFeeAmount)
      ? [(pick_(l.kairyoFeeUnit, FORM_OPTIONS.kairyoFeeUnits) || '1申請あたり') + ' ' + yenText_(l.kairyoFeeAmount), str_(l.kairyoFeeNote, 100)].filter(String).join('／')
      : '',
    // 見積（実費）の計算用の数値
    settlementAmount: benefitOn && pick_(l.kairyoSettlement, FORM_OPTIONS.kairyoSettlement) === '必要' ? numOrZero_(l.kairyoSettlementNote) : 0,
    settlementUnit: pick_(l.kairyoSettlementUnit, FORM_OPTIONS.settlementUnits) || '総額',
    kairyoFeeAmount: benefitOn ? numOrZero_(l.kairyoFeeAmount) : 0,
    kairyoFeeUnit: pick_(l.kairyoFeeUnit, FORM_OPTIONS.kairyoFeeUnits) || '1申請あたり',
    // 地元の農業委員・推進委員の押印（「必要」のときだけ氏名・連絡先を保存）
    iinStamp: pick_(l.iinStamp, FORM_OPTIONS.iinStamp),
    iinContacts: pick_(l.iinStamp, FORM_OPTIONS.iinStamp) === '必要' ? normalizeContacts_(l.iinContacts) : [],
    // 地元関係者の同意（土地改良区へ確認。「必要」のときだけ氏名・住所・電話を保存）
    localConsent: kairyoOn ? pick_(l.localConsent, FORM_OPTIONS.localConsent) : '',
    localContacts: kairyoOn && pick_(l.localConsent, FORM_OPTIONS.localConsent) === '必要' ? normalizeContacts_(l.localContacts) : [],
    // 転用の見込み（許可が必要な区域で農業委員会に確認）
    purpose: purpose,
    // 転用済みの物件：過去の届出受理・許可の履歴（「あり」のときだけ年月日・番号・内容）
    tenyoRireki: convOn ? pick_(l.tenyoRireki, FORM_OPTIONS.tenyoRireki) : '',
    rirekiDate: rirekiOn ? dateText_(l.rirekiDate) : '',
    rirekiNo: rirekiOn ? str_(l.rirekiNo, 50) : '',
    rirekiNote: rirekiOn ? str_(l.rirekiNote, 200) : '',
    // 履歴がない（無断転用）場合：始末書の提出と押印（「必要」のときだけ押印と備考）
    shimatsusho: convOn && !rirekiOn ? pick_(l.shimatsusho, FORM_OPTIONS.shimatsusho) : '',
    shimatsuStamp: shimatsuOn ? pick_(l.shimatsuStamp, FORM_OPTIONS.shimatsusho) : '',
    shimatsuNote: shimatsuOn ? str_(l.shimatsuNote, 200) : '',
    tenyoKanou: permitZone ? pick_(l.tenyoKanou, FORM_OPTIONS.tenyoKanou) : '',
    noutiKubun: permitZone ? pick_(l.noutiKubun, FORM_OPTIONS.noutiKubun) : '',
    kanouNote: permitZone ? str_(l.kanouNote, 300) : '',
    // 農振除外の見込み（青地「はい」「分からない」のとき）
    jogaiKanou: jogaiOn ? pick_(l.jogaiKanou, FORM_OPTIONS.tenyoKanou) : '',
    hojoKuiki: jogaiOn ? pick_(l.hojoKuiki, FORM_OPTIONS.hojoKuiki) : '',
    hojo8nen: jogaiOn && pick_(l.hojoKuiki, FORM_OPTIONS.hojoKuiki) === '区域内' ? pick_(l.hojo8nen, FORM_OPTIONS.hojo8nen) : '',
    jogaiJisseki: jogaiOn ? pick_(l.jogaiJisseki, FORM_OPTIONS.jogaiJisseki) : '',
    jogaiUketsuke: jogaiOn ? jogaiUketsukeText_(l.jogaiKaisu, l.jogaiJiki) : '',
    tenyoUketsuke: permitZone || jogaiOn ? tenyoUketsukeText_(l) : '',
    jogaiNote: jogaiOn ? str_(l.jogaiNote, 300) : '',
    // 排水先（分家住宅のとき）
    drainAdjacent: drainOn ? pick_(l.drainAdjacent, FORM_OPTIONS.drainAdjacent) : '',
    drainConsent: drainOn ? pick_(l.drainConsent, FORM_OPTIONS.drainConsent) : '',
    drainName: drainConsentOn ? str_(l.drainName, 100) : '',
    drainTel: drainConsentOn ? str_(l.drainTel, 20) : '',
    drainFee: drainConsentOn ? [yenText_(l.drainFeeAmount), str_(l.drainFeeNote, 100)].filter(String).join('／') : '',
    drainFeeAmount: drainConsentOn ? numOrZero_(l.drainFeeAmount) : 0,
    drainLocalConsent: drainConsentOn ? pick_(l.drainLocalConsent, FORM_OPTIONS.localConsent) : '',
    drainContacts: drainLocalOn ? normalizeContacts_(l.drainContacts) : [],
  };
}

/**
 * 「○○町字△△ 123番1」の末尾から地番を切り出す（例：123番1／123番地1／123-1／123）。
 * 末尾が数字で終わらない場合は地番なし（空文字）。画面側（JavaScript.html）と同じ規則。
 * @return {{place:string, lotNumber:string}}
 */
function splitLotNumber_(text) {
  const m = String(text || '').match(LOT_NUMBER_TAIL_RE);
  return m ? { place: m[1].trim(), lotNumber: m[2] } : { place: String(text || '').trim(), lotNumber: '' };
}

/** 保存前の必須チェック。エラーメッセージの配列を返す（空ならOK） */
function validateInput_(input) {
  const errors = [];
  if (!input.requesterName) errors.push('依頼者名を入力してください。');
  if (!input.lots.length) errors.push('物件を1件以上入力してください。');
  input.lots.forEach(function (l, i) {
    const name = '物件' + (i + 1) + '：';
    if (!l.municipality) errors.push(name + '市区町村を入力してください。');
    if (!l.lotNumber) errors.push(name + '所在・地番の末尾に地番を入力してください（例：○○町字△△ 123番1）。');
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

/**
 * 失敗内容を「エラーログ」シートに記録する（原因調査用）。記録自体の失敗は無視する。
 * @param {string} where 発生した処理
 * @param {*} e 例外
 * @param {string=} detail 補足（ファイル名など）
 */
function logError_(where, e, detail) {
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET_NAMES.ERRORS) || ss.insertSheet(SHEET_NAMES.ERRORS);
    if (sheet.getLastRow() === 0) sheet.appendRow(['日時', 'ユーザー', '処理', '内容', '補足', '詳細']);
    sheet.appendRow([new Date(), getUserEmail_(), where, String(e && e.message || e),
      String(detail || ''), String(e && e.stack || '').slice(0, 2000)]);
  } catch (ignore) {
    // ログが書けなくても本来の処理結果は返す
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
    if (sheet.getLastColumn() < CASE_COLUMNS.length) ensureHeaders_(sheet, CASE_COLUMNS.map(function (c) { return c.header; })); // 列を追加した後の初回
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
    fees[d.key] = { label: d.label, amount: d.amount, zone: d.zone || '', surveyZone: d.surveyZone || '' };
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
 *  ・農振除外／地区除外：該当する物件が1つでもあれば1回加算（地区除外は「分からない」も加算）
 *  ・地元同意書（自治会・水利組合等）：土地改良区に確認して「必要」「未確認」、または土地改良区が「分からない」物件があれば1回加算
 *  ・事後手続き：許可の区域（調整・非線引き）に該当物件があれば1回加算（届出では不要）
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
      notes.push(lotName(lot, i) + '：区域不明のため届出として仮計算しています。');
    }
    if (zones.indexOf(zone) < 0) zones.push(zone);
  });
  for (let z = 0; z < zones.length; z++) {
    const baseKey = Object.keys(fees).filter(function (k) { return fees[k].zone === zones[z]; })[0];
    if (!baseKey) {
      return { ok: false, total: 0, items: [], notes: ['区域「' + zones[z] + '」の基本報酬が設定されていません。'] };
    }
    const base = item(baseKey);
    if (input.trust) { // 信託手続きに付随する場合は農地転用の基本報酬を1.5倍
      base.label += '（信託手続き付随）';
      base.amount = Math.round(base.amount * TRUST_MULTIPLIER);
    }
    items.push(base);
  }
  // 調査実費（区域区分ごとに1回）
  zones.forEach(function (z) {
    const surveyKey = Object.keys(fees).filter(function (k) { return fees[k].surveyZone === z; })[0];
    if (surveyKey && fees[surveyKey].amount > 0) items.push(cost(item(surveyKey)));
  });
  if (zones.length > 1) {
    notes.push('区域区分が異なるため、申請' + zones.length + '件として計算しています。');
  }

  // --- 2. 物件（筆）追加 加算 ---
  const extraLots = lots.length - zones.length;
  if (extraLots > 0) items.push(item('ADD_PER_EXTRA_LOT', extraLots));

  // --- 3. 農振除外 加算 ---
  const noshinYes = lots.filter(function (l) { return l.isNoshin === 'はい'; });
  if (noshinYes.length) {
    items.push(item('ADD_NOSHIN'));
    if (noshinYes.some(function (l) { return l.zone === '市街化区域'; })) {
      notes.push('市街化区域に農振農用地は通常ありません。農振図をご確認ください。');
    }
  } else if (lots.some(function (l) { return l.isNoshin === '分からない'; })) {
    notes.push('農振農用地の場合は +' + formatYen_(fees.ADD_NOSHIN.amount) + '（農振除外）が見込まれます。');
  }

  // --- 4. 土地改良区 地区除外 加算（「分からない」も加算。土地改良区に「受益地に該当しない」と確認できた物件は除く） ---
  const kairyoLots = lots.filter(function (l) {
    return l.landImprovement === '分からない' ||
      (l.landImprovement === 'はい' && l.kairyoBenefit !== '該当しない' && l.kairyoProcedure !== '不要');
  });
  if (kairyoLots.length) {
    items.push(item('ADD_LAND_IMPROVEMENT'));
    if (!kairyoLots.some(function (l) { return l.landImprovement === 'はい' && l.kairyoBenefit === '該当する'; })) {
      notes.push('土地改良区の受益地か未確認のため加算しています。該当しない場合は減額となります。');
    }
  }


  // --- 4-2. 地元同意書（自治会・水利組合等）加算：土地改良区へ確認。「必要」「未確認」、土地改良区が「分からない」で1回加算 ---
  const consentLots = lots.filter(function (l) {
    return l.landImprovement === '分からない' || (l.landImprovement === 'はい' && l.localConsent !== '不要') ||
      (l.drainConsent === '必要' && l.drainLocalConsent !== '不要'); // 排水承諾で地元承諾が必要な場合も
  });
  if (consentLots.length) {
    items.push(item('ADD_WATER_ASSOCIATION'));
    if (!consentLots.some(function (l) { return l.localConsent === '必要' || (l.drainConsent === '必要' && l.drainLocalConsent === '必要'); })) {
      notes.push('地元関係者の同意（押印）が未確認のため加算しています。不要な場合は減額となります。');
    }
  }

  // --- 4-3. 分家住宅：分家建築許可（調整区域）・排水承諾手続 ---
  const bunkeLots = lots.filter(function (l) { return l.purpose === '分家住宅'; }); // 目的は調整区域の物件のみ
  if (bunkeLots.length) {
    items.push(item('ADD_BUNKE'));
    notes.push('開発許可（都市計画法29条）となる場合は金額が変わります。');
    const drainLots = bunkeLots.filter(function (l) { return l.drainConsent !== '不要'; });
    if (drainLots.length) {
      items.push(item('ADD_DRAINAGE'));
      if (!drainLots.some(function (l) { return l.drainConsent === '必要'; })) {
        notes.push('排水承諾の要否が未確認のため加算しています。不要な場合は減額となります。');
      }
    }

  }
  lots.forEach(function (l, i) {
    // 現況利用と「既に転用済み」の食い違い
    if (CONVERTED_LAND_USES.indexOf(l.landUse) >= 0 && l.isConverted === 'いいえ') {
      notes.push(lotName(l, i) + '：現況が「' + l.landUse + '」のため既に転用している状態です（「既に転用済み」が「いいえ」になっています）。');
    } else if (FARMLAND_LAND_USES.indexOf(l.landUse) >= 0 && l.isConverted === 'はい') {
      notes.push(lotName(l, i) + '：現況が農地（' + l.landUse + '）なのに「既に転用済み」が「はい」になっています。ご確認ください。');
    }
    if (l.noutiKubun === '甲種' || l.noutiKubun === '第1種') {
      notes.push(lotName(l, i) + '：' + l.noutiKubun + '農地は原則として転用が認められません（例外要件に該当する場合を除く）。');
    }
    if (l.hojo8nen === '未経過') {
      notes.push(lotName(l, i) + '：土地改良事業の完了から8年を経過していないため、農振除外の要件を満たしません。');
    }
    if (l.jogaiUketsuke) notes.push(lotName(l, i) + '：農振除外の受付 ' + l.jogaiUketsuke + '。');
    if (l.tenyoUketsuke) notes.push(lotName(l, i) + '：農地転用の受付 ' + l.tenyoUketsuke + '。');
    if (l.jogaiKanou === '難しい') {
      notes.push(lotName(l, i) + '：農業委員会より農振除外は難しいとの回答があります' + (l.jogaiNote ? '（' + l.jogaiNote + '）' : '') + '。');
    }
    if (l.tenyoKanou === '難しい') {
      notes.push(lotName(l, i) + '：農業委員会より転用は難しいとの回答があります' + (l.kanouNote ? '（' + l.kanouNote + '）' : '') + '。');
    }
  });

  // --- 5. 現況証明（非農地証明）：市街化区域外で、既に宅地など農地以外として利用されている物件 ---
  const isConvertedLot = function (l) {
    return l.isConverted === 'はい' || CONVERTED_LAND_USES.indexOf(l.landUse) >= 0;
  };
  const genkyo = lots.filter(function (l) { return isConvertedLot(l) && PERMIT_ZONES.indexOf(l.zone) >= 0; });
  if (genkyo.length) {
    items.push(item('ADD_GENKYO'));
    notes.push('現況が農地以外の物件は、現況証明（非農地証明）で対応できる場合があります（その場合は農地転用の許可申請が不要となり、金額が変わります）。');
  } else if (lots.some(function (l) { return isConvertedLot(l) && l.zone === '分からない'; })) {
    notes.push('市街化区域外の場合は +' + formatYen_(fees.ADD_GENKYO.amount) + '（現況証明（非農地証明））が見込まれます。');
  }

  // --- 5b. 地目変更登記：チェックした物件があれば1回（2筆以上の筆数加算は都度調整） ---
  const chimokuLots = lots.filter(function (l) { return l.chimokuHenko === true; });
  if (chimokuLots.length) {
    items.push(item('ADD_CHIMOKU'));
    if (chimokuLots.length > 1) notes.push('地目変更登記は' + chimokuLots.length + '筆です。筆数加算は都度調整します。');
  }

  // --- 6. 実費：地区除外決済金（申請地の面積合計から計算）・土地改良区の手数料・用水の手数料 ---
  addActualCosts_(lots, items, notes);

  // 報酬（税抜）＋消費税＋実費（非課税）
  const costTotal = items.filter(function (it) { return it.kind === 'cost'; }).reduce(function (sum, it) { return sum + it.amount; }, 0);
  const feeSubtotal = items.filter(function (it) { return it.kind !== 'cost'; }).reduce(function (sum, it) { return sum + it.amount; }, 0);
  const tax = Math.floor(feeSubtotal * TAX_RATE);
  const total = feeSubtotal + tax + costTotal;
  notes.push('概算です。正式なお見積りは調査後にご案内いたします。');
  // 始末書（無断転用）の提出が必要な物件
  lots.forEach(function (l, i) {
    if (l.shimatsusho !== '必要') return;
    notes.push(lotName(l, i) + '：農業委員会より始末書の提出が必要との回答があります' +
      (l.shimatsuStamp === '必要' ? '（押印が必要' + (l.shimatsuNote ? '：' + l.shimatsuNote : '') + '）' : l.shimatsuNote ? '（' + l.shimatsuNote + '）' : '') + '。');
  });
  // 最後に：過去の転用届出・許可の履歴がある物件（新たな手続きが不要な場合がある）
  lots.forEach(function (l, i) {
    if (l.tenyoRireki !== 'あり') return;
    const kind = l.zone === '市街化区域' ? '転用届出の受理' : l.zone === '分からない' ? '転用届出の受理または転用許可' : '転用許可';
    const detail = [l.rirekiDate, l.rirekiNo, l.rirekiNote].filter(String).join('・');
    notes.push(lotName(l, i) + '：過去に' + kind + 'の履歴があります' + (detail ? '（' + detail + '）' : '') +
      '。新たな手続きが不要な場合があります。');
  });
  return { ok: true, total: total, feeSubtotal: feeSubtotal, tax: tax, taxRate: TAX_RATE, feeTotal: feeSubtotal + tax,
    costTotal: costTotal, items: items, notes: notes };
}

/** 物件の呼び名（物件1（123番1）） */
function lotName_(l, i) {
  return '物件' + (i + 1) + (l.lotNumber ? '（' + l.lotNumber + '）' : '');
}

/** 見積の行を「実費」にする */
function cost(it) {
  it.kind = 'cost';
  return it;
}

/**
 * 実費を見積に加える。
 *  ・地区除外決済金：筆ごとに、その筆の単価 × その筆の面積（総額の場合はそのまま）
 *  ・土地改良区の手数料等：土地改良区ごとに、1申請あたりなら1回、1筆あたりなら受益地の筆数分
 *  ・用水の手数料（排水承諾）：用水ごとに1回
 */
function addActualCosts_(lots, items, notes) {
  const groups = {};
  lots.forEach(function (l, i) {
    if (l.landImprovement !== 'はい' || l.kairyoBenefit !== '該当する') return;
    const name = l.kairyoName || '土地改良区';
    // 決済金（筆ごと）
    if (l.settlementAmount > 0) {
      const lotLabel = '物件' + (i + 1) + (l.lotNumber ? '（' + l.lotNumber + '）' : '');
      if (l.settlementUnit === '総額') {
        items.push(cost({ label: '地区除外決済金 ' + lotLabel, amount: Math.round(l.settlementAmount) }));
      } else if (l.area > 0) {
        const total = l.settlementUnit === '㎡あたり' ? l.settlementAmount * l.area : l.settlementAmount * l.area / 10000;
        items.push(cost({ label: '地区除外決済金 ' + lotLabel + '：' + (l.settlementUnit === '㎡あたり' ? '1㎡' : '1ha') + 'あたり' +
          formatYen_(l.settlementAmount) + ' × ' + l.area + '㎡', amount: Math.round(total) }));
      } else {
        notes.push(lotName_(l, i) + '：面積が未入力のため、地区除外決済金を計算できません。');
      }
    }
    // 手数料等（改良区ごと）
    const g = groups[name] = groups[name] || { name: name, count: 0, fee: 0, unit: '' };
    g.count++;
    if (!g.fee && l.kairyoFeeAmount > 0) { g.fee = l.kairyoFeeAmount; g.unit = l.kairyoFeeUnit; }
  });
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (!(g.fee > 0)) return;
    if (g.unit === '1筆あたり') {
      items.push(cost({ label: '土地改良区 手数料等（' + g.name + '：1筆あたり' + formatYen_(g.fee) + ' × ' + g.count + '筆）', amount: Math.round(g.fee * g.count) }));
    } else {
      items.push(cost({ label: '土地改良区 手数料等（' + g.name + '：1申請あたり）', amount: Math.round(g.fee) }));
    }
  });
  const drains = {};
  lots.forEach(function (l) {
    if (l.drainConsent !== '必要' || !(l.drainFeeAmount > 0)) return;
    const key = l.drainName || '用水';
    if (!drains[key]) drains[key] = l.drainFeeAmount;
  });
  Object.keys(drains).forEach(function (k) {
    items.push(cost({ label: '排水承諾 手数料等（' + k + '）', amount: Math.round(drains[k]) }));
  });
}

/** 見積内訳をシート保存用の1つの文字列にする */
function estimateToText_(estimate) {
  if (!estimate.ok) return estimate.notes.join('\n');
  const fees = estimate.items.filter(function (it) { return it.kind !== 'cost'; });
  const costs = estimate.items.filter(function (it) { return it.kind === 'cost'; });
  return ['【報酬】'].concat(fees.map(function (it) { return '・' + it.label + '：' + formatYen_(it.amount); }))
    .concat(costs.length ? ['【実費】'].concat(costs.map(function (it) { return '・' + it.label + '：' + formatYen_(it.amount); })) : [])
    .concat(['報酬 ' + formatYen_(estimate.feeSubtotal) + '＋消費税 ' + formatYen_(estimate.tax) + '＝' + formatYen_(estimate.feeTotal) +
      '／実費 ' + formatYen_(estimate.costTotal) + '／合計 ' + formatYen_(estimate.total)])
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
  if (!lots.length) {
    // 読み取れなかった場合は、原因調査用に表題部の文字だけを記録する（権利部＝所有者の氏名などは記録しない）
    const excerpt = String(text || '').split(/権\s*利\s*部/)[0].slice(0, 1500);
    logError_('readTohon（所在・地番のパターン不一致）', '読み取れませんでした', file.getName() + '\n' + excerpt);
  }
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
  const chunks = text.split(/表\s*題\s*部/);
  const sections = chunks.slice(1);
  if (!sections.length) sections.push(text);

  const chimokuPattern = TOHON_CHIMOKU_WORDS.join('|');
  // 例）「123番1 畑 496」「123番1 宅地 165 28」「123番 田 1,024」
  const rowRe = new RegExp('(\\d+番(?:\\d+)?)\\s+(' + chimokuPattern + ')\\s+(\\d[\\d,]*)(?:\\s*[:.]?\\s*(\\d{2}))?(?=\\s|$)', 'g');

  const lots = [];
  sections.forEach(function (sec, idx) {
    // 登記情報提供サービス等の罫線の表（┃ │）で書かれた謄本は、表の構造から読む
    const table = parseTohonTable_(sec);
    if (table) {
      const dup0 = lots.some(function (l) { return l.address === table.address && l.lotNumber === table.lotNumber; });
      if (!dup0) lots.push(table);
      return;
    }
    // 紙の全部事項証明書は、各ページ上部に「現在の」所在・地番が印字されている（例：愛知県常滑市港町5丁目10）。
    // 下線（抹消）は文字認識で判別できないため、地番変更・所在変更があっても正しい値が取れるこの印字を最優先で使う。
    const header = idx < chunks.length - 1 || chunks.length > 1 ? tohonPageHeader_(chunks[idx]) : null;

    // 所在：最後に出てくる「所在」行。文字認識で「所 在「」「在「」「所 在|」のように崩れることがある
    let address = '';
    const addrRe = /(?:所\s*在|(?:^|\n)\s*在)\s*[|｜「│:]?\s*([^\n]+)/g;
    let m;
    while ((m = addrRe.exec(sec)) !== null) {
      const v = cleanTohonAddress_(m[1]);
      if (v) address = v;
    }

    // 地番・地目・地積：最後に一致した行を採用
    let row = null;
    rowRe.lastIndex = 0;
    while ((m = rowRe.exec(sec)) !== null) row = m;
    if (header) {
      address = header.address;
      // 行の地番が印字の地番と一致するときだけ、その行の地目・地積を使う（変更前の行の値を入れないため）
      if (row && row[1] !== header.lotNumber) row = null;
    }
    if (!row && !address && !header) return;

    const chimokuRaw = row ? row[2] : (header ? tohonSingleChimoku_(sec) : '');
    const area = row ? row[3].replace(/,/g, '') + (row[4] ? '.' + row[4] : '') : '';
    const lot = {
      address: address,
      lotNumber: header ? header.lotNumber : row ? row[1] : '',
      chimoku: FORM_OPTIONS.chimoku.indexOf(chimokuRaw) >= 0 ? chimokuRaw : (chimokuRaw ? 'その他' : ''),
      chimokuRaw: chimokuRaw,
      area: area,
    };
    const dup = lots.some(function (l) { return l.address === lot.address && l.lotNumber === lot.lotNumber; });
    if (!dup) lots.push(lot);
  });
  return lots;
}

/**
 * 紙の全部事項証明書のページ上部の印字「愛知県常滑市港町5丁目10」「常滑市港町5丁目22-1」から、現在の所在・地番を取り出す。
 * 表題部の直前（前のかたまりの最後）にある、市町村名を含み数字で終わる行（「番」「地」を含まない）を対象にする。
 * 権利部の住所（「…173番地」など）は「番」を含むので対象外。
 */
function tohonPageHeader_(chunk) {
  const lines = String(chunk || '').split('\n').map(function (l) { return l.trim(); }).filter(String);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
    const t = lines[i].replace(/\s+/g, '');
    if (/[番地]/.test(t)) continue;
    const m = t.match(/^(?:愛知県|岐阜県|三重県)?(.+?[市町村].*?)(\d+)(?:[-－‐ー](\d+))?$/);
    if (m && /[市郡町村]/.test(m[1])) {
      return { address: m[1], lotNumber: m[2] + '番' + (m[3] || '') };
    }
  }
  return null;
}

/** 表題部に地目の語が1種類だけ出てくる場合はそれを返す（複数あれば判断しない＝空欄） */
function tohonSingleChimoku_(sec) {
  const body = String(sec).split(/権\s*利\s*部/)[0];
  const found = TOHON_CHIMOKU_WORDS.filter(function (w) {
    return new RegExp('(?:^|\\n)\\s*' + w + '\\s*(?:\\n|$)').test(body);
  });
  return found.length === 1 ? found[0] : '';
}

/**
 * 罫線の表で書かれた表題部を読む（登記情報提供サービスの全部事項など）。
 *  ┃所 在│愛知郡長久手町大字熊張字松杁 │ ┃   ← 旧所在
 *  ┃ │長久手市松杁 │平成２４年１月４日市制施行┃  ← 最新（行頭に「所在」なし）
 *  ┃１６７５番 │宅地 │ ４１３：２２│ ┃
 *  ┃ │ │ ４８８：７０│③錯誤 ┃            ← 地積だけの更正（地番・地目は空欄）
 * 所在は「所在」の行から地番の見出しまでの2列目、地番・地目・地積は見出しより後の各行で、空欄でない最後の値を採用する。
 * 表の形でなければ null（従来の読み方に回す）。
 */
function parseTohonTable_(sec) {
  if (sec.indexOf('┃') < 0 || sec.indexOf('│') < 0) return null;
  const lines = [];
  // 1行＝左端（┃┠┏┗）から右端（┃┨┓┛）まで。罫線だけの区切り行（─ ━ ┼ ├ など）は読み飛ばす
  const re = /[┃┠┏┗]([^┃┠┨┏┓┗┛]*)[┃┨┓┛]/g;
  let m;
  while ((m = re.exec(sec)) !== null) {
    if (/^[\s─━┼├┤┬┴┯┷┿]*$/.test(m[1])) continue;
    lines.push(m[1].split('│').map(function (c) { return c.replace(/\s+/g, ''); }));
  }
  let mode = '';
  let address = '', lotNumber = '', chimokuRaw = '', area = '';
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i];
    const head = cells.join('');
    if (/権利部/.test(head)) break;
    if (cells[0] === '所在') { mode = 'shozai'; }
    else if (/地番/.test(head) && /地目/.test(head)) { mode = 'rows'; continue; }
    if (mode === 'shozai') {
      if (cells[0] && cells[0] !== '所在') { mode = ''; continue; } // 所在の欄を過ぎた
      const v = cleanTohonAddress_(cells[1] || '');
      if (v) address = v;
    } else if (mode === 'rows') {
      const n = (cells[0] || '').match(/^(\d+番(?:地)?\d*)/);
      if (n) lotNumber = n[1].replace('番地', '番');
      const c = (cells[1] || '').replace(/[①-⑳]/g, '');
      if (c && TOHON_CHIMOKU_WORDS.indexOf(c) >= 0) chimokuRaw = c;
      const a = (cells[2] || '').match(/^(\d[\d,]*)(?::(\d{1,2}))?$/);
      if (a) area = a[1].replace(/,/g, '') + (a[2] && Number(a[2]) > 0 ? '.' + a[2] : '');
    }
  }
  if (!address && !lotNumber) return null;
  return {
    address: address,
    lotNumber: lotNumber,
    chimoku: FORM_OPTIONS.chimoku.indexOf(chimokuRaw) >= 0 ? chimokuRaw : (chimokuRaw ? 'その他' : ''),
    chimokuRaw: chimokuRaw,
    area: area,
  };
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
    return { ok: false, message: 'Webhook URLが未設定です（管理画面の設定タブで登録）' };
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
    '依頼者名：' + (input.requesterName || '（未入力）') + (input.trust ? '（信託手続きに付随）' : ''),
    '物件：' + input.lots.length + '件（' + input.prefecture + '）' + (input.purpose ? '／転用目的：' + input.purpose : ''),
  ];
  input.lots.forEach(function (l, i) {
    lines.push('　' + (i + 1) + '. ' + (l.address || '（所在未入力）') + ' ' + l.lotNumber +
      '／' + (l.chimoku || '地目-') + (l.area !== null ? ' ' + l.area + '㎡' : '') +
      '／' + (l.zone || '区域-') + '／農振:' + (l.isNoshin || '-') + '／現況:' + (l.landUse || '-') +
      (l.readFromTohon ? '（謄本読取）' : '') + (l.chimokuHenko ? '／地目変更登記あり' : ''));
    if (l.landImprovement === 'はい' && (l.kairyoName || l.kairyoBenefit || l.kairyoSettlement)) {
      lines.push('　　土地改良区：' + (l.kairyoName || '名称未入力') + (l.kairyoTel ? '（' + l.kairyoTel + '）' : '') +
        '／受益地:' + (l.kairyoBenefit || '-') + (l.kairyoProcedure ? '／手続き:' + l.kairyoProcedure : '') +
        (l.kairyoSettlement ? '／決済金:' + l.kairyoSettlement : '') +
        (l.kairyoSettlementNote ? '（' + l.kairyoSettlementNote + '）' : '') + (l.kairyoFee ? '／手数料等 ' + l.kairyoFee : ''));
    }
    if (l.iinStamp === '必要') {
      lines.push('　　農業委員等の押印：必要');
      (l.iinContacts || []).forEach(function (c) { lines.push('　　　' + [c.name, c.address, c.tel].join('／')); });
    }
    if (l.tenyoRireki) {
      lines.push('　　過去の転用届出・許可の履歴：' + l.tenyoRireki +
        (l.tenyoRireki === 'あり' ? '（' + [l.rirekiDate, l.rirekiNo, l.rirekiNote].filter(String).join('・') + '）' : ''));
    }
    if (l.shimatsusho) {
      lines.push('　　始末書の提出：' + l.shimatsusho + (l.shimatsuStamp ? '／押印 ' + l.shimatsuStamp : '') + (l.shimatsuNote ? '（' + l.shimatsuNote + '）' : ''));
    }
    if (l.tenyoKanou || l.noutiKubun) {
      lines.push('　　転用の見込み（農業委員会）：' + (l.tenyoKanou || '-') + '／農地区分 ' + (l.noutiKubun || '-') +
        (l.kanouNote ? '／' + l.kanouNote : ''));
    }
    if (l.jogaiKanou || l.hojoKuiki || l.jogaiJisseki || l.jogaiUketsuke) {
      lines.push('　　農振除外の見込み：' + (l.jogaiKanou || '-') + '／ほ場整備等 ' + (l.hojoKuiki || '-') + (l.hojo8nen ? '（8年' + l.hojo8nen + '）' : '') +
        '／近隣の除外実績 ' + (l.jogaiJisseki || '-') + (l.jogaiUketsuke ? '／受付 ' + l.jogaiUketsuke : '') + (l.jogaiNote ? '／' + l.jogaiNote : ''));
    }
    if (l.tenyoUketsuke) lines.push('　　農地転用の受付：' + l.tenyoUketsuke);
    if (l.drainConsent || l.drainAdjacent) {
      lines.push('　　排水：隣接水路 ' + (l.drainAdjacent || '-') + '／排水承諾 ' + (l.drainConsent || '-') +
        (l.drainName ? '／' + l.drainName + (l.drainTel ? '（' + l.drainTel + '）' : '') : '') +
        (l.drainFee ? '／手数料 ' + l.drainFee : '') + (l.drainLocalConsent ? '／地元承諾 ' + l.drainLocalConsent : ''));
      (l.drainContacts || []).forEach(function (c) { lines.push('　　　' + [c.name, c.address, c.tel].join('／')); });
    }
    if (l.localConsent) {
      lines.push('　　地元関係者の同意（押印）：' + l.localConsent);
      (l.localContacts || []).forEach(function (c) { lines.push('　　　' + [c.name, c.address, c.tel].join('／')); });
    }
  });
  lines.push(
    '概算見積金額：' + (estimate.ok ? formatYen_(estimate.total) : '算出不可'),
    '資料：' + (input.documents.join('、') || 'なし'),
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

/**
 * 管理画面からの削除。案件と物件明細は「削除した案件」「削除した物件明細」シートに控えを残す（資料フォルダは残す）。
 * @param {number} caseId
 * @return {{id:number, lots:number}}
 */
function deleteCaseByAdmin(caseId) {
  requireAdmin_();
  const id = Number(caseId);
  if (!id) throw new Error('案件IDが不正です。');
  const r = deleteCase_(id, getUserEmail_());
  return { id: id, lots: r.lots };
}

/** 管理者かどうか（スクリプトプロパティ ADMIN_EMAILS が優先） */
function isAdmin_() {
  const email = getUserEmail_().toLowerCase();
  if (!email) return false;
  return getAdminEmails_().indexOf(email) >= 0;
}

function requireAdmin_() {
  if (!isAdmin_()) throw new Error('この操作を行う権限がありません。');
}

// ------------------------------------------------------------
// 設定タブ（見積金額・管理者・Chat 通知）
// ------------------------------------------------------------

/** 設定タブの表示内容 */
function getAdminSettings() {
  requireAdmin_();
  const fees = getFeeSettings_();
  const props = PropertiesService.getScriptProperties();
  return {
    fees: DEFAULT_FEES.map(function (d) {
      return { key: d.key, label: fees[d.key].label, amount: fees[d.key].amount, note: d.note };
    }),
    adminEmails: getAdminEmails_(),
    adminEmailsFromProps: !!props.getProperty('ADMIN_EMAILS'),
    webhookUrl: getWebhookUrl_(),
    spreadsheetUrl: getSpreadsheet_().getUrl(),
    folderUrl: getRootFolder_().getUrl(),
  };
}

/**
 * 見積の項目名・金額を「見積設定」シートに保存する（無い行は追加してから保存）。
 * @param {Array<{key:string, label:string, amount:(string|number)}>} rows
 */
function saveFeeSettings(rows) {
  requireAdmin_();
  const known = DEFAULT_FEES.map(function (d) { return d.key; });
  const clean = (rows || []).map(function (r) {
    const key = String(r.key);
    if (known.indexOf(key) < 0) throw new Error('不明な項目です：' + key);
    const label = String(r.label || '').trim().slice(0, 100);
    if (!label) throw new Error('項目名が空欄の行があります。');
    const s = String(r.amount).replace(/[,，¥円\s]/g, '');
    const amount = Number(s);
    if (s === '' || isNaN(amount) || amount < 0) throw new Error('「' + label + '」の金額は0以上の数値で入力してください。');
    return { key: key, label: label, amount: Math.round(amount) };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    const ss = getSpreadsheet_();
    const sheet = getOrCreateSheet_(ss, SHEET_NAMES.FEES);
    ensureHeaders_(sheet, FEE_HEADERS);
    addMissingFeeRows_(sheet);
    const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
      .map(function (r) { return String(r[0]).trim(); });
    clean.forEach(function (r) {
      const i = keys.indexOf(r.key);
      if (i >= 0) sheet.getRange(i + 2, 2, 1, 2).setValues([[r.label, r.amount]]);
    });
  } finally {
    lock.releaseLock();
  }
  return getAdminSettings();
}

/**
 * 管理者を保存する（1行1件またはカンマ区切り）。自分を外す変更は受け付けない（締め出し防止）。
 * @param {string} text
 */
function saveAdminEmails(text) {
  requireAdmin_();
  const list = String(text || '').split(/[\s,，、]+/)
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(String)
    .filter(function (s, i, a) { return a.indexOf(s) === i; });
  const bad = list.filter(function (s) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); });
  if (bad.length) throw new Error('メールアドレスの形式が正しくありません：' + bad.join('、'));
  const me = getUserEmail_().toLowerCase();
  if (list.indexOf(me) < 0) throw new Error('ご自身（' + me + '）を管理者から外すことはできません。');
  PropertiesService.getScriptProperties().setProperty('ADMIN_EMAILS', list.join(','));
  return getAdminSettings();
}

/**
 * Google Chat の Webhook URL を保存する（空欄で通知停止）。
 * @param {string} url
 */
function saveWebhookUrl(url) {
  requireAdmin_();
  const u = String(url || '').trim();
  if (u && u.indexOf('https://chat.googleapis.com/') !== 0) {
    throw new Error('Google Chat の Webhook URL（https://chat.googleapis.com/ で始まるもの）を入力してください。');
  }
  PropertiesService.getScriptProperties().setProperty('CHAT_WEBHOOK_URL', u);
  return getAdminSettings();
}

/** 保存済みの Webhook にテスト通知を送る */
function sendTestNotification() {
  requireAdmin_();
  return postToChat_('【テスト】農地転用 見積・調査支援システムからの通知テストです（' + getUserEmail_() + '）。');
}

/** 管理者の一覧（スクリプトプロパティ ADMIN_EMAILS が優先、無ければ Config.gs） */
function getAdminEmails_() {
  const fromProps = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  return (fromProps ? fromProps.split(',') : ADMIN_EMAILS)
    .map(function (s) { return String(s).trim().toLowerCase(); })
    .filter(String);
}
