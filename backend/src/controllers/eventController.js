const events = require("../models/eventModel");
const validate = require("../utils/validation");

async function list(req, res) {
  const search = validate.text(req.query.search, "Search", 150);
  const category = validate.text(req.query.category, "Category", 100);
  const date = req.query.date === undefined ? null : validate.date(req.query.date);
  const status = validate.text(req.query.status, "Status", 50);
  const department = validate.text(req.query.department, "Department", 100);
  const createdBy = req.query.mine === "true" ? req.user.id : null;
  const includePast = req.query.all === "true";

  if (includePast && req.user.role === "student") {
    validate.fail("Only staff and admins can list past events", 403);
  }

  const data = await events.list(
    { search, category, date, status, department, createdBy },
    req.user.role,
    req.user.id,
    includePast
  );

  res.json({ success: true, message: "Events retrieved successfully", data });
}

async function get(req, res) {
  const event = await events.findById(validate.id(req.params.id));
  if (!event) validate.fail("Event not found", 404);

  // Student should only see published events
  if (req.user.role === "student" && event.status !== "published") {
    validate.fail("Event not found", 404);
  }

  // Organizer should only see published events or their own drafts
  if (req.user.role === "organizer" && event.status !== "published" && event.created_by !== req.user.id) {
    validate.fail("Access forbidden", 403);
  }

  res.json({ success: true, message: "Event retrieved successfully", data: event });
}

async function checkConflict(req, res) {
  const location = validate.text(req.query.location, "Location", 150, true);
  const eventDate = validate.date(req.query.eventDate);
  const startTime = req.query.startTime;
  const endTime = req.query.endTime;
  const excludeId = req.query.excludeId ? validate.id(req.query.excludeId) : null;

  const conflict = await events.checkVenueConflict(location, eventDate, startTime, endTime, excludeId);
  res.json({ success: true, hasConflict: !!conflict, conflict });
}

async function create(req, res) {
  const eventData = validate.event(req.body);
  const initialStatus = req.user.role === "admin" ? (req.body.status || "published") : "draft";

  // Check venue conflict
  const conflict = await events.checkVenueConflict(
    eventData.location,
    eventData.eventDate,
    eventData.startTime,
    eventData.endTime
  );

  if (conflict && initialStatus === "published") {
    validate.fail(`Venue collision: "${conflict.title}" is already scheduled at this venue and time.`, 409);
  }

  const created = await events.create(eventData, req.user.id, initialStatus);
  res.status(201).json({
    success: true,
    message: initialStatus === "draft" ? "Draft proposal created" : "Event created successfully",
    data: created,
    venueWarning: conflict ? `Notice: overlaps with "${conflict.title}"` : null
  });
}

async function update(req, res) {
  const id = validate.id(req.params.id);
  const existing = await events.findById(id);
  if (!existing) validate.fail("Event not found", 404);

  // Strict ownership for Organizers (FR-EVT-05 / US-09)
  if (req.user.role === "organizer" && existing.created_by !== req.user.id) {
    validate.fail("You can only modify your own events", 403);
  }

  const merged = {
    title: existing.title,
    description: existing.description,
    category: existing.category,
    location: existing.location,
    department: existing.department,
    targetYear: existing.target_year,
    eventDate: existing.event_date,
    startTime: existing.start_time,
    endTime: existing.end_time,
    registrationDeadline: existing.registration_deadline,
    capacity: existing.capacity,
    ...req.body
  };

  const eventData = validate.event(merged);
  const updated = await events.update(id, eventData);
  res.json({ success: true, message: "Event updated successfully", data: updated });
}

async function submitProposal(req, res) {
  const id = validate.id(req.params.id);
  const existing = await events.findById(id);
  if (!existing) validate.fail("Event not found", 404);

  if (req.user.role === "organizer" && existing.created_by !== req.user.id) {
    validate.fail("You can only submit your own drafts", 403);
  }

  const updated = await events.updateStatus(id, { status: "pending_approval" });
  res.json({ success: true, message: "Event proposal submitted for coordinator review", data: updated });
}

async function reviewProposal(req, res) {
  const id = validate.id(req.params.id);
  const { decision, reason } = req.body || {};
  const validDecisions = ["approved", "rejected", "revision_requested"];

  if (!validDecisions.includes(decision)) {
    validate.fail("Decision must be 'approved', 'rejected', or 'revision_requested'");
  }

  if ((decision === "rejected" || decision === "revision_requested") && (!reason || !reason.trim())) {
    validate.fail("A reason is mandatory when rejecting or requesting revisions", 400);
  }

  const existing = await events.findById(id);
  if (!existing) validate.fail("Event not found", 404);

  // Department check for Coordinator (FR-EVT-06)
  if (req.user.role === "coordinator" && req.user.department && existing.department && req.user.department !== existing.department) {
    validate.fail("You can only review proposals within your department", 403);
  }

  // Check venue conflict on approval
  if (decision === "approved") {
    const conflict = await events.checkVenueConflict(
      existing.location,
      existing.event_date,
      existing.start_time,
      existing.end_time,
      id
    );
    if (conflict) {
      validate.fail(`Cannot approve: venue collision with "${conflict.title}"`, 409);
    }
  }

  const newStatus = decision === "approved" ? "published" : decision;
  const updated = await events.updateStatus(id, {
    status: newStatus,
    approvedBy: req.user.id,
    rejectionReason: reason || null
  });

  res.json({ success: true, message: `Proposal has been ${newStatus}`, data: updated });
}

async function remove(req, res) {
  const id = validate.id(req.params.id);
  const existing = await events.findById(id);
  if (!existing) validate.fail("Event not found", 404);

  if (req.user.role === "organizer" && existing.created_by !== req.user.id) {
    validate.fail("You can only delete your own draft events", 403);
  }

  await events.remove(id);
  res.json({ success: true, message: "Event deleted successfully" });
}

module.exports = { list, get, checkConflict, create, update, submitProposal, reviewProposal, remove };
