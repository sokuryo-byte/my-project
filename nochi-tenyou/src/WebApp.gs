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
  ensureSetup_();
  runMigrations_();
  const params = (e && e.parameter) || {};
  if (params.page === 'admin') {
    if (!isAdmin_()) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:sans-serif;padding:24px">管理画面を表示する権限がありません。' +
        '行政班の担当者にお問い合わせください。</p>').setTitle('権限がありません');
    }
    const t = HtmlService.createTemplateFromFile('Admin');
    t.initialId = String(params.id || '').replace(/\D/g, ''); // 通知のリンクから開いた案件
    t.portalUrl = PORTAL_URL;
    return t.evaluate()
      .setTitle('農地転用 案件管理（行政班）')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const index = HtmlService.createTemplateFromFile('Index');
  index.portalUrl = PORTAL_URL;
  return index.evaluate()
    .setTitle('農地転用 見積・調査依頼フォーム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // 社内ポータル（Google サイト等）のページに埋め込めるようにする。
    // アクセスできる人は Webアプリのデプロイ設定（組織内のみ）で制限されている。管理画面は埋め込み不可のまま。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 初回アクセス時に、シートやフォルダが無ければ自動で初期セットアップする。
 * （エディタで setupSpreadsheet を実行する手順を省くため。2回目以降はシートの有無を見るだけ）
 */
function ensureSetup_() {
  if (getSpreadsheet_().getSheetByName(SHEET_NAMES.CASES)) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    if (!getSpreadsheet_().getSheetByName(SHEET_NAMES.CASES)) setupSpreadsheet();
  } finally {
    lock.releaseLock();
  }
}

/**
 * デプロイ後に1回だけ行う更新（画面が開かれたときに実行）。
 *  ・料金表の改定：FEE_TABLE_VERSION が変わったら「見積設定」シートを DEFAULT_FEES の値で上書き
 */
function runMigrations_() {
  const props = PropertiesService.getScriptProperties();
  runFeePatches_(props);
  if (props.getProperty('CASE_NO_DONE') !== '1') {
    const lock = LockService.getScriptLock();
    lock.waitLock(30 * 1000);
    try {
      if (props.getProperty('CASE_NO_DONE') !== '1') { fillCaseNos_(); props.setProperty('CASE_NO_DONE', '1'); }
    } finally {
      lock.releaseLock();
    }
  }
  if (props.getProperty('FEE_TABLE_VERSION') === FEE_TABLE_VERSION) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    if (props.getProperty('FEE_TABLE_VERSION') !== FEE_TABLE_VERSION) { // 他の人が先に実行していないか再確認
      const sheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.FEES);
      ensureHeaders_(sheet, FEE_HEADERS);
      addMissingFeeRows_(sheet);
      const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
      DEFAULT_FEES.forEach(function (d) {
        const i = keys.indexOf(d.key);
        if (i >= 0) sheet.getRange(i + 2, 2, 1, 3).setValues([[d.label, d.amount, d.note]]);
      });
      props.setProperty('FEE_TABLE_VERSION', FEE_TABLE_VERSION);
    }
  } finally {
    lock.releaseLock();
  }
}

/** 料金の個別修正（FEE_PATCHES）のうち、まだ適用していない版を適用する */
function runFeePatches_(props) {
  const done = String(props.getProperty('FEE_PATCHES_DONE') || '').split(',').filter(String);
  const todo = Object.keys(FEE_PATCHES).filter(function (v) { return done.indexOf(v) < 0; });
  if (!todo.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    const sheet = getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.FEES);
    ensureHeaders_(sheet, FEE_HEADERS);
    addMissingFeeRows_(sheet);
    const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
    todo.forEach(function (v) {
      FEE_PATCHES[v].forEach(function (entry) {
        const labelOnly = /:label$/.test(entry); // 「キー:label」は名称と適用条件だけ更新し、金額（設定で変えたもの）は残す
        const key = entry.replace(/:label$/, '');
        const d = DEFAULT_FEES.filter(function (f) { return f.key === key; })[0];
        const i = keys.indexOf(key);
        if (d && i >= 0) {
          sheet.getRange(i + 2, 2).setValue(d.label);
          sheet.getRange(i + 2, 4).setValue(d.note);
          if (!labelOnly) sheet.getRange(i + 2, 3).setValue(d.amount);
        }
      });
      done.push(v);
    });
    sheet.getRange(1, 3).setValue(FEE_HEADERS[2]); // 見出し（報酬は税抜）を最新に
    props.setProperty('FEE_PATCHES_DONE', done.join(','));
  } finally {
    lock.releaseLock();
  }
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
    maxLots: MAX_LOTS,
    master: getMasterList_(),
    municipalities: MUNICIPALITIES,
    nogyoIinkai: NOGYO_IINKAI,
    noCityPlanningTax: NO_CITY_PLANNING_TAX,
    fees: getFeeSettings_(), // 画面で概算見積を即時計算するための料金（見積設定シート）
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
  try {
    return saveUploadedFile_(file);
  } catch (e) {
    logError_('uploadAttachment', e, file && file.name);
    throw e;
  }
}

/** アップロードを取り消す（一時フォルダ内のファイルのみ削除可能） */
function removeAttachment(fileId) {
  return trashPendingFile_(fileId);
}

/**
 * アップロード済みの謄本を読み取り、物件の候補を返す。
 * 読み取りに失敗しても例外にはせず、メッセージを返す（手入力で続けられるように）。
 */
function readTohon(fileId) {
  try {
    return readTohonFile_(fileId);
  } catch (e) {
    logError_('readTohon', e, 'fileId=' + fileId);
    return { lots: [], message: '謄本を読み取れませんでした（' + (e && e.message || e) + '）。手入力してください。' };
  }
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
  const summary = summarizeLots_(input.lots);

  // 1) 保存（通知より先に保存し、以降が失敗しても記録が残るようにする）
  const saved = appendCase_(Object.assign({}, summary, {
    receivedAt: new Date(),
    requesterName: input.requesterName,
    plan: input.plan,
    documents: input.documents.join(','),
    estimate: estimate.ok ? estimate.total : '',
    requestFlag: isRequest,
    prefecture: input.prefecture,
    waterAssociation: summary.localConsent,
    purpose: input.purpose,
    trust: input.trust,
    extraLotFee: input.lots.length > 1 ? (input.extraLotFee ? 'あり' : 'なし') : '',
    localConsentNote: summary.localContacts,
    estimateDetail: estimateToText_(estimate),
    submittedBy: input.submittedBy,
    notifyResult: isRequest ? '送信中' : '通知なし（保存のみ）',
    status: CASE_STATUSES[0],
    updatedAt: new Date(),
    lotCount: input.lots.length,
  }));
  appendLots_(saved.id, input.lots.map(function (l) {
    return {
      address: l.address, lotNumber: l.lotNumber, chimoku: l.chimoku, area: l.area === null ? '' : l.area,
      zone: l.zone, isNoshin: toSheetBool_(l.isNoshin), landUse: l.landUseText,
      isConverted: toSheetBool_(l.isConverted), landImprovement: l.landImprovement,
      kairyoName: l.kairyoName, kairyoTel: l.kairyoTel, kairyoBenefit: l.kairyoBenefit, kairyoProcedure: l.kairyoProcedure,
      kairyoSettlement: l.kairyoSettlement, kairyoSettlementNote: l.kairyoSettlementNote, kairyoFee: l.kairyoFee,
      iinStamp: l.iinStamp, iinContacts: contactsToText_(l.iinContacts),
      localConsent: l.localConsent, localContacts: contactsToText_(l.localContacts),
      prefecture: l.prefecture, purpose: l.purpose,
      tenyoRireki: l.tenyoRireki, rirekiDate: l.rirekiDate, rirekiNo: l.rirekiNo, rirekiNote: l.rirekiNote,
      shimatsusho: l.shimatsusho, shimatsuStamp: l.shimatsuStamp, shimatsuNote: l.shimatsuNote,
      saiShinsei: l.saiShinsei, saiShinseiNote: l.saiShinseiNote,
      chimokuHenko: l.chimokuHenko ? 'はい' : '',
      tenyoKanou: l.tenyoKanou, noutiKubun: l.noutiKubun, kanouNote: l.kanouNote,
      jogaiKanou: l.jogaiKanou, hojoKuiki: l.hojoKuiki, hojo8nen: l.hojo8nen, jogaiJisseki: l.jogaiJisseki,
      jogaiUketsuke: l.jogaiUketsuke, tenyoUketsuke: l.tenyoUketsuke, jogaiNote: l.jogaiNote,
      drainAdjacent: l.drainAdjacent, drainConsent: l.drainConsent,
      drainName: l.drainName, drainTel: l.drainTel, drainFee: l.drainFee,
      drainLocalConsent: l.drainLocalConsent, drainContacts: contactsToText_(l.drainContacts),
      municipality: l.municipality, readFromTohon: l.readFromTohon ? '謄本から読取' : '',
    };
  }));

  // 2) 資料フォルダの作成とファイル移動（失敗しても案件は残す）
  let attach = { folderUrl: '', count: 0, errors: [] };
  try {
    attach = attachFilesToCase_(saved.caseNo, input);
    updateCaseCells_(saved.row, { folderUrl: attach.folderUrl, fileCount: attach.count });
  } catch (e) {
    attach.errors.push('資料フォルダの作成に失敗：' + (e && e.message || e));
  }

  // 3) 通知（依頼の場合のみ）→ 結果をシートに書き戻す
  let notify = { ok: false, message: '通知なし（保存のみ）' };
  if (isRequest) {
    notify = postToChat_(buildRequestMessage_(saved.id, input, estimate, saved.url, attach, saved.caseNo));
    updateCaseCell_(saved.row, 'notifyResult', notify.ok ? '送信済み' : '失敗：' + notify.message);
  }

  return {
    id: saved.id,
    caseNo: saved.caseNo,
    estimate: estimate,
    notified: notify.ok,
    notifyMessage: notify.message,
    fileCount: attach.count,
    attachErrors: attach.errors,
  };
}

/**
 * 複数物件を、案件一覧の1行に載せるための「まとめ」にする。
 * 物件ごとの正確な値は物件明細シートにある。
 */
function summarizeLots_(lots) {
  const uniq = function (key) {
    return lots.map(function (l) { return l[key]; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('・');
  };
  const any = function (key, value) { return lots.some(function (l) { return l[key] === value; }); };
  const areas = lots.map(function (l) { return l.area; }).filter(function (a) { return a !== null; });
  const triState = function (key) {
    if (any(key, 'はい')) return true;
    if (any(key, '分からない')) return '不明';
    if (lots.length && lots.every(function (l) { return l[key] === 'いいえ'; })) return false;
    return '';
  };
  return {
    address: lots.length ? lots[0].address + (lots.length > 1 ? ' 他' + (lots.length - 1) + '件' : '') : '',
    lotNumber: lots.map(function (l) { return l.lotNumber; }).join('、'),
    chimoku: uniq('chimoku'),
    area: areas.length ? Math.round(areas.reduce(function (s, a) { return s + a; }, 0) * 100) / 100 : '',
    zone: uniq('zone'),
    isNoshin: triState('isNoshin'),
    landUse: uniq('landUseText'),
    isConverted: triState('isConverted'),
    landImprovement: any('landImprovement', 'はい') ? 'はい' : any('landImprovement', '分からない') ? '分からない' : uniq('landImprovement'),
    municipality: uniq('municipality'),
    // 地元関係者の同意（土地改良区に確認）：必要 ＞ 未確認 ＞ 不要
    localConsent: any('localConsent', '必要') ? '必要' : any('localConsent', '未確認') ? '未確認' : uniq('localConsent'),
    localContacts: lots.map(function (l) { return contactsToText_(l.localContacts); })
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('\n'),
  };
}

/** 金額の数値（数字以外・負数は0） */
function numOrZero_(v) {
  const n = Number(String(v === undefined || v === null ? '' : v).replace(/[,，円¥\s]/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
}

/** 金額 → 「300,000円」（数字以外は空文字） */
function yenText_(v) {
  const s = String(v === undefined || v === null ? '' : v).replace(/[,，円¥\s]/g, '');
  const n = Number(s);
  return s !== '' && !isNaN(n) && n >= 0 ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円' : '';
}

/**
 * 決済金の表示。単価（㎡・ha）の場合は物件の面積から概算の総額も添える。
 * 例：「1㎡あたり 300円（496㎡ → 約148,800円）」「300,000円」
 */
function settlementText_(amount, unit, area) {
  const yen = yenText_(amount);
  if (!yen) return '';
  if (unit !== '㎡あたり' && unit !== 'haあたり') return yen;
  const n = Number(String(amount).replace(/[,，円¥\s]/g, ''));
  const total = area > 0 ? (unit === '㎡あたり' ? n * area : n * area / 10000) : null;
  return (unit === '㎡あたり' ? '1㎡あたり ' : '1haあたり ') + yen +
    (total !== null ? '（' + area + '㎡ → 約' + yenText_(Math.round(total)) + '）' : '');
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（それ以外は空文字） */
function dateText_(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[1] + '/' + m[2] + '/' + m[3] : '';
}

/** 期間の表示「A～B」（片方だけなら「A～」「～B」） */
function rangeText_(a, b) {
  return a || b ? (a || '') + '～' + (b || '') : '';
}

/** 農地転用の受付：「毎月1日～10日」「毎月5日締切」「締切 2026/10/15」 */
function tenyoUketsukeText_(l) {
  const mode = pick_(l.tenyoUkeMode, FORM_OPTIONS.tenyoUkeModes);
  const day = function (v) { const n = Number(v); return n >= 1 && n <= 31 && Math.floor(n) === n ? n : 0; };
  let base = '';
  if (mode === '締切日を指定') base = dateText_(l.tenyoUkeDate) ? '締切 ' + dateText_(l.tenyoUkeDate) : '';
  else if (mode === '毎月の締切日') base = day(l.tenyoUkeDay) ? '毎月' + day(l.tenyoUkeDay) + '日締切' : '';
  else if (mode === '毎月第○週') {
    const w = pick_(l.tenyoUkeWeek, FORM_OPTIONS.tenyoUkeWeeks);
    const wd = pick_(l.tenyoUkeWeekday, FORM_OPTIONS.weekdays);
    base = w ? '毎月' + w + (wd && wd !== '曜日指定なし' ? 'の' + wd : '') + '締切' : '';
  } else if (mode === '月ごとに異なる（年間計画）') {
    const months = ['4', '5', '6', '7', '8', '9', '10', '11', '12', '1', '2', '3'];
    const list = (Array.isArray(l.tenyoUkeMonths) ? l.tenyoUkeMonths : []).map(function (v, i) {
      return i < 12 && day(v) ? months[i] + '/' + day(v) : '';
    }).filter(String);
    base = list.length ? '月ごとの締切 ' + list.join('・') : '月ごとに締切が異なる（年間計画）';
  } else base = monthlyText_(l.tenyoUkeFrom, l.tenyoUkeTo);
  const hol = pick_(l.tenyoUkeHoliday, FORM_OPTIONS.tenyoUkeHolidays);
  const holText = hol === '前の営業日' || hol === '次の営業日' ? '土日祝は' + hol : hol === '未確認' ? '土日祝の扱い未確認' : '';
  const note = str_(l.tenyoUkeNote, 200);
  return [base, holText, note].filter(String).join('／');
}

/** 農振除外の受付：「年2回（5月・11月）」 */
function jogaiUketsukeText_(kaisu, jiki) {
  const n = Number(kaisu);
  const k = n >= 1 && n <= 12 && Math.floor(n) === n ? '年' + n + '回' : '';
  const j = str_(jiki, 100);
  return k && j ? k + '（' + j + '）' : k || j;
}

/** 毎月の受付期間「毎月1日～10日」（1〜31以外は無視） */
function monthlyText_(from, to) {
  const d = function (v) { const n = Number(v); return n >= 1 && n <= 31 && Math.floor(n) === n ? n + '日' : ''; };
  const t = rangeText_(d(from), d(to));
  return t ? '毎月' + t : '';
}

/** 連絡先の配列 → 「氏名／住所／電話」を1行ずつ並べた文字列 */
function contactsToText_(list) {
  return (list || []).map(function (c) { return [c.name, c.address, c.tel].join('／'); }).join('\n');
}

/** 画面から受け取った連絡先（氏名・住所・電話）を整える。空行は除き、最大 MAX_CONTACTS 件 */
function normalizeContacts_(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (c) { return { name: str_(c && c.name, 50), address: str_(c && c.address, 100), tel: str_(c && c.tel, 20) }; })
    .filter(function (c) { return c.name || c.address || c.tel; })
    .slice(0, MAX_CONTACTS);
}

// ------------------------------------------------------------
// 入力の整形・チェック
// ------------------------------------------------------------

/** 文字列を整える（前後空白の除去・長さ制限） */
function str_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);
}

/** 選択肢に含まれる値だけを通す（それ以外は空文字） */
function pick_(v, list) {
  const s = str_(v);
  return list.indexOf(s) >= 0 ? s : '';
}

/**
 * 画面の入力値を扱いやすい形に整える（前後空白の除去、選択肢外の値の除外など）。
 * 画面側の値を信用しすぎないよう、サーバー側で必ずここを通す。
 */
function normalizeInput_(form) {
  const f = form || {};
  const prefecture = str_(f.prefecture, 10) || DEFAULT_PREFECTURE;

  // アップロード済みファイル（ID と資料種別）
  const attachments = (Array.isArray(f.attachments) ? f.attachments : [])
    .map(function (a) { return { fileId: str_(a && a.fileId, 100), docType: pick_(a && a.docType, FORM_OPTIONS.documents) }; })
    .filter(function (a) { return a.fileId && a.docType; })
    .slice(0, 50);

  // 資料 ＝ ファイルをアップロードした種別
  const uploaded = attachments.map(function (a) { return a.docType; });
  const docsOther = str_(f.documentsOther, 100);
  const documents = FORM_OPTIONS.documents
    .filter(function (d) { return uploaded.indexOf(d) >= 0; })
    .map(function (d) { return d === 'その他' && docsOther ? 'その他（' + docsOther + '）' : d; });

  const master = getMasterList_();
  const lots = (Array.isArray(f.lots) ? f.lots : [])
    .slice(0, MAX_LOTS)
    .map(function (l) {
      // 都道府県は物件ごと（未指定なら案件の都道府県）
      const lp = str_(l && l.prefecture, 10) || prefecture;
      return Object.assign(normalizeLot_(l || {}, lp, master), { prefecture: lp });
    });

  return {
    requesterName: str_(f.requesterName, 50),
    trust: f.trust === true,
    extraLotFee: f.extraLotFee === true, // 筆数加算をするか（1申請で足りるなら加算しない）
    prefecture: prefecture,
    lots: lots,
    plan: str_(f.plan, 1000),
    // 転用目的は物件ごと（調整区域のみ）。案件には各物件の目的をまとめて記録
    purpose: lots.map(function (l) { return l.purpose; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('・'),
    documents: documents,
    attachments: attachments,
    submittedBy: getUserEmail_(),
  };
}

/** 物件1件分の入力を整える */
function normalizeLot_(l, prefecture, master) {
  // 画面は「市区町村」と「所在・地番（町名・字〜地番）」の2欄。
  // シートには 所在＝市区町村＋町名・字、地番＝末尾の地番 に分けて保存する（末尾の数字部分を切り出すだけ・推測なし）
  let municipality = str_(l.municipality, 50);
  if (municipality.indexOf(prefecture) === 0) municipality = municipality.slice(prefecture.length).trim();
  let place = str_(l.address);
  if (place.indexOf(prefecture) === 0) place = place.slice(prefecture.length).trim();
  if (municipality && place.indexOf(municipality) === 0) place = place.slice(municipality.length).trim(); // 市区町村を重ねて入力した場合
  const split = splitLotNumber_(place);
  const convOn = pick_(l.isConverted, FORM_OPTIONS.yesNo) === 'はい';
  // 過去の転用許可・届出の履歴（現況にかかわらず聞く）。履歴があれば以降（除外・見込み・土地改良区など）は聞かない。
  // ただし現況が未転用で、農業委員会から「再度の許可・届出が必要」と回答があった場合は続ける
  const rirekiAns = pick_(l.tenyoRireki, FORM_OPTIONS.tenyoRireki);
  const rirekiOn = rirekiAns === 'あり';
  const saiShinsei = rirekiOn && !convOn ? pick_(l.saiShinsei, FORM_OPTIONS.saiShinsei) : '';
  const go = !rirekiOn || saiShinsei === '必要';
  const kairyoOn = go && pick_(l.landImprovement, FORM_OPTIONS.yesNoUnknown) === 'はい';
  const benefitOn = kairyoOn && pick_(l.kairyoBenefit, FORM_OPTIONS.kairyoBenefit) === '該当する';
  const permitZone = go && PERMIT_ZONES.indexOf(pick_(l.zone, FORM_OPTIONS.zones)) >= 0; // 許可が必要な区域
  const jogaiOn = go && pick_(l.zone, FORM_OPTIONS.zones) !== '市街化区域' &&
    ['はい', '分からない'].indexOf(pick_(l.isNoshin, FORM_OPTIONS.yesNoUnknown)) >= 0; // 青地（または不明）
  const purpose = pick_(l.zone, FORM_OPTIONS.zones) === '市街化調整区域' ? pick_(l.purpose, FORM_OPTIONS.purposes) : '';
  const drainOn = go && purpose === '分家住宅';
  const shimatsuOn = convOn && !rirekiOn && pick_(l.shimatsusho, FORM_OPTIONS.shimatsusho) === '必要';                                        // 分家住宅は排水先を確認
  const drainConsentOn = drainOn && pick_(l.drainConsent, FORM_OPTIONS.drainConsent) === '必要';
  const drainLocalOn = drainConsentOn && pick_(l.drainLocalConsent, FORM_OPTIONS.localConsent) === '必要';

  const areaText = str_(l.area).replace(/[,，]/g, '');
  const landUse = pick_(l.landUse, FORM_OPTIONS.landUses);
  const landUseOther = str_(l.landUseOther, 100);

  return {
    address: municipality + split.place,
    municipality: municipality,
    lotNumber: split.lotNumber.slice(0, 100),
    chimoku: pick_(l.chimoku, FORM_OPTIONS.chimoku),
    area: areaText === '' ? null : Number(areaText),
    zone: pick_(l.zone, FORM_OPTIONS.zones),
    isNoshin: pick_(l.isNoshin, FORM_OPTIONS.yesNoUnknown),
    landUse: landUse,
    // シートには「選択肢（補足）」の形で保存する
    landUseText: landUseOther ? (landUse ? landUse + '（' + landUseOther + '）' : landUseOther) : landUse,
    isConverted: pick_(l.isConverted, FORM_OPTIONS.yesNo),
    landImprovement: go ? pick_(l.landImprovement, FORM_OPTIONS.yesNoUnknown) : '',
    readFromTohon: l.readFromTohon === true,
    chimokuHenko: l.chimokuHenko === true,
    // 土地改良区への電話確認の結果（「はい（かかっている）」のときだけ保存）
    kairyoName: kairyoOn ? str_(l.kairyoName, 100) : '',
    kairyoTel: kairyoOn ? str_(l.kairyoTel, 20) : '',
    kairyoBenefit: kairyoOn ? pick_(l.kairyoBenefit, FORM_OPTIONS.kairyoBenefit) : '',
    // 受益地に該当する場合だけ：手続きの要否・決済金（決済金が「必要」のときだけ金額）
    kairyoProcedure: benefitOn ? pick_(l.kairyoProcedure, FORM_OPTIONS.kairyoProcedure) : '',
    kairyoSettlement: benefitOn ? pick_(l.kairyoSettlement, FORM_OPTIONS.kairyoSettlement) : '',
    kairyoSettlementNote: benefitOn && pick_(l.kairyoSettlement, FORM_OPTIONS.kairyoSettlement) === '必要'
      ? settlementText_(l.kairyoSettlementNote, pick_(l.kairyoSettlementUnit, FORM_OPTIONS.settlementUnits), areaText === '' ? null : Number(areaText)) : '',
    // 決済金とは別の手数料など（金額・内容）
    kairyoFee: benefitOn && yenText_(l.kairyoFeeAmount)
      ? [(pick_(l.kairyoFeeUnit, FORM_OPTIONS.kairyoFeeUnits) || '1申請あたり') + ' ' + yenText_(l.kairyoFeeAmount), str_(l.kairyoFeeNote, 100)].filter(String).join('／')
      : '',
    // 見積（実費）の計算用の数値
    settlementAmount: benefitOn && pick_(l.kairyoSettlement, FORM_OPTIONS.kairyoSettlement) === '必要' ? numOrZero_(l.kairyoSettlementNote) : 0,
    settlementUnit: pick_(l.kairyoSettlementUnit, FORM_OPTIONS.settlementUnits) || '総額',
    kairyoFeeAmount: benefitOn ? numOrZero_(l.kairyoFeeAmount) : 0,
    kairyoFeeUnit: pick_(l.kairyoFeeUnit, FORM_OPTIONS.kairyoFeeUnits) || '1申請あたり',
    // 地元の農業委員・推進委員の押印（「必要」のときだけ氏名・連絡先を保存）
    iinStamp: go ? pick_(l.iinStamp, FORM_OPTIONS.iinStamp) : '',
    iinContacts: pick_(l.iinStamp, FORM_OPTIONS.iinStamp) === '必要' ? normalizeContacts_(l.iinContacts) : [],
    // 地元関係者の同意（土地改良区へ確認。「必要」のときだけ氏名・住所・電話を保存）
    localConsent: kairyoOn ? pick_(l.localConsent, FORM_OPTIONS.localConsent) : '',
    localContacts: kairyoOn && pick_(l.localConsent, FORM_OPTIONS.localConsent) === '必要' ? normalizeContacts_(l.localContacts) : [],
    // 転用の見込み（許可が必要な区域で農業委員会に確認）
    purpose: purpose,
    // 転用済みの物件：過去の届出受理・許可の履歴（「あり」のときだけ年月日・番号・内容）
    tenyoRireki: rirekiAns,
    saiShinsei: saiShinsei,
    saiShinseiNote: saiShinsei ? str_(l.saiShinseiNote, 200) : '',
    rirekiDate: rirekiOn ? dateText_(l.rirekiDate) : '',
    rirekiNo: rirekiOn ? str_(l.rirekiNo, 50) : '',
    rirekiNote: rirekiOn ? str_(l.rirekiNote, 200) : '',
    // 履歴がない（無断転用）場合：始末書の提出と押印（「必要」のときだけ押印と備考）
    shimatsusho: convOn && !rirekiOn ? pick_(l.shimatsusho, FORM_OPTIONS.shimatsusho) : '',
    shimatsuStamp: shimatsuOn ? pick_(l.shimatsuStamp, FORM_OPTIONS.shimatsusho) : '',
    shimatsuNote: shimatsuOn ? str_(l.shimatsuNote, 200) : '',
    tenyoKanou: permitZone ? pick_(l.tenyoKanou, FORM_OPTIONS.tenyoKanou) : '',
    noutiKubun: permitZone ? pick_(l.noutiKubun, FORM_OPTIONS.noutiKubun) : '',
    kanouNote: permitZone ? str_(l.kanouNote, 300) : '',
    // 農振除外の見込み（青地「はい」「分からない」のとき）
    jogaiKanou: jogaiOn ? pick_(l.jogaiKanou, FORM_OPTIONS.tenyoKanou) : '',
    hojoKuiki: jogaiOn ? pick_(l.hojoKuiki, FORM_OPTIONS.hojoKuiki) : '',
    hojo8nen: jogaiOn && pick_(l.hojoKuiki, FORM_OPTIONS.hojoKuiki) === '区域内' ? pick_(l.hojo8nen, FORM_OPTIONS.hojo8nen) : '',
    jogaiJisseki: jogaiOn ? pick_(l.jogaiJisseki, FORM_OPTIONS.jogaiJisseki) : '',
    jogaiUketsuke: jogaiOn ? jogaiUketsukeText_(l.jogaiKaisu, l.jogaiJiki) : '',
    tenyoUketsuke: permitZone || jogaiOn ? tenyoUketsukeText_(l) : '',
    jogaiNote: jogaiOn ? str_(l.jogaiNote, 300) : '',
    // 排水先（分家住宅のとき）
    drainAdjacent: drainOn ? pick_(l.drainAdjacent, FORM_OPTIONS.drainAdjacent) : '',
    drainConsent: drainOn ? pick_(l.drainConsent, FORM_OPTIONS.drainConsent) : '',
    drainName: drainConsentOn ? str_(l.drainName, 100) : '',
    drainTel: drainConsentOn ? str_(l.drainTel, 20) : '',
    drainFee: drainConsentOn ? [yenText_(l.drainFeeAmount), str_(l.drainFeeNote, 100)].filter(String).join('／') : '',
    drainFeeAmount: drainConsentOn ? numOrZero_(l.drainFeeAmount) : 0,
    drainLocalConsent: drainConsentOn ? pick_(l.drainLocalConsent, FORM_OPTIONS.localConsent) : '',
    drainContacts: drainLocalOn ? normalizeContacts_(l.drainContacts) : [],
  };
}

/**
 * 「○○町字△△ 123番1」の末尾から地番を切り出す（例：123番1／123番地1／123-1／123）。
 * 末尾が数字で終わらない場合は地番なし（空文字）。画面側（JavaScript.html）と同じ規則。
 * @return {{place:string, lotNumber:string}}
 */
function splitLotNumber_(text) {
  const m = String(text || '').match(LOT_NUMBER_TAIL_RE);
  return m ? { place: m[1].trim(), lotNumber: m[2] } : { place: String(text || '').trim(), lotNumber: '' };
}

/** 保存前の必須チェック。エラーメッセージの配列を返す（空ならOK） */
function validateInput_(input) {
  const errors = [];
  if (!input.requesterName) errors.push('依頼者名を入力してください。');
  if (!input.lots.length) errors.push('物件を1件以上入力してください。');
  input.lots.forEach(function (l, i) {
    const name = '物件' + (i + 1) + '：';
    if (!l.municipality) errors.push(name + '市区町村を入力してください。');
    if (!l.lotNumber) errors.push(name + '所在・地番の末尾に地番を入力してください（例：○○町字△△ 123番1）。');
    if (!l.zone) errors.push(name + '区域区分を選択してください（不明な場合は「分からない」）。');
    if (l.area !== null && (isNaN(l.area) || l.area < 0)) errors.push(name + '面積は0以上の数値で入力してください。');
  });
  const farmland = input.lots.filter(function (l) { return FARMLAND_LAND_USES.indexOf(l.landUse) >= 0; });
  if (farmland.length && !input.plan) {
    errors.push('現況が農地（' + farmland[0].landUse + '）の物件があるため、今後の転用計画を入力してください。');
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

/**
 * 失敗内容を「エラーログ」シートに記録する（原因調査用）。記録自体の失敗は無視する。
 * @param {string} where 発生した処理
 * @param {*} e 例外
 * @param {string=} detail 補足（ファイル名など）
 */
function logError_(where, e, detail) {
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEET_NAMES.ERRORS) || ss.insertSheet(SHEET_NAMES.ERRORS);
    if (sheet.getLastRow() === 0) sheet.appendRow(['日時', 'ユーザー', '処理', '内容', '補足', '詳細']);
    sheet.appendRow([new Date(), getUserEmail_(), where, String(e && e.message || e),
      String(detail || ''), String(e && e.stack || '').slice(0, 2000)]);
  } catch (ignore) {
    // ログが書けなくても本来の処理結果は返す
  }
}
