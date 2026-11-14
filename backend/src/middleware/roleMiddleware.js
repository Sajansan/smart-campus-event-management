module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.flat().includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission to access this route" });
    }
    next();
  };
};
