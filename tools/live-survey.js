// 本物の Google API で、GASと同じ調査処理を手元（Node.js）で動かして結果を確かめる。
//   MAPS_API_KEY=... node tools/live-survey.js <マイソクのテキストファイル>
// スプレッドシートはメモリ上の簡易版を使う（本番のシートには書き込まない）。API利用料がかかる点に注意。
const fs = require('fs');
const { execFileSync } = require('child_process');
const { loadGas } = require('../tests/load');

const KEY = process.env.MAPS_API_KEY;
if (!KEY) { console.error('MAPS_API_KEY が必要です'); process.exit(1); }
const textPath = process.argv[2];

/* ---- メモリ上のスプレッドシート ---- */
function makeSheet(name) {
  const data = [];
  const sh = {
    name, data, getName: () => name,
    getLastRow: () => { for (let r = data.length - 1; r >= 0; r--) if ((data[r] || []).some((v) => v !== '' && v != null)) return r + 1; return 0; },
    getLastColumn: () => data.reduce((m, row) => { let l = 0; (row || []).forEach((v, i) => { if (v !== '' && v != null) l = i + 1; }); return Math.max(m, l); }, 0),
    getRange: (r, c, nr = 1, nc = 1) => {
      const cell = (i, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v == null ? '' : v; };
      const set = (i, j, v) => { data[r - 1 + i] = data[r - 1 + i] || []; data[r - 1 + i][c - 1 + j] = v; };
      const rg = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(i, j))),
        setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => set(i, j, v))); return rg; },
        setValue: (v) => { set(0, 0, v); return rg; },
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(i, j, ''); return rg; },
        clearDataValidations: () => rg, insertCheckboxes: () => rg, setFontWeight: () => rg, setBackground: () => rg, setNumberFormat: () => rg, setWrap: () => rg
      };
      return rg;
    },
    appendRow: (vals) => { data[sh.getLastRow()] = vals.slice(); }, setFrozenRows: () => {}
  };
  return sh;
}
const sheets = [];
const ss = {
  getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
  insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s; },
  getSheets: () => sheets, deleteSheet: () => {}, setSpreadsheetTimeZone: () => {}, getSpreadsheetTimeZone: () => 'Asia/Tokyo', getId: () => 'LOCAL', getUrl: () => 'local'
};

/* ---- 本物の通信（GASの UrlFetchApp と同じく同期） ---- */
let calls = 0;
const UrlFetchApp = {
  fetch(url, opt) {
    calls++;
    const args = ['-sS', '-w', '\n%{http_code}', '-X', (opt.method || 'get').toUpperCase(), url];
    Object.entries(opt.headers || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
    if (opt.payload) args.push('-H', 'Content-Type: ' + (opt.contentType || 'application/json'), '--data-binary', '@-');
    const out = execFileSync('curl', args, { input: opt.payload || '', maxBuffer: 50 * 1024 * 1024 }).toString();
    const i = out.lastIndexOf('\n');
    const body = out.slice(0, i), code = Number(out.slice(i + 1));
    return { getResponseCode: () => code, getContentText: () => body };
  }
};

const g = loadGas({
  UrlFetchApp,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert: () => {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'GOOGLE_MAPS_API_KEY' ? KEY : null), setProperty: () => {} }) },
  LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { sleep: (ms) => execFileSync('sleep', [String(ms / 1000)]), formatDate: () => '03:00' }
});

g.setupSheets_();
// 1) マイソクを読み取り、物件行を作る
const parsed = g.parseMysokuText_(fs.readFileSync(textPath, 'utf8'));
const H = g.HEADERS['物件'];
const prop = {};
H.forEach((h) => { prop[h] = ''; });
const patch = g.mysokuPatch_(prop, parsed).patch;
Object.assign(prop, patch, { '物件ID': 'P00002' });
ss.getSheetByName('物件').getRange(2, 1, 1, H.length).setValues([H.map((h) => (prop[h] === undefined ? '' : prop[h]))]);

// 2) 住所から位置を求め、そのまま確定したことにして調査（本番では担当者が出入口に合わせる）
const ctx = g.buildContext_();
let p = g.readTable_('物件').rows[0];
const geo = g.geocodeProperty_(p, ctx);
g.updateRow_('物件', p._row, { '起点確認済': true });
p = g.readTable_('物件').rows[0];
const t0 = Date.now();
const r = g.processProperty_(p, ctx);
const sec = Math.round((Date.now() - t0) / 1000);

const out = g.readTable_('出力').rows[0] || {};
const fac = g.readTable_('施設結果').rows;
const st = g.readTable_('駅結果').rows;
const ac = g.readTable_('アクセス結果').rows;
const report = {
  status: r.status, message: g.readTable_('物件').rows[0]['メッセージ'], seconds: sec, apiCalls: ctx.apiCalls, byApi: ctx.apiByLabel,
  geocode: { lat: geo.lat, lng: geo.lng, address: geo.formattedAddress, warnings: geo.warnings },
  area: g.readTable_('物件').rows[0]['エリア'],
  title: out['タイトル'], titleNotes: out['タイトル注記'],
  stations: [1, 2, 3].map((i) => [out['駅' + i], out['駅' + i + '_徒歩分'], out['駅' + i + '_その他']].join(' | ')),
  other: out['その他アクセス'], airport: out['空港からのアクセス'],
  around: out['周辺施設'],
  facilities: fac.map((f) => [f['カテゴリ'], f['採否'], f['名称'], f['道路距離m'] + 'm', '徒歩' + f['徒歩分'] + '分', f['車所要分'] ? '車' + f['車所要分'] + '分' : '', f['掲載'] ? '掲載' : '', f['要確認理由']].filter(String).join(' / ')),
  stationRows: st.map((s) => [s['枠'], s['出典'], s['駅名'], s['路線'], 'マイソク' + s['マイソク徒歩分'], 'Google' + s['Google徒歩分'] + '(' + s['道路距離m'] + 'm)', '採用' + s['採用徒歩分'], s['要確認理由']].join(' / ')),
  accessRows: ac.map((a) => [a['種別'], a['名称'], a['徒歩分'] ? '徒歩' + a['徒歩分'] + '分' : '', a['車所要分'] ? '車' + a['車所要分'] + '分' : '', a['有料道路'], a['採用'] ? '採用' : '', a['詳細']].filter(String).join(' / ')),
  pending: out['未確認の要確認件数'], wellmoJson: out['ウェルモJSON'] ? JSON.parse(out['ウェルモJSON']) : null
};
fs.writeFileSync(process.env.OUT || 'live-survey-result.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
