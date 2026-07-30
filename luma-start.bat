@echo off
title Luma
cd /d "%~dp0"

echo ============================================
echo  Luma 编辑器
echo ============================================
echo.

:: 找 Node.js
set NODE=
if exist "%~dp0node.exe" (
    echo [OK] 使用自带 node.exe
    set NODE=%~dp0node.exe
    goto :found
)
if exist "D:\node.exe" (
    echo [OK] 使用 D:\node.exe
    set NODE=D:\node.exe
    goto :found
)
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] 使用系统 PATH 中的 node
    set NODE=node
    goto :found
)

echo [FAIL] 未找到 Node.js
echo.
echo 下载: https://nodejs.org/
echo 或把 node.exe 放到本目录
pause
exit /b 1

:found
:: 杀旧端口
echo [INFO] 清理旧端口...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":6789" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 启动
echo [INFO] 启动服务器...
start "luma-server" /B "%NODE%" server.js

:: 等就绪
echo [INFO] 等待就绪...
ping 127.0.0.1 -n 5 >nul

:: 开浏览器
echo [INFO] 打开浏览器...
start http://localhost:6789/

echo.
echo ============================================
echo  Luma 已启动！
echo  地址: http://localhost:6789/
echo  关此窗口停止服务器
echo ============================================
pause
