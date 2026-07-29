# Luma 插件开发指南

Luma 支持第三方格式检查 / 写作辅助插件。插件放置在 `plugins/` 目录下，通过 `window.LumaPlugins.register()` 注册。

## 目录结构

```
plugins/
├── README.md                     ← 本文件
└── luogu-checker/                ← 洛谷格式检查插件（参考实现）
    └── luogu-checker.js
```

## 插件接入方法

### 1. 在 `index.html` 引入插件脚本

```html
<script src="plugins/luogu-checker/luogu-checker.js" defer></script>
```

### 2. 插件调用 `LumaPlugins.register()` 注册自身

```javascript
window.LumaPlugins.register({
  name: '插件名称',                  // 必填，显示在插件列表
  description: '一句话描述',         // 可选
  version: '1.0.0',                 // 可选
  icon: '✅',                       // 可选，emoji 图标
  run: function (host, ctx) {       // 必填，运行入口
    var md = ctx.markdown;          // 当前文档 Markdown
    // ... 检查逻辑 ...
    return {
      issues: [
        { line: 3, col: 5, severity: 'warn', message: '问题简述', hint: '修改建议', snippet: '原行内容' }
      ],
      summary: '可选：人类可读的总结'
    };
  }
});
```

## Issue 结构

| 字段 | 类型 | 说明 |
|---|---|---|
| `line` | number | 行号（从 1 开始） |
| `col` | number | 列号（从 1 开始），可选 |
| `severity` | `'warn' \| 'error' \| 'info'` | 严重程度 |
| `message` | string | 一句话说明问题 |
| `hint` | string | 可选：如何修复 |
| `snippet` | string | 可选：问题所在行的原文 |

## 工具栏入口

插件注册后，工具栏的「🔌 插件」按钮会列出所有已注册插件，点击即可运行。运行结果以面板形式浮层展示。

## 范例：洛谷题解格式检查

`plugins/luogu-checker/luogu-checker.js` 是一个完整的参考实现。它检查：
1. 中英文之间是否加了空格
2. 中文段落是否以全角标点结尾
3. LaTeX 是否被滥用包裹普通单词

## 编写自己的插件

1. 在 `plugins/` 下新建子目录，例如 `plugins/my-checker/`
2. 创建 `my-checker.js`
3. 在文件头 IIFE 内调用 `window.LumaPlugins.register({...})`
4. 在 `index.html` 加 `<script src="plugins/my-checker/my-checker.js" defer></script>`

## 调试

```javascript
// 浏览器控制台：
LumaPlugins.list()                    // 列出所有已注册插件
LumaPlugins.runOne('洛谷题解格式检查')  // 单独运行
```