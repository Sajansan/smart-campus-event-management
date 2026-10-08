const jwt = require("jsonwebtoken");

module.exports = function authMiddleware(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ success: false, message: "Bearer token is required" });
  try {
    const user = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!Number.isInteger(user.id) || user.id < 1 || !["student", "admin"].includes(user.role) || typeof user.email !== "string") throw new Error("Invalid payload");
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
