require('dotenv').config();
const mysql = require('mysql2/promise');

async function query(sql, params = []) {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });
  try {
    const [rows] = await connection.execute(sql, params);
    return rows;
  } finally {
    await connection.end();
  }
}

const sql = process.argv[2] || 'SELECT 1';
const params = process.argv.slice(3);
query(sql, params).then(rows => {
  console.log(JSON.stringify(rows, null, 2));
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
