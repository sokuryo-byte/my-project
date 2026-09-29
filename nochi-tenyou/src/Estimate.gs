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
 *  ・農振除外／地区除外：該当する物件が1つでもあれば1回加算
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
    items.push(item(baseKey));
  }
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

  // --- 4. 土地改良区 地区除外 加算 ---
  if (lots.some(function (l) { return l.landImprovement === 'はい'; })) {
    items.push(item('ADD_LAND_IMPROVEMENT'));
  } else if (lots.some(function (l) { return l.landImprovement === '分からない'; })) {
    notes.push('土地改良区内の場合は +' + formatYen_(fees.ADD_LAND_IMPROVEMENT.amount) + '（地区除外）が見込まれます。');
  }

  // --- 5. 現況是正・事後手続き 加算（許可の区域のみ。届出では始末書等は不要） ---
  const isConvertedLot = function (l) {
    return l.isConverted === 'はい' || CONVERTED_LAND_USES.indexOf(l.landUse) >= 0;
  };
  const converted = lots.filter(function (l) { return isConvertedLot(l) && PERMIT_ZONES.indexOf(l.zone) >= 0; });
  if (converted.length) {
    items.push(item('ADD_ALREADY_CONVERTED'));
    converted.forEach(function (l) {
      if (l.isConverted !== 'はい') {
        notes.push(lotName(l, lots.indexOf(l)) + '：現況「' + l.landUse + '」のため事後手続きとして加算しています。');
      }
    });
  } else if (lots.some(function (l) { return isConvertedLot(l) && l.zone === '分からない'; })) {
    notes.push('許可が必要な区域の場合は +' + formatYen_(fees.ADD_ALREADY_CONVERTED.amount) + '（事後手続き）が見込まれます。');
  }

  const total = items.reduce(function (sum, it) { return sum + it.amount; }, 0);
  notes.push('概算です。正式なお見積りは調査後にご案内いたします。');
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
