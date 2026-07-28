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

