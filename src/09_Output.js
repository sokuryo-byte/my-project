/**
 * 09_Output.js
 * 表示文の生成。固定テンプレートのみ（AIによる文章生成は行わない）。
 * 担当者が結果シートで編集した値（路線・運行会社・掲載可否）を反映するため、出力時に毎回組み立て直す。
 */

function stationBaseName_(name) {
  return nfkc_(name).trim().replace(/[（(][^）)]*[）)]/g, '').trim().replace(/駅$/, '');
}

/** 例: 名鉄瀬戸線「大曽根」駅 */
function formatStationLabel_(line, name) {
  return (line ? line : '（路線未入力）') + '「' + stationBaseName_(name) + '」駅';
}

/** 車の所要時間の付記。例: （約18.2km・有料道路あり） */
function driveSuffix_(distanceM, toll, showDistance) {
  var parts = [];
  if (showDistance && distanceM) parts.push('約' + displayKm_(distanceM) + 'km');
  if (toll) parts.push('有料道路あり');
  return parts.length ? '（' + parts.join('・') + '）' : '';
}

/**
 * 駅1行分の表示（純粋関数）
 * @return {{label:string, walk:string, other:string}}
 */
function formatStation_(row, limitMin, showDistance) {
  var label = formatStationLabel_(row['路線'], row['駅名']);
  var min = toNum_(row['採用徒歩分']);
  if (min == null) return { label: label, walk: '', other: '' };
  if (min < limitMin) return { label: label, walk: String(min), other: '' };
  var altMin = toNum_(row['代替所要分']);
  if (altMin == null) return { label: label, walk: '', other: '（徒歩' + limitMin + '分以上・代替手段未取得）' };
  if (row['代替手段'] === 'バス') return { label: label, walk: '', other: 'バスで' + altMin + '分' };
  return {
    label: label, walk: '',
    other: '車で' + altMin + '分' + driveSuffix_(toNum_(row['代替距離m']), row['代替有料道路'] === 'あり', showDistance)
  };
}

/** 例: ○○バス「△△」停から徒歩約n分 */
function formatBusStop_(row) {
  if (!row || !row['名称']) return '';
  // 運行会社が未入力なら「○○バス」とは出さず、停留所名だけにする
  var op = nfkc_(row['運行会社']).trim();
  return op + '「' + row['名称'] + '」停から徒歩約' + row['徒歩分'] + '分';
}

/** 例: 県営名古屋空港から車で約n分（有料道路あり） */
function formatAirport_(row, showDistance) {
  if (!row || row['車所要分'] === '' || row['車所要分'] == null) return '';
  return row['名称'] + 'から車で約' + row['車所要分'] + '分' +
    driveSuffix_(toNum_(row['車距離m']), row['有料道路'] === 'あり', showDistance);
}

/** 掲載名（必要ならジャンル名を頭に付ける。例: スーパー タッチもとこい） */
function facilityName_(row) {
  var g = String(row['ジャンル表示'] || '').trim();
  return (g ? g + ' ' : '') + row['名称'];
}

/**
 * 例: セブンイレブン 豊田市小川町店まで徒歩約2分
 *     スーパーマーケットバロー 東新町店まで車で約6分（徒歩分が閾値を超え、車の所要時間がある場合）
 */
function formatFacility_(row, showDistance) {
  var car = toNum_(row['車所要分']);
  if (car != null) {
    return facilityName_(row) + 'まで車で約' + car + '分' + driveSuffix_(toNum_(row['車距離m']), false, showDistance);
  }
  return facilityName_(row) + 'まで徒歩約' + row['徒歩分'] + '分';
}

/** 周辺施設の複数行テキスト（カテゴリの出力順→道路距離順。純粋関数） */
function formatFacilities_(rows, categories, showDistance) {
  var lines = [];
  var cats = categories.slice().sort(function (a, b) { return a.order - b.order; });
  cats.forEach(function (cat) {
    rows.filter(function (r) { return r['カテゴリID'] === cat.id && bool_(r['掲載']) && r['名称']; })
      .sort(function (a, b) { return toNum_(a['道路距離m']) - toNum_(b['道路距離m']); })
      .forEach(function (r) { lines.push(formatFacility_(r, showDistance)); });
  });
  return lines.join('\n');
}

/** 未確認の要確認件数 */
function countUnconfirmed_(facRows, stRows, acRows) {
  var n = 0;
  facRows.forEach(function (r) {
    if ((r['採否'] === '採用' || r['採否'] === '該当なし' || r['採否'] === 'エラー') && r['要確認理由'] && !bool_(r['確認済'])) n++;
  });
  stRows.forEach(function (r) { if (r['要確認理由'] && !bool_(r['確認済'])) n++; });
  acRows.forEach(function (r) { if (bool_(r['採用']) && r['要確認理由'] && !bool_(r['確認済'])) n++; });
  return n;
}

/** 物件1件分の出力行（純粋関数） */
function buildOutputRow_(prop, facRows, stRows, acRows, categories, settings) {
  var limit = toNum_(settings.welmo_walk_limit_min) || 30;
  var showDist = bool_(settings.show_drive_distance);
  var out = { '物件ID': prop['物件ID'], '物件名': prop['物件名'] };
  var st = stRows.slice().sort(function (a, b) { return toNum_(a['枠']) - toNum_(b['枠']); });
  for (var i = 0; i < 3; i++) {
    var f = st[i] ? formatStation_(st[i], limit, showDist) : { label: '', walk: '', other: '' };
    out['駅' + (i + 1)] = f.label;
    out['駅' + (i + 1) + '_徒歩分'] = f.walk;
    out['駅' + (i + 1) + '_その他'] = f.other;
  }
  var bus = acRows.filter(function (r) { return r['種別'] === 'バス停' && bool_(r['採用']); })[0];
  var air = acRows.filter(function (r) { return r['種別'] === '空港' && bool_(r['採用']); })[0];
  out['その他アクセス'] = formatBusStop_(bus);
  out['空港からのアクセス'] = formatAirport_(air, showDist);
  out['周辺施設'] = formatFacilities_(facRows, categories, showDist);
  out['出典表記'] = out['周辺施設'] ? String(settings.attribution || '') : '';
  var t = buildTitleFromResults_(prop, st, facRows, settings);
  out['タイトル'] = t.title;
  out['タイトル文字数'] = t.length;
  out['タイトル注記'] = t.notes.join(' / ');
  out['未確認の要確認件数'] = countUnconfirmed_(facRows, stRows, acRows);
  out['ウェルモJSON'] = JSON.stringify(buildWellmoData_(prop, out, st));
  out['生成日時'] = formatJst_();
  return out;
}
