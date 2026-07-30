/**
 * Luma — 导出：TXT / PDF / 长图 PNG / HTML
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * EXPORT PIPELINE
   * ============================================================ */
  function fileNameBase(host) {
    var titleEl = $('#bwTitleInput', host);
    var t = titleEl ? (titleEl.value || '').trim() : '';
    if (!t) { var st = stateMap.get(host); t = (st && st.title) || '文档'; }
    t = (t || '文档').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 50);
    return t || '文档';
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function fetchText(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('fetch ' + url + ' ' + r.status);
      return r.text();
    });
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  /** Inline @font-face url(...) references as data URIs so the exported HTML is self-contained */
  function embedFonts(css) {
    var base = location.href.substring(0, location.href.lastIndexOf('/') + 1);
    var re = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/g;
    var m, list = [], seen = {};
    while ((m = re.exec(css))) {
      var u = m[1];
      if (/^data:/i.test(u) || /^https?:/i.test(u)) continue;
      if (seen[u]) continue;
      seen[u] = 1;
      list.push(u);
    }
    return Promise.all(list.map(function (u) {
      return fetch(base + u).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
        var ext = (u.match(/\.(\w+)$/) || [, 'woff2'])[1].toLowerCase();
        var mime = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', eot: 'application/vnd.ms-fontobject', otf: 'font/otf' }[ext] || 'application/octet-stream';
        return { orig: u, data: 'data:' + mime + ';base64,' + arrayBufferToBase64(buf) };
      }).catch(function () { return null; });
    })).then(function (results) {
      var out = css;
      results.forEach(function (r) { if (r) out = out.split(r.orig).join(r.data); });
      return out;
    });
  }

  function wireExportMenu(host, st) {
    var btn = $('#bwExportBtn', host);
    var menu = $('#bwExportMenu', host);
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenus(host, menu);
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    });
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      var t = e.target.closest('button[data-export]');
      if (!t) return;
      var kind = t.dataset.export;
      menu.style.display = 'none';
      if (kind === 'pdf') exportPdf(host);
      else if (kind === 'png') exportPng(host);
      else if (kind === 'html') exportHtml(host);
      else if (kind === 'txt') exportTxt(host);
    });
  }

  function exportTxt(host) {
    var md = getMarkdown(host);
    downloadBlob(md, fileNameBase(host) + '.md', 'text/markdown;charset=utf-8');
  }

  function exportPdf(host) {
    var done = function () {
      host.classList.remove('bw-export-pdf');
      window.removeEventListener('afterprint', done);
    };
    host.classList.add('bw-export-pdf');
    window.addEventListener('afterprint', done);
    setTimeout(function () { if (host.classList.contains('bw-export-pdf')) done(); }, 60000);
    window.print();
  }

  function exportPng(host) {
    if (typeof window.htmlToImage === 'undefined' || !window.htmlToImage.toPng) {
      bwToast(host, '导出组件未加载，无法生成长图', { type: 'error' });
      return;
    }
    var src = $('#bwContentInner', host);
    if (!src) return;

    // 导出宽度与编辑器内容区一致（遵循 WPS 等主流文档页宽度），不随视口变化；
    // 留白也随之减半，保证导出的长图版式与编辑界面完全一致。
    var captureWidth = 860;
    try {
      var _raw = getComputedStyle(document.documentElement).getPropertyValue('--bw-content-max');
      var _parsed = parseInt(_raw, 10);
      if (!isNaN(_parsed) && _parsed > 0) captureWidth = _parsed;
    } catch (e) {}
    if (captureWidth > 1600) captureWidth = 1600;

    var btn = $('#bwExportBtn', host);
    var prevLabel = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<span class="bw-tooltip">生成中</span>';

    // 先把所有处于编辑态的块切回渲染态，确保导出的是最终排版（非源码）
    src.querySelectorAll('.bw-block.editing').forEach(function (b) {
      try { if (typeof leaveEdit === 'function') leaveEdit(b); } catch (e) {}
    });

    // 关键修正：直接对文档内真实节点截图，不再用离屏 fixed wrap 包克隆。
    // 离屏 fixed 节点经 html-to-image 序列化进 SVG foreignObject 时，内容坐标被
    // 推到视口外，导致导出整图空白。临时固定宽度并取消居中偏移即可避免偏移/空白。
    var prev = {
      margin: src.style.margin,
      maxWidth: src.style.maxWidth,
      width: src.style.width,
      boxSizing: src.style.boxSizing
    };
    src.style.margin = '0';
    src.style.maxWidth = 'none';
    src.style.width = captureWidth + 'px';
    src.style.boxSizing = 'border-box';

    // 同步实时输入值，剥除编辑态预览，所有后代不裁剪（避免宽代码/表格/公式被切）
    src.querySelectorAll('input, textarea').forEach(function (el) {
      if (el.tagName === 'TEXTAREA') el.textContent = el.value;
      else el.setAttribute('value', el.value);
    });
    src.querySelectorAll('.bw-inline-preview').forEach(function (el) { el.remove(); });
    var overflowStack = [];
    src.querySelectorAll('*').forEach(function (el) {
      if (el.style.overflow && el.style.overflow !== 'visible') {
        overflowStack.push([el, el.style.overflow]);
        el.style.overflow = 'visible';
      }
      el.style.maxWidth = 'none';
    });

    host.classList.add('bw-export-png');

    // 隐藏页面滚动条，防止截到
    var bodyPrevOverflow = document.body.style.overflow;
    var hostPrevOverflow = host.style.overflow;
    document.body.style.overflow = 'hidden';
    host.style.overflow = 'hidden';

    // 用 scrollHeight 截全高度（getBoundingClientRect 只给可视区域）
    var captureHeight = Math.max(
      Math.ceil(src.scrollHeight),
      Math.ceil(src.getBoundingClientRect().height)
    );

    window.htmlToImage.toPng(src, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight
    })
      .then(function (dataUrl) {
        var a = document.createElement('a');
        a.href = dataUrl; a.download = fileNameBase(host) + '.png';
        document.body.appendChild(a); a.click(); a.remove();
      })
      .catch(function (err) {
        console.error('[BW Editor] PNG export failed:', err);
        bwToast(host, '长图生成失败：' + (err && err.message ? err.message : err), { type: 'error' });
      })
      .then(function () {
        // 还原所有临时改动
        src.style.margin = prev.margin;
        src.style.maxWidth = prev.maxWidth;
        src.style.width = prev.width;
        src.style.boxSizing = prev.boxSizing;
        document.body.style.overflow = bodyPrevOverflow;
        host.style.overflow = hostPrevOverflow;
        overflowStack.forEach(function (p) { p[0].style.overflow = p[1]; });
        host.classList.remove('bw-export-png');
        if (btn) btn.innerHTML = prevLabel;
      });
  }

  function exportHtml(host) {
    var node = $('#bwContentInner', host);
    if (!node) return;
    var inner = node.cloneNode(true).innerHTML;
    var titleEl = $('#bwTitleInput', host);
    var pageTitle = titleEl ? (titleEl.value || '').trim() : '文档';
    var cssFiles = ['vite-app.css', 'bw-typora-editor.css', 'katex.min.css', 'highlight/github.min.css'];
    Promise.all(cssFiles.map(fetchText)).then(function (parts) {
      return embedFonts(parts.join('\n'));
    }).then(function (css) {
      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + escapeHtml(pageTitle) + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n<div class="bw-content-inner">\n' + inner + '\n</div>\n</body>\n</html>';
      downloadBlob(html, fileNameBase(host) + '.html', 'text/html;charset=utf-8');
    }).catch(function (err) {
      console.error('[BW Editor] HTML export failed, exporting without embedded fonts:', err);
      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>' + escapeHtml(pageTitle) + '</title>\n</head>\n<body>\n<div class="bw-content-inner">\n' + inner + '\n</div>\n</body>\n</html>';
      downloadBlob(html, fileNameBase(host) + '.html', 'text/html;charset=utf-8');
    });
  }

