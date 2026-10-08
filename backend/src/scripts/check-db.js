const pool = require("../config/db");

async function checkDatabase() {
  try {
    await pool.query("SELECT 1");
    console.log("MySQL connection successful.");
  } catch (error) {
    console.error("MySQL connection failed. Check the service and backend/.env settings.", error.code);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDatabase();
