#!/usr/bin/env node
/*
 * run-migrations.js
 *
 * 极简迁移执行器：
 *   - 在数据库中维护 _migrations 表（自动建立）
 *   - 扫描 migrations/ 目录下 *.up.sql / *.down.sql
 *   - 按文件名顺序执行 .up.sql；记录到 _migrations
 *   - 已记录的迁移会跳过（除非 --force）
 *
 * 用法:
 *   node scripts/run-migrations.js                # 正向执行所有未应用的 .up.sql
 *   node scripts/run-migrations.js --target=M1    # 仅执行 ID 前缀匹配 M1 的 .up.sql
 *   node scripts/run-migrations.js --down=M2      # 回滚 M2*.down.sql
 *   node scripts/run-migrations.js --status       # 列出迁移状态
 *
 * 注意：MySQL 的多语句不能用 pool.execute prepared statement，本脚本用 query 单条执行 + 自行按 ;
 *       拆分语句（避免引入新依赖）。如果迁移文件包含函数体/触发器等复杂分号，应自行调整。
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'lan_dual_role_system',
  waitForConnections: true,
  connectionLimit: 5,
  multipleStatements: false,
});
const closePool = () => pool.end();

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const args = parseArgs(process.argv.slice(2));

(async () => {
  try {
    await ensureRegistry();
    if (args.status) return await printStatus();
    if (args.down) return await rollback(args.down);
    return await migrateUp(args.target, args.force);
  } catch (err) {
    console.error('[run-migrations] error:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();

function parseArgs(argv) {
  const out = { force: false };
  for (const a of argv) {
    if (a === '--force') out.force = true;
    else if (a === '--status') out.status = true;
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length);
    else if (a.startsWith('--down=')) out.down = a.slice('--down='.length);
  }
  return out;
}

async function ensureRegistry() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          VARCHAR(64) PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function listMigrations(suffix) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(suffix))
    .sort();
}

function migrationIdOf(filename) {
  // 文件名格式：M1__leads_extend_fields.up.sql → M1__leads_extend_fields
  return filename.replace(/\.(up|down)\.sql$/, '');
}

async function listApplied() {
  const [rows] = await pool.query('SELECT id, filename, applied_at FROM _migrations ORDER BY id ASC');
  return rows;
}

async function isApplied(id) {
  const [rows] = await pool.query('SELECT 1 FROM _migrations WHERE id = ?', [id]);
  return rows.length > 0;
}

async function recordApplied(id, filename) {
  await pool.query('INSERT INTO _migrations (id, filename) VALUES (?, ?)', [id, filename]);
}

async function recordRevoked(id) {
  await pool.query('DELETE FROM _migrations WHERE id = ?', [id]);
}

function splitStatements(sql) {
  // 移除单行 -- 注释，按 ; 拆分；保留 USE/ALTER/UPDATE 等。
  const stripped = sql
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n');
  return stripped
    .split(/;\s*\n/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ';');
}

async function execFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const stmts = splitStatements(sql);
  for (const stmt of stmts) {
    process.stdout.write(`  > ${stmt.split('\n')[0].slice(0, 80)} ...`);
    await pool.query(stmt);
    process.stdout.write(' ok\n');
  }
}

async function migrateUp(target, force) {
  const files = listMigrations('.up.sql');
  for (const filename of files) {
    const id = migrationIdOf(filename);
    if (target && !id.startsWith(target)) continue;
    const already = await isApplied(id);
    if (already && !force) {
      console.log(`[skip] ${filename} (already applied)`);
      continue;
    }
    console.log(`[apply] ${filename}`);
    await execFile(path.join(MIGRATIONS_DIR, filename));
    if (!already) await recordApplied(id, filename);
    console.log(`[done] ${id}`);
  }
}

async function rollback(targetId) {
  const file = `${targetId}.down.sql`;
  const fullPath = path.join(MIGRATIONS_DIR, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`找不到回滚文件: ${file}`);
  }
  console.log(`[rollback] ${file}`);
  await execFile(fullPath);
  await recordRevoked(targetId);
  console.log(`[done] rolled back ${targetId}`);
}

async function printStatus() {
  const upFiles = listMigrations('.up.sql');
  const applied = await listApplied();
  const appliedIds = new Set(applied.map((r) => r.id));
  console.log('Migrations:');
  for (const f of upFiles) {
    const id = migrationIdOf(f);
    const flag = appliedIds.has(id) ? '✓' : ' ';
    const at = applied.find((r) => r.id === id)?.applied_at || '';
    console.log(`  [${flag}] ${id.padEnd(40)} ${at}`);
  }
}
