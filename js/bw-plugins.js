/**
 * Luma — 插件管理器
 * 第三方二开插件通过 window.LumaPlugins.register 注册，工具栏「插件」按钮统一调用。
 * 插件结构示例见 plugins/luogu-checker/。
 */
'use strict';

  var _registered = {};

  var LumaPlugins = {
    /**
     * 注册一个插件
     * @param {Object} def - { name, description, version, icon, run(host, ctx) }
     *   run 返回 { issues: [{line, col, severity, message, hint}], summary: '' }
     */
    register: function (def) {
      if (!def || !def.name) return false;
      _registered[def.name] = def;
      return true;
    },
    unregister: function (name) { delete _registered[name]; },
    list: function () { return Object.values(_registered); },
    get: function (name) { return _registered[name]; },
    runOne: function (name, host) {
      var def = _registered[name];
      if (!def || typeof def.run !== 'function') return null;
      try {
        var md = (typeof getBodyMarkdown === 'function') ? getBodyMarkdown(host) : '';
        return def.run(host, { markdown: md });
      } catch (e) {
        console.error('[LumaPlugins]', name, 'run failed:', e);
        return { issues: [], summary: '插件运行失败：' + e.message };
      }
    },
    runAll: function (host) {
      var results = {};
      Object.keys(_registered).forEach(function (name) {
        results[name] = LumaPlugins.runOne(name, host);
      });
      return results;
    }
  };

  window.LumaPlugins = LumaPlugins;

  /* ============================================================
   * PLUGIN PANEL UI
   * ============================================================ */
  function bwPluginsToggle(host) {
    var others = host.querySelectorAll('.bw-style-panel, .bw-chsheet-panel, .bw-emoji-panel, .bw-find-bar');
    others.forEach(function (o) { o.remove(); });
    var panel = $('#bwPluginsPanel', host);
    if (panel) { panel.remove(); return; }
    var plugins = LumaPlugins.list();
    if (!plugins.length) {
      alert('暂无已注册插件。请在 plugins/ 目录下创建。');
      return;
    }
    panel = document.createElement('div');
    panel.className = 'bw-plugins-panel';
    panel.id = 'bwPluginsPanel';
    panel.innerHTML = '<div class="bw-plugins-header">🔌 插件 <button class="bw-plugins-close" type="button">×</button></div><div class="bw-plugins-list"></div>';
    var body = $('.bw-editor-body', host);
    if (body) body.appendChild(panel);
    panel.querySelector('.bw-plugins-close').addEventListener('click', function () { panel.remove(); });
    var list = panel.querySelector('.bw-plugins-list');
    plugins.forEach(function (p) {
      var row = document.createElement('button');
      row.className = 'bw-plugins-item';
      row.innerHTML = '<span class="bw-plugins-icon">' + (p.icon || '🔌') + '</span><span class="bw-plugins-meta"><span class="bw-plugins-name">' + escapeHtml(p.name) + '</span><span class="bw-plugins-desc">' + escapeHtml(p.description || '') + '</span></span><span class="bw-plugins-go">运行</span>';
      row.addEventListener('click', function () { bwPluginsRun(p.name, host, panel); });
      list.appendChild(row);
    });
  }

  function bwPluginsRun(name, host, panel) {
    var out = panel.querySelector('.bw-plugins-out') || (function () {
      var o = document.createElement('div'); o.className = 'bw-plugins-out';
      panel.querySelector('.bw-plugins-list').after(o); return o;
    })();
    out.innerHTML = '<div class="bw-plugins-running">运行 ' + escapeHtml(name) + ' 中...</div>';
    setTimeout(function () {
      var result = LumaPlugins.runOne(name, host);
      var html = '<div class="bw-plugins-result-head">📋 ' + escapeHtml(name) + ' 结果</div>';
      if (!result) { html += '<div class="bw-plugins-noissues">未返回结果</div>'; }
      else {
        if (result.summary) html += '<div class="bw-plugins-summary">' + escapeHtml(result.summary) + '</div>';
        var issues = result.issues || [];
        if (!issues.length) {
          html += '<div class="bw-plugins-noissues">✓ 没有发现格式问题</div>';
        } else {
          html += '<div class="bw-plugins-issues">';
          issues.forEach(function (it) {
            html += '<div class="bw-plugins-issue sev-' + (it.severity || 'warn') + '">' +
              '<div class="bw-plugins-issue-title">' + escapeHtml(it.message) + '</div>' +
              (it.hint ? '<div class="bw-plugins-issue-hint">' + escapeHtml(it.hint) + '</div>' : '') +
              '<div class="bw-plugins-issue-loc">第 ' + (it.line || '?') + ' 行' + (it.col ? ' 第 ' + it.col + ' 列' : '') + '</div>' +
              (it.snippet ? '<pre class="bw-plugins-issue-snippet">' + escapeHtml(it.snippet) + '</pre>' : '') +
            '</div>';
          });
          html += '</div>';
        }
      }
      out.innerHTML = html;
    }, 80);
  }