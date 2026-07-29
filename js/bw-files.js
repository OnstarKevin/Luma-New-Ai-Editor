/**
 * Luma — 侧边栏文件管理 + 本地文件夹联动
 * 层级展开结构，和目录一样点击展开子级、不点击不折叠。
 * 支持 localStorage 文档库 和 File System Access API 本地文件夹。
 */
'use strict';

  var _bwDirHandle = null;
  var _bwFileTree = []; // { name, handle, children:[], isDir, id }
  var _bwExpandedDirs = {}; // id -> true 记录展开状态

  /* ============================================================
   * FILE LIST RENDER
   * ============================================================ */
  function bwFilesRender(host) {
    var list = $('#bwFilesList', host);
    if (!list) return;
    var st = stateMap.get(host);
    var activeId = st ? st.docId : '';

    if (_bwDirHandle) {
      if (!_bwFileTree.length) {
        list.innerHTML = '<div class="bw-files-empty">加载中...</div>';
        bwFilesScanDir(host).then(function () { bwFilesRender(host); });
        return;
      }
      var dirName = _bwDirHandle.name || '本地文件夹';
      var html = '<div class="bw-files-folder-hint">📂 ' + escapeHtml(dirName) + '</div>';
      html += '<div class="bw-files-folder-btn"><button id="bwFilesSwitchFolder">切换文件夹</button><button id="bwFilesCloseFolder">关闭文件夹</button></div>';
      _bwFileTree.forEach(function (node) {
        html += bwFilesRenderNode(node, 0, activeId);
      });
      list.innerHTML = html;
    } else {
      var docs = (typeof docStoreLoad === 'function') ? docStoreLoad() : [];
      if (!docs.length) {
        list.innerHTML = '<div class="bw-files-empty">暂无文档，点击「新建」或「打开文件夹」</div>';
      } else {
        var html2 = '';
        docs.forEach(function (d) {
          var closeBtn = '<button class="bw-files-close" data-close-id="' + escapeHtml(d.id) + '" title="关闭文档">&times;</button>';
          html2 += '<div class="bw-files-item' + (d.id === activeId ? ' active' : '') + '" data-doc-id="' + escapeHtml(d.id) + '" data-is-dir="0" data-level="0">' +
            '<span class="bw-files-icon">📝</span><span class="bw-files-name">' + escapeHtml(d.title || '未命名') + '</span>' + closeBtn + '</div>';
        });
        list.innerHTML = html2;
      }
    }

    // Click handlers
    list.querySelectorAll('.bw-files-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        // × 删除/关闭按钮
        var delBtn = e.target.closest('.bw-files-del');
        var closeBtn = e.target.closest('.bw-files-close');
        if (delBtn) {
          e.stopPropagation();
          var delId = delBtn.getAttribute('data-del-id');
          bwFilesDelete(host, delId);
          return;
        }
        if (closeBtn) {
          e.stopPropagation();
          var closeId = closeBtn.getAttribute('data-close-id');
          bwFilesCloseDoc(host, closeId);
          return;
        }
        // 文件夹箭头点击：展开/折叠
        var arrow = e.target.closest('.bw-files-arrow');
        if (arrow) {
          var nodeId = el.getAttribute('data-doc-id');
          _bwExpandedDirs[nodeId] = !_bwExpandedDirs[nodeId];
          bwFilesRender(host);
          return;
        }
        // 文件点击：打开
        var id = el.getAttribute('data-doc-id');
        var isDir = el.getAttribute('data-is-dir') === '1';
        if (isDir) {
          _bwExpandedDirs[id] = !_bwExpandedDirs[id];
          bwFilesRender(host);
        } else if (_bwDirHandle) {
          bwFilesLoadFromDisk(host, id);
        } else if (typeof switchDoc === 'function') {
          switchDoc(host, id);
        }
      });
    });

    var closeBtn = $('#bwFilesCloseFolder', host);
    var switchBtn = $('#bwFilesSwitchFolder', host);
    if (closeBtn) closeBtn.addEventListener('click', function () { bwFilesCloseFolder(host); });
    if (switchBtn) switchBtn.addEventListener('click', function () { bwFilesOpenFolder(host); });

    var newBtn = $('#bwFilesNew', host);
    var openFileBtn = $('#bwFilesOpenFile', host);
    var openBtn = $('#bwFilesOpenFolder', host);
    if (newBtn) newBtn.onclick = function () { bwFilesNewDoc(host); };
    if (openFileBtn) openFileBtn.onclick = function () { bwFilesOpenSingleFile(host); };
    if (openBtn) openBtn.onclick = function () { bwFilesOpenFolder(host); };
  }

  function bwFilesRenderNode(node, depth, activeId) {
    var isExpanded = !!_bwExpandedDirs[node.id];
    var hasChildren = node.isDir && node.children && node.children.length > 0;
    var arrow = node.isDir ? ('<span class="bw-files-arrow">' + (isExpanded ? '▼' : '▶') + '</span>') : '';
    var icon = node.isDir ? (isExpanded ? '📂' : '📁') : '📝';
    var cls = 'bw-files-item';
    if (node.id === activeId && !node.isDir) cls += ' active';
    if (!node.isDir) cls += ' bw-files-file';
    else cls += ' bw-files-dir';
    var padLeft = 14 + depth * 16;
    var delBtn = !node.isDir ? '<button class="bw-files-del" data-del-id="' + escapeHtml(node.id) + '" title="删除文件">&times;</button>' : '';
    var html =
      '<div class="' + cls + '" data-doc-id="' + escapeHtml(node.id) + '" data-is-dir="' + (node.isDir ? '1' : '0') + '" data-level="' + depth + '" style="padding-left:' + padLeft + 'px">' +
        arrow + icon + '<span class="bw-files-name">' + escapeHtml(node.name) + '</span>' + delBtn +
      '</div>';
    if (hasChildren && isExpanded) {
      node.children.forEach(function (child) {
        html += bwFilesRenderNode(child, depth + 1, activeId);
      });
    }
    return html;
  }

  /* ============================================================
   * NEW DOCUMENT
   * ============================================================ */
  function bwFilesNewDoc(host) {
    if (_bwDirHandle) {
      var name = (window.prompt('文件名', '未命名.md') || '').trim();
      if (!name) return;
      if (!name.endsWith('.md')) name += '.md';
      bwFilesCreateLocal(host, name);
    } else {
      if (typeof newDoc === 'function') newDoc(host);
      bwFilesRender(host);
    }
  }

  /* ============================================================
   * LOCAL FOLDER (File System Access API)
   * ============================================================ */
  async function bwFilesOpenFolder(host) {
    if (typeof window.showDirectoryPicker !== 'function') {
      alert('你的浏览器不支持本地文件夹功能。请使用 Chrome 或 Edge 浏览器。');
      return;
    }
    try {
      var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      _bwDirHandle = handle;
      _bwExpandedDirs = {};
      bwFilesSaveHandle(handle);
      _bwFileTree = [];
      await bwFilesScanDir(host);
      bwFilesRender(host);
      // 打开第一个文件
      var firstFile = bwFilesFindFirstFile(_bwFileTree);
      if (firstFile) bwFilesLoadFromDisk(host, firstFile.id);
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }

  async function bwFilesScanDir(host) {
    if (!_bwDirHandle) return;
    _bwFileTree = [];
    try {
      await bwFilesScanHandle(_bwDirHandle, _bwFileTree, '');
      // 排序：文件夹在前，名字字母序
      _bwFileTree.sort(_bwFileSort);
      _bwFileTree.forEach(function (n) { if (n.children) n.children.sort(_bwFileSort); });
    } catch (e) { console.error('扫描失败', e); }
  }

  async function bwFilesScanHandle(dirHandle, parentArr, prefix) {
    for await (var [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      var id = prefix + name;
      if (handle.kind === 'directory') {
        var children = [];
        var node = { name: name, handle: handle, children: children, isDir: true, id: id };
        parentArr.push(node);
        try {
          await bwFilesScanHandle(handle, children, id + '/');
          children.sort(_bwFileSort);
        } catch (e) {}
      } else if (handle.kind === 'file' && name.endsWith('.md')) {
        parentArr.push({ name: name, handle: handle, isDir: false, id: id, children: [] });
      }
    }
  }

  function _bwFileSort(a, b) {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  }

  function bwFilesFindFirstFile(tree) {
    for (var i = 0; i < tree.length; i++) {
      if (!tree[i].isDir) return tree[i];
      if (tree[i].children) {
        var found = bwFilesFindFirstFile(tree[i].children);
        if (found) return found;
      }
    }
    return null;
  }

  function bwFilesFindNode(tree, id) {
    for (var i = 0; i < tree.length; i++) {
      if (tree[i].id === id) return tree[i];
      if (tree[i].children) {
        var found = bwFilesFindNode(tree[i].children, id);
        if (found) return found;
      }
    }
    return null;
  }

  async function bwFilesDelete(host, id) {
    if (!_bwDirHandle) return;
    var node = bwFilesFindNode(_bwFileTree, id);
    if (!node || !node.handle) return;
    if (!confirm('确定删除 ' + node.name + ' ？')) return;
    try {
      await _bwDirHandle.removeEntry(node.id);
      _bwFileTree = [];
      await bwFilesScanDir(host);
      bwFilesRender(host);
    } catch (e) { console.error(e); }
  }

  // 从文档库中关闭（移除但不删除磁盘文件）
  function bwFilesCloseDoc(host, id) {
    if (_bwDirHandle) return; // 文件夹模式下不适用
    if (typeof docStoreLoad !== 'function') return;
    var docs = docStoreLoad().filter(function (d) { return d.id !== id; });
    if (typeof docStoreSave === 'function') docStoreSave(docs);
    var st = stateMap.get(host);
    if (st && st.docId === id) {
      // 当前文档被关闭，切换到第一个
      if (docs.length) {
        if (typeof switchDoc === 'function') switchDoc(host, docs[0].id);
      } else {
        // 重建一个空文档
        if (typeof newDoc === 'function') newDoc(host);
      }
    } else {
      bwFilesRender(host);
    }
  }

  async function bwFilesLoadFromDisk(host, id) {
    if (!_bwDirHandle) return;
    var node = bwFilesFindNode(_bwFileTree, id);
    if (!node || !node.handle) return;
    try {
      var file = await node.handle.getFile();
      var text = await file.text();
      var title = node.name.replace(/\.md$/, '');
      var st = stateMap.get(host);
      if (!st) return;
      if (typeof saveCurrentDoc === 'function') saveCurrentDoc(host);
      st.docId = id;
      st._fileHandle = node.handle;
      st._fileId = id;
      if (typeof loadDocIntoEditor === 'function') loadDocIntoEditor(host, title, text);
      bwFilesRender(host);
    } catch (e) { console.error(e); }
  }

  async function bwFilesSaveToDisk(host) {
    var st = stateMap.get(host);
    if (!st || !st._fileHandle || !_bwDirHandle) return;
    try {
      var writable = await st._fileHandle.createWritable();
      var md = (typeof getFullMarkdown === 'function') ? getFullMarkdown(host) : (typeof getBodyMarkdown === 'function' ? ('# ' + (st.title || '未命���') + '\n\n' + getBodyMarkdown(host)) : '');
      await writable.write(md);
      await writable.close();
    } catch (e) {}
  }

  async function bwFilesCreateLocal(host, name) {
    if (!_bwDirHandle) return;
    try {
      var parent = _bwDirHandle;
      if (name.indexOf('/') !== -1) {
        var parts = name.split('/');
        name = parts.pop();
        for (var i = 0; i < parts.length; i++) {
          if (!parts[i]) continue;
          parent = await parent.getDirectoryHandle(parts[i], { create: true });
        }
      }
      var handle = await parent.getFileHandle(name, { create: true });
      var writable = await handle.createWritable();
      await writable.write('# ' + name.replace(/\.md$/, '') + '\n\n开始写作...');
      await writable.close();
      _bwFileTree = [];
      await bwFilesScanDir(host);
      bwFilesRender(host);
      bwFilesLoadFromDisk(host, name);
    } catch (e) { console.error(e); }
  }

  function bwFilesCloseFolder(host) {
    _bwDirHandle = null;
    _bwFileTree = [];
    _bwExpandedDirs = {};
    if (typeof docStoreLoad === 'function') {
      var docs = docStoreLoad();
      if (docs.length && typeof switchDoc === 'function') switchDoc(host, docs[0].id);
    }
    bwFilesRender(host);
  }

  /* 首次使用提示：建议选择常用文件夹 */
  function bwPromptFolderPicker(host) {
    if (typeof window.showDirectoryPicker !== 'function') return;
    if (_bwDirHandle) return;
    if (localStorage.getItem('bw-folder-dismissed')) return;

    var overlay = document.createElement('div');
    overlay.className = 'bw-folder-prompt-overlay';
    overlay.innerHTML =
      '<div class="bw-folder-prompt">' +
        '<div class="bw-folder-prompt-icon">📂</div>' +
        '<div class="bw-folder-prompt-title">选择常用文件夹</div>' +
        '<div class="bw-folder-prompt-desc">Luma 支持直接读写本地 .md 文件。选择一个文件夹后，文档将自动保存到磁盘，不怕清缓存丢失。</div>' +
        '<div class="bw-folder-prompt-actions">' +
          '<button class="bw-folder-prompt-btn primary" id="bwFpPick">选择文件夹</button>' +
          '<button class="bw-folder-prompt-btn" id="bwFpLater">稍后再说</button>' +
          '<button class="bw-folder-prompt-btn" id="bwFpNever">不再提示</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#bwFpPick').addEventListener('click', function () {
      overlay.remove();
      if (typeof bwFilesOpenFolder === 'function') bwFilesOpenFolder(host);
    });
    overlay.querySelector('#bwFpLater').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('#bwFpNever').addEventListener('click', function () {
      localStorage.setItem('bw-folder-dismissed', '1');
      overlay.remove();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && !_bwDirHandle) overlay.remove();
    });
  }

  async function bwFilesOpenSingleFile(host) {
    if (typeof window.showOpenFilePicker !== 'function') {
      // 回退：传统 input file
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.md,.txt';
      inp.onchange = function () {
        if (!inp.files || !inp.files.length) return;
        handleDroppedFiles(host, inp.files);
      };
      inp.click();
      return;
    }
    try {
      var [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.txt'] } }],
        multiple: false
      });
      var file = await handle.getFile();
      var text = await file.text();
      // 作为新文档加载到编辑器
      var name = file.name.replace(/\.(md|txt)$/, '');
      if (typeof loadDocIntoEditor === 'function') {
        var st = stateMap.get(host);
        if (st && typeof saveCurrentDoc === 'function') saveCurrentDoc(host);
        loadDocIntoEditor(host, name, text);
        // 存入文档库
        var rec = { id: genDocId(), title: name, md: text };
        var docs = (typeof docStoreLoad === 'function') ? docStoreLoad() : [];
        docs.unshift(rec);
        if (typeof docStoreSave === 'function') docStoreSave(docs);
        if (typeof docStoreSetActive === 'function') docStoreSetActive(rec.id);
        st.docId = rec.id;
        bwFilesRender(host);
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }

  /* ============================================================
   * HANDLE PERSISTENCE (IndexedDB)
   * ============================================================ */
  function bwFilesSaveHandle(handle) {
    if (typeof window.indexedDB === 'undefined') return;
    var req = indexedDB.open('bw-fs-handle', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('handles'); };
    req.onsuccess = function () {
      try {
        var tx = req.result.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'dir');
      } catch (e) {}
    };
  }

  function bwFilesRestoreHandle(host) {
    if (typeof window.indexedDB === 'undefined' || typeof window.showDirectoryPicker !== 'function') return;
    var req = indexedDB.open('bw-fs-handle', 1);
    req.onsuccess = function () {
      var tx = req.result.transaction('handles', 'readonly');
      var get = tx.objectStore('handles').get('dir');
      get.onsuccess = function () {
        if (!get.result) return;
        get.result.queryPermission({ mode: 'readwrite' }).then(function (result) {
          if (result === 'granted') {
            _bwDirHandle = get.result;
            _bwFileTree = [];
            _bwExpandedDirs = {};
            bwFilesScanDir(host).then(function () {
              bwFilesRender(host);
              var first = bwFilesFindFirstFile(_bwFileTree);
              if (first) bwFilesLoadFromDisk(host, first.id);
            });
          }
        });
      };
    };
  }

  function getFullMarkdown(host) {
    var titleEl = $('#bwTitleInput', host);
    var title = titleEl ? (titleEl.value || '').trim() : '';
    var body = (typeof getBodyMarkdown === 'function') ? getBodyMarkdown(host) : '';
    return (title ? '# ' + title + '\n\n' : '') + body;
  }
