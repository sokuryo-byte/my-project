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
  const allLots = input.lots || [];
  // 許可・届出の履歴がある物件は、改めて許可・届出が必要と回答があった場合以外は計上しない（物件番号は元のまま）
  const lots = allLots.map(function (l, i) { return Object.assign({}, l, { __i: i }); })
    .filter(function (l) { return !(l.tenyoRireki === 'あり' && l.saiShinsei !== '必要') && l.hinochi !== '可能'; });
  // ↑ 非農地証明（現況証明）で対応できる物件も、許可申請は計上しない（現況証明を計上）
  const items = [];
  const notes = [];
  const item = function (key, times) {
    const n = times || 1;
    return { label: fees[key].label + (n > 1 ? ' × ' + n : ''), amount: fees[key].amount * n };
  };
  const lotName = function (lot, i) { return lotName_(lot, i); };

  if (!allLots.length || allLots.some(function (l) { return !l.zone; })) {
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
  const zoneOf = function (l) { return l.zone === '分からない' ? FALLBACK_ZONE_FOR_UNKNOWN : l.zone; };
  // 転用目的（市街化調整区域で選ぶ）が異なる物件は別申請。区域区分ごとに目的の種類を数える（未回答は数えない）
  const purposesOf = function (z) {
    const ps = [];
    lots.forEach(function (l) { if (zoneOf(l) === z && l.purpose && ps.indexOf(l.purpose) < 0) ps.push(l.purpose); });
    return ps;
  };
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
    const ps = purposesOf(zones[z]);
    ps.slice(1).forEach(function (pp) { // 2件目以降の申請：基本報酬の一定割合
      items.push({ label: fees[baseKey].label + '・別申請（転用目的：' + pp + '）', amount: Math.round(base.amount * SEPARATE_APPLICATION_RATE) });
    });
    if (ps.length > 1) {
      notes.push('転用目的が異なるため（' + ps.join('・') + '）、' + zones[z] + 'の申請を' + ps.length + '件として計算しています（2件目以降は基本報酬の' +
        Math.round(SEPARATE_APPLICATION_RATE * 100) + '%）。');
    }
  }
  // 調査実費（区域区分ごとに1回）
  zones.forEach(function (z) {
    const surveyKey = Object.keys(fees).filter(function (k) { return fees[k].surveyZone === z; })[0];
    if (surveyKey && fees[surveyKey].amount > 0) items.push(cost(item(surveyKey)));
  });
  if (zones.length > 1) {
    notes.push('区域区分が異なるため、申請' + zones.length + '件として計算しています。');
  }

  // --- 2. 筆数加算（許可・届出で別単価） ---
  // 依頼画面で「筆数加算をする」にチェックしたときだけ（1申請で足りるなら加算しない）。
  // 申請（区域区分）ごとに2筆目以降を数え、許可と届出で別の単価にする
  if (input.extraLotFee === true) {
    let todoke = 0, kyoka = 0;
    zones.forEach(function (z) {
      const n = lots.filter(function (l) { return zoneOf(l) === z; }).length - Math.max(1, purposesOf(z).length); // 申請ごとの2筆目以降
      if (n <= 0) return;
      if (PERMIT_ZONES.indexOf(z) >= 0) kyoka += n; else todoke += n;
    });
    if (kyoka > 0) items.push(item('ADD_PER_EXTRA_LOT', kyoka));
    if (todoke > 0) items.push(item('ADD_PER_EXTRA_LOT_TODOKE', todoke));
  }

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
  // 土地改良区ごとに1件（複数の改良区にかかる場合は改良区の数だけ）。受益地に該当しない・手続き不要と分かった改良区は除く
  const kairyoNames = {};
  let kairyoUnknown = false, kairyoConfirmed = false;
  lots.forEach(function (l) {
    if (l.landImprovement === '分からない') { kairyoNames['（不明）'] = true; kairyoUnknown = true; return; }
    kairyoEntries_(l).forEach(function (e) {
      if (e.kairyoBenefit === '該当しない' || e.kairyoProcedure === '不要') return;
      kairyoNames[e.kairyoName || '土地改良区'] = true;
      if (e.kairyoBenefit === '該当する') kairyoConfirmed = true; else kairyoUnknown = true;
    });
  });
  const kairyoCount = Object.keys(kairyoNames).length;
  if (kairyoCount) {
    items.push(item('ADD_LAND_IMPROVEMENT', kairyoCount));
    if (kairyoUnknown && !kairyoConfirmed) notes.push('土地改良区の受益地か未確認のため加算しています。該当しない場合は減額となります。');
  }


  // --- 4-2. 地元同意書（自治会・水利組合等）加算：土地改良区へ確認。「必要」「未確認」、土地改良区が「分からない」で1回加算 ---
  const consentLots = lots.filter(function (l) {
    return l.landImprovement === '分からない' || kairyoEntries_(l).some(function (e) { return e.localConsent !== '不要'; }) ||
      (!!l.drainLocalConsent && l.drainLocalConsent !== '不要'); // 排水に伴う地元承諾が必要・未確認の場合も
  });
  if (consentLots.length) {
    // 同意（押印）が必要な人数分（地元関係者＋排水の地元承諾者。同じ人＝氏名と電話が同じなら1人）
    const people = {};
    consentLots.forEach(function (l) {
      const fromKairyo = [];
      kairyoEntries_(l).forEach(function (e) { if (e.localConsent === '必要') fromKairyo.push.apply(fromKairyo, e.localContacts || []); });
      [].concat(fromKairyo, l.drainLocalConsent === '必要' ? l.drainContacts || [] : [])
        .forEach(function (p) {
          const key = String(p.name || '').replace(/\s/g, '') + '|' + String(p.tel || '').replace(/\D/g, '');
          if (key !== '|') people[key] = true;
        });
    });
    const count = Object.keys(people).length;
    items.push(item('ADD_WATER_ASSOCIATION', Math.max(1, count)));
    if (!count) {
      notes.push(consentLots.some(function (l) { return kairyoEntries_(l).some(function (e) { return e.localConsent === '必要'; }) || l.drainLocalConsent === '必要'; })
        ? '地元関係者の同意（押印）が必要な方の人数が未入力のため、1人分で計上しています。人数分の加算となります。'
        : '地元関係者の同意（押印）が未確認のため1人分で加算しています。不要な場合は減額、複数の方が必要な場合は人数分の加算となります。');
    }
  }

  // --- 4-3. 分家住宅：分家建築許可（調整区域）・建築許可の実費 ---
  const bunkeLots = lots.filter(function (l) { return l.purpose === '分家住宅'; }); // 目的は調整区域の物件のみ
  if (bunkeLots.length) {
    items.push(item('ADD_BUNKE'));
    items.push(cost(item('COST_KENCHIKU')));
    notes.push('計画により開発行為を伴う場合は、別途見積となります。');
  }
  // --- 4-4. 排水同意（同意書）：土地改良区ごとに確認。分家住宅は未確認の改良区も仮に計上 ---
  const drainTo = {};
  let drainUnknown = false;
  lots.forEach(function (l) {
    const bunke = l.purpose === '分家住宅';
    const entries = kairyoEntries_(l);
    if (entries.length) {
      entries.forEach(function (e) {
        const ans = e.kairyoDrain || '';
        if (ans === '必要' || (bunke && ans !== '不要')) {
          drainTo[e.kairyoName || '土地改良区'] = true;
          if (ans !== '必要') drainUnknown = true;
        }
      });
    } else if (bunke && l.drainConsent !== '不要') { // 土地改良区にかからない分家住宅
      drainTo['（排水先）'] = true;
      if (l.drainConsent !== '必要') drainUnknown = true;
    }
  });
  const drainN = Object.keys(drainTo).length;
  if (drainN) {
    items.push(item('ADD_DRAINAGE', drainN));
    if (drainUnknown) notes.push('排水同意（同意書）の要否が未確認の土地改良区（排水先）があるため加算しています。不要な場合は減額となります。');
  }
  // --- 0. 事前相談等（報酬の最初）：分家住宅 40,000円、農地転用許可のみ 25,000円 ---
  if (bunkeLots.length) items.unshift(item('ADD_JIZEN_BUNKE'));
  else if (lots.some(function (l) { return PERMIT_ZONES.indexOf(l.zone) >= 0; })) items.unshift(item('ADD_JIZEN_KYOKA'));
  lots.forEach(function (l, i) {
    // 現況利用と「既に転用済み」の食い違い
    if (CONVERTED_LAND_USES.indexOf(l.landUse) >= 0 && l.isConverted === 'いいえ') {
      notes.push(lotName(l, i) + '：現況が「' + l.landUse + '」のため既に転用している状態です（「既に転用済み」が「いいえ」になっています）。');
    } else if (FARMLAND_LAND_USES.indexOf(l.landUse) >= 0 && l.isConverted === 'はい') {
      notes.push(lotName(l, i) + '：現況が農地（' + l.landUse + '）なのに「既に転用済み」が「はい」になっています。ご確認ください。');
    }
    if (l.noutiKubun === '甲種' || l.noutiKubun === '第1種') { // 1つだけの回答のとき（複数なら判断しない）
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
  // 非農地証明で対応できるかは農業委員会に聞かないと分からない。「可能」と回答があった物件だけ現況証明を計上する
  const genkyo = allLots.filter(function (l) { return l.hinochi === '可能'; });
  if (genkyo.length) items.push(item('ADD_GENKYO'));
  allLots.forEach(function (l, i) {
    if (l.hinochi === '可能') {
      const req = [l.hinochiYears ? '農地以外の利用 ' + l.hinochiYears : '', l.hinochiDocs, l.hinochiNote].filter(String).join('／');
      notes.push(lotName_(l, i) + '：非農地証明（現況証明）で対応できるとの回答のため、許可申請に代えて現況証明で計上しています' + (req ? '（要件：' + req + '）' : '') + '。');
    } else if (l.hinochi === '不可') {
      notes.push(lotName_(l, i) + '：非農地証明では対応できないとの回答のため、無断転用の是正として許可申請で計上しています' +
        (l.zeseiKyoka === 'できない' ? '。ただし是正の許可申請もできないとの回答です（要相談）' : l.zeseiKyoka === '要相談・未確認' ? '（是正の許可申請の可否は要確認）' : '') +
        (l.zeseiNote ? '（' + l.zeseiNote + '）' : '') + '。');
    } else if (isConvertedLot(l) && l.tenyoRireki !== 'あり' && l.zone !== '市街化区域') {
      notes.push(lotName_(l, i) + '：現況が農地以外です。非農地証明（現況証明）で対応できる場合は、許可申請に代えて現況証明（' +
        formatYen_(fees.ADD_GENKYO.amount) + '）となります（農業委員会に確認）。');
    }
  });

  // --- 5b. 地目変更登記：チェックした物件があれば1回（2筆以上の筆数加算は都度調整） ---
  // 地目変更登記は農地転用とは別の手続きのため、許可・届出の履歴がある物件も含めて数える
  // 不動産登記令4条ただし書：同じ登記所で、登記原因とその日付が同じ物件は1件の申請。登記所か原因日付が違えば別申請
  const chimokuLots = allLots.filter(function (l) { return l.chimokuHenko === true; });
  const chimokuApps = [];
  chimokuLots.forEach(function (l) {
    const office = toukiOfficeOf_(l);
    // 原因日付：今回の転用は工事完了の日（同じ計画なら同じ日として計算）。既に転用済みは転用した時期（未入力は同じ日として計算）
    const done = l.isConverted === 'はい';
    const date = done ? String(l.chimokuDate || '').replace(/\s/g, '') : '';
    const key = office + '|' + (done ? 'done:' + date : 'new');
    let app = chimokuApps.filter(function (a) { return a.key === key; })[0];
    if (!app) { app = { key: key, office: office, done: done, date: date, lots: [] }; chimokuApps.push(app); }
    app.lots.push(l);
  });
  let chimokuExtra = 0;
  chimokuApps.forEach(function (a, k) {
    const why = [chimokuApps.some(function (b) { return b.office !== a.office; }) ? a.office : '',
      a.done ? '既に転用済み' + (a.date ? '・' + a.date : '') : (chimokuApps.some(function (b) { return b.done; }) ? '今回の転用' : '')].filter(String).join('・');
    if (k === 0) items.push(item('ADD_CHIMOKU'));
    else items.push({ label: fees.ADD_CHIMOKU.label + '・別申請（' + (why || '原因日付が異なる') + '）', amount: Math.round(fees.ADD_CHIMOKU.amount * SEPARATE_APPLICATION_RATE) });
    chimokuExtra += Math.max(0, a.lots.length - 2); // 申請ごとに2筆までは加算なし、3筆目から1筆ごとに加算
  });
  if (chimokuExtra > 0) items.push(item('ADD_CHIMOKU_EXTRA', chimokuExtra));
  if (chimokuApps.length > 1) {
    notes.push('地目変更登記は登記所または原因日付が異なるため、申請' + chimokuApps.length + '件として計算しています（2件目以降は' +
      Math.round(SEPARATE_APPLICATION_RATE * 100) + '%）：' + chimokuApps.map(function (a) {
        return a.lots.map(function (l) { return lotName_(l, l.__i !== undefined ? l.__i : allLots.indexOf(l)); }).join('・') + '（' + a.office + (a.done ? '・既に転用済み' + (a.date ? ' ' + a.date : '') : '') + '）';
      }).join('／') + '。');
  }
  if (chimokuApps.some(function (a) { return a.done && !a.date; })) {
    notes.push('地目変更登記：既に転用済みの物件で原因日付（転用した時期）が未入力のものは、同じ日として1件で計算しています。日付が異なる場合は別申請です。');
  }

  // --- 5c. 地元協力金等（管理画面で入力した金額。実費） ---
  if (Number(input.localFee) > 0) {
    items.push(cost({ label: '地元協力金等' + (input.localFeeNote ? '（' + input.localFeeNote + '）' : ''), amount: Math.round(Number(input.localFee)) }));
  }

  // --- 6. 実費：地区除外決済金（申請地の面積合計から計算）・土地改良区の手数料・用水の手数料 ---
  addActualCosts_(lots, items, notes);

  // 報酬（税抜）＋消費税＋実費（非課税）
  const costTotal = items.filter(function (it) { return it.kind === 'cost'; }).reduce(function (sum, it) { return sum + it.amount; }, 0);
  const feeSubtotal = items.filter(function (it) { return it.kind !== 'cost'; }).reduce(function (sum, it) { return sum + it.amount; }, 0);
  const tax = Math.floor(feeSubtotal * TAX_RATE);
  const total = feeSubtotal + tax + costTotal;
  notes.push('概算です。正式なお見積りは調査後にご案内いたします。');
  if (!lots.length) notes.push('すべての物件に許可・届出の履歴があるため、農地転用の手続きは計上していません。');
  // 始末書（無断転用）の提出が必要な物件
  allLots.forEach(function (l, i) {
    if (l.shimatsusho !== '必要') return;
    notes.push(lotName(l, i) + '：農業委員会より始末書の提出が必要との回答があります' +
      (l.shimatsuStamp === '必要' ? '（押印が必要' + (l.shimatsuNote ? '：' + l.shimatsuNote : '') + '）' : l.shimatsuNote ? '（' + l.shimatsuNote + '）' : '') + '。');
  });
  // 最後に：過去の転用届出・許可の履歴がある物件（計上の有無も示す）
  allLots.forEach(function (l, i) {
    if (l.tenyoRireki !== 'あり') return;
    const kind = l.zone === '市街化区域' ? '転用届出の受理' : l.zone === '分からない' ? '転用届出の受理または転用許可' : '転用許可';
    const detail = [l.rirekiDate, l.rirekiNo, l.rirekiNote].filter(String).join('・');
    notes.push(lotName(l, i) + '：過去に' + kind + 'の履歴があります' + (detail ? '（' + detail + '）' : '') +
      (l.saiShinsei === '必要' ? '。再申請（改めての許可・届出）が必要との回答です' + (l.saiShinseiNote ? '（' + l.saiShinseiNote + '）' : '') + '。'
        : l.saiShinsei === '不要' ? '。再申請は不要との回答のため、見積に計上していません' + (l.saiShinseiNote ? '（' + l.saiShinseiNote + '）' : '') + '。'
        : '。許可・届出済みのため、見積に計上していません（再申請が必要な場合は加算）。'));
  });
  return { ok: true, total: total, feeSubtotal: feeSubtotal, tax: tax, taxRate: TAX_RATE, feeTotal: feeSubtotal + tax,
    costTotal: costTotal, items: items, notes: notes };
}

/**
 * 物件明細シートの1行（getLotsByCase_ の形）を、見積の計算に使う形に戻す。
 * 金額はシートに保存した文字（「1㎡あたり 329円（…）」「1申請あたり 1,100円／…」「10,000円／…」）から読み取る。
 */
function lotRowToEstimateLot_(r) {
  const bool = function (v) { return v === true ? 'はい' : v === false ? 'いいえ' : v === '不明' ? '分からない' : String(v || ''); };
  const yen = function (s) { const m = String(s || '').match(/([\d,]+)円/); return m ? Number(m[1].replace(/,/g, '')) : 0; };
  const st = String(r.kairyoSettlementNote || '');
  const fee = String(r.kairyoFee || '');
  const lot = {
    lotNumber: String(r.lotNumber || ''),
    area: Number(String(r.area === undefined ? '' : r.area).replace(/,/g, '')) || null,
    isNoshin: bool(r.isNoshin), isConverted: bool(r.isConverted),
    landUse: String(r.landUse || '').replace(/（.*$/, ''), // 「駐車場（補足）」→「駐車場」
    chimokuHenko: r.chimokuHenko === 'はい' || r.chimokuHenko === true,
    settlementAmount: r.kairyoSettlement === '必要' ? yen(st) : 0,
    settlementUnit: /^1㎡あたり/.test(st) ? '㎡あたり' : /^1haあたり/.test(st) ? 'haあたり' : '総額',
    kairyoFeeAmount: yen(fee),
    kairyoFeeUnit: /^1筆あたり/.test(fee) ? '1筆あたり' : '1申請あたり',
    drainFeeAmount: yen(r.drainFee),
    localContacts: contactLines_(r.localContacts),
    kairyoExtra: (function () { try { return JSON.parse(r.kairyoExtraData || '[]'); } catch (e) { return []; } })(),
    drainContacts: contactLines_(r.drainContacts),
    prefecture: String(r.prefecture || ''), municipality: String(r.municipality || ''), address: String(r.address || ''),
    chimokuDate: String(r.chimokuDate || ''),
  };
  ['zone', 'landImprovement', 'kairyoBenefit', 'kairyoProcedure', 'kairyoName', 'kairyoDrain', 'localConsent', 'iinStamp', 'purpose',
    'drainConsent', 'drainLocalConsent', 'drainName', 'jogaiKanou', 'jogaiNote', 'jogaiUketsuke', 'tenyoKanou', 'kanouNote',
    'noutiKubun', 'tenyoUketsuke', 'tenyoRireki', 'rirekiDate', 'rirekiNo', 'rirekiNote', 'saiShinsei', 'saiShinseiNote',
    'shimatsusho', 'shimatsuStamp', 'shimatsuNote', 'hojoKuiki', 'hojo8nen',
    'hinochi', 'hinochiYears', 'hinochiDocs', 'hinochiNote', 'zeseiKyoka', 'zeseiNote'].forEach(function (k) {
    lot[k] = r[k] === undefined || r[k] === null ? '' : String(r[k]);
  });
  return lot;
}

/** 物件の不動産登記の管轄（登記所名）。TOUKI_OFFICES に無い県・市区町村は「都道府県＋市区町村」をそのまま使う */
function toukiOfficeOf_(l) {
  const pref = String(l.prefecture || '');
  const text = (String(l.municipality || '') + String(l.address || '')).replace(/[\s　]/g, '');
  const table = TOUKI_OFFICES[pref] || (pref ? null : TOUKI_OFFICES['愛知県']);
  if (table) {
    let hit = '', best = 0;
    Object.keys(table).forEach(function (office) {
      table[office].forEach(function (tok) { if (tok.length > best && text.indexOf(tok) >= 0) { hit = office; best = tok.length; } });
    });
    if (hit) return hit;
  }
  return (pref + String(l.municipality || '')) || '（所在未入力）';
}

/** シートの「氏名／住所／電話」の行 → [{name, address, tel}] */
function contactLines_(text) {
  return String(text || '').split('\n').filter(function (x) { return x.trim(); }).map(function (line) {
    const f = line.split('／');
    return { name: f[0] || '', address: f[1] || '', tel: f[2] || '' };
  });
}

/**
 * 1件の概算を、物件明細シートの内容と現在の金額設定で計算し直す。変わったときだけ書き込む。
 * @return {boolean} 書き込んだか
 */
function recalcCaseEstimate_(c, lotRows) {
  if (!lotRows || !lotRows.length) return false;
  const est = calculateEstimate_({
    lots: lotRows.map(lotRowToEstimateLot_), trust: c.trust === true, extraLotFee: c.extraLotFee === 'あり',
    localFee: c.localFee, localFeeNote: c.localFeeNote,
  });
  const total = est.ok ? est.total : '';
  const detail = estimateToText_(est);
  if (String(c.estimate) === String(total) && String(c.estimateDetail) === detail) return false;
  const row = findCaseRow_(c.id);
  if (!row) return false;
  updateCaseCells_(row, { estimate: total, estimateDetail: detail });
  return true;
}

/** 正式見積を提示する前の案件（RECALC_STATUSES）の概算を、現在の金額設定で計算し直す。@return {number} 変わった件数 */
function recalcOpenEstimates_() {
  const lotsBy = getLotsByCase_();
  let n = 0;
  getAllCases_().forEach(function (c) {
    if (RECALC_STATUSES.indexOf(c.status) < 0) return;
    if (recalcCaseEstimate_(c, lotsBy[c.id])) n++;
  });
  SpreadsheetApp.flush();
  return n;
}

/** 物件の呼び名（物件1（123番1）） */
function lotName_(l, i) {
  return '物件' + ((l.__i !== undefined ? l.__i : i) + 1) + (l.lotNumber ? '（' + l.lotNumber + '）' : '');
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
  lots.forEach(function (lot, i) {
    kairyoEntries_(lot).forEach(function (e) {
      if (e.kairyoBenefit !== '該当する') return;
      addKairyoCost_(lot, e, i, groups, items, notes);
    });
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

/** 物件の土地改良区（1つ目＋2つ目以降）。土地改良区「はい」のときだけ */
function kairyoEntries_(l) {
  if (l.landImprovement !== 'はい') return [];
  return [{
    kairyoName: l.kairyoName, kairyoBenefit: l.kairyoBenefit, kairyoProcedure: l.kairyoProcedure, kairyoDrain: l.kairyoDrain,
    settlementAmount: l.settlementAmount, settlementUnit: l.settlementUnit, kairyoFeeAmount: l.kairyoFeeAmount, kairyoFeeUnit: l.kairyoFeeUnit,
    localConsent: l.localConsent, localContacts: l.localContacts,
  }].concat(Array.isArray(l.kairyoExtra) ? l.kairyoExtra : []);
}

/** 1つの土地改良区の実費（決済金は筆ごと、手数料等は改良区ごとにまとめる） */
function addKairyoCost_(l, e, i, groups, items, notes) {
  const name = e.kairyoName || '土地改良区';
  l = Object.assign({}, l, { settlementAmount: e.settlementAmount, settlementUnit: e.settlementUnit, kairyoFeeAmount: e.kairyoFeeAmount, kairyoFeeUnit: e.kairyoFeeUnit });
  // 決済金（筆ごと）
  if (l.settlementAmount > 0) {
    const lotLabel = lotName_(l, i) + (name !== '土地改良区' ? '・' + name : '');
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
