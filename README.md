# Luma 网页版

> 一款高颜值、纯前端的 Markdown 写作与文档编辑器。
> 支持实时渲染、数学公式（KaTeX）、代码高亮、AI 智能助手（可选）、无限白板（Excalidraw）。

**这是一个纯静态站点，零构建、零后端依赖。** 任何能托管静态文件的地方都能跑——本地双击启动、局域网共享、或部署到云服务器 / 对象存储 / GitHub Pages 均可。

---

## 目录结构

```
luma-web/
├── index.html              # 入口页面（双击或用服务器打开）
├── server.js               # 零依赖 Node 静态服务器（一键脚本用它）
├── luma-start.bat          # Windows 一键启动（双击即可）
├── start.sh                # macOS / Linux 一键启动
├── README.md               # 本文件
├── INSTALL.md              # 安装部署详细教程（本地 + 云服务器）
│
├── js/                     # 编辑器核心（21 个功能模块，按依赖顺序加载）
├── css                     # 编辑器主题样式
│   ├── vite-app.css
│   ├── bw-typora-editor.css
│   ├── bw-ai.css
├── vendor/                 # 第三方库（本地，离线可用）
│   ├── markdown-it.min.js   # Markdown 解析
│   ├── html-to-image.js     # 导出图片
│   └── highlight.min.js     # 代码高亮
├── highlight/              # 代码高亮主题（github / github-dark）
├── katex.min.css / .js     # 数学公式渲染
├── fonts/                  # KaTeX 字体（本地）
└── whiteboard/             # 无限白板模块（Excalidraw，本地 vendor）
```

> 说明：本文件夹已从完整工程中**剥离出纯网页代码**，桌面端（Tauri/Windows exe）的 Rust 构建文件、`_backup` 历史备份、内部规划文档等均未包含，体积仅约 8 MB。

---

## 快速开始（最省事）

### Windows
双击 `luma-start.bat`。脚本会自动检测 Node.js 或 Python，启动服务器并打开浏览器。
没有运行环境时会提示你去下载（见 INSTALL.md）。

### macOS / Linux
```bash
chmod +x start.sh     # 只需第一次
./start.sh
```

### 手动启动（任意系统）
只要有 Node 或 Python 之一：
```bash
node server.js              # 或指定端口： node server.js 9000
# 或
python -m http.server 8000
```
然后浏览器访问 `http://localhost:8000/`。

> ⚠️ 不建议直接双击 `index.html` 用 `file://` 打开：白板、字体、部分模块在 `file://` 协议下会被浏览器安全策略拦截。**请务必通过上面的服务器方式访问。**

---

## 功能一览

- 实时 Markdown 渲染，Shift+空格 切换「源码 / 预览」
- 数学公式（行内 `$...$` 与块级 `$$...$$`，KaTeX 渲染）
- 代码块语法高亮（highlight.js，离线本地）
- 文档导出（HTML / 图片）
- 无限白板（Excalidraw，可嵌入文档）
- 主题切换（明亮 / 暗色）
- AI 智能助手（**可选**：需在设置中填入 API Key，详见下方「关于 AI 助手」）

---

## 关于 AI 助手（可选功能）

AI 副驾默认关闭。启用需在编辑器设置中填写提供商与 API Key：

- 内置支持：DeepSeek、OpenAI、Anthropic、本地 Ollama（`http://localhost:11434`）
- 该模块仅在「用户主动开启 + 填写 Key」后才联网调用对应服务，**不影响普通编辑功能**，也不在页面加载时发起任何外部请求。

---

## 下一步

- 想部署到云服务器 / 公网？看 👉 **[INSTALL.md](./INSTALL.md)**
- 遇到问题？先看 INSTALL.md 末尾的「常见问题」。
