const mysql = require('mysql2/promise');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function cleanup() {
  console.log('=== 负载测试数据清理工具 ===\n');

  // 读取数据库配置
  require('dotenv').config({ path: '../.env' });

  const config = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'lan_dual_role_system',
  };

  let connection;

  try {
    // 连接数据库
    console.log('连接数据库...');
    connection = await mysql.createConnection(config);
    console.log('✓ 数据库连接成功\n');

    // 统计测试数据
    console.log('统计测试数据...');
    const [leads] = await connection.query(
      "SELECT COUNT(*) as count FROM leads WHERE note = '负载测试数据'"
    );
    const [posts] = await connection.query(
      "SELECT COUNT(*) as count FROM posts WHERE note = '负载测试数据'"
    );

    const leadsCount = leads[0].count;
    const postsCount = posts[0].count;

    console.log(`  测试客资: ${leadsCount} 条`);
    console.log(`  测试作品: ${postsCount} 条\n`);

    if (leadsCount === 0 && postsCount === 0) {
      console.log('没有需要清理的测试数据。');
      rl.close();
      return;
    }

    // 确认删除
    const answer = await question(`确认删除这些测试数据？(yes/no): `);

    if (answer.toLowerCase() !== 'yes') {
      console.log('取消清理。');
      rl.close();
      return;
    }

    // 删除测试数据
    console.log('\n开始清理...');

    const [leadsResult] = await connection.query(
      "DELETE FROM leads WHERE note = '负载测试数据'"
    );
    console.log(`✓ 已删除 ${leadsResult.affectedRows} 条测试客资`);

    const [postsResult] = await connection.query(
      "DELETE FROM posts WHERE note = '负载测试数据'"
    );
    console.log(`✓ 已删除 ${postsResult.affectedRows} 条测试作品`);

    // 清理孤立记录
    const [orphanResult] = await connection.query(
      "DELETE FROM lead_follow_records WHERE lead_id NOT IN (SELECT id FROM leads)"
    );
    if (orphanResult.affectedRows > 0) {
      console.log(`✓ 已删除 ${orphanResult.affectedRows} 条孤立跟进记录`);
    }

    console.log('\n=== 清理完成 ===');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
    rl.close();
  }
}

cleanup();
