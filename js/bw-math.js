/**
 * Luma — 数学公式卡片（KaTeX）的创建/展开/收起/转换
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* Auto-grow a math textarea so it never shows its own scrollbar */
  function autoGrowTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  /* ============================================================
   * MATH CARD (Typora style)
   * ============================================================ */
  function createMathCard(tex) {
    var card = document.createElement('div');
    card.className = 'bw-math-card bw-block collapsed';
    card.dataset.tex = tex;

    card.innerHTML =
      '<div class="bw-math-edit">' +
        '<div class="bw-math-card-header"><span class="bw-math-tag">LaTeX</span><span class="bw-math-status valid"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 8 7 12 13 4"/></svg> 公式</span></div>' +
        '<textarea class="bw-math-src" spellcheck="false" placeholder="输入 LaTeX 公式...">' + escapeHtml(tex) + '</textarea>' +
      '</div>' +
      '<div class="bw-math-edit-hint">点击编辑</div>' +
      '<div class="bw-math-rendered"><div class="bw-math-out"></div></div>';

    var src = $('.bw-math-src', card);
    var statusEl = $('.bw-math-status', card);
    var outEl = $('.bw-math-out', card);

    setMathState(card, tex, outEl, statusEl);

    // Click rendered formula to expand/collapse
    var renderedEl = $('.bw-math-rendered', card);
    if (renderedEl) {
      renderedEl.addEventListener('click', function (e) {
        e.stopPropagation();
        if (card.classList.contains('collapsed')) expandMathCard(card);
        else collapseMathCard(card);
      });
    }
    // Click card itself to expand when collapsed
    card.addEventListener('click', function () {
      if (card.classList.contains('collapsed')) expandMathCard(card);
    });

    // Live validation in textarea
    var validateDebounce = null;
    if (src) {
      src.addEventListener('input', function () {
        autoGrowTextarea(src);
        if (validateDebounce) clearTimeout(validateDebounce);
        validateDebounce = setTimeout(function () {
          var val = src.value.trim();
          setMathState(card, val, outEl, statusEl);
          card.dataset.tex = val;
          markDirty(card);
        }, DEBOUNCE_MS);
      });

      src.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.stopPropagation(); }
        if (e.key === 'Escape') { e.preventDefault(); collapseMathCard(card); }
        // Backspace on empty textarea: remove the math card
        if (e.key === 'Backspace' && src.value.trim() === '') {
          e.preventDefault();
          revertMathCardToBlock(card);
        }
        // Arrow up/down: exit math card, focus adjacent block
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          collapseMathCard(card);
          var docEl = card.closest('.bw-doc');
          if (docEl) {
            var allBlocks = Array.from(docEl.querySelectorAll('.bw-block, .bw-math-card'));
            var idx = allBlocks.indexOf(card);
            var target = (e.key === 'ArrowUp') ? allBlocks[idx - 1] : allBlocks[idx + 1];
            if (target) {
              if (target.classList.contains('bw-math-card')) {
                // Focus the math card's rendered area
                target.scrollIntoView({ block: 'nearest' });
              } else {
                // Focus the regular block
                target.focus();
                var tsel = window.getSelection();
                var trng = document.createRange();
                trng.selectNodeContents(target);
                trng.collapse(e.key === 'ArrowDown');
                tsel.removeAllRanges();
                tsel.addRange(trng);
              }
            }
          }
        }
        // Auto-close paired symbols in KaTeX textarea
        var tPairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
        if (tPairs[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          var start = src.selectionStart;
          var end = src.selectionEnd;
          var val = src.value;
          if (start !== end) {
            // Wrap selected text
            var selected = val.substring(start, end);
            src.value = val.substring(0, start) + e.key + selected + tPairs[e.key] + val.substring(end);
            src.selectionStart = start + 1;
            src.selectionEnd = start + 1 + selected.length;
          } else {
            src.value = val.substring(0, start) + e.key + tPairs[e.key] + val.substring(end);
            src.selectionStart = start + 1;
            src.selectionEnd = start + 1;
          }
        }
      });

      src.addEventListener('blur', function () {
        collapseMathCard(card);
        checkAndRevertMathCard(card);
      });
    }

    return card;
  }

  function setMathState(card, tex, outEl, statusEl) {
    if (katexReady && hasKatex()) {
      try {
        outEl.innerHTML = katexToHtml(tex, true);
        if (statusEl) { statusEl.className = 'bw-math-status valid'; statusEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 8 7 12 13 4"/></svg> 公式'; }
      } catch (err) {
        outEl.innerHTML = '<span style="color:var(--bw-danger);font-size:12px;">渲染错误: ' + escapeHtml(err.message) + '</span>';
        if (statusEl) { statusEl.className = 'bw-math-status error'; statusEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg> 错误'; }
      }
    } else {
      outEl.innerHTML = '<pre style="margin:0;font-family:var(--bw-font-mono);font-size:14px;">' + escapeHtml(tex) + '</pre>';
      if (statusEl) { statusEl.className = 'bw-math-status valid'; statusEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 8 7 12 13 4"/></svg> 纯文本'; }
    }
  }

  function expandMathCard(card) {
    card.classList.remove('collapsed');
    card.classList.add('expanded');
    var src = $('.bw-math-src', card);
    if (src) { autoGrowTextarea(src); setTimeout(function () { src.focus(); }, 80); }
  }

  function collapseMathCard(card) {
    card.classList.remove('expanded');
    card.classList.add('collapsed');
    var src = $('.bw-math-src', card);
    var outEl = $('.bw-math-out', card);
    var statusEl = $('.bw-math-status', card);
    if (src) { card.dataset.tex = src.value.trim(); setMathState(card, card.dataset.tex, outEl, statusEl); }
  }

  function checkAndRevertMathCard(card) {
    var src = $('.bw-math-src', card);
    if (!src) return;
    var val = src.value.trim();

    // Math card content does NOT include $$ delimiters (they are the card UI itself).
    // Only revert to text block if:
    // a) User typed literal "$$" alone (wants to exit), OR
    // b) Content only contains bare "$$" or "$" (escaping via delimiter typing)
    var isJustDollarFence = /^\${1,4}$/.test(val);
    if (isJustDollarFence || val === '') {
      revertMathCardToBlock(card);
    }
    // Otherwise keep the math card — blur does NOT mean "remove the formula"
  }

  function revertMathCardToBlock(card) {
    card.classList.add('removing');
    var st = stateMap.get(card.closest('.' + NS));
    var src = $('.bw-math-src', card);
    var replacementText = src ? src.value : (card.dataset.tex || '');

    setTimeout(function () {
      var p = document.createElement('div');
      p.className = 'bw-block p';
      p.dataset.md = replacementText;
      p.textContent = replacementText;
      makeEditable(p);
      card.parentNode.replaceChild(p, card);
      enterEdit(p);
      markDirty(p);
      if (st) updateTOC(p.closest('.bw-doc'), st);
      ensureTrailingEmptyBlock(p.closest('.bw-doc'));
    }, 250);
  }

  function convertToMathCard(block, tex) {
    var card = createMathCard(tex);
    block.parentNode.replaceChild(card, block);
    // Auto-expand and focus the textarea so user can continue editing
    setTimeout(function () { expandMathCard(card); }, 50);
    var st = stateMap.get(card.closest('.' + NS));
    if (st) updateTOC(card.closest('.bw-doc'), st);
    ensureTrailingEmptyBlock(card.closest('.bw-doc'));
    if (st) pushUndo(card.closest('.' + NS), st);
  }

