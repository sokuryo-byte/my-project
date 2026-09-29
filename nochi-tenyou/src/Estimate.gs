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
 * 入力内容から概算見積を計算する。
 * @param {Object} input normalizeInput_() で整えた入力
 * @return {{ok:boolean, total:number, items:Array<{label:string, amount:number}>, notes:string[]}}
 */
function calculateEstimate_(input) {
  const fees = getFeeSettings_();
  const items = [];
  const notes = [];
  const item = function (key) { return { label: fees[key].label, amount: fees[key].amount }; };

  // --- 1. 基本報酬（区域区分で決まる） ---
  let zone = input.zone;
  if (!zone) {
    return { ok: false, total: 0, items: [], notes: ['区域区分を選択すると概算見積が表示されます。'] };
  }
  if (zone === '分からない') {
    zone = FALLBACK_ZONE_FOR_UNKNOWN;
    notes.push('区域が不明のため「' + zone + '」（届出）として仮計算しています。区域は行政班が確認します。');
  }
  const baseKey = Object.keys(fees).filter(function (k) { return fees[k].zone === zone; })[0];
  if (!baseKey) {
    return { ok: false, total: 0, items: [], notes: ['区域「' + zone + '」の基本報酬が設定されていません。'] };
  }
  items.push(item(baseKey));

  // --- 2. 農振除外 加算 ---
  if (input.isNoshin === 'はい') {
    items.push(item('ADD_NOSHIN'));
    if (input.zone === '市街化区域') {
      notes.push('市街化区域で農振農用地「はい」となっています。通常は重複しないため、農振図を再確認してください。');
    }
  } else if (input.isNoshin === '分からない') {
    notes.push('農振農用地の場合は +' + formatYen_(fees.ADD_NOSHIN.amount) + '（農振除外）が見込まれます。');
  }

  // --- 3. 土地改良区 地区除外 加算 ---
  if (input.landImprovement === 'はい') {
    items.push(item('ADD_LAND_IMPROVEMENT'));
  } else if (input.landImprovement === '分からない') {
    notes.push('土地改良区の区域内なら +' + formatYen_(fees.ADD_LAND_IMPROVEMENT.amount) + '（地区除外）が見込まれます。');
  }

  // --- 4. 現況是正・事後手続き 加算 ---
  const convertedByUse = CONVERTED_LAND_USES.indexOf(input.landUse) >= 0;
  if (input.isConverted === 'はい' || convertedByUse) {
    items.push(item('ADD_ALREADY_CONVERTED'));
    if (input.isConverted !== 'はい') {
      notes.push('現況が「' + input.landUse + '」のため、転用済み（事後手続き）として加算しています。');
    }
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
