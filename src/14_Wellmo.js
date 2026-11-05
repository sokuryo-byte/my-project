/**
 * 14_Wellmo.js
 * ウェルモ「建物管理｜編集」画面への入力データ（JSON）を作る。
 * キー名は画面の項目名に合わせている。自動入力ツール（ブラウザ側）はこのJSONだけを読む。
 * 値が空の項目は含めない（画面の既存値を消さないため）。
 */

// ウェルモの「建物設備」ボタン名 → 物件シートの列名
var WELLMO_EQUIPMENT = [
  ['エレベーター', 'エレベーター'],
  ['オートロック', 'オートロック'],
  ['宅配ボックス', '宅配BOX'],
  ['防犯カメラ', '防犯カメラ'],
  ['コンシェルジュ', 'コンシェルジュ'],
  ['駐輪場', '自転車駐輪可能'],
  ['自動販売機', '自動販売機'],
  ['TVドアホン', 'TVドアホン'],
  ['ゴミ捨て場', 'ゴミ捨て場']
];

/**
 * @param {Object} prop 物件シートの行
 * @param {Object} out buildOutputRow_ の結果（タイトル・駅・アクセス・周辺施設）
 * @param {Array} stRows 駅結果の行（枠順）
 * @return {Object}
 */
function buildWellmoData_(prop, out, stRows) {
  var d = {};
  var put = function (k, v) { if (v !== '' && v != null) d[k] = v; };
  put('マンスリー表示名', out['タイトル']);
  put('ふりがな', String(prop['ふりがな'] || '').trim());
  put('建物名', String(prop['建物名'] || '').trim());
  put('物件種別', String(prop['物件種別'] || '').trim());
  var addr = {};
  if (prop['郵便番号']) addr['郵便番号'] = String(prop['郵便番号']);
  if (prop['住所']) addr['住所'] = nfkc_(prop['住所']).trim();
  if (Object.keys(addr).length) d['所在地'] = addr;
  if (bool_(prop['起点確認済'])) {
    put('緯度', toNum_(prop['起点緯度']));
    put('経度', toNum_(prop['起点経度']));
  }
  put('周辺環境', out['周辺施設']);

  var stations = [];
  (stRows || []).slice().sort(function (a, b) { return toNum_(a['枠']) - toNum_(b['枠']); }).slice(0, 3).forEach(function (r, i) {
    var walk = out['駅' + (i + 1) + '_徒歩分'];
    stations.push({
      '路線': String(r['路線'] || ''),
      '駅': stationBaseName_(r['駅名']),
      '徒歩': walk === '' ? '' : Number(walk),
      'その他': out['駅' + (i + 1) + '_その他'] || ''
    });
  });
  if (stations.length) d['最寄り駅'] = stations;
  put('その他アクセス', out['その他アクセス']);
  put('空港からのアクセス', out['空港からのアクセス']);

  var eq = WELLMO_EQUIPMENT.filter(function (e) { return bool_(prop[e[1]]); }).map(function (e) { return e[0]; });
  d['建物設備'] = eq; // ON にするボタンの一覧（一覧にないボタンは変更しない）

  put('建物構造', String(prop['建物構造'] || '').trim());
  if (prop['地上階数'] !== '' && prop['地上階数'] != null) {
    d['建物階数'] = { '地上': toNum_(prop['地上階数']), '地下': toNum_(prop['地下階数']) || 0 };
  }
  if (prop['築年']) d['築年月'] = { '年': toNum_(prop['築年']), '月': toNum_(prop['築月']) };
  put('総戸数', toNum_(prop['総戸数']));
  return d;
}
