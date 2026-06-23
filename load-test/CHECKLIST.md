# 负载测试文件清单

## 测试脚本
- [x] k6-load-test.js - k6 负载测试主脚本
- [x] artillery-load-test.yml - Artillery 测试配置
- [x] artillery-processor.js - Artillery 数据生成器
- [x] memory-monitor.js - 内存泄漏监控脚本

## 配置文件
- [x] test-users.csv - 测试用户列表（45个用户）
- [x] package.json - npm 脚本配置

## 准备脚本
- [x] setup.bat - Windows 环境准备脚本
- [x] setup.sh - Linux/macOS 环境准备脚本
- [x] setup-check.js - Node.js 环境检查脚本

## 运行脚本
- [x] run-test.bat - Windows 快速运行脚本
- [x] run-test.sh - Linux/macOS 快速运行脚本

## 清理脚本
- [x] cleanup-test-data.sql - SQL 数据清理脚本
- [x] cleanup-runner.js - Node.js 数据清理脚本

## 文档
- [x] README.md - 完整测试文档
- [x] QUICKSTART.md - 快速开始指南
- [x] CHECKLIST.md - 本文件

## 测试目标

### 性能指标
- 列表接口 P95 < 2秒
- 提交接口 P99 < 3秒
- 错误率 < 5%
- 并发用户: 30-50个

### 测试场景
1. 客资看板操作 (40%)
2. 作品看板操作 (30%)
3. 录入客资 (15%)
4. 录入作品 (15%)

### 测试阶段
1. 预热: 10用户 (30秒)
2. 增长: 30用户 (1分钟)
3. 峰值: 50用户 (2分钟)
4. 降低: 30用户 (1分钟)
5. 冷却: 0用户 (30秒)

## 使用流程

1. ✓ 准备环境: `setup.bat` 或 `setup.sh`
2. ✓ 检查环境: `npm run setup`
3. ✓ 运行测试: `npm run test:k6`
4. ✓ 监控内存: `npm run monitor:memory`
5. ✓ 清理数据: `npm run cleanup`

## 输出文件

测试运行后会生成：
- `load-test-summary.json` - k6 测试结果
- `memory-monitor-report.json` - 内存监控报告
- `report.json` - Artillery 测试结果（可选）

## 状态

✓ 所有文件已创建
✓ 测试脚本已完成
✓ 文档已完成
✓ 准备就绪
