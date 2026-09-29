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
  const fromProps = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  const list = (fromProps ? fromProps.split(',') : ADMIN_EMAILS)
    .map(function (s) { return String(s).trim().toLowerCase(); })
    .filter(String);
  return list.indexOf(email) >= 0;
}

function requireAdmin_() {
  if (!isAdmin_()) throw new Error('この操作を行う権限がありません。');
}
