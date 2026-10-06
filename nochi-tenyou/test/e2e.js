/**
 * 画面の自動確認（テスト専用）。先に `python3 build.py` を実行してください。
 *   node e2e.js
 * 謄本読取 → 複数物件 → 見積 → 必須チェック → 送信 → シート保存 → Chat通知 → 管理画面 の順に確認します。
 * Playwright が必要です（グローバルに入っている場合は NODE_PATH=$(npm root -g) node e2e.js）。
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'out');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.text().includes('SERVER ERROR')) errors.push(m.text()); });
  };

  // ---------------- 依頼画面 ----------------
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  watch(p);
  await p.goto('file://' + path.join(OUT, 'index.html'));
  await p.waitForSelector('.lot');
  await p.fill('#requesterName', '田中 一郎');

  // 謄本を入れる → 2筆が読み取られ、物件が2件になる
  await p.setInputFiles('#tohonFile', { name: '謄本.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF dummy') });
  await p.waitForFunction(() => document.querySelectorAll('.lot').length === 2 &&
    document.querySelector('#tohonStatus li .st').textContent.includes('読み取りました'), null, { timeout: 5000 });
  const lots = await p.$$eval('.lot', (ls) => ls.map((l) => ({
    city: l.querySelector('[data-f=municipality]').value, address: l.querySelector('[data-f=address]').value,
    chimoku: l.querySelector('[data-f=chimoku]').value, area: l.querySelector('[data-f=area]').value,
    yellow: l.querySelectorAll('.from-tohon').length,
  })));
  assert.deepStrictEqual(lots, [
    { city: '豊田市', address: '○○町字△△ 123番1', chimoku: '畑', area: '496', yellow: 4 },
    { city: '豊田市', address: '○○町字△△ 123番2', chimoku: '田', area: '1024', yellow: 4 },
  ]);

  // 区域などを選ぶ（物件1：調整区域・耕作中、物件2：分からない・農振はい）
  const cards = await p.$$('.lot');
  await (await cards[0].$('input[value="市街化調整区域"]')).check({ force: true });
  await (await cards[0].$('[data-f=landUse]')).selectOption('耕作中');
  await (await cards[1].$('input[value="分からない"]')).check({ force: true });
  // 2筆以上はヒアリングを電話先ごとの票にまとめる（質問ごとに全筆の回答欄）。最初の回答は未回答の筆にも入る
  const uid = async (c) => c.getAttribute('data-uid');
  const u0 = await uid(cards[0]), u1 = await uid(cards[1]);
  assert.strictEqual(await p.$$eval('#hearAll:not(.hidden) .gm-sheet', (x) => x.length), 1);
  assert.strictEqual(await cards[1].$('input[name$="_isNoshin"]'), null); // 物件カードには架電前入力だけ
  await p.check('input[name="lot' + u0 + '_isNoshin"][value="いいえ"]');
  assert.strictEqual(await p.$eval('input[name="lot' + u1 + '_isNoshin"][value="いいえ"]', (e) => e.checked), true);
  await p.check('input[name="lot' + u1 + '_isNoshin"][value="はい"]');
  assert.strictEqual(await p.$eval('input[name="lot' + u0 + '_isNoshin"][value="いいえ"]', (e) => e.checked), true); // 直した筆はほかへ広げない

  // 引き継いで追加 → 区域・所在が引き継がれる → 削除
  await p.click('#copyLotBtn');
  const third = (await p.$$('.lot'))[2];
  assert.strictEqual(await third.$eval('input[value="分からない"]', (e) => e.checked), true);
  // 市区町村と町名・字は引き継ぎ、地番は引き継がない
  assert.strictEqual(await third.$eval('[data-f=municipality]', (e) => e.value), '豊田市');
  assert.strictEqual(await third.$eval('[data-f=address]', (e) => e.value), '○○町字△△');
  await (await third.$('.lot-del')).click();

  // 見積：調整区域(許可) + 分からない(届出で仮計算) + 農振除外
  await p.waitForTimeout(800);
  assert.strictEqual(await p.textContent('#estimateTotal'), '¥679,300'); // 報酬(235,000+58,000+300,000)+消費税10% 59,300 + 調査実費 25,000+2,000

  // 地元承諾書は同意が必要な人数分（地元関係者＋排水の地元承諾者、同じ人は1人）。人数不明は1人分。地元協力金等は実費
  const consent = await p.evaluate(() => {
    const f = (x) => calculateEstimate_(x).items.filter((it) => it.label.indexOf('地元承諾書') === 0).map((it) => it.label + '=' + it.amount)[0];
    const base = { zone: '市街化区域', landImprovement: 'はい', kairyoBenefit: '該当しない', localConsent: '必要' };
    return [
      f({ lots: [Object.assign({}, base, { localContacts: [{ name: 'A', tel: '1' }, { name: 'B', tel: '2' }] }),
        Object.assign({}, base, { localContacts: [{ name: 'A', tel: '1' }], drainConsent: '必要', drainLocalConsent: '必要', drainContacts: [{ name: 'C', tel: '3' }] })] }),
      f({ lots: [Object.assign({}, base, { localContacts: [] })] }),
      calculateEstimate_({ lots: [{ zone: '市街化区域' }], localFee: 30000, localFeeNote: '○○区' }).items.filter((it) => it.kind === 'cost').map((it) => it.label + '=' + it.amount).join()
    ];
  });
  assert.deepStrictEqual(consent, ['地元承諾書（区長・水利組合等）（1人あたり） × 3=60000', '地元承諾書（区長・水利組合等）（1人あたり）=20000', '調査実費（市街化区域）=2000,地元協力金等（○○区）=30000']);

  // 非農地証明：可能なら許可申請を計上せず現況証明、不可・未確認なら許可申請（現況証明は計上しない）
  const hino = await p.evaluate(() => {
    const l = (h) => ({ zone: '市街化調整区域', landUse: '駐車場', isConverted: 'はい', tenyoRireki: 'なし', hinochi: h });
    const labels = (h) => calculateEstimate_({ lots: [l(h)] }).items.filter((it) => it.kind !== 'cost').map((it) => it.label).join('／');
    return [labels('可能'), labels('不可'), labels('')];
  });
  assert.deepStrictEqual(hino, ['現況証明（非農地証明）願出', '農地法第5条許可申請（市街化調整区域）', '農地法第5条許可申請（市街化調整区域）']);

  // 地目変更登記：案件一覧の列とChatに「登記担当へ連絡」を目立たせて出す
  const chimokuNote = await p.evaluate(() => [chimokuHenkoText_([{ address: '豊田市○○町', lotNumber: '1番', chimokuHenko: true }, { address: '豊田市○○町', lotNumber: '2番' }])]);
  assert.deepStrictEqual(chimokuNote, ['あり（1筆）：物件1 豊田市○○町 1番']);

  // 筆数加算：2筆以上で表示。チェックしたときだけ（同じ区域の2筆目以降）加算
  assert.strictEqual(await p.$eval('#extraLotWrap', (e) => e.classList.contains('hidden')), false);
  const extra = await p.evaluate(() => {
    const lots = [{ zone: '市街化区域', landUse: '耕作中' }, { zone: '市街化区域', landUse: '耕作中' }, { zone: '市街化区域', landUse: '耕作中' }];
    const has = (e) => e.items.some((it) => it.label.indexOf('筆数加算') === 0);
    return [has(calculateEstimate_({ lots: lots })), has(calculateEstimate_({ lots: lots, extraLotFee: true })),
      calculateEstimate_({ lots: lots, extraLotFee: true }).total - calculateEstimate_({ lots: lots }).total];
  });
  assert.deepStrictEqual(extra, [false, true, 22000]);
  // 許可と届出で別の単価（同じ金額でも別の行）
  const split = await p.evaluate(() => calculateEstimate_({ extraLotFee: true, lots: [
    { zone: '市街化区域' }, { zone: '市街化区域' }, { zone: '市街化調整区域' }, { zone: '市街化調整区域' }, { zone: '市街化調整区域' }] })
    .items.filter((it) => it.label.indexOf('筆数加算') === 0).map((it) => it.label));
  assert.deepStrictEqual(split, ['筆数加算・許可（1筆あたり） × 2', '筆数加算・届出（1筆あたり）']);

  // 許可・届出の履歴がある物件は計上しない（改めて許可・届出が必要と回答があった場合だけ計上）
  const granted = await p.evaluate(() => {
    const base = { zone: '市街化調整区域', landUse: '耕作中' };
    const g = Object.assign({}, base, { tenyoRireki: 'あり', isConverted: 'いいえ' });
    const e1 = calculateEstimate_({ lots: [g] });
    const e2 = calculateEstimate_({ lots: [Object.assign({}, g, { saiShinsei: '必要' })] });
    const e3 = calculateEstimate_({ lots: [base, g] });
    return [e1.total, e2.total > 0, e3.total === calculateEstimate_({ lots: [base] }).total, e3.notes.some((n) => n.indexOf('物件2') === 0 && n.indexOf('計上していません') > 0)];
  });
  assert.deepStrictEqual(granted, [0, true, true, true]);
  // 履歴がある物件だけでも、地目変更登記のチェックがあれば計上する（48,000＋税＝52,800）
  const chimokuOnly = await p.evaluate(() => calculateEstimate_({ lots: [
    { zone: '非線引き区域', tenyoRireki: 'あり', isConverted: 'はい', chimokuHenko: true },
    { zone: '市街化区域', tenyoRireki: 'あり', isConverted: 'はい', chimokuHenko: true }] }));
  assert.deepStrictEqual([chimokuOnly.total, chimokuOnly.items.map((it) => it.label)], [52800, ['地目変更登記']]);
  // 地目変更登記は2筆まで加算なし、3筆目から1筆5,000円（3筆：48,000＋5,000＝53,000＋税＝58,300）
  const chimoku3 = await p.evaluate(() => calculateEstimate_({ lots: [1, 2, 3].map(() => ({ zone: '市街化区域', tenyoRireki: 'あり', chimokuHenko: true })) }));
  assert.deepStrictEqual([chimoku3.total, chimoku3.items.map((it) => it.label)], [58300, ['地目変更登記', '地目変更登記 筆数加算（3筆目から1筆あたり）']]);
  // 転用済みでも再申請の要否を保存し、「必要」なら計上
  const saiConv = await p.evaluate(() => {
    const l = normalizeLot_({ zone: '市街化調整区域', municipality: '豊田市', address: '○○町 1番', isConverted: 'はい', tenyoRireki: 'あり', saiShinsei: '必要', saiShinseiNote: '目的変更' }, '愛知県', []);
    return [l.saiShinsei, l.saiShinseiNote, calculateEstimate_({ lots: [l] }).total > 0];
  });
  assert.deepStrictEqual(saiConv, ['必要', '目的変更', true]);

  // 地目変更登記：チェックした物件があれば 48,000（税抜）を1回 → +52,800
  await p.check('.lot [data-f=chimokuHenko]');
  await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#estimateTotal'), '¥732,100');
  await p.uncheck('.lot [data-f=chimokuHenko]');
  await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#estimateTotal'), '¥679,300');

  // 現況が農地なのに転用計画が空 → 送信できない
  await p.click('#requestBtn');
  assert.ok((await p.textContent('#formErrors')).includes('今後の転用計画'));

  await p.fill('#plan', '自己用住宅の建築');
  await p.click('#requestBtn');
  await p.waitForSelector('#resultBox:not(.hidden)', { timeout: 5000 });
  assert.ok((await p.textContent('#resultText')).includes('物件 2 件'));

  const saved = await p.evaluate(() => ({
    lotRows: SHEETS['物件明細'].rows.length - 1,
    caseLots: SHEETS['案件一覧'].rows[1][4],
    lot1: SHEETS['物件明細'].rows[1].slice(0, 4),
    chat: CHAT_LOG[0],
  }));
  assert.strictEqual(saved.lotRows, 2);
  assert.strictEqual(saved.caseLots, '123番1、123番2');
  // シートには 所在＝市区町村＋町名・字、地番＝末尾の地番 に分けて保存
  assert.deepStrictEqual(saved.lot1.slice(2), ['豊田市○○町字△△', '123番1']);
  assert.ok(saved.chat.includes('物件：2件') && saved.chat.includes('管理画面で案件を開く'));
  await p.screenshot({ path: path.join(OUT, 'index.png'), fullPage: true });

  // ---------------- 謄本をまとめて入れる（同時処理の上限より多い4通） ----------------
  const bulk = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  watch(bulk);
  await bulk.goto('file://' + path.join(OUT, 'index.html'));
  await bulk.waitForSelector('.lot');
  await bulk.evaluate(() => {
    window.OCR_BY_NAME = {};
    [10, 11, 12, 13].forEach((n) => { window.OCR_BY_NAME['t' + n + '.pdf'] = '表題部\n所在 岡崎市××町\n' + n + '番 畑 ' + (n * 10) + ' 余白'; });
  });
  await bulk.setInputFiles('#tohonFile', [10, 11, 12, 13].map((n) => ({ name: 't' + n + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })));
  assert.ok((await bulk.textContent('#tohonStatus')).includes('待機中'), '4通目は待機中になるはず');
  await bulk.waitForFunction(() => document.querySelectorAll('.lot').length === 4 &&
    !document.querySelector('#tohonStatus').textContent.match(/待機中|アップロード中|読み取り中/), null, { timeout: 8000 });
  const bulkLots = await bulk.$$eval('.lot [data-f=address]', (e) => e.map((x) => x.value).sort());
  assert.deepStrictEqual(bulkLots, ['××町 10番', '××町 11番', '××町 12番', '××町 13番']);

  // ---------------- 謄本：登記情報提供サービス形式（罫線の表・全角数字・所在と地積の更正） ----------------
  const tableText = '┏━━━┓ ┃ 表 題 部 （土地の表示） │調製│ ┃ ┠──┨ ┃所 在│○○郡○○町大字△△字□□ │ ┃ ┃ ├───┼───┨ ┃ │○○市□□ │平成２４年１月４日市制施行 ┃ ┠──┨ ' +
    '┃ ① 地 番 │ ②地 目 │ ③ 地 積 ㎡ │ 原因及びその日付 ┃ ┠──┨ ┃１００番 │宅地 │ ４１３：２２│ ┃ ┠──┨ ┃ │ │ ： │昭和６３年法務省令第３７号附則第２条第２項┃ ' +
    '┠──┨ ┃ │ │ ４８８：７０│③錯誤 ┃ ┗━━┛ ┏━━┓ ┃ 権 利 部 （ 甲 区 ） ┃';
  const parsed = await bulk.evaluate((t) => parseTohonText_(t), tableText);
  assert.deepStrictEqual(parsed, [{ address: '○○市□□', lotNumber: '100番', chimoku: '宅地', chimokuRaw: '宅地', area: '488.70' }]);

  // ---------------- 謄本：紙の全部事項証明書のスキャン（ページ上部の所在地番を優先。地番変更・崩れた所在行） ----------------
  const scanText = ['愛知県○○市△△町5丁目10', '表題部 (土地の表示)', '所 在「○○市△△町五丁目', '①地番', '②地目', '26番', '田', '52', '10番', '①変更', '権利部 (甲区)', '所有者 ○○市□□町四丁目173番地'].join(String.fromCharCode(10));
  const scanned = await bulk.evaluate((t) => parseTohonText_(t), scanText);
  assert.deepStrictEqual(scanned.map((l) => [l.address, l.lotNumber, l.chimoku, l.area]), [['○○市△△町5丁目', '10番', '田', '52']]);

  // 謄本：登記情報提供サービスの表で、小数のない地積「２２３：」（「：」だけ付く）と、分筆後の最新の行
  const colonText = ['┃所 在│○○市△△一丁目 │ ┃', '┃ ① 地 番 │ ②地 目 │ ③ 地 積 ㎡ │ 原因及びその日付 ┃',
    '┃２１番 │畑 │ ２２３： │換地┃', '┃ │ │ ： │処分 ┃', '┃２１番１ │ │ ５４： │①③２１番１、２１番２に分筆 ┃', '┃ │ │ ： │〔平成２４年６月１９日〕 ┃',
    '┏━┓ ┃ 権 利 部 （ 甲 区 ） ┃'].join(String.fromCharCode(10));
  const colon = await bulk.evaluate((t) => parseTohonText_('┃ 表 題 部 （土地の表示） │調製│ ┃' + String.fromCharCode(10) + t), colonText);
  assert.deepStrictEqual(colon.map((l) => [l.lotNumber, l.chimokuRaw, l.area]), [['21番1', '畑', '54']]);

  // ---------------- 管理画面 ----------------
  const a = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  watch(a);
  await a.goto('file://' + path.join(OUT, 'admin.html'));
  // シートが「2020/06/01」を日付に変換して保存した状態を再現（これでも読み込めること）
  await a.evaluate(() => { const sh = SHEETS['物件明細']; const col = LOT_COLUMNS.findIndex((c) => c.key === 'rirekiDate'); sh.rows[1][col] = new Date(2020, 5, 1); load(); });
  await a.waitForSelector('#rows .case-card');
  assert.strictEqual(await a.evaluate(() => state.lotsByCase[state.cases[0].id][0].rirekiDate), '2020/06/01');
  // 本番は doGet が案件一覧を画面に埋め込む：埋め込みがあればサーバーへ取りに行かずに表示する（< を含む文字も壊れない）
  const boot = await a.evaluate(() => {
    const bs = String.fromCharCode(92);
    const json = JSON.stringify(getAdminData()).replace(/</g, bs + 'u003c');
    let calls = 0; const orig = window.getAdminData; window.getAdminData = function () { calls++; return orig(); };
    BOOT_DATA = JSON.parse(json); load(); window.getAdminData = orig;
    return [calls, document.querySelectorAll('#rows .case-card').length, json.indexOf('<') < 0];
  });
  assert.deepStrictEqual(boot, [0, 1, true]);
  await a.click('#rows .case-card');
  await a.waitForSelector('#detail .lot-card');
  assert.strictEqual((await a.$$('#detail .lot-card')).length, 2);
  // 地目変更登記の物件があれば、詳細の上部に帯、案件リストに札
  await a.evaluate(() => { state.lotsByCase[state.cases[0].id][1].chimokuHenko = 'はい'; renderRows(); renderDetail(state.cases[0].id); });
  assert.ok((await a.textContent('#detail .chimoku-alert')).includes('地目変更登記あり（1筆）'));
  assert.ok(await a.$('#rows .chimoku-badge'));
  assert.ok((await a.evaluate(() => buildPrintHtml(state.cases[0], state.lotsByCase[state.cases[0].id]))).includes('登記担当へ連絡'));
  // 地元協力金等を入れて更新すると、新規・調査中の案件は概算に実費として入る
  const est0 = await a.evaluate(() => state.cases[0].estimate);
  await a.fill('#aLocalFee', '30,000'); await a.fill('#aLocalFeeNote', '○○区 協力金');
  await a.click('#detail .side .primary');
  await a.waitForFunction((e0) => state.cases[0].estimate === e0 + 30000, est0, { timeout: 5000 });
  await a.selectOption('#aStatus', '調査中');
  await a.click('#detail .primary');
  await a.waitForFunction(() => document.querySelector('#rows .pill').textContent === '調査中', null, { timeout: 5000 });
  await a.screenshot({ path: path.join(OUT, 'admin.png'), fullPage: true });

  // 調査結果の修正：物件カードの「修正」→ 小窓で直して保存 → 物件明細が変わり、調査中の案件は概算も計算し直す
  const est1 = await a.evaluate(() => state.cases[0].estimate);
  const editLot2 = async (rireki, iin) => {
    await (await (await a.$$('#detail .lot-card'))[1].$('.lot-edit')).click();
    await a.waitForSelector('#lotDialog[open]', { timeout: 5000 });
    await a.selectOption('#lotDialog [data-k=tenyoRireki]', rireki);
    await a.fill('#lotDialog [data-k=iinContacts]', iin);
    if (iin) await a.screenshot({ path: path.join(OUT, 'admin_lotedit_dialog.png') });
    await a.click('#lotDlgSave');
    await a.waitForFunction(() => !document.querySelector('#lotDialog').open, null, { timeout: 5000 });
  };
  await editLot2('あり', '山田 太郎／○○町1／090-1111-2222');
  const edited = await a.evaluate(() => { const l = state.lotsByCase[state.cases[0].id][1]; return [l.tenyoRireki, l.iinContacts, state.cases[0].estimate]; });
  assert.deepStrictEqual(edited.slice(0, 2), ['あり', '山田 太郎／○○町1／090-1111-2222']);
  assert.ok(edited[2] < est1, '修正後に概算が計算し直されていない');
  assert.ok((await a.textContent('#detail')).includes('090-1111-2222'));
  await a.screenshot({ path: path.join(OUT, 'admin_lotedit.png') });
  await editLot2('', '');
  assert.strictEqual(await a.evaluate(() => state.cases[0].estimate), est1);

  // 受付番号（受付日-連番）と、受付番号導入前の案件への付番
  const caseNo = await a.evaluate(() => state.cases[0].caseNo);
  assert.ok(/^\d{6}-01$/.test(caseNo), caseNo);
  const refill = await a.evaluate(() => {
    const col = colIndexOf_('caseNo') - 1; SHEETS['案件一覧'].rows[1][col] = '';
    const n = fillCaseNos_(); return [n, SHEETS['案件一覧'].rows[1][col]];
  });
  assert.deepStrictEqual(refill, [1, caseNo]);

  // 概算見積の内訳は表
  assert.ok((await a.textContent('#detail table.est-t tr.sum')).includes('合計'));

  // 正式見積：PDFを選ぶ → 提示 → 保存・状況変更・Chat（メールは送らない）
  await a.setInputFiles('#detail .pdf-drop + input[type=file]', { name: 'mitsumori.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await a.fill('#fAmount', '850,000');
  await a.click('#detail .pdf-confirm .primary');
  await a.waitForSelector('#detail .pdf-done', { timeout: 5000 });
  const rep = await a.evaluate(() => ({ status: state.cases[0].status, amount: state.cases[0].formalEstimate, chat: CHAT_LOG[CHAT_LOG.length - 1] }));
  assert.strictEqual(rep.status, '正式見積提示済');
  assert.strictEqual(rep.amount, 850000);
  assert.ok(await a.evaluate((no) => Object.values(FILES).some((f) => f.name.startsWith('正式見積_' + no + '_')), caseNo));
  assert.strictEqual(await a.evaluate(() => typeof MailApp), 'undefined');
  assert.ok(rep.chat.includes('正式見積を提示しました') && rep.chat.includes(caseNo), rep.chat);
  await a.screenshot({ path: path.join(OUT, 'admin_estimate.png'), fullPage: true });

  // PDF出力：帳票HTMLをサーバーでPDFにしてダウンロード
  // PDF出力：小窓が出る（この時点では保存しない）→［出力］で保存し、小窓が閉じる
  let autoDl = false; const onDl = () => { autoDl = true; }; a.on('download', onDl);
  await a.click('#detail .pdf-btn');
  await a.waitForSelector('#pdfDialog[open]', { timeout: 5000 });
  await a.waitForTimeout(300); a.off('download', onDl);
  assert.strictEqual(autoDl, false, 'PDF出力を押しただけで保存された');
  assert.strictEqual(await a.inputValue('#pdfKarte'), '');
  await a.fill('#pdfKarte', '260001');
  const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 5000 }), a.click('#pdfGo')]);
  await a.waitForFunction(() => !document.querySelector('#pdfDialog').open, null, { timeout: 5000 });
  assert.strictEqual(dl.suggestedFilename(), '農地転用_案件詳細_' + caseNo + '_田中一郎.pdf');
  const printHtml = await a.evaluate(() => window.LAST_PDF_HTML);
  for (const w of [caseNo, '田中 一郎', '概算見積の内訳', '¥709,500', '地元協力金等（○○区 協力金）', '物件2', '123番2', '正式見積提示済', '¥850,000']) assert.ok(printHtml.includes(w), 'PDFに「' + w + '」がない');
  fs.writeFileSync(path.join(OUT, 'case_print.html'), printHtml);
  // 案件カルテ番号：見出しに出る・案件に保存され、次に開くと入っている
  assert.ok(/案件カルテ番号<\/div><b>260001<\/b>/.test(printHtml) && printHtml.includes('受付番号 ' + caseNo), 'PDFの見出しにカルテ番号がない');
  await a.waitForFunction(() => String(SHEETS['案件一覧'].rows[1][colIndexOf_('karteNo') - 1]) === '260001', null, { timeout: 5000 });
  await a.click('#detail .pdf-btn');
  await a.waitForSelector('#pdfDialog[open]', { timeout: 5000 });
  assert.strictEqual(await a.inputValue('#pdfKarte'), '260001');
  await a.screenshot({ path: path.join(OUT, 'admin_pdf_dialog.png') });
  await a.click('#pdfCancel');

  // 電話番号は tel: リンク。連絡先・訪問先の一覧（農業委員会は市区町村から、同じ相手は物件をまとめる）
  await a.evaluate(() => { state.lotsByCase[state.cases[0].id].forEach((l) => { l.kairyoName = '○○土地改良区'; l.kairyoTel = '0565-12-3456'; });
    state.lotsByCase[state.cases[0].id][0].iinContacts = '山田 太郎／○○町1-2／090-1111-2222'; renderDetail(state.cases[0].id); });
  assert.strictEqual(await a.$eval('#detail table.ct a.tel', (e) => e.getAttribute('href')).then((h) => h.startsWith('tel:')), true);
  const ct = await a.$$eval('#detail table.ct tr:not(.appt)', (rows) => rows.map((r) => r.querySelector('.kind').textContent + '|' + r.querySelector('.lots').textContent));
  assert.deepStrictEqual(ct, ['農業委員会|物件1・2', '土地改良区|物件1・2', '地元委員|物件1']);

  // 訪問のアポイント（地元委員など伺う相手だけ）：入力するとその場で保存、PDFにも出る
  assert.strictEqual((await a.$$('#detail tr.appt')).length, 1);
  await a.fill('#detail tr.appt input[type=datetime-local]', '2026-10-03T14:00');
  await a.selectOption('#detail tr.appt select', '確定');
  await a.fill('#detail tr.appt input[type=text]', '実印持参');
  await a.press('#detail tr.appt input[type=text]', 'Tab');
  await a.waitForFunction(() => /実印持参/.test(SHEETS['案件一覧'].rows[1][colIndexOf_('appointments') - 1] || ''), null, { timeout: 5000 });
  const apptJson = JSON.parse(await a.evaluate(() => SHEETS['案件一覧'].rows[1][colIndexOf_('appointments') - 1]));
  assert.deepStrictEqual(Object.values(apptJson), [{ at: '2026-10-03T14:00', status: '確定', memo: '実印持参' }]);
  const apptPdf = await a.evaluate(() => buildPrintHtml(state.cases[0], state.lotsByCase[state.cases[0].id]));
  assert.ok(apptPdf.includes('10/3(土) 14:00　確定') && apptPdf.includes('実印持参'));

  // 削除：控えシートへ移して消す。削除したIDは再利用しない
  a.on('dialog', (d) => d.accept());
  await a.click('#detail .danger-link');
  await a.waitForFunction(() => !document.querySelector('#rows .case-card'), null, { timeout: 5000 });
  const del = await a.evaluate(() => ({
    cases: SHEETS['案件一覧'].rows.length, lots: SHEETS['物件明細'].rows.length,
    delCases: SHEETS['削除した案件'].rows.length, delLots: SHEETS['削除した物件明細'].rows.length,
    delId: SHEETS['削除した案件'].rows[1][2], next: getNextCaseId_(SHEETS['案件一覧'])
  }));
  assert.deepStrictEqual(del, { cases: 1, lots: 1, delCases: 2, delLots: 3, delId: 1, next: 2 });

  await browser.close();
  assert.deepStrictEqual(errors, [], 'ページでエラーが発生しました');
  console.log('OK: すべての確認に合格しました（スクリーンショット：test/out/*.png）');
})().catch((e) => { console.error('NG:', e.message); process.exit(1); });
