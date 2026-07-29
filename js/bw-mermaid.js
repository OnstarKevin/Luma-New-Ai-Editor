/**
 * Luma — Mermaid 图表渲染
 */
'use strict';

  var _mermaidReady = false;

  function bwMermaidInit() {
    if (_mermaidReady) return;
    if (typeof mermaid === 'undefined') return;
    mermaid.initialize({
      startOnLoad: false,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
      securityLevel: 'loose'
    });
    _mermaidReady = true;
  }

  function bwMermaidRender(block) {
    bwMermaidInit();
    if (!_mermaidReady) return;
    var wrap = block.querySelector('.bw-mermaid-wrap');
    if (!wrap) return;
    var srcEl = wrap.querySelector('.bw-mermaid-src');
    var code = srcEl ? srcEl.textContent : '';
    if (!code.trim()) return;
    // Generate unique ID
    var id = 'bw-mermaid-' + Math.random().toString(36).slice(2, 8);
    wrap.innerHTML = '<div class="bw-mermaid-out" id="' + id + '"></div>';
    try {
      mermaid.render(id, code).then(function (result) {
        var out = document.getElementById(id);
        if (out) out.innerHTML = result.svg;
      }).catch(function (err) {
        var out = document.getElementById(id);
        if (out) out.innerHTML = '<span class="bw-mermaid-error">Mermaid 渲染失败: ' + err.message + '</span>';
      });
    } catch (err) {
      wrap.innerHTML = '<span class="bw-mermaid-error">Mermaid 错误: ' + err.message + '</span>';
    }
  }

  // 渲染文档中所有 mermaid 块
  function bwMermaidRenderAll(host) {
    bwMermaidInit();
    if (!_mermaidReady) return;
    var docEl = host ? host.querySelector('.bw-doc') : document;
    if (!docEl) return;
    var blocks = docEl.querySelectorAll('.bw-block.mermaid');
    blocks.forEach(function (b) { bwMermaidRender(b); });
  }

  // 在文档加载后渲染
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bwMermaidInit(); });
  } else {
    setTimeout(bwMermaidInit, 100);
  }
