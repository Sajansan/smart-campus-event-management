const registrations = require("../models/registrationModel");
const events = require("../models/eventModel");
const validate = require("../utils/validation");

async function register(req, res) {
  const data = await registrations.register(req.user.id, validate.id(req.params.eventId));
  res.status(201).json({ success: true, message: "Successfully registered for the event", data });
}

async function mine(req, res) {
  res.json({ success: true, message: "Your registrations retrieved successfully", data: await registrations.mine(req.user.id) });
}

async function forEvent(req, res) {
  const id = validate.id(req.params.eventId);
  if (!(await events.findById(id))) validate.fail("Event not found", 404);
  res.json({ success: true, message: "Registered students retrieved successfully", data: await registrations.forEvent(id) });
}

module.exports = { register, mine, forEvent };
