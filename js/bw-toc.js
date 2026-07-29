/**
 * Luma — 目录生成与滚动高亮（scroll-spy）
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * TOC (TABLE OF CONTENTS)
   * ============================================================ */
  function updateTOC(docEl, st) {
    if (!docEl || !st) return;
    var tocList = $('.bw-toc-list', st.tocRoot);
    if (!tocList) return;

    var items = $$('.bw-block.h1, .bw-block.h2, .bw-block.h3', docEl);
    if (!items.length) { tocList.innerHTML = '<div style="padding:12px 14px;color:var(--bw-text-tertiary);font-size:12px;">无标题结构</div>'; return; }

    // 构建 entries：{ idx, level, text }
    var entries = [];
    items.forEach(function (item, idx) {
      var level = item.classList.contains('h2') ? 2 : (item.classList.contains('h3') ? 3 : 1);
      var text = (item.textContent || item.dataset.md || '').replace(/^#+\s*/, '').trim();
      if (!text) return;
      entries.push({ idx: idx, level: level, text: text });
    });
    if (!entries.length) { tocList.innerHTML = '<div style="padding:12px 14px;color:var(--bw-text-tertiary);font-size:12px;">无标题结构</div>'; return; }

    // 建立父子关系
    var lastH1 = -1, lastH2 = -1;
    entries.forEach(function (e) {
      if (e.level === 1) { lastH1 = e.idx; lastH2 = -1; }
      else if (e.level === 2) { e._parent = lastH1; lastH2 = e.idx; }
      else if (e.level === 3) { e._parent = lastH2 >= 0 ? lastH2 : lastH1; }
    });

    // 渲染（记录之前已展开的项目以便恢复状态）
    var prevExpanded = {};
    var oldItems = tocList.querySelectorAll('.bw-toc-item.bw-toc-expanded');
    oldItems.forEach(function (oi) { prevExpanded[oi.getAttribute('data-toc-idx')] = true; });

    var html = '';
    var activeIdx = 0;
    entries.forEach(function (e, i) {
      var cls = 'bw-toc-item';
      if (e.level === 2) cls += ' toc-h2';
      if (e.level === 3) cls += ' toc-h3';
      // 非一级标题默认折叠
      if (e.level >= 2) cls += ' bw-toc-collapsed';
      if (i === activeIdx) cls += ' active';
      var arrow = ((e.level === 1 || e.level === 2) && hasChildEntries(entries, e.idx)) ? '<span class="bw-toc-arrow">&#9654;</span>' : '';
      html += '<a class="' + cls + '" data-toc-idx="' + e.idx + '" data-toc-level="' + e.level + '">' + arrow + escapeHtml(e.text) + '</a>';
    });
    tocList.innerHTML = html;

    // 恢复已展开状态
    Object.keys(prevExpanded).forEach(function (pid) {
      var pEl = tocList.querySelector('.bw-toc-item[data-toc-idx="' + pid + '"]');
      if (pEl) pEl.classList.add('bw-toc-expanded');
      expandChildren(tocList, pid);
    });

    // 事件委托：点击任意目录项
    tocList.onclick = function (ev) {
      var tgt = ev.target.closest('.bw-toc-item');
      if (!tgt) return;
      var idx = parseInt(tgt.getAttribute('data-toc-idx'));
      var level = parseInt(tgt.getAttribute('data-toc-level'));
      // 滚动到对应标题
      var targetBlock = items[idx];
      if (targetBlock) targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 有子项且未展开时：展开子项（不折叠）
      if (!tgt.classList.contains('bw-toc-expanded') && hasChildEntries(entries, idx)) {
        tgt.classList.add('bw-toc-expanded');
        expandChildren(tocList, idx);
      }
    };

    setupScrollSpy(docEl, st);
  }

  function hasChildEntries(entries, parentIdx) {
    for (var k = 0; k < entries.length; k++) {
      if (entries[k]._parent === parentIdx) return true;
    }
    return false;
  }

  function expandChildren(tocList, parentIdx) {
    // 展开 parentIdx 的直接子级：遍历同级条目后用闭包 entries 判 _parent
    // 由于 updateTOC 中 entries 是局部变量，这里改用 DOM 扫描：
    // 从 parentIdx 后开始，展开所有 level = parentLevel+1 且在下一个同级之前的内容
    var allItems = tocList.querySelectorAll('.bw-toc-item');
    var parentLevel = -1;
    var pastParent = false;
    allItems.forEach(function (el) {
      var idx = parseInt(el.getAttribute('data-toc-idx'));
      var lvl = parseInt(el.getAttribute('data-toc-level'));
      if (idx === parentIdx) { parentLevel = lvl; pastParent = true; return; }
      if (!pastParent) return;
      // 遇到同级或更高级标题，停止
      if (lvl <= parentLevel) { pastParent = false; return; }
      // 只展开直接子级（level == parentLevel + 1）
      if (lvl === parentLevel + 1) el.classList.remove('bw-toc-collapsed');
    });
  }

  function setupScrollSpy(docEl, st) {
    var contentArea = document.querySelector('.bw-content-area');
    if (!contentArea) return;

    // Bind the scroll listener exactly once per content area. updateTOC is
    // called on every edit / insert / paste, so re-adding here would leak
    // listeners and stack up work on long sessions. We refresh the active
    // state on every call instead (cheap) and re-query the live DOM inside
    // spy() so it always reflects the current headings / TOC items.
    function spy() {
      var headings = $$('.bw-block.h1, .bw-block.h2, .bw-block.h3', docEl);
      var tocList = $('.bw-toc-list', st.tocRoot);
      if (!tocList) return;
      var items = tocList.querySelectorAll('.bw-toc-item');
      var current = 0;
      headings.forEach(function (h, i) {
        var top = h.getBoundingClientRect().top;
        if (top <= 120) current = i;
      });
      items.forEach(function (ti, i) {
        ti.classList.toggle('active', i === current);
      });
    }

    if (contentArea._bwScrollSpyBound) { spy(); return; }
    contentArea._bwScrollSpyBound = true;

    // The editor content area is its own scroll container, so observe it
    // (not the window) and throttle with rAF (single pass, no recursion).
    var rafId = null;
    function onScroll() {
      if (rafId) return;
      rafId = requestAnimationFrame(spy);
    }
    contentArea.addEventListener('scroll', onScroll, { passive: true });
    spy();
  }

