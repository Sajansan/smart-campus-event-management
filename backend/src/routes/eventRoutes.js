const router = require("express").Router();
const controller = require("../controllers/eventController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.use(auth);

// All authenticated users can check venue conflicts and list events according to their role
router.get("/check-conflict", controller.checkConflict);
router.get("/", controller.list);
router.get("/:id", controller.get);

// Organizers and Admins can create events
router.post("/", requireRole("organizer", "admin"), controller.create);
router.put("/:id", requireRole("organizer", "admin"), controller.update);
router.delete("/:id", requireRole("organizer", "admin"), controller.remove);

// Organizer submits draft proposal for coordinator review
router.patch("/:id/submit", requireRole("organizer"), controller.submitProposal);

// Coordinator and Admin can review proposals (approve, reject, request revision)
router.patch("/:id/review", requireRole("coordinator", "admin"), controller.reviewProposal);

module.exports = router;
