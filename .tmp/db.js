const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const conn = mysql.createPool({
  host: 'localhost', port: 3306, user: 'root',
  password: process.env.MYSQL_PASSWORD, database: 'lan_dual_role_system',
  waitForConnections: true, connectionLimit: 4,
});
async function q(sql, params=[]) {
  const [rows] = await conn.query(sql, params);
  return rows;
}
module.exports = { q, conn };
