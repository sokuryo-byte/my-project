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
