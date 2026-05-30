@echo off
chcp 65001 >nul
title 运营中台 - 一键启动
cd /d "%~dp0"

echo ============================================
echo   运营中台 一键启动
echo ============================================
echo.

REM 1) Node 检测
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node 18 或更高版本
    echo         https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [Node] %%v

REM 2) .env 检测
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [警告] 已从 .env.example 生成 .env
        echo         请打开 .env 填写 MYSQL_PASSWORD 后再次运行本脚本
        pause
        exit /b 1
    ) else (
        echo [错误] 缺少 .env 且 .env.example 也不存在
        pause
        exit /b 1
    )
)
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo [警告] 已从 backend\.env.example 生成 backend\.env
        echo         请打开 backend\.env 填写 MYSQL_PASSWORD 和 JWT_SECRET 后再次运行
        pause
        exit /b 1
    ) else (
        echo [错误] 缺少 backend\.env 且 backend\.env.example 也不存在
        pause
        exit /b 1
    )
)

REM 3) 依赖
if not exist "node_modules" (
    echo [步骤 1/3] 安装根目录依赖...
    call npm install
    if errorlevel 1 goto :fail
) else (
    echo [步骤 1/3] 根目录依赖已就绪
)
if not exist "backend\node_modules" (
    echo [步骤 2/3] 安装 backend 依赖...
    pushd backend
    call npm install
    popd
    if errorlevel 1 goto :fail
) else (
    echo [步骤 2/3] backend 依赖已就绪
)

REM 4) 启动
echo [步骤 3/3] 启动服务...
echo.
echo   前端 / 员工 / 销售入口 : http://localhost:3002
echo   总后台入口            : http://localhost:3001
echo   NestJS API            : http://localhost:8089/api/*
echo.
echo   关闭本窗口即可停止服务
echo ============================================
echo.

call npm start

goto :end

:fail
echo.
echo [失败] 请向上翻看错误信息排查
pause
exit /b 1

:end
echo.
echo 服务已停止。按任意键退出窗口...
pause >nul
