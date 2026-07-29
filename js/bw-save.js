/**
 * Luma — 自动保存、发布、字数统计与状态更新
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * AUTOSAVE
   * ============================================================ */
  function scheduleAutosave(host, st) {
    if (st.saveTimer) clearTimeout(st.saveTimer);
    st.saveTimer = setTimeout(function () { doSave(host); }, AUTOSAVE_DEBOUNCE_MS);
  }

  function doSave(host) {
    var st = stateMap.get(host);
    if (!st || !st.dirty || st.saving || !st.autosaveUrl) return;

    st.saving = true;
    st.dirty = false;
    updateSaveStatus(host, 'saving');

    var document = getCanonicalJson(host);
    fetch(st.autosaveUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ document: document, expectedRevision: st.currentRev })
    })
    .then(function (resp) {
      if (resp.status === 409) { st.conflict = true; updateSaveStatus(host, 'conflict'); st.saving = false; return; }
      if (!resp.ok) throw new Error(resp.status);
      return resp.json();
    })
    .then(function (data) {
      if (data && data.revision !== undefined) {
        st.currentRev = String(data.revision);
        var revInput = $('input[name="expectedRevision"]');
        if (revInput) revInput.value = st.currentRev;
      }
      updateSaveStatus(host, 'saved');
      st.saving = false;
    })
    .catch(function (err) {
      console.error('[BW Editor] Autosave failed:', err);
      updateSaveStatus(host, 'error');
      st.saving = false;
      st.dirty = true;
    });
  }

  function updateSaveStatus(host, status) {
    var el = $('.bw-save-indicator', host);
    if (!el) return;
    el.className = 'bw-save-indicator ' + status;
    var labels = { saved: '已保存', saving: '保存中...', error: '保存失败', conflict: '版本冲突' };
    el.textContent = labels[status] || status;
  }


  /* ============================================================
   * WORD COUNT
   * ============================================================ */
  function updateWordCount(host) {
    var els = document.querySelectorAll('.bw-word-count, .bw-status-wordcount');
    if (!els.length) return;
    var docEl = $('.bw-doc', host);
    if (!docEl) return;
    var text = (docEl.textContent || '').replace(/\s+/g, ' ').trim();
    var cnLen = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    var otherLen = text.length - cnLen;
    var wordEstimate = cnLen + Math.ceil(otherLen / 5);
    var label = wordEstimate + ' 字';
    els.forEach(function (el) { el.textContent = label; });
  }


  /* ============================================================
   * PUBLISH
   * ============================================================ */
  function doPublish(host) {
    // Save first (if dirty), then submit the publish form.
    var st = stateMap.get(host);
    if (st && st.dirty) {
      doSave(host);
      // Wait briefly then publish
      setTimeout(function () { submitPublishForm(host); }, 600);
    } else {
      submitPublishForm(host);
    }
  }

  function submitPublishForm(host) {
    var form = $('form[data-publish-form]', host);
    if (form) { form.requestSubmit(); return; }
    // No publish form on this page (e.g. standalone local preview): give clear
    // feedback instead of failing silently.
    bwToast(host, '当前为本地预览，无法发布', { type: 'warn' });
  }

  /* ============================================================
   * LOCAL OFFLINE AUTOSAVE (always on, independent of autosaveUrl)
   * ============================================================ */
  // 全局 dirty 标记：是否有未保存到 localStorage 的改动
  var _bwLocalDirty = false;

  function bwLocalKey(host) {
    return 'bw-doc-' + (host.id || 'default');
  }

  // 从 localStorage 恢复最近内容（启动时调用）
  function bwLocalRestore(host) {
    try {
      var raw = localStorage.getItem(bwLocalKey(host));
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || !saved.md) return false;
      // 重建文档
      var docEl = $('#bwDoc', host);
      if (docEl && typeof buildDoc === 'function') {
        buildDoc(saved.md, docEl, stateMap.get(host));
        return true;
      }
    } catch (e) { /* 静默 */ }
    return false;
  }

  // 把当前内容写入 localStorage（debounce 由调用方控制）
  function bwLocalSave(host, opts) {
    try {
      var st = stateMap.get(host);
      if (!st) return;
      var docEl = $('.bw-doc', host);
      if (!docEl) return;
      var title = ($('#bwTitleInput', host) && $('#bwTitleInput', host).value) || '';
      var md = (typeof getBodyMarkdown === 'function') ? getBodyMarkdown(host) : '';
      var data = { md: md, title: title, ts: Date.now() };
      localStorage.setItem(bwLocalKey(host), JSON.stringify(data));
      _bwLocalDirty = false;
      updateLocalSaveStatus(host, 'saved', data.ts);
      if (opts && opts.silent !== true) {
        // 节流提示：避免每秒钟弹 toast
        if (!host._bwLastLocalSave || Date.now() - host._bwLastLocalSave > 3000) {
          host._bwLastLocalSave = Date.now();
        }
      }
    } catch (e) { updateLocalSaveStatus(host, 'error'); }
  }

  // 安排本地保存（默认 1.2 秒 debounce）
  function bwLocalSchedule(host) {
    var st = stateMap.get(host);
    if (!st) return;
    if (st._localSaveTimer) clearTimeout(st._localSaveTimer);
    _bwLocalDirty = true;
    updateLocalSaveStatus(host, 'pending');
    st._localSaveTimer = setTimeout(function () { bwLocalSave(host); }, 60000);
  }

  // 状态指示器（DOM 已存在则复用，否则无副作用）
  function updateLocalSaveStatus(host, status, ts) {
    var ind = $('.bw-save-indicator', host);
    if (!ind) return;
    var labels = { saved: '已保存', saving: '保存中...', pending: '待保存', error: '保存失败' };
    ind.className = 'bw-save-indicator ' + status;
    var label = labels[status] || status;
    if (status === 'saved' && ts) {
      var d = new Date(ts);
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      var ss = String(d.getSeconds()).padStart(2, '0');
      label = label + ' · ' + hh + ':' + mm + ':' + ss;
    }
    ind.textContent = label;
  }

  // 关闭浏览器/刷新前提示未保存
  var _bwBeforeUnloadBound = false;
  function bwSetupBeforeUnload() {
    if (_bwBeforeUnloadBound) return;
    _bwBeforeUnloadBound = true;
    window.addEventListener('beforeunload', function (e) {
      if (_bwLocalDirty) {
        e.preventDefault();
        // 现代浏览器忽略自定义文案，仅需返回非空字符串
        e.returnValue = '有未保存的修改，确定要离开吗？';
        return '有未保存的修改，确定要离开吗？';
      }
    });
    // 兜底：tab 切换/隐藏时立即保存
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && _bwLocalDirty) {
        var host = document.querySelector('[data-bw-doc-editor]');
        if (host) bwLocalSave(host, { silent: true });
      }
    });
  }

  // 监听内容变化：标记脏
  document.addEventListener('input', function (e) {
    if (!e.target || !e.target.classList || !e.target.classList.contains('bw-block')) return;
    var host = e.target.closest('[data-bw-doc-editor]');
    if (!host) return;
    bwLocalSchedule(host);
  });

