/**
 * Luma — UI 构建、事件绑定、光标位置与表格插入
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * BUILD UI
   * ============================================================ */
  /* ============================================================
   * TOAST NOTIFICATIONS
   * Lightweight inline toasts used to replace native alert() and to give
   * feedback for actions that would otherwise fail silently (publish with no
   * endpoint, image upload error, save with no autosave url, etc.).
   * Global function so other modules (save / insert / docs / export) can use it.
   * ============================================================ */
  function bwToast(host, msg, opts) {
    if (!host) host = document.querySelector('.' + NS) || document.body;
    opts = opts || {};
    var type = opts.type || 'info';
    var duration = (typeof opts.duration === 'number') ? opts.duration : 2600;

    var layer = $('.bw-toast-layer', host);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'bw-toast-layer';
      layer.setAttribute('aria-live', 'polite');
      host.appendChild(layer);
    }
    // De-dupe: don't stack identical messages (e.g. repeated Ctrl+S).
    var existing = $$('.bw-toast', layer);
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].textContent === msg) return existing[i];
    }

    var t = document.createElement('div');
    t.className = 'bw-toast bw-toast-' + type;
    t.setAttribute('role', 'status');
    t.textContent = msg;
    layer.appendChild(t);

    requestAnimationFrame(function () { t.classList.add('show'); });

    var remove = function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    };
    t.addEventListener('click', remove);
    setTimeout(remove, duration);
    return t;
  }

  function buildUI(host) {
    var st = initState(host);
    var docTitle = host.getAttribute('data-document-title') || '未命名文档';

    host.innerHTML =
      '<div class="bw-top-bar">' +
        '<div class="bw-doc-info">' +
          '<span class="bw-doc-title-text" id="bwDocInfoTitle">' + escapeHtml(docTitle) + '</span>' +
          '<span class="bw-doc-status">草稿</span>' +
        '</div>' +
        '<div class="bw-top-actions">' +
          '<span class="bw-word-count" id="bwWordCount">0 字</span>' +
          '<div class="bw-doc-wrap">' +
          '</div>' +
          '<div class="bw-export-wrap">' +
            '<button class="bw-tool-btn bw-export-btn" id="bwExportBtn" title="导出" aria-label="导出"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span class="bw-tooltip">导出</span></button>' +
            '<div class="bw-export-menu" id="bwExportMenu" style="display:none;">' +
              '<button data-export="pdf">PDF（打印）</button>' +
              '<button data-export="png">长图 PNG</button>' +
              '<button data-export="html">HTML 网页</button>' +
              '<button data-export="txt">Markdown</button>' +
            '</div>' +
          '</div>' +
          '<button class="bw-publish-btn" id="bwPublishBtn">发布</button>' +
        '</div>' +
      '</div>' +

      '<div class="bw-toolbar">' +
        '<button class="bw-tool-btn" data-action="bold" title="粗体 (Ctrl+B)" aria-label="粗体"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg><span class="bw-tooltip">粗体</span></button>' +
        '<button class="bw-tool-btn" data-action="italic" title="斜体 (Ctrl+I)" aria-label="斜体"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg><span class="bw-tooltip">斜体</span></button>' +
        '<button class="bw-tool-btn" data-action="strike" title="删除线" aria-label="删除线"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 12H6.5"/><path d="M16 6.5A3.5 3.5 0 0 0 12.5 3h-2A3.5 3.5 0 0 0 7 6.5 3.5 3.5 0 0 0 10.5 10h3a3.5 3.5 0 0 1 3.5 3.5A3.5 3.5 0 0 1 13.5 17h-3A3.5 3.5 0 0 1 7 13.5"/></svg><span class="bw-tooltip">删除线</span></button>' +
        '<div class="bw-toolbar-sep"></div>' +
        '<button class="bw-tool-btn" data-action="heading" title="标题 (Ctrl+H)" aria-label="标题"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="3" y1="20" x2="21" y2="20"/></svg><span class="bw-tooltip">标题</span></button>' +
        '<button class="bw-tool-btn" data-action="ulist" title="无序列表" aria-label="无序列表"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.3"/><circle cx="4" cy="12" r="1.3"/><circle cx="4" cy="18" r="1.3"/></svg><span class="bw-tooltip">列表</span></button>' +
        '<button class="bw-tool-btn" data-action="olist" title="有序列表" aria-label="有序列表"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><rect x="3.5" y="5" width="3" height="3" rx="0.6"/><rect x="3.5" y="11" width="3" height="3" rx="0.6"/><rect x="3.5" y="17" width="3" height="3" rx="0.6"/></svg><span class="bw-tooltip">有序</span></button>' +
        '<button class="bw-tool-btn" data-action="quote" title="引用" aria-label="引用"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v3a1 1 0 0 1-1 1"/><path d="M16 7h-3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2v3a1 1 0 0 1-1 1"/></svg><span class="bw-tooltip">引用</span></button>' +
        '<button class="bw-tool-btn" data-action="code" title="行内代码" aria-label="行内代码"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 7 3 12 8 17"/><polyline points="16 7 21 12 16 17"/></svg><span class="bw-tooltip">代码</span></button>' +
        '<button class="bw-tool-btn" data-action="link" title="链接" aria-label="链接"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span class="bw-tooltip">链接</span></button>' +
        '<button class="bw-tool-btn" data-action="image" title="图片" aria-label="图片"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span class="bw-tooltip">图片</span></button>' +
        '<button class="bw-tool-btn" data-action="emoji" title="表情符号" aria-label="表情符号"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg><span class="bw-tooltip">表情</span></button>' +
        '<div class="bw-toolbar-sep"></div>' +
        '<div class="bw-align-group" role="group" aria-label="图片对齐">' +
          '<button class="bw-tool-btn bw-align-btn" data-align="left" title="图片左对齐" aria-label="图片左对齐"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg><span class="bw-tooltip">左对齐</span></button>' +
          '<button class="bw-tool-btn bw-align-btn active" data-align="center" title="图片居中" aria-label="图片居中"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M5 18h14"/></svg><span class="bw-tooltip">居中</span></button>' +
          '<button class="bw-tool-btn bw-align-btn" data-align="right" title="图片右对齐" aria-label="图片右对齐"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M10 12h10M7 18h13"/></svg><span class="bw-tooltip">右对齐</span></button>' +
        '</div>' +
        '<button class="bw-tool-btn" data-action="math" title="数学公式" aria-label="数学公式"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="19 5 9 5 6 12 9 19 19 19"/><line x1="5" y1="5" x2="5" y2="19"/></svg><span class="bw-tooltip">LaTeX</span></button>' +
        '<div class="bw-toolbar-sep"></div>' +
        '<button class="bw-tool-btn" data-action="table" title="表格" aria-label="表格"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></svg><span class="bw-tooltip">表格</span></button>' +
        '<div class="bw-toolbar-sep"></div>' +
        '<button class="bw-tool-btn" data-action="theme" title="切换主题" aria-label="切换主题"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg><span class="bw-tooltip">主题</span></button>' +
        '<button class="bw-tool-btn bw-focus-toggle" data-action="focus" title="专注模式 (Ctrl+Shift+F)" aria-label="专注模式"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/></svg><span class="bw-tooltip">专注模式</span></button>' +
        '<div class="bw-toolbar-sep"></div>' +
        '<button class="bw-tool-btn bw-source-toggle" data-action="source" title="源代码模式（编辑 / 复制 Markdown）" aria-label="源代码模式">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' +
          '<span class="bw-tooltip">源码</span>' +
        '</button>' +
      '</div>' +

      '<div class="bw-editor-body">' +
        '<div class="bw-toc-sidebar" id="bwTocSidebar">' +
          '<div class="bw-sb-tabs">' +
            '<button class="bw-sb-tab active" data-sb-tab="toc">目录</button>' +
            '<button class="bw-sb-tab" data-sb-tab="files">文档</button>' +
          '</div>' +
          '<div class="bw-sb-panel bw-sb-toc" id="bwTocPanel">' +
            '<div class="bw-toc-list" id="bwTocList"></div>' +
          '</div>' +
          '<div class="bw-sb-panel bw-sb-files" id="bwFilesPanel" style="display:none">' +
            '<div class="bw-files-toolbar">' +
              '<button class="bw-files-action" id="bwFilesNew">+ 新建</button>' +
              '<button class="bw-files-action" id="bwFilesOpenFolder">📂 打开文件夹</button>' +
            '</div>' +
            '<div class="bw-files-list" id="bwFilesList"></div>' +
          '</div>' +
          '<button class="bw-toc-collapse-btn" id="bwTocCollapse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
        '</div>' +
        '<div class="bw-toc-reveal"><button class="bw-toc-reveal-btn" id="bwTocReveal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button></div>' +
        '<div class="bw-content-area" id="bwContentArea">' +
          '<div class="bw-content-pad bw-content-pad-left"></div>' +
          '<div class="bw-content-inner" id="bwContentInner">' +
            '<div class="bw-title-block">' +
              '<input type="text" class="bw-title-input" id="bwTitleInput" value="' + escapeHtml(docTitle) + '" placeholder="输入文档标题...">' +
            '</div>' +
            '<div class="bw-doc" id="bwDoc" contenteditable="false"></div>' +
          '</div>' +
          '<div class="bw-content-pad bw-content-pad-right" id="bwContentRight"></div>' +
        '</div>' +
      '</div>' +

      '<div class="bw-focus-exit"><div class="bw-focus-exit-bar"><span>ESC 或点击此处退出专注模式</span><button class="bw-focus-exit-btn" id="bwFocusExitBtn">退出</button></div></div>' +

      '<div class="bw-status-bar">' +
        '<div class="bw-status-left">' +
          '<span id="bwCursorPos">第 1 行，第 1 列</span>' +
          '<span class="bw-autosave-dot"><span id="bwAutoSaveLabel">自动保存已开启</span></span>' +
          '<span class="bw-save-indicator saved" id="bwSaveIndicator">已保存</span>' +
        '</div>' +
        '<div class="bw-status-right">' +
          '<span class="bw-status-wordcount" id="bwStatusWordCount">0 字</span>' +
          '<span>Markdown · UTF-8</span>' +
        '</div>' +
      '</div>' +

      '<input type="file" id="bwFileInput" accept="image/*" multiple style="display:none">';

    // Store references
    st.tocRoot = $('#bwTocSidebar', host);
    st.title = docTitle;

    // Wire up events
    wireEvents(host, st);
  }

  function wireEvents(host, st) {
    // Publish button
    var pubBtn = $('#bwPublishBtn', host);
    if (pubBtn) pubBtn.addEventListener('click', function () { doPublish(host); });

    // Document management & export dropdowns
    wireExportMenu(host, st);
    if (!host._bwMenuClickBound) {
      host._bwMenuClickBound = true;
      document.addEventListener('click', function () { closeMenus(host, null); });
    }

    // Title input
    var titleInput = $('#bwTitleInput', host);
    if (titleInput) {
      titleInput.addEventListener('input', function () {
        st.title = this.value.trim();
        var infoTitle = $('#bwDocInfoTitle', host);
        if (infoTitle) infoTitle.textContent = this.value || '未命名文档';
        markDirty(this);
        // 自动保存 + 刷新目录
        if (typeof scheduleDocAutosave === 'function') scheduleDocAutosave(host);
        var docEl = $('.bw-doc', host);
        if (docEl && typeof updateTOC === 'function') updateTOC(docEl, st);
      });
      // Commit a single undo step when the title edit session ends.
      titleInput.addEventListener('change', function () {
        pushUndo(host, st);
      });
    }

    // Toolbar buttons
    $$('.bw-tool-btn', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        switch (action) {
          case 'bold': surroundSelection('**', '**'); break;
          case 'italic': surroundSelection('*', '*'); break;
          case 'strike': surroundSelection('~~', '~~'); break;
          case 'heading': cycleHeading(); break;
          case 'ulist': insertList(false); break;
          case 'olist': insertList(true); break;
          case 'quote': insertQuote(); break;
          case 'code': insertCode(); break;
          case 'link': surroundSelection('[', '](url)'); break;
          case 'image': insertImage($('#bwFileInput', host)); break;
          case 'math': insertMathFormula(); break;
          case 'table': insertTable(); break;
          case 'emoji':
            window._bwEmojiHost = host;
            if (typeof bwEmojiToggle === 'function') bwEmojiToggle();
            break;
          case 'theme': toggleTheme(host); break;
          case 'focus': toggleFocusMode(host); break;
          case 'source': toggleSourceMode(host); break;
        }
        // 工具栏操作完成后恢复编辑器焦点
        refocusEditor(host);
      });
    });

    // 图片对齐按钮（左 / 中 / 右）：作用于当前光标所在图片块，或最近插入的图片
    $$('.bw-align-btn', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyImageAlign(host, btn.getAttribute('data-align') || 'center');
      });
    });

    // File upload
    var fileInput = $('#bwFileInput', host);
    if (fileInput) {
      fileInput.addEventListener('change', function () { handleFileUpload(host, this.files); this.value = ''; });
    }

    // Drag & drop images anywhere into the editor → 统一走 handleFileUpload。
    // 仅在拖拽内容含文件时拦截，避免影响编辑器内文本拖拽选择。
    host.addEventListener('dragover', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      var types = e.dataTransfer.types;
      var hasFiles = false;
      try {
        if (typeof types.indexOf === 'function') hasFiles = types.indexOf('Files') !== -1;
        else if (typeof types.contains === 'function') hasFiles = types.contains('Files'); // 旧版 DOMStringList
      } catch (err) { hasFiles = false; }
      if (!hasFiles) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      host.classList.add('bw-drag-over');
    });
    host.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget || !host.contains(e.relatedTarget)) host.classList.remove('bw-drag-over');
    });
    host.addEventListener('drop', function (e) {
      host.classList.remove('bw-drag-over');
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault();
      handleFileUpload(host, e.dataTransfer.files);
    });

    // TOC collapse
    var tocCollapseBtn = $('#bwTocCollapse', host);
    var tocSidebar = $('#bwTocSidebar', host);
    if (tocCollapseBtn && tocSidebar) {
      tocCollapseBtn.addEventListener('click', function () {
        st.tocCollapsed = true;
        tocSidebar.classList.add('collapsed');
        tocCollapseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      });
    }

    // TOC reveal
    var tocRevealBtn = $('#bwTocReveal', host);
    if (tocRevealBtn && tocSidebar) {
      tocRevealBtn.addEventListener('click', function () {
        st.tocCollapsed = false;
        tocSidebar.classList.remove('collapsed');
        if (tocCollapseBtn) tocCollapseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      });
    }

    // Sidebar tab switching
    var sbTabs = $$('.bw-sb-tab', host);
    var tocPanel = $('#bwTocPanel', host);
    var filesPanel = $('#bwFilesPanel', host);
    sbTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        sbTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var which = tab.getAttribute('data-sb-tab');
        if (tocPanel) tocPanel.style.display = which === 'toc' ? '' : 'none';
        if (filesPanel) filesPanel.style.display = which === 'files' ? '' : 'none';
        if (which === 'files' && typeof bwFilesRender === 'function') bwFilesRender(host);
      });
    });

    // Focus exit
    var focusExitBtn = $('#bwFocusExitBtn', host);
    if (focusExitBtn) focusExitBtn.addEventListener('click', function () { toggleFocusMode(host); });

    // Keyboard shortcuts
    host.addEventListener('keydown', function (e) {
      // Focus mode: Ctrl/Cmd+Shift+F is the primary (non-reserved) shortcut;
      // F11 is kept as a best-effort attempt (browsers may still grab it for
      // fullscreen). Tooltip was updated to reflect the new binding.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault(); toggleFocusMode(host); return;
      }
      if (e.key === 'F11') { e.preventDefault(); toggleFocusMode(host); return; }
      // Save: only intercept when there is a real autosave endpoint. Without
      // one we must NOT silently swallow Ctrl/Cmd+S — give a hint instead so
      // the user knows nothing was saved.
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        var stS = stateMap.get(host);
        if (stS && stS.autosaveUrl) { e.preventDefault(); doSave(host); }
        else { e.preventDefault(); bwToast(host, '当前为本地预览，未配置自动保存', { type: 'info' }); }
        return;
      }
      // Undo / Redo: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y.
      // Let native undo work inside the math source textarea.
      if ((e.ctrlKey || e.metaKey) && !e.altKey &&
          (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        if (e.target && e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (e.key === 'y' || e.key === 'Y') redo(host);
        else if (e.shiftKey) redo(host);
        else undo(host);
      }
    });

    // Cursor position tracking
    var docEl = $('#bwDoc', host);
    if (docEl) {
      docEl.addEventListener('keyup', function () { updateCursorPos(); bwSyncImageAlign(host); });
      docEl.addEventListener('click', function () { updateCursorPos(); bwSyncImageAlign(host); });
    }

    // 点击编辑区左右的空白（不含任何 .bw-block）→ 进入完全预览模式：
    // 退出所有正在编辑的块（全部回到渲染态），不再把光标强行塞回某块；
    // 之后再点击某个具体块即可在该处进入编辑。
    var contentArea = $('.bw-content-area', host) || docEl;
    if (contentArea && docEl) {
      contentArea.addEventListener('click', function (e) {
        if (e.target.closest('.bw-block')) return; // 点到块 → 由块自身 focus 进入编辑
        if (e.target.closest('.bw-ai-panel') || e.target.closest('.bw-wb-drawer')) return; // 面板内点击不退出编辑
        // 退出所有正在编辑的块 → 完全预览
        $$('.bw-block.editing', docEl).forEach(function (b) { leaveEdit(b); });
        // 始终保持一个末尾空白块，方便点进去新增内容
        ensureTrailingEmptyBlock(docEl);
      });
    }
  }

  function updateCursorPos() {
    var el = $('#bwCursorPos');
    if (!el) return;
    var sel = window.getSelection();
    if (!sel.rangeCount) { el.textContent = '第 1 行，第 1 列'; return; }
    var rng = sel.getRangeAt(0);
    var node = rng.startContainer;
    // Locate the nearest editor block (contenteditable) that holds the caret.
    var ref = (node.nodeType === 3 ? node.parentElement : node);
    if (!ref) { el.textContent = '第 1 行，第 1 列'; return; }
    var block = ref.closest('.bw-block.editing') || ref.closest('.bw-block');
    if (!block) { el.textContent = '第 1 行，第 1 列'; return; }

    // Measure the text from the start of the block up to the caret: the number
    // of newlines gives the row, and the trailing line length gives the column.
    var before = '';
    try {
      var pre = rng.cloneRange();
      pre.selectNodeContents(block);
      pre.setEnd(rng.startContainer, rng.startOffset);
      before = pre.toString();
    } catch (e) {
      before = (block.textContent || '').slice(0, rng.startOffset || 0);
    }
    var lines = before.split('\n');
    var row = lines.length;
    var col = lines[lines.length - 1].length + 1;
    el.textContent = '第 ' + row + ' 行，第 ' + col + ' 列';
  }

  /* ============================================================
   * IMAGE ALIGNMENT via top toolbar
   * 作用于当前光标所在的「块级图片」，否则作用于最近插入的图片块。
   * 实际对齐写入由 bw-insert.js 的 bwSetImageAlign 统一处理（含 md 片段 + CSS 类）。
   * ============================================================ */
  function applyImageAlign(host, align) {
    var docEl = $('.bw-doc', host);
    if (!docEl) return;
    var target = null;
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var n = sel.getRangeAt(0).startContainer;
      var b = (n.nodeType === 3 ? n.parentElement : n);
      if (b) {
        var ib = b.closest ? b.closest('.bw-block') : null;
        if (ib) target = ib;
      }
    }
    if (!target) {
      bwToast(host, '请先选中要对齐的内容块', { type: 'info' });
      return;
    }
    if (typeof bwSetImageAlign === 'function') bwSetImageAlign(target, align);
    var st = stateMap.get(host);
    if (st && typeof pushUndo === 'function') pushUndo(host, st);
    bwSyncImageAlign(host);
  }

  // 根据当前焦点块，高亮顶栏对应的对齐按钮
  function bwSyncImageAlign(host) {
    if (!host) return;
    var cur = 'center';
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var n = sel.getRangeAt(0).startContainer;
      var b = (n.nodeType === 3 ? n.parentElement : n);
      if (b) { var ib = b.closest ? b.closest('.bw-block') : null; if (ib) cur = ib.dataset.align || 'center'; }
    }
    ['left', 'center', 'right'].forEach(function (a) {
      var btn = host.querySelector('.bw-align-btn[data-align="' + a + '"]');
      if (btn) btn.classList.toggle('active', a === cur);
    });
  }

  function insertTable() {
    var tableMd = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 单元格 | 单元格 | 单元格 |\n| 单元格 | 单元格 | 单元格 |';
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var rng = sel.getRangeAt(0);
    var block = rng.startContainer.nodeType === 3 ? rng.startContainer.parentElement : rng.startContainer;
    var bwBlock = block ? block.closest('.bw-block') : null;
    if (bwBlock) {
      bwBlock.dataset.md = tableMd;
      bwBlock.textContent = tableMd;
      leaveEdit(bwBlock);
      markDirty(bwBlock);
    }
  }


  /* ============================================================
   * SOURCE CODE MODE（源代码模式：查看 / 编辑 / 复制 Markdown）
   * 进入时把当前文档序列化为 Markdown 填入只读可编辑 textarea；
   * 退出时若内容有改动，则重建文档（复用 loadDocIntoEditor 逻辑）。
   * ============================================================ */
  function toggleSourceMode(host) {
    var st = stateMap.get(host);
    if (!st) return;
    if (st.sourceMode) exitSourceMode(host);
    else enterSourceMode(host);
  }

  function enterSourceMode(host) {
    var st = stateMap.get(host);
    if (!st || st.sourceMode) return;
    var body = $('.bw-editor-body', host);
    if (!body) return;

    // 先把正在编辑的块同步进 dataset.md，保证序列化结果就是屏幕上的内容
    if (typeof syncEditingBlocks === 'function') syncEditingBlocks(host);

    var md = (typeof getMarkdown === 'function') ? getMarkdown(host) : '';
    st.sourceOriginal = md;

    if (!st.sourcePanel) {
      var panel = document.createElement('div');
      panel.className = 'bw-source-panel';
      panel.innerHTML =
        '<div class="bw-source-bar">' +
          '<span class="bw-source-title">源代码模式</span>' +
          '<span class="bw-source-hint">可直接编辑 Markdown，完成后点“返回编辑器”重新渲染</span>' +
          '<span class="bw-source-actions">' +
            '<button class="bw-source-copy" type="button">复制 Markdown</button>' +
            '<button class="bw-source-done" type="button">返回编辑器</button>' +
          '</span>' +
        '</div>' +
        '<textarea class="bw-source-textarea" spellcheck="false" wrap="off"></textarea>';
      body.appendChild(panel);
      st.sourcePanel = panel;
      st.sourceTextarea = $('.bw-source-textarea', panel);
      st.sourceCopyBtn = $('.bw-source-copy', panel);
      st.sourceDoneBtn = $('.bw-source-done', panel);

      st.sourceCopyBtn.addEventListener('click', function () {
        var txt = st.sourceTextarea.value;
        copyTextToClipboard(txt, function (ok) {
          var old = st.sourceCopyBtn.textContent;
          st.sourceCopyBtn.textContent = ok ? '已复制' : '复制失败';
          setTimeout(function () { st.sourceCopyBtn.textContent = old; }, 1500);
        });
      });
      st.sourceDoneBtn.addEventListener('click', function () { exitSourceMode(host); });
      st.sourceTextarea.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); exitSourceMode(host); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); exitSourceMode(host); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          var ta = st.sourceTextarea;
          var s = ta.selectionStart, en = ta.selectionEnd;
          var val = ta.value;
          ta.value = val.slice(0, s) + '  ' + val.slice(en);
          ta.selectionStart = ta.selectionEnd = s + 2;
        }
      });
    }

    st.sourceTextarea.value = md;
    st.sourcePanel.style.display = 'flex';

    // 隐藏渲染区与目录，腾出整块区域显示源码
    var contentArea = $('.bw-content-area', host);
    var tocSidebar = $('#bwTocSidebar', host);
    if (contentArea) contentArea._bwHidden = contentArea.style.display, contentArea.style.display = 'none';
    if (tocSidebar) tocSidebar._bwHidden = tocSidebar.style.display, tocSidebar.style.display = 'none';

    var btn = $('.bw-source-toggle', host);
    if (btn) btn.classList.add('active');

    st.sourceMode = true;
    setTimeout(function () { st.sourceTextarea.focus(); st.sourceTextarea.setSelectionRange(0, 0); }, 30);
  }

  function exitSourceMode(host) {
    var st = stateMap.get(host);
    if (!st || !st.sourceMode) return;

    var md = st.sourceTextarea ? st.sourceTextarea.value : '';

    var contentArea = $('.bw-content-area', host);
    var tocSidebar = $('#bwTocSidebar', host);
    if (contentArea) contentArea.style.display = contentArea._bwHidden || '';
    if (tocSidebar) {
      tocSidebar.style.display = tocSidebar._bwHidden || '';
      if (st.tocCollapsed) tocSidebar.classList.add('collapsed');
    }
    if (st.sourcePanel) st.sourcePanel.style.display = 'none';

    var btn = $('.bw-source-toggle', host);
    if (btn) btn.classList.remove('active');

    st.sourceMode = false;

    // 仅在内容有改动时重建文档，避免无谓的重排
    if (md !== st.sourceOriginal) {
      var parts = splitTitleBody(md);
      if (typeof loadDocIntoEditor === 'function') loadDocIntoEditor(host, parts.title, parts.body);
      if (typeof pushUndo === 'function') pushUndo(host, st);
      if (typeof saveCurrentDoc === 'function') saveCurrentDoc(host);
      st.dirty = true;
      if (typeof updateWordCount === 'function') updateWordCount(host);
    }
  }

  function splitTitleBody(md) {
    var lines = (md || '').split('\n');
    if (lines[0] && /^#\s+/.test(lines[0])) {
      var title = lines[0].replace(/^#\s+/, '').trim();
      var body = lines.slice(1).join('\n').replace(/^\n+/, '');
      return { title: title, body: body };
    }
    return { title: '', body: md || '' };
  }

  function copyTextToClipboard(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { fallbackCopy(text, cb); });
    } else {
      fallbackCopy(text, cb);
    }
  }

  function fallbackCopy(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      cb(ok);
    } catch (e) { cb(false); }
  }

