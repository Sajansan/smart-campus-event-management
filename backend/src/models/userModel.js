const pool = require("../config/db");

async function findByEmail(email) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0];
}

async function create({ studentId = null, name, email, password, role = "student", department = null, academicYear = null }) {
  const [result] = await pool.execute(
    "INSERT INTO users (student_id, name, email, password, role, department, academic_year) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [studentId, name, email, password, role, department, academicYear]
  );
  return { id: result.insertId, student_id: studentId, name, email, role, department, academic_year: academicYear, status: 'active' };
}

async function listAll() {
  const [rows] = await pool.execute("SELECT id, student_id, name, email, role, department, academic_year, status, created_at FROM users ORDER BY id DESC");
  return rows;
}

async function updateRoleAndStatus(id, { role, status }) {
  const updates = [];
  const values = [];
  if (role) { updates.push("role = ?"); values.push(role); }
  if (status) { updates.push("status = ?"); values.push(status); }
  if (!updates.length) return findById(id);
  values.push(id);
  await pool.execute(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
  return findById(id);
}

function safe(user) {
  return {
    id: user.id,
    studentId: user.student_id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    academicYear: user.academic_year,
    status: user.status
  };
}

module.exports = { findByEmail, findById, create, listAll, updateRoleAndStatus, safe };
