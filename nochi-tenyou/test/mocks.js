/**
 * ブラウザ上で .gs のコードを動かすための、Google サービスの簡易な模擬（テスト専用）。
 * 本番では使いません。シート・ドライブ・Chat などをメモリ上で再現します。
 */
var Logger = { log: function () {} };

// ---- スプレッドシート ----
function mkSheet(name) {
  const rows = [];
  return {
    name: name, rows: rows,
    getLastRow: () => rows.length,
    getLastColumn: () => (rows[0] ? rows[0].length : 0),
    getMaxRows: () => 1000,
    getSheetId: () => 7,
    appendRow: (r) => rows.push(r.slice()),
    setFrozenRows() {}, setColumnWidth() {}, setColumnWidths() {},
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = rows[r - 1 + i] || [];
          const x = [];
          for (let j = 0; j < nc; j++) x.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
          out.push(x);
        }
        return out;
      },
      getDisplayValues() { return this.getValues().map((row) => row.map(String)); },
      setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); },
      setValue(v) { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }, setBackground() { return this; },
    }),
  };
}
const SHEETS = {};
const SS = {
  getSheetByName: (n) => SHEETS[n] || null,
  insertSheet: (n) => (SHEETS[n] = mkSheet(n)),
  getUrl: () => 'https://docs.google.com/spreadsheets/d/X/edit',
};
var SpreadsheetApp = { getActiveSpreadsheet: () => SS, flush() {}, getUi() { throw new Error('no ui'); } };
var LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };

// ---- スクリプトプロパティ・ユーザー ----
const PROPS = {
  CHAT_WEBHOOK_URL: 'https://chat.googleapis.com/v1/spaces/X/messages?key=Y',
  ADMIN_EMAILS: 'sho@example.co.jp,tanaka@example.co.jp',
  DRIVE_ROOT_FOLDER_ID: 'root',
};
var PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => PROPS[k] || null, setProperty: (k, v) => { PROPS[k] = v; } }) };
var Session = { getActiveUser: () => ({ getEmail: () => 'tanaka@example.co.jp' }), getScriptTimeZone: () => 'Asia/Tokyo' };
var Utilities = {
  base64Decode: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  newBlob: (bytes, mime, name) => ({ bytes: bytes, mime: mime, name: name }),
  formatDate: (d) => d.toISOString().slice(0, 16).replace('T', ' '),
};
var ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/example/s/ABC/exec' }) };

// ---- Chat（送信内容を記録するだけ） ----
window.CHAT_LOG = [];
var UrlFetchApp = { fetch: (u, o) => { CHAT_LOG.push(JSON.parse(o.payload).text); return { getResponseCode: () => 200, getContentText: () => '{}' }; } };

// ---- ドライブ ----
const FILES = {};
const FOLDERS = {};
let seq = 1;
function mkFile(name, parentId) {
  const f = {
    id: 'file' + (seq++), name: name, parents: [parentId], text: window.OCR_TEXT,
    getId() { return this.id; }, getName() { return this.name; }, setName(n) { this.name = n; },
    setDescription() {}, setTrashed() { this.trashed = true; }, moveTo(folder) { this.parents = [folder.id]; },
    getParents() { let i = 0; const p = this.parents; return { hasNext: () => i < p.length, next: () => ({ getId: () => p[i++] }) }; },
  };
  FILES[f.id] = f;
  return f;
}
function mkFolder(id, name) {
  const folder = {
    id: id, name: name,
    getId: () => id,
    getUrl: () => 'https://drive.google.com/drive/folders/' + id,
    getFoldersByName: (n) => { const list = Object.values(FOLDERS).filter((x) => x.name === n); let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; },
    createFolder: (n) => { const f = mkFolder('folder' + (seq++), n); return f; },
    createFile: (blob) => mkFile(blob.name, id),
    getFiles: () => { const list = Object.values(FILES).filter((f) => f.parents && f.parents[0] === id); let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; },
  };
  FOLDERS[id] = folder;
  return folder;
}
mkFolder('root', '農地転用_案件資料');
var DriveApp = {
  getFolderById: (id) => FOLDERS[id],
  getFileById: (id) => { if (!FILES[id]) throw new Error('not found'); return FILES[id]; },
  createFolder: (n) => FOLDERS.root.createFolder(n),
};
// OCR：アップロードされたどのファイルも window.OCR_TEXT の内容として読む
var Drive = { Files: { copy: (res, id) => { const d = mkFile(res.name, 'root'); d.text = FILES[id].text; return { id: d.id }; } } };
var DocumentApp = { openById: (id) => ({ getBody: () => ({ getText: () => FILES[id].text }) }) };

/** サンプル謄本（2筆。1筆目は変更履歴なし、全角数字あり） */
window.OCR_TEXT = [
  '全部事項証明書 (土地)',
  '表 題 部 (土地の表示) 調製 余白 不動産番号 1234567890123',
  '所 在 豊田市○○町字△△ 余白',
  '① 地 番 ② 地 目 ③ 地 積 ㎡ 原因及びその日付〔登記の日付〕',
  '１２３番１ 畑 ４９６ ③123番から分筆〔平成10年4月1日〕',
  '表 題 部 (土地の表示)',
  '所 在 豊田市○○町字△△',
  '123番2 田 1,024 余白',
].join('\n');
