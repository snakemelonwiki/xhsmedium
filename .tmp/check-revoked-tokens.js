const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: 'caigua123...', database: 'lan_dual_role_system'
  });
  const [rows] = await conn.query('SELECT id, user_id, reason, revoked_at, expires_at, LEFT(token_hash, 16) AS token_hash_prefix FROM revoked_tokens ORDER BY revoked_at DESC LIMIT 10');
  console.log(`Found ${rows.length} rows:`);
  console.log(JSON.stringify(rows, null, 2));
  const [count] = await conn.query('SELECT COUNT(*) AS total FROM revoked_tokens');
  console.log('Total:', count[0].total);
  await conn.end();
})();
