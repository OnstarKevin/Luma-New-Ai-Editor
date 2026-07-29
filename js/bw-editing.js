/**
 * Luma — 编辑交互：输入、粘贴、方向键跨块、Backspace 合并、Tab 缩进、选区
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * EDIT MODE
   * ============================================================ */
  function makeEditable(el) {
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('focus', function () { enterEdit(el); });
    el.addEventListener('blur', function () { leaveEdit(el); });
    el.addEventListener('input', function () { onBlockInput(el); });
    el.addEventListener('keydown', function (e) { onBlockKeydown(e, el); });
    el.addEventListener('paste', function (e) { handlePaste(e, el); });
  }

  function isTrailingEmptyPlaceholder(blk) {
    return blk.classList.contains('p') &&
           !blk.classList.contains('bw-math-card') &&
           (blk.dataset.md || '').trim() === '' &&
           (blk.textContent || '').replace(/\u00A0/g, '').trim() === '';
  }

  function insertPlainTextAtCaret(text) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var rng = sel.getRangeAt(0);
    rng.deleteContents();
    var node = document.createTextNode(text);
    rng.insertNode(node);
    rng.setStartAfter(node);
    rng.collapse(true);
    sel.removeAllRanges();
    sel.addRange(rng);
    return true;
  }

  // Paste handler: keep pasted Markdown cohesive instead of letting the
  // browser inject garbled <div>/<br> into a single isolated block.
  // 判断一段文本是否「像代码」：用于粘贴时把整段代码作为「单个代码块」，
  // 避免被空行/段落逻辑拆成多块（普通文章的段落空行仍按原逻辑拆分）。
  function looksLikeCode(text) {
    var lines = text.split('\n');
    if (lines.length < 3) return false; // 太短不判定为代码
    var codeScore = 0, mdMarker = 0;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i];
      // Markdown 块级标记（带空格的 #、列表、引用）→ 倾向按 markdown 处理
      if (/^#{1,6}\s+/.test(s)) mdMarker++;
      else if (/^\s*[-*+]\s+/.test(s)) mdMarker++;
      else if (/^\s*\d+\.\s+/.test(s)) mdMarker++;
      else if (/^\s*>\s?/.test(s)) mdMarker++;
      // 代码特征
      if (/[;{}]\s*$/.test(s)) codeScore++;
      if (/^\s*(#include|#define|#pragma|using\s|import\s|from\s|def\s|class\s|func|function\s|public\s|private\s|protected\s|void\s|int\s|const\s|var\s|let\s|package\s|struct\s|enum\s|template\s|namespace\s)/.test(s)) codeScore++;
      if (/\/\/|\/\*|\*\/|::|->|=>/.test(s)) codeScore++;
      if (/^\s{2,}\S/.test(s) && /[=;{}()]/.test(s)) codeScore++; // 缩进且含代码符号
    }
    // 代码特征足够多、且明显压过 markdown 标记时才判定为代码
    return codeScore >= 4 && codeScore > mdMarker * 2;
  }

  function handlePaste(e, block) {
    var cd = e.clipboardData || window.clipboardData;

    // 粘贴图片：从剪贴板取出图片文件，统一走 handleFileUpload（压缩 → dataURL → 插入）。
    if (cd && cd.items && cd.items.length) {
      var imgFiles = [];
      for (var i = 0; i < cd.items.length; i++) {
        var it = cd.items[i];
        if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
          var f = it.getAsFile();
          if (f) imgFiles.push(f);
        }
      }
      if (imgFiles.length) {
        e.preventDefault();
        handleFileUpload(block.closest('.' + NS), imgFiles);
        return;
      }
    }

    var text = cd ? (cd.getData('text/plain') || '') : '';
    if (text === '') return; // nothing to paste, let default proceed

    // "Complex" = multi-line or contains block-level markdown → rebuild blocks.
    var complex = /\n/.test(text) || /```/.test(text) || /\$\$/.test(text) ||
                  /^(#|\s*[-*]\s|\s*>\s|\d+\.\s)/m.test(text);

    if (!complex) {
      // Single plain line: insert at caret as plain text, re-render on blur.
      e.preventDefault();
      insertPlainTextAtCaret(text);
      markDirty(block);
      return;
    }

    e.preventDefault();
    var host = block.closest('.' + NS);
    var st = stateMap.get(host);
    var docEl = block.closest('.bw-doc');
    if (!docEl) return;

    // 大段代码：整段包成单个围栏代码块，避免被空行拆成多块；
    // 若文本本身已含 ``` 围栏则交给 buildDoc 原样处理。
    // 关键：含 $$（显示公式）或 $...$（行内公式）的内容绝不包成代码块，
    // 否则从别处复制的 LaTeX（如 $$\sum$$）会被误判为 Code 模式而不渲染。
    var _hasMath = /\$\$/.test(text) || /\$[^$\n]+\$/.test(text);
    if (looksLikeCode(text) && !/^```/m.test(text) && !_hasMath) {
      text = '```\n' + text.replace(/\s+$/, '') + '\n```';
    }

    // Build proper blocks from the pasted markdown in a detached container.
    // Use a detached TOC root so buildDoc's internal updateTOC is a no-op.
    var tmp = document.createElement('div');
    buildDoc(text, tmp, { tocRoot: document.createElement('div') });
    var kids = Array.from(tmp.children);
    if (kids.length && isTrailingEmptyPlaceholder(kids[kids.length - 1])) kids.pop();
    if (!kids.length) return;

    var currentMd = (block.dataset.md || block.textContent || '').trim();
    var ref;
    if (currentMd === '') {
      // Current empty block → replace it with the pasted content start.
      var first = kids.shift();
      block.parentNode.replaceChild(first, block);
      ref = first;
    } else {
      ref = block;
    }
    kids.forEach(function (k) {
      ref.parentNode.insertBefore(k, ref.nextSibling);
      ref = k;
    });

    ensureTrailingEmptyBlock(docEl);
    updateTOC(docEl, st);
    updateWordCount(host);
    markDirty(ref);

    // Re-render any math cards that were just created.
    waitKatex(function () {
      $$('.bw-math-card', docEl).forEach(function (card) {
        var outEl = $('.bw-math-out', card);
        var statusEl = $('.bw-math-status', card);
        setMathState(card, card.dataset.tex || '', outEl, statusEl);
      });
    });

    // Place the caret on the last pasted block for continued editing.
    if (ref.classList.contains('bw-math-card')) {
      expandMathCard(ref);
    } else {
      ref.focus();
      var sel = window.getSelection();
      var rng = document.createRange();
      rng.selectNodeContents(ref);
      rng.collapse(false);
      sel.removeAllRanges();
      sel.addRange(rng);
    }
    var stP = stateMap.get(block.closest('.' + NS));
    if (stP) pushUndo(block.closest('.' + NS), stP);
  }

  function enterEdit(block) {
    block._mergePending = false;
    removeLivePreview(block);
    // 点击非选中块时清空多块选择
    var hostE = block.closest('.' + NS);
    if (!block.classList.contains('bw-selected') && $$('.bw-block.bw-selected', hostE).length > 0) {
      clearMultiBlockSelection(hostE);
    }
    $$('.bw-block.editing', block.parentNode).forEach(function (b) {
      if (b !== block) leaveEdit(b);
    });
    var md = block.dataset.md || '';
    if (!md) md = block.textContent || '';
    // Code blocks are stored with ``` fences, but the editor should show the
    // raw source, so strip the fences before entering edit mode.
    if (block.classList.contains('code')) md = stripCodeFences(md);
    block.textContent = md;
    block.classList.add('editing');
    refreshSpecialLine(block); // 聚焦瞬间按当前内容刷新竖线颜色（避免沿用旧 class）

    // Move cursor to end
    var sel = window.getSelection();
    var rng = document.createRange();
    rng.selectNodeContents(block);
    rng.collapse(false);
    sel.removeAllRanges();
    sel.addRange(rng);
  }

  function leaveEdit(block) {
    if (!block.classList.contains('editing')) return;
    removeLivePreview(block);
    // Guard: if block was already converted/replaced (not in DOM), skip
    if (!block.isConnected) return;
    block.classList.remove('editing');
    var md = block.textContent || '';
    // Code blocks keep their fences in dataset.md (for serialization) but are
    // edited without them; re-add the fences here so the stored md stays
    // round-trip safe and updateBlockClass still recognises it as a code block.
    var storedMd = md;
    if (block.classList.contains('code')) {
      var lang = block.dataset.lang || '';
      storedMd = '```' + lang + '\n' + md + '\n```';
    }
    block.dataset.md = storedMd;

    // Check if it should become a math block
    var m = md.match(/^\s*\$\$([\s\S]*?)\$\$\s*$/);
    if (m) {
      convertToMathCard(block, m[1].trim());
      return;
    }
    renderBlock(block, storedMd);
    // Update block class based on rendered markdown type
    updateBlockClass(block, storedMd);
    updateMarkdownIndicator(block);
    markDirty(block);
    ensureTrailingEmptyBlock(block.closest('.bw-doc'));
    var stL = stateMap.get(block.closest('.' + NS));
    if (stL) pushUndo(block.closest('.' + NS), stL);
  }

  function updateBlockClass(block, md) {
    var cls = 'bw-block';
    if (/^#\s+/.test(md)) cls += ' h1';
    else if (/^#{2}\s+/.test(md)) cls += ' h2';
    else if (/^#{3}\s+/.test(md)) cls += ' h3';
    else if (/^#{4}\s+/.test(md)) cls += ' h4';
    else if (/^>\s?/.test(md)) cls += ' blockquote';
    else if (/^[*-]\s+/.test(md)) cls += ' ul';
    else if (/^\d+\.\s+/.test(md)) cls += ' ol';
    else if (/^```/.test(md)) cls += ' code';
    else cls += ' p';
    block.className = cls;
  }

  function onBlockInput(block) {
    block._mergePending = false; // 一旦输入，取消"待合并"状态
    var st = stateMap.get(block.closest('.' + NS));
    if (!st) return;
    refreshSpecialLine(block); // 实时：打字/删除瞬间翻转竖线颜色（同步，不等防抖）
    removeLivePreview(block);  // 输入即清预览，避免非公式内容触发残留
    if (st.inputTimer) clearTimeout(st.inputTimer);
    st.inputTimer = setTimeout(function () { markDirty(block); updateLivePreview(block); }, DEBOUNCE_MS);
  }

  function onBlockKeydown(e, block) {
    // ── Shift+Arrow: multi-block selection ──
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      var hostSel = block.closest('.' + NS);
      var docSel = $('#bwDoc', hostSel);
      if (!docSel) return;
      var blocks = $$('.bw-block:not(.bw-placeholder)', docSel);
      var selected = $$('.bw-block.bw-selected', docSel);
      var stSel = stateMap.get(hostSel);
      if (selected.length === 0) {
        // 启动选择：锚点 = 当前块，先选中当前块 + 相邻块
        if (stSel) stSel._selAnchor = block;
        block.classList.add('bw-selected');
        var adj = e.key === 'ArrowUp' ? getNextBlock(block, 'prev') : getNextBlock(block, 'next');
        if (adj) { adj.classList.add('bw-selected'); adj.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      } else {
        // 扩展选择：在方向上找最远的已选块，再往外扩一个
        if (e.key === 'ArrowUp') {
          for (var i = 0; i < blocks.length; i++) {
            if (blocks[i].classList.contains('bw-selected')) {
              if (i > 0 && !blocks[i - 1].classList.contains('bw-selected')) {
                blocks[i - 1].classList.add('bw-selected');
                blocks[i - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
              break;
            }
          }
        } else {
          for (var j = blocks.length - 1; j >= 0; j--) {
            if (blocks[j].classList.contains('bw-selected')) {
              if (j < blocks.length - 1 && !blocks[j + 1].classList.contains('bw-selected')) {
                blocks[j + 1].classList.add('bw-selected');
                blocks[j + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
              break;
            }
          }
        }
      }
      // 保持焦点在操作块
      block.focus();
      // 若 AI 面板已初始化，更新浮动菜单
      if (typeof bwAiUpdateSelMenu === 'function') { setTimeout(function () { bwAiUpdateSelMenu(hostSel); }, 60); }
      return;
    }

    // ── Normal cross-block caret movement (ArrowUp/Down, no modifiers) ──
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowUp' && isCaretOnFirstLine(block)) {
        e.preventDefault();
        moveCaretAcrossBlocks(block, 'prev');
        return;
      }
      if (e.key === 'ArrowDown' && isCaretOnLastLine(block)) {
        e.preventDefault();
        moveCaretAcrossBlocks(block, 'next');
        return;
      }
    }

    // ── Esc: clear multi-block selection ──
    if (e.key === 'Escape') {
      clearMultiBlockSelection(block.closest('.' + NS));
      return;
    }

    // ── 多块操作：Ctrl+C 复制 / Delete|Backspace 删除 ──
    var hostMK = block.closest('.' + NS);
    var selBlocks = $$('.bw-block.bw-selected', hostMK);
    if (selBlocks.length > 1) {
      // Ctrl/Cmd+C: 复制选中块为 Markdown
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        var md = selBlocks.map(function (b) { return b.dataset.md || b.textContent || ''; }).join('\n\n');
        navigator.clipboard.writeText(md).catch(function () { /* 降级：不阻塞 */ });
        clearMultiBlockSelection(hostMK);
        return;
      }
      // Delete / Backspace: 删除所有选中块
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        var docElMK = $('#bwDoc', hostMK);
        var stMK = stateMap.get(hostMK);
        selBlocks.forEach(function (b) { b.remove(); });
        clearMultiBlockSelection(hostMK);
        if (docElMK) ensureTrailingEmptyBlock(docElMK);
        if (stMK) {
          updateTOC(docElMK, stMK);
          updateWordCount(hostMK);
          pushUndo(hostMK, stMK);
        }
        return;
      }
    }

    // ── Ctrl/Cmd+Shift+A: select all blocks in document ──
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selectAllBlocks(block.closest('.' + NS));
      return;
    }

    // ── Ctrl/Cmd+A: select only the current block content ──
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      clearMultiBlockSelection(block.closest('.' + NS));
      var sel = window.getSelection();
      var rngA = document.createRange();
      rngA.selectNodeContents(block);
      sel.removeAllRanges();
      sel.addRange(rngA);
      return;
    }

    // Check if content is a complete math formula first
    var checkMath = (block.textContent || '').match(/^\s*\$\$([\s\S]*?)\$\$\s*$/);
    if (checkMath && (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      convertToMathCard(block, checkMath[1].trim());
      // Focus the math card's textarea (handled inside convertToMathCard via expandMathCard)
      return;
    }

    // Tab: insert a hard tab (long space) at the caret instead of moving
    // focus to the next element or soft-wrapping the line. Only in edit mode;
    // in rendered view we let the browser move focus normally.
    if (e.key === 'Tab') {
      if (!block.classList.contains('editing')) return;
      e.preventDefault();
      insertPlainTextAtCaret('\t');
      onBlockInput(block);
      return;
    }

    // Shift+Space: toggle between raw markdown edit and rendered view
    if (e.key === ' ' && e.shiftKey) {
      e.preventDefault();
      if (block.classList.contains('editing')) {
        // Currently editing (raw markdown) → render immediately
        leaveEdit(block);
      } else {
        // Currently rendered → show raw markdown for editing
        enterEdit(block);
      }
      return;
    }

    // Auto-close paired symbols: ( ) [ ] { } " "
    var pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
    if (pairs[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      var sel = window.getSelection();
      if (sel.rangeCount) {
        var rng = sel.getRangeAt(0);
        var openChar = e.key;
        var closeChar = pairs[openChar];
        // If there's selected text, wrap it in the pair
        if (!rng.collapsed) {
          var selectedText = rng.toString();
          rng.deleteContents();
          var textNode = document.createTextNode(openChar + selectedText + closeChar);
          rng.insertNode(textNode);
          rng.setStartAfter(textNode);
          rng.collapse(true);
        } else {
          // Insert pair, cursor in middle
          var textNode = document.createTextNode(openChar + closeChar);
          rng.insertNode(textNode);
          rng.setStart(textNode, 1);
          rng.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(rng);
      }
      return;
    }

    // Shift+Enter: 软换行（行内 <br>）。插入真实换行字符，避免浏览器默认 <br>
    // 在失焦序列化（textContent）时丢失，保证重渲染后换行仍在。
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      insertPlainTextAtCaret('\n');
      markDirty(block);
      return;
    }

    // Enter at end of last block creates a new one
    if (e.key === 'Enter' && !e.shiftKey) {
      var sel = window.getSelection();
      if (sel.rangeCount) {
        var rng = sel.getRangeAt(0);
        if (rng.collapsed && isAtEnd(block, rng)) {
          e.preventDefault();
          var nb = document.createElement('div');
          nb.className = 'bw-block p';
          nb.dataset.md = '';
          nb.textContent = '';
          nb.setAttribute('contenteditable', 'true');
          makeEditable(nb);
          block.parentNode.insertBefore(nb, block.nextSibling);
          nb.focus();
          updateTOC(block.closest('.bw-doc'), stateMap.get(nb.closest('.' + NS)));
        }
      }
    }
    // —— Backspace behavior ——
    // At the very start of a block:
    //  • if the block is empty and has special rendering (not p), convert it
    //    back to a plain paragraph instead of trying to cancel/merge;
    //  • if the line has special rendering, the FIRST Backspace cancels that
    //    rendering (drops the leading marker) while the caret stays at the
    //    start; the SECOND Backspace then merges the line into the one above.
    //  • if there's no special rendering, Backspace merges into the line above
    //    directly.
    if (e.key === 'Backspace') {
      if (!isCaretAtStart(block)) {
        block._mergePending = false;
        return; // not at start: let the browser delete the char normally
      }
      // Empty special block (no visible content) → convert to plain paragraph
      var isEmpty = (block.textContent || '').trim() === '';
      if (isEmpty && !block.classList.contains('p') && !block.classList.contains('bw-math-card')) {
        e.preventDefault();
        block.className = 'bw-block p';
        block.dataset.md = '';
        block._mergePending = false;
        refreshSpecialLine(block);
        updateLivePreview(block);
        markDirty(block);
        var stConv = stateMap.get(block.closest('.' + NS));
        if (stConv) pushUndo(block.closest('.' + NS), stConv);
        return;
      }
      var mdBS = block.textContent || '';
      // A pending merge (previous Backspace already cancelled special rendering)
      // means this press should merge into the line above.
      if (block._mergePending) {
        block._mergePending = false;
        if (block.previousElementSibling) {
          e.preventDefault();
          mergeWithPrevious(block);
        }
        return;
      }
      var stripped = cancelSpecialRendering(mdBS);
      if (stripped !== null && stripped !== mdBS) {
        // First Backspace: cancel special rendering, caret stays at the start.
        e.preventDefault();
        block.textContent = stripped;
        block.dataset.md = stripped;
        refreshSpecialLine(block);
        updateLivePreview(block);
        setCaretAtOffset(block, 0);
        block._mergePending = true;
        markDirty(block);
        var stBS = stateMap.get(block.closest('.' + NS));
        if (stBS) pushUndo(block.closest('.' + NS), stBS);
        return;
      }
      // No special rendering → merge directly into the line above.
      if (block.previousElementSibling) {
        e.preventDefault();
        mergeWithPrevious(block);
        return;
      }
      // First line with no previous sibling: nothing to merge into.
      return;
    }
  }

  function isAtEnd(block, rng) {
    var after = document.createRange();
    after.selectNodeContents(block);
    after.setStart(rng.endContainer, rng.endOffset);
    return after.toString().trim() === '';
  }

  // Is the caret at the very start of the block (offset 0)?
  function isCaretAtStart(block) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var rng = sel.getRangeAt(0);
    if (!rng.collapsed) return false;
    var probe = rng.cloneRange();
    probe.selectNodeContents(block);
    probe.setEnd(rng.startContainer, rng.startOffset);
    return probe.toString().length === 0;
  }

  // Place the caret at a given character offset (text length) within a block.
  function setCaretAtOffset(block, offset) {
    var sel = window.getSelection();
    var rng = document.createRange();
    var remaining = offset;
    var found = false;
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      var len = n.nodeValue.length;
      if (remaining <= len) { rng.setStart(n, remaining); rng.collapse(true); found = true; break; }
      remaining -= len;
    }
    if (!found) { rng.selectNodeContents(block); rng.collapse(false); }
    sel.removeAllRanges();
    sel.addRange(rng);
  }

  // Drop the leading/special marker so the line falls back to a plain paragraph.
  // Returns the demoted markdown, or null when there's nothing to cancel.
  function cancelSpecialRendering(md) {
    if (!md) return null;
    if (/^#{1,6}\s+/.test(md)) return md.replace(/^#{1,6}\s+/, '');
    if (/^>\s?/.test(md)) return md.replace(/^>\s?/, '');
    if (/^[*+-]\s+/.test(md)) return md.replace(/^[*+-]\s+/, '');
    if (/^\d+\.\s+/.test(md)) return md.replace(/^\d+\.\s+/, '');
    var dm = md.match(/^\$\$([\s\S]*?)\$\$$/);
    if (dm) return dm[1];
    var im = md.match(/^\$([^$\n]+)\$$/);
    if (im) return im[1];
    var b1 = md.match(/^\*\*([\s\S]+?)\*\*$/); if (b1) return b1[1];
    var b2 = md.match(/^__([\s\S]+?)__$/); if (b2) return b2[1];
    var st = md.match(/^~~([\s\S]+?)~~$/); if (st) return st[1];
    var ic = md.match(/^`([^`\n]+)`$/); if (ic) return ic[1];
    return null;
  }

  // Merge the current block into the previous block, caret parked at the join
  // point. Used by Backspace-at-start after the special marker has been dropped
  // (or directly when the line has no special rendering).
  function mergeWithPrevious(block) {
    var prev = block.previousElementSibling;
    if (!prev) return false;
    var host = block.closest('.' + NS);
    var st = stateMap.get(host);
    var prevMd = prev.dataset.md || prev.textContent || '';
    var curMd = block.textContent || '';
    var newMd = prevMd + curMd;
    var docEl = block.closest('.bw-doc'); // 先存引用，block.remove() 之后 close 会断
    block.remove();
    prev.dataset.md = newMd;
    renderBlock(prev, newMd);
    updateBlockClass(prev, newMd);
    updateMarkdownIndicator(prev);
    if (docEl) ensureTrailingEmptyBlock(docEl);
    enterEdit(prev);
    setCaretAtOffset(prev, prevMd.length);
    block._mergePending = false;
    markDirty(prev);
    if (st) pushUndo(host, st);
    return true;
  }

  // Caret bounding rect (works for collapsed selections in modern browsers)
  function caretRect() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r) return null;
    if (r.top === 0 && r.left === 0 && r.width === 0 && r.height === 0) return null;
    return r;
  }

  // Is the caret currently on the first visual line of the block?
  function isCaretOnFirstLine(block) {
    var cRect = caretRect();
    if (cRect) {
      var bRect = block.getBoundingClientRect();
      return (cRect.top - bRect.top) <= cRect.height + 1;
    }
    // Fallback for empty/degenerate blocks where the caret rect is 0×0:
    // treat a collapsed caret at the very start of the block as the first line.
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var rng = sel.getRangeAt(0);
    if (!rng.collapsed) return false;
    var probe = rng.cloneRange();
    probe.selectNodeContents(block);
    probe.setEnd(rng.startContainer, rng.startOffset);
    return probe.toString().length === 0;
  }

  // Is the caret currently on the last visual line of the block?
  function isCaretOnLastLine(block) {
    var cRect = caretRect();
    if (cRect) {
      var bRect = block.getBoundingClientRect();
      return (bRect.bottom - cRect.bottom) <= cRect.height + 1;
    }
    // Fallback for empty/degenerate blocks: a collapsed caret at the very end
    // of the block content counts as the last line.
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var rng = sel.getRangeAt(0);
    if (!rng.collapsed) return false;
    var after = rng.cloneRange();
    after.selectNodeContents(block);
    after.setStart(rng.endContainer, rng.endOffset);
    return after.toString().trim().length === 0;
  }

  // Move the caret to the adjacent block so the user can flow through every
  // line ignoring block boundaries (Up = previous block, Down = next block).
  function moveCaretAcrossBlocks(block, dir) {
    var docEl = block.closest('.bw-doc');
    if (!docEl) return;
    var blocks = Array.from(docEl.querySelectorAll('.bw-block'));
    var idx = blocks.indexOf(block);
    if (idx < 0) return;
    var target = dir === 'prev' ? blocks[idx - 1] : blocks[idx + 1];
    if (!target) return; // already at document edge

    if (target.classList.contains('bw-math-card')) {
      expandMathCard(target);
      var src = $('.bw-math-src', target);
      if (src) {
        src.focus();
        var pos = dir === 'prev' ? src.value.length : 0;
        try { src.setSelectionRange(pos, pos); } catch (_) {}
      }
      return;
    }

    target.focus(); // triggers enterEdit: shows raw markdown

    // Empty target blocks have no inline box for a caret to land in, so the
    // focus/selection can be rejected. Give it a <br> anchor *after* enterEdit
    // (which would otherwise wipe it) so the caret has a concrete position.
    var isEmpty = (target.textContent || '').replace(/ /g, '').trim() === '';
    if (isEmpty) {
      target.innerHTML = '<br>';
    }

    var sel = window.getSelection();
    var rng = document.createRange();
    rng.selectNodeContents(target);
    rng.collapse(dir === 'prev'); // prev caret at end, next caret at start
    sel.removeAllRanges();
    sel.addRange(rng);
  }

  // Select the entire document content (all lines) regardless of blocks.
  function selectAllDoc(host) {
    var docEl = $('#bwDoc', host);
    if (!docEl) return;
    var sel = window.getSelection();
    var rng = document.createRange();
    rng.selectNodeContents(docEl);
    sel.removeAllRanges();
    sel.addRange(rng);
  }

  /* ────── 多块选择（Shift+Arrow）────── */
  // 清除当前文档中所有块的多选高亮
  function clearMultiBlockSelection(host) {
    var docEl = $('#bwDoc', host);
    if (!docEl) return;
    $$('.bw-block.bw-selected', docEl).forEach(function (b) { b.classList.remove('bw-selected'); });
    var st = stateMap.get(host);
    if (st) delete st._selAnchor;
  }

  // 全选文档中所有非占位块
  function selectAllBlocks(host) {
    var docEl = $('#bwDoc', host);
    if (!docEl) return;
    clearMultiBlockSelection(host);
    var st = stateMap.get(host);
    var blocks = $$('.bw-block:not(.bw-placeholder)', docEl);
    var first = blocks[0];
    blocks.forEach(function (b) { b.classList.add('bw-selected'); });
    if (st && first) st._selAnchor = first;
  }

  // 获取相邻块（跳过占位块）
  function getNextBlock(block, dir) {
    var blocks = $$('.bw-block:not(.bw-placeholder)', block.parentNode);
    var idx = blocks.indexOf(block);
    if (dir === 'next' && idx < blocks.length - 1) return blocks[idx + 1];
    if (dir === 'prev' && idx > 0) return blocks[idx - 1];
    return null;
  }
  /* ────── /多块选择 ────── */

  // 点击编辑器空白区域（非块）时清除多块选择
  (function () {
    document.addEventListener('click', function (e) {
      var block = e.target.closest('.bw-block');
      var doc = e.target.closest('.bw-doc');
      if (doc && !block) {
        var host = doc.closest('.' + NS);
        if (host && $$('.bw-block.bw-selected', host).length) clearMultiBlockSelection(host);
      }
    });
  })();

  function markDirty(block) {
    var root = block.closest('.' + NS);
    var st = stateMap.get(root);
    if (!st) return;
    st.dirty = true;
    scheduleAutosave(root, st);
    updateWordCount(root);
  }

