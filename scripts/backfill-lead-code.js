#!/usr/bin/env node
/*
 * backfill-lead-code.js
 *
 * 为 leads 表历史数据按 created_at 升序生成 lead_code:
 *   L<YYYYMMDD>-<NNNN>
 * 同一日期序号从 0001 开始，按 created_at + id 排序保持单调。
 *
 * 完成后自动添加 UNIQUE 索引 uk_leads_lead_code（若尚未存在）。
 *
 * 用法:
 *   node scripts/backfill-lead-code.js          # 正常回填（仅处理 lead_code 为空的行）
 *   node scripts/backfill-lead-code.js --force  # 强制重置全部 lead_code（先清空再生成）
 *
 * 前置：必须先运行 migrations/M1__leads_extend_fields.up.sql
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'lan_dual_role_system',
  waitForConnections: true,
  connectionLimit: 5,
});
const closePool = () => pool.end();

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');

(async () => {
  const conn = await pool.getConnection();
  let updated = 0;
  let skipped = 0;
  const dateCounters = new Map();

  try {
    await conn.beginTransaction();

    if (FORCE) {
      // 先把 UNIQUE 删除（否则 UPDATE 中间状态会冲突），再清空，再重建
      await dropUniqueIfExists(conn);
      await conn.execute('UPDATE leads SET lead_code = NULL');
    }

    // 锁定全表，按时间序列生成
    const [rows] = await conn.query(
      'SELECT id, created_at, lead_code FROM leads ORDER BY created_at ASC, id ASC FOR UPDATE',
    );

    for (const row of rows) {
      if (row.lead_code) {
        // 不强制时跳过已有编号的行；同时把日期计数对齐到当前最大值
        const m = /^L(\d{8})-(\d{4})$/.exec(row.lead_code);
        if (m) {
          const dateKey = m[1];
          const seq = parseInt(m[2], 10);
          const cur = dateCounters.get(dateKey) || 0;
          if (seq > cur) dateCounters.set(dateKey, seq);
        }
        skipped++;
        continue;
      }

      const d = new Date(row.created_at);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`lead id=${row.id} created_at 不可解析: ${row.created_at}`);
      }
      const dateKey = formatDateKey(d);
      const next = (dateCounters.get(dateKey) || 0) + 1;
      dateCounters.set(dateKey, next);
      const code = `L${dateKey}-${String(next).padStart(4, '0')}`;

      await conn.execute('UPDATE leads SET lead_code = ? WHERE id = ?', [code, row.id]);
      updated++;
    }

    // 加 UNIQUE 索引（若尚未存在）
    await addUniqueIfMissing(conn);

    await conn.commit();
    console.log(`[backfill-lead-code] updated=${updated} skipped=${skipped} dates=${dateCounters.size}`);
  } catch (err) {
    await conn.rollback();
    console.error('[backfill-lead-code] failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await closePool();
  }
})();

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

async function addUniqueIfMissing(conn) {
  const [idx] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'leads'
        AND INDEX_NAME = 'uk_leads_lead_code'`,
  );
  if (Number(idx[0].c) === 0) {
    await conn.query('ALTER TABLE leads ADD UNIQUE INDEX uk_leads_lead_code (lead_code)');
    console.log('[backfill-lead-code] UNIQUE 索引 uk_leads_lead_code 已创建');
  } else {
    console.log('[backfill-lead-code] UNIQUE 索引 uk_leads_lead_code 已存在');
  }
}

async function dropUniqueIfExists(conn) {
  const [idx] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'leads'
        AND INDEX_NAME = 'uk_leads_lead_code'`,
  );
  if (Number(idx[0].c) > 0) {
    await conn.query('ALTER TABLE leads DROP INDEX uk_leads_lead_code');
    console.log('[backfill-lead-code] 已删除旧 UNIQUE 索引');
  }
}
