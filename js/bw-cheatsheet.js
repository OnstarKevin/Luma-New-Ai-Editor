/**
 * Luma — 数学公式 & Markdown 快速查询助手
 * 工具栏点击打开，分组展示常用 LaTeX + Markdown 语法，点击复制。
 */
'use strict';

  var _cheatData = {
    math: [
      { n:'希腊字母', s:[
        { k:'\\alpha',     v:'α' },{ k:'\\beta',   v:'β' },{ k:'\\gamma',   v:'γ' },
        { k:'\\delta',     v:'δ' },{ k:'\\epsilon', v:'ε' },{ k:'\\zeta',    v:'ζ' },
        { k:'\\eta',       v:'η' },{ k:'\\theta',   v:'θ' },{ k:'\\iota',    v:'ι' },
        { k:'\\kappa',     v:'κ' },{ k:'\\lambda',  v:'λ' },{ k:'\\mu',      v:'μ' },
        { k:'\\nu',        v:'ν' },{ k:'\\xi',      v:'ξ' },{ k:'\\pi',      v:'π' },
        { k:'\\rho',       v:'ρ' },{ k:'\\sigma',   v:'σ' },{ k:'\\tau',     v:'τ' },
        { k:'\\upsilon',   v:'υ' },{ k:'\\phi',     v:'φ' },{ k:'\\chi',     v:'χ' },
        { k:'\\psi',       v:'ψ' },{ k:'\\omega',   v:'ω' },
        { k:'\\Gamma',     v:'Γ' },{ k:'\\Delta',   v:'Δ' },{ k:'\\Theta',   v:'Θ' },
        { k:'\\Lambda',    v:'Λ' },{ k:'\\Xi',      v:'Ξ' },{ k:'\\Pi',      v:'Π' },
        { k:'\\Sigma',     v:'Σ' },{ k:'\\Phi',     v:'Φ' },{ k:'\\Psi',     v:'Ψ' },
        { k:'\\Omega',     v:'Ω' },
      ]},
      { n:'运算符', s:[
        { k:'\\times',     v:'×' },{ k:'\\div',      v:'÷' },{ k:'\\cdot',    v:'·' },
        { k:'\\pm',        v:'±' },{ k:'\\mp',       v:'∓' },{ k:'\\oplus',   v:'⊕' },
        { k:'\\otimes',    v:'⊗' },{ k:'\\odot',     v:'⊙' },{ k:'\\cup',     v:'∪' },
        { k:'\\cap',       v:'∩' },{ k:'\\setminus', v:'∖' },{ k:'\\circ',    v:'∘' },
      ]},
      { n:'关系符', s:[
        { k:'\\leq',      v:'≤' },{ k:'\\geq',       v:'≥' },{ k:'\\approx',  v:'≈' },
        { k:'\\neq',      v:'≠' },{ k:'\\equiv',     v:'≡' },{ k:'\\propto',  v:'∝' },
        { k:'\\subset',   v:'⊂' },{ k:'\\supset',    v:'⊃' },{ k:'\\subseteq',v:'⊆' },
        { k:'\\supseteq', v:'⊇' },{ k:'\\in',        v:'∈' },{ k:'\\ni',      v:'∋' },
        { k:'\\sim',      v:'∼' },{ k:'\\cong',      v:'≅' },{ k:'\\ll',      v:'≪' },
        { k:'\\gg',       v:'≫' },
      ]},
      { n:'箭头', s:[
        { k:'\\leftarrow',  v:'←' },{ k:'\\rightarrow', v:'→' },{ k:'\\leftrightarrow', v:'↔' },
        { k:'\\uparrow',    v:'↑' },{ k:'\\downarrow',   v:'↓' },{ k:'\\updownarrow',   v:'↕' },
        { k:'\\Leftarrow',  v:'⇐' },{ k:'\\Rightarrow',  v:'⇒' },{ k:'\\Leftrightarrow',v:'⇔' },
        { k:'\\mapsto',     v:'↦' },{ k:'\\longmapsto',  v:'⟼' },{ k:'\\to',            v:'→' },
      ]},
      { n:'括号/分隔', s:[
        { k:'\\left( x \\right)',  v:'(x)'   },{ k:'\\left[ x \\right]', v:'[x]'   },
        { k:'\\left\\{ x \\right\\}', v:'{x}'},{ k:'\\lceil x \\rceil',   v:'⌈x⌉'  },
        { k:'\\lfloor x \\rfloor',  v:'⌊x⌋'  },{ k:'\\langle x \\rangle',v:'⟨x⟩'  },
        { k:'\\vert x \\vert',      v:'|x|'   },{ k:'\\Vert x \\Vert',    v:'‖x‖'  },
      ]},
      { n:'常用结构', s:[
        { k:'\\frac{a}{b}',         v:'a/b 分数' },
        { k:'\\sqrt{x}',            v:'√x 平方根' },
        { k:'\\sqrt[n]{x}',         v:'ⁿ√x n 次根' },
        { k:'\\sum_{i=0}^{n}',      v:'Σᵢ₌₀ⁿ 求和' },
        { k:'\\prod_{i=1}^{n}',     v:'∏ᵢ₌₁ⁿ 求积' },
        { k:'\\int_{a}^{b}',        v:'∫ₐᵇ 积分' },
        { k:'\\lim_{x\\to\\infty}', v:'limₓ→∞ 极限' },
        { k:'x^{n}',                v:'xⁿ 上标' },
        { k:'x_{n}',                v:'xₙ 下标' },
        { k:'\\binom{n}{k}',        v:'C(n,k) 组合数' },
        { k:'\\overline{x}',        v:'x̅ 上划线' },
        { k:'\\underline{x}',       v:'x̲ 下划线' },
        { k:'\\hat{x}',             v:'x̂ 帽子' },
        { k:'\\vec{x}',             v:'x⃗ 向量' },
        { k:'\\mathbb{R}',          v:'ℝ 双线' },
        { k:'\\mathcal{A}',         v:'𝒜 花体' },
        { k:'\\text{中文}',         v:'公式内中文' },
      ]},
      { n:'矩阵', s:[
        { k:'\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}', v:'小括号矩阵' },
        { k:'\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}', v:'方括号矩阵' },
        { k:'\\begin{vmatrix}\n  a & b \\\\\n  c & d\n\\end{vmatrix}', v:'行列式' },
      ]},
    ],
    md: [
      { n:'标题', s:[
        { k:'# H1', v:'一级标题' },{ k:'## H2', v:'二级标题' },{ k:'### H3', v:'三级标题' },
        { k:'#### H4', v:'四级标题' },{ k:'##### H5', v:'五级标题' },{ k:'###### H6', v:'六级标题' },
      ]},
      { n:'文字样式', s:[
        { k:'**粗体**', v:'粗体' },{ k:'*斜体*', v:'斜体' },{ k:'***粗斜体***', v:'粗斜体' },
        { k:'~~删除线~~', v:'删除线' },{ k:'`行内代码`', v:'行内代码' },{ k:'<u>下划线</u>', v:'下划线' },
        { k:'==高亮==', v:'高亮' },{ k:'H~2~O', v:'下标' },{ k:'X^2^', v:'上标' },
      ]},
      { n:'链接与图片', s:[
        { k:'[文字](url)', v:'超链接' },{ k:'![alt](url)', v:'图片' },
        { k:'[文字](url "标题")', v:'带标题链接' },{ k:'[锚点](#id)', v:'锚点跳转' },
      ]},
      { n:'列表', s:[
        { k:'- 项目', v:'无序列表' },{ k:'1. 项目', v:'有序列表' },
        { k:'- [ ] 待办', v:'任务未勾选' },{ k:'- [x] 已完成', v:'任务已勾选' },
      ]},
      { n:'代码', s:[
        { k:'```lang\ncode\n```', v:'围栏代码块' },{ k:'`code`', v:'行内代码' },
        { k:'    code', v:'缩进代码' },
      ]},
      { n:'引用与分隔', s:[
        { k:'> 引用', v:'引用' },{ k:'> > 嵌套引用', v:'嵌套引用' },
        { k:'---', v:'水平线' },{ k:'***', v:'星号分隔线' },
      ]},
      { n:'表格', s:[
        { k:'\| A \| B \| C \|\n\| --- \| :--- \| ---: \|\n\| 1 \| 2 \| 3 \|', v:'对齐表格' },
        { k:'\| A \| B \|\n\| --- \| --- \|', v:'基础表格' },
      ]},
      { n:'脚注与数学', s:[
        { k:'[^label]', v:'脚注引用' },{ k:'[^label]: 内容', v:'脚注定义' },
        { k:'$E=mc^2$', v:'行内公式' },{ k:'$$\nE=mc^2\n$$', v:'块级公式' },
      ]},
      { n:'扩展', s:[
        { k:'<!-- 注释 -->', v:'HTML 注释' },
        { k:'<details>\n<summary>标题</summary>\n内容\n</details>', v:'折叠块' },
        { k:'```mermaid\nflowchart LR\nA-->B\n```', v:'Mermaid 图' },
      ]},
      { n:'Emoji 快捷', s:[
        { k:':smile:', v:'😄' },{ k:':heart:', v:'❤️' },{ k:':star:', v:'⭐' },
        { k:':+1:', v:'👍' },{ k:':-1:', v:'👎' },{ k:':clap:', v:'👏' },
        { k:':fire:', v:'🔥' },{ k:':rocket:', v:'🚀' },{ k:':check:', v:'✅' },
        { k:':x:', v:'❌' },{ k:':warning:', v:'⚠️' },{ k:':bulb:', v:'💡' },
        { k:':100:', v:'💯' },{ k:':book:', v:'📖' },{ k:':link:', v:'🔗' },
        { k:':tada:', v:'🎉' },{ k:':memo:', v:'📝' },{ k:':zap:', v:'⚡' },
        { k:':sparkles:', v:'✨' },{ k:':coffee:', v:'☕' },
      ]},
    ]
  };

  function bwCheatsheetToggle(host) {
    var others = host.querySelectorAll('.bw-style-panel, .bw-plugins-panel, .bw-emoji-panel, .bw-find-bar');
    others.forEach(function (o) { o.remove(); });
    var panel = $('#bwCheatsheet', host);
    if (panel) { panel.remove(); return; }
    panel = document.createElement('div');
    panel.className = 'bw-chsheet-panel';
    panel.id = 'bwCheatsheet';

    var html = '<div class="bw-chsheet-head">📋 快速查询 <button class="bw-chsheet-close">×</button></div>' +
      '<div class="bw-chsheet-tabs">' +
        '<button class="bw-chsheet-tab active" data-chtab="math">LaTeX 数学</button>' +
        '<button class="bw-chsheet-tab" data-chtab="md">Markdown</button>' +
      '</div>' +
      '<input class="bw-chsheet-search" type="text" placeholder="搜索...">' +
      '<div class="bw-chsheet-body"></div>' +
      '<div class="bw-chsheet-tip">💡 点击条目复制到剪贴板</div>';

    panel.innerHTML = html;
    var body = panel.querySelector('.bw-chsheet-body');
    var search = panel.querySelector('.bw-chsheet-search');

    function render(section) {
      var q = (search.value || '').toLowerCase();
      var categories = _cheatData[section];
      var html2 = '';
      categories.forEach(function (cat) {
        var items = q ? cat.s.filter(function (s) {
          return s.k.toLowerCase().indexOf(q) !== -1 || s.v.toLowerCase().indexOf(q) !== -1;
        }) : cat.s;
        if (!items.length) return;
        html2 += '<div class="bw-chsheet-cat">';
        html2 += '<div class="bw-chsheet-cat-title">' + escapeHtml(cat.n) + '</div>';
        html2 += '<div class="bw-chsheet-grid">';
        items.forEach(function (it) {
          html2 += '<button class="bw-chsheet-item" data-cheat="' + escapeHtml(it.k) + '" title="点击复制"><code>' + escapeHtml(it.k) + '</code><small>' + escapeHtml(it.v) + '</small></button>';
        });
        html2 += '</div></div>';
      });
      if (!html2) html2 = '<div class="bw-chsheet-empty">没有匹配项</div>';
      body.innerHTML = html2;

      body.querySelectorAll('.bw-chsheet-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var text = btn.getAttribute('data-cheat');
          navigator.clipboard.writeText(text).then(function () {
            var bak = btn.querySelector('small').textContent;
            btn.querySelector('small').textContent = '已复制';
            setTimeout(function () { btn.querySelector('small').textContent = bak; }, 1000);
          });
        });
      });
    }

    var currentSection = 'math';
    render('math');

    panel.querySelector('.bw-chsheet-tabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.bw-chsheet-tab');
      if (!tab) return;
      panel.querySelectorAll('.bw-chsheet-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      currentSection = tab.getAttribute('data-chtab');
      search.value = '';
      render(currentSection);
    });

    search.addEventListener('input', function () { render(currentSection); });
    panel.querySelector('.bw-chsheet-close').addEventListener('click', function () { panel.remove(); });

    // Esc 关闭
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { panel.remove(); } });

    var editor = $('.bw-editor-body', host);
    if (editor) editor.appendChild(panel);
  }