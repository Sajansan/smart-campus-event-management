const router = require("express").Router();
const controller = require("../controllers/eventController");
const auth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

router.use(auth);
router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", requireRole("admin"), controller.create);
router.put("/:id", requireRole("admin"), controller.update);
router.delete("/:id", requireRole("admin"), controller.remove);

module.exports = router;
