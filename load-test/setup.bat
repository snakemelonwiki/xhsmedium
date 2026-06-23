@echo off
chcp 65001 >nul
echo === 负载测试环境准备 ===
echo.

REM 1. 检查数据库连接
echo 1. 检查数据库连接...
mysql -h 127.0.0.1 -u root -p -e "USE lan_dual_role_system; SELECT COUNT(*) as user_count FROM users;" 2>nul
if %errorlevel% neq 0 (
    echo ❌ 数据库连接失败，请检查 MySQL 配置
    exit /b 1
)
echo ✓ 数据库连接成功
echo.

REM 2. 执行测试用户SQL
echo 2. 添加测试用户...
mysql -h 127.0.0.1 -u root -p lan_dual_role_system < ..\add-test-users.sql
if %errorlevel% equ 0 (
    echo ✓ 测试用户添加成功
) else (
    echo ⚠ 测试用户可能已存在（忽略重复键错误）
)
echo.

REM 3. 验证用户数量
echo 3. 验证测试用户...
mysql -h 127.0.0.1 -u root -p -e "USE lan_dual_role_system; SELECT role, COUNT(*) as count FROM users GROUP BY role;"
echo.

REM 4. 检查必要的测试工具
echo 4. 检查测试工具...

where k6 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ k6 已安装
    k6 version
) else (
    echo ⚠ k6 未安装
    echo   安装方法: https://k6.io/docs/getting-started/installation/
)

where artillery >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ artillery 已安装
    artillery version
) else (
    echo ⚠ artillery 未安装
    echo   安装方法: npm install -g artillery
)
echo.

REM 5. 检查应用是否运行
echo 5. 检查应用状态...
curl -s http://localhost:3000/api/auth/login >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ 应用正在运行 (http://localhost:3000)
) else (
    echo ❌ 应用未运行，请先启动应用: npm start
    exit /b 1
)
echo.

echo === 环境准备完成 ===
echo.
echo 运行测试:
echo   k6 测试:        k6 run k6-load-test.js
echo   Artillery 测试: artillery run artillery-load-test.yml
echo   内存监控:       node memory-monitor.js
echo.
pause
