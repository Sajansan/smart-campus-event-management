const pool = require("../config/db");

async function findByEmail(email) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0];
}

async function create({ studentId = null, name, email, password, role = "student" }) {
  const [result] = await pool.execute(
    "INSERT INTO users (student_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
    [studentId, name, email, password, role]
  );
  return { id: result.insertId, student_id: studentId, name, email, role };
}

function safe(user) {
  return { id: user.id, studentId: user.student_id, name: user.name, email: user.email, role: user.role };
}

module.exports = { findByEmail, create, safe };
