const pool = require("../config/db");
const staffRoles = ["organizer", "coordinator"];

function isStaffRole(role) {
  return staffRoles.includes(role);
}

async function findByEmail(email) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0];
}

async function findById(id, connection = pool) {
  const [rows] = await connection.execute("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0];
}

async function create({ studentId = null, name, email, password, role = "student", department = null, academicYear = null, staffSetup = false }, connection = pool) {
  const [result] = await connection.execute(
    "INSERT INTO users (student_id, name, email, password, role, department, academic_year, staff_verified, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [studentId, name, email, password, role, department, academicYear, staffSetup, staffSetup]
  );
  return findById(result.insertId, connection);
}

const staffQuery = `
  SELECT u.id, u.name, u.email, u.role, u.department, u.status, u.staff_verified, u.must_change_password,
    CASE WHEN i.expires_at <= UTC_TIMESTAMP() THEN 'expired' ELSE i.delivery_status END AS invitation_status
  FROM users u LEFT JOIN staff_invitations i ON i.user_id = u.id
  WHERE u.role IN ('organizer', 'coordinator')`;

async function listStaff() {
  const [rows] = await pool.execute(staffQuery + " ORDER BY u.name, u.id");
  return rows;
}

async function findStaff(id, connection = pool) {
  const [[staff]] = await connection.execute(staffQuery + " AND u.id = ?", [id]);
  return staff;
}

async function updateStaff(id, { role, department, status, password = null }, connection = pool) {
  const [result] = await connection.execute(
    `UPDATE users SET role = ?, department = ?, status = ?, credential_version = credential_version + 1,
        staff_verified = IF(? IS NULL, staff_verified, 1),
        must_change_password = IF(? IS NULL, must_change_password, 1),
        password = COALESCE(?, password)
      WHERE id = ? AND role IN ('organizer', 'coordinator')`,
    [role, department, status, password, password, password, id]
  );
  return result.affectedRows ? findById(id, connection) : null;
}

async function completePasswordSetup(id, version, password) {
  const [result] = await pool.execute(
    `UPDATE users SET password = ?, must_change_password = 0, credential_version = credential_version + 1
     WHERE id = ? AND must_change_password = 1 AND status = 'active' AND credential_version = ?`,
    [password, id, version]
  );
  if (!result.affectedRows) return null;
  const user = await findById(id);
  return user.credential_version === version + 1 ? user : null;
}

function safe(user) {
  return {
    id: user.id,
    studentId: user.student_id ?? null,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    academicYear: user.academic_year ?? null,
    status: user.status,
    staffVerified: Boolean(user.staff_verified),
    mustChangePassword: Boolean(user.must_change_password),
    invitationStatus: user.invitation_status ?? null
  };
}

module.exports = { isStaffRole, findByEmail, findById, create, listStaff, findStaff, updateStaff, completePasswordSetup, safe };
