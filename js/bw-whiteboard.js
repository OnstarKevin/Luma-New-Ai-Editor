/**
 * Luma · 白板融合（编辑器侧）
 * 零侵入新增模块：工具栏「白板」SVG 按钮 -> 右侧抽屉放白板 iframe（postMessage 桥）。
 * 收 export-png -> 透明边距裁剪 -> 压缩（bwCompressImage）-> 以 ![alt](url) 插入（等价 insertImageMarkdown）。
 * 可选 AI 美化：复用 BWAI.openBodyStream / parseSSE 把 PNG 发给视觉模型。
 * 双击已嵌入图：重新在白板打开该场景（场景存 localStorage / 桌面 BWDesktop）。
 * 不改任何 13 模块；仅在 index.html 的 bw-bootstrap 之前以 <script> 引入本文件。
 */
(function () {
  'use strict';

  var PARENT_SRC = 'bw-editor';
  var SELF_SRC = 'bw-whiteboard';

  var host = null;          // 编辑器宿主 [data-bw-doc-editor]
  var drawer = null;        // 抽屉 DOM
  var frame = null;         // 白板 iframe
  var frameReady = false;
  var pendingScene = null;  // 等白板 ready 后载入的场景
  var pendingReplaceId = null; // 回编：要替换的图块 sceneId
  var wbPopup = null;        // 独立弹窗
  var wbPopupReady = false;  // 弹窗就绪标记

  /* ---------- 白板全屏覆盖层（in-webview 替代 window.open / 独立 Tauri 窗口） ---------- */
  var overlay = null;          // 全屏覆盖层 DOM
  var overlayFrame = null;     // 覆盖层内 iframe
  var overlayFrameReady = false;
  var overlayPendingScene = null;

  /* ---------- 白板抽屉宽度（可拖拽调整，记忆到 localStorage） ---------- */
  var wbWidth = 480;
  try { var savedWb = localStorage.getItem('bw-wb-drawer-width'); if (savedWb) wbWidth = Math.max(300, parseInt(savedWb, 10) || 480); } catch (_) {}

  function bwWbApplyWidth() {
    if (!drawer) return;
    var minW = 300;
    var cr = $('#bwContentRight', host);
    var maxW = minW;
    if (cr) { var crRect = cr.getBoundingClientRect(); maxW = Math.max(minW, Math.round(crRect.width)); }
    if (wbWidth < minW) wbWidth = minW;
    if (wbWidth > maxW) wbWidth = maxW;
    drawer.style.width = wbWidth + 'px';
    // 防御性互斥：白板打开时确保 AI 已关闭（display:none）
    if (drawer.classList.contains('bw-wb-open')) {
      var ai = document.querySelector('.bw-ai-panel[data-open="true"]');
      if (ai) { ai.style.display = 'none'; ai.setAttribute('data-open', 'false'); var ah = ai.closest('[data-bw-doc-editor]'); if (ah && typeof bwAiApplyWidth === 'function') bwAiApplyWidth(ah); }
    }
  }

  /* ---------- 工具 ---------- */
  function genId() { return 'wb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function dataURLToBlob(dataUrl) {
    return new Promise(function (resolve, reject) {
      try {
        var parts = dataUrl.split(',');
        var meta = parts[0];
        var b64 = parts[1] || '';
        var mime = (meta.match(/:(.*?);/) || [])[1] || 'image/png';
        var bin = atob(b64);
        var len = bin.length;
        var arr = new Uint8Array(len);
        for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: mime }));
      } catch (e) { reject(e); }
    });
  }

  function readTheme() {
    if (!host) return 'light';
    var t = host.getAttribute('data-bw-theme');
    return (t === 'dark') ? 'dark' : 'light';
  }

  function postToWin(win, msg) {
    if (!win) return;
    msg.source = PARENT_SRC;
    win.postMessage(msg, '*');
  }
  function postToFrame(msg) { postToWin(frame && frame.contentWindow, msg); }
  function postToOverlay(msg) { postToWin(overlayFrame && overlayFrame.contentWindow, msg); }

  /* ---------- 场景持久化（web: localStorage；桌面优先 BWDesktop） ---------- */
  function storeScene(sceneId, scene) {
    try {
      if (window.BWDesktop && typeof window.BWDesktop.saveScene === 'function') {
        window.BWDesktop.saveScene(sceneId, scene); return;
      }
    } catch (_) {}
    try { localStorage.setItem('bw-wb-scene-' + sceneId, JSON.stringify(scene)); } catch (_) {}
  }
  function loadSceneForId(sceneId) {
    try {
      if (window.BWDesktop && typeof window.BWDesktop.loadScene === 'function') {
        var s = window.BWDesktop.loadScene(sceneId);
        if (s) return s;
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem('bw-wb-scene-' + sceneId);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  /* ---------- 透明边距裁剪（真正 tight bounds） ---------- */
  function cropTransparent(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
          var px = ctx.getImageData(0, 0, w, h).data;
          var minX = w, minY = h, maxX = -1, maxY = -1;
          for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
              if (px[(y * w + x) * 4 + 3] !== 0) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < 0) { resolve(dataUrl); return; }
          var cw = maxX - minX + 1, ch = maxY - minY + 1;
          var out = document.createElement('canvas'); out.width = cw; out.height = ch;
          out.getContext('2d').drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
          resolve(out.toDataURL('image/png'));
        } catch (_) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /* ---------- 插入 / 替换（等价 insertImageMarkdown，附带 data-bw-wb-id 以便回编） ---------- */
  function insertWhiteboardImage(url, alt, sceneId, align) {
    var docEl = $('.bw-doc', host); if (!docEl) return;
    var block = document.createElement('div');
    block.className = 'bw-block img';
    block.dataset.md = '![' + (alt || '') + '](' + url + ')';
    block.dataset.bwWbId = sceneId;
    // 复用编辑器统一图片包裹（.bw-img-wrap + 右上角 × 删除按钮），
    // 保证白板导入的图与普通上传图一致地支持 hover 删除。
    block.innerHTML = bwImageWrapHtml(url, alt);
    if (typeof window !== 'undefined') window.__bwLastImageBlock = block;
    if (typeof bwSetImageAlign === 'function') bwSetImageAlign(block, align || 'center');
    var sel = window.getSelection();
    var ref = null;
    if (sel && sel.rangeCount) ref = (sel.getRangeAt(0).startContainer.parentElement || {}).closest('.bw-block');
    if (!ref) ref = docEl.lastElementChild;
    if (ref) ref.parentNode.insertBefore(block, ref.nextSibling); else docEl.appendChild(block);
    if (typeof markDirty === 'function') markDirty(block);
    if (typeof ensureTrailingEmptyBlock === 'function') ensureTrailingEmptyBlock(docEl);
    var stI = stateMap.get(host);
    if (stI && typeof pushUndo === 'function') pushUndo(host, stI);
  }

  function replaceBlock(sceneId, url, align) {
    var oldId = pendingReplaceId; pendingReplaceId = null;
    if (!oldId) return false;
    var block = $('[data-bw-wb-id="' + oldId + '"]', host);
    if (!block) return false;
    var img = block.querySelector('img');
    if (img) img.src = url;
    block.dataset.md = '![白板](' + url + ')';
    block.dataset.bwWbId = sceneId;
    if (typeof bwSetImageAlign === 'function') bwSetImageAlign(block, align || 'center');
    if (typeof markDirty === 'function') markDirty(block);
    var stI = stateMap.get(host);
    if (stI && typeof pushUndo === 'function') pushUndo(host, stI);
    return true;
  }

  function prepareUrl(blob) {
    if (window.BWDesktop && typeof window.BWDesktop.saveImageBlob === 'function') {
      var st = stateMap.get(host);
      var docName = (st && st.title) || (host.getAttribute('data-document-title')) || 'untitled';
      return window.BWDesktop.saveImageBlob(blob, docName, 'wb-' + genId() + '.png');
    }
    return blobToDataURL(blob);
  }

  function handleExportPng(payload) {
    if (!payload || !payload.dataUrl) return;
    var scene = payload.scene || null;
    var sceneId = genId();
    var align = payload.align || 'center';
    if (scene) storeScene(sceneId, scene);
    cropTransparent(payload.dataUrl)
      .then(dataURLToBlob)
      .then(prepareUrl)
      .then(function (url) {
        if (pendingReplaceId) {
          if (!replaceBlock(sceneId, url, align)) insertWhiteboardImage(url, '白板', sceneId, align);
        } else {
          insertWhiteboardImage(url, '白板', sceneId, align);
        }
        if (window.BWDesktop && window.BWDesktop.fixAssetUrls) window.BWDesktop.fixAssetUrls(host);
        if (typeof bwToast === 'function') bwToast(host, '白板图已插入', { type: 'ok' });
      })
      .catch(function (e) {
        console.error('[BW Whiteboard] 插入失败', e);
        if (typeof bwToast === 'function') bwToast(host, '白板图插入失败', { type: 'error' });
      });
  }

  /* ---------- 原图回退（AI 未命中时插入原图） ---------- */
  function fallbackInsertOriginal(dataUrl, align) {
    dataURLToBlob(dataUrl)
      .then(prepareUrl)
      .then(function (url) {
        insertWhiteboardImage(url, '白板', genId(), align);
        if (window.BWDesktop && window.BWDesktop.fixAssetUrls) window.BWDesktop.fixAssetUrls(host);
        if (typeof bwToast === 'function') bwToast(host, '当前模型不支持图像生成，已插入原图', { type: 'warn' });
      });
  }

  /* ---------- 消息桥（同时服务右侧抽屉 iframe 与全屏覆盖层 iframe） ---------- */
  function onMessage(ev) {
    var d = ev.data;
    if (!d || d.source !== SELF_SRC) return;
    var fromDrawer = frame && ev.source === frame.contentWindow;
    var fromPopup = wbPopup && (ev.source === wbPopup);
    if (!fromDrawer && !fromPopup) return;
    var win = fromPopup ? wbPopup : frame.contentWindow;

    if (d.type === 'ready') {
      if (fromDrawer) frameReady = true;
      if (fromPopup) wbPopupReady = true;
      postToWin(win, { type: 'theme', mode: readTheme() });
      if (fromDrawer && pendingScene) { postToFrame({ type: 'load-scene', scene: pendingScene }); pendingScene = null; }
      if (fromOverlay && overlayPendingScene) { postToOverlay({ type: 'load-scene', scene: overlayPendingScene }); overlayPendingScene = null; }
    } else if (d.type === 'export-png') {
      handleExportPng(d.payload);
      if (fromOverlay) closeStandalone();
    } else if (d.type === 'request-beautify') {
      var bf = (window.BWWhiteboard && window.BWWhiteboard.beautify) || fallbackInsertOriginal;
      bf(d.payload && d.payload.dataUrl, d.payload && d.payload.align);
      if (fromOverlay) closeStandalone();
    } else if (d.type === 'error') {
      if (typeof bwToast === 'function') bwToast(host, '白板：' + ((d.payload && d.payload.message) || '错误'), { type: 'error' });
    }
  }

  /* ---------- 抽屉 / 按钮 ---------- */
  function buildDrawer() {
    if (drawer) return;
    drawer = document.createElement('div');
    drawer.className = 'bw-wb-drawer';
    drawer.innerHTML =
      '<div class="bw-wb-resize"></div>' +
      '<div class="bw-wb-drawer-header">' +
        '<span class="bw-wb-drawer-title">白板</span>' +
        '<span class="bw-wb-drawer-hint">画完点白板内「导出并插入」</span>' +
        '<button class="bw-wb-drawer-popout" title="在新窗口/标签页打开白板" aria-label="新窗口打开">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        '</button>' +
        '<button class="bw-wb-drawer-close" title="关闭" aria-label="关闭">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>' +
        '</button>' +
      '</div>' +
      '<iframe class="bw-wb-drawer-iframe" title="白板" frameborder="0"></iframe>';
    var cr = $('#bwContentRight', host); if (cr) cr.appendChild(drawer); else document.body.appendChild(drawer);
    frame = drawer.querySelector('.bw-wb-drawer-iframe');
    drawer.querySelector('.bw-wb-drawer-close').addEventListener('click', function () { drawer.classList.remove('bw-wb-open'); });
    // 全屏覆盖层打开白板（in-webview，避免 window.open 被 WebView2/Tauri 拦截）
    var popoutBtn = drawer.querySelector('.bw-wb-drawer-popout');
    if (popoutBtn) {
      popoutBtn.title = '全屏白板';
      popoutBtn.setAttribute('aria-label', '全屏白板');
      popoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openStandalone();
      });
    }
    // 左侧拖拽手柄：调节抽屉宽度
    var wbHandle = drawer.querySelector('.bw-wb-resize');
    if (wbHandle) bindWbResize(wbHandle);
    bwWbApplyWidth();
  }

  /* ---------- 白板全屏覆盖层（in-webview） ---------- */
  function injectOverlayStyles() {
    if (document.getElementById('bw-wb-overlay-css')) return;
    var style = document.createElement('style');
    style.id = 'bw-wb-overlay-css';
    style.textContent = [
      '.bw-wb-overlay{position:fixed;inset:0;z-index:9999;background:var(--bw-bg,#fff);display:flex;flex-direction:column;}',
      '.bw-wb-overlay[hidden]{display:none;}',
      '.bw-wb-overlay-bar{display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bw-panel,#fff);border-bottom:1px solid var(--bw-border,#e5e7eb);flex-shrink:0;}',
      '.bw-wb-overlay-title{font-size:14px;font-weight:600;color:var(--bw-fg,#1f2937);font-family:inherit;}',
      '.bw-wb-overlay-spacer{flex:1;}',
      '.bw-wb-overlay-close{background:none;border:1px solid var(--bw-border,#e5e7eb);color:var(--bw-fg-muted,#6b7280);padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;display:flex;align-items:center;gap:6px;transition:background .15s,border-color .15s,color .15s;}',
      '.bw-wb-overlay-close:hover{background:var(--bw-bg-hover,#f3f4f6);border-color:var(--bw-accent,#2563eb);color:var(--bw-fg,#1f2937);}',
      '.bw-wb-overlay-iframe{flex:1;width:100%;border:none;background:var(--bw-bg,#fff);}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildOverlay() {
    if (overlay) return;
    injectOverlayStyles();
    overlay = document.createElement('div');
    overlay.className = 'bw-wb-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="bw-wb-overlay-bar">' +
        '<span class="bw-wb-overlay-title">白板 · 全屏</span>' +
        '<span class="bw-wb-overlay-spacer"></span>' +
        '<button class="bw-wb-overlay-close" title="返回编辑器" aria-label="返回编辑器">返回编辑器</button>' +
      '</div>' +
      '<iframe class="bw-wb-overlay-iframe" title="白板全屏" frameborder="0"></iframe>';
    document.body.appendChild(overlay);
    overlayFrame = overlay.querySelector('.bw-wb-overlay-iframe');
    overlay.querySelector('.bw-wb-overlay-close').addEventListener('click', closeStandalone);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) closeStandalone();
    });
  }

  function openStandalone() {
    ensureHost();
    // 关闭右侧抽屉
    if (drawer) drawer.classList.remove('bw-wb-open');
    // 用 window.open 创建独立弹窗（真正的独立窗口）
    var w = 1200, h = 800;
    var left = Math.max(0, (screen.width - w) / 2);
    var top = Math.max(0, (screen.height - h) / 2);
    wbPopup = window.open(
      'whiteboard/index.html',
      'luma-whiteboard',
      'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',menubar=no,toolbar=no,status=no'
    );
    if (!wbPopup) {
      if (typeof bwToast === 'function') bwToast(host, '弹窗被浏览器拦截，请允许弹窗后重试', { type: 'error' });
      return;
    }
    wbPopupReady = false;
    // 监听弹窗 ready 消息
    var readyListener = function (ev) {
      if (ev.source !== wbPopup || !ev.data || ev.data.type !== 'wb-ready') return;
      wbPopupReady = true;
      window.removeEventListener('message', readyListener);
    };
    window.addEventListener('message', readyListener);
    // 通信桥：转发 postMessage
    window.addEventListener('message', function wbBridge(ev) {
      if (ev.source !== wbPopup) return;
      onMessage({ data: ev.data, source: wbPopup });
    });
  }

  function closeStandalone() {
    if (wbPopup) {
      try { wbPopup.close(); } catch (_) {}
      wbPopup = null;
      wbPopupReady = false;
    }
  }

  function openDrawer() {
    buildDrawer();
    // 直接关闭 AI 面板（display:none，不保留滑动残留）
    var aiPanel = document.querySelector('.bw-ai-panel[data-open="true"]');
    if (aiPanel) {
      aiPanel.style.display = 'none';
      aiPanel.setAttribute('data-open', 'false');
      var aiHost = aiPanel.closest('[data-bw-doc-editor]');
      if (aiHost && typeof bwAiApplyWidth === 'function') bwAiApplyWidth(aiHost);
    }
    // 确保白板抽屉可见
    drawer.style.display = '';
    bwWbApplyWidth();
    drawer.classList.add('bw-wb-open');
    if (!frame.getAttribute('src')) frame.setAttribute('src', 'whiteboard/index.html');
  }

  /* ---------- 白板抽屉宽度拖拽 ---------- */
  function bindWbResize(handle) {
    var startX = 0, startW = 0, dragging = false;
    handle.addEventListener('pointerdown', function (e) {
      dragging = true; startX = e.clientX; startW = wbWidth;
      drawer.classList.add('resizing');
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      wbWidth = startW + (startX - e.clientX);
      bwWbApplyWidth();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false; drawer.classList.remove('resizing');
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      try { localStorage.setItem('bw-wb-drawer-width', String(Math.round(wbWidth))); } catch (err) {}
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function openDrawerFresh() {
    pendingReplaceId = null; pendingScene = null;
    ensureHost(); openDrawer();
  }

  function openDrawerForReedit(sceneId) {
    pendingReplaceId = sceneId;
    var scene = loadSceneForId(sceneId);
    ensureHost(); openDrawer();
    if (frameReady) { if (scene) postToFrame({ type: 'load-scene', scene: scene }); }
    else pendingScene = scene;
  }

  function onDblClick(ev) {
    var img = ev.target;
    if (!img || img.tagName !== 'IMG') return;
    var block = img.closest && img.closest('.bw-block.img');
    if (!block || !block.dataset.bwWbId) return;
    openDrawerForReedit(block.dataset.bwWbId);
  }

  function injectButton() {
    var toolbar = $('.bw-toolbar', host);
    if (!toolbar) return;
    if (toolbar.querySelector('.bw-wb-tool-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'bw-tool-btn bw-wb-tool-btn';
    btn.title = '白板'; btn.setAttribute('aria-label', '白板');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/><path d="M15 21V9"/></svg><span class="bw-tooltip">白板</span>';
    btn.addEventListener('click', openDrawerFresh);
    toolbar.appendChild(btn);
  }

  function ensureHost() {
    if (!host) host = $('[data-bw-doc-editor]');
  }

  function ensureButton() {
    ensureHost();
    if (!host) { requestAnimationFrame(ensureButton); return; }
    var toolbar = $('.bw-toolbar', host);
    if (!toolbar) { requestAnimationFrame(ensureButton); return; }
    injectButton();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (frameReady) postToFrame({ type: 'theme', mode: readTheme() });
      }).observe(host, { attributes: true, attributeFilter: ['data-bw-theme'] });
    }
  }

  function init() {
    injectOverlayStyles();
    window.addEventListener('message', onMessage);
    document.addEventListener('dblclick', onDblClick);
    // 窗口 / 左右栏变化时重新钳制抽屉宽度
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (drawer && drawer.classList.contains('bw-wb-open')) bwWbApplyWidth();
      }, 100);
    });
    // 右栏宽度变化（含 TOC 收起/展开、窗口缩放等所有布局重排）自动重整
    ensureHost();
    var cr = host ? $('#bwContentRight', host) : null;
    if (cr && typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(function () { if (drawer) bwWbApplyWidth(); });
        ro.observe(cr);
      } catch (_) {}
    }
    // TOC 侧栏收展 → 立即清理右侧面板重叠
    if (typeof MutationObserver !== 'undefined') {
      try {
        var mo = new MutationObserver(function (muts) {
          for (var mi = 0; mi < muts.length; mi++) {
            if (muts[mi].attributeName === 'class') {
              if (drawer) bwWbApplyWidth();
              break;
            }
          }
        });
        var tocEl = document.querySelector('.bw-toc-sidebar');
        if (tocEl) mo.observe(tocEl, { attributes: true, attributeFilter: ['class'] });
      } catch (_) {}
    }
    // 初次构建后兜底：如果两侧面板同时处于「打开」态（残留状态/旧版本代码导致），关闭白板，保留 AI
    setTimeout(function () {
      var aiOpen = document.querySelector('.bw-ai-panel[data-open="true"]');
      var wbOpen = document.querySelector('.bw-wb-drawer.bw-wb-open');
      if (aiOpen && wbOpen) wbOpen.classList.remove('bw-wb-open');
    }, 500);
    ensureButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { requestAnimationFrame(init); });
  else requestAnimationFrame(init);

  window.BWWhiteboard = window.BWWhiteboard || {};
  window.BWWhiteboard.prepareUrl = prepareUrl;
  window.BWWhiteboard.insertWhiteboardImage = insertWhiteboardImage;
  window.BWWhiteboard.fallbackInsertOriginal = fallbackInsertOriginal;
  window.BWWhiteboard.genId = genId;
  window.BWWhiteboard.getHost = function () { return host; };
})();
