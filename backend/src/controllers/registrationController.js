const registrations = require("../models/registrationModel");
const events = require("../models/eventModel");
const validate = require("../utils/validation");

async function register(req, res) {
  const data = await registrations.register(req.user.id, validate.id(req.params.eventId));
  res.status(201).json({ success: true, message: "Successfully registered for the event", data });
}

async function cancel(req, res) {
  const registrationId = validate.id(req.params.id);
  const data = await registrations.cancel(req.user.id, registrationId);
  res.json({ success: true, message: "Registration cancelled successfully", data });
}

async function mine(req, res) {
  res.json({ success: true, message: "Your registrations retrieved successfully", data: await registrations.mine(req.user.id) });
}

async function forEvent(req, res) {
  const id = validate.id(req.params.eventId);
  const event = await events.findById(id);
  if (!event) validate.fail("Event not found", 404);

  // Admin can see any event; Organizer can only see events they created
  if (req.user.role === "organizer" && event.created_by !== req.user.id) {
    validate.fail("You can only view attendee rosters for your own events", 403);
  }

  res.json({ success: true, message: "Registered students retrieved successfully", data: await registrations.forEvent(id) });
}

async function checkIn(req, res) {
  const eventId = validate.id(req.params.eventId);
  const studentUserId = validate.id(req.body.studentUserId);
  const event = await events.findById(eventId);
  if (!event) validate.fail("Event not found", 404);

  if (req.user.role === "organizer" && event.created_by !== req.user.id) {
    validate.fail("You can only record attendance for your own events", 403);
  }

  const result = await registrations.recordCheckIn(eventId, studentUserId, req.user.id);
  res.json({ success: true, message: "Student check-in recorded successfully", data: result });
}

async function submitFeedback(req, res) {
  const eventId = validate.id(req.params.eventId);
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    validate.fail("Rating must be an integer between 1 and 5");
  }
  const comments = validate.text(req.body.comments, "Comments", 2000, false);

  const result = await registrations.addFeedback(req.user.id, eventId, rating, comments);
  res.status(201).json({ success: true, message: "Feedback submitted successfully", data: result });
}

module.exports = { register, cancel, mine, forEvent, checkIn, submitFeedback };
