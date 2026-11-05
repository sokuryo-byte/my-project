/**
 * 11_Main.js
 * メニューと処理の流れ。
 *
 * 流れ: 住所 → (Geocoding) 起点座標 → 担当者が建物出入口を確認 → 周辺施設/駅/アクセス調査
 *       → 担当者が結果シートを確認・編集 → 出力（ウェルモ入力用の文言）
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('周辺調査')
    .addItem('⓪ マイソクフォルダから新規物件を取り込み', 'menuImportMysokuFolder')
    .addItem('⓪ 選択した物件のマイソクPDFを取り込み', 'menuImportMysokuSelected')
    .addSeparator()
    .addItem('① 選択した物件を調査', 'menuSurveySelected')
    .addItem('② 未調査の物件をまとめて調査', 'menuSurveyPending')
    .addItem('③ 出力を再生成（結果シートの編集を反映）', 'menuRegenerateOutput')
    .addSeparator()
    .addItem('保存期限切れデータの整理', 'menuPurgeExpired')
    .addSeparator()
    .addItem('初期セットアップ（シート作成）', 'menuSetup')
    .addItem('APIキー設定', 'menuSetApiKey')
    .addToUi();
}

function menuSetup() {
  setupSheets_();
  SpreadsheetApp.getUi().alert('セットアップが完了しました。続けて「APIキー設定」を行ってください。');
}

function menuSetApiKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('APIキー設定', 'Google Maps PlatformのAPIキー（Geocoding / Places (New) / Routes を有効化したもの）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) return;
  PropertiesService.getScriptProperties().setProperty(SCRIPT_PROP_API_KEY, key);
  ui.alert('APIキーを保存しました（スクリプトプロパティ）。');
}

function menuSurveySelected() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.PROPERTIES) {
    SpreadsheetApp.getUi().alert('「' + SHEETS.PROPERTIES + '」シートで調査したい行を選択してから実行してください。');
    return;
  }
  var rows = {};
  sh.getActiveRangeList().getRanges().forEach(function (r) {
    for (var i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) if (i >= 2) rows[i] = true;
  });
  runSurvey_(function (p) { return rows[p._row] && (p['住所'] || p['起点緯度']); });
}

function menuSurveyPending() {
  runSurvey_(function (p) { return p['住所'] && p['ステータス'] !== '調査済'; });
}

function menuRegenerateOutput() {
  var n = regenerateOutput_(null);
  SpreadsheetApp.getUi().alert(n + '件の出力を再生成しました。');
}

function menuPurgeExpired() {
  var n = purgeExpired_();
  SpreadsheetApp.getUi().alert('保存期限切れの行を' + n + '件削除しました。該当物件は「要再調査」になっています。');
}

/* ---------------- マイソク取り込み ---------------- */

function selectedPropertyRows_() {
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEETS.PROPERTIES) return null;
  var rows = {};
  sh.getActiveRangeList().getRanges().forEach(function (r) {
    for (var i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) if (i >= 2) rows[i] = true;
  });
  return rows;
}

function menuImportMysokuSelected() {
  var rows = selectedPropertyRows_();
  if (!rows) {
    SpreadsheetApp.getUi().alert('「' + SHEETS.PROPERTIES + '」シートで行を選択してから実行してください。');
    return;
  }
  var start = Date.now();
  var msgs = [];
  readTable_(SHEETS.PROPERTIES).rows.filter(function (p) { return rows[p._row] && p['マイソクPDF']; }).forEach(function (p) {
    if (Date.now() - start > MAX_EXEC_MS) return;
    try {
      var r = importMysokuForRow_(p);
      msgs.push((p['物件名'] || p._row + '行目') + ': 反映 ' + (r.filled.join('、') || 'なし'));
    } catch (e) {
      msgs.push(p._row + '行目: エラー ' + e.message);
    }
  });
  SpreadsheetApp.getUi().alert(msgs.join('\n') || '「マイソクPDF」列が入力された行がありません。');
}

function menuImportMysokuFolder() {
  var res = importMysokuFolder_(loadSettings_(), Date.now());
  SpreadsheetApp.getUi().alert(res.length ? res.join('\n') : '新しいPDFはありません。');
}

/* ---------------- 調査 ---------------- */

function buildContext_() {
  var settings = loadSettings_();
  return {
    settings: settings,
    categories: loadCategories_(),
    brandDict: loadBrandDict_(),
    apiKey: getApiKey_(),
    mPerMin: toNum_(settings.walk_m_per_min) || 80,
    apiCalls: 0,
    startMs: Date.now()
  };
}

function runSurvey_(filterFn) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    SpreadsheetApp.getUi().alert('他の調査が実行中です。しばらくしてから再実行してください。');
    return;
  }
  try {
    var ctx = buildContext_();
    var props = readTable_(SHEETS.PROPERTIES).rows.filter(filterFn);
    var done = [];
    var stopped = false;
    for (var i = 0; i < props.length; i++) {
      if (Date.now() - ctx.startMs > MAX_EXEC_MS) { stopped = true; break; }
      done.push(processProperty_(props[i], ctx));
    }
    var msg = done.map(function (d) { return d.id + ': ' + d.status; }).join('\n');
    if (stopped) msg += '\n\n実行時間の上限に近づいたため中断しました。残りは「② 未調査の物件をまとめて調査」で続行してください。';
    SpreadsheetApp.getUi().alert('調査結果（API呼出 ' + ctx.apiCalls + '回）\n\n' + (msg || '対象の物件がありません'));
  } finally {
    lock.releaseLock();
  }
}

function processProperty_(prop, ctx) {
  var name = SHEETS.PROPERTIES;
  var id = nfkc_(prop['物件ID']).trim();
  if (!id) {
    id = 'P' + ('0000' + prop._row).slice(-5);
    updateRow_(name, prop._row, { '物件ID': id });
    prop['物件ID'] = id;
  }
  ctx.propertyId = id;
  ctx.runId = makeRunId_();
  var callsBefore = ctx.apiCalls;
  var requireConfirm = bool_(ctx.settings.require_origin_confirm);

  try {
    var lat = toNum_(prop['起点緯度']);
    var lng = toNum_(prop['起点経度']);

    // 1. 起点の座標
    if (lat == null || lng == null) {
      if (!prop['住所']) return finish_(prop, ctx, 'エラー', '住所が空です', callsBefore);
      var g = geocode_(ctx, prop['住所']);
      lat = g.lat;
      lng = g.lng;
      var warn = [];
      if (g.locationType !== 'ROOFTOP') warn.push('Geocode精度が' + g.locationType + '（建物単位ではない）');
      if (g.partialMatch) warn.push('住所が部分一致');
      if (g.resultCount > 1) warn.push('候補が' + g.resultCount + '件');
      var patch = {
        '起点緯度': lat, '起点経度': lng, '起点確認済': false,
        'Googleマップ': mapUrl_(lat, lng),
        'Geocode種別': g.locationType, 'Geocode部分一致': g.partialMatch ? 'あり' : '',
        'Geocode住所': g.formattedAddress
      };
      if (!nfkc_(prop['エリア']).trim()) {
        patch['エリア'] = areaFromGeocode_(g.components, g.formattedAddress, {
          wardCities: splitList_(ctx.settings.title_ward_cities),
          otherStyle: nfkc_(ctx.settings.title_area_other_style).trim()
        });
        prop['エリア'] = patch['エリア'];
      }
      updateRow_(name, prop._row, patch);
      prop['起点確認済'] = false;
      if (requireConfirm) {
        return finish_(prop, ctx, '起点確認待ち',
          (warn.length ? '【注意】' + warn.join('・') + '。' : '') +
          'Googleマップで位置を確認し、必要なら起点緯度/経度を建物の出入口に修正して「起点確認済」にチェック後、再実行してください。',
          callsBefore);
      }
    }
    if (requireConfirm && !bool_(prop['起点確認済'])) {
      return finish_(prop, ctx, '起点確認待ち', '「起点確認済」にチェックしてから再実行してください。', callsBefore);
    }
    updateRow_(name, prop._row, { 'Googleマップ': mapUrl_(lat, lng) });
    var origin = { lat: lat, lng: lng };

    // 2. 周辺施設
    var errors = [];
    var fac = surveyFacilities_(ctx, origin);
    errors = errors.concat(fac.errors);
    replacePropertyRows_(SHEETS.FACILITIES, id, fac.rows,
      function (r) { return r['物件ID'] + '|' + r['カテゴリID'] + '|' + r['place_id']; },
      ['確認済', '掲載', '備考']);

    // 3. 駅
    try {
      var st = surveyStations_(ctx, prop, origin);
      replacePropertyRows_(SHEETS.STATIONS, id, st,
        function (r) { return r['物件ID'] + '|' + normStationName_(r['駅名']); },
        ['路線', '確認済', '備考']);
    } catch (e) {
      errors.push('駅: ' + e.message);
    }

    // 4. バス停・空港
    try {
      var ac = surveyBusStop_(ctx, origin).concat(surveyAirports_(ctx, origin));
      replacePropertyRows_(SHEETS.ACCESS, id, ac,
        function (r) { return r['物件ID'] + '|' + r['種別'] + '|' + (r['place_id'] || r['名称']); },
        ['運行会社', '確認済', '備考']);
    } catch (e2) {
      errors.push('アクセス: ' + e2.message);
    }

    regenerateOutput_(id);
    var status = errors.length ? '調査済（一部エラー）' : '調査済';
    return finish_(prop, ctx, status, errors.join(' / ') || '結果シートの「要確認理由」を確認し、「確認済」「掲載」を判断してください。', callsBefore);
  } catch (e) {
    return finish_(prop, ctx, 'エラー', e.message, callsBefore);
  }
}

function finish_(prop, ctx, status, message, callsBefore) {
  updateRow_(SHEETS.PROPERTIES, prop._row, {
    'ステータス': status,
    '最終調査日時': formatJst_(),
    'メッセージ': message
  });
  appendLog_(ctx.runId, prop['物件ID'], '調査', status, ctx.apiCalls - callsBefore, message);
  return { id: prop['物件ID'], status: status };
}

function mapUrl_(lat, lng) {
  return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng;
}

/* ---------------- 出力 ---------------- */

/** @param {string|null} onlyId 指定時はその物件のみ */
function regenerateOutput_(onlyId) {
  var settings = loadSettings_();
  var categories = loadCategories_();
  var props = readTable_(SHEETS.PROPERTIES).rows.filter(function (p) {
    return p['物件ID'] && (!onlyId || String(p['物件ID']) === String(onlyId));
  });
  var fac = readTable_(SHEETS.FACILITIES).rows;
  var st = readTable_(SHEETS.STATIONS).rows;
  var ac = readTable_(SHEETS.ACCESS).rows;
  var byId = function (rows, id) { return rows.filter(function (r) { return String(r['物件ID']) === String(id); }); };

  var outT = readTable_(SHEETS.OUTPUT);
  var outRows = outT.rows.filter(function (r) {
    return !props.some(function (p) { return String(p['物件ID']) === String(r['物件ID']); });
  });
  var count = 0;
  props.forEach(function (p) {
    var f = byId(fac, p['物件ID']);
    var s = byId(st, p['物件ID']);
    var a = byId(ac, p['物件ID']);
    if (!f.length && !s.length && !a.length) return;
    outRows.push(buildOutputRow_(p, f, s, a, categories, settings));
    count++;
  });
  var sh = outT.sheet;
  var headers = outT.headers;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).clearContent();
  if (outRows.length) {
    sh.getRange(2, 1, outRows.length, headers.length).setValues(rowsToValues_(headers, outRows));
    sh.getRange(2, headers.indexOf('周辺施設') + 1, outRows.length, 1).setWrap(true);
  }
  return count;
}

/* ---------------- 保存期限 ---------------- */

/**
 * Google Maps Platform利用規約のキャッシュ制限に配慮し、保存日数を超えたGoogle由来データを削除する。
 * place_idのみを残す運用にする場合は、ここを調整する。
 */
function purgeExpired_() {
  var settings = loadSettings_();
  var days = toNum_(settings.retention_days) || 30;
  var limitMs = Date.now() - days * 86400000;
  var expiredProps = {};
  var removed = 0;
  [SHEETS.FACILITIES, SHEETS.STATIONS, SHEETS.ACCESS].forEach(function (name) {
    var t = readTable_(name);
    var keep = [];
    t.rows.forEach(function (r) {
      var ms = parseJst_(r['取得日時']);
      if (ms != null && ms < limitMs) {
        expiredProps[r['物件ID']] = true;
        removed++;
      } else {
        keep.push(r);
      }
    });
    var sh = t.sheet;
    if (sh.getLastRow() > 1) {
      var body = sh.getRange(2, 1, sh.getLastRow() - 1, t.headers.length);
      body.clearContent();
      body.clearDataValidations();
    }
    if (keep.length) {
      sh.getRange(2, 1, keep.length, t.headers.length).setValues(rowsToValues_(t.headers, keep));
      applyCheckboxes_(sh, t.headers, name, 2, keep.length);
    }
  });
  readTable_(SHEETS.PROPERTIES).rows.forEach(function (p) {
    if (expiredProps[p['物件ID']]) {
      updateRow_(SHEETS.PROPERTIES, p._row, { 'ステータス': '要再調査', 'メッセージ': '保存期限切れのため結果を削除しました。再調査してください。' });
    }
  });
  if (Object.keys(expiredProps).length) regenerateOutput_(null);
  return removed;
}
