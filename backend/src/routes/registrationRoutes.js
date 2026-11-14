const router = require("express").Router();
const controller = require("../controllers/registrationController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.use(auth);

// Student registration actions
router.get("/my", requireRole("student"), controller.mine);
router.post("/:eventId", requireRole("student"), controller.register);
router.patch("/:id/cancel", requireRole("student"), controller.cancel);
router.post("/:eventId/feedback", requireRole("student"), controller.submitFeedback);

// Organizer & Admin attendee roster access
router.get("/event/:eventId", requireRole("organizer", "admin"), controller.forEvent);

// Organizer & Admin check-in action
router.post("/event/:eventId/check-in", requireRole("organizer", "admin"), controller.checkIn);

module.exports = router;
