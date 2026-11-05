/**
 * 13_Mysoku.js
 * マイソクPDFの取り込み。
 *
 * 1. PDFをGoogleドライブの変換機能（PDF→Googleドキュメント、日本語OCR）でテキスト化する。
 * 2. 「物件名」「号室名」「所在地」「交通」「駐車場」「設備」などの見出しを固定ルール（正規表現）で読み取る。
 *    AIによる推測・要約は行わない。読み取れなかった項目は空欄のまま残し、メモに記録する。
 * 3. 物件シートの空欄だけを埋める（担当者の手入力は上書きしない）。チェックボックスはONにするだけで、OFFにはしない。
 */

// 見出し（RealNetPro形式のマイソクを基準。文字間の空白「設 備」も許容）
var MYSOKU_LABELS = ['物件種目', '物件名', '号室名', '号室', '所在地', '交通', '建築構造', '間取タイプ', '間取',
  '専有面積', '築年', '現況', '入居時期', '賃料', '共益費', '管理費', '敷金', '礼金', '保証金', '更新料', '契約期間',
  '町内会費', '駐車場', '備考', '設備', '条件', '取引態様', '手数料', '特記事項'];

function labelRegex_(label) {
  return label.split('').join('\\s*');
}

/** 行が見出しで始まっていれば {label, rest} を返す */
function matchLabel_(line) {
  // 長い見出しを優先（「号室名」を「号室」より先に）
  var labels = MYSOKU_LABELS.slice().sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < labels.length; i++) {
    var m = line.match(new RegExp('^' + labelRegex_(labels[i]) + '(?![^\\s:：・])\\s*[:：]?\\s*(.*)$'));
    if (m) return { label: labels[i], rest: m[1].trim() };
    // 「共益費・管理費」のような複合見出し
    var m2 = line.match(new RegExp('^' + labelRegex_(labels[i]) + '[・/][^\\s]*\\s+(.*)$'));
    if (m2) return { label: labels[i], rest: m2[1].trim() };
  }
  return null;
}

/**
 * Googleドキュメント変換では、表の複数の項目が1行に並ぶことがある
 * （例:「物件種目 [住居用] マンション 物件名 名信ビル」）。行の途中の見出しの前で改行を入れる。
 */
function breakInlineLabels_(text) {
  var labels = MYSOKU_LABELS.slice().sort(function (a, b) { return b.length - a.length; }).map(labelRegex_);
  var re = new RegExp('[ \\t\u3000]+(' + labels.join('|') + ')(?=[ \\t\u3000:：]|$)', 'gm');
  return text.replace(re, '\n$1');
}

/** テキストを見出しごとのブロックに分ける（同じ見出しは最初の1つ） */
function splitMysokuSections_(text) {
  var lines = breakInlineLabels_(nfkc_(text)).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });
  var sections = {};
  var current = null;
  lines.forEach(function (line) {
    var lm = matchLabel_(line);
    if (lm) {
      current = sections[lm.label] ? null : lm.label; // 2回目以降の同名見出しは無視
      if (current) sections[current] = lm.rest ? [lm.rest] : [];
      return;
    }
    if (current) sections[current].push(line);
  });
  return sections;
}

function firstValue_(sections, label) {
  var s = sections[label];
  return s && s.length ? s[0] : '';
}

/**
 * マイソクのテキストを解析する（純粋関数）。
 * @return {{fields:Object, stations:Array, equipment:Object, notes:string[]}}
 */
function parseMysokuText_(text) {
  var sec = splitMysokuSections_(text);
  var notes = [];
  var fields = {};

  var name = firstValue_(sec, '物件名');
  if (name) fields['物件名'] = name;

  var room = firstValue_(sec, '号室名') || firstValue_(sec, '号室');
  room = room.replace(/\(.*?\)/g, '').replace(/号室$/, '').trim();
  if (room) fields['号室'] = room;

  var kind = firstValue_(sec, '物件種目');
  var kindM = kind.match(/マンション|アパート|一戸建|戸建/);
  if (kindM) fields['物件種別'] = kindM[0] === 'マンション' || kindM[0] === 'アパート' ? kindM[0] : '一戸建て';
  else if (kind) fields['物件種別'] = 'その他';

  // 郵便番号は所在地の前の行に出ることもあるので、所在地欄→本文全体の順に探す
  var postal = (sec['所在地'] || []).join(' ').match(/〒?\s*(\d{3})-?(\d{4})/) || nfkc_(text).match(/〒\s*(\d{3})-?(\d{4})/);
  if (postal) fields['郵便番号'] = postal[1] + '-' + postal[2];

  var struct = (sec['建築構造'] || []).join(' ');
  if (struct) {
    var code = /鉄骨鉄筋|SRC/.test(struct) ? 'SRC' : /鉄筋コンクリート|RC/.test(struct) ? 'RC'
      : /軽量鉄骨/.test(struct) ? '軽量鉄骨' : /鉄骨|S造/.test(struct) ? 'S' : /木造/.test(struct) ? '木造' : 'その他';
    fields['建物構造'] = code;
    var above = struct.match(/地上\s*(\d+)\s*階/) || struct.match(/(\d+)\s*階建/);
    if (above) fields['地上階数'] = Number(above[1]);
    var below = struct.match(/地下\s*(\d+)\s*階/);
    fields['地下階数'] = below ? Number(below[1]) : (above ? 0 : '');
    var units = struct.match(/総戸数\s*(\d+)\s*戸/);
    if (units) fields['総戸数'] = Number(units[1]);
  }
  var built = firstValue_(sec, '築年').match(/(\d{4})\s*年\s*(\d{1,2})?/);
  if (built) {
    fields['築年'] = Number(built[1]);
    if (built[2]) fields['築月'] = Number(built[2]);
  }

  var addrLines = (sec['所在地'] || []).filter(function (l) { return !/^〒?\s*\d{3}-?\d{4}$/.test(l); });
  var addr = '';
  for (var i = 0; i < addrLines.length; i++) {
    if (/(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.test(addrLines[i])) { addr = addrLines[i]; break; }
  }
  addr = addr.replace(/〒?\s*\d{3}-?\d{4}/, '')
    .replace(/\s+\S*「[^」]+」.*$/, '') // 交通の行が同じ行に入り込んだ場合は除く
    .trim();
  if (addr) fields['住所'] = addr;

  // 交通: 「路線「駅」徒歩n分」形式。バス停（「停」「バス」を含む）は除外
  var stations = [];
  // 交通の1行目が所在地の行に入り込むことがあるので、所在地欄も対象にする（文書の順）
  (sec['所在地'] || []).concat(sec['交通'] || []).forEach(function (line) {
    var re = /([^\s「」\/]*?)\s*「([^」]+)」\s*(駅|停|停留所)?\s*(?:から)?\s*(?:徒歩|歩)\s*(\d+)\s*分/g;
    var m;
    while ((m = re.exec(line)) !== null) {
      if (/停/.test(m[3] || '') || /バス/.test(m[1])) continue;
      stations.push({ line: m[1].trim(), name: m[2].trim(), minutes: Number(m[4]) });
    }
  });
  if (!stations.length) notes.push('交通（駅）を読み取れない');

  // 駐車場
  var parkingText = firstValue_(sec, '駐車場');
  var parking = null;
  if (/^(有|あり|空(き)?(有|あり)|敷地内)/.test(parkingText)) parking = true;
  else if (/^(なし|無|無し|-)/.test(parkingText)) parking = false;
  else if (parkingText) notes.push('駐車場の記載を確認: ' + parkingText);

  // 設備（改行で単語が分かれることがあるので連結して判定）。角部屋などは備考にも書かれるため備考も対象
  var equipText = (sec['設備'] || []).concat(sec['備考'] || []).join('');
  var eq = {
    '駐車場': parking === true,
    'バストイレ別': /バス\s*[・･]?\s*トイレ\s*別/.test(equipText),
    '独立洗面台': /洗面台\s*\(\s*独立\s*\)|独立洗面/.test(equipText),
    '無料Wi-Fi': /インターネット(使用料)?無料|無料インターネット|Wi-?Fi\s*無料|無料\s*Wi-?Fi/i.test(equipText),
    '角部屋': /角部屋/.test(equipText),
    'リフォーム済': /リフォーム/.test(equipText),
    'オートロック': /オートロック/.test(equipText),
    'エレベーター': /エレベータ/.test(equipText),
    '宅配BOX': /宅配\s*(ボックス|BOX|ロッカー)/i.test(equipText),
    '自転車駐輪可能': /駐輪/.test(equipText),
    '防犯カメラ': /防犯カメラ/.test(equipText),
    'コンシェルジュ': /コンシェルジュ/.test(equipText),
    '自動販売機': /自動販売機|自販機/.test(equipText),
    'TVドアホン': /(TV|テレビ)\s*(モニター)?\s*(付き?)?\s*(インターホン|ドアホン)|モニター\s*付き?\s*(インターホン|ドアホン)/i.test(equipText),
    'ゴミ捨て場': /(ゴミ|ごみ)\s*(置場|置き場|捨て場|ステーション)|24時間\s*(ゴミ|ごみ)出し/.test(equipText)
  };
  if (/USEN/i.test(equipText)) fields['Wi-Fiサービス名'] = 'USEN AIR';
  if (!sec['設備']) notes.push('設備欄を読み取れない');

  // 洋室の帖数（間取図が画像の場合は読み取れないことがある）
  var maxJo = null;
  var reJo = /洋(?:室)?\s*(\d+(?:\.\d+)?)\s*(?:帖|畳|J)/g;
  var mj;
  var all = nfkc_(text);
  while ((mj = reJo.exec(all)) !== null) {
    var v = Number(mj[1]);
    if (maxJo == null || v > maxJo) maxJo = v;
  }
  if (maxJo != null) fields['最大洋室帖数'] = maxJo;
  else notes.push('洋室の帖数を読み取れない（間取図を確認）');

  return { fields: fields, stations: stations.slice(0, 3), equipment: eq, notes: notes };
}

/**
 * 物件シートに反映する差分を作る（純粋関数）。空欄の項目だけを埋める。
 * @return {{patch:Object, filled:string[], skipped:string[]}}
 */
function mysokuPatch_(prop, parsed) {
  var patch = {};
  var filled = [];
  var skipped = [];
  var isBlank = function (v) { return v === '' || v == null; };
  var setIfBlank = function (col, val) {
    if (val === '' || val == null) return;
    if (isBlank(prop[col])) { patch[col] = val; filled.push(col); }
    else if (String(prop[col]) !== String(val)) skipped.push(col + '（入力済: ' + prop[col] + ' / マイソク: ' + val + '）');
  };
  setIfBlank('物件名', parsed.fields['物件名']);
  setIfBlank('建物名', parsed.fields['物件名']);
  setIfBlank('ふりがな', kanaFromName_(parsed.fields['物件名']));
  setIfBlank('エリア', parsed.fields['住所'] ? areaFromAddress_(parsed.fields['住所'], { wardCities: ['名古屋市'], otherStyle: '県+市' }) : '');
  setIfBlank('号室', parsed.fields['号室']);
  setIfBlank('住所', parsed.fields['住所']);
  setIfBlank('最大洋室帖数', parsed.fields['最大洋室帖数']);
  setIfBlank('Wi-Fiサービス名', parsed.fields['Wi-Fiサービス名']);
  ['物件種別', '郵便番号', '建物構造', '地上階数', '地下階数', '総戸数', '築年', '築月'].forEach(function (k) {
    setIfBlank(k, parsed.fields[k]);
  });

  var stationsBlank = [1, 2, 3].every(function (i) { return isBlank(prop['マイソク駅' + i + '_駅名']); });
  if (stationsBlank && parsed.stations.length) {
    parsed.stations.forEach(function (s, i) {
      patch['マイソク駅' + (i + 1) + '_駅名'] = s.name;
      patch['マイソク駅' + (i + 1) + '_路線'] = s.line;
      patch['マイソク駅' + (i + 1) + '_徒歩分'] = s.minutes;
    });
    filled.push('マイソク駅' + parsed.stations.length + '件');
  } else if (parsed.stations.length) {
    skipped.push('マイソク駅（入力済）');
  }

  Object.keys(parsed.equipment).forEach(function (col) {
    if (parsed.equipment[col] && !bool_(prop[col])) { patch[col] = true; filled.push(col); }
  });
  return { patch: patch, filled: filled, skipped: skipped };
}

/* ---------------- GAS（Drive） ---------------- */

/** URL・ファイルIDの文字列からIDを取り出す */
function driveFileId_(s) {
  var str = String(s || '').trim();
  var m = str.match(/\/d\/([-\w]{20,})/) || str.match(/[?&]id=([-\w]{20,})/);
  if (m) return m[1];
  return /^[-\w]{20,}$/.test(str) ? str : '';
}

/**
 * PDFをGoogleドキュメントに変換してテキストを取り出し、一時ドキュメントは削除する。
 * 要: 拡張サービス「Drive API (v3)」
 */
function pdfToText_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var tmp = Drive.Files.create(
    { name: '[一時]マイソク変換_' + file.getName(), mimeType: 'application/vnd.google-apps.document' },
    file.getBlob(),
    { ocrLanguage: 'ja', supportsAllDrives: true, fields: 'id' }
  );
  try {
    return DocumentApp.openById(tmp.id).getBody().getText();
  } finally {
    try {
      Drive.Files.remove(tmp.id, { supportsAllDrives: true });
    } catch (e) {
      DriveApp.getFileById(tmp.id).setTrashed(true);
    }
  }
}

/** 物件シートの1行にマイソクを取り込む */
function importMysokuForRow_(prop) {
  var fileId = driveFileId_(prop['マイソクPDF']);
  if (!fileId) throw new Error('「マイソクPDF」列にPDFのURLまたはファイルIDがありません');
  var text = pdfToText_(fileId);
  var parsed = parseMysokuText_(text);
  var r = mysokuPatch_(prop, parsed);
  var memo = [];
  if (r.filled.length) memo.push('反映: ' + r.filled.join('、'));
  if (r.skipped.length) memo.push('入力済のため未反映: ' + r.skipped.join('、'));
  if (parsed.notes.length) memo.push('要確認: ' + parsed.notes.join('、'));
  r.patch['マイソク取込日時'] = formatJst_();
  r.patch['マイソク取込メモ'] = memo.join(' / ') || '反映する項目なし';
  updateRow_(SHEETS.PROPERTIES, prop._row, r.patch);
  return r;
}

/** マイソクフォルダ内の未登録PDFを新しい物件行として追加し、取り込む */
function importMysokuFolder_(settings, startMs) {
  var folderId = driveFileId_(settings.mysoku_folder_id) || String(settings.mysoku_folder_id || '').trim();
  var m = String(settings.mysoku_folder_id || '').match(/folders\/([-\w]{20,})/);
  if (m) folderId = m[1];
  if (!folderId) throw new Error('設定「mysoku_folder_id」にマイソクPDFを置くフォルダのURLまたはIDを入力してください');
  var t = readTable_(SHEETS.PROPERTIES);
  var known = {};
  t.rows.forEach(function (r) { var id = driveFileId_(r['マイソクPDF']); if (id) known[id] = true; });
  var it = DriveApp.getFolderById(folderId).getFilesByType('application/pdf');
  var results = [];
  while (it.hasNext()) {
    if (Date.now() - startMs > MAX_EXEC_MS) { results.push('（時間切れのため中断。再実行してください）'); break; }
    var f = it.next();
    if (known[f.getId()]) continue;
    var prop = addPropertyRowForFile_(f);
    var rowNum = prop._row;
    try {
      importMysokuForRow_(prop);
      results.push(f.getName() + ': 取込済');
    } catch (e) {
      updateRow_(SHEETS.PROPERTIES, rowNum, { 'マイソク取込メモ': 'エラー: ' + e.message });
      results.push(f.getName() + ': エラー ' + e.message);
    }
  }
  return results;
}

/** 物件シートの次の空き行（未チェックのチェックボックスだけの行は空き行とみなす） */
function nextEmptyPropertyRow_() {
  var rows = readTable_(SHEETS.PROPERTIES).rows;
  var last = 1;
  rows.forEach(function (r) { if (r._row > last) last = r._row; });
  return last + 1;
}

/** PDFファイル1件分の物件行を追加（物件IDも採番） */
function addPropertyRowForFile_(file) {
  var sh = sheet_(SHEETS.PROPERTIES);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var rowNum = nextEmptyPropertyRow_();
  var id = 'P' + ('0000' + rowNum).slice(-5);
  var row = headers.map(function (h) {
    if (h === 'マイソクPDF') return file.getUrl();
    if (h === '物件ID') return id;
    return (CHECKBOX_COLUMNS[SHEETS.PROPERTIES] || []).indexOf(h) >= 0 ? false : '';
  });
  sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);
  applyCheckboxes_(sh, headers, SHEETS.PROPERTIES, rowNum, 1);
  var prop = { _row: rowNum };
  headers.forEach(function (h, i) { prop[h] = row[i]; });
  return prop;
}
