/**
 * ============================================================
 *  Google Chat 通知
 * ============================================================
 *  Incoming Webhook に JSON を POST するだけのシンプルな実装です。
 *  通知に失敗しても例外は投げず、結果を返します（保存処理を巻き戻さないため）。
 */

/** 使用する Webhook URL（スクリプトプロパティ優先 → Config.gs の定数） */
function getWebhookUrl_() {
  const fromProps = PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK_URL');
  return (fromProps || CHAT_WEBHOOK_URL || '').trim();
}

/**
 * Chat にテキストを送る。
 * @param {string} text
 * @return {{ok:boolean, message:string}}
 */
function postToChat_(text) {
  const url = getWebhookUrl_();
  if (!url) {
    return { ok: false, message: 'Webhook URLが未設定です（Config.gs の CHAT_WEBHOOK_URL）' };
  }
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true, // HTTPエラーでも例外にせず、ステータスで判定する
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true, message: '送信済み' };
    return { ok: false, message: 'HTTP ' + code + ': ' + res.getContentText().slice(0, 200) };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
}

/**
 * 見積調査依頼の通知文を組み立てる。
 * Chat の書式： *太字*、<URL|リンク文字>
 */
function buildRequestMessage_(caseId, input, estimate, rowUrl, attach) {
  const location = [input.prefecture, input.address].filter(String).join(' ');
  const adminUrl = getAdminUrl_(caseId);
  const lines = [
    '*【農地転用】見積調査依頼が届きました*',
    '案件ID：' + caseId,
    '依頼者名：' + (input.requesterName || '（未入力）'),
    '物件所在地：' + (location || '（未入力）'),
    '地番：' + input.lotNumber,
    '区域：' + (input.zone || '（未選択）'),
    '農振農用地：' + (input.isNoshin || '-') + '　土地改良区：' + (input.landImprovement || '-'),
    '現況利用：' + (input.landUse || '-') + '　転用済み：' + (input.isConverted || '-'),
    '概算見積金額：' + (estimate.ok ? formatYen_(estimate.total) : '算出不可'),
    '手元資料：' + (input.documents.join('、') || 'なし'),
    '入力者：' + (input.submittedBy || '不明'),
  ];
  if (attach && attach.folderUrl) {
    lines.push('<' + attach.folderUrl + '|アップロード資料（' + attach.count + '件）を開く>');
  }
  if (attach && attach.errors.length) {
    lines.push('⚠ 資料の保存でエラー：' + attach.errors.join(' / '));
  }
  if (adminUrl) lines.push('<' + adminUrl + '|管理画面で案件を開く>');
  lines.push('<' + rowUrl + '|スプレッドシートで案件行を開く>');
  return lines.join('\n');
}

/** 管理画面で案件を開くURL（Webアプリとしてデプロイされていない場合は空文字） */
function getAdminUrl_(caseId) {
  try {
    const base = ScriptApp.getService().getUrl();
    return base ? base + '?page=admin&id=' + caseId : '';
  } catch (e) {
    return '';
  }
}
