/**
 * Luma — 工具栏指令：标题/列表/引用/代码/图片/公式/表格插入与环绕选择
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * FORMAT TOOLBAR ACTIONS
   * ============================================================ */
  function surroundSelection(before, after) {
    var block = getActiveEditBlock();
    if (!block) return;
    var text = block.textContent || '';
    var sel = window.getSelection();
    var range = null;
    if (sel && sel.rangeCount && !sel.isCollapsed && block.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else if (window._bwSavedRange && block.contains(window._bwSavedRange.startContainer)) {
      range = window._bwSavedRange;
    }

    if (range) {
      // ── 有选区：包裹选区 ──
      var selStart = getTextOffset(block, range.startContainer, range.startOffset);
      var selEnd = getTextOffset(block, range.endContainer, range.endOffset);
      if (selStart !== undefined && selStart !== selEnd) {
        if (selStart > selEnd) { var t = selStart; selStart = selEnd; selEnd = t; }
        var selected = text.substring(selStart, selEnd);
        var newText = text.substring(0, selStart) + before + selected + after + text.substring(selEnd);
        block.textContent = newText;
        block.dataset.md = newText;
        var cursor = selStart + before.length + selected.length + after.length;
        setCaretAtOffset(block, cursor);
        block.dispatchEvent(new Event('input', { bubbles: true }));
        markDirty(block);
        if (typeof pushUndo === 'function') {
          var st0 = stateMap.get(block.closest('.' + NS));
          if (st0) pushUndo(block.closest('.' + NS), st0);
        }
        window._bwSavedRange = null;
        delete block._skipLeaveEdit;
        delete block._bwDeferLeave;
        return;
      }
    }

    // ── 无选区：插入标记并将光标放在中间 ──
    var cursorOff;
    if (sel && sel.rangeCount && block.contains(sel.anchorNode)) {
      cursorOff = getTextOffset(block, sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    }
    if (cursorOff === undefined || cursorOff < 0) cursorOff = text.length;
    var newText2 = text.substring(0, cursorOff) + before + after + text.substring(cursorOff);
    block.textContent = newText2;
    block.dataset.md = newText2;
    setCaretAtOffset(block, cursorOff + before.length);
    block.dispatchEvent(new Event('input', { bubbles: true }));
    markDirty(block);
    if (typeof pushUndo === 'function') {
      var st2 = stateMap.get(block.closest('.' + NS));
      if (st2) pushUndo(block.closest('.' + NS), st2);
    }
    window._bwSavedRange = null;
    // 行内格式保持编辑态，不需要补 leaveEdit
    delete block._skipLeaveEdit;
    delete block._bwDeferLeave;
  }

  // 获取文本节点相对于块的偏移量（处理 container 是元素的情况）
  function getTextOffset(block, node, offset) {
    // 简化：如果 node 是块本身或非文本节点，offset 是子节点索引
    if (node === block) {
      var pos2 = 0;
      for (var i = 0; i < offset && i < block.childNodes.length; i++) {
        pos2 += (block.childNodes[i].textContent || '').length;
      }
      return pos2;
    }
    if (node.nodeType === 1) {
      // 元素节点：累加其前面所有节点（包括自身）的文本长度，再按 offset 算子节点
      var walker2 = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT, null);
      var posEl = 0;
      var foundEl = false;
      var n2;
      while ((n2 = walker2.nextNode())) {
        if (n2 === node) { foundEl = true; break; }
        posEl += (n2.textContent || '').length;
      }
      if (foundEl && node.childNodes[offset]) {
        return posEl + getTextOffset(node, node.childNodes[offset], 0);
      }
      return posEl;
    }
    var pos = 0;
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (n === node) return pos + Math.min(offset, n.textContent.length);
      pos += n.textContent.length;
    }
    return pos;
  }

  // 获取当前正在编辑的块
  function getActiveEditBlock() {
    var active = document.activeElement;
    if (active && active.classList.contains('bw-block') && active.classList.contains('editing')) return active;
    // fallback: 找任意 editing 块
    return document.querySelector('.bw-block.editing');
  }

  function insertHeading(level) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var rng = sel.getRangeAt(0);
    var block = rng.startContainer.nodeType === 3 ? rng.startContainer.parentElement : rng.startContainer;
    var bwBlock = block.closest('.bw-block');
    if (!bwBlock) return;

    // Remove existing heading classes
    bwBlock.classList.remove('h1','h2','h3','h4','p');
    bwBlock.classList.add('h' + level);

    var md = bwBlock.dataset.md || bwBlock.textContent || '';
    // Ensure # prefix matches
    md = md.replace(/^#{1,4}\s*/, '#'.repeat(level) + ' ');
    bwBlock.dataset.md = md;
    leaveEdit(bwBlock);
    enterEdit(bwBlock);

    var st = stateMap.get(bwBlock.closest('.' + NS));
    if (st) updateTOC(bwBlock.closest('.bw-doc'), st);
  }

  function cycleHeading() {
    // Cycle through h2 → h3 → h4 → p → h2
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var rng = sel.getRangeAt(0);
    var block = rng.startContainer.nodeType === 3 ? rng.startContainer.parentElement : rng.startContainer;
    var bwBlock = block ? block.closest('.bw-block') : null;
    if (!bwBlock) return;

    var levels = ['h2','h3','h4','p'];
    var curIdx = levels.findIndex(function(l) { return bwBlock.classList.contains(l); });
    if (curIdx === -1) curIdx = levels.length - 1;
    var nextLevel = levels[(curIdx + 1) % levels.length];

    bwBlock.classList.remove('h1','h2','h3','h4','p');
    bwBlock.classList.add(nextLevel);
    var md = bwBlock.dataset.md || bwBlock.textContent || '';
    if (nextLevel !== 'p' && !/^#{1,4}/.test(md)) {
      var hash = nextLevel === 'h2' ? '## ' : (nextLevel === 'h3' ? '### ' : '#### ');
      bwBlock.dataset.md = hash + md;
    } else if (nextLevel === 'p') {
      bwBlock.dataset.md = md.replace(/^#{1,4}\s*/, '');
    }
    leaveEdit(bwBlock);
    enterEdit(bwBlock);

    var st = stateMap.get(bwBlock.closest('.' + NS));
    if (st) updateTOC(bwBlock.closest('.bw-doc'), st);
  }

  function insertList(isOrdered) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var rng = sel.getRangeAt(0);
    var block = rng.startContainer.nodeType === 3 ? rng.startContainer.parentElement : rng.startContainer;
    var bwBlock = block ? block.closest('.bw-block') : null;
    if (!bwBlock) return;

    bwBlock.classList.remove('h1','h2','h3','h4','p','ul','ol','blockquote');
    bwBlock.classList.add(isOrdered ? 'ol' : 'ul');
    var md = bwBlock.dataset.md || bwBlock.textContent || '';
    bwBlock.dataset.md = (isOrdered ? '1. ' : '- ') + md.replace(/^[-*]\s+|^\d+\.\s+|^#{1,4}\s*/, '');
    leaveEdit(bwBlock);
    enterEdit(bwBlock);
  }

  function insertQuote() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var rng = sel.getRangeAt(0);
    var block = rng.startContainer.nodeType === 3 ? rng.startContainer.parentElement : rng.startContainer;
    var bwBlock = block ? block.closest('.bw-block') : null;
    if (!bwBlock) return;

    bwBlock.classList.remove('h1','h2','h3','h4','p','ul','ol');
    bwBlock.classList.add('blockquote');
    var md = bwBlock.dataset.md || bwBlock.textContent || '';
    bwBlock.dataset.md = '> ' + md.replace(/^>\s?/, '');
    leaveEdit(bwBlock);
    enterEdit(bwBlock);
  }

  function insertCode() {
    surroundSelection('`', '`');
  }

  function insertImage(fileInput) {
    fileInput.click();
  }

  function insertMathFormula() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var rng = sel.getRangeAt(0);
    var block = rng.startContainer.nodeType === 3 ? rng.startContainer.parentElement : rng.startContainer;
    var bwBlock = block ? block.closest('.bw-block') : null;
    if (!bwBlock) return;

    var emptyCard = createMathCard('');
    bwBlock.parentNode.insertBefore(emptyCard, bwBlock.nextSibling);
    expandMathCard(emptyCard);

    var st = stateMap.get(emptyCard.closest('.' + NS));
    if (st) updateTOC(emptyCard.closest('.bw-doc'), st);
  }


  /* ============================================================
   * MEDIA UPLOAD
   * ============================================================ */

  /**
   * 共享图片压缩函数（网页端与桌面桥「陶盒」均可复用）。
   * 用 canvas 将图片最长边缩放到 maxDim 以内，并按质量重编码：
   *   - 源为 PNG / WebP（可能含透明通道）→ 保持 PNG，保留透明；
   *   - 其余（JPEG / GIF 等不透明或无需透明）→ 重编码为 JPEG（先铺白底避免黑边）。
   * @param {File} file  原始图片文件
   * @param {{maxDim?:number, quality?:number}} [opts]
   * @returns {Promise<Blob>} 压缩后的图片 Blob
   */
  function bwCompressImage(file, opts) {
    opts = opts || {};
    var maxDim = (typeof opts.maxDim === 'number') ? opts.maxDim : 1600;
    var quality = (typeof opts.quality === 'number') ? opts.quality : 0.82;

    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('bwCompressImage: 传入的不是图片文件'));
        return;
      }
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) { reject(new Error('bwCompressImage: 无法读取图片尺寸')); return; }
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));

        var canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        var ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('bwCompressImage: 当前环境不支持 canvas 2d')); return; }

        // 透明来源（PNG / WebP）保持 PNG；其余走 JPEG 并先铺白底。
        var keepPng = file.type === 'image/png' || file.type === 'image/webp';
        var mime = keepPng ? 'image/png' : 'image/jpeg';
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, tw, th);
        }
        ctx.drawImage(img, 0, 0, tw, th);

        if (mime === 'image/png') {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(new Error('bwCompressImage: PNG 编码失败'));
          }, 'image/png');
        } else {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(new Error('bwCompressImage: JPEG 编码失败'));
          }, 'image/jpeg', quality);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('bwCompressImage: 图片解码失败'));
      };
      img.src = objectUrl;
    });
  }
  if (typeof window !== 'undefined') window.bwCompressImage = bwCompressImage;

  /** Blob → dataURL（FileReader.readAsDataURL） */
  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('blobToDataURL: 读取失败')); };
      fr.readAsDataURL(blob);
    });
  }

  /**
   * 图片插入统一出口。拖拽 / 文件选择 / 粘贴 三处均调用本函数，保证行为一致。
   *  - 单文件形式  handleFileUpload(file) → Promise<string url>
   *    仅做「压缩 + 转 dataURL」，返回图片 URL（不在此插入，插入由调用方统一处理）。
   *  - 分发形式    handleFileUpload(host, files)
   *    遍历文件：配置了后端 mediaUrl 时走原 fetch 上传；否则网页端走
   *    「压缩 → dataURL → 插入」，返回插入的 URL 数组。
   */
  function handleFileUpload(hostOrFile, files) {
    // 统一出口：单文件形式 → 返回 dataURL（不在此插入）
    if (hostOrFile instanceof File) {
      return bwCompressImage(hostOrFile, { maxDim: 1600, quality: 0.82 })
        .then(blobToDataURL)
        .catch(function (err) {
          console.error('[BW Editor] 图片处理失败:', err);
          throw err;
        });
    }

    // 分发形式：host + FileList
    var host = hostOrFile;
    var st = stateMap.get(host);
    if (!st) return Promise.resolve([]);

    var list = Array.from(files || []).filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });
    if (!list.length) {
      if (files && files.length) bwToast(host, '仅支持插入图片文件', { type: 'warn' });
      return Promise.resolve([]);
    }

    // 桌面 / 后端上传路径（data-media-upload-url 已配置时；陶盒桥会整体接管本函数）
    if (st.mediaUrl) {
      return Promise.all(list.map(function (file) {
        var fd = new FormData();
        fd.append('file', file);
        return fetch(st.mediaUrl, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: fd
        })
        .then(function (r) { if (!r.ok) throw r; return r.json(); })
        .then(function (data) {
          if (data && data.url) {
            insertImageMarkdown(data.url, file.name.replace(/\.[^.]+$/, ''), host);
            return data.url;
          }
          throw new Error('上传响应缺少 url');
        });
      })).catch(function (err) {
        console.error('[BW Editor] Upload error:', err);
        bwToast(host, '图片上传失败，请重试', { type: 'error' });
        return [];
      });
    }

    // 网页端路径：压缩 → dataURL → 直接插入（自包含、可随 markdown 持久）
    return Promise.all(list.map(function (file) {
      return bwCompressImage(file, { maxDim: 1600, quality: 0.82 })
        .then(blobToDataURL)
        .then(function (url) {
          insertImageMarkdown(url, file.name.replace(/\.[^.]+$/, ''), host);
          return url;
        });
    })).catch(function (err) {
      console.error('[BW Editor] 图片插入失败:', err);
      bwToast(host, '图片插入失败，请重试', { type: 'error' });
      return [];
    });
  }

  /* ============================================================
   * IMAGE ALIGNMENT (left / center / right)
   * 对齐信息编码进图片 URL 的 #bw-align-<side> 片段：
   *   - 浏览器 / Markdown 渲染忽略该片段，图片正常显示，屏幕无残留文本；
   *   - 序列化（导出 / 源码 / 撤销快照）经 canonical JSON 读 dataset.align，
   *     由 canonicalToMarkdown 把片段写回 src，可无损往返；
   *   - 文档重新加载时 buildDoc 解析片段还原对齐，跨刷新 / 切换文档持久。
   * 所有入口（上传、白板导出、顶栏按钮）统一走 bwSetImageAlign。
   * ============================================================ */
  function bwParseAlignFromSrc(src) {
    var m = ('' + (src || '')).match(/(.*?)(#bw-align-(left|center|right))?$/);
    if (!m) return { src: src || '', align: null };
    return { src: m[1], align: m[3] || null };
  }
  function bwWithAlignSrc(src, align) {
    var p = bwParseAlignFromSrc(src);
    var clean = p.src;
    if (align && align !== 'center') return clean + '#bw-align-' + align;
    return clean;
  }
  function bwSetImageAlign(block, align) {
    if (!block || !block.classList.contains('bw-block')) return;
    align = (align === 'left' || align === 'right' || align === 'center') ? align : 'center';
    block.dataset.align = align;
    block.classList.remove('align-left', 'align-center', 'align-right');
    block.classList.add('align-' + align);
    // 图片块：把对齐信息编码进图片 URL 片段（跨刷新持久）
    if (block.classList.contains('img')) {
      var md = block.dataset.md || '';
      var mm = md.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (mm) {
        var alt = mm[1];
        block.dataset.md = '![' + alt + '](' + bwWithAlignSrc(mm[2], align) + ')';
      }
      var img = block.querySelector('.bw-img-wrap > img') || block.querySelector('img');
      if (img && mm) {
        var cur = img.getAttribute('src') || '';
        img.setAttribute('src', bwWithAlignSrc(cur, align));
      }
    }
    if (typeof markDirty === 'function') markDirty(block);
  }
  if (typeof window !== 'undefined') { window.bwSetImageAlign = bwSetImageAlign; window.bwSetBlockAlign = bwSetImageAlign; }

  function insertImageMarkdown(url, alt, host, align) {
    var docEl = $('.bw-doc', host);
    if (!docEl) return;
    var imgBlock = document.createElement('div');
    imgBlock.className = 'bw-block img';
    imgBlock.dataset.md = '![' + (alt || '') + '](' + url + ')';
    imgBlock.innerHTML = bwImageWrapHtml(url, alt);
    if (typeof window !== 'undefined') window.__bwLastImageBlock = imgBlock;
    if (typeof bwSetImageAlign === 'function') bwSetImageAlign(imgBlock, align || 'center');

    // Insert after current focused block
    var sel = window.getSelection();
    var refBlock = null;
    if (sel.rangeCount) refBlock = (sel.getRangeAt(0).startContainer.parentElement || {}).closest('.bw-block');
    if (!refBlock) refBlock = docEl.lastElementChild;
    if (refBlock) refBlock.parentNode.insertBefore(imgBlock, refBlock.nextSibling);
    else docEl.appendChild(imgBlock);

    markDirty(imgBlock);
    ensureTrailingEmptyBlock(docEl);
    var stI = stateMap.get(host);
    if (stI) pushUndo(host, stI);
  }


  /* ============================================================
   * IMAGE DELETE (event-delegated, bound once)
   * 点击图片右上角 × 删除该图片：
   *   - 块级图片（.bw-block.img）：直接移除整块并收尾；
   *   - 行内图片（段落内 .bw-img-wrap）：从 block.dataset.md 移除
   *     对应的 ![alt](src) 片段后重渲染该块。
   * 删除逻辑只此一处，通过 document 委托，避免重复绑定。
   * ============================================================ */
  function escapeRegex(s) {
    return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function bwHandleImageDelete(e) {
    var del = e.target && e.target.closest ? e.target.closest('.bw-img-del') : null;
    if (!del) return;
    e.stopPropagation();
    e.preventDefault();

    var wrap = del.closest('.bw-img-wrap');
    if (!wrap) return;
    var block = wrap.closest('.bw-block');
    if (!block) return;

    var host = block.closest('.' + NS);
    var st = host ? stateMap.get(host) : null;
    var docEl = block.closest('.bw-doc');

    if (block.classList.contains('img')) {
      // 块级图片：整块删除（先标脏，因为 markDirty 需 block 仍在 DOM 内定位 host）
      markDirty(block);
      block.remove();
      if (host) pushUndo(host, st);
      if (docEl) ensureTrailingEmptyBlock(docEl);
      return;
    }

    // 行内图片：从 markdown 源移除对应 ![alt](src)（含可选 title）并重渲染
    var img = wrap.querySelector('img');
    var src = img ? (img.getAttribute('src') || '') : '';
    var alt = img ? (img.getAttribute('alt') || '') : '';
    if (src) {
      var re = new RegExp(
        '!\\[' + escapeRegex(alt) + '\\]\\(' + escapeRegex(src) + '(?:\\s+"[^"]*")?\\)', 'g');
      var md = (block.dataset.md || '').replace(re, '').replace(/[ \t]{2,}/g, ' ').trim();
      block.dataset.md = md;
    }
    markDirty(block);
    renderBlock(block, block.dataset.md || '');
    if (host) pushUndo(host, st);
  }

  if (typeof document !== 'undefined' && !window.__bwImageDeleteBound) {
    window.__bwImageDeleteBound = true;
    document.addEventListener('click', bwHandleImageDelete);
  }

