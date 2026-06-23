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

// 从 schema.sql 解析 (table, col, type, nullable, default, extra)
// 极简解析：只看 CREATE TABLE ... 区块，跳过 _migrations
import fs from 'fs';
const SQL = fs.readFileSync('schema.sql', 'utf8');

const tableBlocks = {};
const tableRe = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\)\s+ENGINE=/g;
let m;
while ((m = tableRe.exec(SQL))) {
  const name = m[1];
  const body = m[2];
  const cols = [];
  // 跳过索引行 (KEY/INDEX/UNIQUE/PRIMARY KEY 单独成行)
  const lines = body.split(/\n/);
  for (const line of lines) {
    const t = line.trim().replace(/,\s*$/, '');
    if (!t) continue;
    if (/^(PRIMARY KEY|UNIQUE (KEY|INDEX)|KEY|INDEX)\b/i.test(t)) continue;
    if (/^COMMENT\s*=/i.test(t)) continue;
    // 形如：name  type  [NOT NULL|...]  [DEFAULT ...]  [COMMENT '...']
    // 简单按空白切，最少 2 段（name + type）
    const parts = t.match(/^`?(\w+)`?\s+(\S+)(.*)$/);
    if (!parts) continue;
    const colName = parts[1];
    const colType = parts[2];
    const rest = (parts[3] || '').toUpperCase();
    const notNull = /\bNOT\s+NULL\b/.test(rest);
    const isNullable = !notNull;
    const defMatch = t.match(/DEFAULT\s+([^\s,]+(?:\s*\([^)]*\))?)/i);
    let colDefault = defMatch ? defMatch[1] : null;
    if (colDefault && /^CURRENT_TIMESTAMP/i.test(colDefault)) {
      // 在信息模式中 DEFAULT 字段会显示 CURRENT_TIMESTAMP
    }
    cols.push({ name: colName, type: colType, notNull, default: colDefault });
  }
  tableBlocks[name] = cols;
}

async function main() {
  const conn = await mysql.createConnection(DB);
  const [dbTables] = await conn.query('SHOW TABLES');
  const localTables = new Set(dbTables.map((r) => Object.values(r)[0]));

  // 1) 收集所有 ALTER 语句
  const alters = [];
  for (const [tname, expectedCols] of Object.entries(tableBlocks)) {
    if (!localTables.has(tname)) continue;
    const [actual] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
      [DB.database, tname]
    );
    const actualNames = new Set(actual.map((r) => r.COLUMN_NAME));
    for (const c of expectedCols) {
      if (actualNames.has(c.name)) continue;
      const nullSql = c.notNull ? 'NOT NULL' : 'NULL';
      const defSql = c.default ? `DEFAULT ${c.default}` : '';
      const add = `ALTER TABLE \`${tname}\` ADD COLUMN \`${c.name}\` ${c.type} ${nullSql} ${defSql}`.trim().replace(/\s+/g, ' ') + ';';
      alters.push({ table: tname, col: c.name, ddl: add });
    }
  }

  // 2) 收集缺失表的 CREATE
  const missingTables = Object.keys(tableBlocks).filter((t) => !localTables.has(t));
  console.log(`[INFO] 已有表中缺失列总数: ${alters.length}`);
  alters.forEach((a) => console.log('  ' + a.table + ' . ' + a.col));
  console.log(`\n[INFO] 缺失表: ${missingTables.join(', ')}`);

  // 3) 写出 SQL 脚本
  let out = '-- AUTO-GENERATED 由 scripts/diff-schema-vs-db.mjs 生成\n';
  out += '-- 使用前请检查；建议先在测试库执行\n\n';
  out += 'SET NAMES utf8mb4;\n\n';
  if (alters.length) {
    out += '-- ============= 缺失列 =============\n';
    for (const a of alters) out += a.ddl + '\n';
    out += '\n';
  }
  if (missingTables.length) {
    out += '-- ============= 缺失表 =============\n';
    for (const t of missingTables) {
      // 从 schema.sql 提取该表的完整 CREATE 块
      const re = new RegExp(`(CREATE TABLE IF NOT EXISTS ${t}[\\s\\S]*?\\n\\)\\s+ENGINE=[^;]+;)`);
      const x = SQL.match(re);
      if (x) {
        out += x[1].replace(/COMMENT\s*=\s*'([^']*)'/, "COMMENT='$1'") + '\n\n';
      }
    }
  }
  fs.writeFileSync('scripts/diff-fix.sql', out);
  console.log('\n[OK] 已生成 scripts/diff-fix.sql');

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
