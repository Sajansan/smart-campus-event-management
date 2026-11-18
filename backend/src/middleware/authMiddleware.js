const jwt = require("jsonwebtoken");
const users = require("../models/userModel");

async function authenticate(req, res, next, passwordSetup = false) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ success: false, message: "Bearer token is required" });

  let claims;
  try {
    claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!Number.isInteger(claims.id) || claims.id < 1) throw new Error("Invalid payload");
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  const user = await users.findById(claims.id);
  if (!user || user.status !== "active" || user.role !== claims.role || user.credential_version !== (claims.version ?? 0)
      || (users.isStaffRole(user.role) && (!user.staff_verified || !user.department?.trim()))) {
    return res.status(401).json({ success: false, message: "Your account access changed. Sign in again." });
  }
  if (user.must_change_password && !passwordSetup) {
    return res.status(403).json({ success: false, message: "Set your password before using staff features." });
  }
  req.user = user;
  next();
}

module.exports = (req, res, next) => authenticate(req, res, next);
module.exports.passwordSetup = (req, res, next) => authenticate(req, res, next, true);
