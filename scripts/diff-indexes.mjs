import 'dotenv/config';
import fs from 'fs';
import mysql from 'mysql2/promise';

const DB = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

const SQL = fs.readFileSync('schema.sql', 'utf8');

// 解析每个表内 INDEX/UNIQUE INDEX/KEY 声明
const tableRe = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\)\s+ENGINE=/g;
const expected = {}; // table -> [{ kind:'INDEX'|'UNIQUE', name, cols, def }]
let m;
while ((m = tableRe.exec(SQL))) {
  const tname = m[1];
  const body = m[2];
  const idxs = [];
  // 形式：INDEX/KEY/UNIQUE INDEX/UNIQUE KEY name (col, col) [COMMENT '...']
  // 注意有 AS 形式例如：UNIQUE INDEX idx_xxx (col)  -- 不是 (col DESC)
  const lineRe = /^\s*(PRIMARY\s+KEY|UNIQUE\s+(?:KEY|INDEX)|(?:KEY|INDEX))\s+(`?[\w$]+`?)?\s*\(([^)]+)\)(.*)$/gmi;
  let im;
  while ((im = lineRe.exec(body)) !== null) {
    const kw = im[1].toUpperCase().trim();
    const name = (im[2] || '').replace(/`/g, '').trim();
    const colsRaw = im[3].trim();
    const tail = im[4] || '';
    const kind = kw.startsWith('UNIQUE') ? 'UNIQUE' : kw.startsWith('PRIMARY') ? 'PRIMARY' : 'INDEX';
    if (kind === 'PRIMARY') continue; // 主键另外处理
    idxs.push({ kind, name, colsRaw, tail: tail.trim() });
  }
  expected[tname] = idxs;
}

const conn = await mysql.createConnection(DB);
const [tRows] = await conn.query('SHOW TABLES');
const localTables = new Set(tRows.map((r) => Object.values(r)[0]));

const toCreate = []; // { table, ddl }
const report = [];   // { table, missing: [], present: [] }

for (const [tname, idxs] of Object.entries(expected)) {
  if (!localTables.has(tname)) {
    report.push({ table: tname, missing: idxs.map((i) => `${i.kind} ${i.name}`), present: [], reason: 'table missing' });
    continue;
  }
  const [actIdx] = await conn.query(
    `SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [DB.database, tname]
  );
  // 同一索引可能在 information_schema.STATISTICS 出现多行（每列一行），用 distinct
  const present = new Map(); // name -> { unique:bool }
  for (const r of actIdx) {
    if (!present.has(r.INDEX_NAME)) {
      present.set(r.INDEX_NAME, { unique: r.NON_UNIQUE === 0 });
    }
  }

  const missing = [];
  for (const i of idxs) {
    if (present.has(i.name)) continue;
    missing.push(i);
  }
  report.push({
    table: tname,
    missing: missing.map((i) => `${i.kind} ${i.name}(${i.colsRaw})`),
    present: [...present.keys()].filter((n) => n !== 'PRIMARY'),
  });

  for (const i of missing) {
    const kw = i.kind === 'UNIQUE' ? 'UNIQUE INDEX' : 'INDEX';
    const commentMatch = i.tail.match(/COMMENT\s*'([^']*)'/i);
    const comment = commentMatch ? ` COMMENT '${commentMatch[1]}'` : '';
    const ddl = `ALTER TABLE \`${tname}\` ADD ${kw} \`${i.name}\` (${i.colsRaw})${comment};`;
    toCreate.push({ table: tname, name: i.name, ddl });
  }
}

console.log('--- 缺索引汇总 ---');
for (const r of report) {
  if (r.missing.length === 0) continue;
  console.log(`\n[${r.table}] 缺 ${r.missing.length} 个:`);
  r.missing.forEach((x) => console.log('  - ' + x));
}
console.log(`\n总计待创建: ${toCreate.length} 条`);

let out = '-- AUTO-GENERATED 索引补齐\n\nSET NAMES utf8mb4;\n\n';
for (const c of toCreate) out += c.ddl + '\n';
fs.writeFileSync('scripts/fix-indexes.sql', out);
console.log('已生成 scripts/fix-indexes.sql');

await conn.end();
