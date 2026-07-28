#!/usr/bin/env node
/**
 * Luma 网页版 — 零依赖静态文件服务器
 * 仅使用 Node.js 内置模块，无需 npm install。
 *
 * 用法：
 *   node server.js            # 默认端口 8000
 *   node server.js 9000       # 指定端口
 *   PORT=9000 node server.js  # 或用环境变量
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function safeJoin(root, urlPath) {
  // 防止路径穿越攻击：解析后必须仍在 root 之内
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.normalize(path.join(root, decoded));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let target = safeJoin(ROOT, req.url);
  if (!target) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }
  fs.stat(target, (err, stat) => {
    if (!err && stat.isDirectory()) {
      target = path.join(target, 'index.html');
    }
    // 根路径或目录回退到 index.html
    if (req.url === '/' || req.url === '') {
      target = path.join(ROOT, 'index.html');
    }
    fs.stat(target, (err2) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      sendFile(res, target);
    });
  });
});

server.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}/`;
  console.log('──────────────────────────────────────────');
  console.log('  Luma 网页版已启动');
  console.log(`  本机访问：${localUrl}`);
  console.log(`  局域网访问：http://<本机IP>:${PORT}/`);
  console.log('  按 Ctrl+C 停止');
  console.log('──────────────────────────────────────────');

  // 自动打开浏览器（仅本机启动时）
  const openCmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start ""' :
    'xdg-open';
  try {
    exec(`${openCmd} ${localUrl}`, (e) => { if (e) { /* 忽略打开失败 */ } });
  } catch (_) { /* 忽略 */ }
});
