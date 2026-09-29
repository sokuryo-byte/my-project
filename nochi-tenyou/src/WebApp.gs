/**
 * ============================================================
 *  Webアプリ（画面表示と、依頼画面から呼ばれるAPI）
 * ============================================================
 *  URL                → 依頼画面（Index.html）
 *  URL?page=admin     → 行政班の管理画面（Admin.html、ADMIN_EMAILS のみ）
 *
 *  依頼画面からは google.script.run で以下の関数だけを呼びます。
 *    - getInitialData()          : プルダウン用のマスタ・選択肢
 *    - previewEstimate(form)     : 概算見積の再計算（保存しない）
 *    - uploadAttachment(file)    : 資料ファイルを一時フォルダへ保存
 *    - removeAttachment(fileId)  : アップロードの取り消し
 *    - submitCase(form, request) : 保存（＋ request=true なら Chat 通知）
 *  関数名の末尾が「_」の関数は、画面から直接呼べない内部用関数です。
 */

/** Webアプリの入口 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.page === 'admin') {
    if (!isAdmin_()) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:sans-serif;padding:24px">管理画面を表示する権限がありません。' +
        '行政班の担当者にお問い合わせください。</p>').setTitle('権限がありません');
    }
    const t = HtmlService.createTemplateFromFile('Admin');
    t.initialId = String(params.id || '').replace(/\D/g, ''); // 通知のリンクから開いた案件
    return t.evaluate()
      .setTitle('農地転用 案件管理（行政班）')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
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
    farmlandUses: FARMLAND_LAND_USES,
    defaultPrefecture: DEFAULT_PREFECTURE,
    master: getMasterList_(),
    userEmail: getUserEmail_(),
    upload: { maxMb: MAX_UPLOAD_MB, mimeTypes: ALLOWED_MIME_TYPES },
  };
}

/** 入力途中の内容で概算見積を計算して返す（保存はしない） */
function previewEstimate(form) {
  return calculateEstimate_(normalizeInput_(form));
}

/** 資料ファイルを一時フォルダへ保存する（ドラッグ直後に呼ばれる） */
function uploadAttachment(file) {
  return saveUploadedFile_(file);
}

/** アップロードを取り消す（一時フォルダ内のファイルのみ削除可能） */
function removeAttachment(fileId) {
  return trashPendingFile_(fileId);
}

/**
 * 案件を保存し、依頼の場合は Chat に通知する。
 * @param {Object} form 画面の入力値
 * @param {boolean} requestInvestigation true=見積調査依頼（通知あり） / false=保存のみ
 */
function submitCase(form, requestInvestigation) {
  const input = normalizeInput_(form);
  const errors = validateInput_(input);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  const estimate = calculateEstimate_(input);
  const isRequest = requestInvestigation === true;

  // 1) 保存（通知より先に保存し、以降が失敗しても記録が残るようにする）
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
    status: CASE_STATUSES[0],
    updatedAt: new Date(),
  });

  // 2) 資料フォルダの作成とファイル移動（失敗しても案件は残す）
  let attach = { folderUrl: '', count: 0, errors: [] };
  try {
    attach = attachFilesToCase_(saved.id, input);
    updateCaseCells_(saved.row, { folderUrl: attach.folderUrl, fileCount: attach.count });
  } catch (e) {
    attach.errors.push('資料フォルダの作成に失敗：' + (e && e.message || e));
  }

  // 3) 通知（依頼の場合のみ）→ 結果をシートに書き戻す
  let notify = { ok: false, message: '通知なし（保存のみ）' };
  if (isRequest) {
    notify = postToChat_(buildRequestMessage_(saved.id, input, estimate, saved.url, attach));
    updateCaseCell_(saved.row, 'notifyResult', notify.ok ? '送信済み' : '失敗：' + notify.message);
  }

  return {
    id: saved.id,
    estimate: estimate,
    notified: notify.ok,
    notifyMessage: notify.message,
    fileCount: attach.count,
    attachErrors: attach.errors,
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

  // アップロード済みファイル（ID と資料種別）
  const attachments = (Array.isArray(f.attachments) ? f.attachments : [])
    .map(function (a) { return { fileId: str(a && a.fileId, 100), docType: pick(a && a.docType, FORM_OPTIONS.documents) }; })
    .filter(function (a) { return a.fileId && a.docType; })
    .slice(0, 50);

  // 手元にある資料 ＝ チェックされた種別 ＋ ファイルがアップロードされた種別
  const types = (Array.isArray(f.documents) ? f.documents : [])
    .map(function (d) { return pick(d, FORM_OPTIONS.documents); })
    .concat(attachments.map(function (a) { return a.docType; }));
  const docsOther = str(f.documentsOther, 100);
  const documents = FORM_OPTIONS.documents
    .filter(function (d) { return types.indexOf(d) >= 0; })
    .map(function (d) { return d === 'その他' && docsOther ? 'その他（' + docsOther + '）' : d; });

  // 所在は「市区町村〜」を1欄で受け取り、市区町村はマスタとの前方一致で取り出す（一致しなければ空欄）
  const prefecture = str(f.prefecture, 10) || DEFAULT_PREFECTURE;
  let address = str(f.address);
  if (address.indexOf(prefecture) === 0) address = address.slice(prefecture.length).trim();

  return {
    requesterName: str(f.requesterName, 50),
    address: address,
    lotNumber: str(f.lotNumber, 100),
    prefecture: prefecture,
    municipality: detectMunicipality_(prefecture, address),
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
    documents: documents,
    attachments: attachments,
    submittedBy: getUserEmail_(),
  };
}

/**
 * 所在の先頭がマスタの市区町村名と一致すれば、その市区町村名を返す（長い名前を優先）。
 * 文字列の前方一致だけで、推測はしない。
 */
function detectMunicipality_(prefecture, address) {
  return getMasterList_()
    .filter(function (m) { return m.prefecture === prefecture && address.indexOf(m.municipality) === 0; })
    .map(function (m) { return m.municipality; })
    .sort(function (a, b) { return b.length - a.length; })[0] || '';
}

/** 保存前の必須チェック。エラーメッセージの配列を返す（空ならOK） */
function validateInput_(input) {
  const errors = [];
  if (!input.requesterName) errors.push('依頼者名を入力してください。');
  if (!input.lotNumber) errors.push('地番を入力してください。');
  if (!input.zone) errors.push('区域区分を選択してください（不明な場合は「分からない」）。');
  if (input.area !== null && (isNaN(input.area) || input.area < 0)) {
    errors.push('面積は0以上の数値で入力してください。');
  }
  if (FARMLAND_LAND_USES.indexOf(input.landUse) >= 0 && !input.plan) {
    errors.push('現況が農地（' + input.landUse + '）の場合は、今後の転用計画を入力してください。');
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
