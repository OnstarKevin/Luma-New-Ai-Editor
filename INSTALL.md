# Luma 网页版 · 安装与部署指南

适用场景两种：**① 本地电脑自用**（Windows / macOS / Linux）；**② 云服务器公网部署**（让任何人都能访问）。
本站点为纯静态文件，不需要数据库、不需要编译。

---

## 一、本地电脑安装（自用 / 局域网共享）

### 方式 A：一键脚本（推荐，适合非技术用户）

1. 把整个 `luma-web` 文件夹拷到电脑任意位置（比如 `桌面\luma-web`）。
2. 确认电脑装了 **Node.js** 或 **Python** 其一（二选一）：
   - Node.js：https://nodejs.org/  （下载 LTS 版，一路下一步即可）
   - Python：https://www.python.org/ （安装时**务必勾选 "Add python.exe to PATH"**）
3. 启动：
   - **Windows**：双击 `luma-start.bat`
   - **macOS / Linux**：终端里 `./start.sh`（首次需 `chmod +x start.sh`）
4. 脚本会自动开浏览器到 `http://localhost:8000/`。关掉黑色窗口即停止。

> 一键脚本会自动探测 Node → Python，谁有就用谁；都没有才弹窗提示安装。

### 方式 B：手动启动（开发者）

```bash
# 进入文件夹
cd luma-web

# 用 Node（推荐）
node server.js            # 默认 8000 端口，可加参数改端口： node server.js 9000

# 或用 Python
python -m http.server 8000
```

浏览器打开 `http://localhost:8000/` 即可。

### ⚠️ 重要：不要直接双击 index.html

`file://` 协议下，浏览器安全策略会拦截白板 iframe、字体加载和部分模块，**页面会残缺**。
必须通过上面的「服务器方式」访问（`http://localhost:...`）。

---

## 二、云服务器部署（公网可访问）

### 方案 1：Nginx 反向代理（生产推荐）

适合有自己域名、追求稳定与 HTTPS 的场景。

**1. 上传文件**
把 `luma-web` 整个文件夹上传到服务器，例如 `/var/www/luma/`。

**2. 安装 Nginx**
```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y nginx
```

**3. 写站点配置** `/etc/nginx/sites-available/luma`：
```nginx
server {
    listen 80;
    server_name luma.example.com;   # 改成你的域名

    root /var/www/luma;
    index index.html;

    # 静态资源长缓存
    location ~* \.(css|js|woff2?|ttf|svg|png|jpg|ico|json|map)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # SPA / 目录回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
启用并重启：
```bash
sudo ln -s /etc/nginx/sites-available/luma /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**4. 域名 + HTTPS（强烈建议）**
在域名解析控制台把 `luma.example.com` A 记录指向服务器 IP，然后：
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d luma.example.com
```
Certbot 会自动签发免费证书并配置 HTTPS，且自动续期。

**5. 防火墙**
- 云厂商控制台：放行 **80 / 443** 入站。
- 服务器本身（若开了 ufw）：`sudo ufw allow 'Nginx Full'`

---

### 方案 2：Node 直接跑（轻量 / 临时）

无需 Nginx，适合小流量或内网穿透：
```bash
cd /var/www/luma
PORT=8080 node server.js
```
再配合反向代理（如 Cloudflare Tunnel / frp / 宝塔）暴露到公网。
> 生产环境建议仍用 Nginx 兜一层并加 HTTPS。

---

### 方案 3：静态托管平台（零运维）

纯静态，可直接丢给以下任意平台（通常免费）：
- **GitHub Pages**：把 `luma-web` 内容推到仓库，Settings → Pages 开启。
- **对象存储 + CDN**：阿里云 OSS / 腾讯云 COS / Cloudflare Pages，开启「静态网站托管」并把根目录设为 `luma-web`。
- **Netlify / Vercel**：拖拽上传文件夹即可。

这些平台默认就是 HTTPS，最简单的公网方案。

---

## 三、关于 AI 助手（可选）

AI 副驾默认关闭、且不依赖任何外部服务即可正常编辑。
如需启用，在编辑器内「设置」填入 API Key 与提供商（DeepSeek / OpenAI / Anthropic / 本地 Ollama）。
启用后**仅在你主动使用 AI 功能时**才向对应服务发请求，页面加载本身不联网。

---

## 四、常见问题（FAQ）

**Q1：页面打不开 / 白屏？**
- 确认是用服务器方式访问（`http://localhost:...`），不是双击 `index.html`。
- 检查 8000 端口是否被占用：`node server.js 9000` 换端口试试。

**Q2：白板打不开 / 一直转圈？**
- 白板依赖 `whiteboard/vendor/` 目录完整。确认上传时没漏掉子文件夹。
- 不要用 `file://` 打开，必须走 http 服务器。

**Q3：公式、代码高亮不显示？**
- 确认 `katex.min.*`、`vendor/highlight.min.js`、`highlight/` 都在。这些是本地文件，无需联网。

**Q4：云服务器部署后访问慢？**
- 给静态资源加了 `expires` 缓存（见 Nginx 配置）后第二次会很快。
- 国内服务器建议用对象存储 + CDN，比直接回源快很多。

**Q5：想要改端口 / 绑定域名？**
- 本地：`node server.js 9000`。
- 域名：按方案 1 配 Nginx 的 `server_name`。

**Q6：会收集我的数据吗？**
- 纯前端，文档默认只存在浏览器本地（localStorage / 内存）。除非你主动使用「导出」或「AI 助手」，否则数据不出本机。

---

## 五、目录对照（部署时别漏）

部署时整包上传即可，关键项：

| 必须 | 作用 |
|---|---|
| `index.html` | 入口 |
| `js/` | 全部编辑器逻辑 |
| `vendor/`、`highlight/` | 第三方库（离线） |
| `katex.min.*`、`fonts/` | 公式与字体 |
| `whiteboard/`（含其 `vendor/`） | 白板模块 |
| `*.css` | 样式 |

`server.js` / `luma-start.bat` / `start.sh` 仅本地启动用，部署到 Nginx 等时可不传（传了也无妨）。
