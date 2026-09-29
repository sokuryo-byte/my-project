/**
 * ============================================================
 *  Webアプリ（画面表示と、画面から呼ばれるAPI）
 * ============================================================
 *  画面（Index.html）からは google.script.run で以下の関数だけを呼びます。
 *    - getInitialData()          : プルダウン用のマスタ・選択肢
 *    - previewEstimate(form)     : 概算見積の再計算（保存しない）
 *    - submitCase(form, request) : 保存（＋ request=true なら Chat 通知）
 *  関数名の末尾が「_」の関数は、画面から直接呼べない内部用関数です。
 */

/** Webアプリの入口：フォーム画面を返す */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('農地転用 見積・調査依頼フォーム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTMLテンプレートから別ファイル（CSS/JS）を読み込む */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 画面の初期表示に必要なデータを返す */
function getInitialData() {
  return {
    options: FORM_OPTIONS,
    master: getMasterList_(),
    userEmail: getUserEmail_(),
  };
}

/** 入力途中の内容で概算見積を計算して返す（保存はしない） */
function previewEstimate(form) {
  return calculateEstimate_(normalizeInput_(form));
}

/**
 * 案件を保存し、依頼の場合は Chat に通知する。
 * @param {Object} form 画面の入力値
 * @param {boolean} requestInvestigation true=見積調査依頼（通知あり） / false=保存のみ
 * @return {{id:number, estimate:Object, notified:boolean, notifyMessage:string, rowUrl:string}}
 */
function submitCase(form, requestInvestigation) {
  const input = normalizeInput_(form);
  const errors = validateInput_(input);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  const estimate = calculateEstimate_(input);
  const isRequest = requestInvestigation === true;

  // 1) 保存（通知より先に保存し、通知失敗でも記録が残るようにする）
  const saved = appendCase_({
    receivedAt: new Date(),
    requesterName: input.requesterName,
    address: input.address,
    lotNumber: input.lotNumber,
    chimoku: input.chimoku,
    area: input.area === null ? '' : input.area,
    zone: input.zone,
    isNoshin: toSheetBool_(input.isNoshin),
    landUse: input.landUseText,
    isConverted: toSheetBool_(input.isConverted),
    plan: input.plan,
    landImprovement: input.landImprovement,
    documents: input.documents.join(','),
    estimate: estimate.ok ? estimate.total : '',
    requestFlag: isRequest,
    prefecture: input.prefecture,
    municipality: input.municipality,
    waterAssociation: input.waterAssociation,
    estimateDetail: estimateToText_(estimate),
    submittedBy: input.submittedBy,
    notifyResult: isRequest ? '送信中' : '通知なし（保存のみ）',
  });

  // 2) 通知（依頼の場合のみ）→ 結果をシートに書き戻す
  let notify = { ok: false, message: '通知なし（保存のみ）' };
  if (isRequest) {
    notify = postToChat_(buildRequestMessage_(saved.id, input, estimate, saved.url));
    updateCaseCell_(saved.row, 'notifyResult', notify.ok ? '送信済み' : '失敗：' + notify.message);
  }

  return {
    id: saved.id,
    estimate: estimate,
    notified: notify.ok,
    notifyMessage: notify.message,
    rowUrl: saved.url,
  };
}

// ------------------------------------------------------------
// 入力の整形・チェック
// ------------------------------------------------------------

/**
 * 画面の入力値を扱いやすい形に整える（前後空白の除去、選択肢外の値の除外など）。
 * 画面側の値を信用しすぎないよう、サーバー側で必ずここを通す。
 */
function normalizeInput_(form) {
  const f = form || {};
  const str = function (v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); };
  const pick = function (v, list) { const s = str(v); return list.indexOf(s) >= 0 ? s : ''; };

  const areaText = str(f.area).replace(/[,，]/g, '');
  const areaNum = areaText === '' ? null : Number(areaText);

  const landUse = pick(f.landUse, FORM_OPTIONS.landUses);
  const landUseOther = str(f.landUseOther, 100);
  // シートには「選択肢（自由記載）」の形で保存する
  const landUseText = landUseOther ? (landUse ? landUse + '（' + landUseOther + '）' : landUseOther) : landUse;

  const docs = (Array.isArray(f.documents) ? f.documents : [f.documents])
    .map(function (d) { return pick(d, FORM_OPTIONS.documents); })
    .filter(String);
  const docsOther = str(f.documentsOther, 100);
  if (docsOther) {
    docs.push('その他（' + docsOther + '）');
  } else if (f.hasOtherDocument === true) {
    docs.push('その他');
  }

  return {
    requesterName: str(f.requesterName, 50),
    address: str(f.address),
    lotNumber: str(f.lotNumber, 100),
    prefecture: str(f.prefecture, 10),
    municipality: str(f.municipality, 50),
    chimoku: pick(f.chimoku, FORM_OPTIONS.chimoku),
    area: areaNum,
    zone: pick(f.zone, FORM_OPTIONS.zones),
    isNoshin: pick(f.isNoshin, FORM_OPTIONS.yesNoUnknown),
    landUse: landUse,
    landUseText: landUseText,
    isConverted: pick(f.isConverted, FORM_OPTIONS.yesNo),
    plan: str(f.plan, 1000),
    landImprovement: pick(f.landImprovement, FORM_OPTIONS.yesNoUnknown),
    waterAssociation: pick(f.waterAssociation, FORM_OPTIONS.yesNoUnknown),
    documents: docs,
    submittedBy: getUserEmail_(),
  };
}

/** 保存前の必須チェック。エラーメッセージの配列を返す（空ならOK） */
function validateInput_(input) {
  const errors = [];
  if (!input.requesterName) errors.push('依頼者名を入力してください。');
  if (!input.lotNumber) errors.push('地番を入力してください。');
  if (!input.zone) errors.push('市街化区域／調整区域を選択してください（不明な場合は「分からない」）。');
  if (input.area !== null && (isNaN(input.area) || input.area < 0)) {
    errors.push('面積は0以上の数値で入力してください。');
  }
  return errors;
}

/** 「はい／いいえ／分からない」をシート保存用の値にする（はい=TRUE, いいえ=FALSE, 分からない=「不明」） */
function toSheetBool_(answer) {
  if (answer === 'はい') return true;
  if (answer === 'いいえ') return false;
  if (answer === '分からない') return '不明';
  return '';
}

/** アクセス中のユーザーのメールアドレス（取得できない場合は空文字） */
function getUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}
