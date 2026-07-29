/**
 * Luma — 内置表情符号库（工具栏调用）
 * 无需外部依赖，内建 ~200 个常用表情/符号。
 */
'use strict';

  var EMOJI_DATA = [
    { n:'表情', e:['😀','😃','😄','😁','😅','🤣','😂','🙂','😊','😇','😍','🤩','😘','😗','😚','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😡','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','🤖'] },
    { n:'手势', e:['👍','👎','👏','🙌','🤝','👋','🤚','✋','🖐','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','🖕','✍️','🙏','💪','🦵','🦶'] },
    { n:'物', e:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🔥','⭐','✨','💡','💎','🎯','🏆','🎉','🎊','📌','📍','🔖','🏷️','📎','✂️','🔑','🔒','🔓','💣','🧨','⚡','💧','🍀','🌹','🌸','🌻'] },
    { n:'箭头', e:['←','↑','→','↓','↔','↕','↖','↗','↘','↙','↩','↪','⤴','⤵','🔃','🔄','🔙','🔚','🔛','🔜','🔝','⏪','⏩','⏫','⏬','◀','▶','🔼','🔽','↺','↻'] },
    { n:'符号', e:['©','®','™','ℹ','✅','❌','❓','❗','‼','⁉','⚠','🚫','🔞','💯','🔢','#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','〰','✔','☑','✖','➕','➖','➗','✖️','∞','≈','≠','≤','≥','√','π','÷','×','±'] },
    { n:'货币', e:['¥','$','€','£','₽','₹','₩','₿','💲','💱','💹','💰','💳','🪙'] },
  ];

  var _emojiPanel = null;

  function bwEmojiToggle() {
    if (_emojiPanel && _emojiPanel.parentNode) { _emojiPanel.remove(); _emojiPanel = null; return; }
    _emojiPanel = document.createElement('div');
    _emojiPanel.className = 'bw-emoji-panel';
    var html = '<div class="bw-emoji-tabs">';
    EMOJI_DATA.forEach(function (cat, ci) {
      html += '<button class="bw-emoji-tab' + (ci === 0 ? ' active' : '') + '" data-emoji-cat="' + ci + '">' + cat.e[0] + '</button>';
    });
    html += '</div><div class="bw-emoji-grid-wrap">';
    EMOJI_DATA.forEach(function (cat, ci) {
      html += '<div class="bw-emoji-grid' + (ci === 0 ? '' : ' hidden') + '" data-emoji-cat-grid="' + ci + '">';
      cat.e.forEach(function (em) {
        html += '<button class="bw-emoji-item" data-emoji="' + em + '">' + em + '</button>';
      });
      html += '</div>';
    });
    html += '</div>';

    // 搜索框
    html = '<div class="bw-emoji-search-wrap"><input class="bw-emoji-search" placeholder="搜索表情..." type="text"></div>' + html;

    _emojiPanel.innerHTML = html;
    document.body.appendChild(_emojiPanel);

    // Position near toolbar
    var toolbar = document.querySelector('.bw-toolbar');
    if (toolbar) {
      var tr = toolbar.getBoundingClientRect();
      _emojiPanel.style.top = (tr.bottom + 4) + 'px';
      _emojiPanel.style.left = Math.min(tr.left, window.innerWidth - 320) + 'px';
    }

    // Tab switch
    _emojiPanel.querySelector('.bw-emoji-tabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.bw-emoji-tab');
      if (!tab) return;
      var ci = tab.getAttribute('data-emoji-cat');
      _emojiPanel.querySelectorAll('.bw-emoji-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      _emojiPanel.querySelectorAll('.bw-emoji-grid').forEach(function (g) {
        g.classList.toggle('hidden', g.getAttribute('data-emoji-cat-grid') !== ci);
      });
    });

    // Click emoji to insert
    _emojiPanel.querySelector('.bw-emoji-grid-wrap').addEventListener('click', function (e) {
      var btn = e.target.closest('.bw-emoji-item');
      if (!btn) return;
      var em = btn.getAttribute('data-emoji');
      bwEmojiInsert(em);
      _emojiPanel.remove(); _emojiPanel = null;
    });

    // Search
    var search = _emojiPanel.querySelector('.bw-emoji-search');
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.toLowerCase();
        _emojiPanel.querySelectorAll('.bw-emoji-item').forEach(function (item) {
          var em = item.getAttribute('data-emoji');
          item.classList.toggle('hidden', q && em.indexOf(q) === -1);
        });
        _emojiPanel.querySelectorAll('.bw-emoji-grid').forEach(function (g) { g.classList.add('hidden'); });
        _emojiPanel.querySelector('.bw-emoji-tabs').style.display = q ? 'none' : '';
      });
    }

    // Close on outside click
    setTimeout(function () {
      document.addEventListener('click', function bwEmojiClose(e) {
        if (_emojiPanel && !_emojiPanel.contains(e.target) && !e.target.closest('[data-action="emoji"]')) {
          _emojiPanel.remove(); _emojiPanel = null;
          document.removeEventListener('click', bwEmojiClose);
        }
      });
    }, 50);
  }

  function bwEmojiInsert(text) {
    // 恢复工具栏操作前的焦点
    var host = window._bwEmojiHost;
    if (host && typeof refocusEditor === 'function') refocusEditor(host);
    // 短暂延迟等焦点恢复后再插入
    setTimeout(function () {
      var active = document.activeElement;
      if (!active || !active.classList.contains('bw-block') || !active.classList.contains('editing')) return;
      var sel = window.getSelection();
      if (sel.rangeCount) {
        var rng = sel.getRangeAt(0);
        rng.deleteContents();
        rng.insertNode(document.createTextNode(text));
        rng.collapse(false);
        sel.removeAllRanges();
        sel.addRange(rng);
      } else {
        active.textContent += text;
      }
      active.dispatchEvent(new Event('input', { bubbles: true }));
    }, 20);
  }
