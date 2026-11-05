/**
 * 04_Http.js
 * UrlFetchAppのラッパー（リトライ・呼出回数カウント・APIキーをログに出さない）。
 */

function getApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_API_KEY);
  if (!key) throw new Error('APIキーが未設定です。メニュー「周辺調査 > APIキー設定」から登録してください。');
  return key;
}

/**
 * @param {Object} ctx 実行コンテキスト（apiCallsを加算）
 * @param {string} label ログ用のAPI名
 */
function fetchJson_(ctx, label, url, options) {
  var opts = options || {};
  opts.muteHttpExceptions = true;
  var retries = ctx.settings ? (toNum_(ctx.settings.api_retries) || 3) : 3;
  var lastErr = '';
  for (var attempt = 0; attempt <= retries; attempt++) {
    var resp = UrlFetchApp.fetch(url, opts);
    ctx.apiCalls = (ctx.apiCalls || 0) + 1;
    ctx.apiByLabel = ctx.apiByLabel || {};
    ctx.apiByLabel[label] = (ctx.apiByLabel[label] || 0) + 1;
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code >= 200 && code < 300) {
      return body ? JSON.parse(body) : {};
    }
    lastErr = label + ' HTTP ' + code + ': ' + body.slice(0, 300);
    if (code === 429 || code >= 500) {
      Utilities.sleep(1000 * Math.pow(2, attempt));
      continue;
    }
    break;
  }
  throw new Error(lastErr);
}

function postJson_(ctx, label, url, body, fieldMask) {
  return fetchJson_(ctx, label, url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Goog-Api-Key': ctx.apiKey,
      'X-Goog-FieldMask': fieldMask
    },
    payload: JSON.stringify(body)
  });
}
