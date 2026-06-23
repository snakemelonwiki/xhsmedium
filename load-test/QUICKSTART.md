# 负载测试快速开始指南

## 一、准备工作（5分钟）

### 1. 安装测试工具

```bash
# 安装 k6 (推荐)
# Windows: choco install k6
# macOS: brew install k6
# Linux: 参考 https://k6.io/docs/getting-started/installation/

# 安装 Artillery (可选)
npm install -g artillery
```

### 2. 准备测试环境

```bash
# 进入测试目录
cd load-test

# Windows
setup.bat

# Linux/macOS
chmod +x setup.sh
./setup.sh
```

### 3. 确认应用运行

```bash
# 在项目根目录启动应用
npm start

# 确认服务可访问
curl http://localhost:3000/api/auth/login
```

## 二、运行测试（5分钟）

### 快速测试（推荐新手）

```bash
# Windows
run-test.bat k6 quick

# Linux/macOS
./run-test.sh k6 quick
```

### 完整测试

```bash
# k6 完整测试（5分钟，50并发）
npm run test:k6

# Artillery 测试
npm run test:artillery

# 内存监控
npm run monitor:memory
```

## 三、查看结果

测试完成后会显示：

```
=== 负载测试报告 ===

总请求数: 15234
请求速率: 50.78 req/s

响应时间:
  P95: 1234.56ms  ← 应该 < 2000ms
  P99: 2345.67ms  ← 应该 < 3000ms

失败率: 1.23%     ← 应该 < 5%
```

### 判断标准

✓ **通过**: P95 < 2s, P99 < 3s, 错误率 < 5%
⚠ **警告**: 接近阈值，需要优化
❌ **失败**: 超过阈值，必须优化

## 四、清理数据

```bash
# 使用 Node.js 脚本（推荐）
npm run cleanup

# 或直接执行 SQL
mysql -u root -p lan_dual_role_system < cleanup-test-data.sql
```

## 五、常见问题

### 问题1: 应用未运行
```bash
# 解决：启动应用
npm start
```

### 问题2: 数据库连接失败
```bash
# 解决：检查 .env 配置
cat ../.env
```

### 问题3: 测试用户不存在
```bash
# 解决：添加测试用户
mysql -u root -p lan_dual_role_system < ../add-test-users.sql
```

## 六、文件说明

| 文件 | 说明 |
|------|------|
| `k6-load-test.js` | k6 测试脚本（主要） |
| `artillery-load-test.yml` | Artillery 配置 |
| `memory-monitor.js` | 内存监控 |
| `setup.bat/sh` | 环境准备 |
| `run-test.bat/sh` | 快速运行 |
| `cleanup-runner.js` | 数据清理 |
| `README.md` | 完整文档 |

## 七、下一步

1. 运行基线测试，记录结果
2. 如果未达标，查看 README.md 中的优化建议
3. 优化后重新测试，对比结果
4. 定期运行测试，监控性能退化

---

**需要帮助？** 查看完整文档: `README.md`
