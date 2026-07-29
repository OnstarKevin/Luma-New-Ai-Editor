/**
 * Luma — 核心常量、全局状态与通用工具函数（$/$$、escapeHtml、debounce、KaTeX 就绪检测）
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * CONSTANTS & STATE
   * ============================================================ */
  const NS = 'bw-typora-v72';
  const RE_INLINE_MATH = /\$([^$\n]+?)\$/g;
  // eslint-disable-next-line no-control-regex
  const RE_ZW = /\u200b/g;
  const DEBOUNCE_MS = 220;
  const AUTOSAVE_DEBOUNCE_MS = 1200;
  const KATEX_POLL_MS = 100;
  const KATEX_POLL_MAX = 5000;

  let katexReady = false;
  let katexPollStart = 0;

  /* per-editor state */
  var stateMap = new WeakMap();

  function initState(host) {
    if (stateMap.has(host)) return stateMap.get(host);
    var s = {
      title: '',
      dirty: false,
      saving: false,
      conflict: false,
      currentRev: String(host.getAttribute('data-document-revision') || ''),
      autosaveUrl: host.getAttribute('data-autosave-url') || '',
      mediaUrl: host.getAttribute('data-media-upload-url') || '',
      aiAssistUrl: host.getAttribute('data-ai-assist-url') || '',
      tocCollapsed: false,
      focusMode: false,
      saveTimer: null,
      inputTimer: null,
      history: [],
      pointer: -1,
      MAX_UNDO: 20,
    };
    stateMap.set(host, s);
    return s;
  }


  /* ============================================================
   * UTILITIES
   * ============================================================ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function hasKatex() {
    return typeof window.katex !== 'undefined' && typeof window.katex.render === 'function';
  }

  function waitKatex(cb) {
    if (hasKatex()) { katexReady = true; cb(); return; }
    katexPollStart = Date.now();
    (function poll() {
      if (hasKatex()) { katexReady = true; cb(); return; }
      if (Date.now() - katexPollStart > KATEX_POLL_MAX) {
        console.warn('[BW Editor] KaTeX 未能在合理时间内加载，公式降级为纯文本');
        katexReady = false; cb(); return;
      }
      setTimeout(poll, KATEX_POLL_MS);
    })();
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout.apply(null, [fn, ms].concat([].slice.call(arguments)));
    };
  }

  /* ────── 全局交互工具 ────── */
  // 工具栏操作前保存选区（mousedown 先于 click 触发，此时选区尚未被清）
  document.addEventListener('mousedown', function (e) {
    if (e.target.closest('.bw-tool-btn') || e.target.closest('.bw-align-btn')) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        try { window._bwSavedRange = sel.getRangeAt(0).cloneRange(); } catch (_) {}
      } else {
        window._bwSavedRange = null;
      }
    }
  });

  // 工具栏操作后恢复编辑器焦点
  function refocusEditor(host) {
    setTimeout(function () {
      var block = $('.bw-block.editing', host || document);
      if (!block) block = $('.bw-block:last-of-type', host || document);
      if (block && typeof enterEdit === 'function') { block.focus(); }
    }, 10);
  }

  // 代码块复制按钮
  function bwCopyCode(btn) {
    var code = btn.closest('.bw-code-header').nextElementSibling;
    var text = (code && code.textContent) || '';
    navigator.clipboard.writeText(text).then(function () {
      var orig = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = orig; }, 1200);
    }).catch(function () {});
  }

  // 任务复选框点击切换
  document.addEventListener('click', function (e) {
    var cb = e.target.closest('.bw-task-cb');
    if (!cb) return;
    e.stopPropagation();
    var block = cb.closest('.bw-task');
    if (!block) return;
    var checked = !block.classList.contains('checked');
    block.classList.toggle('checked', checked);
    block.dataset.checked = checked ? '1' : '0';
    // 更新 dataset.md 中的 [ ] / [x]
    var md = block.dataset.md || '';
    block.dataset.md = md.replace(/\[[ x]\]/, checked ? '[x]' : '[ ]');
    var host = block.closest('[data-bw-doc-editor]');
    if (host) { var st = stateMap.get(host); if (st) { markDirty(block); pushUndo(host, st); } }
  });

  // 脚注引用弹窗
  document.addEventListener('click', function (e) {
    var ref = e.target.closest('.bw-fn-ref');
    if (!ref) return;
    e.stopPropagation();
    var label = ref.getAttribute('data-fn');
    var defs = window._bwFnDefs || {};
    if (!defs[label]) return;
    // 移除已有弹窗
    var old = document.querySelector('.bw-fn-popover');
    if (old) old.remove();
    var pop = document.createElement('div');
    pop.className = 'bw-fn-popover';
    pop.textContent = defs[label];
    document.body.appendChild(pop);
    var rect = ref.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 380) + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
    setTimeout(function () { if (pop.parentNode) pop.remove(); }, 3500);
  });
  // 点击其他位置移除弹窗
  document.addEventListener('click', function () {
    var pop = document.querySelector('.bw-fn-popover');
    if (pop) pop.remove();
  });

  /* ────── 拖放文本/文件辅助 ────── */
  function stripHtml(html) {
    var el = document.createElement('div');
    el.innerHTML = html;
    return el.textContent || '';
  }

  function bwInsertTextAtCursor(host, text) {
    if (!text) return;
    var block = document.querySelector('.bw-block.editing');
    if (!block) {
      // 没有编辑中的块：在开头创建一个
      var docEl = host ? host.querySelector('.bw-doc') : document.querySelector('.bw-doc');
      if (docEl && typeof ensureTrailingEmptyBlock === 'function') {
        ensureTrailingEmptyBlock(docEl);
        block = document.querySelector('.bw-block.editing');
      }
    }
    if (!block) return;
    // 用文本层的 surroundSelection 或直接插入到光标位置
    if (typeof getActiveEditBlock === 'function') {
      var b = getActiveEditBlock();
      if (b) block = b;
    }
    block.focus();
    // 插入到光标处
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var rng = sel.getRangeAt(0);
      rng.deleteContents();
      rng.insertNode(document.createTextNode(text));
      rng.collapse(false);
      sel.removeAllRanges();
      sel.addRange(rng);
    } else {
      block.textContent += text;
    }
    block.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof markDirty === 'function') markDirty(block);
  }

  // 统一文件拖放：图片→原逻辑；md 文件→打开为新文档
  function handleDroppedFiles(host, files) {
    var images = [];
    var texts = [];
    Array.from(files).forEach(function (f) {
      if (f.type && f.type.indexOf('image/') === 0) images.push(f);
      else if (f.name && /\.(md|txt|html|json|css|js|py|xml|yaml|yml|csv|log)$/i.test(f.name)) {
        // .md 文件单独处理
        if (/\.md$/i.test(f.name)) { texts.push({ file: f, asNewDoc: true }); }
        else texts.push({ file: f, asNewDoc: false });
      }
    });
    // .md 文件：打开为新文档
    texts.filter(function (t) { return t.asNewDoc; }).forEach(function (t) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var content = ev.target.result;
        var title = t.file.name.replace(/\.md$/, '');
        if (typeof loadDocIntoEditor === 'function') {
          var st = stateMap.get(host);
          if (st && typeof saveCurrentDoc === 'function') saveCurrentDoc(host);
          loadDocIntoEditor(host, title, content);
          var rec = { id: genDocId(), title: title, md: content };
          var docs = (typeof docStoreLoad === 'function') ? docStoreLoad() : [];
          docs.unshift(rec);
          if (typeof docStoreSave === 'function') docStoreSave(docs);
          if (typeof docStoreSetActive === 'function') docStoreSetActive(rec.id);
          if (st) st.docId = rec.id;
          if (typeof bwFilesRender === 'function') bwFilesRender(host);
        }
      };
      reader.readAsText(t.file);
    });
    // 普通文本文件：插入到当前光标
    texts.filter(function (t) { return !t.asNewDoc; }).forEach(function (t) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var content = ev.target.result;
        bwInsertTextAtCursor(host, '\n\n<!-- ' + t.file.name + ' -->\n' + content + '\n');
      };
      reader.readAsText(t.file);
    });
    // 图片文件：走原逻辑
    if (images.length && typeof handleFileUpload === 'function') {
      handleFileUpload(host, images);
    }
    if (!images.length && !texts.length && typeof bwToast === 'function') {
      bwToast(host, '不支持的格式，仅接受图片和文本文件', { type: 'warn' });
    }
  }

