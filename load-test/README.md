# 负载测试文档

## 概述

本目录包含针对运营中台系统的并发负载测试脚本和工具，用于验证系统在高并发场景下的性能表现。

## 测试目标

- **列表接口响应时间**: < 2秒 (P95)
- **提交接口响应时间**: < 3秒 (P95)
- **并发用户数**: 30-50个
- **错误率**: < 5%
- **数据完整性**: 无数据丢失
- **内存稳定性**: 无内存泄漏

## 测试工具

### 1. k6 (推荐)

高性能负载测试工具，使用 JavaScript 编写测试脚本。

**安装**:
```bash
# Windows (使用 Chocolatey)
choco install k6

# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 2. Artillery

基于 Node.js 的现代负载测试工具。

**安装**:
```bash
npm install -g artillery
```

## 测试准备

### 1. 数据库准备

确保测试用户已添加到数据库：

```bash
# 执行测试用户SQL
mysql -h 127.0.0.1 -u root -p lan_dual_role_system < add-test-users.sql
```

测试用户包括：
- 15个运营员工 (staff1-staff15)
- 15个销售员工 (sales1-sales15)
- 5个主管 (admin2-admin6)
- 10个教务员工 (academic02-academic11)

所有测试用户密码统一为: `test123`

### 2. 启动应用

```bash
# 在项目根目录
npm start
```

确认应用运行在:
- 运营端: http://localhost:3000
- 老板端: http://localhost:3001

### 3. 运行准备脚本

```bash
# Windows
cd load-test
setup.bat

# Linux/macOS
cd load-test
chmod +x setup.sh
./setup.sh
```

## 运行测试

### k6 负载测试

```bash
cd load-test

# 运行完整测试 (5分钟，峰值50用户)
k6 run k6-load-test.js

# 快速测试 (1分钟，峰值20用户)
k6 run --duration 1m --vus 20 k6-load-test.js

# 生成HTML报告
k6 run --out json=test-results.json k6-load-test.js
```

### Artillery 负载测试

```bash
cd load-test

# 运行完整测试
artillery run artillery-load-test.yml

# 生成HTML报告
artillery run --output report.json artillery-load-test.yml
artillery report report.json
```

### 内存泄漏监控

在负载测试期间，同时运行内存监控：

```bash
cd load-test
node memory-monitor.js
```

监控会每5秒记录一次内存使用情况，测试结束后生成报告。

## 测试场景

### 场景1: 客资看板操作 (40%)

1. 用户登录
2. 查看客资列表（第1页）
3. 翻页查看（第2页）

### 场景2: 作品看板操作 (30%)

1. 用户登录
2. 查看作品列表（第1页）
3. 翻页查看（第2页）

### 场景3: 录入客资 (15%)

1. 用户登录
2. 获取账号列表
3. 提交新客资

### 场景4: 录入作品 (15%)

1. 用户登录
2. 获取账号列表
3. 提交新作品

## 测试阶段

### k6 测试阶段

1. **预热** (30秒): 10个并发用户
2. **增长** (1分钟): 增加到30个用户
3. **峰值** (2分钟): 50个并发用户
4. **降低** (1分钟): 降到30个用户
5. **冷却** (30秒): 逐步停止

### Artillery 测试阶段

1. **预热** (30秒): 5 req/s
2. **增长** (1分钟): 15 req/s
3. **峰值** (2分钟): 25 req/s
4. **降低** (1分钟): 10 req/s

## 结果分析

### k6 报告

测试完成后会输出：

```
=== 负载测试报告 ===

总请求数: 15234
请求速率: 50.78 req/s

响应时间:
  平均: 245.32ms
  中位数: 198.45ms
  P95: 1234.56ms
  P99: 2345.67ms
  最大: 3456.78ms

失败率: 1.23%
错误率: 1.45%

阈值检查:
  http_req_duration: ✓ 通过
  http_req_failed: ✓ 通过
  errors: ✓ 通过
```

### 关键指标

- **P95 < 2000ms**: 95%的列表请求在2秒内完成
- **P99 < 3000ms**: 99%的提交请求在3秒内完成
- **错误率 < 5%**: 系统稳定性良好
- **内存增长 < 20%**: 无明显内存泄漏

### 内存监控报告

```json
{
  "snapshots": [...],
  "summary": {
    "first": { "rss": "125.45MB", "heapUsed": "45.23MB" },
    "last": { "rss": "132.67MB", "heapUsed": "48.91MB" },
    "rssGrowth": "7.22MB",
    "heapGrowth": "3.68MB",
    "leak": {
      "growth": "3.68MB",
      "growthRate": "8.14%",
      "isLeaking": false
    }
  }
}
```

## 故障排查

### 问题1: 连接被拒绝

**症状**: `connection refused` 错误

**解决**:
- 确认应用已启动: `curl http://localhost:3000/api/auth/login`
- 检查端口占用: `netstat -ano | findstr :3000`

### 问题2: 数据库连接失败

**症状**: `ECONNREFUSED` 或 `ER_ACCESS_DENIED_ERROR`

**解决**:
- 检查 MySQL 服务状态
- 验证 `.env` 文件中的数据库配置
- 确认测试用户已添加

### 问题3: 高错误率

**症状**: 错误率 > 10%

**可能原因**:
- 数据库连接池耗尽
- 测试账号不存在
- 必需的账号数据缺失

**解决**:
- 检查数据库连接池配置
- 验证测试用户和账号数据
- 降低并发用户数重新测试

### 问题4: 响应时间过长

**症状**: P95 > 3秒

**可能原因**:
- 数据库查询未优化
- 缺少索引
- 服务器资源不足

**解决**:
- 检查慢查询日志
- 验证数据库索引
- 监控 CPU/内存使用率

## 清理测试数据

测试完成后，清理负载测试产生的数据：

```sql
-- 删除测试客资（根据note字段识别）
DELETE FROM leads WHERE note = '负载测试数据';

-- 删除测试作品
DELETE FROM posts WHERE note = '负载测试数据';

-- 可选：删除测试用户（保留用于下次测试）
-- DELETE FROM users WHERE username LIKE 'staff%' OR username LIKE 'sales%';
```

## 文件说明

- `k6-load-test.js`: k6 负载测试脚本
- `artillery-load-test.yml`: Artillery 测试配置
- `artillery-processor.js`: Artillery 数据生成器
- `test-users.csv`: 测试用户列表
- `memory-monitor.js`: 内存泄漏监控脚本
- `setup.sh` / `setup.bat`: 环境准备脚本
- `README.md`: 本文档

## 最佳实践

1. **逐步增加负载**: 从小规模开始，逐步增加并发数
2. **监控系统资源**: 同时监控 CPU、内存、数据库连接数
3. **多次测试**: 运行多次测试确保结果稳定
4. **隔离环境**: 在专用测试环境运行，避免影响生产
5. **数据清理**: 测试后及时清理测试数据
6. **记录基线**: 保存首次测试结果作为性能基线

## 性能优化建议

如果测试未达标，考虑以下优化：

1. **数据库优化**
   - 添加缺失的索引
   - 优化慢查询
   - 增加连接池大小

2. **应用层优化**
   - 实现响应缓存
   - 使用连接池
   - 异步处理非关键操作

3. **架构优化**
   - 引入 Redis 缓存
   - 读写分离
   - 负载均衡

## 联系支持

如有问题，请查看：
- 项目文档: `CLAUDE.md`
- 数据库文档: `MYSQL_SETUP.md`
- 提交 Issue 到项目仓库
