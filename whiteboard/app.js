/**
 * Luma · 白板（iframe 内）
 * 挂载 Excalidraw（UMD 全局 window.Excalidraw），处理与父窗口的 postMessage 桥：
 *   - 父->白板：load-scene / theme / request-export
 *   - 白板->父：ready / export-png / request-beautify / error
 * 零侵入：不依赖编辑器任何模块；vendor 缺失时回退 CDN（离线不可用，已在 plan 标注）。
 */
(function () {
  'use strict';

  var PARENT_SRC = 'bw-editor';
  var SELF_SRC = 'bw-whiteboard';
  var CDN = {
    react: 'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
    reactDom: 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
    excalidraw: 'https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/excalidraw.production.min.js'
  };

  function post(msg) {
    msg.source = SELF_SRC;
    (window.parent || window).postMessage(msg, '*');
  }

  // UMD 全局名：0.17.x 暴露为 window.ExcalidrawLib（命名空间对象，含 Excalidraw 组件与工具）。
  // 兼容旧文档写法 window.Excalidraw。
  function getLib() {
    var lib = window.ExcalidrawLib || window.Excalidraw || {};
    var comp = lib.Excalidraw || (typeof lib === 'function' ? lib : null);
    return {
      Excalidraw: comp,
      exportToBlob: lib.exportToBlob || (comp && comp.exportToBlob),
      restore: lib.restore || (comp && comp.restore)
    };
  }

  var api = null;            // excalidrawAPI
  var currentTheme = 'light';
  var currentAlign = 'center';   // 导出图片对齐：left / center / right
  var isStandalone = (window.parent === window) || /standalone=1/.test(window.location.search);

  function mount() {
    var lib = getLib();
    if (!lib.Excalidraw || !window.React || !window.ReactDOM) {
      loadFromCDN(mount);     // vendor 缺失 -> 在线回退
      return;
    }
    render(lib);
  }

  function render(lib) {
    var root =     window.ReactDOM.createRoot(document.getElementById('bwStage'));
    root.render(window.React.createElement(lib.Excalidraw, {
      excalidrawAPI: function (a) { api = a; post({ type: 'ready' }); },
      theme: currentTheme,
      langCode: 'zh-CN',
      initialData: { appState: { theme: currentTheme }, scrollToContent: true }
    }));
  }

  function getScene() {
    if (!api) return null;
    return { elements: api.getSceneElements(), appState: api.getAppState(), files: api.getFiles() };
  }

  function exportPng(beautify) {
    if (!api) return;
    var lib = getLib();
    if (!lib.exportToBlob) { post({ type: 'error', payload: { message: 'exportToBlob 不可用' } }); return; }
    var scene = getScene();
    var appState = Object.assign({}, scene.appState, {
      exportBackground: false,
      exportWithDarkMode: currentTheme === 'dark'
    });
    lib.exportToBlob({
      elements: scene.elements,
      appState: appState,
      files: scene.files,
      mimeType: 'image/png',
      exportPadding: 8
    }).then(function (blob) {
      // 独立页面模式：直接下载 PNG
      if (isStandalone) {
        var a = document.createElement('a');
        a.download = 'whiteboard-' + Date.now().toString(36) + '.png';
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      // 抽屉模式：通过 postMessage 发给编辑器
      var fr = new FileReader();
      fr.onload = function () {
        var url = fr.result;
        var img = new Image();
        img.onload = function () {
          post({
            type: beautify ? 'request-beautify' : 'export-png',
            payload: { dataUrl: url, width: img.naturalWidth, height: img.naturalHeight, scene: scene, align: currentAlign }
          });
        };
        img.onerror = function () {
          post({ type: beautify ? 'request-beautify' : 'export-png', payload: { dataUrl: url, width: 0, height: 0, scene: scene } });
        };
        img.src = url;
      };
      fr.onerror = function () { post({ type: 'error', payload: { message: 'PNG 读取失败' } }); };
      fr.readAsDataURL(blob);
    }).catch(function (e) {
      post({ type: 'error', payload: { message: String((e && e.message) || e) } });
    });
  }

  function loadScene(scene) {
    if (!api || !scene) return;
    var lib = getLib();
    var data = scene;
    if (lib.restore) {
      try { data = lib.restore(scene, null, null); } catch (_) { data = scene; }
    }
    api.updateScene({
      elements: (data && data.elements) || [],
      appState: Object.assign({}, (data && data.appState) || {}, { theme: currentTheme })
    });
  }

  function clearScene() {
    if (!api) return;
    api.updateScene({ elements: [], appState: { theme: currentTheme } });
  }

  // ---- 父窗口消息 ----
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.source !== PARENT_SRC) return;
    if (ev.source !== window.parent && ev.source !== window) return; // 来源校验
    if (d.type === 'load-scene') loadScene(d.scene);
    else if (d.type === 'theme') {
      currentTheme = d.mode === 'dark' ? 'dark' : 'light';
      if (api) api.updateScene({ appState: { theme: currentTheme } });
    } else if (d.type === 'request-export') exportPng(false);
  });

  // ---- 顶栏按钮 ----
  function bind() {
    // 独立页面模式：把按钮文案从「导出并插入」改为「导出 PNG」
    if (isStandalone) {
      var exBtn = document.getElementById('wbExportBtn');
      if (exBtn) exBtn.textContent = '导出 PNG';
      var beautyBtn = document.getElementById('wbBeautyBtn');
      if (beautyBtn) beautyBtn.textContent = 'AI 美化';
    }
    var ex = document.getElementById('wbExportBtn');
    var bf = document.getElementById('wbBeautyBtn');
    var cl = document.getElementById('wbClearBtn');
    var flowBtn = document.getElementById('wbFlowBtn');
    var tableBtn = document.getElementById('wbTableBtn');
    var tableForm = document.getElementById('wbTableForm');
    var tRows = document.getElementById('wbTableRows');
    var tCols = document.getElementById('wbTableCols');
    var tCancel = document.getElementById('wbTableCancel');
    // 对齐选择（左 / 中 / 右）
    var alignBtns = ['wbAlignLeft', 'wbAlignCenter', 'wbAlignRight'];
    alignBtns.forEach(function (id, idx) {
      var b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('click', function () {
        currentAlign = (idx === 0 ? 'left' : (idx === 2 ? 'right' : 'center'));
        alignBtns.forEach(function (x) {
          var el = document.getElementById(x); if (el) el.classList.remove('active');
        });
        b.classList.add('active');
      });
    });
    if (ex) ex.addEventListener('click', function () { exportPng(false); });
    if (bf) bf.addEventListener('click', function () { exportPng(true); });
    if (cl) cl.addEventListener('click', clearScene);
    // 流程图：动态构建弹出面板（避免 HTML ID 查找时机问题）
    var flowPalette = document.createElement('div');
    flowPalette.className = 'bw-wb-flow-palette';
    flowPalette.style.display = 'none';
    [
      { shape: 'start',     label: '开始' },
      { shape: 'process',   label: '处理' },
      { shape: 'decision',  label: '判断' },
      { shape: 'end',       label: '结束' },
      { shape: 'connector', label: '连线' },
      { type: 'sep' },
      { shape: 'template',  label: '\u5B8C\u6574\u6A21\u677F', cls: 'bw-wb-flow-template' }
    ].forEach(function (cfg) {
      if (cfg.type === 'sep') {
        var sep = document.createElement('div'); sep.className = 'bw-wb-flow-sep';
        flowPalette.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'bw-wb-flow-item' + (cfg.cls ? ' ' + cfg.cls : '');
      btn.textContent = cfg.label;
      btn.setAttribute('data-shape', cfg.shape);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        flowPalette.style.display = 'none';
        if (!window.BWShapes || !api) return;
        var s = this.getAttribute('data-shape');
        if (s === 'template')   window.BWShapes.insertFlowchart(api);
        else if (s === 'start')      window.BWShapes.insertFlowStart(api);
        else if (s === 'end')        window.BWShapes.insertFlowEnd(api);
        else if (s === 'process')    window.BWShapes.insertFlowProcess(api);
        else if (s === 'decision')   window.BWShapes.insertFlowDec(api);
        else if (s === 'connector')  window.BWShapes.insertFlowConn(api);
      });
      flowPalette.appendChild(btn);
    });
    if (flowBtn && flowBtn.parentNode) {
      var wrap = document.createElement('span');
      wrap.className = 'bw-wb-flow-wrap';
      flowBtn.parentNode.insertBefore(wrap, flowBtn);
      wrap.appendChild(flowBtn);
      wrap.appendChild(flowPalette);
      flowBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        flowPalette.style.display = (flowPalette.style.display === 'flex') ? 'none' : 'flex';
      });
      document.addEventListener('click', function (ev) {
        if (flowPalette.style.display === 'flex' && !flowPalette.contains(ev.target) && ev.target !== flowBtn) {
          flowPalette.style.display = 'none';
        }
      });
    } else if (flowBtn) {
      // 兜底：直接插入模板（无面板可用时回退旧行为）
      flowBtn.addEventListener('click', function () {
        if (window.BWShapes && api) window.BWShapes.insertFlowchart(api);
      });
    }
    if (tableBtn) tableBtn.addEventListener('click', function () {
      if (tableForm) tableForm.hidden = !tableForm.hidden;
    });
    if (tCancel) tCancel.addEventListener('click', function () {
      if (tableForm) tableForm.hidden = true;
    });
    if (tableForm) tableForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = Math.max(1, Math.min(20, parseInt((tRows && tRows.value) || '3', 10) || 3));
      var c = Math.max(1, Math.min(20, parseInt((tCols && tCols.value) || '3', 10) || 3));
      if (window.BWShapes && api) window.BWShapes.insertTable(api, r, c);
      tableForm.hidden = true;
    });
  }

  // ---- vendor 缺失时在线回退（离线不可用） ----
  function loadFromCDN(cb) {
    var need = [];
    if (!window.React) need.push(CDN.react);
    if (!window.ReactDOM) need.push(CDN.reactDom);
    if (!window.ExcalidrawLib && !window.Excalidraw) need.push(CDN.excalidraw);
    if (!need.length) { cb(); return; }
    var i = 0;
    (function next() {
      if (i >= need.length) { cb(); return; }
      var s = document.createElement('script');
      s.src = need[i++];
      s.onload = next;
      s.onerror = function () { post({ type: 'error', payload: { message: 'CDN 资源加载失败（离线不可用）' } }); };
      document.head.appendChild(s);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bind(); mount(); });
  else { bind(); mount(); }
})();
