/**
 * Luma — 挂载编辑器与自动初始化（必须最后加载）
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * MOUNT EDITOR
   * ============================================================ */
  function mountEditor(host) {
    // IMPORTANT: read canonical data BEFORE buildUI overwrites innerHTML
    var jsonEl = $('[data-editor-document]', host) || host.querySelector('[data-editor-document]') || host.querySelector('[data-bw-document]');
    var docNode = null;
    if (jsonEl) {
      try { docNode = JSON.parse(jsonEl.textContent || jsonEl.value || '{}'); } catch (e) { console.warn('[BW Editor] Parse error:', e); }
    }

    buildUI(host);
    loadSavedTheme(host);
    loadFocusMode(host);

    var md = docNode ? canonicalToMarkdown(docNode) : '';
    var docEl = $('#bwDoc', host);
    var st = stateMap.get(host);

    // Multi-document support: load from localStorage; seed from inline doc on first run
    var docs = docStoreLoad();
    if (docs.length) {
      var activeId = docStoreActiveId();
      var cur = null;
      for (var di = 0; di < docs.length; di++) { if (docs[di].id === activeId) { cur = docs[di]; break; } }
      if (!cur) cur = docs[0];
      st.docId = cur.id;
      loadDocIntoEditor(host, cur.title, cur.md);
    } else {
      var seedTitle = host.getAttribute('data-document-title') || '未命名文档';
      var bodyMd = md;
      var firstLine = (md.split('\n')[0] || '');
      if (firstLine.replace(/^#\s+/, '') === seedTitle) {
        bodyMd = md.split('\n').slice(1).join('\n').replace(/^\n+/, '');
      }
      var seedId = genDocId();
      docStoreSave([{ id: seedId, title: seedTitle, md: bodyMd }]);
      docStoreSetActive(seedId);
      st.docId = seedId;
      loadDocIntoEditor(host, seedTitle, bodyMd);
    }

    // Render the document list in the top-bar dropdown
    renderDocMenu(host);

    // Seed undo history with the initial document state
    initHistory(host, st);

    // Local offline autosave (independent of server autosave)
    if (typeof bwSetupBeforeUnload === 'function') bwSetupBeforeUnload();
    if (typeof bwBindTitleAutosave === 'function') bwBindTitleAutosave();
    if (typeof bwFilesRestoreHandle === 'function') bwFilesRestoreHandle(host);
    // 首次使用提示：建议选择一个常用文件夹
    if (typeof bwPromptFolderPicker === 'function') {
      setTimeout(function () { bwPromptFolderPicker(host); }, 800);
    }
  }


  /* ============================================================
   * INIT
   * ============================================================ */

  /* ============================================================
   * ADMIN SIDEBAR TOGGLE (editor page only)
   * ============================================================ */
  function injectSidebarToggle() {
    var sidebar = document.querySelector('[data-admin-sidebar]');
    if (!sidebar) return;

    // Don't duplicate
    if (document.querySelector('.bw-sidebar-toggle')) return;

    var btn = document.createElement('button');
    btn.className = 'bw-sidebar-toggle';
    btn.title = '打开导航栏';
    btn.innerHTML = '<svg viewBox="0 0 12 12"><path d="M3 1h2v10H3V1zm4 0h2v10H7V1z"/></svg>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      var open = sidebar.classList.toggle('bw-sidebar-open');
      btn.classList.toggle('active', open);
      btn.title = open ? '关闭导航栏' : '打开导航栏';
    });
  }


  /* ============================================================
   * INIT
   * ============================================================ */
  function init() {
    var hosts = $$('[data-bw-doc-editor]');
    hosts.forEach(function (host) {
      host.classList.add(NS);
      mountEditor(host);
    });

    // Inject admin sidebar toggle on editor page
    if (hosts.length) { injectSidebarToggle(); }

    if (!hosts.length) {
      // Dev mode: auto-mount on any element with debug attr
      var debugHost = $('[data-bw-debug-editor]');
      if (debugHost) { debugHost.classList.add(NS); mountEditor(debugHost); }
    }
  }

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

