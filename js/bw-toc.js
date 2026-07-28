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

    var html = '';
    items.forEach(function (item, idx) {
      var level = item.classList.contains('h2') ? 2 : (item.classList.contains('h3') ? 3 : 1);
      var text = (item.textContent || item.dataset.md || '').replace(/^#+\s*/, '').trim();
      if (!text) return;
      var cls = 'bw-toc-item' + (level > 1 ? ' toc-h' + level : '');
      var active = idx === 0 ? ' active' : '';
      html += '<a class="' + cls + active + '" data-toc-idx="' + idx + '" data-toc-level="' + level + '">' + escapeHtml(text) + '</a>';
    });
    tocList.innerHTML = html;

    // Scroll spy
    tocList.querySelectorAll('.bw-toc-item').forEach(function (tci, idx) {
      tci.addEventListener('click', function () {
        items[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    setupScrollSpy(docEl, st);
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

