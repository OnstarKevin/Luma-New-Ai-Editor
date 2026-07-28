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

