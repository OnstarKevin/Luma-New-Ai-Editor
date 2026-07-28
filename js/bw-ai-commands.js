/**
 * Luma · 灵犀 AI 副驾 — 内置 7 个命令
 * 与社区扩展走同一套 BWAI.registerCommand 注册表，地位平等。
 * 命令契约：{ name, alias?, title, description, scope, system?, buildMessages(ctx, prompt), maxTokens, temperature, apply }
 *   scope: 'selection' | 'document' | 'chat'
 *   apply: 'replace'（替换选区/块）| 'insertAfter'（在选区/块后插入）| null（仅渲染到面板）
 * 取上下文（ctx）由 UI 层在调用前捕获：{ host, selectionText, blockText, block, range, docText }
 * Token 节省：selection 类命令只发选中文本；summarize 才发 getBodyMarkdown；ask 只发问题 + 被 @ 引用的上下文。
 */
'use strict';

/* 选区优先；无选区则用当前块文本 */
function bwAiCmdCtxText(ctx) {
  if (ctx.selectionText && ctx.selectionText.trim()) return ctx.selectionText;
  return ctx.blockText || '';
}

/* 1) 总结整个文件（document 作用域，仅发紧凑正文） */
BWAI.registerCommand({
  name: 'summarize', alias: '总结', title: '总结全文',
  description: '总结整个文档内容（要点列表）',
  scope: 'document', maxTokens: 1024, temperature: 0.3, apply: null,
  system: function () { return BWAI.COMPACT_SYSTEM; },
  buildMessages: function (ctx) {
    var text = ctx.docText || '';
    return [{ role: 'user', content: '请用要点（Markdown 无序列表）总结下面这篇文档的核心内容，控制在 200 字以内，不要解释：\n\n' + text }];
  }
});

/* 2) 解答（chat 作用域，支持 @doc / @selection 引用） */
BWAI.registerCommand({
  name: 'ask', alias: '解答', title: '问 AI',
  description: '关于 KaTeX 数学公式、Markdown 等使用问题的解答；@doc 引用全文，@selection 引用选区',
  scope: 'chat', maxTokens: 1024, temperature: 0.4, apply: null,
  system: function () { return BWAI.COMPACT_SYSTEM + ' 用户可能询问 KaTeX 数学公式写法、Markdown 语法、写作规范等，请清晰解答并适当给出示例。'; },
  buildMessages: function (ctx, prompt) {
    var p = (prompt || '').trim();
    if (/\@doc\b/.test(p)) p = p.replace(/\@doc\b/, '\n【全文上下文】\n' + (ctx.docText || '(空)') + '\n');
    if (/\@selection\b/.test(p)) p = p.replace(/\@selection\b/, '\n【选区上下文】\n' + (ctx.selectionText || '(无选区)') + '\n');
    return [{ role: 'user', content: p }];
  }
});

/* 3) 润色（selection 作用域，只发选中文本） */
BWAI.registerCommand({
  name: 'polish', alias: '润色', title: '润色',
  description: '润色选区或当前块（语法、语气、流畅度）',
  scope: 'selection', maxTokens: 512, temperature: 0.4, apply: 'replace',
  system: function () { return BWAI.COMPACT_SYSTEM; },
  buildMessages: function (ctx) {
    var text = bwAiCmdCtxText(ctx);
    return [{ role: 'user', content: '润色下面的文本，提升语法、语气与流畅度，保持原意与语言；只返回润色后的文本，不要解释：\n\n' + text }];
  }
});

/* 4) 补全（selection 作用域，只发选中片段） */
BWAI.registerCommand({
  name: 'complete', alias: '补全', title: '补全',
  description: '补全一句话或填补空隙',
  scope: 'selection', maxTokens: 512, temperature: 0.6, apply: 'insertAfter',
  system: function () { return BWAI.COMPACT_SYSTEM; },
  buildMessages: function (ctx) {
    var text = bwAiCmdCtxText(ctx);
    return [{ role: 'user', content: '根据下面的半句或片段，自然地续写补全它；只返回补全的部分，不要重复原文，不要解释：\n\n' + text }];
  }
});

/* 5) 续写（selection 作用域，只发已有内容） */
BWAI.registerCommand({
  name: 'continue', alias: '续写', title: '续写',
  description: '从光标或选区末尾继续写',
  scope: 'selection', maxTokens: 1024, temperature: 0.8, apply: 'insertAfter',
  system: function () { return BWAI.COMPACT_SYSTEM; },
  buildMessages: function (ctx) {
    var text = bwAiCmdCtxText(ctx);
    return [{ role: 'user', content: '下面是已有内容，请顺着它继续写下去；只返回新增的内容，不要重复已有部分，不要解释：\n\n' + text }];
  }
});

/* 6) 审稿（selection/document 作用域，只返回建议，不自动改） */
BWAI.registerCommand({
  name: 'review', alias: '审稿', title: '审稿',
  description: '审读文档/选区，给出修改建议（只建议，不改写）',
  scope: 'selection', maxTokens: 1500, temperature: 0.3, apply: null,
  system: function () { return BWAI.COMPACT_SYSTEM; },
  buildMessages: function (ctx) {
    var text = bwAiCmdCtxText(ctx) || ctx.docText || '';
    return [{ role: 'user', content: '请审读下面的内容，指出可改进之处（结构、逻辑、语法、用词、Markdown/KaTeX 规范），用 Markdown 列表给出具体建议；不要重写原文：\n\n' + text }];
  }
});

/* 7) 查错（selection/document 作用域，列出错误并可一键采用修正） */
BWAI.registerCommand({
  name: 'proofread', alias: '查错', title: '查错',
  description: '校对拼写/语法/Markdown/KaTeX 错误并列出；可一键采用修正',
  scope: 'selection', maxTokens: 1024, temperature: 0.2, apply: 'replace',
  system: function () { return BWAI.COMPACT_SYSTEM; },
  buildMessages: function (ctx) {
    var text = bwAiCmdCtxText(ctx) || ctx.docText || '';
    return [{ role: 'user', content:
      '校对下面文本中的拼写、语法、标点、Markdown 与 KaTeX 语法错误。' +
      '先输出「修正后全文」（保持 Markdown 格式，仅修正错误，不改写风格），再输出「错误清单」（用列表列出每处问题及原因）。' +
      '两部分用如下标记分隔：\n===修正后===\n（修正文本）\n===错误清单===\n（清单）\n\n原文：\n' + text }];
  }
});
