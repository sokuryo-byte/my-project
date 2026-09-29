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
