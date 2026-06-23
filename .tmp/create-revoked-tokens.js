// One-off: create revoked_tokens table (PF-05 fix)
const mysql = require('mysql2/promise');

const DDL = `CREATE TABLE IF NOT EXISTS revoked_tokens (
  id          VARCHAR(64)  PRIMARY KEY,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE COMMENT 'SHA256(token) 哈希（不存原 token）',
  user_id     VARCHAR(64)  NOT NULL COMMENT '所属用户ID',
  revoked_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '撤销时间',
  expires_at  DATETIME     NULL COMMENT '原 token 过期时间（定时清理用）',
  reason      VARCHAR(32)  NOT NULL DEFAULT 'logout' COMMENT 'logout / admin_revoke / password_change / session_replaced 等',
  INDEX idx_revoked_tokens_token   (token_hash),
  INDEX idx_revoked_tokens_user    (user_id),
  INDEX idx_revoked_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='已撤销的 JWT token（PF-05 修复）'`;

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'caigua123...',
    database: 'lan_dual_role_system',
    multipleStatements: false,
  });
  try {
    await conn.query(DDL);
    console.log('OK: revoked_tokens table created/verified');
    const [rows] = await conn.query("SHOW CREATE TABLE revoked_tokens");
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
