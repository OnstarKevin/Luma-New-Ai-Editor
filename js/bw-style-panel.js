/**
 * Luma — 块背景/样式可视化调节面板
 */
'use strict';

  var STYLE_KEY = 'bw-style-v1';
  var _defaults = {
    blockquote: { bg: 'rgba(128,128,128,0.04)' },
    code:       { bg: 'var(--bw-surface)' },
    task:       { bg: 'transparent' },
    selected:   { bg: 'rgba(96,165,250,0.12)' },
    editing:    { bg: 'inherit' },
    markdown:   { bg: 'transparent' },
    math:       { bg: 'var(--bw-surface)' }
  };
  var _presetColors = [
    { name: '灰', value: 'rgba(128,128,128,0.06)' },
    { name: '蓝', value: 'rgba(74,108,247,0.08)' },
    { name: '绿', value: 'rgba(76,175,80,0.08)' },
    { name: '黄', value: 'rgba(255,193,7,0.12)' },
    { name: '红', value: 'rgba(244,67,54,0.08)' },
    { name: '紫', value: 'rgba(171,71,188,0.08)' },
    { name: '青', value: 'rgba(0,188,212,0.08)' },
    { name: '无', value: 'transparent' }
  ];

  function bwStyleLoad() {
    try { return Object.assign({}, _defaults, JSON.parse(localStorage.getItem(STYLE_KEY) || '{}')); }
    catch (e) { return Object.assign({}, _defaults); }
  }
  function bwStyleSave(s) { try { localStorage.setItem(STYLE_KEY, JSON.stringify(s)); } catch (e) {} }

  function bwStyleApply(s) {
    var doc = document.documentElement;
    doc.style.setProperty('--bw-bq-bg', s.blockquote.bg);
    doc.style.setProperty('--bw-code-bg', s.code.bg);
    doc.style.setProperty('--bw-task-bg', s.task.bg);
    doc.style.setProperty('--bw-sel-bg', s.selected.bg);
    doc.style.setProperty('--bw-editing-bg', s.editing.bg);
    doc.style.setProperty('--bw-md-bg', s.markdown.bg);
    doc.style.setProperty('--bw-math-bg', s.math.bg);
  }

  function bwStylePanel(host) {
    // 关闭其他面板，避免重叠
    var others = host.querySelectorAll('.bw-plugins-panel, .bw-chsheet-panel, .bw-emoji-panel, .bw-find-bar');
    others.forEach(function (o) { o.remove(); });
    var existing = $('#bwStylePanel', host);
    if (existing) { existing.remove(); return; }
    var s = bwStyleLoad();

    var panel = document.createElement('div');
    panel.className = 'bw-style-panel';
    panel.id = 'bwStylePanel';
    panel.innerHTML = '<div class="bw-style-head">🎨 块样式调节 <button class="bw-style-close">×</button></div>'
      + '<div class="bw-style-body"></div>'
      + '<div class="bw-style-foot"><button class="bw-style-reset">恢复默认</button><button class="bw-style-save">保存</button></div>';

    var body = panel.querySelector('.bw-style-body');
    var labels = {
      blockquote: '引用块背景',
      code:       '代码块背景',
      task:       '任务列表背景',
      selected:   '选中块背景',
      editing:    '编辑态背景',
      markdown:   'Markdown 检测指示',
      math:       '数学公式背景'
    };
    Object.keys(labels).forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'bw-style-row';
      var swatches = _presetColors.map(function (p) {
        var sel = (s[key].bg === p.value) ? ' selected' : '';
        return '<button type="button" class="bw-style-swatch' + sel + '" data-key="' + key + '" data-bg="' + p.value + '" title="' + p.name + '" style="background:' + p.value + '"></button>';
      }).join('');
      row.innerHTML =
        '<div class="bw-style-label">' + labels[key] + '</div>' +
        '<div class="bw-style-swatches">' + swatches + '</div>' +
        '<input type="color" class="bw-style-color" data-key="' + key + '" value="' + colorFromBg(s[key].bg) + '" title="自定义">';
      body.appendChild(row);
    });

    panel.querySelectorAll('.bw-style-swatch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        var key = sw.getAttribute('data-key');
        s[key].bg = sw.getAttribute('data-bg');
        bwStyleApply(s);
        panel.querySelectorAll('.bw-style-swatch[data-key="' + key + '"]').forEach(function (x) { x.classList.toggle('selected', x === sw); });
      });
    });
    panel.querySelectorAll('.bw-style-color').forEach(function (ip) {
      ip.addEventListener('input', function () {
        var key = ip.getAttribute('data-key');
        s[key].bg = ip.value;
        bwStyleApply(s);
        panel.querySelectorAll('.bw-style-swatch[data-key="' + key + '"]').forEach(function (x) { x.classList.remove('selected'); });
      });
    });

    panel.querySelector('.bw-style-close').addEventListener('click', function () { panel.remove(); });
    panel.querySelector('.bw-style-reset').addEventListener('click', function () {
      s = Object.assign({}, _defaults);
      bwStyleApply(s);
      panel.remove();
      bwStylePanel(host);
    });
    panel.querySelector('.bw-style-save').addEventListener('click', function () {
      bwStyleSave(s);
      flashTip(panel, '已保存到 localStorage');
    });

    var editor = $('.bw-editor-body', host);
    if (editor) editor.appendChild(panel);
  }

  function colorFromBg(bg) {
    if (!bg) return '#ffffff';
    var m = bg.match(/#([0-9a-f]{6})/i);
    return m ? '#' + m[1] : '#ffffff';
  }
  function flashTip(panel, text) {
    var tip = document.createElement('div');
    tip.className = 'bw-style-tip';
    tip.textContent = text;
    panel.appendChild(tip);
    setTimeout(function () { tip.remove(); }, 1500);
  }

  bwStyleApply(bwStyleLoad());