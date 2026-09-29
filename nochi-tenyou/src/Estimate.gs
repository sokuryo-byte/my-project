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

  // --- 4. 土地改良区 地区除外 加算（「分からない」も加算。土地改良区に「受益地に該当しない」と確認できた物件は除く） ---
  const kairyoLots = lots.filter(function (l) {
    return l.landImprovement === '分からない' || (l.landImprovement === 'はい' && l.kairyoBenefit !== '該当しない');
  });
  if (kairyoLots.length) {
    items.push(item('ADD_LAND_IMPROVEMENT'));
    if (!kairyoLots.some(function (l) { return l.landImprovement === 'はい' && l.kairyoBenefit === '該当する'; })) {
      notes.push('土地改良区の受益地か未確認のため加算しています。該当しない場合は減額となります。');
    }
  }
  lots.forEach(function (l, i) {
    if (l.landImprovement === 'はい' && l.kairyoSettlement === '必要') {
      notes.push(lotName(l, i) + '：地区除外決済金は実費のため見積に含みません' +
        (l.kairyoSettlementNote ? '（' + l.kairyoSettlementNote + '）' : '') + '。');
    }
  });

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
  if (input.purpose === '分家住宅') {
    if (lots.some(function (l) { return l.zone === '市街化調整区域'; })) {
      items.push(item('ADD_BUNKE'));
      notes.push('開発許可（都市計画法29条）となる場合は金額が変わります。');
    }
    const drainLots = lots.filter(function (l) { return l.drainConsent !== '不要'; });
    if (drainLots.length) {
      items.push(item('ADD_DRAINAGE'));
      if (!drainLots.some(function (l) { return l.drainConsent === '必要'; })) {
        notes.push('排水承諾の要否が未確認のため加算しています。不要な場合は減額となります。');
      }
    }
    lots.forEach(function (l, i) {
      if (l.drainConsent === '必要' && l.drainFee) notes.push(lotName(l, i) + '：用水への手数料等は実費のため見積に含みません（' + l.drainFee + '）。');
    });
  }
  lots.forEach(function (l, i) {
    if (l.noutiKubun === '甲種' || l.noutiKubun === '第1種') {
      notes.push(lotName(l, i) + '：' + l.noutiKubun + '農地は原則として転用が認められません（例外要件に該当する場合を除く）。');
    }
    if (l.tenyoKanou === '難しい') {
      notes.push(lotName(l, i) + '：農業委員会より転用は難しいとの回答があります' + (l.kanouNote ? '（' + l.kanouNote + '）' : '') + '。');
    }
  });

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
