/**
 * Luma — 新手入门教程（首次引导 / 随时重播）
 */
'use strict';

  var TUTORIAL_STEPS = [
    { title:'欢迎使用 Luma', text:'Luma 是一款高颜值、纯静态的 Markdown 编辑器。支持实时渲染、数学公式、代码高亮、无限白板和 AI 助手。点击下方「开始」快速了解核心操作。' },
    { title:'Shift + 空格', text:'这是最重要的快捷键——一键切换「源码编辑」和「富文本预览」模式。编辑时看到原始 Markdown 语法，预览时看到排版后的效果。试试看！', highlight:'.bw-doc' },
    { title:'Ctrl+F / Ctrl+H', text:'查找与替换。输入关键字即可高亮所有匹配项，按 Enter 或上下箭头快速跳转。Ctrl+H 进入替换模式，支持逐个替换或全部替换。', highlight:'.bw-doc' },
    { title:'AI 助手', text:'点击右侧面板打开 AI 助手（默认关闭，需在设置中填入 API Key）。支持润色、续写、查错、总结，甚至可以改整篇文档。「全文上下文」开关开启后，AI 能看到你的完整文章。', highlight:'.bw-ai-toggle' },
    { title:'多块选择', text:'Shift+ArrowDown 可以选中多个块（段落/标题/代码），然后 Ctrl+C 复制为 Markdown，或 Delete 删除，或让 AI 批量润色。Ctrl+Shift+A 全选所有块。Esc 或点击空白取消。', highlight:'.bw-doc' },
    { title:'更多功能', text:'左侧目录支持点击展开层级；工具栏内置表情符号库；代码块自动行号 + 一键复制；支持 KaTeX 数学公式、Mermaid 图表、表格和脚注。右键或选中文本可唤出 AI 快捷菜单。祝你写作愉快！' }
  ];

  var _tutStep = 0;
  var _tutOverlay = null;

  function bwTutorialStart() {
    _tutStep = 0;
    bwTutorialShowStep();
  }

  function bwTutorialShowStep() {
    if (_tutOverlay) _tutOverlay.remove();
    if (_tutStep >= TUTORIAL_STEPS.length) {
      try { localStorage.setItem('bw-tutorial-done', '1'); } catch (e) {}
      return;
    }
    var step = TUTORIAL_STEPS[_tutStep];
    _tutOverlay = document.createElement('div');
    _tutOverlay.className = 'bw-tutorial-overlay';
    _tutOverlay.innerHTML =
      '<div class="bw-tutorial-backdrop"></div>' +
      '<div class="bw-tutorial-card">' +
        '<div class="bw-tutorial-step">' + (_tutStep + 1) + ' / ' + TUTORIAL_STEPS.length + '</div>' +
        '<h3 class="bw-tutorial-title">' + escapeHtml(step.title) + '</h3>' +
        '<p class="bw-tutorial-text">' + escapeHtml(step.text) + '</p>' +
        '<div class="bw-tutorial-actions">' +
          (_tutStep > 0 ? '<button class="bw-tutorial-btn bw-tutorial-prev">上一步</button>' : '') +
          '<button class="bw-tutorial-btn bw-tutorial-primary">' + (_tutStep < TUTORIAL_STEPS.length - 1 ? '下一步' : '完成') + '</button>' +
        '</div>' +
        '<button class="bw-tutorial-skip">跳过教程</button>' +
      '</div>';
    document.body.appendChild(_tutOverlay);

    _tutOverlay.querySelector('.bw-tutorial-primary').addEventListener('click', function () {
      _tutStep++;
      bwTutorialShowStep();
    });
    var prevBtn = _tutOverlay.querySelector('.bw-tutorial-prev');
    if (prevBtn) prevBtn.addEventListener('click', function () { _tutStep--; bwTutorialShowStep(); });
    _tutOverlay.querySelector('.bw-tutorial-skip').addEventListener('click', function () {
      _tutOverlay.remove(); _tutOverlay = null;
      try { localStorage.setItem('bw-tutorial-done', '1'); } catch (e) {}
    });
    _tutOverlay.querySelector('.bw-tutorial-backdrop').addEventListener('click', function () {
      _tutOverlay.remove(); _tutOverlay = null;
      try { localStorage.setItem('bw-tutorial-done', '1'); } catch (e) {}
    });
  }

  // 首次访问时自动弹出
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { if (!localStorage.getItem('bw-tutorial-done')) setTimeout(bwTutorialStart, 800); } catch (e) {}
    });
  } else {
    try { if (!localStorage.getItem('bw-tutorial-done')) setTimeout(bwTutorialStart, 800); } catch (e) {}
  }
