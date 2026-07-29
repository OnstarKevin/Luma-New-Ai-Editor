/**
 * Luma — 查找与替换（Ctrl+F / Ctrl+H）
 * 纯前端实现，零外部依赖。
 */
'use strict';

  var _findMatches = [];
  var _findIndex = -1;
  var _findBar = null;

  function bwFindEnsureBar(host) {
    if (_findBar && _findBar.parentNode) return _findBar;
    // 插入到正文容器顶部，sticky top（避开左侧 padding）
    var contentInner = host.querySelector('.bw-content-inner') || host.querySelector('.bw-content-area');
    if (!contentInner) return null;
    _findBar = document.createElement('div');
    _findBar.className = 'bw-find-bar';
    _findBar.innerHTML =
      '<input class="bw-find-input" type="text" placeholder="查找..." autofocus>' +
      '<span class="bw-find-count"></span>' +
      '<button class="bw-find-prev" title="上一个">▲</button>' +
      '<button class="bw-find-next" title="下一个">▼</button>' +
      '<input class="bw-find-replace-input" type="text" placeholder="替换为..." style="display:none">' +
      '<button class="bw-find-replace-btn" title="替换" style="display:none">替换</button>' +
      '<button class="bw-find-replace-all-btn" title="全部替换" style="display:none">全部替换</button>' +
      '<button class="bw-find-close" title="关闭">✕</button>';
    contentInner.insertBefore(_findBar, contentInner.firstChild);

    var input = _findBar.querySelector('.bw-find-input');
    var count = _findBar.querySelector('.bw-find-count');
    var prevBtn = _findBar.querySelector('.bw-find-prev');
    var nextBtn = _findBar.querySelector('.bw-find-next');
    var closeBtn = _findBar.querySelector('.bw-find-close');
    var replInput = _findBar.querySelector('.bw-find-replace-input');
    var replBtn = _findBar.querySelector('.bw-find-replace-btn');
    var replAllBtn = _findBar.querySelector('.bw-find-replace-all-btn');

    input.addEventListener('input', function () { bwFindDo(host, replInput.style.display !== 'none'); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); bwFindNext(host); }
      if (e.key === 'Escape') { bwFindClose(); }
    });
    prevBtn.addEventListener('click', function () { bwFindPrev(host); });
    nextBtn.addEventListener('click', function () { bwFindNext(host); });
    closeBtn.addEventListener('click', function () { bwFindClose(); });
    replBtn.addEventListener('click', function () { bwFindReplaceOne(host); });
    replAllBtn.addEventListener('click', function () { bwFindReplaceAll(host); });
    replInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); bwFindReplaceOne(host); }
    });

    return _findBar;
  }

  function bwFindToggle(host) {
    var bar = bwFindEnsureBar(host);
    if (!bar) return;
    var visible = bar.classList.contains('visible');
    if (visible) { bwFindClose(); return; }
    bar.classList.add('visible');
    // 始终显示为"查找"模式
    bar.querySelector('.bw-find-replace-input').style.display = 'none';
    bar.querySelector('.bw-find-replace-btn').style.display = 'none';
    bar.querySelector('.bw-find-replace-all-btn').style.display = 'none';
    bar.querySelector('.bw-find-input').focus();
    bwFindDo(host);
  }

  function bwFindReplaceToggle(host) {
    var bar = bwFindEnsureBar(host);
    if (!bar) return;
    var visible = bar.classList.contains('visible');
    // 如果已打开且已显示替换，则关闭；否则打开替换模式
    var replVisible = visible && bar.querySelector('.bw-find-replace-input').style.display !== 'none';
    if (replVisible) { bwFindClose(); return; }
    bar.classList.add('visible');
    bar.querySelector('.bw-find-replace-input').style.display = '';
    bar.querySelector('.bw-find-replace-btn').style.display = '';
    bar.querySelector('.bw-find-replace-all-btn').style.display = '';
    bar.querySelector('.bw-find-input').focus();
    bwFindDo(host, true);
  }

  function bwFindClose() {
    if (_findBar) _findBar.classList.remove('visible');
    bwFindClearHighlights();
    _findMatches = [];
    _findIndex = -1;
  }

  function bwFindClearHighlights() {
    document.querySelectorAll('.bw-find-highlight').forEach(function (el) {
      var parent = el.parentNode;
      if (parent) parent.replaceChild(document.createTextNode(el.textContent), el);
    });
    // Normalize text nodes
    document.querySelectorAll('.bw-doc .bw-rendered').forEach(function (el) { el.normalize(); });
  }

  function bwFindDo(host, keepVisible) {
    bwFindClearHighlights();
    _findMatches = [];
    _findIndex = -1;
    if (!_findBar) return;
    var query = _findBar.querySelector('.bw-find-input').value;
    var countEl = _findBar.querySelector('.bw-find-count');
    if (!query) { countEl.textContent = ''; return; }
    var qLower = query.toLowerCase();

    // 在所有渲染块中查找
    var docEl = host.querySelector('.bw-doc');
    if (!docEl) return;
    var renderedSpans = docEl.querySelectorAll('.bw-rendered');
    renderedSpans.forEach(function (span) {
      var text = span.textContent;
      var idx = text.toLowerCase().indexOf(qLower);
      if (idx === -1) return;
      // 遍历该 span 内的文本节点
      var walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node, ni) {
        var t = node.textContent;
        var tl = t.toLowerCase();
        var pos = 0;
        while ((pos = tl.indexOf(qLower, pos)) !== -1) {
          // 拆分为：前缀 + mark + 后缀
          var before = t.substring(0, pos);
          var match = t.substring(pos, pos + query.length);
          var after = t.substring(pos + query.length);
          var frag = document.createDocumentFragment();
          if (before) frag.appendChild(document.createTextNode(before));
          var mark = document.createElement('mark');
          mark.className = 'bw-find-highlight';
          mark.textContent = match;
          frag.appendChild(mark);
          _findMatches.push(mark);
          if (after) frag.appendChild(document.createTextNode(after));
          node.parentNode.replaceChild(frag, node);
          // 更新 node 引用为 afterFragment 中的文本节点
          if (after) {
            node = frag.lastChild;
            t = after;
            tl = t.toLowerCase();
            pos = 0;
          } else {
            break;
          }
        }
      });
    });

    countEl.textContent = _findMatches.length ? (_findMatches.length + ' 个匹配') : '无匹配';
    if (_findMatches.length) {
      _findIndex = 0;
      bwFindHighlightActive();
    }
  }

  function bwFindHighlightActive() {
    _findMatches.forEach(function (m, i) { m.classList.toggle('active', i === _findIndex); });
    if (_findIndex >= 0 && _findIndex < _findMatches.length) {
      _findMatches[_findIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function bwFindNext() {
    if (!_findMatches.length) return;
    _findIndex = (_findIndex + 1) % _findMatches.length;
    bwFindHighlightActive();
  }

  function bwFindPrev(host) {
    if (!_findMatches.length) return;
    _findIndex = _findIndex <= 0 ? _findMatches.length - 1 : _findIndex - 1;
    bwFindHighlightActive();
  }

  function bwFindReplaceOne(host) {
    if (!_findMatches.length || _findIndex < 0) return;
    var repl = (_findBar.querySelector('.bw-find-replace-input').value || '');
    var active = _findMatches[_findIndex];
    if (active) active.textContent = repl;
    bwFindDo(host, true);
  }

  function bwFindReplaceAll(host) {
    if (!_findMatches.length) return;
    var repl = (_findBar.querySelector('.bw-find-replace-input').value || '');
    _findMatches.forEach(function (m) { m.textContent = repl; });
    bwFindDo(host, true);
  }

  // ── 绑定快捷键 ──
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      // 仅在编辑区域或未聚焦 input 时触发
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      var host = document.querySelector('[data-bw-doc-editor]');
      if (host) bwFindToggle(host);
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
      var activeH = document.activeElement;
      if (activeH && (activeH.tagName === 'INPUT' || activeH.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      var hostH = document.querySelector('[data-bw-doc-editor]');
      if (hostH) bwFindReplaceToggle(hostH);
    }
  });
