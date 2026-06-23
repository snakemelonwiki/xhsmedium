const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'caigua123...',
    database: 'lan_dual_role_system',
  });
  const [r] = await c.query(
    `SELECT id, employee_id, assigned_sales_user_id, status, add_status, process_status,
            intention_level, intention, lead_code, next_follow_time, sales_feedback
       FROM leads WHERE id='14052e2a-faf1-48d0-aa90-a9f064ba0428'`
  );
  console.log('LEAD_BACKUP:', JSON.stringify(r[0]));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
