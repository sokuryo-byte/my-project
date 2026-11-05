/**
 * 01_Util.js
 * 汎用関数（GASサービスに依存しない純粋関数。Node.jsのテストからも読み込む）。
 */

var JST_OFFSET_MS = 9 * 3600 * 1000;

function nfkc_(s) {
  return String(s == null ? '' : s).normalize('NFKC');
}

/** ブランド照合用の正規化（全角半角統一・大文字化・空白/中黒/ハイフン類を除去） */
function normKey_(s) {
  return nfkc_(s).toUpperCase().replace(/[\s・\-‐－―ー_.·]/g, '');
}

/** 駅名照合用の正規化（括弧内・空白・末尾の「駅」を除去） */
function normStationName_(s) {
  return nfkc_(s)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s/g, '')
    .replace(/駅$/, '');
}

function toNum_(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var m = nfkc_(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function bool_(v) {
  if (typeof v === 'boolean') return v;
  var s = nfkc_(v).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'はい';
}

function splitList_(s) {
  return nfkc_(s).split(/[,、]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

/** 2点間の直線距離(m)。表示には使わず、検索範囲と異常値検出にのみ使う */
function haversineM_(a, b) {
  var R = 6371008.8;
  var toRad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * toRad;
  var dLng = (b.lng - a.lng) * toRad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** "123s" / "123.5s" → 秒数 */
function parseDurationSec_(d) {
  if (d == null) return null;
  var m = String(d).match(/^(\d+(\.\d+)?)s$/);
  return m ? Number(m[1]) : null;
}

/** Places APIのviewport（外接矩形）から面積の概算(m2)を出す。実面積ではない */
function viewportAreaM2_(vp) {
  if (!vp || !vp.low || !vp.high) return null;
  var lat = (vp.low.latitude + vp.high.latitude) / 2;
  var h = haversineM_({ lat: vp.low.latitude, lng: vp.low.longitude }, { lat: vp.high.latitude, lng: vp.low.longitude });
  var w = haversineM_({ lat: lat, lng: vp.low.longitude }, { lat: lat, lng: vp.high.longitude });
  return Math.round(h * w);
}

/**
 * 次の「HH:mm（日本時間）」の出発時刻をRFC3339(UTC)で返す。
 * weekdayOnly=true の場合は土日を避ける。現在時刻から15分以内の場合は翌日以降にする。
 */
function nextDepartureIso_(hhmm, weekdayOnly, nowMs) {
  var now = nowMs == null ? Date.now() : nowMs;
  var p = String(hhmm || '03:00').split(':');
  var h = Number(p[0]) || 0;
  var mi = Number(p[1]) || 0;
  var j = new Date(now + JST_OFFSET_MS);
  var cand = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), h, mi) - JST_OFFSET_MS;
  var isWeekend = function (ms) {
    var dow = new Date(ms + JST_OFFSET_MS).getUTCDay();
    return dow === 0 || dow === 6;
  };
  while (cand < now + 15 * 60 * 1000 || (weekdayOnly && isWeekend(cand))) {
    cand += 86400000;
  }
  return new Date(cand).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** 日本時間 "yyyy/MM/dd HH:mm" */
function formatJst_(dateOrMs) {
  var ms = dateOrMs instanceof Date ? dateOrMs.getTime() : (dateOrMs == null ? Date.now() : dateOrMs);
  var j = new Date(ms + JST_OFFSET_MS);
  return j.getUTCFullYear() + '/' + pad2_(j.getUTCMonth() + 1) + '/' + pad2_(j.getUTCDate()) + ' ' +
    pad2_(j.getUTCHours()) + ':' + pad2_(j.getUTCMinutes());
}

function makeRunId_(nowMs) {
  var j = new Date((nowMs == null ? Date.now() : nowMs) + JST_OFFSET_MS);
  return 'R' + j.getUTCFullYear() + pad2_(j.getUTCMonth() + 1) + pad2_(j.getUTCDate()) +
    pad2_(j.getUTCHours()) + pad2_(j.getUTCMinutes()) + pad2_(j.getUTCSeconds());
}

/** "yyyy/MM/dd HH:mm" を日本時間として解釈しエポックmsへ */
function parseJst_(s) {
  if (s instanceof Date) return s.getTime();
  var m = String(s || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - JST_OFFSET_MS;
}

function addFlag_(flags, msg) {
  if (msg && flags.indexOf(msg) < 0) flags.push(msg);
  return flags;
}
