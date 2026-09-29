/**
 * ============================================================
 *  概算見積の計算（ルールベース）
 * ============================================================
 *  概算見積金額 = 基本報酬 + 各種加算の合計
 *  金額や条件は Config.gs の BASE_FEES / ADDITIONAL_FEES で調整します。
 *  AI等による自動判定は行わず、入力値だけで機械的に計算します。
 */

/**
 * 入力内容から概算見積を計算する。
 * @param {Object} input normalizeInput_() で整えた入力
 * @return {{ok:boolean, total:number, items:Array<{label:string, amount:number}>, notes:string[]}}
 *   ok=false のときは区域未選択などで計算できない状態（notes に理由）
 */
function calculateEstimate_(input) {
  const items = [];
  const notes = [];

  // --- 1. 基本報酬（区域区分で決まる） ---
  let zone = input.zone;
  if (!zone) {
    return { ok: false, total: 0, items: [], notes: ['区域（市街化区域／市街化調整区域／非線引き区域）を選択すると概算見積が表示されます。'] };
  }
  if (zone === '分からない') {
    zone = FALLBACK_ZONE_FOR_UNKNOWN;
    notes.push('区域が不明のため「' + zone + '」として仮計算しています（都市計画図の確認が必要です）。');
  }
  const base = BASE_FEES[zone];
  if (!base) {
    return { ok: false, total: 0, items: [], notes: ['区域「' + zone + '」の基本報酬が設定されていません（Config.gs を確認してください）。'] };
  }
  items.push({ label: base.label, amount: base.amount });

  // --- 2. 農振除外 加算 ---
  if (input.isNoshin === 'はい') {
    items.push(ADDITIONAL_FEES.NOSHIN_EXCLUSION);
    if (input.zone === '市街化区域') {
      notes.push('市街化区域で農振農用地「はい」となっています。通常は重複しないため、農振図を再確認してください。');
    }
  } else if (input.isNoshin === '分からない') {
    notes.push('農振農用地か不明です。該当する場合は農振除外の加算（' + formatYen_(ADDITIONAL_FEES.NOSHIN_EXCLUSION.amount) + '）が見込まれます。');
  }

  // --- 3. 土地改良区 地区除外 加算 ---
  if (input.landImprovement === 'はい') {
    items.push(ADDITIONAL_FEES.LAND_IMPROVEMENT);
  } else if (input.landImprovement === '分からない') {
    notes.push('土地改良区の有無が不明です。区域内の場合は地区除外の加算（' + formatYen_(ADDITIONAL_FEES.LAND_IMPROVEMENT.amount) + '）が見込まれます。');
  }

  // --- 4. 現況是正・事後手続き 加算 ---
  const convertedByUse = CONVERTED_LAND_USES.indexOf(input.landUse) >= 0;
  if (input.isConverted === 'はい' || convertedByUse) {
    items.push(ADDITIONAL_FEES.ALREADY_CONVERTED);
    if (input.isConverted !== 'はい') {
      notes.push('現況が「' + input.landUse + '」のため、転用済み（事後手続き）として加算しています。');
    }
  }

  // --- 合計 ---
  const total = items.reduce(function (sum, it) { return sum + it.amount; }, 0);
  notes.push('本金額はルールに基づく概算です。正式なお見積りは行政書士による調査後にご案内します。');

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
