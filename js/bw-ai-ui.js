/**
 * Luma · 灵犀 AI 副驾 — UI 接线（零侵入）
 * 工具栏 AI 按钮、可折叠侧边面板、设置弹层、斜杠命令入口与 /ai 解析、流式回流与「采用」编排。
 * 选区浮动 SVG 操作菜单、@doc/@selection 上下文捕获与选区回写原语见 bw-ai-selection.js。
 * 通过既有冻结 API 回写文档：buildDoc / renderBlock / updateBlockClass /
 * updateMarkdownIndicator / leaveEdit 等价收尾 / loadDocIntoEditor / markDirty /
 * updateWordCount / updateTOC / pushUndo / ensureTrailingEmptyBlock / stateMap。
 * 所有图标均为内联 SVG 轮廓（16/20px），无 emoji；样式仅 .bw-ai-*。
 */
'use strict';

/* ---------- 内联 SVG 图标（轮廓，currentColor）———— 面板/工具栏专用 ---------- */
var SPARKLE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8z"/><path d="M19 14l.9 2.4L22 17.3l-2.1.9L19 20.6l-.9-2.4L16 17.3l2.1-.9z"/></svg>';
var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
var STOP_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
var DOC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';
var CLEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

function bwAiAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function bwAiToast(host, msg, type) { if (typeof bwToast === 'function') bwToast(host, msg, { type: type || 'info' }); else console.log('[AI] ' + msg); }

/* ---------- 文档回写（全部复用既有 API） ---------- */
function bwAiApplyBlockMarkdown(host, block, md) {
  if (!block) return;
  var st = stateMap.get(host);
  var m = ('' + md).match(/^\s*\$\$([\s\S]*?)\$\$\s*$/);
  if (m) { if (typeof convertToMathCard === 'function') convertToMathCard(block, m[1].trim()); return; }
  if (block.classList.contains('editing')) block.classList.remove('editing');
  block.dataset.md = md;
  renderBlock(block, md);
  updateBlockClass(block, md);
  updateMarkdownIndicator(block);
  markDirty(block);
  ensureTrailingEmptyBlock(block.closest('.bw-doc'));
  updateWordCount(host);
  if (st) { updateTOC(block.closest('.bw-doc'), st); pushUndo(host, st); }
}

function lastRealBlock(host) {
  var blocks = $$('.bw-block', host);
  for (var i = blocks.length - 1; i >= 0; i--) if (!blocks[i].classList.contains('bw-math-card')) return blocks[i];
  return blocks[blocks.length - 1];
}

function bwAiApplyResult(cmd, ctx, text, host) {
  if (cmd.apply === 'replace') {
    var corrected = (cmd.name === 'proofread') ? bwAiProofreadCorrected(text) : text;
    if (ctx.range && ctx.range.startContainer && ctx.range.startContainer.isConnected && bwAiReplaceSelection(ctx, corrected)) {
      bwAiToast(host, '已替换选区', 'success'); return;
    }
    if (ctx.block) { bwAiApplyBlockMarkdown(host, ctx.block, corrected); bwAiToast(host, '已更新当前块', 'success'); return; }
    bwAiToast(host, '没有可应用的目标', 'warn');
  } else if (cmd.apply === 'insertAfter') {
    var ref = ctx.block || lastRealBlock(host);
    if (ref) { bwAiInsertAfter(host, ref, text); bwAiToast(host, '已插入到其后', 'success'); }
  }
}

/* ---------- 面板消息渲染 ---------- */
function bwAiRenderUser(host, text) {
  var refs = host._bwAi; if (!refs) return;
  var el = document.createElement('div'); el.className = 'bw-ai-msg bw-ai-msg-user';
  var b = document.createElement('div'); b.className = 'bw-ai-bubble'; b.textContent = text;
  el.appendChild(b); refs.messages.appendChild(el); refs.messages.scrollTop = refs.messages.scrollHeight;
}
function bwAiRenderBot(host, cmd) {
  var refs = host._bwAi; if (!refs) return null;
  var el = document.createElement('div'); el.className = 'bw-ai-msg bw-ai-msg-bot';
  var b = document.createElement('div'); b.className = 'bw-ai-bubble'; b.textContent = '…';
  el.appendChild(b); refs.messages.appendChild(el);
  var scroll = function () { refs.messages.scrollTop = refs.messages.scrollHeight; };
  scroll();
  return { el: el, bubble: b, scroll: scroll };
}
function bwAiUpdateUsage(host, usage) {
  var refs = host._bwAi; if (!refs) return;
  var pt = (usage && usage.prompt_tokens != null) ? usage.prompt_tokens : '?';
  var ct = (usage && usage.completion_tokens != null) ? usage.completion_tokens : '?';
  refs.usage.textContent = 'Token：输入 ' + pt + ' / 输出 ' + ct;
}
function bwAiFinalizeBot(host, bot, cmd, ctx, text) {
  var refs = host._bwAi; if (!bot) return;
  var actions = document.createElement('div'); actions.className = 'bw-ai-actions';
  var copyBtn = document.createElement('button'); copyBtn.className = 'bw-ai-act'; copyBtn.textContent = '复制';
  copyBtn.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); }
  });
  actions.appendChild(copyBtn);
  if (cmd.apply === 'replace' || cmd.apply === 'insertAfter') {
    var applyBtn = document.createElement('button'); applyBtn.className = 'bw-ai-act bw-ai-act-primary'; applyBtn.textContent = '采用';
    applyBtn.addEventListener('click', function () { bwAiApplyResult(cmd, ctx, text, host); applyBtn.disabled = true; applyBtn.textContent = '已采用'; });
    actions.appendChild(applyBtn);
  }
  var wBtn = document.createElement('button'); wBtn.className = 'bw-ai-act bw-ai-act-write'; wBtn.textContent = '写入文档';
  wBtn.addEventListener('click', function () { bwAiWriteToDoc(host, text); wBtn.disabled = true; wBtn.textContent = '已写入'; });
  actions.appendChild(wBtn);
  if (cmd.scope === 'document') {
    var insBtn = document.createElement('button'); insBtn.className = 'bw-ai-act'; insBtn.textContent = '插入摘要';
    insBtn.addEventListener('click', function () { bwAiInsertAfter(host, lastRealBlock(host), text); insBtn.disabled = true; insBtn.textContent = '已插入'; });
    actions.appendChild(insBtn);
  }
  bot.el.appendChild(actions); bot.scroll();
}

/* 将 AI 回复内容直接写入文档（追加到末尾），web 与桌面 exe 共用同一套 DOM 回写原语 */
function bwAiWriteToDoc(host, text) {
  if (!text || !text.trim()) { bwAiToast(host, '内容为空', 'warn'); return; }
  var ref = lastRealBlock(host);
  if (ref) { bwAiInsertAfter(host, ref, text); bwAiToast(host, '已写入文档', 'success'); }
  else bwAiToast(host, '没有可写入的位置', 'warn');
}

/* ---------- 运行命令 ---------- */
function bwAiRun(cmdName, prompt, host) {
  var refs = host._bwAi; if (!refs) return;
  var cmd = BWAI.getCommand(cmdName) || BWAI.getCommand('ask');
  if (!cmd) return;
  if (!BWAI.isConfigured()) { bwAiShowConfigNotice(host); bwAiTogglePanel(host, true); return; }
  var ctx = bwAiCaptureContext(host);
  // 全文上下文：默认开启，聊天类命令自动附带整篇文档，免去手动 @doc（省心；关闭可省 Token）
  var effPrompt = prompt;
  if (cmd.scope === 'chat' && refs.includeDoc && !/\@doc\b/.test(prompt || '')) {
    effPrompt = (prompt || '') + '\n\n【全文上下文】\n' + (ctx.docText || '(空)') + '\n';
  }
  var history = (cmd.scope === 'chat') ? (refs.history || []).slice(-10) : [];
  var userLabel = (cmd.scope === 'chat') ? (prompt || '(空)')
    : ('/' + cmd.name + (ctx.selectionText ? '（选区）' : (cmd.scope === 'document' ? '（全文）' : '（当前块）')));
  bwAiRenderUser(host, userLabel);
  var bot = bwAiRenderBot(host, cmd);
  refs.stopBtn.hidden = false; refs.sendBtn.hidden = true;
  var acc = '';
  var ctrl = BWAI.chat({
    system: (typeof cmd.system === 'function') ? cmd.system() : (cmd.system || BWAI.COMPACT_SYSTEM),
    history: history,
    messages: cmd.buildMessages(ctx, effPrompt),
    temperature: cmd.temperature,
    maxTokens: cmd.maxTokens,
    onToken: function (tok) { acc += tok; if (bot) { bot.bubble.textContent = acc; bot.scroll(); } },
    onDone: function (info) {
      refs.stopBtn.hidden = true; refs.sendBtn.hidden = false; refs.activeCtrl = null;
      if (info && info.aborted) bot.bubble.textContent = acc + '\n（已停止）';
      bwAiFinalizeBot(host, bot, cmd, ctx, acc, info);
      if (cmd.scope === 'chat') {
        refs.history = refs.history || [];
        refs.history.push({ role: 'user', content: prompt || '' });
        refs.history.push({ role: 'assistant', content: acc });
        if (refs.history.length > 10) refs.history = refs.history.slice(refs.history.length - 10);
      }
      if (info && info.usage) bwAiUpdateUsage(host, info.usage);
    },
    onError: function (err) {
      refs.stopBtn.hidden = true; refs.sendBtn.hidden = false; refs.activeCtrl = null;
      bot.bubble.textContent = '错误：' + (err && err.message ? err.message : String(err));
      bot.bubble.classList.add('bw-ai-err');
    }
  });
  refs.activeCtrl = ctrl;
}

/* ---------- 面板 / 菜单 注入与交互 ---------- */
function bwAiParseSlash(val) {
  val = (val || '').trim();
  if (val.indexOf('/') !== 0) return null;
  var sp = val.indexOf(' ');
  var name = (sp === -1) ? val.slice(1) : val.slice(1, sp);
  var rest = (sp === -1) ? '' : val.slice(sp + 1);
  var cmd = BWAI.getCommand(name);
  return cmd ? { name: cmd.name, prompt: rest } : null;
}

function bwAiSendInput(host) {
  var refs = host._bwAi; if (!refs) return;
  var val = refs.input.value;
  if (!val.trim()) return;
  refs.input.value = '';
  var slash = bwAiParseSlash(val);
  if (slash) bwAiRun(slash.name, slash.prompt, host);
  else bwAiRun('ask', val, host);
}

/* ---------- 面板宽度（可调）：挤压空白栏，不覆盖编辑区 ---------- */
function bwAiApplyWidth(host) {
  var refs = host._bwAi; if (!refs) return;
  var minW = 300;
  var cr = $('#bwContentRight', host);
  var maxW = minW; // 默认至少 minW
  if (cr) { var crRect = cr.getBoundingClientRect(); maxW = Math.max(minW, Math.round(crRect.width)); }
  if (refs.panelWidth < minW) refs.panelWidth = minW;
  if (refs.panelWidth > maxW) refs.panelWidth = maxW;
  refs.panel.style.width = refs.panelWidth + 'px';
  // 防御性互斥：AI 打开时确保白板已关闭（display:none，不保留残留）
  if (refs.panel.getAttribute('data-open') === 'true') {
    var wb = document.querySelector('.bw-wb-drawer.bw-wb-open');
    if (wb) { wb.style.display = 'none'; wb.classList.remove('bw-wb-open'); }
  }
}

function bwAiBindResize(host, handle) {
  var refs = host._bwAi; if (!refs || !handle) return;
  var startX = 0, startW = 0, dragging = false;
  handle.addEventListener('pointerdown', function (e) {
    dragging = true; startX = e.clientX; startW = refs.panelWidth;
    refs.panel.classList.add('resizing');
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  handle.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    refs.panelWidth = startW + (startX - e.clientX);  // 向左拖 = 更宽
    bwAiApplyWidth(host);
  });
  function end(e) {
    if (!dragging) return;
    dragging = false; refs.panel.classList.remove('resizing');
    try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    try { localStorage.setItem('bw-ai-panel-width', String(Math.round(refs.panelWidth))); } catch (err) {}
  }
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/* ---------- 全文上下文状态指示 ---------- */
function bwAiUpdateDocStatus(host) {
  var refs = host._bwAi; if (!refs) return;
  var n = 0;
  try { var t = (typeof getBodyMarkdown === 'function') ? getBodyMarkdown(host) : ''; n = (t || '').length; } catch (e) {}
  if (refs.includeDoc) refs.docStatus.textContent = '全文上下文已开启 · 约 ' + n + ' 字';
  else refs.docStatus.textContent = '全文上下文已关闭（仅按命令取上下文，省 Token）';
}

function bwAiClearChat(host) {
  var refs = host._bwAi; if (!refs) return;
  refs.history = [];
  refs.messages.innerHTML = '';
  refs.usage.textContent = '';
  refs.docStatus.textContent = '';
  bwAiUpdateDocStatus(host);
}

function bwAiTogglePanel(host, open) {
  var refs = host._bwAi; if (!refs) return;
  var isOpen = refs.panel.getAttribute('data-open') === 'true';
  var willOpen = (open === undefined) ? !isOpen : open;
  if (willOpen) {
    // 直接关闭画板（display:none，不保留滑动残留）
    var wb = document.querySelector('.bw-wb-drawer.bw-wb-open');
    if (wb) { wb.style.display = 'none'; wb.classList.remove('bw-wb-open'); }
    // 确保 AI 面板可见
    refs.panel.style.display = '';
  }
  refs.panel.setAttribute('data-open', willOpen ? 'true' : 'false');
  bwAiApplyWidth(host);
  if (willOpen) { refs.input.focus(); if (!BWAI.isConfigured()) bwAiShowConfigNotice(host); bwAiUpdateDocStatus(host); }
}

function bwAiShowConfigNotice(host) {
  var refs = host._bwAi; if (!refs) return;
  var bot = bwAiRenderBot(host, { title: '配置' });
  if (!bot) return;
  bot.bubble.classList.add('bw-ai-notice');
  bot.bubble.textContent = '尚未配置 AI：请在设置中填写 API Key（默认 DeepSeek）。密钥仅保存在本地。';
  var actions = document.createElement('div'); actions.className = 'bw-ai-actions';
  var go = document.createElement('button'); go.className = 'bw-ai-act bw-ai-act-primary'; go.textContent = '去设置';
  go.addEventListener('click', function () { bwAiShowSettings(host); });
  actions.appendChild(go); bot.el.appendChild(actions);
}

function bwAiShowSettings(host) {
  var refs = host._bwAi; if (!refs) return;
  var s = refs.settings;
  if (!s.hidden) { s.hidden = true; return; }
  var c = BWAI.config;
  var provOpts = Object.keys(BWAI.providers).map(function (k) {
    return '<option value="' + bwAiAttr(k) + '"' + (c.provider === k ? ' selected' : '') + '>' + bwAiAttr(BWAI.providers[k].label) + '</option>';
  }).join('');
  s.innerHTML =
    '<div class="bw-ai-settings-head">AI 设置</div>' +
    '<label class="bw-ai-field"><span>Provider</span><select class="bw-ai-prov">' + provOpts + '</select></label>' +
    '<label class="bw-ai-field"><span>Base URL</span><input class="bw-ai-base" type="text" value="' + bwAiAttr(c.baseURL || '') + '"></label>' +
    '<label class="bw-ai-field"><span>API Key</span><input class="bw-ai-key" type="password" placeholder="sk-..." value="' + bwAiAttr(c.apiKey || '') + '"></label>' +
    '<label class="bw-ai-field"><span>模型</span><input class="bw-ai-model" type="text" value="' + bwAiAttr(c.model || '') + '"></label>' +
    '<label class="bw-ai-field"><span>温度</span><input class="bw-ai-temp" type="number" min="0" max="2" step="0.1" value="' + (c.temperature != null ? c.temperature : '0.7') + '"></label>' +
    '<label class="bw-ai-field"><span>Max Tokens</span><input class="bw-ai-maxtok" type="number" min="128" max="8192" step="128" value="' + (c.maxTokens || 1024) + '"></label>' +
    '<div class="bw-ai-settings-actions"><button class="bw-ai-act bw-ai-act-primary bw-ai-save">保存</button><button class="bw-ai-act bw-ai-cancel">取消</button></div>' +
    '<div class="bw-ai-settings-note">密钥仅存于本地（localStorage 或 gitignored 本地文件），不会进仓库。</div>';
  s.hidden = false;
  var provSel = $('.bw-ai-prov', s), base = $('.bw-ai-base', s), key = $('.bw-ai-key', s), model = $('.bw-ai-model', s), temp = $('.bw-ai-temp', s), maxtok = $('.bw-ai-maxtok', s);
  provSel.addEventListener('change', function () {
    var p = BWAI.providers[provSel.value];
    if (p) { if (!base.value) base.value = p.defaultBaseURL || ''; if (!model.value) model.value = p.defaultModel || ''; }
  });
  $('.bw-ai-cancel', s).addEventListener('click', function () { s.hidden = true; });
  $('.bw-ai-save', s).addEventListener('click', function () {
    BWAI.saveConfig({
      provider: provSel.value, baseURL: base.value.trim(), apiKey: key.value.trim(),
      model: model.value.trim(), temperature: parseFloat(temp.value) || 0.7, maxTokens: parseInt(maxtok.value, 10) || 1024
    });
    s.hidden = true;
    bwAiToast(host, '设置已保存', 'success');
    if (refs.panel.getAttribute('data-open') !== 'true') bwAiTogglePanel(host, true);
  });
}

function bwAiInject(host) {
  if (host._bwAi) return;
  var toolbar = $('.bw-toolbar', host);
  if (toolbar) {
    var sep = document.createElement('div'); sep.className = 'bw-toolbar-sep';
    var btn = document.createElement('button');
    btn.className = 'bw-tool-btn bw-ai-toggle'; btn.setAttribute('data-action', 'ai-toggle');
    btn.title = 'AI 助手（灵犀）'; btn.setAttribute('aria-label', 'AI 助手');
    btn.innerHTML = SPARKLE_SVG + '<span class="bw-tooltip">AI 助手</span>';
    btn.addEventListener('click', function (e) { e.stopPropagation(); bwAiTogglePanel(host); });
    toolbar.appendChild(sep); toolbar.appendChild(btn);
  }
  var panel = document.createElement('aside');
  panel.className = 'bw-ai-panel'; panel.setAttribute('data-open', 'false');
  panel.innerHTML =
    '<div class="bw-ai-resize" title="拖动调节宽度" aria-hidden="true"></div>' +
    '<header class="bw-ai-header"><span class="bw-ai-title">灵犀 · AI 助手</span>' +
    '<div class="bw-ai-header-actions">' +
    '<button class="bw-ai-iconbtn bw-ai-clearchat" title="清空会话（保留设置与上下文切换）" aria-label="清空会话">' + CLEAR_SVG + '</button>' +
    '<button class="bw-ai-iconbtn bw-ai-docctx" title="全文上下文（默认开启，让 AI 看到整篇文档，方便总结/审稿）" aria-label="全文上下文">' + DOC_SVG + '</button>' +
    '<button class="bw-ai-iconbtn bw-ai-gear" title="设置" aria-label="设置">' + GEAR_SVG + '</button>' +
    '<button class="bw-ai-iconbtn bw-ai-close" title="收起" aria-label="收起">' + CHEVRON_SVG + '</button></div></header>' +
    '<div class="bw-ai-messages"></div>' +
    '<div class="bw-ai-quick"></div>' +
    '<div class="bw-ai-docstat"></div>' +
    '<div class="bw-ai-input-wrap"><textarea class="bw-ai-input" rows="2" placeholder="问点什么，或 / 调命令…  全文上下文默认开启，无需 @doc"></textarea>' +
    '<div class="bw-ai-input-btns">' +
    '<button class="bw-ai-iconbtn bw-ai-stop" title="停止" aria-label="停止" hidden>' + STOP_SVG + '</button>' +
    '<button class="bw-ai-iconbtn bw-ai-send" title="发送" aria-label="发送">' + SEND_SVG + '</button></div></div>' +
    '<div class="bw-ai-usage"></div>' +
    '<div class="bw-ai-settings" hidden></div>';
  var cr = $('#bwContentRight', host);
  if (cr) cr.appendChild(panel);
  else host.appendChild(panel); // 兜底

  var messages = $('.bw-ai-messages', panel), input = $('.bw-ai-input', panel),
      sendBtn = $('.bw-ai-send', panel), stopBtn = $('.bw-ai-stop', panel),
      usage = $('.bw-ai-usage', panel), quick = $('.bw-ai-quick', panel),
      settings = $('.bw-ai-settings', panel), docStatus = $('.bw-ai-docstat', panel),
      docBtn = $('.bw-ai-docctx', panel), clearBtn = $('.bw-ai-clearchat', panel), resize = $('.bw-ai-resize', panel);
  var selMenu = document.createElement('div'); selMenu.className = 'bw-ai-selmenu'; selMenu.style.display = 'none';

  // 持久化偏好：面板宽度 + 全文上下文开关
  var savedW = 340, savedDoc = true;
  try { var sw = parseInt(localStorage.getItem('bw-ai-panel-width'), 10); if (sw >= 260) savedW = sw; } catch (e) {}
  try { var sd = localStorage.getItem('bw-ai-include-doc'); if (sd === '0') savedDoc = false; } catch (e) {}

  ['summarize', 'polish', 'complete', 'continue', 'review', 'proofread'].forEach(function (c) {
    var cmd = BWAI.getCommand(c); if (!cmd) return;
    var b = document.createElement('button'); b.className = 'bw-ai-chip'; b.textContent = cmd.title; b.title = cmd.description;
    b.addEventListener('click', function () { bwAiRun(c, '', host); });
    quick.appendChild(b);
  });
  bwAiBuildSelectionMenu(host, selMenu);
  host.appendChild(selMenu);

  host._bwAi = { panel: panel, messages: messages, input: input, sendBtn: sendBtn, stopBtn: stopBtn, usage: usage, quick: quick, settings: settings, docStatus: docStatus, docBtn: docBtn, clearBtn: clearBtn, selMenu: selMenu, history: [], activeCtrl: null, activeBot: null, panelWidth: savedW, includeDoc: savedDoc };
  if (clearBtn) {
    clearBtn.addEventListener('click', function (e) { e.stopPropagation(); bwAiClearChat(host); });
  }

  sendBtn.addEventListener('click', function () { bwAiSendInput(host); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bwAiSendInput(host); } });
  stopBtn.addEventListener('click', function () { if (host._bwAi.activeCtrl) host._bwAi.activeCtrl.abort(); });
  $('.bw-ai-gear', panel).addEventListener('click', function (e) { e.stopPropagation(); bwAiShowSettings(host); });
  $('.bw-ai-close', panel).addEventListener('click', function () { bwAiTogglePanel(host, false); });
  // 全文上下文开关
  function syncDocBtn() { docBtn.classList.toggle('active', host._bwAi.includeDoc); }
  docBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    host._bwAi.includeDoc = !host._bwAi.includeDoc;
    try { localStorage.setItem('bw-ai-include-doc', host._bwAi.includeDoc ? '1' : '0'); } catch (err) {}
    syncDocBtn(); bwAiUpdateDocStatus(host);
  });
  syncDocBtn();
  // 宽度拖拽
  bwAiBindResize(host, resize);
  bwAiApplyWidth(host);
  bwAiUpdateDocStatus(host);
  window.addEventListener('resize', function () { if (host._bwAi) bwAiApplyWidth(host); });
}

function bwAiInit() {
  BWAI.loadConfig();
  var hosts = $$('[data-bw-doc-editor]');
  hosts.forEach(function (host) { bwAiInject(host); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading' || document.readyState === 'interactive') {
    document.addEventListener('DOMContentLoaded', bwAiInit);
  } else {
    bwAiInit();
  }
}
