/**
 * Luma · 白板形状生成（常用流程图 / 表格）
 * 纯手写 Excalidraw 0.17.6 元素对象，依赖 api.updateScene 内部 restoreElements 补默认值。
 * 文本绑定：容器 boundElements:[{type:'text',id}] + 文本元素 containerId（autoResize 自动定位）。
 * 该 UMD 构建未暴露 newElement 等工厂函数，故全部手写；已用无头 Chromium 验证可渲染 + 可导出 PNG。
 */
(function () {
  'use strict';

  function rid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function rnd() { return Math.floor(Math.random() * 2147483647); }

  // Excalidraw 0.17.6 元素最小骨架；restoreElements 会补全其余默认字段。
  function base(type, x, y, w, h, extra) {
    return Object.assign({
      id: rid(), type: type, x: x, y: y, width: w, height: h, angle: 0,
      strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
      groupIds: [], frameId: null, roundness: null,
      seed: rnd(), versionNonce: rnd(), version: 1, isDeleted: false,
      boundElements: null, updated: Date.now(), link: null, locked: false
    }, extra || {});
  }
  function rect(x, y, w, h, round, bg) {
    var o = { backgroundColor: bg || 'transparent' };
    if (round) o.roundness = { type: 3 };
    return base('rectangle', x, y, w, h, o);
  }
  function diamond(x, y, w, h) { return base('diamond', x, y, w, h); }
  function arrow(x, y, dx, dy) {
    return base('arrow', x, y, Math.max(2, Math.abs(dx)), Math.max(2, Math.abs(dy)), {
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      startArrowhead: null, endArrowhead: 'arrow'
      // 不设 startBinding/endBinding，让端点处于自由态；
      // 拖拽端点靠近其他元素时 Excalidraw 自动吸附绑定。
    });
  }
  function textEl(x, y, label, containerId) {
    return base('text', x, y, 120, 24, {
      text: label, fontSize: 20, fontFamily: 2, textAlign: 'center', verticalAlign: 'middle',
      containerId: containerId, originalText: label, lineHeight: 1.25, baseline: 0, autoResize: true,
      strokeColor: '#1e1e1e'
    });
  }
  // 给容器绑定居中文案（双击容器也可原生改写）
  // 文本位置在天文容器中心，避免汉字偏位
  function label(els, cont, txt) {
    var t = textEl(cont.x, cont.y, txt, cont.id);
    // 居中: 把文本元素放到容器几何中心
    t.x = Math.round(cont.x + (cont.width - t.width) / 2);
    t.y = Math.round(cont.y + (cont.height - t.height) / 2);
    cont.boundElements = [{ type: 'text', id: t.id }];
    els.push(t);
  }

  // 常用流程图模板：开始 → 处理 → 判断 →(下)结束，判断 →(右)处理
  function buildFlowchart() {
    var els = [];
    var start = rect(200, 40, 140, 50, true);
    var proc  = rect(200, 160, 140, 50, false);
    var dec   = diamond(190, 280, 160, 110);
    var end   = rect(200, 460, 140, 50, true);
    var proc2 = rect(460, 300, 140, 50, false);
    els.push(start, proc, dec, end, proc2);
    els.push(arrow(start.x + start.width / 2, start.y + start.height + 8, 0, proc.y - (start.y + start.height + 8)));
    els.push(arrow(proc.x + proc.width / 2, proc.y + proc.height + 8, 0, dec.y - (proc.y + proc.height + 8)));
    els.push(arrow(dec.x + dec.width / 2, dec.y + dec.height + 8, 0, end.y - (dec.y + dec.height + 8)));
    els.push(arrow(dec.x + dec.width + 8, dec.y + dec.height / 2,
      (proc2.x - 8) - (dec.x + dec.width + 8), (proc2.y + proc2.height / 2) - (dec.y + dec.height / 2)));
    label(els, start, '开始');
    label(els, proc,  '处理');
    label(els, dec,   '判断');
    label(els, end,   '结束');
    label(els, proc2, '处理');
    return els;
  }

  /* ============================================================
   * 单个流图元素（插入到画布中心，用户拖拽定位）
   * 每种形状创建后由 insertFlowElement 统一加文案 + 插入画布。
   * ============================================================ */
  function flowStart()  { return rect(0, 0, 140, 50, true,  '#d0ebff'); }
  function flowEnd()    { return rect(0, 0, 140, 50, true,  '#ffe3e3'); }
  function flowProcess(){ return rect(0, 0, 140, 50, false, '#f8f9fa'); }
  function flowDec()    { return diamond(0, 0, 160, 100); }
  function flowConnector() { return arrow(0, 0, 200, 0); }

  function insertFlowElement(api, el, labelText) {
    if (!api) return;
    var els = [el];
    if (labelText) {
      var t = textEl(el.x, el.y, labelText, el.id);
      // 居中文本于容器中心
      t.x = Math.round(el.x + (el.width - t.width) / 2);
      t.y = Math.round(el.y + (el.height - t.height) / 2);
      el.boundElements = [{ type: 'text', id: t.id }];
      els.push(t);
    }
    // 放到画布中心附近，略随机偏移避免完全重叠
    var cx = Math.round(((api.getAppState().width) || 800) / 2) + Math.floor(Math.random() * 40);
    var cy = 160 + Math.floor(Math.random() * 60);
    if (el.type === 'rectangle' || el.type === 'diamond') { el.x = cx - (el.width || 100) / 2; el.y = cy; }
    else if (el.type === 'arrow') { el.x = cx; el.y = cy; }
    els.forEach(function (e) { e.updated = Date.now(); });
    api.updateScene({ elements: (api.getSceneElements() || []).concat(els) });
    try { api.scrollToContent(els); } catch (_) {}
  }

  // 表格：rows×cols 矩形网格，首行为浅灰表头并预填列名；整表同组可整体移动。
  function buildTable(rows, cols) {
    rows = rows || 3; cols = cols || 3;
    var cw = 160, ch = 48, els = [], gid = 'grp' + rid();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = 120 + c * cw, y = 120 + r * ch;
        var bg = (r === 0) ? '#e9ecef' : 'transparent';
        var cell = base('rectangle', x, y, cw, ch, { backgroundColor: bg, groupIds: [gid] });
        els.push(cell);
        if (r === 0) label(els, cell, '列' + (c + 1));
      }
    }
    return els;
  }

  function insertFlowchart(api) {
    if (!api) return;
    var els = buildFlowchart();
    api.updateScene({ elements: (api.getSceneElements() || []).concat(els) });
    if (api.scrollToContent) { try { api.scrollToContent(els); } catch (_) {} }
  }
  function insertTable(api, rows, cols) {
    if (!api) return;
    var els = buildTable(rows, cols);
    api.updateScene({ elements: (api.getSceneElements() || []).concat(els) });
    if (api.scrollToContent) { try { api.scrollToContent(els); } catch (_) {} }
  }

  window.BWShapes = window.BWShapes || {};
  window.BWShapes.insertFlowchart = insertFlowchart;
  window.BWShapes.insertTable = insertTable;
  // 单个流图元素（拖拽自由组合）
  window.BWShapes.insertFlowStart   = function (api) { insertFlowElement(api, flowStart(),   '开始'); };
  window.BWShapes.insertFlowEnd     = function (api) { insertFlowElement(api, flowEnd(),     '结束'); };
  window.BWShapes.insertFlowProcess = function (api) { insertFlowElement(api, flowProcess(), '处理'); };
  window.BWShapes.insertFlowDec     = function (api) { insertFlowElement(api, flowDec(),     '判断'); };
  window.BWShapes.insertFlowConn    = function (api) { insertFlowElement(api, flowConnector()); };
})();
