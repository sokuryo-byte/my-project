/**
 * 00_Config.js
 * シート名・列定義・初期設定値。
 * 設定値はすべて「設定」「カテゴリ設定」「チェーン辞書」シートで管理し、
 * コードに業務ルールを埋め込まない（引継ぎ後も部門側で調整できるようにする）。
 */

var APP_NAME = 'マンスリー周辺施設調査';

// 設置時に自動で書き込まれる値（tools/deploy-drive.js で設定。スプレッドシートに紐付かないスクリプトとして設置した場合に使う）
var BOOTSTRAP = { spreadsheetId: '', mysokuFolderId: '', apiKey: '' };
var SCRIPT_PROP_API_KEY = 'GOOGLE_MAPS_API_KEY';
var MAX_EXEC_MS = 270000; // GASの6分制限に対して余裕を持たせる（4.5分）

var SHEETS = {
  PROPERTIES: '物件',
  FACILITIES: '施設結果',
  STATIONS: '駅結果',
  ACCESS: 'アクセス結果',
  OUTPUT: '出力',
  CATEGORIES: 'カテゴリ設定',
  BRANDS: 'チェーン辞書',
  SETTINGS: '設定',
  LOG: '実行ログ'
};

var HEADERS = {};
HEADERS[SHEETS.PROPERTIES] = [
  '物件ID', 'マイソクPDF', 'マイソク取込日時', 'マイソク取込メモ', '物件名', '住所',
  'マイソク駅1_駅名', 'マイソク駅1_路線', 'マイソク駅1_徒歩分',
  'マイソク駅2_駅名', 'マイソク駅2_路線', 'マイソク駅2_徒歩分',
  'マイソク駅3_駅名', 'マイソク駅3_路線', 'マイソク駅3_徒歩分',
  // タイトル用（Google APIでは取得できない物件情報。担当者が入力する）
  'エリア', '建物名', '号室', '駐車場', '無料Wi-Fi', 'Wi-Fiサービス名', '角部屋',
  'バストイレ別', '独立洗面台', '最大洋室帖数', '全居室6帖以上', 'リフォーム済',
  'オートロック', 'エレベーター', '宅配BOX', '自転車駐輪可能', 'その他アピール',
  // ウェルモ入力用（マイソクから取り込み／担当者入力）
  'ふりがな', '物件種別', '郵便番号', '建物構造', '地上階数', '地下階数', '総戸数', '築年', '築月',
  '防犯カメラ', 'コンシェルジュ', '自動販売機', 'TVドアホン', 'ゴミ捨て場',
  '起点緯度', '起点経度', '起点確認済', 'Googleマップ',
  'Geocode種別', 'Geocode部分一致', 'Geocode住所',
  'ステータス', '最終調査日時', 'メッセージ', 'ウェルモ入力日時'
];
HEADERS[SHEETS.FACILITIES] = [
  '物件ID', '実行ID', 'カテゴリID', 'カテゴリ', '採否', '採用理由', '順位',
  '名称', 'ジャンル表示', 'ブランド', '道路距離m', '徒歩分', '車所要分', '車距離m', '直線距離m', '住所', '緯度', '経度',
  'place_id', '営業状態', '面積概算m2', '要確認理由', '確認済', '掲載', '備考', '取得日時'
];
HEADERS[SHEETS.STATIONS] = [
  '物件ID', '実行ID', '枠', '出典', '駅名', '路線', 'マイソク徒歩分',
  '道路距離m', 'Google徒歩分', '採用徒歩分', '採用元',
  '代替手段', '代替所要分', '代替距離m', '代替有料道路', '代替詳細',
  '要確認理由', '確認済', '備考', 'place_id', '緯度', '経度', '取得日時'
];
HEADERS[SHEETS.ACCESS] = [
  '物件ID', '実行ID', '種別', '名称', '運行会社', '道路距離m', '徒歩分',
  '車所要分', '車距離m', '有料道路', '採用', '詳細',
  '要確認理由', '確認済', '備考', 'place_id', '緯度', '経度', '取得日時'
];
HEADERS[SHEETS.OUTPUT] = [
  '物件ID', '物件名',
  '駅1', '駅1_徒歩分', '駅1_その他',
  '駅2', '駅2_徒歩分', '駅2_その他',
  '駅3', '駅3_徒歩分', '駅3_その他',
  'タイトル', 'タイトル文字数', 'タイトル注記',
  'その他アクセス', '空港からのアクセス', '周辺施設', '出典表記',
  '未確認の要確認件数', '生成日時', 'ウェルモJSON'
];
HEADERS[SHEETS.CATEGORIES] = [
  'カテゴリID', '表示名', '有効', '検索方法', 'includedTypes', '検索語',
  '名称に含む', '名称に含まない', '圏内上限分', '最低件数', '最大件数',
  '他社のみ', 'チェーン辞書必須', '面積下限m2', '常に要確認', '要確認メモ', '出力順', '必須の種別'
];
HEADERS[SHEETS.BRANDS] = ['ブランド名', '照合キーワード', '対象カテゴリID'];
HEADERS[SHEETS.SETTINGS] = ['キー', '値', '説明'];
HEADERS[SHEETS.LOG] = ['日時', '実行ID', '物件ID', '処理', '結果', 'API呼出数', 'メッセージ'];

var CHECKBOX_COLUMNS = {};
CHECKBOX_COLUMNS[SHEETS.PROPERTIES] = ['駐車場', '無料Wi-Fi', '角部屋', 'バストイレ別', '独立洗面台', '全居室6帖以上',
  'リフォーム済', 'オートロック', 'エレベーター', '宅配BOX', '自転車駐輪可能',
  '防犯カメラ', 'コンシェルジュ', '自動販売機', 'TVドアホン', 'ゴミ捨て場', '起点確認済'];
CHECKBOX_COLUMNS[SHEETS.FACILITIES] = ['確認済', '掲載'];
CHECKBOX_COLUMNS[SHEETS.STATIONS] = ['確認済'];
CHECKBOX_COLUMNS[SHEETS.ACCESS] = ['採用', '確認済'];

var DEFAULT_SETTINGS = [
  ['walk_m_per_min', '80', '徒歩1分あたりの道路距離(m)。公正競争規約施行規則の基準。変更しないこと'],
  ['welmo_walk_limit_min', '30', 'この分数以上の駅は徒歩分を空欄にし、バス/車の所要時間を出す（ウェルモの入力制限）'],
  ['require_origin_confirm', 'TRUE', 'TRUE: 起点（建物出入口）を担当者が確認するまで周辺調査を行わない'],
  ['station_count', '3', '登録する駅の数'],
  ['station_search_radii_m', '2000,5000,10000', '駅検索の半径(m)。足りなければ順に広げる'],
  ['facility_max_radius_m', '5000', '「最低件数」を満たすために広げる施設検索半径の上限(m)'],
  ['bus_stop_radius_m', '1000', 'バス停検索の半径(m)'],
  ['alt_transport_mode', 'バス優先', '徒歩30分以上の駅の代替手段: バス優先 / 車のみ'],
  ['transit_departure_time', '10:00', 'バス経路検索の出発時刻（次の平日）'],
  ['drive_departure_time', '03:00', '車の所要時間検索の出発時刻（渋滞の少ない時間）'],
  ['show_drive_distance', 'FALSE', 'TRUE: 車の所要時間に道路距離を併記（公正競争規約施行規則は道路距離の明示を求めている。運用方針を確認のうえ設定）'],
  ['facility_drive_threshold_min', '20', '周辺施設の徒歩分がこれを超える場合は「車で約n分」で表示'],
  ['title_max_length', '60', 'タイトルの最大文字数。超える場合は後ろの要素から削る'],
  ['title_station_walk_max_min', '10', 'タイトルの最寄り駅に徒歩分を付ける上限（超えたら駅名のみ）'],
  ['title_room_format', '{建物名}', 'タイトル末尾の書式（{建物名}{号室}を置換）。建物登録では号室を付けない'],
  ['title_ward_cities', '名古屋市', 'エリアを「区」だけで表す市（カンマ区切り）'],
  ['title_area_other_style', '県+市', '上記以外のエリア表記: 県+市 / 市のみ'],
  ['title_auto_appeal', 'TRUE', 'TRUE:「その他アピール」が空欄なら、掲載チェック済みの大型商業施設（圏内）を使う'],
  ['toll_detect_diff_m', '100', '有料道路回避ルートとの距離差がこれを超えたら「有料道路あり」と判定(m)'],
  ['detour_ratio_max', '2.0', '道路距離/直線距離がこれを超えたら要確認'],
  ['airport_1_name', '中部国際空港', '空港1の表示名'],
  ['airport_1_address', '中部国際空港 愛知県常滑市セントレア', '空港1の検索用住所（Routes APIで解決）'],
  ['airport_2_name', '県営名古屋空港', '空港2の表示名'],
  ['airport_2_address', '県営名古屋空港 愛知県西春日井郡豊山町', '空港2の検索用住所（Routes APIで解決）'],
  ['retention_days', '30', 'Google由来データの保存日数。超過分は「保存期限切れデータの整理」で削除'],
  ['route_candidates_max', '8', 'カテゴリごとに道路距離を計算する候補の最大数（直線距離の近い順。API費用の節約）'],
  ['max_unselected_saved', '5', 'カテゴリごとに保存する不採用候補の最大数（担当者の差し替え用）'],
  ['attribution', '周辺施設・距離：Google Maps Platformのデータを基に算出', '周辺施設の出力末尾に付ける出典表記'],
  ['api_retries', '3', 'API一時エラー時のリトライ回数'],
  ['bus_operator_defaults', '名古屋市=名古屋市営バス', 'バス停の運行会社の初期値（所在地に含まれる地名=会社名、カンマ区切り）。違う場合は確認画面で修正'],
  ['facility_genre_prefix', 'TRUE', 'TRUE: 店名だけでは分かりにくい施設の頭にジャンル名を付ける（例: スーパー タッチもとこい）'],
  ['categories_version', '0', 'カテゴリ設定の版（自動更新用。変更しないこと）'],
  ['mysoku_folder_id', '', 'マイソクPDFを置くGoogleドライブのフォルダ（URLまたはID）。「フォルダから新規取り込み」で使用']
];

// [ID, 表示名, 有効, 検索方法, includedTypes, 検索語, 名称に含む, 名称に含まない,
//  圏内上限分, 最低件数, 最大件数, 他社のみ, チェーン辞書必須, 面積下限m2, 常に要確認, 要確認メモ, 出力順, 必須の種別]
// 必須の種別：Googleの分類（types）にこのいずれかを含む施設だけを残す（例: 食料品店や調剤薬局を除く）。
// 最大件数：掲載の上限（近い順）。公園は面積の大きい順に優先する。
// カテゴリ定義の版。上げると、次にアプリを開いたとき「カテゴリ設定」「チェーン辞書」シートを初期値で書き直す
var CATEGORIES_VERSION = 3;

// 店名だけでは何の店か分かりにくいときに頭に付けるジャンル名（チェーン辞書の店・名前にジャンルの語がある店には付けない）
var GENRE_LABELS = {
  supermarket: ['スーパー', /スーパー/], drugstore: ['ドラッグストア', /ドラッグ|薬局|薬品/], convenience: ['コンビニ', /コンビニ|マート|ストア/],
  hundred_yen: ['100円ショップ', /100円|ダイソー|セリア|キャンドゥ/], mall: ['商業施設', /モール|ショッピング|百貨店|デパート|プラザ|センター|SC|イオン|アピタ/],
  clinic: ['クリニック', /クリニック|医院|診療所|内科/], hospital: ['病院', /病院/], post_office: ['郵便局', /郵便局/],
  park: ['公園', /公園|緑地|広場/], chain_restaurant: ['飲食店', /^$/]
};

var DEFAULT_CATEGORIES = [
  ['supermarket', 'スーパー', true, 'nearby', 'supermarket,grocery_store', '', '', '', 10, 1, 2, true, false, '', false, '', 1, 'supermarket'],
  ['drugstore', 'ドラッグストア', true, 'nearby', 'drugstore,pharmacy', '', '', '調剤', 10, 1, 2, true, false, '', false, '', 2, 'drugstore'],
  ['convenience', 'コンビニ', true, 'nearby', 'convenience_store', '', '', '', 10, 1, 2, true, false, '', false, '', 3, 'convenience_store'],
  ['hundred_yen', '100円ショップ', true, 'text', '', '100円ショップ', 'ダイソー,DAISO,セリア,Seria,キャンドゥ,Can★Do,ワッツ,Watts,meets,シルク', '', 10, 0, 2, true, false, '', false, '', 4, ''],
  ['mall', '大型商業施設', true, 'nearby', 'shopping_mall,department_store', '', '', '', 15, 0, 2, true, false, '', true, '大型ショッピングモール・商業施設に該当するか確認', 5, 'shopping_mall,department_store'],
  ['clinic', '内科系クリニック', true, 'text', '', '内科', '', '歯科,眼科,皮膚科,整形外科,耳鼻,動物,美容,形成外科', '', 1, 1, false, false, '', true, '内科系の診療科か確認', 6, ''],
  ['hospital', '総合病院', true, 'nearby', 'hospital', '', '病院', '動物,歯科,デイケア', 15, 0, 2, false, false, '', true, '総合病院（複数診療科）に該当するか確認', 7, 'hospital'],
  ['post_office', '郵便局', true, 'nearby', 'post_office', '', '郵便局', 'ATM,ゆうちょ銀行', '', 1, 1, false, false, '', false, '', 8, ''],
  ['park', '公園', true, 'nearby', 'park', '', '', 'ひろば,広場,児童遊園,遊園地,ちびっこ', 10, 0, 2, false, false, 10000, false, '', 9, 'park'],
  ['chain_restaurant', 'チェーン系飲食店', true, 'nearby_each', 'restaurant,fast_food_restaurant,hamburger_restaurant,ramen_restaurant,japanese_restaurant,sushi_restaurant,cafe', '', '', '', 10, 3, 3, true, true, '', false, '', 10, '']
];

// [ブランド名, 照合キーワード(カンマ区切り), 対象カテゴリID(空欄=全カテゴリ)]
var DEFAULT_BRANDS = [
  // コンビニ
  ['セブン-イレブン', 'セブン-イレブン,セブンイレブン,7-ELEVEN', 'convenience'],
  ['ファミリーマート', 'ファミリーマート,FamilyMart', 'convenience'],
  ['ローソン', 'ローソン,LAWSON', 'convenience'],
  ['ミニストップ', 'ミニストップ,MINISTOP', 'convenience'],
  ['デイリーヤマザキ', 'デイリーヤマザキ', 'convenience'],
  ['セイコーマート', 'セイコーマート', 'convenience'],
  // スーパー
  ['イオン', 'イオン,AEON', 'supermarket'],
  ['マックスバリュ', 'マックスバリュ', 'supermarket'],
  ['アピタ', 'アピタ', 'supermarket'],
  ['ピアゴ', 'ピアゴ', 'supermarket'],
  ['バロー', 'バロー', 'supermarket'],
  ['ヤマナカ', 'ヤマナカ', 'supermarket'],
  ['フィール', 'フィール', 'supermarket'],
  ['カネスエ', 'カネスエ', 'supermarket'],
  ['西友', '西友', 'supermarket'],
  ['イトーヨーカドー', 'イトーヨーカドー', 'supermarket'],
  ['業務スーパー', '業務スーパー', 'supermarket'],
  ['ライフ', 'ライフ', 'supermarket'],
  ['八百鮮', '八百鮮', 'supermarket'],
  ['フランテ', 'フランテ', 'supermarket'],
  ['アオキスーパー', 'アオキスーパー', 'supermarket'],
  ['ヨシヅヤ', 'ヨシヅヤ', 'supermarket'],
  ['ユーストア', 'ユーストア', 'supermarket'],
  ['ナフコ不二屋', 'ナフコ不二屋', 'supermarket'],
  ['生鮮館やまひこ', 'やまひこ', 'supermarket'],
  ['タチヤ', 'タチヤ', 'supermarket'],
  ['パワーズ', 'パワーズ', 'supermarket'],
  ['MEGAドン・キホーテUNY', 'ドン・キホーテUNY,ドンキホーテUNY', 'supermarket'],
  ['ドン・キホーテ', 'ドン・キホーテ,ドンキホーテ,MEGAドン・キホーテ', ''],
  // ドラッグストア
  ['スギ薬局', 'スギ薬局,スギドラッグ', 'drugstore'],
  ['ウエルシア', 'ウエルシア', 'drugstore'],
  ['マツモトキヨシ', 'マツモトキヨシ,マツキヨ', 'drugstore'],
  ['ココカラファイン', 'ココカラファイン', 'drugstore'],
  ['V・drug', 'V・drug,Vdrug,ブイドラッグ', 'drugstore'],
  ['クスリのアオキ', 'クスリのアオキ', 'drugstore'],
  ['ツルハドラッグ', 'ツルハ', 'drugstore'],
  ['サンドラッグ', 'サンドラッグ', 'drugstore'],
  ['ゲンキー', 'ゲンキー', 'drugstore'],
  ['ドラッグコスモス', 'コスモス', 'drugstore'],
  // 100円ショップ
  ['ダイソー', 'ダイソー,DAISO', 'hundred_yen'],
  ['セリア', 'セリア,Seria', 'hundred_yen'],
  ['キャンドゥ', 'キャンドゥ,Can★Do,CanDo', 'hundred_yen'],
  ['ワッツ', 'ワッツ,Watts,meets,シルク', 'hundred_yen'],
  // チェーン系飲食店
  ['マクドナルド', 'マクドナルド,McDonald', 'chain_restaurant'],
  ['モスバーガー', 'モスバーガー', 'chain_restaurant'],
  ['ケンタッキーフライドチキン', 'ケンタッキー,KFC', 'chain_restaurant'],
  ['バーガーキング', 'バーガーキング', 'chain_restaurant'],
  ['サブウェイ', 'サブウェイ,SUBWAY', 'chain_restaurant'],
  ['すき家', 'すき家', 'chain_restaurant'],
  ['吉野家', '吉野家', 'chain_restaurant'],
  ['松屋', '松屋', 'chain_restaurant'],
  ['なか卯', 'なか卯', 'chain_restaurant'],
  ['松のや', '松のや', 'chain_restaurant'],
  ['かつや', 'かつや', 'chain_restaurant'],
  ['ガスト', 'ガスト', 'chain_restaurant'],
  ['バーミヤン', 'バーミヤン', 'chain_restaurant'],
  ['ジョナサン', 'ジョナサン', 'chain_restaurant'],
  ['サイゼリヤ', 'サイゼリヤ', 'chain_restaurant'],
  ['デニーズ', 'デニーズ', 'chain_restaurant'],
  ['ココス', 'ココス', 'chain_restaurant'],
  ['ロイヤルホスト', 'ロイヤルホスト', 'chain_restaurant'],
  ['びっくりドンキー', 'びっくりドンキー', 'chain_restaurant'],
  ['ジョイフル', 'ジョイフル', 'chain_restaurant'],
  ['丸亀製麺', '丸亀製麺', 'chain_restaurant'],
  ['はなまるうどん', 'はなまるうどん', 'chain_restaurant'],
  ['CoCo壱番屋', 'CoCo壱番屋,ココイチ', 'chain_restaurant'],
  ['スシロー', 'スシロー', 'chain_restaurant'],
  ['くら寿司', 'くら寿司', 'chain_restaurant'],
  ['はま寿司', 'はま寿司', 'chain_restaurant'],
  ['かっぱ寿司', 'かっぱ寿司', 'chain_restaurant'],
  ['大戸屋', '大戸屋', 'chain_restaurant'],
  ['やよい軒', 'やよい軒', 'chain_restaurant'],
  ['餃子の王将', '餃子の王将', 'chain_restaurant'],
  ['大阪王将', '大阪王将', 'chain_restaurant'],
  ['リンガーハット', 'リンガーハット', 'chain_restaurant'],
  ['幸楽苑', '幸楽苑', 'chain_restaurant'],
  ['天下一品', '天下一品', 'chain_restaurant'],
  ['スガキヤ', 'スガキヤ', 'chain_restaurant'],
  ['コメダ珈琲店', 'コメダ', 'chain_restaurant'],
  ['スターバックス', 'スターバックス,STARBUCKS', 'chain_restaurant'],
  ['ドトール', 'ドトール', 'chain_restaurant'],
  ['ミスタードーナツ', 'ミスタードーナツ', 'chain_restaurant'],
  ['鳥貴族', '鳥貴族', 'chain_restaurant'],
  ['木曽路', '木曽路', 'chain_restaurant'],
  ['ステーキガスト', 'ステーキガスト', 'chain_restaurant'],
  ['焼肉きんぐ', '焼肉きんぐ', 'chain_restaurant'],
  ['ほっともっと', 'ほっともっと', 'chain_restaurant']
];
