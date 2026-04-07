// src/config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'db',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'hms_user',
  password:           process.env.DB_PASSWORD || 'hms_pass',
  database:           process.env.DB_NAME     || 'hms',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           '+00:00',
});

module.exports = pool;
