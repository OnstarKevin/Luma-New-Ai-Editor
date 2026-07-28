/**
 * Luma — 文档模型：Markdown <-> 块 双向解析（canonicalToMarkdown / buildDoc / getCanonicalJson）
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * CANONICAL JSON ↔ MARKDOWN CONVERTERS
   * ============================================================ */

  /** Convert CanonicalJson node tree to markdown lines */
  function canonicalToMarkdown(node) {
    var lines = [];
    appendNode(node, lines);
    return lines.join('\n');
  }

  function appendNode(node, lines) {
    switch (node.type) {
      case 'doc':
        (node.content || []).forEach(function (c) { appendNode(c, lines); });
        break;
      case 'paragraph':
        lines.push(inlineChildrenToMd(node.content || []));
        break;
      case 'heading': {
        var prefix = '#'.repeat(node.attrs && node.attrs.level ? Math.min(node.attrs.level, 6) : 1) + ' ';
        lines.push(prefix + inlineChildrenToMd(node.content || []));
        break;
      }
      case 'blockquote':
        (node.content || []).forEach(function (c) { lines.push('> ' + inlineNodeToMd(c)); });
        break;
      case 'bulletList':
        (node.content || []).forEach(function (item) {
          (item.content || []).forEach(function (c) { lines.push('- ' + inlineNodeToMd(c)); });
        });
        break;
      case 'orderedList':
        (node.content || []).forEach(function (item, i) {
          (item.content || []).forEach(function (c) { lines.push((i + 1) + '. ' + inlineNodeToMd(c)); });
        });
        break;
      case 'codeBlock': {
        var codeText = node.textContent || (node.content && node.content[0] && node.content[0].text) || '';
        var codeLang = node.language || (node.attrs && node.attrs.language) || '';
        lines.push('```' + codeLang + '\n' + codeText + '\n```');
        break;
      }
      case 'blockMath':
        lines.push('$$\n' + extractMathTex(node) + '\n$$');
        break;
      case 'image': {
        var alt = (node.attrs && node.attrs.alt) || '';
        var src = (node.attrs && node.attrs.src) || '';
        var al = (node.attrs && node.attrs.align) || 'center';
        if (al && al !== 'center') src = src + '#bw-align-' + al;
        lines.push('![' + escapeHtml(alt) + '](' + src + ')');
        break;
      }
      case 'horizontalRule':
        lines.push('---');
        break;
    }
  }

  function extractTexFromNode(node) {
    if (!node) return '';
    if (node.type === 'blockMath') return extractMathTex(node);
    if (node.type === 'math') return (node.textContent || '');
    return '';
  }

  function extractMathTex(node) {
    if (node.content && node.content.length) {
      var n = node.content[0];
      if (n && n.type === 'rawLatex') return (n.source != null ? n.source : n.textContent) || '';
    }
    return (node.textContent || '');
  }

  function inlineNodeToMd(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    switch (node.type) {
      case 'paragraph': case 'heading': return inlineChildrenToMd(node.content || []);
      case 'text': return (node.text || '').replace(RE_ZW, '');
      case 'hardBreak': return '\n';
      default: return inlineChildrenToMd(node.content || []);
    }
  }

  function inlineChildrenToMd(children) {
    if (!children) return '';
    var out = '';
    children.forEach(function (n) {
      if (n.type === 'text') { out += (n.text || '').replace(RE_ZW, ''); return; }
      if (n.type === 'hardBreak') { out += '\n'; return; }
      if (n.type === 'inlineCode') { out += '`' + (n.textContent || '') + '`'; return; }
      if (n.type === 'strong') { out += '**' + inlineChildrenToMd(n.content || []) + '**'; return; }
      if (n.type === 'em') { out += '*' + inlineChildrenToMd(n.content || []) + '*'; return; }
      if (n.type === 'strike') { out += '~~' + inlineChildrenToMd(n.content || []) + '~~'; return; }
      if (n.type === 'link') {
        var href = (n.attrs && n.attrs.href) || '';
        out += '[' + inlineChildrenToMd(n.content || []) + '](' + href + ')';
        return;
      }
      if (n.type === 'math') { out += '$' + (n.textContent || '') + '$'; return; }
      if (n.type === 'image') {
        var alt = (n.attrs && n.attrs.alt) || '';
        var src = (n.attrs && n.attrs.src) || '';
        out += '![' + alt + '](' + src + ')';
        return;
      }
      if (n.content) { out += inlineChildrenToMd(n.content); }
    });
    return out;
  }


  /* ============================================================
   * BUILD DOCUMENT FROM MARKDOWN
   * ============================================================ */
  function buildDoc(md, contentEl, st) {
    contentEl.innerHTML = '';

    // Split into blocks: $$ fences are special
    var rawLines = md.split('\n');
    var blocks = [];
    var i = 0;
    while (i < rawLines.length) {
      var line = rawLines[i];
      // Single-line display math:  $$ ... $$  (e.g. pasted from elsewhere on one line)
      var singleMath = line.match(/^\s*\$\$([\s\S]+?)\$\$\s*$/);
      if (singleMath) {
        blocks.push({ type: 'math', tex: singleMath[1].trim() });
        i++;
      } else if (/^\s*\$\$/.test(line)) {
        var texLines = [];
        i++;
        while (i < rawLines.length && !/^\s*\$\$\s*$/.test(rawLines[i])) {
          texLines.push(rawLines[i]);
          i++;
        }
        if (i < rawLines.length) i++; // skip closing $$
        blocks.push({ type: 'math', tex: texLines.join('\n').trim() });
      } else if (/^```/.test(line)) {
        var codeLines = [];
        var langMatch = line.match(/^```\w*/);
        i++;
        while (i < rawLines.length && !/^```\s*$/.test(rawLines[i])) {
          codeLines.push(rawLines[i]);
          i++;
        }
        if (i < rawLines.length) i++; // skip closing ```
        blocks.push({ type: 'code', text: codeLines.join('\n'), lang: langMatch ? langMatch[0].replace('```', '') : '' });
      } else if (line.trim() === '' || line.trim() === '---') {
        if (line.trim() === '---') blocks.push({ type: 'hr' });
        else blocks.push({ type: 'empty' });
        i++;
      } else if (/^!\[([^\]]*)\]\((.+?)(?:#bw-align-(left|center|right))?\)$/.test(line)) {
        // Standalone image block (may carry #bw-align-<side> alignment fragment)
        blocks.push({ type: 'image', text: line });
        i++;
      } else if (/^#{1,6}\s+/.test(line) || /^[*-]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^>\s?/.test(line.trim())) {
        // Heading / list item / blockquote: own single-line block, do NOT merge with following text
        blocks.push({ type: 'para', text: line });
        i++;
      } else {
        var paraLines = [line];
        i++;
        while (i < rawLines.length && rawLines[i].trim() !== '' &&
               !/^\s*\$\$/.test(rawLines[i]) &&
               !/^```/.test(rawLines[i]) &&
               !/^#{1,6}\s+/.test(rawLines[i]) &&
               !/^[*-]\s+/.test(rawLines[i]) &&
               !/^\d+\.\s+/.test(rawLines[i]) &&
               !/^>\s?/.test(rawLines[i]) &&
               rawLines[i].trim() !== '---') {
          paraLines.push(rawLines[i]);
          i++;
        }
        blocks.push({ type: 'para', text: paraLines.join('\n') });
      }
    }

    // Create DOM elements
    blocks.forEach(function (blk) {
      var el;
      if (blk.type === 'math') {
        el = createMathCard(blk.tex);
      } else if (blk.type === 'code') {
        el = document.createElement('div');
        el.className = 'bw-block code';
        el.dataset.md = '```' + (blk.lang || '') + '\n' + blk.text + '\n```';
        el.dataset.lang = blk.lang || '';
        // Build code block with language label and code
        el.innerHTML = '<div class="bw-code-header"><span class="bw-code-lang">' + escapeHtml(blk.lang || 'plain') + '</span></div><pre><code class="language-' + escapeHtml(blk.lang || 'plain') + '">' + escapeHtml(blk.text) + '</code></pre>';
        // Apply syntax highlighting if available
        applyHighlight(el);
        makeEditable(el);
      } else if (blk.type === 'hr') {
        el = document.createElement('div');
        el.className = 'bw-block hr';
        el.dataset.md = '---';
        el.innerHTML = '<hr>';
      } else if (blk.type === 'image') {
        var im = (blk.text || '').match(/^!\[([^\]]*)\]\((.+?)(?:#bw-align-(left|center|right))?\)$/);
        var imAlt = im ? im[1] : '';
        var imSrc = im ? im[2] : '';
        var imAlign = (im && im[3]) ? im[3] : 'center';
        el = document.createElement('div');
        el.className = 'bw-block img align-' + imAlign;
        el.dataset.md = blk.text;       // 含 #bw-align- 片段，序列化可无损往返
        el.dataset.align = imAlign;
        el.innerHTML = bwImageWrapHtml(imSrc, imAlt);
      } else if (blk.type === 'empty') {
        el = document.createElement('div');
        el.className = 'bw-block p';
        el.dataset.md = '';
        el.innerHTML = '&nbsp;';
        makeEditable(el);
      } else {
        el = document.createElement('div');
        // Detect block type from markdown prefix
        var mdText = blk.text || '';
        if (/^#\s+/.test(mdText)) { el.className = 'bw-block h1'; }
        else if (/^#{2}\s+/.test(mdText)) { el.className = 'bw-block h2'; }
        else if (/^#{3}\s+/.test(mdText)) { el.className = 'bw-block h3'; }
        else if (/^#{4}\s+/.test(mdText)) { el.className = 'bw-block h4'; }
        else if (/>/.test(mdText)) { el.className = 'bw-block blockquote'; }
        else if (/^[*-]\s+/.test(mdText)) { el.className = 'bw-block ul'; }
        else if (/^\d+\.\s+/.test(mdText)) { el.className = 'bw-block ol'; }
        else { el.className = 'bw-block p'; }
        el.dataset.md = blk.text;
        renderBlock(el, blk.text);
        makeEditable(el);
      }
      contentEl.appendChild(el);
    });

    // Mark blocks that contain markdown/KaTeX syntax for visual indicator
    $$('.bw-block', contentEl).forEach(function (blk) {
      updateMarkdownIndicator(blk);
    });

    updateTOC(contentEl, st);
    // Always end with a blank line so the caret can move below any block
    ensureTrailingEmptyBlock(contentEl);
  }


  /* ============================================================
   * TRAILING EMPTY BLOCK (Typora-style blank line at the end)
   * ============================================================ */
  function createEmptyBlock() {
    var nb = document.createElement('div');
    nb.className = 'bw-block p bw-empty-hint';
    nb.dataset.md = '';
    nb.setAttribute('data-placeholder', '开始输入 Markdown…');
    nb.innerHTML = '&nbsp;';
    makeEditable(nb);
    return nb;
  }

  function ensureTrailingEmptyBlock(docEl) {
    if (!docEl) return;
    var blocks = Array.from(docEl.querySelectorAll('.bw-block'));
    if (!blocks.length) {
      docEl.appendChild(createEmptyBlock());
      return;
    }
    var last = blocks[blocks.length - 1];
    var isEmptyP = last.classList.contains('p') &&
                   !last.classList.contains('bw-math-card') &&
                   (last.dataset.md || '').trim() === '' &&
                   (last.textContent || '').replace(/ /g, '').trim() === '';
    if (!isEmptyP) {
      docEl.appendChild(createEmptyBlock());
    }
  }


  /* ============================================================
   * CANONICAL JSON OUTPUT
   * ============================================================ */
  function getCanonicalJson(host) {
    var st = stateMap.get(host);
    var titleEl = $('#bwTitleInput');
    var title = titleEl ? (titleEl.value || titleEl.textContent || '').trim() : (st.title || '');
    var docEl = $('.bw-doc', host);
    if (!docEl) return { type: 'doc', content: [] };

    var content = [];

    // Add title as heading
    if (title) {
      content.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] });
    }

    // Process body blocks
    var blocks = $$('.bw-block, .bw-math-card', docEl);
    blocks.forEach(function (block) {
      if (block.classList.contains('bw-math-card')) {
        var tex = block.dataset.tex || '';
        var src = $('.bw-math-src', block);
        if (src && block.classList.contains('expanded')) tex = src.value.trim();
        if (tex) {
          content.push({
            type: 'blockMath',
            content: [{ type: 'rawLatex', source: tex }]
          });
        }
        return;
      }

      var md = block.dataset.md || (block.textContent || '').trim();

      if (block.classList.contains('hr') || md === '---') {
        content.push({ type: 'horizontalRule' }); return;
      }
      if (block.classList.contains('code')) {
        var ct = (md.match(/```\w*\n([\s\S]*)\n```/) || [null, md])[1] || md;
        content.push({ type: 'codeBlock', language: (block.dataset.lang || ''), textContent: ct }); return;
      }

      // Detect heading from rendered class or markdown prefix
      var h1m = md.match(/^#\s+(.*)/);
      var h2m = md.match(/^#{2}\s+(.*)/);
      var h3m = md.match(/^#{3}\s+(.*)/);
      var h4m = md.match(/^#{4}\s+(.*)/);

      if (h1m) {
        content.push({ type: 'heading', attrs: { level: 1 }, content: inlineFromMarkdown(h1m[1]) }); return;
      }
      if (h2m) {
        content.push({ type: 'heading', attrs: { level: 2 }, content: inlineFromMarkdown(h2m[1]) }); return;
      }
      if (h3m) {
        content.push({ type: 'heading', attrs: { level: 3 }, content: inlineFromMarkdown(h3m[1]) }); return;
      }
      if (h4m) {
        content.push({ type: 'heading', attrs: { level: 4 }, content: inlineFromMarkdown(h4m[1]) }); return;
      }

      // Quote
      if (/^>/.test(md)) {
        var qtext = md.replace(/^>\s?/, '');
        content.push({ type: 'blockquote', content: [{ type: 'paragraph', content: inlineFromMarkdown(qtext) }] }); return;
      }

      // Unordered list
      if (/^[*-]\s+/.test(md)) {
        var liText = md.replace(/^[*-]\s+/, '');
        content.push({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: inlineFromMarkdown(liText) }] }] }); return;
      }

      // Ordered list
      var olm = md.match(/^\d+\.\s+(.*)/);
      if (olm) {
        content.push({ type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: inlineFromMarkdown(olm[1]) }] }] }); return;
      }

      // Image
      var imgM = md.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgM) {
        var rawSrc = imgM[2];
        var imgAlign = block.dataset.align || null;
        var fragM = rawSrc.match(/#bw-align-(left|center|right)$/);
        if (fragM) { imgAlign = fragM[1]; rawSrc = rawSrc.replace(/#bw-align-(left|center|right)$/, ''); }
        if (!imgAlign) imgAlign = 'center';
        content.push({ type: 'image', attrs: { alt: imgM[1], src: rawSrc, align: imgAlign } }); return;
      }

      // Normal paragraph
      if (md.trim()) {
        content.push({ type: 'paragraph', content: inlineFromMarkdown(md) });
      }
    });

    return { type: 'doc', content: content };
  }

  function inlineFromMarkdown(text) {
    var nodes = [];
    // Simple parser for inline elements
    var pos = 0;
    while (pos < text.length) {
      // bold **...**
      var bm = text.substring(pos).match(/^\*\*(.+?)\*\*/);
      if (bm) { nodes.push({ type: 'strong', content: [{ type: 'text', text: bm[1] }] }); pos += bm[0].length; continue; }
      // italic *...*
      var im = text.substring(pos).match(/^\*([^*]+)\*/);
      if (im) { nodes.push({ type: 'em', content: [{ type: 'text', text: im[1] }] }); pos += im[0].length; continue; }
      // strike ~~...~~
      var sm = text.substring(pos).match(/^~~(.+?)~~/);
      if (sm) { nodes.push({ type: 'strike', content: [{ type: 'text', text: sm[1] }] }); pos += sm[0].length; continue; }
      // inline code `...`
      var cm = text.substring(pos).match(/^`([^`]+)`/);
      if (cm) { nodes.push({ type: 'inlineCode', textContent: cm[1] }); pos += cm[0].length; continue; }
      // link [...](...)
      var lm = text.substring(pos).match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (lm) { nodes.push({ type: 'link', attrs: { href: lm[2] }, content: [{ type: 'text', text: lm[1] }] }); pos += lm[0].length; continue; }
      // inline math $...$
      var mm = text.substring(pos).match(/^\$([^$\n]+?)\$/);
      if (mm) { nodes.push({ type: 'math', textContent: mm[1] }); pos += mm[0].length; continue; }

      // plain text until next special char
      var nextSpecial = text.substring(pos).search(/[*_~\[\]$`]/);
      if (nextSpecial === -1) { nodes.push({ type: 'text', text: text.substring(pos) }); break; }
      if (nextSpecial > 0) { nodes.push({ type: 'text', text: text.substring(pos, pos + nextSpecial) }); pos += nextSpecial; }
      else { nodes.push({ type: 'text', text: text[pos] }); pos++; }
    }
    return nodes.length ? nodes : [{ type: 'text', text: '' }];
  }

