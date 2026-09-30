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
