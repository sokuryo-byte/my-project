const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./load');

const g = loadGas();
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const SAMPLE = fs.readFileSync(path.join(__dirname, 'fixtures', 'mysoku_realnetpro.txt'), 'utf8');

test('マイソク解析: RealNetPro形式（見出しと値が同じ行）', () => {
  const r = g.parseMysokuText_(SAMPLE);
  eq(r.fields, {
    '物件名': '名信ビル', '物件種別': 'マンション', '郵便番号': '464-0850',
    '建物構造': 'RC', '地上階数': 4, '地下階数': 0, '総戸数': 9, '築年': 1969, '築月': 5,
    '号室': '6', '住所': '愛知県名古屋市千種区今池3丁目39-21'
  });
  assert.equal(r.equipment['ゴミ捨て場'], true); // 専用ごみ置場
  assert.equal(r.equipment['TVドアホン'], false); // インターホンのみ
  eq(r.stations, [
    { line: '桜通線', name: '吹上', minutes: 7 },
    { line: '東山線', name: '今池', minutes: 9 },
    { line: '東山線', name: '千種', minutes: 14 }
  ]);
  assert.equal(r.equipment['バストイレ別'], true);
  assert.equal(r.equipment['独立洗面台'], true);
  assert.equal(r.equipment['駐車場'], false);
  assert.equal(r.equipment['オートロック'], false);
  assert.equal(r.equipment['エレベーター'], false);
  assert.match(r.notes.join(), /帖数/); // 間取図が画像のため読めない
});

test('マイソク解析: 見出しと値が別の行（ドキュメント変換で表が分かれる場合）', () => {
  const txt = [
    '物件名', 'ハイツ桜', '号室名', '203号室', '所在地', '〒461-0001', '愛知県名古屋市東区泉1丁目1-1',
    '交通', '地下鉄桜通線「高岳」駅 徒歩5分 / 名古屋市営バス「泉一丁目」停 徒歩2分', '名鉄瀬戸線「東大手」駅 徒歩11分',
    '駐車場', '有（月額15,000円）', '設 備', 'オートロック・エレベーター・宅配ボックス・角部屋・駐輪場・インターネット無料(USEN AIR)',
    '間取', '洋室7.5帖 DK3帖', '条 件', '2人入居可'
  ].join('\n');
  const r = g.parseMysokuText_(txt);
  eq(r.fields, { '物件名': 'ハイツ桜', '郵便番号': '461-0001', '号室': '203', '住所': '愛知県名古屋市東区泉1丁目1-1', 'Wi-Fiサービス名': 'USEN AIR', '最大洋室帖数': 7.5 });
  eq(r.stations.map((s) => s.line + '|' + s.name + '|' + s.minutes), ['地下鉄桜通線|高岳|5', '名鉄瀬戸線|東大手|11']);
  ['駐車場', 'オートロック', 'エレベーター', '宅配BOX', '角部屋', '自転車駐輪可能', '無料Wi-Fi'].forEach((k) => assert.equal(r.equipment[k], true, k));
  assert.equal(r.notes.length, 0);
});

test('マイソク反映: 空欄だけ埋める・入力済は上書きしない', () => {
  const parsed = g.parseMysokuText_(SAMPLE);
  const prop = { '物件名': '', '建物名': '名信ビル（手入力）', '号室': '', '住所': '', 'バストイレ別': false, '独立洗面台': true,
    'マイソク駅1_駅名': '', 'マイソク駅2_駅名': '', 'マイソク駅3_駅名': '' };
  const r = g.mysokuPatch_(prop, parsed);
  eq(r.patch, {
    '物件名': '名信ビル', '号室': '6', '住所': '愛知県名古屋市千種区今池3丁目39-21',
    'マイソク駅1_駅名': '吹上', 'マイソク駅1_路線': '桜通線', 'マイソク駅1_徒歩分': 7,
    'マイソク駅2_駅名': '今池', 'マイソク駅2_路線': '東山線', 'マイソク駅2_徒歩分': 9,
    'マイソク駅3_駅名': '千種', 'マイソク駅3_路線': '東山線', 'マイソク駅3_徒歩分': 14,
    '物件種別': 'マンション', '郵便番号': '464-0850', '建物構造': 'RC', '地上階数': 4, '地下階数': 0,
    '総戸数': 9, '築年': 1969, '築月': 5,
    'エリア': '千種区',
    'バストイレ別': true, 'ゴミ捨て場': true
  });
  assert.match(r.skipped.join(), /建物名/);
});

test('DriveのURLからファイルID', () => {
  assert.equal(g.driveFileId_('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing'), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.equal(g.driveFileId_('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345'), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.equal(g.driveFileId_('abc'), '');
});

test('タイトル: マイソク取込後の例（名信ビル）', () => {
  const p = { 'エリア': '千種区', '建物名': '名信ビル', '号室': '6', 'バストイレ別': true, '独立洗面台': true };
  const t = g.buildTitle_(p, { name: '吹上', minutes: 7 }, '', { title_max_length: '60', title_station_walk_max_min: '10', title_room_format: '{建物名}' });
  assert.equal(t.title, '【千種区/吹上駅徒歩7分/バストイレ別・独立洗面台】名信ビル');
});

test('マイソク解析: Googleドキュメント変換の実データ（1行に複数項目が並ぶ）', () => {
  const t = fs.readFileSync(path.join(__dirname, 'fixtures', 'mysoku_realnetpro_drive.txt'), 'utf8');
  const r = g.parseMysokuText_(t);
  assert.equal(r.fields['物件名'], '名信ビル');
  assert.equal(r.fields['号室'], '6');
  assert.equal(r.fields['郵便番号'], '464-0850');
  assert.equal(r.fields['住所'], '愛知県名古屋市千種区今池3丁目39-21');
  eq(r.stations.map((s) => s.line + '「' + s.name + '」' + s.minutes), ['桜通線「吹上」7', '東山線「今池」9', '東山線「千種」14']);
  assert.equal(r.fields['建物構造'], 'RC');
  assert.equal(r.fields['総戸数'], 9);
  assert.equal(r.fields['築年'], 1969);
  assert.equal(r.equipment['バストイレ別'], true);
  assert.equal(r.equipment['独立洗面台'], true);
  assert.equal(r.equipment['ゴミ捨て場'], true);
  assert.equal(r.equipment['駐車場'], false);
});
