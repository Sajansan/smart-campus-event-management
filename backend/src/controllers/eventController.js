const events = require("../models/eventModel");
const validate = require("../utils/validation");
const { sameDepartment, ownsProposal } = events;
const editable = new Set(["draft", "revision_requested"]);

async function findEvent(id, connection) {
  const event = await events.findById(id, connection);
  if (!event) validate.fail("Event not found", 404);
  return event;
}

async function list(req, res) {
  const search = validate.text(req.query.search, "Search", 150);
  const category = validate.text(req.query.category, "Category", 100);
  const date = req.query.date === undefined ? null : validate.date(req.query.date);
  const status = validate.text(req.query.status, "Status", 50);
  const includePast = req.query.all === "true";
  if (includePast && req.user.role === "student") validate.fail("Only staff can list past events", 403);
  const data = await events.list({ search, category, date, status, mine: req.query.mine === "true" }, req.user, includePast);
  res.json({ success: true, data });
}

async function get(req, res) {
  const event = await findEvent(validate.id(req.params.id));
  const user = req.user;
  if ((user.role === "student" && event.status !== "published")
      || (user.role === "organizer" && event.status !== "published" && !ownsProposal(user, event))
      || (user.role === "coordinator" && (!sameDepartment(user, event) || event.status === "draft"))) {
    validate.fail("Event not found", 404);
  }
  const hideReview = user.role === "student" || (user.role === "organizer" && !ownsProposal(user, event));
  res.json({ success: true, data: hideReview ? events.publicEvent(event) : event });
}

async function checkConflict(req, res) {
  const location = validate.text(req.query.location, "Location", 150, true);
  const eventDate = validate.date(req.query.eventDate);
  const start = validate.time(req.query.startTime);
  const end = validate.time(req.query.endTime);
  if (!start || !end || end <= start) validate.fail("Enter a valid start and end time");
  const excludeId = req.query.excludeId ? validate.id(req.query.excludeId) : null;
  const conflict = await events.checkVenueConflict(location, eventDate, start, end, excludeId);
  res.json({ success: true, hasConflict: Boolean(conflict) });
}

async function create(req, res) {
  const input = validate.event(req.body);
  const created = await events.create({ ...input, department: req.user.department }, req.user.id);
  res.status(201).json({ success: true, message: "Draft proposal created", data: created });
}

async function update(req, res) {
  const id = validate.id(req.params.id);
  const updated = await events.withScheduleLock(async connection => {
    const event = await findEvent(id, connection);
    const organizer = req.user.role === "organizer";
    if (organizer && !ownsProposal(req.user, event)) validate.fail("You can only edit your own department's proposals", 403);
    if (organizer && !editable.has(event.status)) validate.fail("Only drafts and returned proposals can be edited", 409);
    if (!organizer && (event.status !== "published" || event.approved_by !== null)) {
      validate.fail("Only previously published events without an approval record can be edited by the administrator", 409);
    }
    const input = validate.event({
      title: event.title, description: event.description, category: event.category, location: event.location,
      targetYear: event.target_year, eventDate: event.event_date, startTime: event.start_time, endTime: event.end_time,
      registrationDeadline: event.registration_deadline, capacity: event.capacity, ...req.body,
      department: organizer ? req.user.department : event.department
    });
    if (!organizer) {
      const conflict = await events.checkVenueConflict(input.location, input.eventDate,
        input.startTime || "00:00:00", input.endTime || "24:00:00", id, connection);
      if (conflict) validate.fail("This venue is already booked at that time", 409);
    }
    return events.update(id, input, connection);
  });
  res.json({ success: true, message: "Event updated", data: updated });
}

function requireSchedule(event) {
  if (!event.location || !event.start_time || !event.end_time) {
    validate.fail("Set a venue, start time and end time before submitting for approval");
  }
  if (Date.parse(`${event.event_date}T${event.start_time}+05:30`) <= Date.now()) {
    validate.fail("Schedule the event for a future time");
  }
  if (event.registration_deadline && Date.parse(event.registration_deadline.replace(" ", "T") + "+05:30") <= Date.now()) {
    validate.fail("Set a registration deadline in the future");
  }
}

async function submitProposal(req, res) {
  const id = validate.id(req.params.id);
  const updated = await events.withScheduleLock(async connection => {
    const event = await findEvent(id, connection);
    if (!ownsProposal(req.user, event)) validate.fail("You can only submit your own department's proposals", 403);
    if (!editable.has(event.status)) validate.fail("Only drafts and returned proposals can be submitted", 409);
    requireSchedule(event);
    return events.updateStatus(id, "pending_approval", null, null, connection);
  });
  res.json({ success: true, message: "Proposal submitted for review", data: updated });
}

async function reviewProposal(req, res) {
  const id = validate.id(req.params.id);
  const decision = req.body?.decision;
  if (!["approved", "rejected", "revision_requested"].includes(decision)) validate.fail("Choose a valid review decision");
  const reason = validate.text(req.body?.reason, "Decision reason", 1000, true);
  const updated = await events.withScheduleLock(async connection => {
    const event = await findEvent(id, connection);
    if (!sameDepartment(req.user, event)) validate.fail("You can only review proposals for your department", 403);
    if (event.created_by === req.user.id) validate.fail("A different coordinator must review your proposal", 403);
    if (event.status !== "pending_approval") validate.fail("This proposal is no longer awaiting review", 409);
    if (decision === "approved") {
      requireSchedule(event);
      const conflict = await events.checkVenueConflict(event.location, event.event_date, event.start_time, event.end_time, id, connection);
      if (conflict) validate.fail("This venue is already booked at that time. Request revisions to change the schedule.", 409);
    }
    return events.updateStatus(id, decision === "approved" ? "published" : decision, req.user.id, reason, connection);
  });
  res.json({ success: true, message: decision === "approved" ? "Event approved and published" : "Review decision saved", data: updated });
}

async function remove(req, res) {
  const id = validate.id(req.params.id);
  await events.withScheduleLock(async connection => {
    const event = await findEvent(id, connection);
    if (req.user.role === "organizer") {
      if (!ownsProposal(req.user, event)) validate.fail("You can only delete your own department's proposals", 403);
      if (!editable.has(event.status)) validate.fail("Only drafts and returned proposals can be deleted", 409);
    }
    await events.remove(id, connection);
  });
  res.json({ success: true, message: "Event deleted" });
}

module.exports = { list, get, checkConflict, create, update, submitProposal, reviewProposal, remove };
