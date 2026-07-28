/**
 * Luma — 桌面桥接脚本（Tauri v2 专用）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 桌面守卫：浏览器里整文件空操作（window.BWDesktop = null）
 *   2. 图片管理：saveImageBlob / fixAssetUrls / 压缩落盘
 *   3. 【集成】Typora 同款文件目录树 — 嵌入侧栏"文件"Tab（与"大纲"并列）
 *   4. 【仅手动保存】Ctrl+S 才写本地文件，自动保存默认关
 *   5. 原生打开/保存对话框 + 最近文件
 *   6. 拖拽 .md 文件到窗口直接打开
 *   7. 白板独立新窗口
 *
 * 设计原则：复用网页 --bw-* 设计变量，UI 100% 与网页版一致。
 * 该文件被 index.html 在 bw-bootstrap 之前以 <script defer> 引入。
 */
(function () {
  'use strict';

  // 在 Tauri 环境下添加一个极早期的标签，证明桥接脚本至少执行了
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
    window.__bw_bridge_loaded = true;
    console.log('[BW Desktop] v1 桥接脚本已载入，检测到 Tauri 环境');
  }

  /* ============================================================
   * 1. 桌面守卫：浏览器里直接空操作
   * ============================================================ */
  if (!(window.__TAURI_INTERNALS__ || window.__TAURI__)) {
    window.BWDesktop = null;
    console.log('[BW Desktop] 浏览器环境，跳过桌面桥');
    return;
  }

  /* Tauri v2 全局 API */
  var TAURI = window.__TAURI__ || {};
  var invoke = (TAURI.core && typeof TAURI.core.invoke === 'function')
    ? TAURI.core.invoke
    : (typeof TAURI.invoke === 'function' ? TAURI.invoke : null);
  var convertFileSrc = (TAURI.core && typeof TAURI.core.convertFileSrc === 'function')
    ? TAURI.core.convertFileSrc
    : null;
  var webviewWindowFn = (TAURI && TAURI.webviewWindow) || null;

  if (typeof invoke !== 'function') {
    console.error('[BW Desktop] Tauri invoke 不可用，桌面桥接已禁用');
    window.BWDesktop = null;
    return;
  }

  // 立即注册桌面桥，让编辑器其他模块（如 bw-save）知道桌面已就绪
  // 公开 API 将在文件末尾统一挂载

  console.log('[BW Desktop] invoke 可用，准备注册桌面功能 (withGlobalTauri=' + Boolean(TAURI) + ')');

  /* ============================================================
   * 内部状态
   * ============================================================ */
  var _currentDocDir = null;
  var _currentDocName = null;
  var _defaultDocDir = null;
  var _currentDocPath = null;
  var _fileTreeDir = null;
  var _recentFiles = [];
  var _lastEntries = [];
  var _treeVisible = false;     // 默认显示"大纲" Tab

  function sanitizeName(name) {
    return (name || '').replace(/[<>:"|?*\\\/]/g, '_');
  }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function getActiveState() {
    var host = document.querySelector('[data-bw-doc-editor]');
    if (!host) return null;
    return (window.stateMap && window.stateMap.get(host)) || null;
  }

  /* ============================================================
   * 3. 文件目录树 — 集成到侧栏（文件/大纲 Tab 并列）
   * ============================================================ */
  function injectFileTreeStyles() {
    if (document.getElementById('bw-desktop-filetree-css')) return;
    var style = document.createElement('style');
    style.id = 'bw-desktop-filetree-css';
    style.textContent = [
      '/* 侧栏 Tab（桌面版） */',
      '.bw-toc-tabs{display:flex;background:var(--bw-panel,#fff);border-bottom:1px solid var(--bw-border,#e5e7eb);flex-shrink:0;}',
      '.bw-toc-tab{flex:1;padding:10px 0;background:none;border:none;border-bottom:2px solid transparent;color:var(--bw-fg-muted,#6b7280);font-size:13px;font-family:inherit;cursor:pointer;transition:color .15s,border-color .15s;text-align:center;}',
      '.bw-toc-tab:hover{color:var(--bw-fg,#1f2937);}',
      '.bw-toc-tab.active{color:var(--bw-accent,#2563eb);border-bottom-color:var(--bw-accent,#2563eb);font-weight:600;}',
      '.bw-toc-list[hidden]{display:none;}',
      '#bwFtPanel{display:none;flex-direction:column;height:100%;overflow:hidden;}',
      '#bwFtPanel:not([hidden]){display:flex;}',
      '/* 文件树头部 */',
      '.bw-ft-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--bw-border-light,#f3f4f6);flex-shrink:0;}',
      '.bw-ft-header .bw-ft-title{flex:1;font-size:13px;font-weight:600;color:var(--bw-fg,#1f2937);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:inherit;}',
      '.bw-ft-header button{background:none;border:1px solid var(--bw-border,#e5e7eb);color:var(--bw-fg-muted,#6b7280);width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background.15s,border-color.15s;}',
      '.bw-ft-header button:hover{background:var(--bw-bg-hover,#f3f4f6);border-color:var(--bw-accent,#2563eb);color:var(--bw-fg,#1f2937);}',
      '.bw-ft-header button svg{width:15px;height:15px;}',
      '/* 搜索 */',
      '.bw-ft-search{padding:8px 14px;flex-shrink:0;}',
      '.bw-ft-search input{width:100%;padding:6px 10px;border:1px solid var(--bw-border,#e5e7eb);border-radius:6px;font-size:13px;font-family:inherit;background:var(--bw-bg-soft,#f9fafb);color:var(--bw-fg,#1f2937);box-sizing:border-box;transition:border-color.15s;}',
      '.bw-ft-search input:focus{outline:none;border-color:var(--bw-accent,#2563eb);}',
      '/* 文件列表 */',
      '.bw-ft-list{flex:1;overflow:auto;padding:4px 6px;}',
      '.bw-ft-item{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;cursor:pointer;color:var(--bw-fg,#374151);font-size:13px;font-family:inherit;transition:background.12s;user-select:none;}',
      '.bw-ft-item:hover{background:var(--bw-bg-hover,#f3f4f6);}',
      '.bw-ft-item.active{background:var(--bw-accent-soft,#dbeafe);color:var(--bw-accent,#2563eb);font-weight:500;}',
      '.bw-ft-item svg{width:14px;height:14px;flex-shrink:0;color:var(--bw-fg-muted,#9ca3af);}',
      '.bw-ft-item.active svg{color:var(--bw-accent,#2563eb);}',
      '.bw-ft-item .bw-ft-arrow{transition:transform.15s;width:12px;height:12px;flex-shrink:0;}',
      '.bw-ft-item.expanded>.bw-ft-arrow{transform:rotate(90deg);}',
      '.bw-ft-item .bw-ft-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.bw-ft-children{overflow:hidden;}',
      '.bw-ft-children.collapsed{display:none;}',
      '.bw-ft-indent{padding-left:20px !important;}',
      '/* 空状态 */',
      '.bw-ft-empty{padding:60px 24px;text-align:center;color:var(--bw-fg-muted,#9ca3af);font-size:13px;font-family:inherit;line-height:1.8;}',
      '.bw-ft-empty-cta{display:inline-block;margin-top:12px;padding:7px 18px;background:var(--bw-accent,#2563eb);color:#fff;border:none;border-radius:6px;font-size:13px;font-family:inherit;cursor:pointer;transition:background.15s;}',
      '.bw-ft-empty-cta:hover{background:var(--bw-accent-hover,#1d4ed8);}',
      '/* 底部操作栏 */',
      '.bw-ft-footer{display:flex;gap:6px;padding:8px 14px;border-top:1px solid var(--bw-border-light,#f3f4f6);flex-shrink:0;}',
      '.bw-ft-footer button{flex:1;padding:6px 0;background:none;border:1px solid var(--bw-border,#e5e7eb);border-radius:6px;color:var(--bw-fg-muted,#6b7280);cursor:pointer;font-size:12px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:background.15s,border-color.15s,color.15s;}',
      '.bw-ft-footer button:hover{background:var(--bw-bg-hover,#f3f4f6);border-color:var(--bw-accent,#2563eb);color:var(--bw-fg,#1f2937);}',
      '.bw-ft-footer button svg{width:12px;height:12px;}',
      '/* 右键菜单 */',
      '.bw-ft-context-menu{position:fixed;background:var(--bw-panel,#fff);border:1px solid var(--bw-border,#e5e7eb);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:4px;display:none;z-index:2000;min-width:150px;font-family:inherit;}',
      '.bw-ft-context-menu button{display:block;width:100%;padding:7px 14px;background:none;border:none;text-align:left;color:var(--bw-fg,#374151);font-size:13px;font-family:inherit;cursor:pointer;border-radius:5px;transition:background.12s;}',
      '.bw-ft-context-menu button:hover{background:var(--bw-bg-hover,#f3f4f6);}',
      '.bw-ft-context-menu button.danger{color:var(--bw-danger,#dc2626);}',
      '.bw-ft-context-menu button.danger:hover{background:var(--bw-danger-soft,#fee2e2);}',
      '.bw-ft-menu-sep{height:1px;background:var(--bw-border-light,#f3f4f6);margin:4px 0;}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildFileTreeHTML() {
    return [
      '<div class="bw-ft-header">',
        '<span class="bw-ft-title" id="bwFtTitle">未打开文件夹</span>',
        '<button id="bwFtBrowse" title="选择文件夹"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>',
      '</div>',
      '<div class="bw-ft-search"><input type="text" id="bwFtSearch" placeholder="搜索文件名..." /></div>',
      '<div class="bw-ft-list" id="bwFtList"></div>',
      '<div class="bw-ft-footer">',
        '<button id="bwFtNewFile" title="新建 Markdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> 新建</button>',
        '<button id="bwFtNewFolder" title="新建文件夹"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg> 文件夹</button>',
      '</div>',
      '<div class="bw-ft-context-menu" id="bwFtContextMenu">',
        '<button data-action="open">打开</button>',
        '<button data-action="rename">重命名</button>',
        '<button data-action="delete" class="danger">删除</button>',
        '<div class="bw-ft-menu-sep"></div>',
        '<button data-action="reveal">在资源管理器中显示</button>',
      '</div>',
    ].join('');
  }

  function switchSidebarTab(tab) {
    var tocList = document.getElementById('bwTocList');
    var ftPanel = document.getElementById('bwFtPanel');
    document.querySelectorAll('.bw-toc-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    if (tocList) tocList.hidden = (tab !== 'toc');
    if (ftPanel) ftPanel.hidden = (tab !== 'file');
    _treeVisible = (tab === 'file');
    if (tab === 'file' && _fileTreeDir) loadFileTreeDir(_fileTreeDir);
  }

  function initFileTree() {
    injectFileTreeStyles();
    var tocSidebar = document.getElementById('bwTocSidebar');
    if (!tocSidebar) { console.error('[BW Desktop] 找不到 #bwTocSidebar'); return; }

    // 注入 Tab 栏
    var tabsDiv = document.createElement('div');
    tabsDiv.className = 'bw-toc-tabs';
    tabsDiv.innerHTML = '<button class="bw-toc-tab active" data-tab="toc">大纲</button>'
      + '<button class="bw-toc-tab" data-tab="file">文件</button>';
    tocSidebar.insertBefore(tabsDiv, tocSidebar.firstChild);

    // 注入文件树面板
    var ftPanel = document.createElement('div');
    ftPanel.id = 'bwFtPanel';
    ftPanel.hidden = true;
    ftPanel.innerHTML = buildFileTreeHTML();
    tocSidebar.appendChild(ftPanel);

    // Tab 切换
    tabsDiv.querySelectorAll('.bw-toc-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchSidebarTab(btn.dataset.tab); });
    });

    // 文件树按钮
    document.getElementById('bwFtBrowse').addEventListener('click', browseFolder);
    document.getElementById('bwFtNewFile').addEventListener('click', newFileFromTree);
    document.getElementById('bwFtNewFolder').addEventListener('click', newFolderFromTree);

    // 搜索
    var searchInput = document.getElementById('bwFtSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        renderFileTree(_lastEntries || [], searchInput.value);
      });
    }

    // 右键菜单
    document.addEventListener('click', function () {
      var cm = document.getElementById('bwFtContextMenu');
      if (cm) cm.style.display = 'none';
    });
    var ctxMenu = document.getElementById('bwFtContextMenu');
    if (ctxMenu) {
      ctxMenu.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var action = btn.dataset.action;
        var path = ctxMenu._ctxPath;
        var isDir = ctxMenu._ctxIsDir;
        ctxMenu.style.display = 'none';
        if (action === 'open') openFileFromTree(path);
        else if (action === 'rename') renameFileFromTree(path, isDir);
        else if (action === 'delete') deleteFileFromTree(path, isDir);
        else if (action === 'reveal') invoke('open_in_shell', { path: path });
      });
    }

    // 初始空状态
    renderEmptyFileTree();
    loadRecentAndOpen();
  }

  function renderEmptyFileTree() {
    var list = document.getElementById('bwFtList');
    if (!list) return;
    list.innerHTML = '<div class="bw-ft-empty">'
      + '<div>没有打开的文件夹</div>'
      + '<button class="bw-ft-empty-cta" id="bwFtEmptyCta">打开文件夹...</button>'
      + '</div>';
    var cta = document.getElementById('bwFtEmptyCta');
    if (cta) cta.addEventListener('click', browseFolder);
  }

  function renderFileTree(entries, filter) {
    _lastEntries = entries;
    var list = document.getElementById('bwFtList');
    if (!list) return;
    filter = (filter || '').toLowerCase();

    // 过滤：只显示文件夹 + Markdown 文件
    var SUPPORTED = ['.md','.markdown','.mdown','.bwdoc'];
    var visible = entries.filter(function (e) {
      if (e.is_dir) return true;
      var ext = (e.name || '').toLowerCase();
      if (ext.lastIndexOf('.') >= 0) ext = ext.slice(ext.lastIndexOf('.'));
      else return false;
      return SUPPORTED.indexOf(ext) >= 0;
    });

    if (!visible.length) { renderEmptyFileTree(); return; }
    // 排序：文件夹在前，文件在后，按名称
    visible.sort(function (a, b) {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    var html = '';
    visible.forEach(function (e) {
      html += buildTreeNode(e, 0, filter);
    });
    list.innerHTML = html;
    bindTreeEvents();
  }

  function buildTreeNode(e, depth, filter) {
    var isDir = !!e.is_dir;
    var name = e.name || '';
    var match = !filter || name.toLowerCase().indexOf(filter) >= 0;
    // 文件夹始终显示，文件需要 match filter
    if (!isDir && !match) return '';
    var currentPath = _currentDocPath || '';
    var isActive = e.path === currentPath;
    var cls = 'bw-ft-item' + (isActive ? ' active' : '') + (isDir ? ' is-dir' : '');
    var indent = depth > 0 ? ' bw-ft-indent' : '';
    var chevron = isDir
      ? '<svg class="bw-ft-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>'
      : '';
    var icon = isDir
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    var html = '<div class="' + cls + indent + '" data-path="' + e.path + '" data-is-dir="' + isDir + '" data-depth="' + depth + '">'
      + chevron + icon
      + '<span class="bw-ft-name">' + name + '</span>'
      + '</div>';
    if (isDir) {
      html += '<div class="bw-ft-children collapsed" data-parent="' + e.path + '"></div>';
    }
    return html;
  }

  function bindTreeEvents() {
    var list = document.getElementById('bwFtList');
    if (!list) return;
    list.querySelectorAll('.bw-ft-item').forEach(function (it) {
      if (it._bound) return;
      it._bound = true;
      var path = it.dataset.path, isDir = it.dataset.isDir === 'true';
      it.addEventListener('click', function () {
        if (isDir) {
          toggleTreeNode(it, path);
        } else {
          openFileFromTree(path);
        }
      });
      it.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var cm = document.getElementById('bwFtContextMenu');
        if (!cm) return;
        cm._ctxPath = path;
        cm._ctxIsDir = isDir;
        cm.style.display = 'block';
        cm.style.left = e.clientX + 'px';
        cm.style.top = e.clientY + 'px';
      });
    });
  }

  function toggleTreeNode(item, dirPath) {
    var children = item.nextElementSibling;
    if (!children || !children.classList.contains('bw-ft-children')) return;
    if (children.classList.contains('collapsed')) {
      // 展开：加载子目录内容
      item.classList.add('expanded');
      children.classList.remove('collapsed');
      invoke('list_dir', { path: dirPath, recursive: false }).then(function (result) {
        var entries = (result && result.entries) || [];
        var SUPPORTED = ['.md','.markdown','.mdown','.bwdoc'];
        var depth = parseInt(item.dataset.depth || '0') + 1;
        var html = '';
        entries.forEach(function (e) {
          if (!e.is_dir) {
            var ext = (e.name || '').toLowerCase();
            if (ext.lastIndexOf('.') >= 0) ext = ext.slice(ext.lastIndexOf('.'));
            else return;
            if (SUPPORTED.indexOf(ext) < 0) return;
          }
          html += buildTreeNode(e, depth, '');
        });
        children.innerHTML = html || '<div class="bw-ft-empty">空文件夹</div>';
        bindTreeEvents();
      }).catch(function () {
        children.innerHTML = '<div class="bw-ft-empty">无法加载</div>';
      });
    } else {
      // 折叠
      item.classList.remove('expanded');
      children.classList.add('collapsed');
    }
  }

  function browseFolder() {
    if (!TAURI.dialog || !TAURI.dialog.open) {
      console.warn('[BW Desktop] dialog API 不可用');
      return;
    }
    TAURI.dialog.open({ directory: true, multiple: false, title: '选择文件夹' }).then(function (path) {
      if (path) {
        loadFileTreeDir(typeof path === 'string' ? path : path[0]);
        if (_defaultDocDir) invoke('write_recent_dir', { path: path }).catch(function () {});
        // 自动切到文件 Tab
        switchSidebarTab('file');
      }
    }).catch(function (e) { console.error(e); });
  }

  function openFileFromTree(filePath) {
    if (!filePath) return;
    invoke('read_file', { path: filePath }).then(function (content) {
      var host = document.querySelector('[data-bw-doc-editor]');
      if (!host) return;
      var st = (window.stateMap && window.stateMap.get(host)) || null;
      if (!st) return;
      var titleInput = host.querySelector('.bw-title-input') || host.querySelector('#bwTitleInput');
      var name = filePath.replace(/^.*[\\\/]/, '').replace(/\.md$/i, '');
      if (titleInput) titleInput.value = name;
      // 替换 doc 内容
      var docEl = host.querySelector('.bw-doc');
      if (docEl && typeof window.buildDoc === 'function') {
        window.buildDoc(content, host);
      }
      _currentDocPath = filePath;
      _currentDocDir = filePath.replace(/[\\\/][^\\\/]*$/, '');
      _currentDocName = name;
      // 高亮
      var items = document.querySelectorAll('.bw-ft-item');
      items.forEach(function (it) { it.classList.toggle('active', it.dataset.path === filePath); });
      // 保存到 recent
      pushRecentFile(filePath);
      if (typeof window.markClean === 'function') window.markClean(host);
    }).catch(function (err) {
      console.error('[BW Desktop] 打开文件失败:', err);
      var host = document.querySelector('[data-bw-doc-editor]');
      if (host && typeof window.bwToast === 'function') {
        window.bwToast(host, '打开文件失败: ' + err, { type: 'error' });
      }
    });
  }

  function newFileFromTree() {
    var dir = _fileTreeDir || _defaultDocDir;
    if (!dir) { browseFolder(); return; }
    var name = '未命名文档_' + new Date().toISOString().slice(0, 10) + '.md';
    var path = dir + '\\' + name;
    invoke('write_file', { path: path, content: '# ' + name.replace(/\.md$/, '') + '\n\n' }).then(function () {
      loadFileTreeDir(dir);
      openFileFromTree(path);
    }).catch(function (err) { console.error('[BW Desktop] 新建文件失败:', err); });
  }

  function newFolderFromTree() {
    var dir = _fileTreeDir || _defaultDocDir;
    if (!dir) { browseFolder(); return; }
    var name = '新建文件夹';
    var path = dir + '\\' + name;
    invoke('mkdir', { path: path }).then(function () { loadFileTreeDir(dir); })
      .catch(function () {
        // 已存在则加数字后缀重试
        var i = 2;
        function tryNext() {
          var p = dir + '\\' + name + '_' + i;
          invoke('mkdir', { path: p }).then(function () { loadFileTreeDir(dir); })
            .catch(function () { i++; if (i < 20) tryNext(); });
        }
        tryNext();
      });
  }

  function renameFileFromTree(filePath, isDir) {
    var oldName = filePath.replace(/^.*[\\\/]/, '');
    var newName = prompt('重命名为：', oldName);
    if (!newName || newName === oldName) return;
    newName = sanitizeName(newName);
    var parent = filePath.replace(/[\\\/][^\\\/]*$/, '');
    var newPath = parent + '\\' + newName;
    invoke('rename_file', { old: filePath, new_path: newPath }).then(function () {
      if (_fileTreeDir) loadFileTreeDir(_fileTreeDir);
      if (_currentDocPath === filePath) _currentDocPath = newPath;
    }).catch(function (err) {
      var host = document.querySelector('[data-bw-doc-editor]');
      if (host && typeof window.bwToast === 'function') {
        window.bwToast(host, '重命名失败: ' + err, { type: 'error' });
      }
    });
  }

  function deleteFileFromTree(filePath, isDir) {
    var msg = isDir ? '确定删除文件夹 "' + filePath.replace(/^.*[\\\/]/, '') + '" 吗？' : '确定删除文件 "' + filePath.replace(/^.*[\\\/]/, '') + '" 吗？';
    if (!confirm(msg)) return;
    invoke('delete_file', { path: filePath }).then(function () {
      if (_fileTreeDir) loadFileTreeDir(_fileTreeDir);
    }).catch(function (err) {
      var host = document.querySelector('[data-bw-doc-editor]');
      if (host && typeof window.bwToast === 'function') {
        window.bwToast(host, '删除失败: ' + err, { type: 'error' });
      }
    });
  }

  /* ============================================================
   * 4. 仅手动保存 — 自动保存默认关闭，Ctrl+S 才写文件
   * ============================================================ */
  var _pendingSave = false;
  function scheduleSave() { _pendingSave = true; }
  function flushSaveIfPending() {
    if (_pendingSave) {
      _pendingSave = false;
      doSaveNow();
    }
  }

  function doSaveNow() {
    var host = document.querySelector('[data-bw-doc-editor]');
    if (!host) return;
    var st = (window.stateMap && window.stateMap.get(host)) || null;
    if (!st || !st.dirty || st.saving) return;
    var content;
    if (typeof window.getCanonicalJson === 'function') {
      content = window.getCanonicalJson(host);
    } else if (typeof window.getMarkdown === 'function') {
      content = window.getMarkdown(host);
    } else {
      var docEl = host.querySelector('.bw-doc');
      content = docEl ? docEl.textContent : '';
    }
    var md = canonicalToMarkdownJ(content);
    if (!_currentDocPath) {
      // 没有保存过 → 弹原生保存对话框
      saveAsNew();
      return;
    }
    st.saving = true;
    if (typeof window.updateSaveStatus === 'function') window.updateSaveStatus(host, 'saving');
    invoke('write_file', { path: _currentDocPath, content: md }).then(function () {
      st.saving = false;
      if (typeof window.updateSaveStatus === 'function') window.updateSaveStatus(host, 'saved');
      if (typeof window.markClean === 'function') window.markClean(host);
      pushRecentFile(_currentDocPath);
    }).catch(function (err) {
      st.saving = false;
      if (typeof window.updateSaveStatus === 'function') window.updateSaveStatus(host, 'error');
      console.error('[BW Desktop] 保存失败:', err);
    });
  }

  function saveAsNew() {
    var host = document.querySelector('[data-bw-doc-editor]');
    if (!host || !TAURI.dialog || !TAURI.dialog.save) return;
    var st = (window.stateMap && window.stateMap.get(host)) || null;
    TAURI.dialog.save({
      title: '保存为',
      defaultPath: (_currentDocDir || _defaultDocDir || '') + '\\未命名.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }).then(function (path) {
      if (!path) return;
      var content;
      if (typeof window.getCanonicalJson === 'function') {
        content = window.getCanonicalJson(host);
      } else if (typeof window.getMarkdown === 'function') {
        content = window.getMarkdown(host);
      } else {
        var docEl = host.querySelector('.bw-doc');
        content = docEl ? docEl.textContent : '';
      }
      var md = canonicalToMarkdownJ(content);
      invoke('write_file', { path: path, content: md }).then(function () {
        _currentDocPath = path;
        _currentDocDir = path.replace(/[\\\/][^\\\/]*$/, '');
        _currentDocName = path.replace(/^.*[\\\/]/, '').replace(/\.md$/, '');
        var titleInput = host.querySelector('.bw-title-input') || host.querySelector('#bwTitleInput');
        if (titleInput) titleInput.value = _currentDocName;
        if (st) { st.saving = false; if (typeof window.markClean === 'function') window.markClean(host); }
        if (typeof window.updateSaveStatus === 'function') window.updateSaveStatus(host, 'saved');
        pushRecentFile(path);
      });
    }).catch(function (e) { console.error(e); });
  }

  /* ============================================================
   * 5. 拖拽 .md 文件到窗口直接打开
   * ============================================================ */
  function initDragDrop() {
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var f = files[0];
      if (!/\.md$/i.test(f.name)) return;
      var reader = new FileReader();
      reader.onload = function () {
        var content = reader.result || '';
        var host = document.querySelector('[data-bw-doc-editor]');
        if (!host) return;
        if (typeof window.buildDoc === 'function') window.buildDoc(content, host);
        var titleInput = host.querySelector('.bw-title-input') || host.querySelector('#bwTitleInput');
        if (titleInput) titleInput.value = f.name.replace(/\.md$/i, '');
        _currentDocPath = null; // 未保存
      };
      reader.readAsText(f);
    });
  }

  /* ============================================================
   * 6. 快捷键（Ctrl+S / Ctrl+O / Ctrl+N）
   * ============================================================ */
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (e.shiftKey) saveAsNew(); else doSaveNow();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        if (_fileTreeDir) {
          switchSidebarTab('file');
        } else {
          browseFolder();
        }
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        newFileFromTree();
      }
    });
  }

  /* ============================================================
   * 7. 白板独立全屏 — 已由 bw-whiteboard.js 的 in-webview 覆盖层接管
   *     此处不再需要 hookWhiteboardPopout / openWhiteboardWindow
   * ============================================================ */

  /* ============================================================
   * 顶栏按钮注入：界面设置 + 入门指南
   * ============================================================ */
  function injectTopBarButtons() {
    setTimeout(function () {
      var toolbar = document.querySelector('.bw-toolbar') || document.querySelector('.bw-top-actions');
      if (!toolbar || toolbar._topbarInjected) return;
      toolbar._topbarInjected = true;

      var sep = document.createElement('div');
      sep.className = 'bw-toolbar-sep';

      // 入门指南按钮
      var guideBtn = document.createElement('button');
      guideBtn.className = 'bw-tool-btn';
      guideBtn.title = '入门指南';
      guideBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span class="bw-tooltip">入门指南</span>';
      guideBtn.addEventListener('click', openGuide);

      // 设置按钮
      var settingsBtn = document.createElement('button');
      settingsBtn.className = 'bw-tool-btn';
      settingsBtn.title = '设置';
      settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span class="bw-tooltip">设置</span>';
      settingsBtn.addEventListener('click', toggleSettings);

      toolbar.appendChild(sep);
      toolbar.appendChild(guideBtn);
      toolbar.appendChild(settingsBtn);
    }, 600);
  }

  function openGuide() {
    var host = document.querySelector('[data-bw-doc-editor]');
    if (!host) return;
    var guideMd =
      '# Luma 编辑器 · 入门指南\n\n' +
      '## 快捷操作\n\n' +
      '| 快捷键 | 功能 |\n|--------|------|\n' +
      '| **Shift + 空格** | 切换 源码 / 预览 模式。这是 Luma 独有的快捷切换键，不需要鼠标点按钮，写 Markdown 时随手按一下就能看到渲染效果。 |\n' +
      '| **Ctrl + S** | 手动保存到本地文件（桌面版不自动保存，请养成 Ctrl+S 的习惯） |\n' +
      '| **Ctrl + Shift + S** | 另存为… |\n' +
      '| **Ctrl + B / I** | 粗体 / 斜体 |\n' +
      '| **Ctrl + H** | 添加/切换标题级别 |\n' +
      '| **Ctrl + O / N** | 打开文件夹 / 新建 Markdown 文件 |\n' +
      '| **ESC** | 退出专注模式 |\n' +
      '| **Backspace（行首）** | 取消当前行的 Markdown 标记。例如输入 `## 标题` 后按第一次 Backspace 去掉 `##` 变回纯文本，再按一次与上行合并。 |\n' +
      '| **Ctrl + A** | 只选中当前块内容（不会全选整篇文档，方便块内操作） |\n\n' +
      '## Markdown 特色\n\n' +
      '**实时渲染**：输入标题、粗斜体、删除线、行内代码、链接等 Markdown 语法后，失焦即自动渲染。编辑态下左侧竖线会变色提示当前块的语法类型（绿色 = Markdown 语法，蓝色 = 数学公式）。\n\n' +
      '**KaTeX 数学公式**：`$a^2 + b^2 = c^2$` 行内公式，`$$\n\\sum_{i=1}^{n} x_i\n$$` 块级公式独立显示。输入公式后会看到实时 LaTeX 预览框——这是 Luma 唯一自动弹出预览的场景（避免普通 Markdown 打字时频繁弹出渲染框干扰）。LaTeX 无法渲染时会显示错误提示。\n\n' +
      '**图片插入**：拖拽图片到编辑器、粘贴剪贴板截图、或点击工具栏图片按钮选择文件。超过 1600px 的图片会自动压缩，以 dataURL 嵌入文档。图片支持左/中/右对齐——光标放在图片块上，点顶栏对齐按钮即可切换。hover 图片时右上角出现 × 删除按钮。\n\n' +
      '## 面板与工具\n\n' +
      '**侧栏 · 文件 / 大纲**：左侧侧栏有两个 Tab——「大纲」显示文档标题结构，点击可跳转；「文件」Tab 打开本地文件夹后可以像 Typora 一样浏览、打开、新建、重命名、删除 Markdown 文件。右键文件可打开文件夹所在地。\n\n' +
      '**AI 助手（灵犀）**：顶栏点「AI 助手」按钮打开右侧面板，默认加载全文上下文。提供总结全文、润色、补全、续写、审稿、查错六种快捷操作，也支持自由对话。支持 DeepSeek / OpenAI / 本地 Ollama 多模型切换。清空会话按钮可重置对话。\n\n' +
      '**白板（画板）**：点「白板」按钮在右侧抽屉打开 Excalidraw 画板。工具栏提供流程图元素面板（开始/处理/判断/结束/连线/完整模板）和表格插入。**独立窗口**：点白板按钮旁边的「独立窗口」可把画板在新窗口中打开，双屏工作时十分方便。\n\n' +
      '## 小技巧\n\n' +
      '- **专注模式**：点顶栏「专注模式」按钮，隐藏所有工具栏和侧栏，编辑区扩至 1100px，沉浸式写作。\n' +
      '- **内容对齐**：光标放在任意段落/标题/引用块上，点顶栏左/中/右对齐按钮，即可调整该块的文本对齐方式。\n' +
      '- **拖拽 .md 文件打开**：直接把 Markdown 文件从文件管理器拖入 Luma 窗口即可打开。\n' +
      '- **暗色主题**：点顶栏齿轮按钮或「切换主题」按钮在浅色/深色之间切换，代码高亮同步跟随。\n\n' +
      '> Luma Editor v1.0 · 离线本地存储 · 无需注册 · 隐私优先\n';
    if (typeof window.buildDoc === 'function') {
      window.buildDoc(guideMd, host);
      if (typeof window.bwToast === 'function') {
        window.bwToast(host, '已加载入门指南（未保存，浏览后可直接编辑或关闭）', { type: 'info', duration: 3000 });
      }
    }
  }

  /* ============================================================
   * 8. 最近文件
   * ============================================================ */
  function pushRecentFile(path) {
    if (!path) return;
    _recentFiles = _recentFiles.filter(function (p) { return p !== path; });
    _recentFiles.unshift(path);
    if (_recentFiles.length > 15) _recentFiles = _recentFiles.slice(0, 15);
    invoke('save_recent_files', { list: _recentFiles }).catch(function () {});
  }

  function loadFileTreeDir(dirPath) {
    _fileTreeDir = dirPath;
    var title = document.getElementById('bwFtTitle');
    if (title) title.textContent = dirPath.replace(/^.*[\\\/]/, '') || dirPath;
    invoke('list_dir', { path: dirPath, recursive: false }).then(function (result) {
      var entries = (result && result.entries) || [];
      renderFileTree(entries, '');
    }).catch(function (err) {
      console.error('[BW Desktop] 加载文件树失败:', err);
      renderEmptyFileTree();
    });
  }

  function tryAutoLoadDefaultDir() {
    if (_fileTreeDir) return;
    var dir = _defaultDocDir || null;
    if (!dir) { setTimeout(tryAutoLoadDefaultDir, 300); return; }
    invoke('list_dir', { path: dir, recursive: false }).then(function () {
      loadFileTreeDir(dir);
    }).catch(function () {
      invoke('mkdir', { path: dir }).then(function () {
        loadFileTreeDir(dir);
      }).catch(function () {
        renderEmptyFileTree();
      });
    });
  }

  function loadRecentAndOpen() {
    invoke('load_recent_files').then(function (list) {
      _recentFiles = (list && list.list) || [];
      if (!_fileTreeDir && _recentFiles.length) {
        var dir = _recentFiles[0].replace(/[\\\/][^\\\/]*$/, '');
        invoke('list_dir', { path: dir, recursive: false }).then(function () {
          loadFileTreeDir(dir);
        }).catch(function () {});
      } else if (!_fileTreeDir) {
        tryAutoLoadDefaultDir();
      }
    }).catch(function () { tryAutoLoadDefaultDir(); });
    // 默认目录
    invoke('get_user_docs_dir').then(function (dir) {
      _defaultDocDir = dir;
      if (!_fileTreeDir) tryAutoLoadDefaultDir();
    }).catch(function () {});
  }

  /* ============================================================
   * 9. 窗口状态记忆（位置/大小）
   * ============================================================ */
  function initWindowState() {
    var WebviewWindow = (TAURI && TAURI.webviewWindow) || null;
    if (!WebviewWindow) return;
    var cur = WebviewWindow.getCurrentWindow ? WebviewWindow.getCurrentWindow() : null;
    if (!cur) return;
    invoke('load_window_state').then(function (state) {
      if (state && state.width && state.height) {
        try { cur.setSize(new (TAURI && TAURI.logical) ? TAURI.logical(state.width, state.height) : state); }
        catch (e) {}
      }
      if (state && state.x !== undefined && state.y !== undefined) {
        try { cur.setPosition(state); } catch (e) {}
      }
    }).catch(function () {});
    var saveTimer = null;
    function saveState() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        cur.outerSize && cur.outerSize().then(function (sz) {
          cur.outerPosition && cur.outerPosition().then(function (pos) {
            invoke('save_window_state', { state: { width: sz.width, height: sz.height, x: pos.x, y: pos.y } }).catch(function () {});
          });
        });
      }, 500);
    }
    window.addEventListener('resize', saveState);
  }

  /* ============================================================
   * 10. 图片管理：saveImageBlob / fixAssetUrls / 压缩落盘
   * ============================================================ */
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var r = fr.result || '';
        var comma = r.indexOf(',');
        resolve(comma >= 0 ? r.slice(comma + 1) : r);
      };
      fr.onerror = function () { reject(fr.error || new Error('读取图片失败')); };
      fr.readAsDataURL(blob);
    });
  }

  function extOf(blob) {
    var t = (blob && blob.type) || '';
    if (t === 'image/jpeg') return 'jpg';
    if (t === 'image/webp') return 'webp';
    if (t === 'image/gif') return 'gif';
    return 'png';
  }

  function randName() {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return 'img-' + t + '-' + r;
  }

  function fallbackCompress(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w || 1, h || 1));
          var tw = Math.max(1, Math.round(w * scale));
          var th = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = tw; cv.height = th;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, tw, th);
          URL.revokeObjectURL(url);
          cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('canvas.toBlob 失败')); }, 'image/png');
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  }

  function canonicalToMarkdownJ(doc) {
    if (typeof window.canonicalToMarkdown === 'function') return window.canonicalToMarkdown(doc);
    if (!doc || !doc.content) return '';
    var lines = [];
    doc.content.forEach(function (node) {
      if (node.type === 'heading') {
        var prefix = '#'.repeat(node.attrs.level || 1) + ' ';
        lines.push(prefix + (node.content && node.content[0] ? node.content[0].text || '' : ''));
      } else if (node.type === 'paragraph') {
        var txt = '';
        (node.content || []).forEach(function (c) { txt += c.text || ''; });
        lines.push(txt);
      } else if (node.type === 'codeBlock') {
        lines.push('```' + (node.attrs.language || ''));
        (node.content || []).forEach(function (c) { lines.push(c.text || ''); });
        lines.push('```');
      } else if (node.type === 'blockMath') {
        var src = (node.content && node.content[0] ? node.content[0].source || '' : '');
        lines.push('$$' + src + '$$');
      } else if (node.type === 'horizontalRule') {
        lines.push('---');
      }
    });
    return lines.join('\n');
  }

  /* ============================================================
   * 公开 API
   * ============================================================ */
  window.BWDesktop = {
    isDesktop: true,
    _initDone: false,
    saveImageBlob: function (blob, docName, assetName) {
      return blobToBase64(blob).then(function (b64) {
        var ext = extOf(blob);
        var name = (assetName || randName()) + '.' + ext;
        return invoke('save_asset', { data: b64, ext: ext, name: name, doc_name: docName || _currentDocName || 'default' })
          .then(function (relUrl) { return relUrl; });
      });
    },
    fixAssetUrls: function (host) {
      var docEl = host.querySelector('.bw-doc');
      if (!docEl || !convertFileSrc) return;
      var imgs = docEl.querySelectorAll('img[data-asset-path]');
      imgs.forEach(function (img) {
        var p = img.getAttribute('data-asset-path');
        if (p) img.src = convertFileSrc(p);
      });
    },
    handleFileUpload: function (file, host) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        var reader = new FileReader();
        reader.onload = function () {
          var content = reader.result || '';
          if (typeof window.buildDoc === 'function') window.buildDoc(content, host);
          var titleInput = host.querySelector('.bw-title-input') || host.querySelector('#bwTitleInput');
          if (titleInput) titleInput.value = file.name.replace(/\.md$/i, '');
        };
        reader.readAsText(file);
        return;
      }
      var maxDim = 1600;
      fallbackCompress(file, maxDim, 0.85).then(function (blob) {
        return window.BWDesktop.saveImageBlob(blob, _currentDocName, randName());
      }).then(function (relUrl) {
        if (typeof window.insertImageMarkdown === 'function') {
          window.insertImageMarkdown(relUrl, (file.name || 'image').replace(/\.[^.]+$/, ''), host);
        }
        if (typeof window.BWDesktop.fixAssetUrls === 'function') {
          window.BWDesktop.fixAssetUrls(host);
        }
      }).catch(function (err) {
        console.error('[BW Desktop] 图片插入失败:', err);
        if (typeof window.bwToast === 'function') {
          window.bwToast(host, '图片插入失败，请重试', { type: 'error' });
        }
      });
    },
    openFile: openFileFromTree,
    saveFile: doSaveNow,
    saveAs: saveAsNew,
    switchSidebarTab: switchSidebarTab,
    scheduleSave: scheduleSave,
  };

  /* ============================================================
   * 初始化
   * ============================================================ */
  function _desktopInit() {
    // 桌面版：禁用自动保存（仅 Ctrl+S 才写入）
    if (typeof window.scheduleAutosave === 'function') {
      window.scheduleAutosave = function () {};
    }
    // 让状态栏显示"手动保存"提示
    setTimeout(function () {
      var label = document.getElementById('bwAutoSaveLabel');
      if (label) label.textContent = '手动保存（Ctrl+S）';
      var st = getActiveState();
      if (st) st.autosaveUrl = null; // 禁用 doSave 的本地 fetch
    }, 100);

    initFileTree();
    injectTopBarButtons();
    initDragDrop();
    initKeyboardShortcuts();
    initWindowState();
    console.log('[BW Desktop] 桌面桥接已激活 — 侧栏文件 Tab + 仅手动保存 + 白板独立窗口');
    window.BWDesktop._initDone = true;
    // 延迟显示肉眼可见的确认：如果 bwToast 已就绪
    setTimeout(function () {
      var host = document.querySelector('[data-bw-doc-editor]');
      if (host && typeof window.bwToast === 'function') {
        window.bwToast(host, 'Luma 桌面模式 — 侧栏「文件」Tab 可用', { type: 'info', duration: 2000 });
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _desktopInit);
  } else {
    setTimeout(_desktopInit, 50);
  }

  // 白板独立窗口：打开主页面时 ?auto=whiteboard → 自动展开白板抽屉
  if (/auto=whiteboard/.test(window.location.search)) {
    document.title = 'Luma 白板';
    setTimeout(function () {
      var wbBtn = document.querySelector('.bw-wb-tool-btn');
      if (wbBtn) wbBtn.click();
    }, 800);
  }

})();