const router = require("express").Router();
const controller = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/password/setup", auth.passwordSetup, controller.changePassword);
router.post("/staff-invitations/accept", controller.acceptStaffLink);
router.get("/users", auth, requireRole("admin"), controller.listStaff);
router.post("/users", auth, requireRole("admin"), controller.createStaff);
router.patch("/users/:id", auth, requireRole("admin"), controller.updateStaff);
router.post("/users/:id/invite", auth, requireRole("admin"), controller.resendStaffLink);

module.exports = router;
