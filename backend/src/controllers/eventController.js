const events = require("../models/eventModel");
const validate = require("../utils/validation");

async function list(req, res) {
  const search = validate.text(req.query.search, "Search", 150);
  const category = validate.text(req.query.category, "Category", 100);
  const date = req.query.date === undefined ? null : validate.date(req.query.date);
  if (req.query.all !== undefined && req.query.all !== "true" && req.query.all !== "false") validate.fail("all must be true or false");
  if (req.query.all === "true" && req.user.role !== "admin") validate.fail("Only admins can list past events", 403);
  res.json({ success: true, message: "Events retrieved successfully", data: await events.list({ search, category, date }, req.query.all === "true") });
}

async function get(req, res) {
  const event = await events.findById(validate.id(req.params.id));
  if (!event) validate.fail("Event not found", 404);
  res.json({ success: true, message: "Event retrieved successfully", data: event });
}

async function create(req, res) {
  const event = await events.create(validate.event(req.body), req.user.id);
  res.status(201).json({ success: true, message: "Event created successfully", data: event });
}

async function update(req, res) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) validate.fail("JSON object is required");
  const id = validate.id(req.params.id);
  const existing = await events.findById(id);
  if (!existing) validate.fail("Event not found", 404);
  // Allow partial updates while validating the final event as a whole.
  const event = validate.event({ title: existing.title, description: existing.description, category: existing.category, location: existing.location, eventDate: existing.event_date, startTime: existing.start_time, endTime: existing.end_time, registrationDeadline: existing.registration_deadline, capacity: existing.capacity, ...req.body });
  const updated = await events.update(id, event);
  if (!updated) validate.fail("Event not found", 404);
  res.json({ success: true, message: "Event updated successfully", data: updated });
}

async function remove(req, res) {
  if (!(await events.remove(validate.id(req.params.id)))) validate.fail("Event not found", 404);
  res.json({ success: true, message: "Event deleted successfully" });
}

module.exports = { list, get, create, update, remove };
