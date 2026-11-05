/*
 * ブックマークレット版：「ウェルモJSON」を貼り付けて入力する（Tampermonkeyを使えない環境向けの予備）。
 * wellmo-core.js の後ろに連結して使う。
 */
(function () {
  'use strict';
  var W = window.WellmoAutofill;
  var input = window.prompt('ウェルモ自動入力 v' + W.VERSION + '\n「出力」シートの「ウェルモJSON」を貼り付けてOK\n（入力欄の診断は「診断」と入力）', '');
  if (input == null || input.trim() === '') return;
  if (input.trim() === '診断') { W.diagnose(); return; }
  var data;
  try {
    data = W.parseInput(input);
  } catch (e) {
    window.alert('貼り付けた内容を読み取れませんでした：' + e.message);
    return;
  }
  W.run(data);
})();
