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
  { key: 'ADD_WATER_ASSOCIATION', label: '地元承諾書（区長・水利組合等）（1人あたり）', amount: 20000,
    note: '同意（押印）が必要な人数分を加算（土地改良区で確認した地元関係者＋排水の地元承諾者。同じ人は1人）。人数が未確認（「未確認」「分からない」）の場合は1人分で仮計上' },
  { key: 'ADD_BUNKE', label: '分家建築許可申請（都市計画法43条）', amount: 300000,
    note: '転用目的が「分家住宅」で、市街化調整区域の物件がある場合に加算（料金表 4001。開発許可（29条）となる場合は 4002）' },
  { key: 'ADD_DRAINAGE', label: '排水承諾手続', amount: 40000,
    note: '転用目的が「分家住宅」で、排水承諾が「必要」「未確認」（未回答を含む）の物件がある場合に加算（料金表 4203）' },
  { key: 'ADD_GENKYO', label: '現況証明（非農地証明）願出', amount: 120000,
    note: '農業委員会に確認し、非農地証明（現況証明）で対応できると回答があった物件がある場合に加算（その物件は許可申請を計上しない。料金表 4100）' },
  { key: 'ADD_CHIMOKU', label: '地目変更登記', amount: 48000,
    note: '「地目変更登記が必要」にチェックした物件がある場合に1回加算（料金表 3201。2筆までこの金額のみ）' },
  { key: 'ADD_CHIMOKU_EXTRA', label: '地目変更登記 筆数加算（3筆目から1筆あたり）', amount: 5000,
    note: '地目変更登記が3筆以上の場合、3筆目から1筆ごとに加算' },
  { key: 'ADD_PER_EXTRA_LOT', label: '筆数加算・許可（1筆あたり）', amount: 10000,
    note: '「筆数加算をする」にチェックした場合だけ、許可（市街化調整区域・非線引き・都市計画区域外）の同じ申請の2筆目以降1筆ごとに加算' },
  { key: 'ADD_PER_EXTRA_LOT_TODOKE', label: '筆数加算・届出（1筆あたり）', amount: 10000,
    note: '「筆数加算をする」にチェックした場合だけ、届出（市街化区域。区域不明の仮計算を含む）の同じ申請の2筆目以降1筆ごとに加算（金額は仮。設定で変更）' },
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
  '2026-04': ['ADD_PER_EXTRA_LOT:label'], // 筆数加算を許可・届出で分けたため名称と条件だけ更新（金額はそのまま）
  '2026-05': ['ADD_CHIMOKU:label'],       // 地目変更登記は2筆まで加算なし・3筆目から筆数加算（条件の説明だけ更新）
  '2026-06': ['ADD_WATER_ASSOCIATION:label'], // 地元承諾書は人数分（名称と条件だけ更新、金額はそのまま）
  '2026-07': ['ADD_GENKYO:label'],            // 現況証明は「非農地証明で対応できる」と回答があった場合だけ（条件の説明だけ更新）
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
const MAX_KAIRYO_EXTRA = 3; // 1つの物件で追加できる土地改良区（2つ目以降）の数
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
  shimatsusho: ['必要', '不要', '未確認'],                  // 無断転用の始末書（顛末書）の提出（農業委員会に確認）
  hinochi: ['可能', '不可', '未確認'],                     // 無断転用の物件：非農地証明（現況証明）で対応できるか（農業委員会に確認）
  hinochiDocs: ['航空写真', '固定資産税の課税地目（評価証明）', '建物の登記・家屋の課税', '公共料金の領収書など', '近隣・地元の証明', '現地確認'],
  zeseiKyoka: ['できる', 'できない', '要相談・未確認'],      // 非農地証明が不可の場合：是正のための許可（届出）申請ができるか
  saiShinsei: ['必要', '不要', '未確認'],                   // 許可・届出済み（履歴あり）の場合、再申請（改めての許可・届出）が必要か（農業委員会に確認）
  kairyoProcedure: ['必要', '不要', '未確認'],            // 地区除外の手続き（決済金がなくても手続きが必要な改良区がある）
  iinStamp: ['必要', '不要', '未確認'],                   // 地元の農業委員・農地利用最適化推進委員の押印（意見書等）
  localConsent: ['必要', '不要', '未確認'],               // 地元関係者（自治会長・水利組合・地元委員・理事等）の同意（押印）。土地改良区へ確認
  purposes: ['分家住宅', '駐車場', '資材置場', 'その他'],  // 転用目的（市街化調整区域の物件のみ。分家住宅は排水先の確認を行う）
  tenyoUkeModes: ['毎月の期間', '毎月の締切日', '毎月第○週', '月ごとに異なる（年間計画）', '締切日を指定'], // 農地転用の受付・締切の決め方
  tenyoUkeWeeks: ['第1週', '第2週', '第3週', '第4週', '最終週'],
  weekdays: ['月曜', '火曜', '水曜', '木曜', '金曜', '曜日指定なし'],
  tenyoUkeHolidays: ['前の営業日', '次の営業日', 'その他（備考に記入）', '未確認'], // 締切が土日祝と重なる場合
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
  { key: 'caseNo', header: '受付番号' },                 // 受付日（yyMMdd）-その日の連番。例）260930-01
  { key: 'estimatePdfUrl', header: '正式見積PDF' },
  { key: 'estimatePdfAt', header: '正式見積の提示日時' },
  { key: 'reportResult', header: '正式見積の報告結果' },
  { key: 'appointments', header: '訪問のアポイント（管理画面で入力）' },
  { key: 'extraLotFee', header: '筆数加算' },
  { key: 'chimokuHenkoSummary', header: '地目変更登記（登記担当へ連絡）' },
  { key: 'localFee', header: '地元協力金等（円・管理画面で入力）' },
  { key: 'localFeeNote', header: '地元協力金等の内容' }, // JSON：{ 連絡先キー: { at, status, memo } }
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
  { key: 'saiShinsei', header: '再度の許可・届出（許可・届出済みで未転用）' },
  { key: 'saiShinseiNote', header: '再度の許可・届出の備考' },
  { key: 'hinochi', header: '非農地証明（現況証明）で対応できるか' },
  { key: 'hinochiYears', header: '非農地証明の要件：農地以外の利用年数' },
  { key: 'hinochiDocs', header: '非農地証明の要件：証明資料' },
  { key: 'hinochiNote', header: '非農地証明の要件・備考（現地確認・受付・手数料など）' },
  { key: 'zeseiKyoka', header: '是正のための許可申請ができるか' },
  { key: 'zeseiNote', header: '是正の許可申請の備考' },
  { key: 'kairyoExtra', header: '2つ目以降の土地改良区' },
  { key: 'kairyoExtraData', header: '（自動）2つ目以降の土地改良区のデータ・変更しない' },
];

/** 管理画面から編集できる列（これ以外は管理画面から書き換えない） */
const ADMIN_EDITABLE_KEYS = ['status', 'assignee', 'formalEstimate', 'adminMemo', 'appointments', 'localFee', 'localFeeNote'];

/** 見積の金額設定を変えたときに概算を計算し直す案件（正式見積を提示する前の案件だけ） */
const RECALC_STATUSES = ['新規', '調査中'];

/** 訪問のアポイントの状況 */
const APPOINTMENT_STATUSES = ['未連絡', '調整中', '確定', '訪問済み'];

/** マスタシートの列（見出し） */
const MASTER_HEADERS = ['都道府県', '市区町村', '都市計画情報URL', '農振図URL', '備考', '農業委員会 電話番号'];

/** 見積設定シートの列（見出し） */
const FEE_HEADERS = ['キー（変更しない）', '項目名（見積に表示）', '金額（円・報酬は税抜）', '適用条件（説明）'];
