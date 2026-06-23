#!/bin/bash

# 负载测试准备脚本

echo "=== 负载测试环境准备 ==="
echo ""

# 1. 检查数据库连接
echo "1. 检查数据库连接..."
mysql -h 127.0.0.1 -u root -p -e "USE lan_dual_role_system; SELECT COUNT(*) as user_count FROM users;" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ 数据库连接失败，请检查 MySQL 配置"
    exit 1
fi
echo "✓ 数据库连接成功"
echo ""

# 2. 执行测试用户SQL
echo "2. 添加测试用户..."
mysql -h 127.0.0.1 -u root -p lan_dual_role_system < ../add-test-users.sql
if [ $? -eq 0 ]; then
    echo "✓ 测试用户添加成功"
else
    echo "⚠ 测试用户可能已存在（忽略重复键错误）"
fi
echo ""

# 3. 验证用户数量
echo "3. 验证测试用户..."
mysql -h 127.0.0.1 -u root -p -e "USE lan_dual_role_system; SELECT role, COUNT(*) as count FROM users GROUP BY role;"
echo ""

# 4. 检查必要的测试工具
echo "4. 检查测试工具..."

if command -v k6 &> /dev/null; then
    echo "✓ k6 已安装: $(k6 version)"
else
    echo "⚠ k6 未安装"
    echo "  安装方法: https://k6.io/docs/getting-started/installation/"
fi

if command -v artillery &> /dev/null; then
    echo "✓ artillery 已安装: $(artillery version)"
else
    echo "⚠ artillery 未安装"
    echo "  安装方法: npm install -g artillery"
fi
echo ""

# 5. 检查应用是否运行
echo "5. 检查应用状态..."
if curl -s http://localhost:3000/api/auth/login > /dev/null 2>&1; then
    echo "✓ 应用正在运行 (http://localhost:3000)"
else
    echo "❌ 应用未运行，请先启动应用: npm start"
    exit 1
fi
echo ""

echo "=== 环境准备完成 ==="
echo ""
echo "运行测试:"
echo "  k6 测试:        k6 run k6-load-test.js"
echo "  Artillery 测试: artillery run artillery-load-test.yml"
echo "  内存监控:       node memory-monitor.js"
echo ""
