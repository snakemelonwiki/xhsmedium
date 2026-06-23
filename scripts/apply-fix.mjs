import 'dotenv/config';
import fs from 'fs';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  multipleStatements: true,
});

const sql = fs.readFileSync('scripts/diff-fix.sql', 'utf8');

// 切分成单条语句（按 `;` 切，但要避开字符串里的分号——这个文件里没有）
const stmts = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('--') && s !== 'SET NAMES utf8mb4');

let ok = 0, fail = 0;
const errs = [];
for (const s of stmts) {
  try {
    await conn.query(s);
    ok++;
  } catch (e) {
    fail++;
    errs.push({ sql: s.slice(0, 80) + '...', err: e.message });
  }
}

console.log(`[OK] 成功: ${ok}`);
console.log(`[FAIL] 失败: ${fail}`);
errs.forEach((e) => console.log('  ! ' + e.err + '\n    -> ' + e.sql));

await conn.end();
process.exit(fail > 0 ? 1 : 0);
