/*
 * ウェルモ「建物管理｜編集」画面への入力処理（共通部分）。
 * Tampermonkey用スクリプトとブックマークレットの両方に組み込まれる。
 *
 * - 入力欄は画面の項目名（「マンスリー表示名」など）を手がかりに探す
 * - 保存ボタンは押さない・既存値を空にしない・建物設備はONにするだけ
 * - window.WellmoAutofill.run(data) で入力し、結果（入力した項目／手動が必要な項目）を返す
 */
(function () {
  'use strict';
  var VERSION = '0.2.0';
  var PANEL_ID = 'wm-autofill-panel';

  var norm = function (s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/\s+/g, '').replace(/必須$/, '');
  };
  var FIELD_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]),textarea,select';

  function isVisible(el) {
    if (!el) return false;
    if (el.tagName === 'SELECT') return true; // select2等で隠れたselectも対象
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return !r || r.width > 0 || r.height > 0 || el.offsetParent !== null;
  }

  /** 項目名に一致する要素（最も内側）を文書順に返す */
  function findLabelEls(label) {
    var target = norm(label);
    var all = document.querySelectorAll('th,td,label,dt,dd,div,span,p,li,h3,h4');
    var hits = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (norm(el.textContent) !== target) continue;
      if (el.querySelector(FIELD_SEL)) continue;
      // 子要素にも同じテキストがあれば内側を優先
      var inner = false;
      for (var j = 0; j < el.children.length; j++) {
        if (norm(el.children[j].textContent) === target) { inner = true; break; }
      }
      if (!inner) hits.push(el);
    }
    return hits;
  }

  /** 項目名の後ろにある入力欄（同じ行・ブロック内）を返す */
  function fieldsAfter(labelEl, selector) {
    var a = labelEl;
    for (var depth = 0; depth < 5 && a && a !== document.body; depth++) {
      a = a.parentElement;
      if (!a) break;
      var list = Array.prototype.filter.call(a.querySelectorAll(selector || FIELD_SEL), function (f) {
        return (labelEl.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && isVisible(f);
      });
      if (list.length) return list;
    }
    return [];
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  /** フレームワーク（Vue/React等）にも反映されるように値を設定 */
  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    fire(el, 'input');
    fire(el, 'change');
    fire(el, 'blur');
    if (window.jQuery) { try { window.jQuery(el).trigger('change'); } catch (e) { /* noop */ } }
  }

  function selectOption(sel, matcher) {
    var opts = Array.prototype.slice.call(sel.options);
    var hits = opts.filter(function (o) { return o.value !== '' && matcher(norm(o.text)); });
    if (hits.length !== 1) return { ok: false, count: hits.length };
    setValue(sel, hits[0].value);
    return { ok: true, text: hits[0].text };
  }

  /* ---------- 結果パネル ---------- */
  var report = { done: [], manual: [], info: [] };
  function done(k, v) { report.done.push(k + (v != null ? '：' + String(v).slice(0, 40) : '')); }
  function manual(k, why) { report.manual.push(k + '：' + why); }

  function showPanel(title, extraHtml) {
    var old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:380px;max-height:calc(100vh - 110px);overflow:auto;' +
      'background:#fff;border:1px solid #1c3a52;border-top:4px solid #1c3a52;border-radius:2px;padding:12px 14px;font:13px/1.6 sans-serif;color:#1d2a33;box-shadow:0 6px 20px rgba(0,0,0,.18)';
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var list = function (arr, color) {
      return arr.length ? '<ul style="margin:4px 0 8px 18px;padding:0;color:' + color + '">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<div style="color:#888;margin:4px 0 8px">なし</div>';
    };
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(title) + '</b>' +
      '<button type="button" id="' + PANEL_ID + '-close" style="border:1px solid #c8d1d7;background:#f4f6f8;border-radius:2px;padding:2px 10px;cursor:pointer">閉じる</button></div>' +
      (extraHtml || '') +
      (report.manual.length ? '<div style="margin-top:8px"><b style="color:#c00">⚠ 手動で入力・確認が必要</b>' + list(report.manual, '#c00') + '</div>' : '') +
      (report.info.length ? '<div><b>参考</b>' + list(report.info, '#333') + '</div>' : '') +
      '<div><b style="color:#080">✔ 入力した項目</b>' + list(report.done, '#080') + '</div>' +
      '<div style="margin-top:8px;padding:6px 8px;background:#fff6e0;border-left:3px solid #c98a00">内容を確認してから<b>ウェルモの「保存」を押してください</b>（このツールは保存しません）。 v' + VERSION + '</div>';
    document.body.appendChild(p);
    document.getElementById(PANEL_ID + '-close').onclick = function () { p.remove(); };
  }

  /* ---------- 入力処理 ---------- */
  function fillText(label, value, index) {
    if (value == null || value === '') return;
    var els = findLabelEls(label);
    if (!els.length) return manual(label, '画面に項目が見つからない');
    var fields = fieldsAfter(els[0]);
    var f = fields[index || 0];
    if (!f) return manual(label, '入力欄が見つからない');
    if (f.tagName === 'SELECT') return manual(label, '選択式のため手動で選択');
    if (f.readOnly || f.disabled) return manual(label, '入力不可の欄（' + value + '）');
    setValue(f, String(value));
    done(label, value);
  }

  function fillRadio(label, value) {
    if (!value) return;
    var els = findLabelEls(label);
    if (!els.length) return manual(label, '画面に項目が見つからない');
    var radios = fieldsAfter(els[0], 'input[type=radio]');
    var target = norm(value);
    for (var i = 0; i < radios.length; i++) {
      var r = radios[i];
      var text = r.labels && r.labels.length ? r.labels[0].textContent : (r.parentElement ? r.parentElement.textContent : '');
      if (norm(text) === target || norm(r.value) === target) {
        if (!r.checked) r.click();
        return done(label, value);
      }
    }
    manual(label, '「' + value + '」の選択肢が見つからない');
  }

  var STRUCT_MATCH = {
    'SRC': function (t) { return /^SRC/.test(t) || t.indexOf('鉄骨鉄筋') >= 0; },
    'RC': function (t) { return /^RC/.test(t) || (t.indexOf('鉄筋コンクリート') >= 0 && t.indexOf('鉄骨鉄筋') < 0); },
    '軽量鉄骨': function (t) { return t.indexOf('軽量鉄骨') >= 0; },
    'S': function (t) { return /^S(\(|造|$)/.test(t) || (t.indexOf('鉄骨') >= 0 && t.indexOf('軽量') < 0 && t.indexOf('鉄筋') < 0); },
    '木造': function (t) { return t.indexOf('木造') >= 0; },
    'その他': function (t) { return t.indexOf('その他') >= 0; }
  };

  function fillStructure(value) {
    if (!value) return;
    var els = findLabelEls('建物構造');
    if (!els.length) return manual('建物構造', '画面に項目が見つからない');
    var sel = fieldsAfter(els[0], 'select')[0];
    if (!sel) return manual('建物構造', '選択欄が見つからない（' + value + '）');
    var r = selectOption(sel, STRUCT_MATCH[value] || function (t) { return t.indexOf(norm(value)) >= 0; });
    if (r.ok) done('建物構造', r.text); else manual('建物構造', '「' + value + '」に一致する選択肢が' + r.count + '件');
  }

  // 路線名の表記ゆれ（会社名などの前置き）を除いた中核部分。例: 名古屋市鶴舞線/地下鉄鶴舞線 → 鶴舞線
  function lineCore(s) {
    return norm(s).replace(/^(名古屋市営?|名古屋市|地下鉄|市営地下鉄|市営|JR東海|JR|名鉄|近鉄|あおなみ線?|愛知環状鉄道|愛環)/, '');
  }

  function stationMatcher(st) {
    var name = norm(st['駅']).replace(/駅$/, '');
    var core = lineCore(st['路線']);
    return function (t) {
      var hasName = new RegExp('(^|[\\s　/・|])?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '駅?$').test(t) || t.indexOf(name + '駅') >= 0;
      if (!hasName) return false;
      return !core || t.indexOf(core) >= 0;
    };
  }

  function fillStations(list) {
    if (!list || !list.length) return;
    var labels = findLabelEls('最寄り駅');
    list.forEach(function (st, i) {
      var key = '最寄り駅' + (i + 1) + '（' + (st['路線'] || '') + '「' + st['駅'] + '」）';
      var lab = labels[i];
      if (!lab) return manual(key, '行が足りない。「＋」で行を追加してから再実行');
      var fields = fieldsAfter(lab);
      // 同じ行の最初の欄＝駅、次＝徒歩分、その次＝その他
      var stField = fields[0];
      if (stField && stField.tagName === 'SELECT') {
        var r = selectOption(stField, stationMatcher(st));
        if (r.ok) done(key, r.text);
        else manual(key, r.count ? '候補が' + r.count + '件あり特定できない' : '選択肢に見つからない（路線名の表記を確認）');
      } else {
        manual(key, '駅は検索選択式のため手動で選択');
      }
      var walk = fields[1];
      var other = fields[2];
      if (walk && st['徒歩'] !== undefined) {
        setValue(walk, st['徒歩'] === '' ? '' : String(st['徒歩']));
        done('最寄り駅' + (i + 1) + ' 徒歩', st['徒歩'] === '' ? '（空欄）' : st['徒歩'] + '分');
      }
      if (other && st['その他']) {
        setValue(other, st['その他']);
        done('最寄り駅' + (i + 1) + ' その他', st['その他']);
      }
    });
  }

  /** 建物設備ボタン：ONにするだけ（OFFにはしない） */
  function fillEquipment(names) {
    (names || []).forEach(function (name) {
      var els = findLabelEls(name);
      if (!els.length) return manual('建物設備「' + name + '」', 'ボタンが見つからない');
      var el = els[0];
      var box = null;
      var node = el;
      for (var d = 0; d < 4 && node && !box; d++) {
        box = node.querySelector ? node.querySelector('input[type=checkbox]') : null;
        if (!box && node.tagName === 'LABEL' && node.control) box = node.control;
        node = node.parentElement;
      }
      if (box) {
        if (!box.checked) {
          var lbl = box.labels && box.labels[0];
          (lbl || box).click();
          if (!box.checked) { box.checked = true; fire(box, 'change'); }
        }
        return done('建物設備', name);
      }
      manual('建物設備「' + name + '」', '状態を判定できないため手動でON');
    });
  }

  function fill(data) {
    fillText('マンスリー表示名', data['マンスリー表示名']);
    fillText('ふりがな', data['ふりがな']);
    fillText('建物名', data['建物名']);
    fillRadio('物件種別', data['物件種別']);
    if (data['所在地']) {
      report.info.push('所在地は「住所検索」で選択：' + (data['所在地']['郵便番号'] || '') + ' ' + (data['所在地']['住所'] || ''));
    }
    fillText('緯度', data['緯度']);
    fillText('経度', data['経度']);
    if (data['緯度'] != null) report.info.push('緯度・経度を入れても地図のピンは動かない場合があります。ピン位置を確認してください');
    fillText('周辺環境', data['周辺環境']);
    fillStations(data['最寄り駅']);
    fillText('その他アクセス', data['その他アクセス']);
    fillText('空港からのアクセス', data['空港からのアクセス']);
    fillEquipment(data['建物設備']);
    fillStructure(data['建物構造']);
    if (data['建物階数']) {
      fillText('建物階数', data['建物階数']['地上'], 0);
      fillText('建物階数', data['建物階数']['地下'], 1);
    }
    if (data['築年月']) {
      fillText('築年月', data['築年月']['年'], 0);
      fillText('築年月', data['築年月']['月'], 1);
    }
    fillText('総戸数', data['総戸数']);
  }

  /* ---------- 診断モード（入力欄の構造だけを出力。入力値は含めない） ---------- */
  var DIAG_LABELS = ['マンスリー表示名', 'ふりがな', '建物名', '物件種別', '所在地', '緯度', '経度', '周辺環境', '最寄り駅', '徒歩',
    'その他アクセス', '空港からのアクセス', 'エレベーター', 'オートロック', '宅配ボックス', '駐輪場', 'ゴミ捨て場',
    '建物構造', '建物階数', '築年月', '総戸数'];
  function describe(f) {
    var d = { tag: f.tagName.toLowerCase(), type: f.type || '', name: f.name || '', id: f.id || '',
      cls: (f.className && typeof f.className === 'string') ? f.className.slice(0, 80) : '', placeholder: f.placeholder || '',
      readonly: !!f.readOnly };
    if (f.tagName === 'SELECT') {
      d.options = f.options.length;
      d.sample = Array.prototype.slice.call(f.options, 0, 6).map(function (o) { return o.text; });
    }
    return d;
  }
  function diagnose() {
    var out = { tool: VERSION, url: location.pathname, jquery: !!window.jQuery, fields: {} };
    DIAG_LABELS.forEach(function (l) {
      out.fields[l] = findLabelEls(l).slice(0, 3).map(function (el) {
        var box = el.parentElement ? el.parentElement.querySelector('input[type=checkbox]') : null;
        return { labelTag: el.tagName.toLowerCase(), labelCls: String(el.className || '').slice(0, 60),
          after: fieldsAfter(el).slice(0, 4).map(describe), checkbox: box ? describe(box) : null };
      });
    });
    var text = JSON.stringify(out, null, 1);
    var copy = function () {
      if (navigator.clipboard) return navigator.clipboard.writeText(text);
      return Promise.reject(new Error('clipboard unavailable'));
    };
    copy().then(function () {
      report.info.push('診断結果をクリップボードにコピーしました（入力値は含みません）。開発担当に貼り付けて送ってください。');
      showPanel('ウェルモ自動入力：診断');
    }, function () {
      showPanel('ウェルモ自動入力：診断', '<textarea style="width:100%;height:200px">' + text.replace(/</g, '&lt;') + '</textarea><div>上の内容をコピーして開発担当に送ってください。</div>');
    });
  }

  /* ---------- 公開 ---------- */
  function parseInput(s) {
    var t = String(s || '').trim();
    try { return JSON.parse(t); } catch (e) { /* スプレッドシートのセルコピーで引用符が付いた場合 */ }
    if (/^".*"$/.test(t)) return JSON.parse(t.slice(1, -1).replace(/""/g, '"'));
    throw new Error('JSONとして読めません');
  }

  /** ウェルモの「保存」ボタン（自動では押さない。押されたことを検知するために使う） */
  function findSaveButton() {
    var cands = document.querySelectorAll('button, input[type=submit], input[type=button], a');
    for (var i = 0; i < cands.length; i++) {
      var t = norm(cands[i].textContent || cands[i].value);
      if (t === '保存') return cands[i];
    }
    return null;
  }

  window.WellmoAutofill = {
    VERSION: VERSION,
    /** データを入力し、結果パネルを表示して結果を返す */
    run: function (data, title) {
      report = { done: [], manual: [], info: [] };
      try { fill(data); } catch (e) { manual('処理エラー', e.message); }
      showPanel(title || ('ウェルモ自動入力：' + (data['建物名'] || '')));
      return report;
    },
    diagnose: function () { report = { done: [], manual: [], info: [] }; diagnose(); },
    parseInput: parseInput,
    findSaveButton: findSaveButton,
    /** 画面の項目の現在値（例: 建物名）。見つからなければ空文字 */
    valueOf: function (label) {
      var els = findLabelEls(label);
      var f = els.length ? fieldsAfter(els[0])[0] : null;
      return f ? String(f.value || '') : '';
    }
  };
})();
