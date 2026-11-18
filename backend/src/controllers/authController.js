const bcrypt = require("bcrypt");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const jwt = require("jsonwebtoken");
const users = require("../models/userModel");
const invitations = require("../models/staffInvitationModel");
const inviteEmail = require("../utils/staffInviteEmail");
const validate = require("../utils/validation");

function session(user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, version: user.credential_version },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: user.must_change_password ? "30m" : process.env.JWT_EXPIRES_IN || "1d" }
  );
  return { success: true, token, user: users.safe(user) };
}

async function register(req, res) {
  const body = req.body || {};
  const studentId = validate.text(body.studentId, "Student ID", 50, true);
  const name = validate.text(body.name, "Name", 100, true);
  const email = validate.email(body.email);
  const department = validate.text(body.department, "Department", 100);
  const academicYear = validate.academicYear(body.academicYear);
  const password = await bcrypt.hash(validate.password(body.password), 12);
  const user = await users.create({ studentId, name, email, password, department, academicYear });
  res.status(201).json({ success: true, message: "Student account created successfully", data: users.safe(user) });
}

async function login(req, res) {
  const email = validate.email(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== "string" || !password) validate.fail("Password is required");
  if (Buffer.byteLength(password, "utf8") > 72) validate.fail("Password must be at most 72 UTF-8 bytes");
  const user = await users.findByEmail(email);
  if (!user?.password || !(await bcrypt.compare(password, user.password))) validate.fail("Invalid email or password", 401);
  if (user.status !== "active") validate.fail("Account access is suspended. Contact the administrator.", 403);
  if (users.isStaffRole(user.role) && (!user.staff_verified || !user.department?.trim())) {
    validate.fail("Ask the administrator to set up your staff access.", 403);
  }
  res.set("Cache-Control", "no-store").json(session(user));
}

async function listStaff(req, res) {
  const list = await users.listStaff();
  res.json({ success: true, data: list.map(users.safe) });
}

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

async function sendStaffLink(res, prepare, status) {
  const config = inviteEmail.configuration();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const user = await prepare(tokenHash);
  const failure = await inviteEmail.send(config, user, token, randomUUID());
  const staff = await invitations.recordDelivery(user.id, tokenHash, failure ? "failed" : "sent");
  const message = failure ? `Staff access saved. ${failure}` : "Staff password setup email accepted by Resend.";
  res.set("Cache-Control", "no-store").status(status).json({ success: true, message, data: users.safe(staff) });
}

async function createStaff(req, res) {
  const body = req.body || {};
  const name = validate.text(body.name, "Name", 100, true);
  const email = validate.email(body.email);
  const department = validate.text(body.department, "Department", 100, true);
  if (!users.isStaffRole(body.role)) validate.fail("Choose Event Organizer or Department Coordinator");

  await sendStaffLink(res, tokenHash => invitations.createStaff({ name, email, role: body.role, department }, tokenHash), 201);
}

async function updateStaff(req, res) {
  const id = validate.id(req.params.id);
  const body = req.body || {};
  if (!users.isStaffRole(body.role)) validate.fail("Choose Event Organizer or Department Coordinator");
  const department = validate.text(body.department, "Department", 100, true);
  if (!["active", "suspended"].includes(body.status)) validate.fail("Choose an account status");
  const user = await invitations.updateAccess(id, { role: body.role, department, status: body.status });
  res.set("Cache-Control", "no-store").json({
    success: true, message: "Staff access updated", data: users.safe(user)
  });
}

async function resendStaffLink(req, res) {
  const id = validate.id(req.params.id);
  await sendStaffLink(res, tokenHash => invitations.renew(id, tokenHash), 200);
}

async function acceptStaffLink(req, res) {
  const { token, password } = req.body || {};
  const invalidLink = "This link is invalid, expired, or already used. Ask your administrator for a new link.";
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) validate.fail(invalidLink, 410);
  validate.password(password, 12);
  const tokenHash = hashToken(token);
  const id = await invitations.findRecipient(tokenHash);
  if (!id || !(await invitations.redeem(id, tokenHash, await bcrypt.hash(password, 12)))) validate.fail(invalidLink, 410);
  res.set("Cache-Control", "no-store").json({ success: true, message: "Password saved. You can now sign in." });
}

async function changePassword(req, res) {
  if (!req.user.must_change_password) validate.fail("This account does not require password setup", 409);
  const password = validate.password(req.body?.password, 12);
  const current = await users.findById(req.user.id);
  if (await bcrypt.compare(password, current.password)) validate.fail("Choose a different password");
  const updated = await users.completePasswordSetup(req.user.id, req.user.credential_version, await bcrypt.hash(password, 12));
  if (!updated) validate.fail("Your staff access changed. Sign in again.", 401);
  res.set("Cache-Control", "no-store").json(session(updated));
}

module.exports = { register, login, listStaff, createStaff, updateStaff, resendStaffLink, acceptStaffLink, changePassword };
