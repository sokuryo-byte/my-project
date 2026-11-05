/**
 * 03_Brand.js
 * 「他社」判定のためのブランド識別。チェーン辞書シートとの文字列照合のみで判定する（AI推定なし）。
 */

/**
 * @param {Array<Array>} rows チェーン辞書シートの行 [ブランド名, 照合キーワード, 対象カテゴリID]
 * @return {Array<{brand:string,key:string,catId:string}>} キーワード長の降順（「ステーキガスト」を「ガスト」より先に照合）
 */
function buildBrandDict_(rows) {
  var dict = [];
  (rows || []).forEach(function (r) {
    var brand = nfkc_(r[0]).trim();
    if (!brand) return;
    var keys = splitList_(r[1]);
    if (keys.length === 0) keys = [brand];
    var catId = nfkc_(r[2]).trim();
    keys.forEach(function (k) {
      dict.push({ brand: brand, key: normKey_(k), catId: catId });
    });
  });
  dict.sort(function (a, b) { return b.key.length - a.key.length; });
  return dict;
}

/**
 * 施設名からブランドを求める。
 * 辞書に一致しない場合は、名称の最初の空白までを仮のブランドとする（例:「〇〇ストア 栄店」→「〇〇ストア」）。
 * @return {{brand:string, fromDict:boolean}}
 */
function resolveBrand_(name, catId, dict) {
  var n = normKey_(name);
  for (var i = 0; i < dict.length; i++) {
    var d = dict[i];
    if (d.catId && d.catId !== catId) continue;
    if (d.key && n.indexOf(d.key) >= 0) return { brand: d.brand, fromDict: true };
  }
  var first = nfkc_(name).trim().split(/\s+/)[0];
  return { brand: first || nfkc_(name).trim(), fromDict: false };
}
