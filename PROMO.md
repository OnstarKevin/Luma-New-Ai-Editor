<!--
  发布前请替换以下占位符：
  - {{REPO_URL}}   你的 GitHub 仓库地址，例如 https://github.com/yourname/luma
  - {{DEMO_URL}}   在线演示地址，例如 https://luma.example.com/
  - {{VERSION}}    版本号（当前 1.0.0）
  中文版适用于：掘金 / CSDN / 知乎 / 微信公众号 / 开源中国 / SegmentFault
  英文版适用于：Dev.to / Medium / Hacker News / Reddit(r/selfhosted, r/opensource) / Lobsters
-->

# Luma：一款零构建、可完全离线的纯静态 Markdown 编辑器

> 如果你受够了臃肿的笔记软件、被迫登录的云盘、以及「打开网页才能写东西」的束缚——Luma 想给你另一种可能：**一个文件夹，双击就能写，断网也能用。**

---

## 为什么要做 Luma

市面上的 Markdown 工具两极分化：要么是把所有数据锁在自家云端的「账号型」产品，要么是需要 Node/Python/构建链一大套才能跑起来的「工程师型」项目。

我们想要的是中间态：

- **颜值在线**——留白、柔和、治愈，写作时不碍眼；
- **零门槛**——不改配置、不装依赖（或一键装好），给爸妈都能用；
- **数据自主**——文档默认就在你本地，不上传、不追踪；
- **离线可用**——高铁上、飞机上、内网里，照样写得动。

Luma 就是照着这几条做出来的：**纯前端、零构建、零后端、可完全离线**的 Markdown 编辑器。

---

## 它都能干什么

| 能力 | 说明 |
|---|---|
| 实时渲染 | 边写边看，Shift+空格 一键切换「源码 / 预览」 |
| 数学公式 | 行内 `$...$` 与块级 `$$...$$`，KaTeX 渲染，学术写作友好 |
| 代码高亮 | highlight.js，本地离线，常见语言开箱即用 |
| 无限白板 | 内置 Excalidraw，画完可直接嵌回文档 |
| 文档导出 | 一键导出 HTML / 图片，方便分享 |
| 主题切换 | 明亮 / 暗色随心换 |
| 可选 AI 助手 | 默认关闭；填 Key 才联网（DeepSeek / OpenAI / Anthropic / 本地 Ollama） |

重点说一下**离线**：整个 `luma-web` 包约 8 MB，所有第三方库（Markdown 解析、KaTeX、highlight.js、Excalidraw、字体）全部本地打包，**运行时不依赖任何外部 CDN**。这对国内网络环境、内网部署、以及注重隐私的用户尤其重要。

---

## 三步跑起来

**Windows 用户**：把文件夹拷过去，双击 `luma-start.bat`，浏览器自动打开。

**macOS / Linux 用户**：

```bash
chmod +x start.sh
./start.sh
```

**手动（任意系统，有 Node 或 Python 其一即可）**：

```bash
node server.js              # 或指定端口： node server.js 9000
# 或者
python -m http.server 6789
```

然后访问 `http://localhost:6789/` 即可（默认 6789，被占用时 Node 会自动顺延）。

> 提醒：请务必通过「服务器方式」访问，不要直接双击 `index.html`（`file://` 协议下白板和字体会被浏览器拦截）。

---

## 想让所有人都能访问？

纯静态意味着部署极简，三选一：

1. **Nginx**（生产推荐）：上传文件夹 + 一份配置，再上 Certbot 白嫖 HTTPS；
2. **对象存储 + CDN**（国内最快）：阿里云 OSS / 腾讯云 COS 开启「静态网站托管」；
3. **GitHub Pages / Netlify / Vercel**：拖文件夹即上线，默认 HTTPS。

详细步骤见仓库里的 `INSTALL.md`。

---

## 谁适合用

- 想有个**本地优先、不被绑架**的写作工具的笔记党；
- 需要写**带公式的技术文档 / 课程讲义**的老师与学生；
- 要做**内网知识库 / 私有部署**的团队；
- 喜欢折腾、想把编辑器**自己托管**的极客。

---

## 获取与反馈

- 仓库：{{REPO_URL}}
- 在线演示：{{DEMO_URL}}
- 版本：{{VERSION}}，持续更新中

如果它帮你少装了一个软件、多写了一段文字，欢迎 Star / 转发。也欢迎在 Issue 里提需求——尤其是「你想要但现有工具没给到的」那种。

**Luma：把写作还给本地，把简单还给每个人。**

---
---

# Luma: A Zero-Build, Fully Offline Static Markdown Editor

> Tired of bloated note apps, forced logins, and "you must be online to write" walls? Luma offers another path: **one folder, double-click to write, works offline.**

## Why Luma

Markdown tools today fall into two camps: cloud-locked "account" products that hoard your data, or "engineer" projects that need Node/Python/a full build chain before they'll even start.

Luma is the middle ground:

- **Beautiful by default** — calm, airy, distraction-free writing.
- **Zero friction** — no config, no dependencies (or one click to install).
- **Data sovereignty** — your documents stay local; nothing is uploaded or tracked.
- **Offline-first** — works on a train, a plane, or an intranet.

Luma is a **pure-frontend, zero-build, zero-backend, fully offline-capable** Markdown editor.

## What it does

| Capability | Notes |
|---|---|
| Live preview | Write and see at once; Shift+Space toggles source / preview |
| Math | Inline `$...$` and block `$$...$$`, rendered by KaTeX |
| Code highlight | highlight.js, bundled locally, offline |
| Infinite whiteboard | Built-in Excalidraw, embeddable back into docs |
| Export | One-click to HTML / image |
| Themes | Light / dark |
| Optional AI copilot | Off by default; connects only when you add a Key (DeepSeek / OpenAI / Anthropic / local Ollama) |

The key word is **offline**: the whole `luma-web` package is ~8 MB. Every third-party library (Markdown parser, KaTeX, highlight.js, Excalidraw, fonts) is vendored locally — **no runtime CDN dependency at all**.

## Up and running in three steps

**Windows**: copy the folder, double-click `luma-start.bat`, browser opens automatically.

**macOS / Linux**:

```bash
chmod +x start.sh
./start.sh
```

**Manual** (any OS, with Node or Python):

```bash
node server.js              # or: node server.js 9000
# or
python -m http.server 6789
```

Then open `http://localhost:6789/` (default 6789; Node auto-increments if busy).

> Note: always use a server. Don't open `index.html` via `file://` — the whiteboard and fonts are blocked by browser security there.

## Deploy for everyone

Being static makes deployment trivial:

1. **Nginx** (production): upload + a config, then Certbot for free HTTPS.
2. **Object storage + CDN** (fastest in CN): Aliyun OSS / Tencent COS "static website hosting".
3. **GitHub Pages / Netlify / Vercel**: drag the folder, done, HTTPS by default.

Full steps are in `INSTALL.md`.

## Who it's for

- Note-takers who want **local-first, unbothered** tools.
- Teachers/students writing **formula-heavy docs / lecture notes**.
- Teams needing an **intranet / private** knowledge base.
- Tinkerers who want to **self-host** their editor.

## Get it

- Repo: {{REPO_URL}}
- Live demo: {{DEMO_URL}}
- Version: {{VERSION}}

If it helps you uninstall one app and write one more paragraph, a Star / share means a lot. Feature requests welcome — especially the "I want this but no tool gives it to me" kind.

**Luma: give writing back to local, give simplicity back to everyone.**
