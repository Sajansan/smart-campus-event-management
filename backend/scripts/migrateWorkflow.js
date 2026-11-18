const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const schema = fs.readFileSync(path.resolve(__dirname, "../database/schema.sql"), "utf8");
const additions = {
  users: ["department", "academic_year", "status", "staff_verified", "must_change_password", "credential_version"],
  events: ["department", "target_year", "status", "approved_by", "approved_at", "rejection_reason"],
  event_registrations: ["status", "cancelled_at", "attendance_status", "checked_in_at", "checked_in_by"]
};

async function migrate(connection) {
  for (const [table, names] of Object.entries(additions)) {
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    const columns = new Map(rows.map(row => [row.Field, row.Type]));
    const definition = schema.split(`CREATE TABLE IF NOT EXISTS ${table} (`)[1].split(") ENGINE=")[0];
    const ddl = name => definition.split("\n").map(line => line.trim()).find(line => line.startsWith(name + " ")).replace(/,$/, "");
    const changes = names.filter(name => !columns.has(name)).map(name => "ADD COLUMN " + ddl(name));
    if (table === "users" && !columns.get("role")?.includes("'coordinator'")) {
      changes.push("MODIFY COLUMN " + ddl("role"));
    }
    if (changes.length) await connection.query(`ALTER TABLE \`${table}\` ${changes.join(", ")}`);
  }
  const newTables = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS event_feedback"));
  for (const statement of newTables.split(";").map(sql => sql.trim()).filter(Boolean)) {
    await connection.query(statement);
  }
}

async function main() {
  if (!process.env.DB_NAME) throw new Error("Set DB_NAME to the existing campus database.");
  const connection = await mysql.createConnection(require("../src/config/dbOptions")());
  try {
    await migrate(connection);
    console.log("Campus workflow schema is ready.");
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("Workflow migration failed:", error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = migrate;
