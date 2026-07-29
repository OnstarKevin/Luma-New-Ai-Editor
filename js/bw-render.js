/**
 * Luma — 渲染引擎：Markdown 检测、行内/块渲染、KaTeX、HTML 块安全渲染
 * 本文件由单文件编辑器按功能拆分而来；所有函数为全局声明，
 * 通过 <script defer> 按 index.html 中的顺序共享全局作用域。
 */
'use strict';

  /* ============================================================
   * MARKDOWN / KaTeX DETECTION for visual indicators
   * ============================================================ */
  // 已知 HTML 标签白名单：用于区分「真正的 HTML 片段」与 markdown 自动链接
  // <https://...> / <email>（其标签名 https/mailto 不在白名单，避免被误渲染）。
  var HTML_TAGS = /^(a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|blockquote|br|button|canvas|caption|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|h1|h2|h3|h4|h5|h6|head|header|hgroup|hr|i|iframe|img|input|ins|kbd|label|legend|li|link|main|map|mark|menu|meta|meter|nav|noscript|object|ol|optgroup|option|output|p|param|picture|portal|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|small|source|span|strong|style|sub|summary|sup|svg|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|u|ul|var|video|wbr|path|circle|rect|line|g|polygon|polyline|ellipse|text|defs|linearGradient|stop|use)$/i;
  function detectMarkdownSyntax(text) {
    if (!text) return null;
    // Block-level
    if (/^#{1,4}\s+/.test(text)) return 'heading';
    if (/^>\s?/.test(text)) return 'quote';
    if (/^[*-]\s+/.test(text)) return 'list';
    if (/^\d+\.\s+/.test(text)) return 'list';
    if (/^---+$/.test(text)) return 'hr';
    if (/^```/.test(text)) return 'code';
    // KaTeX
    if (/^\$\$[\s\S]*?\$\$$/.test(text)) return 'math';
    if (/\$[^$]+\$/.test(text)) return 'math';
    // HTML 片段：自动检测并渲染（标签语法优先于纯文本格式）
    // HTML 片段：仅当含「已知 HTML 标签」时才自动渲染，避免把 markdown 自动链接
    // <https://...> / <email> 误判为 HTML 标签（否则链接会退化为纯文本）。
    if (/<([a-zA-Z][\w-]*)(?:\s[^<>]*?)?\/?>|<\/([a-zA-Z][\w-]*)>/.test(text)) {
      var _tags = text.match(/<\/?([a-zA-Z][\w-]*)/g) || [];
      for (var _i = 0; _i < _tags.length; _i++) {
        var _name = _tags[_i].replace(/[<\/\s]/g, '');
        if (HTML_TAGS.test(_name)) return 'html';
      }
    }
    // Inline formatting
    if (/\*\*[^*]+\*\*/.test(text)) return 'format';
    if (/_[^_]+_/.test(text)) return 'format';
    if (/\*[^*]+\*/.test(text)) return 'format';
    if (/~~.+?~~/.test(text)) return 'format';
    if (/`[^`]+`/.test(text)) return 'format';
    if (/\[.+\]\(.+\)/.test(text)) return 'format';
    return null;
  }

  function updateMarkdownIndicator(block) {
    var md = block.dataset.md || block.textContent || '';
    var detected = detectMarkdownSyntax(md);
    block.classList.remove('has-markdown', 'has-math', 'has-format');
    if (detected === 'math') block.classList.add('has-math');
    else if (detected) block.classList.add('has-markdown');
  }

  // 实时刷新编辑态左侧竖线颜色：仅当「当前行/块」确实含特殊语法时才变绿
  // （KaTeX、# 标题、> 引用、- 列表、``` 代码、粗斜体/删除线/行内码/链接等）。
  // 普通行保持中性（非绿）。读取的是「正在输入」的 block.textContent，
  // 而不是失焦后才更新的 dataset.md，因此逐字打字即可实时翻转，无需等到换行/失焦。
  function refreshSpecialLine(block) {
    if (!block.classList.contains('editing')) return; // 仅编辑态有意义
    var live = block.textContent || '';
    var detected = detectMarkdownSyntax(live);
    block.classList.remove('has-markdown', 'has-math', 'has-format');
    if (detected === 'math') block.classList.add('has-math');
    else if (detected) block.classList.add('has-markdown');
  }

  // 编辑态实时预览：仅在 KaTeX 数学公式时生效（$...$ / $$...$$）。
  // 不破坏 contenteditable 光标，仅作为一个只读预览附属元素（非 .bw-block）。
  function removeLivePreview(block) {
    if (block._livePreview) {
      if (block._livePreview.parentNode) block._livePreview.parentNode.removeChild(block._livePreview);
      block._livePreview = null;
    }
  }
  function updateLivePreview(block) {
    if (!block.classList.contains('editing')) return;
    var md = (block.textContent || block.dataset.md || '').replace(/\s+$/, '');
    // 仅 KaTeX 公式触发预览：检查是否含 $...$ 或 $$...$$ 语法
    var hasMath = /\$[^$]+\$/.test(md) || /\$\$[\s\S]*?\$\$/.test(md);
    if (!hasMath) { removeLivePreview(block); return; }
    var preview = block._livePreview || null;
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'bw-inline-preview';
      block.parentNode.insertBefore(preview, block.nextSibling);
      block._livePreview = preview;
    }
    preview.innerHTML = mdToRenderedHtml(md);
  }


  /* ============================================================
   * SYNTAX HIGHLIGHTING (via highlight.js)
   * ============================================================ */
  function applyHighlight(block) {
    var codeEl = block.querySelector('code');
    if (!codeEl) return;
    // Set language class for highlight.js
    var lang = block.dataset.lang || '';
    if (lang) codeEl.className = 'language-' + lang;
    // Use highlight.js if loaded
    try {
      if (typeof hljs !== 'undefined' && hljs.highlightElement) {
        hljs.highlightElement(codeEl);
      }
    } catch (_) {}
  }


  /* ============================================================
   * BLOCK RENDERING (cursor away → rich render)
   * ============================================================ */
  // Strip leading/trailing ``` fences (and the optional language token) from a
  // code-block markdown string so the rendered body shows only the source
  // code, never the fence characters. Code blocks are stored with fences intact
  // (dataset.md) and edited without them, so the rendered text can arrive
  // either way — this normalises both before display.
  function stripCodeFences(md) {
    if (md == null) return '';
    var s = '' + md;
    var m = s.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    return m ? m[1] : s;
  }

  function renderBlock(block, md) {
    // Horizontal rule
    if (/^---+$/.test((md || '').trim())) {
      block.innerHTML = '<hr>';
      return;
    }
    // Code blocks: preserve pre/code structure with highlighting
    if (block.classList.contains('code')) {
      var lang = block.dataset.lang || '';
      var codeText = stripCodeFences(md);
      var numberedLines = codeText.split('\n').map(function (l) { return '<span class="bw-code-line">' + escapeHtml(l || ' ') + '</span>'; }).join('\n');
      block.innerHTML =
        '<div class="bw-code-header">' +
          '<span class="bw-code-lang">' + escapeHtml(lang || 'code') + '</span>' +
          '<button class="bw-code-copy-btn" type="button" onclick="bwCopyCode(this)" title="复制代码">复制</button>' +
        '</div>' +
        '<pre><code class="language-' + escapeHtml(lang || 'plain') + '">' + numberedLines + '</code></pre>';
      applyHighlight(block);
      return;
    }
    // HTML 片段：自动检测并渲染（安全过滤后注入）
    if (detectMarkdownSyntax(md) === 'html') {
      renderHtmlBlock(block, md);
      return;
    }
    var html = mdToRenderedHtml(md);
    block.innerHTML = html;
  }

  function mdToRenderedHtml(md) {
    var s = md || '';
    // Block detection（仅判断块类型，内容交由 markdown-it 渲染，界面保持不变）
    var isH1 = /^#{1}\s+/;
    var isH2 = /^#{2}\s+/;
    var isH3 = /^#{3}\s+/;
    var isH4 = /^#{4}\s+/;
    var isQuote = /^>\s?/;

    if (isH1.test(s)) {
      return '<span class="bw-rendered">' + renderRichInline(s.replace(/^#+\s+/, '')) + '</span>';
    }
    if (isH2.test(s)) {
      return '<span class="bw-rendered">' + renderRichInline(s.replace(/^#{2}\s+/, '')) + '</span>';
    }
    if (isH3.test(s)) {
      return '<span class="bw-rendered">' + renderRichInline(s.replace(/^#{3}\s+/, '')) + '</span>';
    }
    if (isH4.test(s)) {
      return '<span class="bw-rendered">' + renderRichInline(s.replace(/^#{4}\s+/, '')) + '</span>';
    }
    if (isQuote.test(s)) {
      return '<span class="bw-quote-text">' + renderRichInline(s.replace(/^>\s?/, '')) + '</span>';
    }
    if (/^---+$/.test(s.trim())) {
      return '<hr>';
    }

    return '<span class="bw-rendered">' + renderPlainParagraph(s) + '</span>';
  }

  var MD = null;
  function getMD() {
    if (MD) return MD;
    try {
      if (typeof window.markdownit !== 'undefined') {
        MD = window.markdownit({ html: false, linkify: true, typographer: true, breaks: false });
        // 图片渲染：包裹 .bw-img-wrap + 删除按钮，统一删除逻辑见 bw-insert.js
        MD.renderer.rules.image = function (tokens, idx, options, env, self) {
          var imgTag = self.renderToken(tokens, idx, options);
          return '<span class="bw-img-wrap">' + imgTag +
            '<button class="bw-img-del" type="button" contenteditable="false" ' +
            'aria-label="删除图片" title="删除图片">' + BW_IMG_DEL_SVG + '</button>' +
            '</span>';
        };
      }
    } catch (_) {}
    return MD;
  }

  // 用占位符保护 $...$ / $$...$$，交给 markdown-it 渲染其余内容后再用 KaTeX 还原
  function protectMath(src) {
    var store = [];
    src = src.replace(/\$\$([\s\S]+?)\$\$/g, function (_, t) {
      store.push({ disp: true, tex: t.trim() }); return '@@BWMDMATH' + (store.length - 1) + '@@';
    });
    src = src.replace(/\$([^\$\n]+?)\$/g, function (_, t) {
      store.push({ disp: false, tex: t.trim() }); return '@@BWMDMATH' + (store.length - 1) + '@@';
    });
    return { md: src, store: store };
  }
  function restoreMath(html, store) {
    return html.replace(/@@BWMDMATH(\d+)@@/g, function (_, i) {
      var it = store[+i];
      if (!it) return '';
      return katexToHtml(it.tex, it.disp);
    });
  }

  // 行内富渲染：优先 markdown-it，失败回退旧正则逻辑（renderInlineLegacy）
  function renderRichInline(raw) {
    var md = getMD();
    var html;
    if (md) {
      try {
        var prot = protectMath(raw || '');
        html = md.renderInline(prot.md);
        html = restoreMath(html, prot.store);
      } catch (_) { html = renderInlineLegacy(raw || ''); }
    } else { html = renderInlineLegacy(raw || ''); }
    // Footnote references
    if (typeof renderFootnotedText === 'function') html = renderFootnotedText(html);
    return html;
  }

  // 普通段落：把软换行（单个 \n）渲染成 <br>，使粘贴的含换行纯文本保留换行，
  // 而不是被 markdown-it 在 breaks:false 下压成空格。仍为单一块、行与行连通。
  function renderPlainParagraph(md) {
    var s = (md || '').replace(/\r\n/g, '\n');
    // 去掉首尾换行，避免粘贴文本首尾带的空行变成多余空行
    s = s.replace(/^\n+/, '').replace(/\n+$/, '');
    var prot = protectMath(s);
    // CommonMark 硬换行 = 行尾两个空格 + 换行；把普通段落内的 \n 变成硬换行
    var withBreaks = prot.md.replace(/\n/g, '  \n');
    var engine = getMD();
    if (engine) {
      try {
        var html = engine.renderInline(withBreaks);
        return restoreMath(html, prot.store);
      } catch (_) { /* 落到兜底 */ }
    }
    return renderInlineLegacy(s);
  }

  /* ============================================================
   * IMAGE WRAP + DELETE BUTTON (shared by all render paths)
   * 每张图片统一包一层 .bw-img-wrap（position:relative），
   * 右上角浮一个 .bw-img-del 的 × 按钮（SVG 轮廓，默认隐藏，hover 浮现）。
   * 块级 / 行内 / 编辑态 / 重载态全部复用同一结构，删除逻辑集中在 bw-insert.js。
   * ============================================================ */
  var BW_IMG_DEL_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M4 4 L12 12"/><path d="M12 4 L4 12"/></svg>';

  function bwImageWrapHtml(src, alt) {
    return '<span class="bw-img-wrap">' +
      '<img src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt || '') + '">' +
      '<button class="bw-img-del" type="button" contenteditable="false" ' +
      'aria-label="删除图片" title="删除图片">' + BW_IMG_DEL_SVG + '</button>' +
      '</span>';
  }

  // 旧版行内渲染（markdown-it 不可用时的兜底）
  function renderInlineLegacy(s) {
    s = s || '';
    s = escapeHtml(s);
    s = s.replace(RE_INLINE_MATH, function (_, tex) {
      return '<span class="bw-inline-math" data-tex="' + escapeAttr(tex) + '">' + renderInlineMath(tex) + '</span>';
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    s = s.replace(/`([^`]+)`/g, '<code class="bw-inline-code">$1</code>');
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<span class="bw-img-wrap"><img src="$2" alt="$1" style="max-width:100%;border-radius:6px;">' +
      '<button class="bw-img-del" type="button" contenteditable="false" aria-label="删除图片" title="删除图片">' +
      BW_IMG_DEL_SVG + '</button></span>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="bw-link" href="$2" target="_blank">$1</a>');
    return s;
  }


  /* ============================================================
   * HTML FRAGMENT RENDERING (auto-detect & render)
   * 用户在普通段落写入 HTML 代码（如 <button>点我</button>）时，
   * 自动识别为 HTML 片段并安全渲染为真实 DOM；编辑态实时预览同理。
   * 安全策略：剥离 <script>/<style>/<iframe> 等危险标签与所有 on* 事件属性、
   * javascript: 协议的 href/src，避免 XSS。
   * ============================================================ */
  function sanitizeHtmlFragment(html) {
    try {
      var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
      var root = doc.body.firstChild;
      var forbidden = /^(script|style|iframe|object|embed|link|meta|base|frame|frameset|noscript|portal|template)$/i;
      function walk(node) {
        Array.from(node.childNodes).forEach(function (child) {
          if (child.nodeType === 1) {
            var tag = child.tagName.toLowerCase();
            if (forbidden.test(tag)) { child.remove(); return; }
            Array.from(child.attributes).forEach(function (attr) {
              var n = attr.name.toLowerCase();
              if (n.indexOf('on') === 0) child.removeAttribute(attr.name);
              else if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(attr.value)) child.removeAttribute(attr.name);
              else if (n === 'srcdoc') child.removeAttribute(attr.name);
            });
            walk(child);
          }
        });
      }
      walk(root);
      return root.innerHTML;
    } catch (_) {
      return escapeHtml(html);
    }
  }

  // 在已安全过滤的 HTML 上再做一次 $...$/$$...$$ 公式渲染（HTML 内可混排公式）
  function renderHtmlContent(md) {
    var clean = sanitizeHtmlFragment(md);
    var prot = protectMath(clean);
    return restoreMath(prot.md, prot.store);
  }

  function renderHtmlBlock(block, md) {
    block.innerHTML = '<span class="bw-rendered bw-html-block">' + renderHtmlContent(md) + '</span>';
  }

  function escapeAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  /* KaTeX render: works whether the build has renderToString OR only render.
     Some bundled KaTeX (e.g. modular CDN) only ships .render(element, options),
     so we use a temp element and read its innerHTML. */
  function katexToHtml(tex, displayMode) {
    try {
      if (typeof window.katex.renderToString === 'function') {
        return window.katex.renderToString(tex, { displayMode: !!displayMode, throwOnError: false, trust: true });
      }
      var tmp = document.createElement('span');
      window.katex.render(tex, tmp, { displayMode: !!displayMode, throwOnError: false, trust: true });
      return tmp.innerHTML;
    } catch (e) {
      return (displayMode ? '$$' : '$') + tex + (displayMode ? '$$' : '$');
    }
  }

  function renderInlineMath(tex) {
    if (!katexReady || !hasKatex()) return '$' + tex + '$';
    return katexToHtml(tex, false);
  }

  // 反向渲染：从 DOM 还原 Markdown（防御性恢复，当 dataset.md 丢失时使用）
  function bwReverseRenderBlock(block) {
    if (!block || !block.classList) return '';
    var cls = block.className;
    var text = block.textContent.replace(/\u00A0/g, ' ').trim();
    if (!text) return '';
    // heading
    if (cls.indexOf('h1') !== -1) return '# ' + text;
    if (cls.indexOf('h2') !== -1) return '## ' + text;
    if (cls.indexOf('h3') !== -1) return '### ' + text;
    if (cls.indexOf('h4') !== -1) return '#### ' + text;
    // blockquote: text might be wrapped in .bw-quote-text
    if (cls.indexOf('blockquote') !== -1) return '> ' + text;
    // task
    if (cls.indexOf('task') !== -1) {
      var checked = cls.indexOf('checked') !== -1;
      return '- [' + (checked ? 'x' : ' ') + '] ' + text;
    }
    // list
    if (cls.indexOf('ul') !== -1) {
      var lines = text.split('\n').map(function (l) { return '- ' + l.trim(); });
      return lines.join('\n');
    }
    if (cls.indexOf('ol') !== -1) return text; // 有序列表尽量保留
    // code (from inner <pre><code>)
    if (cls.indexOf('code') !== -1) {
      var codeEl = block.querySelector('code');
      if (codeEl) {
        var lang = (block.dataset && block.dataset.lang) || '';
        return '```' + lang + '\n' + codeEl.textContent + '\n```';
      }
    }
    // table: reconstruct from <table>
    if (cls.indexOf('table') !== -1) {
      var rows = [];
      var tableEl = block.querySelector('table');
      if (tableEl) {
        tableEl.querySelectorAll('tr').forEach(function (tr) {
          var cells = [];
          tr.querySelectorAll('th, td').forEach(function (td) { cells.push(td.textContent.trim()); });
          rows.push('| ' + cells.join(' | ') + ' |');
        });
        if (rows.length > 1) {
          // insert separator after header
          var sep = '|' + rows[0].split('|').slice(1, -1).map(function () { return ' --- '; }).join('|') + '|';
          rows.splice(1, 0, sep);
        }
        return rows.join('\n');
      }
    }
    // hr
    if (cls.indexOf('hr') !== -1) return '---';
    // mermaid
    var mermaidSrc = block.querySelector('.bw-mermaid-src');
    if (mermaidSrc) return '```mermaid\n' + mermaidSrc.textContent + '\n```';
    // math card
    if (block.classList.contains('bw-math-card') && block.dataset && block.dataset.tex) {
      return '$$\n' + block.dataset.tex + '\n$$';
    }
    // plain paragraph
    return text;
  }

