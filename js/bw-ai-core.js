/**
 * Luma · 灵犀 AI 副驾 — 核心模块
 * 注册表 / 配置 / 传输层 / 统一 chat 入口。零侵入：不修改任何既有 13 模块，
 * 仅新增全局 BWAI 命名空间与 bw-ai-* 资源。
 * 依赖（既有冻结 API）：stateMap / $ / $$ / escapeHtml / NS、以及浏览器原生
 * fetch / ReadableStream / TextDecoder / AbortController（node18+ 同样内置，便于测试）。
 */
'use strict';

var BWAI = (function () {
  /* ---------- 注册表 ---------- */
  var providers = {};        // name -> {label, defaultBaseURL, defaultModel, needsApiKey, streamChat}
  var commands = {};          // name|alias -> command def
  var contextProviders = {};  // name -> {label, resolve}
  var i18n = {
    dicts: {},
    extend: function (locale, dict) {
      i18n.dicts[locale] = Object.assign(i18n.dicts[locale] || {}, dict);
      return i18n.dicts[locale];
    },
    t: function (key, locale) {
      var d = i18n.dicts[locale || 'zh'] || {};
      return (d[key] != null) ? d[key] : key;
    }
  };

  /* ---------- 默认配置（deepseek 默认，便宜） ---------- */
  var DEFAULTS = {
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 1024
  };

  var COMPACT_SYSTEM = '你是 Luma 的 Markdown 写作助手。' +
    '输出保持 Markdown 格式；除非用户明确要求解释，否则不要输出任何额外说明、客套话或代码块围栏之外的文字，直接给出结果。' +
    '默认用中文回答。';

  var config = Object.assign({}, DEFAULTS);

  /* ---------- 配置读写（localStorage + 本地 gitignored 文件） ---------- */
  function readLS() {
    try { var raw = localStorage.getItem('bw-ai-config-v1'); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeLS(cfg) {
    try { localStorage.setItem('bw-ai-config-v1', JSON.stringify(cfg)); return true; }
    catch (e) { return false; }
  }
  // 顺序：默认 → localStorage（用户 UI 填写）→ 本地 gitignored 文件（开发/测试密钥，不进仓库）。
  function loadConfig() {
    var ls = readLS();
    if (ls && typeof ls === 'object') Object.assign(config, ls);
    try {
      fetch('.bw-ai-config.local.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && typeof j === 'object') {
            Object.keys(j).forEach(function (k) {
              if (j[k] !== undefined && j[k] !== null && j[k] !== '') config[k] = j[k];
            });
          }
        })
        .catch(function () {});
    } catch (e) {}
    return config;
  }

  function normalizeBaseURL(u) {
    u = (u || '').trim();
    if (!u) return '';
    return u.replace(/\/+$/, '');
  }

  /* ---------- 传输层（网页 / 桌面共用一份实现） ---------- */
  // 唯一分支点：存在桌面代理则走 BWDesktop.aiProxy.fetchStream（覆盖 Ollama/lmstudio/open-webui），
  // 否则原生 fetch 直连。返回 ReadableStream<Uint8Array>。
  function openBodyStream(req) {
    if (typeof window !== 'undefined' && window.BWDesktop && window.BWDesktop.aiProxy &&
        typeof window.BWDesktop.aiProxy.fetchStream === 'function') {
      return Promise.resolve(window.BWDesktop.aiProxy.fetchStream(req));
    }
    return fetch(req.url, {
      method: req.method || 'POST',
      headers: req.headers,
      body: req.body,
      signal: req.signal || null
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('AI 请求失败：HTTP ' + res.status + (res.status === 401 ? '（密钥无效）' : ''));
      }
      if (!res.body) throw new Error('AI 响应没有可读取的流');
      return res.body;
    });
  }

  // 单一 SSE 帧解析：产出已 JSON.parse 的 data: 事件；支持 [DONE] 与末尾 usage。
  // extract(evt) 回调让不同 provider 解释增量（默认 OpenAI 兼容 choices[].delta.content）。
  async function* parseSSE(stream, opts) {
    opts = opts || {};
    var extract = opts.extract || function (evt) {
      var d = evt.choices && evt.choices[0] && evt.choices[0].delta;
      return (d && typeof d.content === 'string') ? d.content : null;
    };
    var reader = stream.getReader();
    var dec = new TextDecoder();
    var buf = '';
    var usage = null;
    try {
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var raw = lines[i].trim();
          if (!raw || raw.indexOf('data:') !== 0) continue;
          var payload = raw.slice(5).trim();
          if (payload === '[DONE]') { if (usage) yield { usage: usage }; return; }
          var evt;
          try { evt = JSON.parse(payload); } catch (e) { continue; }
          if (evt.usage) usage = evt.usage;
          var content = extract(evt);
          if (content != null) yield { content: content };
        }
      }
    } finally {
      try { reader.releaseLock(); } catch (e) {}
    }
    if (usage) yield { usage: usage };
  }

  /* ---------- 统一 chat 入口 ---------- */
  function makeAbort() {
    if (typeof AbortController !== 'undefined') return new AbortController();
    return { signal: null, abort: function () {} };
  }

  function isConfigured() {
    var p = providers[config.provider];
    if (!p) return false;
    if (p.needsApiKey && !config.apiKey) return false;
    if (!config.baseURL && p.needsApiKey) return false;
    return !!config.model;
  }

  // chat(opts) -> AbortController；opts: {system, history, messages, temperature, maxTokens, onToken, onDone, onError, signal}
  function chat(chatOpts) {
    var ctrl = makeAbort();
    var prov = providers[config.provider] || providers.openai;
    if (!prov) { if (chatOpts.onError) chatOpts.onError(new Error('未配置可用的 Provider')); return ctrl; }
    if (!isConfigured()) {
      if (chatOpts.onError) chatOpts.onError(new Error('未配置 API Key / 模型，请先在设置中填写（' + prov.label + '）'));
      return ctrl;
    }
    var cfg = {
      provider: config.provider,
      baseURL: config.baseURL || prov.defaultBaseURL || '',
      apiKey: config.apiKey || '',
      model: config.model || prov.defaultModel || ''
    };
    var signal = chatOpts.signal || (ctrl.signal || null);
    try {
      prov.streamChat(cfg, chatOpts, signal);
    } catch (e) {
      if (chatOpts.onError) chatOpts.onError(e);
    }
    return ctrl;
  }

  /* ---------- 注册表 API ---------- */
  function registerProvider(name, def) {
    if (name && def) providers[name] = def;
    return BWAI_PUB;
  }
  function registerCommand(def) {
    if (def && def.name) {
      commands[def.name] = def;
      if (def.alias) commands[def.alias] = def;
    }
    return BWAI_PUB;
  }
  function registerContextProvider(name, def) {
    if (name && def) contextProviders[name] = def;
    return BWAI_PUB;
  }
  function getCommand(name) { return commands[name] || null; }
  function listCommands() {
    return Object.keys(commands).filter(function (k) { return commands[k].name === k; });
  }
  function getContextProvider(name) { return contextProviders[name] || null; }

  var BWAI_PUB = {
    version: '1.0.0',
    COMPACT_SYSTEM: COMPACT_SYSTEM,
    config: config,
    providers: providers,
    commands: commands,
    contextProviders: contextProviders,
    i18n: i18n,
    registerProvider: registerProvider,
    registerCommand: registerCommand,
    registerContextProvider: registerContextProvider,
    getCommand: getCommand,
    listCommands: listCommands,
    getContextProvider: getContextProvider,
    loadConfig: loadConfig,
    saveConfig: function (patch) { if (patch) Object.assign(config, patch); return writeLS(config); },
    isConfigured: isConfigured,
    chat: chat,
    openBodyStream: openBodyStream,
    parseSSE: parseSSE,
    normalizeBaseURL: normalizeBaseURL
  };
  return BWAI_PUB;
})();
