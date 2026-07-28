#!/usr/bin/env bash
# Luma 网页版 一键启动（macOS / Linux）
# 用法：  ./start.sh
# 赋予执行权限（首次）：  chmod +x start.sh

set -e
cd "$(dirname "$0")"

echo "=================================================="
echo "         Luma 网页版 - 一键启动"
echo "=================================================="
echo

# 优先用 Node（server.js 自带，零依赖）
if command -v node >/dev/null 2>&1; then
    echo "[1/2] 检测到 Node.js，使用内置服务器启动..."
    echo
    node server.js
    exit 0
fi

# 其次用 Python 3
if command -v python3 >/dev/null 2>&1; then
    echo "[1/2] 检测到 Python3，使用内置 http.server 启动..."
    echo
    (sleep 1; xdg-open http://localhost:6789/ 2>/dev/null || open http://localhost:6789/ 2>/dev/null || true) &
    python3 -m http.server 6789
    exit 0
fi

if command -v python >/dev/null 2>&1; then
    echo "[1/2] 检测到 Python，使用内置 http.server 启动..."
    echo
    (sleep 1; xdg-open http://localhost:6789/ 2>/dev/null || open http://localhost:6789/ 2>/dev/null || true) &
    python -m http.server 6789
    exit 0
fi

echo "[错误] 未检测到 Node.js 或 Python。"
echo "请安装其一后重试："
echo "  - Node.js: https://nodejs.org/  （推荐）"
echo "  - Python:  https://www.python.org/"
exit 1
