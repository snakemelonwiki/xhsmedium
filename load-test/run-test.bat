@echo off
chcp 65001 >nul

REM 快速运行测试脚本

echo === 负载测试快速启动 ===
echo.

REM 检查参数
set TEST_TYPE=%1
set DURATION=%2

if "%TEST_TYPE%"=="" set TEST_TYPE=k6
if "%DURATION%"=="" set DURATION=full

if "%TEST_TYPE%"=="k6" goto run_k6
if "%TEST_TYPE%"=="artillery" goto run_artillery
if "%TEST_TYPE%"=="memory" goto run_memory
if "%TEST_TYPE%"=="all" goto run_all
goto usage

:run_k6
echo 运行 k6 负载测试...
if "%DURATION%"=="quick" (
    echo 模式: 快速测试 (1分钟)
    k6 run --duration 1m --vus 20 k6-load-test.js
) else (
    echo 模式: 完整测试 (5分钟)
    k6 run k6-load-test.js
)
goto end

:run_artillery
echo 运行 Artillery 负载测试...
artillery run artillery-load-test.yml
goto end

:run_memory
echo 运行内存监控...
node memory-monitor.js
goto end

:run_all
echo 运行完整测试套件...
echo.
echo 1. 启动内存监控（后台）...
start /B node memory-monitor.js
timeout /t 2 /nobreak >nul

echo 2. 运行 k6 负载测试...
k6 run k6-load-test.js

echo 3. 停止内存监控...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq memory-monitor*" 2>nul

echo.
echo 测试完成！
goto end

:usage
echo 用法: run-test.bat [k6^|artillery^|memory^|all] [quick^|full]
echo.
echo 示例:
echo   run-test.bat k6 quick      # 快速 k6 测试
echo   run-test.bat k6 full       # 完整 k6 测试
echo   run-test.bat artillery     # Artillery 测试
echo   run-test.bat memory        # 内存监控
echo   run-test.bat all           # 完整测试套件
exit /b 1

:end
echo.
echo === 测试完成 ===
pause
