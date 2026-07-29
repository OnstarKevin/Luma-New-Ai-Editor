/**
 * Luma — 多文档存储、快照、撤销/重做历史与文档菜单
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * MULTI-DOCUMENT STORE (localStorage)
   * ============================================================ */
  var DOCS_KEY = 'bw-docs-v1';
  var ACTIVE_KEY = 'bw-active-doc-v1';

  function docStoreLoad() {
    try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]') || []; }
    catch (e) { return []; }
  }
  function docStoreSave(docs) {
    try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); } catch (e) {}
  }
  function docStoreActiveId() {
    return localStorage.getItem(ACTIVE_KEY) || '';
  }
  function docStoreSetActive(id) {
    try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
  }
  function genDocId() {
    return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /** Full markdown including the title as H1 — used for text export */
  function getMarkdown(host) {
    try { return canonicalToMarkdown(getCanonicalJson(host)); }
    catch (e) { return ''; }
  }

  /** Body markdown only (title excluded) — used to store/switch documents */
  function getBodyMarkdown(host) {
    var full = canonicalToMarkdown(getCanonicalJson(host));
    var titleEl = $('#bwTitleInput', host);
    var title = titleEl ? (titleEl.value || '').trim() : '';
    var lines = full.split('\n');
    if (title && lines[0] && lines[0].replace(/^#\s+/, '').trim() === title) {
      lines = lines.slice(1);
      while (lines[0] === '') lines.shift();
    }
    return lines.join('\n');
  }

  /** Load a document (title + body markdown) into the editor UI */
  function loadDocIntoEditor(host, title, bodyMd) {
    var st = stateMap.get(host);
    var titleEl = $('#bwTitleInput', host);
    if (titleEl) titleEl.value = title || '';
    if (st) {
      st.title = title || '';
      var infoTitle = $('#bwDocInfoTitle', host);
      if (infoTitle) infoTitle.textContent = title || '未命名文档';
    }
    var docEl = $('#bwDoc', host);
    if (docEl) buildDoc(bodyMd || '', docEl, st);
    updateWordCount(host);
    waitKatex(function () {
      $$('.bw-math-card', host).forEach(function (card) {
        var outEl = $('.bw-math-out', card);
        var statusEl = $('.bw-math-status', card);
        setMathState(card, card.dataset.tex || '', outEl, statusEl);
      });
    });
  }


  /* ============================================================
   * UNDO / REDO (local, up to MAX_UNDO steps)
   * A snapshot = { title, md } of the whole document. Restoring
   * rebuilds the doc via buildDoc (math re-rendered), so the
   * wiring/event-listeners stay intact and blocks stay connected.
   * ============================================================ */

  // Sync in-progress edits (blocks currently in .editing) into dataset.md
  // so the captured markdown reflects what's on screen.
  function syncEditingBlocks(host) {
    $$('.bw-block.editing', host).forEach(function (b) {
      b.dataset.md = b.textContent || '';
    });
  }

  function captureSnapshot(host) {
    syncEditingBlocks(host);
    var titleEl = $('#bwTitleInput', host);
    var title = titleEl ? (titleEl.value || '').trim() : '';
    var md = getBodyMarkdown(host);
    return { title: title, md: md };
  }

  function sameSnapshot(a, b) {
    return a && b && a.title === b.title && a.md === b.md;
  }

  // Push the current state onto the undo stack (truncating any redo tail).
  function pushUndo(host, st) {
    if (!st) return;
    var snap = captureSnapshot(host);
    // Coalesce: don't push if identical to the current top of stack.
    if (st.pointer >= 0 && st.pointer === st.history.length - 1 &&
        sameSnapshot(st.history[st.pointer], snap)) {
      return;
    }
    st.history = st.history.slice(0, st.pointer + 1);
    st.history.push(snap);
    if (st.history.length > st.MAX_UNDO) {
      st.history.shift();
    }
    st.pointer = st.history.length - 1;
  }

  // Seed the history with the document's initial state (called on mount / switch).
  function initHistory(host, st) {
    if (!st) return;
    syncEditingBlocks(host);
    var titleEl = $('#bwTitleInput', host);
    var title = titleEl ? (titleEl.value || '').trim() : '';
    st.history = [{ title: title, md: getBodyMarkdown(host) }];
    st.pointer = 0;
  }

  // Restore a snapshot into the editor UI (reuses loadDocIntoEditor machinery).
  function restoreSnapshot(host, snap) {
    loadDocIntoEditor(host, snap.title, snap.md);
    focusEndOfDoc(host);
  }

  // Put the caret at the end of the last real block so the user can keep typing.
  function focusEndOfDoc(host) {
    var docEl = $('#bwDoc', host);
    if (!docEl) return;
    var blocks = Array.from(docEl.querySelectorAll('.bw-block'));
    if (!blocks.length) return;
    var target = blocks[blocks.length - 1];
    // If the last block is the trailing empty placeholder, land on it anyway.
    if (target.classList.contains('bw-math-card')) return; // math has no caret
    target.focus();
    var sel = window.getSelection();
    var rng = document.createRange();
    rng.selectNodeContents(target);
    rng.collapse(false);
    sel.removeAllRanges();
    sel.addRange(rng);
  }

  function undo(host) {
    var st = stateMap.get(host);
    if (!st || st.pointer <= 0) return;
    st.pointer--;
    restoreSnapshot(host, st.history[st.pointer]);
  }

  function redo(host) {
    var st = stateMap.get(host);
    if (!st || st.pointer >= st.history.length - 1) return;
    st.pointer++;
    restoreSnapshot(host, st.history[st.pointer]);
  }


  /** Save the current document into the store (does not switch) */
  function saveCurrentDoc(host) {
    var st = stateMap.get(host);
    if (!st || !st.docId) return;
    var titleEl = $('#bwTitleInput', host);
    var title = titleEl ? (titleEl.value || '').trim() : (st.title || '未命名文档');
    var rec = { id: st.docId, title: title || '未命名文档', md: getBodyMarkdown(host) };
    var docs = docStoreLoad();
    var found = false;
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].id === st.docId) { docs[i] = rec; found = true; break; }
    }
    if (!found) docs.push(rec);
    docStoreSave(docs);
    // 若已绑定本地文件夹，同步写回磁盘
    if (typeof bwFilesSaveToDisk === 'function') bwFilesSaveToDisk(host);
  }

  // 自动保存到本地文档库（编辑时 debounce）
  function scheduleDocAutosave(host) {
    var st = stateMap.get(host);
    if (!st) return;
    if (st._docSaveTimer) clearTimeout(st._docSaveTimer);
    st._docSaveTimer = setTimeout(function () {
      saveCurrentDoc(host);
      if (typeof updateLocalSaveStatus === 'function') updateLocalSaveStatus(host, 'saved');
    }, 1200);
  }

  // 标题输入时立即保存（不必 debounce）
  var _bwTitleChangeBound = false;
  function bwBindTitleAutosave() {
    if (_bwTitleChangeBound) return;
    _bwTitleChangeBound = true;
    document.addEventListener('input', function (e) {
      if (!e.target || !e.target.id || e.target.id !== 'bwTitleInput') return;
      var host = e.target.closest('[data-bw-doc-editor]');
      if (host) saveCurrentDoc(host);
    });
    // 内容编辑自动保存
    document.addEventListener('input', function (e) {
      if (!e.target || !e.target.classList || !e.target.classList.contains('bw-block')) return;
      var host = e.target.closest('[data-bw-doc-editor]');
      if (host) scheduleDocAutosave(host);
    });
  }

  function renderDocMenu(host) {
    var menu = $('#bwDocMenu', host);
    if (!menu) return;
    var docs = docStoreLoad();
    var activeId = (stateMap.get(host) || {}).docId || '';
    var html = '<div class="bw-file-tree">';
    html += '<div class="bw-file-tree-header">📁 我的文档 <span class="bw-file-tree-count">' + docs.length + '</span></div>';
    if (!docs.length) {
      html += '<div class="bw-file-tree-empty">还没有文档，点击下方新建</div>';
    }
    docs.forEach(function (d) {
      var isActive = d.id === activeId ? ' active' : '';
      html += '<div class="bw-file-tree-item' + isActive + '" data-doc-id="' + escapeHtml(d.id) + '">';
      html += '<span class="bw-file-tree-icon">📝</span>';
      html += '<span class="bw-file-tree-name" data-doc-rename>' + escapeHtml(d.title || '未命名文档') + '</span>';
      html += '<span class="bw-file-tree-actions">';
      html += '<button class="bw-file-tree-act" data-doc-act="rename" title="重命名">✎</button>';
      html += '<button class="bw-file-tree-act bw-file-tree-del" data-doc-act="delete" title="删除">✕</button>';
      html += '</span></div>';
    });
    html += '</div>';
    html += '<div class="bw-file-tree-footer">';
    html += '<button class="bw-doc-new" data-doc-action="new">+ 新建文档</button>';
    html += '</div>';
    menu.innerHTML = html;
  }

  function closeMenus(host, except) {
    ['#bwDocMenu', '#bwExportMenu'].forEach(function (sel) {
      var m = $(sel, host);
      if (m && m !== except) m.style.display = 'none';
    });
  }

  function wireDocMenu(host, st) {
    var btn = $('#bwDocBtn', host);
    var menu = $('#bwDocMenu', host);
    if (!btn || !menu) return;
    renderDocMenu(host);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenus(host, menu);
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    });
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
      var act = e.target.closest('[data-doc-act]');
      var newBtn = e.target.closest('[data-doc-action="new"]');
      // 重命名 / 删除按钮
      if (act) {
        var item = act.closest('.bw-file-tree-item');
        if (!item) return;
        var id = item.getAttribute('data-doc-id');
        if (act.getAttribute('data-doc-act') === 'rename') {
          renameDoc(host, id);
        } else if (act.getAttribute('data-doc-act') === 'delete') {
          if (id === (stateMap.get(host) || {}).docId) { deleteDoc(host); }
          else { deleteDocById(host, id); }
        }
        return;
      }
      if (newBtn) { newDoc(host); menu.style.display = 'none'; return; }
      // 切换：点击项目主体（不是按钮）
      var itemEl = e.target.closest('.bw-file-tree-item');
      if (itemEl) {
        switchDoc(host, itemEl.getAttribute('data-doc-id'));
        menu.style.display = 'none';
      }
    });
    // 双击标题也可重命名
    menu.addEventListener('dblclick', function (e) {
      var name = e.target.closest('[data-doc-rename]');
      if (!name) return;
      var item = name.closest('.bw-file-tree-item');
      if (!item) return;
      renameDoc(host, item.getAttribute('data-doc-id'));
    });
  }

  function deleteDocById(host, id) {
    var docs = docStoreLoad().filter(function (d) { return d.id !== id; });
    docStoreSave(docs);
    renderDocMenu(host);
  }

  function renameDoc(host, id) {
    var docs = docStoreLoad();
    var doc = null;
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === id) { doc = docs[i]; break; } }
    if (!doc) return;
    var newTitle = window.prompt('重命名文档', doc.title || '未命名文档');
    if (newTitle === null || !newTitle.trim()) return;
    doc.title = newTitle.trim();
    docStoreSave(docs);
    if (id === (stateMap.get(host) || {}).docId) {
      var titleEl = $('#bwTitleInput', host);
      if (titleEl) titleEl.value = doc.title;
      var st = stateMap.get(host);
      if (st) st.title = doc.title;
      var infoTitle = $('#bwDocInfoTitle', host);
      if (infoTitle) infoTitle.textContent = doc.title;
      saveCurrentDoc(host);
    }
    renderDocMenu(host);
  }

  function switchDoc(host, id) {
    saveCurrentDoc(host);
    var docs = docStoreLoad();
    var target = null;
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === id) { target = docs[i]; break; } }
    if (!target) return;
    var st = stateMap.get(host);
    st.docId = target.id;
    docStoreSetActive(target.id);
    loadDocIntoEditor(host, target.title, target.md);
    renderDocMenu(host);
    initHistory(host, st);
  }

  function newDoc(host) {
    saveCurrentDoc(host);
    var st = stateMap.get(host);
    var id = genDocId();
    var docs = docStoreLoad();
    docs.push({ id: id, title: '未命名文档', md: '' });
    docStoreSave(docs);
    st.docId = id;
    docStoreSetActive(id);
    loadDocIntoEditor(host, '未命名文档', '');
    renderDocMenu(host);
    initHistory(host, st);
  }

  function deleteDoc(host) {
    var st = stateMap.get(host);
    var docs = docStoreLoad();
    if (docs.length <= 1) { bwToast(host, '至少保留一个文档', { type: 'warn' }); return; }
    var idx = -1;
    for (var i = 0; i < docs.length; i++) { if (docs[i].id === st.docId) { idx = i; break; } }
    if (idx < 0) return;
    docs.splice(idx, 1);
    docStoreSave(docs);
    var next = docs[Math.max(0, idx - 1)] || docs[0];
    st.docId = next.id;
    docStoreSetActive(next.id);
    loadDocIntoEditor(host, next.title, next.md);
    renderDocMenu(host);
    initHistory(host, st);
  }

