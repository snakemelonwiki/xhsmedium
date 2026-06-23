import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  multipleStatements: true,
};

// schema.sql 里所有需要校验的表
const EXPECTED_TABLES = [
  '_migrations',
  'employees',
  'users',
  'accounts',
  'posts',
  'leads',
  'lead_follow_records',
  'lead_files',
  'lead_drafts',
  'collaboration_tasks',
  'orders',
  'orders_order_code_seq',
  'order_follow_records',
  'notifications',
  'import_tasks',
  'operation_logs',
  'exports',
  'favorites',
  'post_metrics_history',
  'post_metrics',
  'order_abnormal_feedbacks',
  'supervisor_suggestions',
  'revoked_tokens',
  'teachers',
  'order_authors',
  'order_submissions',
  'order_status_history',
  'order_reminders',
  'order_finance',
];

async function main() {
  const conn = await mysql.createConnection(DB);

  // 1. 拉取本地库所有表
  const [dbTables] = await conn.query('SHOW TABLES');
  const localTables = new Set(dbTables.map((r) => Object.values(r)[0]));
  console.log(`[INFO] 本地库共有 ${localTables.size} 张表`);

  const missing = [];
  for (const t of EXPECTED_TABLES) {
    if (!localTables.has(t)) {
      missing.push(t);
      continue;
    }
    // 2. 对比列
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
    const [infoRows] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [DB.database, t]
    );
    // 打印简洁信息
    console.log(`\n=== ${t} (${infoRows.length} cols) ===`);
    for (const c of infoRows) {
      console.log(
        `  ${c.COLUMN_NAME.padEnd(34)} ${c.COLUMN_TYPE.padEnd(28)} ` +
        `${c.IS_NULLABLE.padEnd(4)} ${c.COLUMN_KEY.padEnd(8)} ` +
        `default=${c.COLUMN_DEFAULT ?? 'NULL'} ${c.EXTRA}`
      );
    }
  }

  if (missing.length) {
    console.log('\n[!!!] 本地库缺失的表:');
    missing.forEach((t) => console.log('  - ' + t));
  } else {
    console.log('\n[OK] schema.sql 涉及的所有表都已存在');
  }

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
