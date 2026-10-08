const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const users = require("../models/userModel");
const validate = require("../utils/validation");

async function register(req, res) {
  const body = req.body || {};
  const studentId = validate.text(body.studentId, "Student ID", 50, true);
  const name = validate.text(body.name, "Name", 100, true);
  const email = validate.email(body.email);
  const password = await bcrypt.hash(validate.password(body.password), 12);
  const user = await users.create({ studentId, name, email, password, role: "student" });
  res.status(201).json({ success: true, message: "Student account created successfully", data: users.safe(user) });
}

async function login(req, res) {
  const email = validate.email(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== "string" || !password) validate.fail("Password is required");
  if (Buffer.byteLength(password, "utf8") > 72) validate.fail("Password must be at most 72 UTF-8 bytes");
  const user = await users.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) validate.fail("Invalid email or password", 401);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "1d" });
  res.json({ success: true, message: "Login successful", token, user: users.safe(user) });
}

module.exports = { register, login };
