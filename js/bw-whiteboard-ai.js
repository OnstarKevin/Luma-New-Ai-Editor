/**
 * Luma · 白板 AI 美化（编辑器侧，独立文件以满足「单文件 ≤300 行」）
 * 复用灵犀（BWAI）传输层；依赖核心模块 js/bw-whiteboard.js 暴露的 window.BWWhiteboard 助手。
 * 不重造：openBodyStream / parseSSE / config 均来自 BWAI。
 */
(function () {
  'use strict';

  function ns() { return window.BWWhiteboard || {}; }

  function getHost() {
    if (typeof ns().getHost === 'function') return ns().getHost();
    return document.querySelector('[data-bw-doc-editor]');
  }

  function extractImageUrl(text) {
    var m = text.match(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)\s]+\.(?:png|jpe?g|webp|gif))\)/i)
          || text.match(/(data:image\/[^\s)]+)/i)
          || text.match(/(https?:\/\/\S+\.(?:png|jpe?g|webp|gif))/i);
    return m ? m[1] : null;
  }

  function getWbAiConfig() {
    // 画板独立 AI 配置（localStorage，不与灵犀 AI 助手共享）
    // 格式：{"baseURL":"...","apiKey":"...","model":"..."}
    // 如需配置，在浏览器控制台执行：
    //   localStorage.setItem('bw-wb-ai-config', JSON.stringify({baseURL:'...',apiKey:'...',model:'...'}))
    try {
      var raw = localStorage.getItem('bw-wb-ai-config');
      if (raw) { var c = JSON.parse(raw); if (c && c.baseURL && c.apiKey) return c; }
    } catch (_) {}
    return null;
  }

  function beautify(dataUrl, align) {
    var host = getHost();
    // 优先使用画板独立 AI 配置，否则回退到灵犀 AI 助手的全局配置
    var cfg = getWbAiConfig() || (window.BWAI && window.BWAI.config) || {};
    var hasConfig = cfg.baseURL && cfg.apiKey;
    var hasTransport = window.BWAI && window.BWAI.openBodyStream;
    if (!hasConfig) {
      if (typeof bwToast === 'function') bwToast(host, '画板 AI 美化未配置 API（在控制台执行: localStorage.setItem("bw-wb-ai-config", JSON.stringify({baseURL:"...",apiKey:"...",model:"..."})); 或先配置灵犀 AI 助手）', { type: 'warn', duration: 6000 });
      if (typeof ns().fallbackInsertOriginal === 'function') ns().fallbackInsertOriginal(dataUrl, align);
      return;
    }
    if (!hasTransport) {
      if (typeof bwToast === 'function') bwToast(host, 'AI 传输模块未加载，已插入原图', { type: 'warn' });
      if (typeof ns().fallbackInsertOriginal === 'function') ns().fallbackInsertOriginal(dataUrl, align);
      return;
    }
    var base = window.BWAI.normalizeBaseURL ? window.BWAI.normalizeBaseURL(cfg.baseURL) : (cfg.baseURL || '');
    var body = JSON.stringify({
      model: cfg.model,
      stream: true,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: '你是图像美化助手。用户给你一张图，尽量返回美化后的图片地址（data URL 或图片 URL）；若只能文字描述，请直接给出可嵌入的改进说明。' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: '请美化这张图并返回可直接嵌入的图片地址（如可用）。' }
        ] }
      ]
    });
    var req = {
      url: base.replace(/\/$/, '') + '/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg.apiKey || '') },
      body: body
    };
    window.BWAI.openBodyStream(req).then(function (stream) {
      var acc = '';
      var it = window.BWAI.parseSSE(stream, {
        extract: function (evt) {
          var c = evt.choices && evt.choices[0] && evt.choices[0].delta;
          return (c && c.content != null) ? c.content : null;
        }
      });
      (async function () {
        for await (var tok of it) { if (tok.content) acc += tok.content; }
        var imgUrl = extractImageUrl(acc);
        if (imgUrl) {
          if (typeof ns().insertWhiteboardImage === 'function') ns().insertWhiteboardImage(imgUrl, '白板(AI)', ns().genId(), align);
          if (typeof bwToast === 'function') bwToast(host, 'AI 美化已完成', { type: 'ok' });
        } else {
          if (typeof ns().fallbackInsertOriginal === 'function') ns().fallbackInsertOriginal(dataUrl, align);
          else if (typeof bwToast === 'function') bwToast(host, '当前模型不支持图像生成，已插入原图', { type: 'warn' });
        }
      })();
    }).catch(function (e) {
      if (typeof bwToast === 'function') bwToast(host, 'AI 美化失败：' + (e.message || e), { type: 'error' });
      if (typeof ns().fallbackInsertOriginal === 'function') ns().fallbackInsertOriginal(dataUrl, align);
    });
  }

  window.BWWhiteboard = window.BWWhiteboard || {};
  window.BWWhiteboard.beautify = beautify;
})();
