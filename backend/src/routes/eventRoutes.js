const router = require("express").Router();
const controller = require("../controllers/eventController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.use(auth);

router.get("/check-conflict", requireRole("organizer", "coordinator", "admin"), controller.checkConflict);
router.get("/", controller.list);
router.get("/:id", controller.get);

router.post("/", requireRole("organizer"), controller.create);
router.put("/:id", requireRole("organizer", "admin"), controller.update);
router.delete("/:id", requireRole("organizer", "admin"), controller.remove);

// Organizer submits draft proposal for coordinator review
router.patch("/:id/submit", requireRole("organizer"), controller.submitProposal);

router.patch("/:id/review", requireRole("coordinator"), controller.reviewProposal);

module.exports = router;
