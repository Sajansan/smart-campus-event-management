const router = require("express").Router();
const controller = require("../controllers/registrationController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.use(auth);
router.get("/my", requireRole("student"), controller.mine);
router.get("/event/:eventId", requireRole("admin"), controller.forEvent);
router.post("/:eventId", requireRole("student"), controller.register);

module.exports = router;
