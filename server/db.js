require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ ไม่พบ DATABASE_URL — กรุณาคัดลอก .env.example เป็น .env แล้วใส่ค่าที่ถูกต้อง');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = pool;
