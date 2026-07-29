/**
 * Luma · 灵犀 AI 副驾 — 选区浮动操作菜单与上下文捕获（零侵入）
 * 选区浮动 SVG 操作菜单（润色/补全/续写/审稿/查错/总结）与 @doc/@selection 上下文解析；
 * 选区回写原语（修正抽取 / 替换选区 / 在选区后插入）。
 * 工具栏、侧边面板、设置弹层、斜杠命令、流式回流与「采用」编排见 bw-ai-ui.js。
 * 所有图标均为内联 SVG 轮廓（16/20px），无 emoji；样式仅 .bw-ai-*。
 */
'use strict';

/* ---------- 内联 SVG 图标（轮廓，currentColor）———— 选区菜单专用 ---------- */
var POLISH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
var COMPLETE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
var CONTINUE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
var REVIEW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
var PROOFREAD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
var SUMMARIZE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

/* ---------- 上下文捕获（Token 节省的核心：只取必要文本） ---------- */
function bwAiCaptureContext(host) {
  var ctx = { host: host, selectionText: '', blockText: '', block: null, range: null, docText: '', multiBlock: false, selectedBlocks: null };

  // ── 多块选择优先 ──
  var selBlocks = $$('.bw-block.bw-selected', host);
  if (selBlocks.length > 1) {
    ctx.multiBlock = true;
    ctx.selectedBlocks = selBlocks;
    ctx.selectionText = selBlocks.map(function (b) { return b.dataset.md || b.textContent || ''; }).join('\n\n');
    ctx.block = selBlocks[0];
    ctx.blockText = ctx.selectionText;
    try { ctx.docText = (typeof getBodyMarkdown === 'function') ? getBodyMarkdown(host) : ''; } catch (e) { ctx.docText = ''; }
    return ctx;
  }

  // ── 传统单块 / 文本选择 ──
  var sel = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    var range = sel.getRangeAt(0);
    if (host.contains(range.startContainer)) {
      ctx.selectionText = sel.toString();
      try { ctx.range = range.cloneRange(); } catch (e) {}
      var node = range.startContainer;
      var el = node.nodeType === 3 ? node.parentElement : node;
      ctx.block = el ? el.closest('.bw-block') : null;
    }
  }
  if (!ctx.block) {
    var active = document.activeElement;
    if (active && host.contains(active) && active.classList.contains('bw-block')) ctx.block = active;
  }
  if (ctx.block) {
    ctx.blockText = ctx.block.dataset.md || ctx.block.textContent || '';
    if (!ctx.range) {
      try { var r2 = document.createRange(); r2.selectNodeContents(ctx.block); ctx.range = r2; ctx.selectionText = ctx.blockText; } catch (e) {}
    }
  }
  try { ctx.docText = (typeof getBodyMarkdown === 'function') ? getBodyMarkdown(host) : ''; } catch (e) { ctx.docText = ''; }
  return ctx;
}

/* ---------- 选区浮动操作菜单（润色/补全/续写/审稿/查错/总结） ---------- */
function bwAiBuildSelectionMenu(host, selMenu) {
  var selDefs = [['polish', POLISH_SVG], ['complete', COMPLETE_SVG], ['continue', CONTINUE_SVG], ['review', REVIEW_SVG], ['proofread', PROOFREAD_SVG], ['summarize', SUMMARIZE_SVG]];
  selDefs.forEach(function (p) {
    var cmd = BWAI.getCommand(p[0]); if (!cmd) return;
    var b = document.createElement('button'); b.className = 'bw-ai-selbtn'; b.title = cmd.title; b.setAttribute('aria-label', cmd.title);
    b.innerHTML = p[1];
    b.addEventListener('click', function (e) { e.stopPropagation(); selMenu.style.display = 'none'; bwAiRun(p[0], '', host); });
    selMenu.appendChild(b);
  });
  var docEl = $('#bwDoc', host);
  if (docEl) docEl.addEventListener('mouseup', function () { bwAiUpdateSelMenu(host); });
    docEl.addEventListener('click', function (e) {
      // 点击 .bw-doc 空白区域（非任何块）时强制更新 AI 菜单
      if (!e.target.closest('.bw-block') && !e.target.closest('.bw-ai-selmenu')) {
        setTimeout(function () { bwAiUpdateSelMenu(host); }, 0);
      }
    });
  host.addEventListener('scroll', function () { selMenu.style.display = 'none'; }, true);
  document.addEventListener('mousedown', function (e) { if (selMenu.style.display !== 'none' && !selMenu.contains(e.target)) selMenu.style.display = 'none'; });
}

function bwAiUpdateSelMenu(host) {
  var refs = host._bwAi; if (!refs) return;

  // ── 多块选择优先：将菜单定位到第一个选中块 ──
  var selBlocks = $$('.bw-block.bw-selected', host);
  if (selBlocks.length > 1) {
    var firstRect = selBlocks[0].getBoundingClientRect();
    var lastRect = selBlocks[selBlocks.length - 1].getBoundingClientRect();
    var pr = host.getBoundingClientRect();
    // 菜单定位在最后一个选中块的右下角
    var topB = lastRect.bottom - pr.top + 8;
    var leftB = firstRect.left - pr.left;
    refs.selMenu.style.display = 'flex';
    refs.selMenu.style.top = Math.max(48, topB) + 'px';
    refs.selMenu.style.left = Math.max(8, leftB) + 'px';
    return;
  }

  var sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    var r = sel.getRangeAt(0);
    if (host.contains(r.startContainer)) {
      var rect = r.getBoundingClientRect();
      if (rect.width || rect.height) {
        refs.selMenu.style.display = 'flex';
        var pr = host.getBoundingClientRect();
        var top = rect.bottom - pr.top + 8;
        var left = rect.left - pr.left + (rect.width / 2) - (refs.selMenu.offsetWidth / 2);
        refs.selMenu.style.top = Math.max(48, top) + 'px';
        refs.selMenu.style.left = Math.max(8, left) + 'px';
        return;
      }
    }
  }
  refs.selMenu.style.display = 'none';
}

/* ---------- 选区回写原语（采用 / 替换选区 / 在选区后插入） ---------- */
function bwAiProofreadCorrected(text) {
  var m = text.match(/===修正后===([\s\S]*?)(?:===错误清单===|$)/);
  return m ? m[1].trim() : text.trim();
}

function bwAiReplaceSelection(ctx, text) {
  // ── 多块替换 ──
  if (ctx.multiBlock && ctx.selectedBlocks && ctx.selectedBlocks.length > 0) {
    var parts = text.split(/\n{2,}/);
    var blocks = ctx.selectedBlocks;
    var hostR = ctx.host;
    blocks.forEach(function (block, i) {
      var md = i < parts.length ? parts[i].trim() : '';
      if (!md) return;
      if (block.classList.contains('editing')) block.classList.remove('editing');
      block.dataset.md = md;
      renderBlock(block, md);
      updateBlockClass(block, md);
      updateMarkdownIndicator(block);
      markDirty(block);
    });
    // 清除多选高亮
    blocks.forEach(function (b) { b.classList.remove('bw-selected'); });
    var st = stateMap.get(hostR);
    if (st) {
      var docEl = $('#bwDoc', hostR);
      if (docEl) {
        updateTOC(docEl, st);
        updateWordCount(hostR);
      }
      pushUndo(hostR, st);
      delete st._selAnchor;
    }
    return true;
  }

  // ── 传统单块 / 文本选区替换 ──
  var rng = ctx.range;
  if (!rng || !rng.startContainer || !rng.startContainer.isConnected) return false;
  try {
    rng.deleteContents();
    rng.insertNode(document.createTextNode(text));
    var node = rng.startContainer;
    var el = (node && node.nodeType === 3) ? node.parentElement : node;
    var block = el ? el.closest('.bw-block') : null;
    if (block) {
      var md = block.textContent || '';
      if (block.classList.contains('editing')) block.classList.remove('editing');
      block.dataset.md = md;
      renderBlock(block, md);
      updateBlockClass(block, md);
      updateMarkdownIndicator(block);
      markDirty(block);
      var st = stateMap.get(ctx.host);
      updateWordCount(ctx.host);
      if (st) { updateTOC(block.closest('.bw-doc'), st); pushUndo(ctx.host, st); }
    }
    return true;
  } catch (e) { return false; }
}

function bwAiInsertAfter(host, refBlock, md) {
  if (!refBlock || !refBlock.parentNode) return;
  var tmp = document.createElement('div');
  buildDoc(md, tmp, { tocRoot: document.createElement('div') });
  var kids = Array.from(tmp.children);
  if (kids.length && typeof isTrailingEmptyPlaceholder === 'function' && isTrailingEmptyPlaceholder(kids[kids.length - 1])) kids.pop();
  if (!kids.length) return;
  var ref = refBlock;
  kids.forEach(function (k) { ref.parentNode.insertBefore(k, ref.nextSibling); ref = k; });
  ensureTrailingEmptyBlock(ref.closest('.bw-doc'));
  var st = stateMap.get(host);
  updateTOC(ref.closest('.bw-doc'), st);
  updateWordCount(host);
  markDirty(ref);
  if (st) pushUndo(host, st);
}
