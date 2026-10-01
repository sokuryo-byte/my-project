/**
 * ============================================================
 *  行政班（受任側）の管理画面 API
 * ============================================================
 *  管理画面（Admin.html）から google.script.run で呼ばれます。
 *  すべての関数の先頭で requireAdmin_() を呼び、権限のない人には何も返しません。
 *  管理画面から書き換えられるのは ADMIN_EDITABLE_KEYS の列だけです。
 */

/** 管理画面の初期データ（案件一覧・選択肢） */
function getAdminData() {
  requireAdmin_();
  return {
    cases: getAllCases_(),
    lotsByCase: getLotsByCase_(),
    statuses: CASE_STATUSES,
    userEmail: getUserEmail_(),
  };
}

/**
 * 管理画面からの更新（対応状況・担当者・正式見積・メモ）。
 * @param {number} caseId
 * @param {Object} patch { status, assignee, formalEstimate, adminMemo }
 * @return {Object} 更新後の案件
 */
function updateCaseByAdmin(caseId, patch) {
  requireAdmin_();
  const p = patch || {};
  const values = {};

  if (p.status !== undefined) {
    if (CASE_STATUSES.indexOf(p.status) < 0) throw new Error('対応状況の値が不正です。');
    values.status = p.status;
  }
  if (p.assignee !== undefined) values.assignee = String(p.assignee).trim().slice(0, 50);
  if (p.adminMemo !== undefined) values.adminMemo = String(p.adminMemo).slice(0, 2000);
  if (p.formalEstimate !== undefined) {
    const s = String(p.formalEstimate).replace(/[,，¥円\s]/g, '');
    const n = Number(s);
    if (s !== '' && (isNaN(n) || n < 0)) throw new Error('正式見積金額は数値で入力してください。');
    values.formalEstimate = s === '' ? '' : n;
  }
  Object.keys(values).forEach(function (k) {
    if (ADMIN_EDITABLE_KEYS.indexOf(k) < 0) delete values[k]; // 念のため
  });
  values.updatedAt = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    const row = findCaseRow_(caseId);
    if (!row) throw new Error('案件ID ' + caseId + ' が見つかりません。');
    updateCaseCells_(row, values);
  } finally {
    lock.releaseLock();
  }
  return getAllCases_().filter(function (c) { return Number(c.id) === Number(caseId); })[0];
}

/**
 * 管理画面からの削除。案件と物件明細は「削除した案件」「削除した物件明細」シートに控えを残す（資料フォルダは残す）。
 * @param {number} caseId
 * @return {{id:number, lots:number}}
 */
function deleteCaseByAdmin(caseId) {
  requireAdmin_();
  const id = Number(caseId);
  if (!id) throw new Error('案件IDが不正です。');
  const r = deleteCase_(id, getUserEmail_());
  return { id: id, lots: r.lots };
}

/**
 * 正式見積の提示：見積書PDFを案件フォルダに保存し、対応状況を「正式見積提示済」にして、
 * 行政班の Chat スペースへ通知する（メールは送らない）。
 * @param {number} caseId
 * @param {{name:string, mimeType:string, data:string}} file data は Base64
 * @param {{amount:string}} opts
 * @return {Object} 更新後の案件
 */
function submitFormalEstimate(caseId, file, opts) {
  requireAdmin_();
  const o = opts || {};
  if (String(file && file.mimeType) !== 'application/pdf') throw new Error('見積書はPDFを選んでください。');
  const bytes = Utilities.base64Decode(String(file.data || ''));
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) throw new Error('ファイルサイズが上限（' + MAX_UPLOAD_MB + 'MB）を超えています。');
  const amountText = String(o.amount === undefined ? '' : o.amount).replace(/[,，¥円\s]/g, '');
  if (amountText !== '' && (isNaN(Number(amountText)) || Number(amountText) < 0)) throw new Error('正式見積金額は数値で入力してください。');

  const c = getAllCases_().filter(function (x) { return Number(x.id) === Number(caseId); })[0];
  if (!c) throw new Error('案件ID ' + caseId + ' が見つかりません。');

  // 1) 保存
  const cf = getCaseFolder_(c);
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const name = sanitizeFileName_('正式見積_' + (c.caseNo || c.id) + '_' + Utilities.formatDate(now, tz, 'yyyyMMdd') + '.pdf');
  const pdf = cf.folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
  pdf.setDescription('提示者：' + getUserEmail_() + '（元のファイル名：' + sanitizeFileName_(file.name) + '）');

  const values = { estimatePdfUrl: pdf.getUrl(), estimatePdfAt: now, updatedAt: now };
  if (amountText !== '') values.formalEstimate = Number(amountText);
  if (['新規', '調査中'].indexOf(c.status) >= 0 || !c.status) values.status = '正式見積提示済';
  if (cf.created) values.folderUrl = cf.folder.getUrl();
  const merged = Object.assign({}, c, values);

  // 2) 行政班の Chat スペースへ通知
  const chat = postToChat_(buildEstimateMessage_(merged, pdf.getUrl()));
  values.reportResult = [Utilities.formatDate(now, tz, 'yyyy/MM/dd HH:mm'), 'Chat：' + (chat.ok ? '送信済み' : '失敗（' + chat.message + '）')]
    .filter(String).join('／');

  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    const row = findCaseRow_(caseId);
    if (!row) throw new Error('案件ID ' + caseId + ' が見つかりません。');
    updateCaseCells_(row, values);
  } finally {
    lock.releaseLock();
  }
  return getAllCases_().filter(function (x) { return Number(x.id) === Number(caseId); })[0];
}

/**
 * 案件詳細のPDF出力：管理画面で組んだ帳票（HTML）をPDFに変換して返す（保存はしない）。
 * @param {string} html
 * @param {string} fileName
 * @return {{name:string, data:string}} data は Base64
 */
function exportCasePdf(html, fileName) {
  requireAdmin_();
  const name = sanitizeFileName_(String(fileName || '案件詳細.pdf'));
  const pdf = Utilities.newBlob(String(html || ''), 'text/html', 'case.html').getAs('application/pdf');
  return { name: /\.pdf$/i.test(name) ? name : name + '.pdf', data: Utilities.base64Encode(pdf.getBytes()) };
}

/** 管理者かどうか（スクリプトプロパティ ADMIN_EMAILS が優先） */
function isAdmin_() {
  const email = getUserEmail_().toLowerCase();
  if (!email) return false;
  return getAdminEmails_().indexOf(email) >= 0;
}

function requireAdmin_() {
  if (!isAdmin_()) throw new Error('この操作を行う権限がありません。');
}

// ------------------------------------------------------------
// 設定タブ（見積金額・管理者・Chat 通知）
// ------------------------------------------------------------

/** 設定タブの表示内容 */
function getAdminSettings() {
  requireAdmin_();
  const fees = getFeeSettings_();
  const props = PropertiesService.getScriptProperties();
  return {
    fees: DEFAULT_FEES.map(function (d) {
      return { key: d.key, label: fees[d.key].label, amount: fees[d.key].amount, note: d.note };
    }),
    adminEmails: getAdminEmails_(),
    adminEmailsFromProps: !!props.getProperty('ADMIN_EMAILS'),
    webhookUrl: getWebhookUrl_(),
    spreadsheetUrl: getSpreadsheet_().getUrl(),
    folderUrl: getRootFolder_().getUrl(),
  };
}

/**
 * 見積の項目名・金額を「見積設定」シートに保存する（無い行は追加してから保存）。
 * @param {Array<{key:string, label:string, amount:(string|number)}>} rows
 */
function saveFeeSettings(rows) {
  requireAdmin_();
  const known = DEFAULT_FEES.map(function (d) { return d.key; });
  const clean = (rows || []).map(function (r) {
    const key = String(r.key);
    if (known.indexOf(key) < 0) throw new Error('不明な項目です：' + key);
    const label = String(r.label || '').trim().slice(0, 100);
    if (!label) throw new Error('項目名が空欄の行があります。');
    const s = String(r.amount).replace(/[,，¥円\s]/g, '');
    const amount = Number(s);
    if (s === '' || isNaN(amount) || amount < 0) throw new Error('「' + label + '」の金額は0以上の数値で入力してください。');
    return { key: key, label: label, amount: Math.round(amount) };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20 * 1000);
  try {
    const ss = getSpreadsheet_();
    const sheet = getOrCreateSheet_(ss, SHEET_NAMES.FEES);
    ensureHeaders_(sheet, FEE_HEADERS);
    addMissingFeeRows_(sheet);
    const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
      .map(function (r) { return String(r[0]).trim(); });
    clean.forEach(function (r) {
      const i = keys.indexOf(r.key);
      if (i >= 0) sheet.getRange(i + 2, 2, 1, 2).setValues([[r.label, r.amount]]);
    });
  } finally {
    lock.releaseLock();
  }
  return getAdminSettings();
}

/**
 * 管理者を保存する（1行1件またはカンマ区切り）。自分を外す変更は受け付けない（締め出し防止）。
 * @param {string} text
 */
function saveAdminEmails(text) {
  requireAdmin_();
  const list = String(text || '').split(/[\s,，、]+/)
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(String)
    .filter(function (s, i, a) { return a.indexOf(s) === i; });
  const bad = list.filter(function (s) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); });
  if (bad.length) throw new Error('メールアドレスの形式が正しくありません：' + bad.join('、'));
  const me = getUserEmail_().toLowerCase();
  if (list.indexOf(me) < 0) throw new Error('ご自身（' + me + '）を管理者から外すことはできません。');
  PropertiesService.getScriptProperties().setProperty('ADMIN_EMAILS', list.join(','));
  return getAdminSettings();
}

/**
 * Google Chat の Webhook URL を保存する（空欄で通知停止）。
 * @param {string} url
 */
function saveWebhookUrl(url) {
  requireAdmin_();
  const u = String(url || '').trim();
  if (u && u.indexOf('https://chat.googleapis.com/') !== 0) {
    throw new Error('Google Chat の Webhook URL（https://chat.googleapis.com/ で始まるもの）を入力してください。');
  }
  PropertiesService.getScriptProperties().setProperty('CHAT_WEBHOOK_URL', u);
  return getAdminSettings();
}

/** 保存済みの Webhook にテスト通知を送る */
function sendTestNotification() {
  requireAdmin_();
  return postToChat_('【テスト】農地転用 見積・調査支援システムからの通知テストです（' + getUserEmail_() + '）。');
}

/** 管理者の一覧（スクリプトプロパティ ADMIN_EMAILS が優先、無ければ Config.gs） */
function getAdminEmails_() {
  const fromProps = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  return (fromProps ? fromProps.split(',') : ADMIN_EMAILS)
    .map(function (s) { return String(s).trim().toLowerCase(); })
    .filter(String);
}
