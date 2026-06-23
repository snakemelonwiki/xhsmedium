const http = require('http');
const v8 = require('v8');

const MONITOR_INTERVAL = 5000; // 5秒
const TEST_DURATION = 300000; // 5分钟
const API_URL = 'http://localhost:3000/api/auth/login';

let startTime = Date.now();
let memorySnapshots = [];
let requestCount = 0;
let errorCount = 0;

console.log('=== 内存泄漏监控启动 ===\n');
console.log(`监控间隔: ${MONITOR_INTERVAL / 1000}秒`);
console.log(`测试时长: ${TEST_DURATION / 1000}秒`);
console.log(`目标API: ${API_URL}\n`);

// 记录内存快照
function captureMemorySnapshot() {
  const memUsage = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();

  const snapshot = {
    timestamp: Date.now() - startTime,
    rss: (memUsage.rss / 1024 / 1024).toFixed(2),
    heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
    external: (memUsage.external / 1024 / 1024).toFixed(2),
    heapLimit: (heapStats.heap_size_limit / 1024 / 1024).toFixed(2),
    requestCount,
    errorCount,
  };

  memorySnapshots.push(snapshot);

  console.log(`[${(snapshot.timestamp / 1000).toFixed(0)}s] ` +
    `RSS: ${snapshot.rss}MB | ` +
    `Heap: ${snapshot.heapUsed}/${snapshot.heapTotal}MB | ` +
    `Requests: ${requestCount} | ` +
    `Errors: ${errorCount}`);

  return snapshot;
}

// 检测内存泄漏
function detectMemoryLeak() {
  if (memorySnapshots.length < 10) return null;

  const recent = memorySnapshots.slice(-10);
  const first = parseFloat(recent[0].heapUsed);
  const last = parseFloat(recent[recent.length - 1].heapUsed);
  const growth = last - first;
  const growthRate = (growth / first) * 100;

  return {
    growth: growth.toFixed(2),
    growthRate: growthRate.toFixed(2),
    isLeaking: growthRate > 20, // 增长超过20%视为可能泄漏
  };
}

// 生成报告
function generateReport() {
  console.log('\n=== 内存监控报告 ===\n');

  if (memorySnapshots.length === 0) {
    console.log('无数据');
    return;
  }

  const first = memorySnapshots[0];
  const last = memorySnapshots[memorySnapshots.length - 1];

  console.log('初始状态:');
  console.log(`  RSS: ${first.rss}MB`);
  console.log(`  Heap Used: ${first.heapUsed}MB`);
  console.log(`  Heap Total: ${first.heapTotal}MB\n`);

  console.log('最终状态:');
  console.log(`  RSS: ${last.rss}MB`);
  console.log(`  Heap Used: ${last.heapUsed}MB`);
  console.log(`  Heap Total: ${last.heapTotal}MB\n`);

  const rssGrowth = parseFloat(last.rss) - parseFloat(first.rss);
  const heapGrowth = parseFloat(last.heapUsed) - parseFloat(first.heapUsed);

  console.log('内存增长:');
  console.log(`  RSS: ${rssGrowth > 0 ? '+' : ''}${rssGrowth.toFixed(2)}MB`);
  console.log(`  Heap: ${heapGrowth > 0 ? '+' : ''}${heapGrowth.toFixed(2)}MB\n`);

  const leak = detectMemoryLeak();
  if (leak) {
    console.log('泄漏检测:');
    console.log(`  最近10次增长: ${leak.growth}MB (${leak.growthRate}%)`);
    console.log(`  状态: ${leak.isLeaking ? '⚠ 可能存在内存泄漏' : '✓ 正常'}\n`);
  }

  console.log('请求统计:');
  console.log(`  总请求数: ${requestCount}`);
  console.log(`  错误数: ${errorCount}`);
  console.log(`  错误率: ${((errorCount / requestCount) * 100).toFixed(2)}%\n`);

  // 保存详细数据
  const fs = require('fs');
  fs.writeFileSync(
    'memory-monitor-report.json',
    JSON.stringify({ snapshots: memorySnapshots, summary: { first, last, rssGrowth, heapGrowth, leak } }, null, 2)
  );
  console.log('详细报告已保存: memory-monitor-report.json\n');
}

// 定期监控
const monitorInterval = setInterval(() => {
  captureMemorySnapshot();

  const elapsed = Date.now() - startTime;
  if (elapsed >= TEST_DURATION) {
    clearInterval(monitorInterval);
    generateReport();
    process.exit(0);
  }
}, MONITOR_INTERVAL);

// 初始快照
captureMemorySnapshot();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n监控中断，生成报告...\n');
  clearInterval(monitorInterval);
  generateReport();
  process.exit(0);
});
