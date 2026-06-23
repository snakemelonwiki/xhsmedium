const http = require('http');
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');

async function checkSetup() {
  console.log('=== 负载测试环境检查 ===\n');

  let allPassed = true;

  // 1. 检查 Node.js 版本
  console.log('1. 检查 Node.js 版本...');
  const nodeVersion = process.version;
  console.log(`   版本: ${nodeVersion}`);
  if (parseInt(nodeVersion.slice(1)) >= 14) {
    console.log('   ✓ Node.js 版本符合要求 (>=14.0.0)\n');
  } else {
    console.log('   ❌ Node.js 版本过低，需要 >=14.0.0\n');
    allPassed = false;
  }

  // 2. 检查测试工具
  console.log('2. 检查测试工具...');

  try {
    const k6Version = execSync('k6 version', { encoding: 'utf8' });
    console.log(`   ✓ k6 已安装: ${k6Version.trim()}`);
  } catch (e) {
    console.log('   ⚠ k6 未安装');
    console.log('     安装: https://k6.io/docs/getting-started/installation/');
    allPassed = false;
  }

  try {
    const artilleryVersion = execSync('artillery version', { encoding: 'utf8' });
    console.log(`   ✓ artillery 已安装: ${artilleryVersion.trim()}`);
  } catch (e) {
    console.log('   ⚠ artillery 未安装');
    console.log('     安装: npm install -g artillery');
  }
  console.log('');

  // 3. 检查数据库连接
  console.log('3. 检查数据库连接...');
  require('dotenv').config({ path: '../.env' });

  const dbConfig = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'lan_dual_role_system',
  };

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`   ✓ 数据库连接成功`);
    console.log(`   用户总数: ${rows[0].count}\n`);
    await connection.end();
  } catch (error) {
    console.log(`   ❌ 数据库连接失败: ${error.message}\n`);
    allPassed = false;
  }

  // 4. 检查测试用户
  console.log('4. 检查测试用户...');
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query(
      "SELECT role, COUNT(*) as count FROM users WHERE username LIKE 'staff%' OR username LIKE 'sales%' OR username LIKE 'admin%' OR username LIKE 'academic%' GROUP BY role"
    );

    if (rows.length > 0) {
      console.log('   测试用户统计:');
      rows.forEach(row => {
        console.log(`     ${row.role}: ${row.count} 个`);
      });
      console.log('   ✓ 测试用户已准备\n');
    } else {
      console.log('   ⚠ 未找到测试用户');
      console.log('     运行: mysql < add-test-users.sql\n');
      allPassed = false;
    }
    await connection.end();
  } catch (error) {
    console.log(`   ❌ 查询失败: ${error.message}\n`);
  }

  // 5. 检查应用状态
  console.log('5. 检查应用状态...');
  const checkUrl = (port) => {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/api/auth/login`, (res) => {
        resolve(res.statusCode !== undefined);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  };

  const port3000 = await checkUrl(3000);
  if (port3000) {
    console.log('   ✓ 应用运行中: http://localhost:3000\n');
  } else {
    console.log('   ❌ 应用未运行');
    console.log('     启动: npm start\n');
    allPassed = false;
  }

  // 总结
  console.log('=== 检查完成 ===\n');
  if (allPassed) {
    console.log('✓ 所有检查通过，可以开始测试！\n');
    console.log('运行测试:');
    console.log('  npm run test:k6          # k6 完整测试');
    console.log('  npm run test:k6:quick    # k6 快速测试');
    console.log('  npm run test:artillery   # Artillery 测试');
    console.log('  npm run monitor:memory   # 内存监控\n');
  } else {
    console.log('⚠ 部分检查未通过，请先解决上述问题。\n');
    process.exit(1);
  }
}

checkSetup().catch(console.error);
