#!/usr/bin/env node
// batch-2: backup current lead state
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
  const LEAD_ID = '14052e2a-faf1-48d0-aa90-a9f064ba0428';
  const [r] = await c.query(
    `SELECT id, employee_id, assigned_sales_user_id, status, add_status, process_status,
            intention_level, intention, lead_code, next_follow_time, sales_feedback, updated_at
       FROM leads WHERE id=?`,
    [LEAD_ID]
  );
  console.log('LEAD_BACKUP_BEFORE:', JSON.stringify(r[0]));

  // also record follow_records count baseline
  const [fr] = await c.query(
    `SELECT COUNT(*) AS cnt FROM lead_follow_records WHERE lead_id=?`,
    [LEAD_ID]
  );
  console.log('LEAD_FOLLOW_BASELINE:', JSON.stringify(fr[0]));

  // also check the staff user / employee of this lead's source
  const [emp] = await c.query(
    `SELECT u.id AS user_id, u.employee_id, e.name AS emp_name
       FROM leads l JOIN users u ON u.employee_id = l.employee_id
       LEFT JOIN employees e ON e.id = l.employee_id
       WHERE l.id=?`,
    [LEAD_ID]
  );
  console.log('LEAD_OPERATOR_USER:', JSON.stringify(emp[0]));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
