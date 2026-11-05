// ==UserScript==
// @name         ウェルモ自動入力（マンスリー周辺調査）
// @namespace    monthly-nearby-survey
// @version      0.3.0
// @description  周辺調査アプリの結果を、ウェルモ「建物管理｜編集」画面に一括入力する（保存は担当者が押す）
// @match        https://wm-system.com/build/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

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
  var VERSION = '0.3.0';
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
  function fieldsAfter(labelEl, selector, includeHidden) {
    var a = labelEl;
    for (var depth = 0; depth < 5 && a && a !== document.body; depth++) {
      a = a.parentElement;
      if (!a) break;
      var list = Array.prototype.filter.call(a.querySelectorAll(selector || FIELD_SEL), function (f) {
        return (labelEl.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && (includeHidden || isVisible(f));
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

  function selectOption(sel, matcher, prefer) {
    var opts = Array.prototype.slice.call(sel.options);
    var hits = opts.filter(function (o) { return o.value !== '' && matcher(norm(o.text)); });
    if (hits.length > 1 && prefer) {
      var pre = hits.filter(function (o) { return prefer(norm(o.text)); });
      if (pre.length >= 1) hits = pre;
    }
    if (hits.length > 1) {
      // 最も短い（＝余計な語のない）選択肢が1つだけならそれを選ぶ
      var min = Math.min.apply(null, hits.map(function (o) { return norm(o.text).length; }));
      var shortest = hits.filter(function (o) { return norm(o.text).length === min; });
      if (shortest.length === 1) hits = shortest;
    }
    if (hits.length !== 1) return { ok: false, count: hits.length, sample: hits.slice(0, 4).map(function (o) { return o.text; }) };
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
    var radios = fieldsAfter(els[0], 'input[type=radio]', true); // 見た目を作り込んだ画面ではラジオ本体が隠れている
    var target = norm(value);
    var radioText = function (r) {
      if (r.labels && r.labels.length) return r.labels[0].textContent;
      var sib = r.nextSibling;
      while (sib && sib.nodeType === 3 && !sib.textContent.trim()) sib = sib.nextSibling;
      if (sib && norm(sib.textContent)) return sib.textContent;
      return r.parentElement ? r.parentElement.textContent : '';
    };
    for (var i = 0; i < radios.length; i++) {
      var r = radios[i];
      if (norm(radioText(r)) === target || norm(r.value) === target) {
        if (!r.checked) {
          var lbl = r.labels && r.labels[0];
          (lbl || r).click();
          if (!r.checked) { r.checked = true; fire(r, 'change'); }
        }
        return done(label, value);
      }
    }
    // ラジオ本体がない（見た目だけの選択肢）場合は、文字が一致する要素を押す
    var row = els[0].parentElement;
    for (var d = 0; d < 4 && row; d++, row = row.parentElement) {
      var opts = Array.prototype.filter.call(row.querySelectorAll('label,span,div,li,button'), function (x) {
        return norm(x.textContent) === target && (els[0].compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      if (opts.length) { opts[opts.length - 1].click(); return done(label, value + '（選択ボタンを押しました。表示を確認してください）'); }
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
    var code = norm(value);
    var r = selectOption(sel, STRUCT_MATCH[value] || function (t) { return t.indexOf(code) >= 0; },
      function (t) { return t === code || t.indexOf(code + '(') === 0 || t.indexOf(code + '造') === 0; });
    if (r.ok) done('建物構造', r.text);
    else manual('建物構造', '「' + value + '」に一致する選択肢が' + r.count + '件' + (r.sample ? '（' + r.sample.join('／') + '）' : '') + '。手動で選択');
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

  /** 最寄り駅の「＋」（行の追加）ボタンを探す */
  function findAddStationButton() {
    var labels = findLabelEls('最寄り駅');
    if (!labels.length) return null;
    var last = labels[labels.length - 1];
    var stop = findLabelEls('その他アクセス')[0];
    var cands = document.querySelectorAll('button, a, span, i, div');
    for (var i = 0; i < cands.length; i++) {
      var x = cands[i];
      if (!(last.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (stop && !(x.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
      var t = norm(x.textContent), cls = String(x.className || '');
      if ((t === '+' || t === '＋' || /(^|[-_ ])(plus|add)([-_ ]|$)/i.test(cls) || /追加/.test(x.getAttribute('aria-label') || x.title || '')) && x.children.length <= 2) return x;
    }
    return null;
  }

  /** 駅の行が足りなければ「＋」を押して増やす（画面の更新を待つため Promise） */
  function ensureStationRows(count) {
    return new Promise(function (resolve) {
      var tries = 0;
      (function step() {
        var have = document.querySelector('select[name="' + WM.station + '"]') ? stationSelects().length : findLabelEls('最寄り駅').length;
        if (have >= count || tries >= count) return resolve();
        var btn = findAddStationButton();
        if (!btn) return resolve();
        btn.click(); tries++;
        setTimeout(step, 350);
      })();
    });
  }

  function fillStations(list) {
    if (!list || !list.length) return;
    var labels = findLabelEls('最寄り駅');
    list.forEach(function (st, i) {
      var key = '最寄り駅' + (i + 1) + '（' + (st['路線'] || '') + '「' + st['駅'] + '」）';
      var lab = labels[i];
      if (!lab) return manual(key, '行が足りない。「＋」で行を追加してから、もう一度入力');
      var fields = fieldsAfter(lab);
      // 同じ行の最初の欄＝駅、次＝徒歩分、その次＝その他
      var stField = fields[0];
      if (stField && stField.tagName === 'SELECT') {
        var usable = Array.prototype.filter.call(stField.options, function (o) { return o.value !== ''; }).length;
        var r = usable ? selectOption(stField, stationMatcher(st)) : { ok: false, count: 0 };
        if (r.ok) done(key, r.text);
        else if (!usable) manual(key, '駅の選択肢が読み込まれていない（検索して選ぶ形式の可能性）。手動で選択');
        else manual(key, r.count ? '候補が' + r.count + '件あり特定できない' : '選択肢' + usable + '件の中に見つからない（路線名の表記を確認）');
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

  /* ---------- ウェルモ実画面の入力欄（name属性。診断結果より） ---------- */
  var WM = {
    title: 'display_name', kana: 'display_kana', build: 'buildName',
    address: 'buildAddress', detail: 'address_detail_text', lat: 'build_address_lat', lng: 'build_address_lng',
    around: 'address_memo', station: 'use_stations[station_codes][]', walk: 'use_stations[walk_minutes][]', info: 'use_stations[info][]',
    other: 'access_other', airport: 'access_airport', structure: 'structure',
    up: 'floor_up', down: 'floor_down', year: 'build_year', month: 'build_month', units: 'total_units'
  };
  var ADDRESS_SEARCH_ID = 'buildAddressInputNew';
  var TEMPLATE_STATION_ID = 'tmpStationSelect';

  function byName(name) { return document.querySelector('[name="' + name + '"]'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitFor(fn, timeout) {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      (function poll() {
        var v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > (timeout || 4000)) return resolve(null);
        setTimeout(poll, 150);
      })();
    });
  }
  function shown(el) { return !!el && el.getClientRects().length > 0; }
  /** 検索欄への入力（blur しない＝候補リストを閉じない） */
  function typeSearch(input, text) {
    input.focus();
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    desc.set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
  }
  function setNamed(label, name, value, idx) {
    if (value == null || value === '') return;
    var el = byName(name);
    if (!el) return fillText(label, value, idx); // 画面が変わっていたら項目名で探す
    if (el.readOnly || el.disabled) return manual(label, '入力不可の欄（' + value + '）');
    setValue(el, String(value));
    done(label, value);
  }

  /** 所在地：住所検索（select2）で郵便番号を検索して選び、残り（番地など）を「左記以外」に入れる */
  async function fillAddress(addr) {
    if (!addr) return;
    var full = String(addr['住所'] || '');
    var postal = String(addr['郵便番号'] || '');
    var label = '所在地（' + (postal ? '〒' + postal + ' ' : '') + full + '）';
    var sel = document.getElementById(ADDRESS_SEARCH_ID);
    var shownAddr = byName(WM.address);
    if (!sel || !shownAddr) { report.info.push('所在地は「住所検索」で選択：' + label); return; }
    if (shownAddr.value) { report.info.push('所在地は入力済みのため変更しませんでした：' + shownAddr.value); return fillDetail(shownAddr.value, full); }
    var container = sel.nextElementSibling && /select2/.test(sel.nextElementSibling.className) ? sel.nextElementSibling : sel.parentElement.querySelector('.select2');
    var opener = container && container.querySelector('.select2-selection');
    if (!opener) return manual(label, '住所検索を開けません。手動で検索してください');
    var terms = [postal, postal.replace(/-/g, ''), full.replace(/(丁目|番地?|\d).*$/, '')].filter(function (t, i, arr) { return t && arr.indexOf(t) === i; });
    var target = norm(full);
    for (var i = 0; i < terms.length; i++) {
      opener.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      opener.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      opener.click();
      var search = await waitFor(function () { return document.querySelector('.select2-container--open .select2-search__field'); }, 2000);
      if (!search) break;
      typeSearch(search, terms[i]);
      var opts = await waitFor(function () {
        var list = document.querySelectorAll('.select2-container--open .select2-results__option');
        var real = Array.prototype.filter.call(list, function (o) { return !/loading|message/.test(o.className) && norm(o.textContent); });
        return real.length ? real : null;
      }, 4000);
      if (!opts) { document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', keyCode: 27 })); continue; }
      // 物件住所の先頭と最も長く一致する候補を選ぶ
      var best = null, bestLen = 0;
      opts.forEach(function (o) {
        var t = norm(o.textContent).replace(/^〒?\d{3}-?\d{4}/, '');
        var k = 0; while (k < t.length && t[k] === target[k]) k++;
        if (k === t.length && k > bestLen) { best = o; bestLen = k; }
      });
      if (!best && opts.length === 1) best = opts[0];
      if (!best) continue;
      best.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      best.click();
      var v = await waitFor(function () { return shownAddr.value; }, 2000);
      if (v) { done('所在地', v); return fillDetail(v, full); }
    }
    manual(label, '住所検索で候補を選べませんでした。手動で検索してください');
  }
  /** 選ばれた住所の続き（番地など）を「左記以外」に入れる */
  function fillDetail(picked, full) {
    var p = norm(picked).replace(/^〒?\d{3}-?\d{4}/, ''), f = norm(full);
    var detail = f.indexOf(p) === 0 ? f.slice(p.length) : '';
    var el = byName(WM.detail);
    if (!el) return;
    if (!detail) return report.info.push('「左記以外」（番地など）を確認してください');
    if (el.value) return report.info.push('「左記以外」は入力済みのため変更しませんでした');
    setValue(el, detail);
    done('所在地（左記以外）', detail);
  }

  /** 表示されている駅の行（非表示のひな形を除く） */
  function stationSelects() {
    return Array.prototype.filter.call(document.querySelectorAll('select[name="' + WM.station + '"]'), function (s) {
      if (s.id === TEMPLATE_STATION_ID) return false;
      return shown(s.closest('.SumoSelect') || s.parentElement);
    });
  }
  function rowOf(sel) { return sel.closest('dl') || sel.closest('tr') || sel.closest('li') || sel.parentElement.parentElement; }

  /** 駅を選ぶ：選択肢になければ検索欄に駅名を入れて候補を読み込ませる */
  async function chooseStation(sel, st) {
    var m = stationMatcher(st);
    var pick = function () {
      var r = selectOption(sel, m);
      if (!r.ok) return r;
      // 見た目（SumoSelect）の選択も合わせる
      var wrap = sel.closest('.SumoSelect');
      var li = wrap && Array.prototype.filter.call(wrap.querySelectorAll('li'), function (x) { return norm(x.textContent) === norm(r.text); })[0];
      if (li) li.click();
      return r;
    };
    var r0 = pick();
    if (r0.ok || r0.count > 1) return r0;
    var wrap = sel.closest('.SumoSelect') || sel.parentElement;
    var cap = wrap.querySelector('.CaptionCont, p');
    if (cap) cap.click();
    var search = await waitFor(function () { return wrap.querySelector('input.search-txt, input[type=search], input[type=text]:not([name])'); }, 1500);
    if (!search) return { ok: false, count: 0, reason: '検索欄が見つからない' };
    var name = norm(st['駅']).replace(/駅$/, '');
    typeSearch(search, name);
    var hit = await waitFor(function () {
      return Array.prototype.some.call(sel.options, function (o) { return o.value !== '' && m(norm(o.text)); });
    }, 5000);
    var r = hit ? pick() : { ok: false, count: 0, reason: '検索しても候補に出ない' };
    if (cap && wrap.classList.contains('open')) cap.click();
    return r;
  }

  async function fillStationsAsync(list) {
    if (!list || !list.length) return;
    if (!document.querySelector('select[name="' + WM.station + '"]')) return fillStations(list); // 画面が変わっていたら従来の方法
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      var key = '最寄り駅' + (i + 1) + '（' + (st['路線'] || '') + '「' + st['駅'] + '」）';
      var sel = stationSelects()[i];
      if (!sel) { manual(key, '行が足りない。「＋」で行を追加してから、もう一度入力'); continue; }
      var r = await chooseStation(sel, st);
      if (r.ok) done(key, r.text);
      else manual(key, r.count > 1 ? '候補が' + r.count + '件あり特定できない（' + (r.sample || []).join('／') + '）' : (r.reason || '候補に見つからない') + '。手動で選択');
      var row = rowOf(sel);
      var walk = row && row.querySelector('[name="' + WM.walk + '"]');
      var info = row && row.querySelector('[name="' + WM.info + '"]');
      if (walk && st['徒歩'] !== undefined) {
        setValue(walk, st['徒歩'] === '' ? '' : String(st['徒歩']));
        done('最寄り駅' + (i + 1) + ' 徒歩', st['徒歩'] === '' ? '（空欄）' : st['徒歩'] + '分');
      }
      if (info && st['その他']) { setValue(info, st['その他']); done('最寄り駅' + (i + 1) + ' その他', st['その他']); }
    }
  }

  function fillStructureNamed(value) {
    if (!value) return;
    var sel = byName(WM.structure);
    if (!sel || sel.tagName !== 'SELECT') return fillStructure(value);
    var code = norm(value);
    var r = selectOption(sel, STRUCT_MATCH[value] || function (t) { return t.indexOf(code) >= 0; },
      function (t) { return t === code || t.indexOf(code + '(') === 0 || t.indexOf(code + '造') === 0; });
    if (r.ok) done('建物構造', r.text);
    else manual('建物構造', '「' + value + '」に一致する選択肢が' + r.count + '件' + (r.sample ? '（' + r.sample.join('／') + '）' : '') + '。手動で選択');
  }

  async function fill(data) {
    setNamed('マンスリー表示名', WM.title, data['マンスリー表示名']);
    setNamed('ふりがな', WM.kana, data['ふりがな']);
    setNamed('建物名', WM.build, data['建物名']);
    fillRadio('物件種別', data['物件種別']);
    await fillAddress(data['所在地']);
    setNamed('緯度', WM.lat, data['緯度']);
    setNamed('経度', WM.lng, data['経度']);
    if (data['緯度'] != null) report.info.push('緯度・経度を入れても地図のピンは動かない場合があります。ピン位置を確認してください');
    setNamed('周辺環境', WM.around, data['周辺環境']);
    await fillStationsAsync(data['最寄り駅']);
    setNamed('その他アクセス', WM.other, data['その他アクセス']);
    setNamed('空港からのアクセス', WM.airport, data['空港からのアクセス']);
    fillEquipment(data['建物設備']);
    fillStructureNamed(data['建物構造']);
    if (data['建物階数']) {
      setNamed('建物階数（地上）', WM.up, data['建物階数']['地上'], 0);
      setNamed('建物階数（地下）', WM.down, data['建物階数']['地下'], 1);
    }
    if (data['築年月']) {
      setNamed('築年', WM.year, data['築年月']['年'], 0);
      setNamed('築月', WM.month, data['築年月']['月'], 1);
    }
    setNamed('総戸数', WM.units, data['総戸数']);
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
    out.radios = findLabelEls('物件種別').slice(0, 1).map(function (el) {
      return fieldsAfter(el, 'input[type=radio]', true).slice(0, 6).map(function (r) {
        var d = describe(r);
        d.hiddenInput = !isVisible(r) || getComputedStyle(r).display === 'none' || getComputedStyle(r).opacity === '0';
        d.label = r.labels && r.labels[0] ? norm(r.labels[0].textContent) : '';
        d.parent = r.parentElement ? r.parentElement.tagName.toLowerCase() + '.' + String(r.parentElement.className || '').slice(0, 40) + ' 「' + norm(r.parentElement.textContent).slice(0, 20) + '」' : '';
        return d;
      });
    });
    out.stations = findLabelEls('最寄り駅').map(function (el) {
      return fieldsAfter(el, 'select,input', true).slice(0, 4).map(function (f) {
        var d = describe(f);
        d.hidden = !isVisible(f);
        if (f.tagName === 'SELECT') {
          d.sample = Array.prototype.slice.call(f.options, 0, 12).map(function (o) { return o.text; });
          var nx = f.nextElementSibling;
          d.widget = nx ? nx.tagName.toLowerCase() + '.' + String(nx.className || '').slice(0, 60) : '';
        }
        return d;
      });
    });
    var shape = function (el, depth) {
      if (!el || depth < 0) return null;
      return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60), name: el.getAttribute('name') || '', type: el.getAttribute('type') || '',
        kids: Array.prototype.slice.call(el.children, 0, 8).map(function (c) { return shape(c, depth - 1); }).filter(Boolean) };
    };
    var firstSt = document.querySelector('select[name="use_stations[station_codes][]"]:not(#tmpStationSelect)');
    out.stationWidget = firstSt ? shape(firstSt.closest('.SumoSelect') || firstSt.parentElement, 3) : null;
    var addrSel = document.getElementById('buildAddressInputNew');
    out.addressWidget = addrSel ? shape(addrSel.parentElement, 3) : null;
    out.equipment = ['エレベーター', 'ゴミ捨て場'].map(function (nm) {
      var el = findLabelEls(nm)[0];
      var chain = [], x = el;
      for (var k = 0; k < 4 && x; k++, x = x.parentElement) chain.push(x.tagName.toLowerCase() + '.' + String(x.className || '').slice(0, 40));
      var holder = el ? el.closest('label, li, a, button') || (el.parentElement && el.parentElement.parentElement) : null;
      var ins = holder ? Array.prototype.map.call(holder.querySelectorAll('input'), function (i) { return { type: i.type, name: i.name, checked: !!i.checked }; }) : [];
      return { name: nm, chain: chain, inputs: ins };
    });
    var add = findAddStationButton();
    out.addButton = add ? { tag: add.tagName.toLowerCase(), cls: String(add.className || '').slice(0, 60), text: norm(add.textContent) } : null;
    var structSel = findLabelEls('建物構造')[0];
    var ss = structSel ? fieldsAfter(structSel, 'select', true)[0] : null;
    out.structureOptions = ss ? Array.prototype.map.call(ss.options, function (o) { return o.text; }) : null;
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
      var need = (data['最寄り駅'] || []).length;
      showPanel('ウェルモ自動入力：入力しています…');
      return ensureStationRows(need).then(function () { return fill(data); })
        .catch(function (e) { manual('処理エラー', e.message); })
        .then(function () {
          showPanel(title || ('ウェルモ自動入力：' + (data['建物名'] || '')));
          return report;
        });
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

/*
 * Tampermonkey用：ウェルモ「建物管理」画面に「周辺調査から入力」パネルを出す。
 * wellmo-core.js の後ろに連結して使う（ヘッダーは build-bookmarklet.js が付ける）。
 *
 * 流れ: パネルを開く → 入力できる物件の一覧（周辺調査アプリのウェブアプリURLから取得）
 *       → 物件を選ぶ → 全項目を入力 → 担当者が内容を見て「保存」 → 押されたら「ウェルモ入力済」を記録
 */
(function () {
  'use strict';
  var W = window.WellmoAutofill;
  var KEY_URL = 'webappUrl';
  var KEY_PENDING = 'pendingMark';
  var ROOT_ID = 'wm-survey-launcher';
  // 動作テスト用のサンプル（保存しない前提）
  var SAMPLE = {
    'マンスリー表示名': '【千種区/吹上駅徒歩7分/バストイレ別・独立洗面台】（テスト）名信ビル',
    'ふりがな': 'てすとめいしんびる',
    '建物名': '【テスト】名信ビル',
    '物件種別': 'マンション',
    '所在地': { '郵便番号': '464-0850', '住所': '愛知県名古屋市千種区今池3丁目39-21' },
    '緯度': 35.164462, '経度': 136.933913,
    '周辺環境': '（テスト）スーパーまで徒歩約5分\n（テスト）コンビニまで徒歩約2分',
    '最寄り駅': [
      { '路線': '桜通線', '駅': '吹上', '徒歩': 7, 'その他': '' },
      { '路線': '東山線', '駅': '今池', '徒歩': 9, 'その他': '' },
      { '路線': '東山線', '駅': '千種', '徒歩': '', 'その他': 'バスで31分' }
    ],
    'その他アクセス': '名古屋市営バス「今池」停から徒歩約3分',
    '空港からのアクセス': '県営名古屋空港から車で約24分（有料道路あり）',
    '建物設備': ['ゴミ捨て場'],
    '建物構造': 'RC',
    '建物階数': { '地上': 4, '地下': 0 },
    '築年月': { '年': 1969, '月': 5 },
    '総戸数': 9
  };

  var css = [
    '#' + ROOT_ID + '{position:fixed;right:16px;bottom:16px;z-index:2147483646;font:13px/1.6 "BIZ UDPGothic","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif;color:#1d2a33}',
    '#' + ROOT_ID + ' .wm-open{background:#1c3a52;color:#fff;border:0;border-radius:2px;padding:10px 16px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.22)}',
    '#' + ROOT_ID + ' .wm-panel{width:440px;max-width:calc(100vw - 32px);max-height:70vh;display:flex;flex-direction:column;background:#fff;border:1px solid #1c3a52;border-top:4px solid #1c3a52;border-radius:2px;box-shadow:0 8px 24px rgba(0,0,0,.2)}',
    '#' + ROOT_ID + ' .wm-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #d5dde2;font-weight:700}',
    '#' + ROOT_ID + ' .wm-head span{flex:1}',
    '#' + ROOT_ID + ' .wm-body{overflow:auto;padding:10px 12px;display:grid;gap:8px}',
    '#' + ROOT_ID + ' button.wm-btn{border:1px solid #b9c5cc;background:#f4f6f8;border-radius:2px;padding:4px 10px;cursor:pointer;font:inherit}',
    '#' + ROOT_ID + ' button.wm-primary{background:#1c3a52;border-color:#1c3a52;color:#fff;font-weight:700}',
    '#' + ROOT_ID + ' input.wm-in{width:100%;box-sizing:border-box;border:1px solid #b9c5cc;border-radius:2px;padding:6px 8px;font:inherit}',
    '#' + ROOT_ID + ' table{width:100%;border-collapse:collapse}',
    '#' + ROOT_ID + ' td{border-top:1px solid #e3e8eb;padding:6px 4px;vertical-align:middle}',
    '#' + ROOT_ID + ' tr.wm-match td{background:#eaf2f8}',
    '#' + ROOT_ID + ' .wm-sub{color:#5b6b75;font-size:12px}',
    '#' + ROOT_ID + ' .wm-tag{display:inline-block;font-size:11px;font-weight:700;padding:0 6px;border:1px solid currentColor;border-radius:2px}',
    '#' + ROOT_ID + ' .wm-ok{color:#1f6f43}#' + ROOT_ID + ' .wm-warn{color:#8a5a00}#' + ROOT_ID + ' .wm-done{color:#5b6b75}',
    '#' + ROOT_ID + ' .wm-msg{padding:8px 10px;background:#f4f6f8;border-left:3px solid #1c3a52}',
    '#' + ROOT_ID + ' .wm-err{background:#fdecea;border-left-color:#b3261e}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFKC').replace(/\s+/g, ''); }

  /** 周辺調査アプリ（GASウェブアプリ）を呼ぶ。Googleのログイン状態をそのまま使う */
  function callApp(params) {
    var base = GM_getValue(KEY_URL, '');
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: base + (base.indexOf('?') >= 0 ? '&' : '?') + q,
        timeout: 30000,
        onload: function (res) {
          var body;
          try { body = JSON.parse(res.responseText); } catch (e) {
            reject(new Error('周辺調査アプリから応答がありません。ブラウザでGoogle（部門アカウント）にログインしているか、ウェブアプリのURLが正しいか確認してください。'));
            return;
          }
          if (!body.ok) { reject(new Error(body.error || '処理できませんでした')); return; }
          resolve(body);
        },
        onerror: function () { reject(new Error('周辺調査アプリに接続できませんでした。')); },
        ontimeout: function () { reject(new Error('周辺調査アプリの応答がタイムアウトしました。')); }
      });
    });
  }

  /* ---------- 画面 ---------- */
  var root, state = { items: [], q: '', msg: '', err: false, busy: false };

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = ROOT_ID;
    document.body.appendChild(root);
    renderClosed();
    retryPendingMark();
  }
  function renderClosed() {
    root.innerHTML = '<button type="button" class="wm-open">周辺調査から入力</button>';
    root.querySelector('.wm-open').onclick = openPanel;
  }
  function frame(title, body) {
    root.innerHTML = '<div class="wm-panel" role="dialog" aria-label="' + esc(title) + '"><div class="wm-head"><span>' + esc(title) + '</span>' +
      '<button type="button" class="wm-btn" data-a="settings">設定</button><button type="button" class="wm-btn" data-a="close">閉じる</button></div>' +
      '<div class="wm-body">' + body + '</div></div>';
    root.querySelector('[data-a=close]').onclick = renderClosed;
    root.querySelector('[data-a=settings]').onclick = renderSettings;
  }

  function renderSettings() {
    var url = GM_getValue(KEY_URL, '');
    frame('周辺調査から入力：設定',
      '<div>周辺調査アプリの<b>ウェブアプリURL</b>を貼り付けてください（アプリの「ウェルモ入力」画面に表示されています）。</div>' +
      '<input class="wm-in" id="wm-url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(url) + '">' +
      '<div><button type="button" class="wm-btn wm-primary" id="wm-save">保存して一覧を表示</button></div>' +
      '<div style="border-top:1px solid #d5dde2;padding-top:8px"><b>動作テスト</b>（アプリのURLがなくても使えます）</div>' +
      '<div class="wm-sub">サンプルデータでこの画面に入力してみます。<b>テスト後は保存せず</b>「保存せずに戻る」で終えてください。</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="wm-btn" id="wm-test">サンプルで入力テスト</button>' +
      '<button type="button" class="wm-btn" id="wm-diag">入力欄の診断をコピー</button></div>');
    root.querySelector('#wm-test').onclick = function () {
      renderClosed();
      W.run(SAMPLE, 'ウェルモ自動入力：テスト（保存しないでください）');
    };
    root.querySelector('#wm-diag').onclick = function () { W.diagnose(); };
    root.querySelector('#wm-save').onclick = function () {
      var v = root.querySelector('#wm-url').value.trim();
      if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(v)) { alert('「https://script.google.com/…/exec」の形のURLを入力してください'); return; }
      GM_setValue(KEY_URL, v);
      openPanel();
    };
  }

  // 編集画面の「建物名」欄の値（既存の建物を開いたとき、その物件を一覧の先頭に出す）
  function currentBuildingName() { return W.valueOf('建物名'); }

  function openPanel() {
    if (!GM_getValue(KEY_URL, '')) { renderSettings(); return; }
    state.busy = true; renderList();
    callApp({ api: 'wellmo-list' }).then(function (r) {
      state.items = r.items || []; state.busy = false; state.msg = ''; renderList();
    }).catch(function (e) { state.busy = false; state.msg = e.message; state.err = true; renderList(); });
  }

  function renderList() {
    var here = norm(currentBuildingName());
    var q = norm(state.q).toLowerCase();
    var items = state.items.filter(function (it) { return !q || norm(it.name + it.address).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) {
        var am = here && norm(a.name) === here ? 0 : 1, bm = here && norm(b.name) === here ? 0 : 1;
        if (am !== bm) return am - bm;
        if (!!a.wellmoAt !== !!b.wellmoAt) return a.wellmoAt ? 1 : -1;
        return b.stage - a.stage;
      });
    var rows = items.map(function (it) {
      var tag = it.wellmoAt ? '<span class="wm-tag wm-done">入力済 ' + esc(it.wellmoAt) + '</span>'
        : it.pending ? '<span class="wm-tag wm-warn">要確認 ' + it.pending + '件</span>' : '<span class="wm-tag wm-ok">準備OK</span>';
      return '<tr class="' + (here && norm(it.name) === here ? 'wm-match' : '') + '"><td><b>' + esc(it.name) + '</b><div class="wm-sub">' + esc(it.address) + '</div>' + tag + '</td>' +
        '<td style="width:72px;text-align:right"><button type="button" class="wm-btn wm-primary" data-id="' + esc(it.id) + '">入力</button></td></tr>';
    }).join('');
    frame('周辺調査から入力',
      (state.msg ? '<div class="wm-msg' + (state.err ? ' wm-err' : '') + '">' + esc(state.msg) + '</div>' : '') +
      '<input class="wm-in" id="wm-q" placeholder="建物名・住所で絞り込み" value="' + esc(state.q) + '">' +
      (state.busy ? '<div class="wm-sub">読み込み中…</div>' : rows ? '<table>' + rows + '</table>' : '<div class="wm-sub">入力できる物件がありません（周辺調査アプリで「確認」まで進めた物件が表示されます）</div>') +
      '<div class="wm-sub">入力後、内容を確認してウェルモの「保存」を押すと、アプリ側に「ウェルモ入力済」と記録されます。</div>');
    var qi = root.querySelector('#wm-q');
    qi.oninput = function () { state.q = qi.value; var pos = qi.selectionStart; renderList(); var n = root.querySelector('#wm-q'); n.focus(); n.setSelectionRange(pos, pos); };
    Array.prototype.forEach.call(root.querySelectorAll('[data-id]'), function (b) { b.onclick = function () { fillFor(b.dataset.id); }; });
  }

  function fillFor(id) {
    state.msg = '入力しています…'; state.err = false; renderList();
    callApp({ api: 'wellmo-data', id: id }).then(function (r) {
      return W.run(r.data, 'ウェルモ自動入力：' + (r.name || '')).then(function (rep) { return { r: r, rep: rep }; });
    }).then(function (x) {
      var r = x.r, rep = x.rep;
      state.msg = r.name + 'を入力しました（' + rep.done.length + '項目' + (rep.manual.length ? '、手動が必要 ' + rep.manual.length + '項目' : '') + '）。内容を確認して「保存」を押してください。';
      if (r.pending) state.msg += '　※アプリ側で未確認の項目が' + r.pending + '件あります。';
      renderClosed();
      watchSave(id);
    }).catch(function (e) { state.msg = e.message; state.err = true; renderList(); });
  }

  /** 「保存」が押されたら入力済みを記録（ページ移動で送れなかった場合は次回表示時に再送） */
  function watchSave(id) {
    var btn = W.findSaveButton();
    if (!btn) return;
    btn.addEventListener('click', function () {
      GM_setValue(KEY_PENDING, JSON.stringify({ id: id, at: Date.now() }));
      callApp({ api: 'wellmo-mark', id: id }).then(function () { GM_setValue(KEY_PENDING, ''); }).catch(function () { /* 次回再送 */ });
    }, { once: true });
  }
  function retryPendingMark() {
    var raw = GM_getValue(KEY_PENDING, '');
    if (!raw || !GM_getValue(KEY_URL, '')) return;
    try {
      var p = JSON.parse(raw);
      if (Date.now() - p.at > 86400000) { GM_setValue(KEY_PENDING, ''); return; }
      callApp({ api: 'wellmo-mark', id: p.id }).then(function () { GM_setValue(KEY_PENDING, ''); }).catch(function () {});
    } catch (e) { GM_setValue(KEY_PENDING, ''); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
