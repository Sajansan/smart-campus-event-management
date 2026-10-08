const path = require("node:path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const pool = mysql.createPool({
  ...require('./dbOptions')(),
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

// Campus deadlines use Sri Lanka time on both local MySQL and Aiven.
pool.on('connection', connection => {
  connection.query("SET time_zone = '+05:30'", error => {
    if (error) connection.destroy();
  });
});

module.exports = pool;
