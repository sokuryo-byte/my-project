/**
 * ============================================================
 *  謄本（登記事項証明書）の読み取り
 * ============================================================
 *  1) アップロードされた謄本（PDF・画像）を Google ドライブの OCR で文字にする
 *  2) 決まったパターン（「所在」「○番○ 畑 496」など）に当てはまる部分だけを取り出す
 *  AI による推測はしません。読み取れなかった項目は空欄のまま返し、
 *  画面では「謄本から読取・要確認」と表示して、必ず人が確認する前提です。
 *
 *  ※Apps Script の「サービス」で Drive API（v3）を有効にしておく必要があります
 *    （appsscript.json に設定済み）。
 */

/** 地目として認識する語（長い語を先に並べる：「用悪水路」と「水路」などの誤一致を防ぐ） */
const TOHON_CHIMOKU_WORDS = [
  '公衆用道路', '用悪水路', '学校用地', '鉄道用地', '水道用地', '境内地', '雑種地', '保安林', 'ため池',
  '宅地', '山林', '原野', '牧場', '池沼', '墓地', '井溝', '鉱泉地', '塩田', '運河用地', '堤', '田', '畑',
];

/**
 * 一時フォルダ内の謄本ファイルを読み取る。
 * @param {string} fileId アップロード済みファイルのID（一時フォルダ内のものに限る）
 * @return {{lots: Array<{address:string, lotNumber:string, chimoku:string, chimokuRaw:string, area:string}>, message:string}}
 */
function readTohonFile_(fileId) {
  const file = getPendingFileOrNull_(fileId);
  if (!file) throw new Error('読み取るファイルが見つかりません。');

  const text = ocrToText_(file);
  const lots = parseTohonText_(text);
  return {
    lots: lots,
    message: lots.length
      ? lots.length + '件の物件を読み取りました。内容を必ず確認してください。'
      : '謄本から所在・地番を読み取れませんでした。手入力してください。',
  };
}

/** ドライブの OCR で文字を取り出す（変換用に作った一時ドキュメントは必ず削除） */
function ocrToText_(file) {
  const doc = Drive.Files.copy(
    { name: 'OCR_' + file.getName(), mimeType: 'application/vnd.google-apps.document', parents: [getPendingFolder_().getId()] },
    file.getId(),
    { ocrLanguage: 'ja' }
  );
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    DriveApp.getFileById(doc.id).setTrashed(true);
  }
}

/**
 * OCR の文字から物件（所在・地番・地目・地積）を取り出す。
 * 1つのファイルに複数の謄本が入っている場合は「表題部」ごとに分けて読む。
 * 変更履歴がある場合は、最後の行（最新の記載）を採用する。
 * ※抹消事項の下線は OCR では判別できないため、最終行を最新とみなしている。
 */
function parseTohonText_(rawText) {
  const text = normalizeTohonText_(rawText);
  const sections = text.split(/表\s*題\s*部/).slice(1);
  if (!sections.length) sections.push(text);

  const chimokuPattern = TOHON_CHIMOKU_WORDS.join('|');
  // 例）「123番1 畑 496」「123番1 宅地 165 28」「123番 田 1,024」
  const rowRe = new RegExp('(\\d+番(?:\\d+)?)\\s+(' + chimokuPattern + ')\\s+(\\d[\\d,]*)(?:\\s*[:.]?\\s*(\\d{2}))?(?=\\s|$)', 'g');

  const lots = [];
  sections.forEach(function (sec) {
    // 所在：最後に出てくる「所在」行（行政区画変更などで書き換わっている場合に最新を採る）
    let address = '';
    const addrRe = /所\s*在\s+([^\n]+)/g;
    let m;
    while ((m = addrRe.exec(sec)) !== null) {
      const v = cleanTohonAddress_(m[1]);
      if (v) address = v;
    }

    // 地番・地目・地積：最後に一致した行を採用
    let row = null;
    rowRe.lastIndex = 0;
    while ((m = rowRe.exec(sec)) !== null) row = m;
    if (!row && !address) return;

    const chimokuRaw = row ? row[2] : '';
    const area = row ? row[3].replace(/,/g, '') + (row[4] ? '.' + row[4] : '') : '';
    const lot = {
      address: address,
      lotNumber: row ? row[1] : '',
      chimoku: FORM_OPTIONS.chimoku.indexOf(chimokuRaw) >= 0 ? chimokuRaw : (chimokuRaw ? 'その他' : ''),
      chimokuRaw: chimokuRaw,
      area: area,
    };
    const dup = lots.some(function (l) { return l.address === lot.address && l.lotNumber === lot.lotNumber; });
    if (!dup) lots.push(lot);
  });
  return lots;
}

/** 全角英数字・全角スペースを半角にし、改行以外の空白をそろえる */
function normalizeTohonText_(text) {
  return String(text || '')
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/　/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '');
}

/** 所在の値から「余白」や原因・日付の欄を取り除く */
function cleanTohonAddress_(value) {
  return String(value)
    .split(/余白|〔|【|\[|昭和|平成|令和|原因/)[0]
    .replace(/\s+/g, '')
    .trim();
}
