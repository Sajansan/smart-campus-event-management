const router = require("express").Router();
const controller = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.post("/register", controller.register);
router.post("/login", controller.login);

// Admin User Management
router.get("/users", auth, requireRole("admin"), controller.listUsers);
router.patch("/users/:id", auth, requireRole("admin"), controller.updateUserRoleStatus);

module.exports = router;
