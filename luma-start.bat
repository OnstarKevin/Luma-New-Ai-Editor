@echo off
chcp 65001 >nul
title Luma 网页版 一键启动
setlocal

:: 切换到本脚本所在目录（无论从哪里双击）
cd /d "%~dp0"

echo ==================================================
echo          Luma 网页版 - 一键启动
echo ==================================================
echo.

:: 优先用 Node（server.js 自带，零依赖）
where node >nul 2>nul
if %errorlevel%==0 (
    echo [1/2] 检测到 Node.js，使用内置服务器启动...
    echo.
    node server.js
    goto :end
)

:: 其次用 Python 自带 http.server
where python >nul 2>nul
if %errorlevel%==0 (
    echo [1/2] 检测到 Python，使用内置 http.server 启动...
    echo.
    start "" http://localhost:8000/
    python -m http.server 8000
    goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
    echo [1/2] 检测到 Python (py)，使用内置 http.server 启动...
    echo.
    start "" http://localhost:8000/
    py -m http.server 8000
    goto :end
)

:: 都没有，提示安装
echo [错误] 未检测到 Node.js 或 Python。
echo.
echo 请二选一安装后重试：
echo   - Node.js: https://nodejs.org/  （推荐，装完直接双击本文件）
echo   - Python:  https://www.python.org/  （安装时勾选 "Add to PATH"）
echo.
pause
:end
endlocal
