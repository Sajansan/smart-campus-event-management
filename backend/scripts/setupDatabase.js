const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
  let connection;
  try {
    if (process.env.DB_NAME !== "smart_campus_db") throw new Error("Set DB_NAME=smart_campus_db before importing the MVP schema.");
    connection = await mysql.createConnection({
      ...require('../src/config/dbOptions')(),
      database: undefined,
      multipleStatements: true,
    });
    // Check existing tables before applying CREATE TABLE IF NOT EXISTS.
    // This prevents silently accepting an incompatible older project schema.
    const expected = {
      users: ["id", "student_id", "name", "email", "password", "role", "created_at"],
      events: ["id", "title", "description", "category", "location", "event_date", "start_time", "end_time", "registration_deadline", "capacity", "created_by", "created_at", "updated_at"],
      event_registrations: ["id", "student_id", "event_id", "registered_at"],
    };
    for (const [table, columns] of Object.entries(expected)) {
      const [rows] = await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", ["smart_campus_db", table]);
      if (rows.length && columns.some(column => !rows.some(row => row.COLUMN_NAME === column))) {
        throw new Error(`Existing ${table} table does not match the MVP schema. No schema import was performed.`);
      }
    }
    const schema = fs.readFileSync(path.resolve(__dirname, "../database/schema.sql"), "utf8");
    await connection.query(schema);
    console.log("smart_campus_db is ready: users, events, event_registrations.");
  } catch (error) {
    console.error(error.code ? `Database setup failed (${error.code}). Check MySQL permissions and backend/.env.` : error.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

main();
