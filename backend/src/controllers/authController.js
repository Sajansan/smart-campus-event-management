const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const users = require("../models/userModel");
const validate = require("../utils/validation");

async function register(req, res) {
  const body = req.body || {};
  const studentId = validate.text(body.studentId, "Student ID", 50, false);
  const name = validate.text(body.name, "Name", 100, true);
  const email = validate.email(body.email);
  const password = await bcrypt.hash(validate.password(body.password), 12);
  const department = validate.text(body.department, "Department", 100, false);
  const academicYear = body.academicYear ? Number(body.academicYear) : null;
  
  const validRoles = ["student", "organizer", "coordinator"];
  const requestedRole = body.role && validRoles.includes(body.role) ? body.role : "student";

  const user = await users.create({ 
    studentId: studentId || null, 
    name, 
    email, 
    password, 
    role: requestedRole, 
    department, 
    academicYear 
  });
  res.status(201).json({ success: true, message: `${requestedRole.charAt(0).toUpperCase() + requestedRole.slice(1)} account created successfully`, data: users.safe(user) });
}

async function login(req, res) {
  const email = validate.email(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== "string" || !password) validate.fail("Password is required");
  if (Buffer.byteLength(password, "utf8") > 72) validate.fail("Password must be at most 72 UTF-8 bytes");
  
  const user = await users.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    validate.fail("Invalid email or password", 401);
  }
  
  if (user.status === "suspended") {
    validate.fail("Account has been suspended. Please contact the administrator.", 403);
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, department: user.department },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );

  res.json({ success: true, message: "Login successful", token, user: users.safe(user) });
}

async function listUsers(req, res) {
  const list = await users.listAll();
  res.json({ success: true, data: list.map(users.safe) });
}

async function updateUserRoleStatus(req, res) {
  const id = validate.id(req.params.id);
  const { role, status } = req.body || {};
  const validRoles = ["student", "organizer", "coordinator", "admin"];
  const validStatuses = ["active", "suspended"];

  if (role && !validRoles.includes(role)) validate.fail("Invalid role");
  if (status && !validStatuses.includes(status)) validate.fail("Invalid status");

  const updated = await users.updateRoleAndStatus(id, { role, status });
  if (!updated) validate.fail("User not found", 404);
  res.json({ success: true, message: "User updated successfully", data: users.safe(updated) });
}

module.exports = { register, login, listUsers, updateUserRoleStatus };
