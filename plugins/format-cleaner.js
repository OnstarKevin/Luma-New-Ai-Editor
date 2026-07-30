/**
 * Luma 格式清理插件
 * 仅删除连续多余的空白段落 — 不修改任何内容
 */
(function () {
  'use strict';

  if (!window.LumaPlugins) {
    console.warn('[format-cleaner] LumaPlugins 未加载');
    return;
  }

  window.LumaPlugins.register({
    name: '格式清理',
    description: '删除多余空白行',
    icon: '🧹',

    run: function (host, ctx) {
      var blocks = Array.from(host.querySelectorAll('.bw-block'));
      var removed = 0;
      var prevWasEmpty = true; // 文档开头视为非空，不删首行之前的空行
      var toRemove = [];

      blocks.forEach(function (b) {
        // 跳过包含特殊内容的块（代码、表格、数学公式、分割线）
        if (b.classList.contains('code') || b.classList.contains('hr') ||
            b.classList.contains('bw-math-card') || b.closest('.bw-table')) {
          prevWasEmpty = false;
          return;
        }

        // 同步编辑态中的文本到 dataset
        if (b.classList.contains('editing')) {
          b.dataset.md = b.textContent || '';
        }

        var md = (b.dataset.md || '').trim();

        if (md === '') {
          if (prevWasEmpty) {
            toRemove.push(b);
            removed++;
            return; // 连续空行：跳过
          }
          prevWasEmpty = true;
        } else {
          prevWasEmpty = false;
        }
      });

      // 删除多余空行
      toRemove.forEach(function (b) {
        try { b.remove(); } catch (e) {}
      });

      // 更新目录
      if (typeof updateTOC === 'function') {
        var docEl = host.querySelector('.bw-doc');
        var st = window.stateMap && window.stateMap.get(host);
        if (docEl && st) updateTOC(docEl, st);
      }
      if (typeof markDirty === 'function') markDirty(host);

      return {
        issues: [],
        summary: removed > 0 ? '已删除 ' + removed + ' 个多余空行' : '没有多余空行需要清理'
      };
    }
  });
})();
