/**
 * Luma — 主题（明/暗）与专注模式切换
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * THEME TOGGLE
   * ============================================================ */
  function toggleTheme(host) {
    var isDark = host.getAttribute('data-bw-theme') === 'dark';
    var next = isDark ? 'light' : 'dark';
    host.setAttribute('data-bw-theme', next);
    try { localStorage.setItem('bw-editor-theme', next); } catch (_) {}
  }

  function loadSavedTheme(host) {
    try {
      var t = localStorage.getItem('bw-editor-theme');
      if (t) host.setAttribute('data-bw-theme', t);
    } catch (_) {}
  }


  /* ============================================================
   * FOCUS / MINIMAL MODE
   * ============================================================ */
  function toggleFocusMode(host) {
    var st = stateMap.get(host);
    if (!st) return;
    st.focusMode = !st.focusMode;
    host.classList.toggle('focus-mode', st.focusMode);
    try { localStorage.setItem('bw-focus-mode', st.focusMode ? '1' : '0'); } catch (_) {}
  }

  function loadFocusMode(host) {
    try {
      var v = localStorage.getItem('bw-focus-mode');
      if (v === '1') {
        var st = stateMap.get(host);
        if (st) st.focusMode = true;
        host.classList.add('focus-mode');
      }
    } catch (_) {}
  }

