#!/bin/bash

# 快速运行测试脚本

echo "=== 负载测试快速启动 ==="
echo ""

# 检查参数
TEST_TYPE=${1:-k6}
DURATION=${2:-full}

case $TEST_TYPE in
  k6)
    echo "运行 k6 负载测试..."
    if [ "$DURATION" = "quick" ]; then
      echo "模式: 快速测试 (1分钟)"
      k6 run --duration 1m --vus 20 k6-load-test.js
    else
      echo "模式: 完整测试 (5分钟)"
      k6 run k6-load-test.js
    fi
    ;;
  artillery)
    echo "运行 Artillery 负载测试..."
    artillery run artillery-load-test.yml
    ;;
  memory)
    echo "运行内存监控..."
    node memory-monitor.js
    ;;
  all)
    echo "运行完整测试套件..."
    echo ""
    echo "1. 启动内存监控（后台）..."
    node memory-monitor.js &
    MONITOR_PID=$!
    sleep 2

    echo "2. 运行 k6 负载测试..."
    k6 run k6-load-test.js

    echo "3. 停止内存监控..."
    kill $MONITOR_PID 2>/dev/null

    echo ""
    echo "测试完成！"
    ;;
  *)
    echo "用法: ./run-test.sh [k6|artillery|memory|all] [quick|full]"
    echo ""
    echo "示例:"
    echo "  ./run-test.sh k6 quick      # 快速 k6 测试"
    echo "  ./run-test.sh k6 full       # 完整 k6 测试"
    echo "  ./run-test.sh artillery     # Artillery 测试"
    echo "  ./run-test.sh memory        # 内存监控"
    echo "  ./run-test.sh all           # 完整测试套件"
    exit 1
    ;;
esac

echo ""
echo "=== 测试完成 ==="
