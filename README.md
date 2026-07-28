# Luma 网页版 · 纯静态 Markdown 编辑器

> **Luma** — a beautiful, zero-build, pure-frontend Markdown editor.
> 实时渲染 · 数学公式 · 代码高亮 · 无限白板 · 可选 AI 助手 / Live preview · KaTeX math · code highlight · infinite whiteboard · optional AI copilot.

**关键词 / Keywords:** Markdown 编辑器, 静态站点, 离线, 纯前端, KaTeX, 代码高亮, 白板, Excalidraw, 文档工具, 写作, 开源, Markdown editor, static site, offline, no-build, note-taking, documentation tool

**语言 / Language:** [中文](#中文) · [English](#english)

---

<h2 id="中文">中文</h2>

一款高颜值、纯前端的 Markdown 写作与文档编辑器。支持实时渲染、数学公式（KaTeX）、代码高亮、AI 智能助手（可选）、无限白板（Excalidraw）。

**这是一个纯静态站点，零构建、零后端依赖。** 任何能托管静态文件的地方都能跑——本地双击启动、局域网共享、或部署到云服务器 / 对象存储 / GitHub Pages 均可。

### 目录结构

```
luma-web/
├── index.html              # 入口页面（通过服务器打开，勿用 file://）
├── server.js               # 零依赖 Node 静态服务器（一键脚本用它）
├── luma-start.bat          # Windows 一键启动（双击即可）
├── start.sh                # macOS / Linux 一键启动
├── README.md               # 本文件（中英双语）
├── INSTALL.md              # 安装部署详细教程（本地 + 云服务器）
│
├── js/                     # 编辑器核心（21 个功能模块，按依赖顺序加载）
├── css                     # 编辑器主题样式（vite-app / bw-typora-editor / bw-ai）
├── vendor/                 # 第三方库（本地，离线可用）
│   ├── markdown-it.min.js   # Markdown 解析
│   ├── html-to-image.js     # 导出图片
│   └── highlight.min.js     # 代码高亮
├── highlight/              # 代码高亮主题（github / github-dark）
├── katex.min.css / .js     # 数学公式渲染
├── fonts/                  # KaTeX 字体（本地）
└── whiteboard/             # 无限白板模块（Excalidraw，本地 vendor）
```

> 说明：本文件夹已从完整工程中**剥离出纯网页代码**，桌面端（Tauri/Windows exe）的 Rust 构建文件、`_backup` 历史备份、内部规划文档等均未包含，体积仅约 8 MB。整个包**零运行时外部依赖**，可完全离线运行。

### 快速开始

- **Windows**：双击 `luma-start.bat`（自动探测 Node.js / Python）。
- **macOS / Linux**：`./start.sh`（首次 `chmod +x start.sh`）。
- **手动**：`node server.js`（或 `node server.js 9000`）/ `python -m http.server 8000`，访问 `http://localhost:8000/`。

> ⚠️ 不要直接双击 `index.html` 用 `file://` 打开：白板、字体、部分模块在 `file://` 下会被浏览器安全策略拦截。**务必通过服务器方式访问。**

### 功能一览

- 实时 Markdown 渲染，Shift+空格 切换「源码 / 预览」
- 数学公式（行内 `$...$` 与块级 `$$...$$`，KaTeX 渲染）
- 代码块语法高亮（highlight.js，离线本地）
- 文档导出（HTML / 图片）
- 无限白板（Excalidraw，可嵌入文档）
- 主题切换（明亮 / 暗色）
- AI 智能助手（**可选**：需在设置中填入 API Key）

### 关于 AI 助手（可选）

AI 副驾默认关闭。启用需在编辑器设置中填写提供商与 API Key（DeepSeek / OpenAI / Anthropic / 本地 Ollama）。该模块仅在用户主动开启且填写 Key 后才联网，**不影响普通编辑功能**，页面加载不发起任何外部请求。

### 部署

本地自用看上面；公网部署（Nginx / 对象存储 / GitHub Pages 等）详见 **[INSTALL.md](./INSTALL.md)**。

---

<h2 id="english">English</h2>

A beautiful, pure-frontend Markdown writing & document editor. Features live preview, math (KaTeX), code highlighting, an optional AI copilot, and an infinite whiteboard (Excalidraw).

**It is a 100% static site — zero build step, zero backend.** Run it anywhere static files can be served: double-click to launch locally, share over LAN, or deploy to a cloud server / object storage / GitHub Pages.

### Project Structure

```
luma-web/
├── index.html              # Entry page (open via a server, not file://)
├── server.js               # Zero-dependency Node static server (used by the launchers)
├── luma-start.bat          # One-click launcher for Windows
├── start.sh                # One-click launcher for macOS / Linux
├── README.md               # This file (bilingual)
├── INSTALL.md              # Full install & deploy guide (local + cloud)
│
├── js/                     # Editor core (21 feature modules, loaded in dependency order)
├── css                     # Editor themes (vite-app / bw-typora-editor / bw-ai)
├── vendor/                 # Vendored libraries (local, works offline)
│   ├── markdown-it.min.js   # Markdown parsing
│   ├── html-to-image.js     # Export to image
│   └── highlight.min.js     # Code highlighting
├── highlight/              # Highlight.js themes (github / github-dark)
├── katex.min.css / .js     # Math rendering
├── fonts/                  # KaTeX fonts (local)
└── whiteboard/             # Infinite whiteboard module (Excalidraw, local vendor)
```

> Note: this folder contains only the **pure web code** extracted from the full project. The desktop (Tauri / Windows exe) Rust build, `_backup`, and internal planning docs are excluded — about 8 MB total. The package has **zero runtime external dependencies** and runs fully offline.

### Quick Start

- **Windows**: double-click `luma-start.bat` (auto-detects Node.js / Python).
- **macOS / Linux**: `./start.sh` (run `chmod +x start.sh` once first).
- **Manual**: `node server.js` (or `node server.js 9000`) / `python -m http.server 8000`, then open `http://localhost:8000/`.

> ⚠️ Do **not** open `index.html` directly with `file://`: the whiteboard, fonts, and some modules are blocked by browser security policies under `file://`. Always use a server.

### Features

- Live Markdown rendering; Shift+Space to toggle source / preview
- Math (inline `$...$` and block `$$...$$`, rendered by KaTeX)
- Code-block syntax highlighting (highlight.js, local/offline)
- Document export (HTML / image)
- Infinite whiteboard (Excalidraw, embeddable in documents)
- Theme switching (light / dark)
- Optional AI copilot (enable in settings with an API Key)

### About the AI Copilot (Optional)

The AI assistant is **off by default**. To enable it, enter a provider and API Key (DeepSeek / OpenAI / Anthropic / local Ollama) in settings. It only calls the provider when you actively use AI features and never makes external requests on page load.

### Deploy

For local use see above. For public deployment (Nginx / object storage / GitHub Pages, etc.) see **[INSTALL.md](./INSTALL.md)**.
