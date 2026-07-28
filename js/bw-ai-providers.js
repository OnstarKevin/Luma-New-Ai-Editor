/**
 * Luma · 灵犀 AI 副驾 — 内置 Provider 注册
 * deepseek 默认；openai / anthropic / ollama / transformers 占位。
 * 凡是暴露 OpenAI 兼容 /v1/chat/completions 的服务（Ollama、lmstudio、open-webui、
 * 各类中转），选 openai 或对应 provider 改 baseURL 即可，无需写代码。
 * 复用核心的 BWAI.openBodyStream（桌面代理 / fetch 分支）与 BWAI.parseSSE（单一 SSE 解析）。
 */
'use strict';

/* 组装 messages：system + 历史 + 当轮 user 消息 */
function bwAiBuildMsgs(chat) {
  var msgs = [];
  if (chat.system) msgs.push({ role: 'system', content: chat.system });
  var hist = chat.history || [];
  for (var i = 0; i < hist.length; i++) msgs.push(hist[i]);
  var userMsgs = chat.messages || [];
  for (var j = 0; j < userMsgs.length; j++) msgs.push(userMsgs[j]);
  return msgs;
}

/* 消费 SSE 流：逐增量回调 onToken，结束/中止回调 onDone，错误 onError。
   extract 为 provider 特定的增量解释回调（默认 OpenAI 兼容）。 */
function bwAiConsume(stream, chat, extract) {
  var acc = '';
  (async function () {
    try {
      var opts = extract ? { extract: extract } : undefined;
      for await (var evt of BWAI.parseSSE(stream, opts)) {
        if (evt.usage) { chat._usage = evt.usage; continue; }
        acc += evt.content;
        if (chat.onToken) chat.onToken(evt.content, acc);
      }
      if (chat.onDone) chat.onDone({ text: acc, usage: chat._usage });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (chat.onDone) chat.onDone({ text: acc, aborted: true });
        return;
      }
      if (chat.onError) chat.onError(err);
    }
  })();
}

/* OpenAI 兼容（Ollama / OpenAI / 中转 / DeepSeek 同协议） */
function bwAiStreamOpenAICompatible(cfg, chat, signal) {
  var url = BWAI.normalizeBaseURL(cfg.baseURL) + '/chat/completions';
  var headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  var body = JSON.stringify({
    model: cfg.model,
    stream: true,
    temperature: (typeof chat.temperature === 'number') ? chat.temperature : 0.7,
    max_tokens: chat.maxTokens || 1024,
    messages: bwAiBuildMsgs(chat)
  });
  BWAI.openBodyStream({ url: url, method: 'POST', headers: headers, body: body, signal: signal })
    .then(function (stream) { bwAiConsume(stream, chat, null); })
    .catch(function (err) { if (err && err.name === 'AbortError') return; if (chat.onError) chat.onError(err); });
}

/* Anthropic Messages SSE（content_block_delta -> delta.text） */
function bwAiStreamAnthropic(cfg, chat, signal) {
  var url = BWAI.normalizeBaseURL(cfg.baseURL) + '/messages';
  var headers = { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' };
  if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
  var sys = chat.system || '';
  var msgs = bwAiBuildMsgs(chat).filter(function (m) { return m.role !== 'system'; });
  var body = JSON.stringify({
    model: cfg.model,
    max_tokens: chat.maxTokens || 1024,
    system: sys,
    stream: true,
    messages: msgs
  });
  var extract = function (evt) {
    if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') return evt.delta.text;
    return null;
  };
  BWAI.openBodyStream({ url: url, method: 'POST', headers: headers, body: body, signal: signal })
    .then(function (stream) { bwAiConsume(stream, chat, extract); })
    .catch(function (err) { if (err && err.name === 'AbortError') return; if (chat.onError) chat.onError(err); });
}

BWAI.registerProvider('deepseek', {
  label: 'DeepSeek',
  defaultBaseURL: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-chat',
  needsApiKey: true,
  streamChat: bwAiStreamOpenAICompatible
});
BWAI.registerProvider('openai', {
  label: 'OpenAI 兼容',
  defaultBaseURL: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  needsApiKey: true,
  streamChat: bwAiStreamOpenAICompatible
});
BWAI.registerProvider('anthropic', {
  label: 'Anthropic',
  defaultBaseURL: 'https://api.anthropic.com/v1',
  defaultModel: 'claude-3-5-sonnet-latest',
  needsApiKey: true,
  streamChat: bwAiStreamAnthropic
});
BWAI.registerProvider('ollama', {
  label: 'Ollama（本地）',
  defaultBaseURL: 'http://localhost:11434/v1',
  defaultModel: 'qwen2.5:7b',
  needsApiKey: false,
  streamChat: bwAiStreamOpenAICompatible
});
BWAI.registerProvider('transformers', {
  label: 'Transformers.js（离线，待接入）',
  defaultBaseURL: '',
  defaultModel: '',
  needsApiKey: false,
  streamChat: function (cfg, chat) {
    if (chat.onError) chat.onError(new Error('Transformers.js 离线推理尚未接入，请使用 Ollama 或云端 Provider'));
  }
});
