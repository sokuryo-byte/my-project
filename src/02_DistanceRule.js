/**
 * 02_DistanceRule.js
 * 表示規約に関わる計算をこのファイルに集約する。
 *
 * - 徒歩所要時間：道路距離80mにつき1分。1分未満の端数は1分に切り上げ
 *   （不動産の表示に関する公正競争規約施行規則）。
 *   Routes APIの徒歩duration（Google独自の推定速度）は表示に使わない。
 * - 車の所要時間：Routes APIのduration（秒）を分に切り上げ。道路距離を併記できるようにする。
 */

/** 道路距離(m) → 徒歩分（80m/分、端数切り上げ、最小1分） */
function walkMinutes_(roadMeters, mPerMin) {
  if (roadMeters == null || isNaN(roadMeters)) return null;
  var unit = mPerMin || 80;
  return Math.max(1, Math.ceil(roadMeters / unit));
}

/** 秒 → 分（切り上げ、最小1分） */
function ceilMinutes_(sec) {
  if (sec == null || isNaN(sec)) return null;
  return Math.max(1, Math.ceil(sec / 60));
}

/** 表示用の距離（10m単位で切り上げ。短く見せない方向に丸める） */
function displayMeters_(m) {
  if (m == null) return null;
  return Math.ceil(m / 10) * 10;
}

/** 表示用のkm（0.1km単位で切り上げ） */
function displayKm_(m) {
  if (m == null) return null;
  return (Math.ceil(m / 100) / 10).toFixed(1);
}

/**
 * 道路距離の妥当性チェック。AIによる補正は行わず、怪しい値に「要確認」を付けるだけ。
 * @return {string[]} 要確認理由
 */
function distanceFlags_(roadM, straightM, detourMax) {
  var flags = [];
  if (roadM == null) {
    flags.push('徒歩経路が取得できない');
    return flags;
  }
  if (straightM != null && straightM - roadM > 20) {
    flags.push('道路距離が直線距離より短い（起点/施設の位置ずれの可能性）');
  }
  if (straightM != null && straightM > 50 && roadM / straightM > (detourMax || 2.0)) {
    flags.push('迂回率が高い（' + (roadM / straightM).toFixed(1) + '倍）');
  }
  return flags;
}
