const pool = require("../config/db");
const { fail } = require("../utils/validation");

async function register(studentId, eventId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch student info to verify department / year eligibility
    const [students] = await connection.execute("SELECT id, department, academic_year, status FROM users WHERE id = ?", [studentId]);
    const student = students[0];
    if (!student || student.status === "suspended") {
      fail("Account is suspended or invalid", 403);
    }

    // 2. Fetch and lock event row
    const [events] = await connection.execute(
      `SELECT *, 
        (event_date > CURDATE() OR (event_date = CURDATE() AND (start_time IS NULL OR start_time > CURTIME()))) AS upcoming, 
        (registration_deadline IS NULL OR registration_deadline > NOW()) AS deadline_open 
       FROM events WHERE id = ? FOR UPDATE`,
      [eventId]
    );
    const event = events[0];
    if (!event) fail("Event not found", 404);
    if (event.status !== "published") fail("This event is not open for registration", 400);
    if (!event.upcoming) fail("This event has already started or passed", 409);
    if (!event.deadline_open) fail("Registration deadline has passed", 409);

    // 3. Eligibility checks (department & academic year)
    if (event.department && student.department && event.department.toLowerCase() !== student.department.toLowerCase()) {
      fail(`This event is restricted to students of the ${event.department} department`, 403);
    }
    if (event.target_year && student.academic_year && event.target_year !== student.academic_year) {
      fail(`This event is restricted to Year ${event.target_year} students`, 403);
    }

    // 4. Duplicate registration check (active registrations only)
    const [existing] = await connection.execute(
      "SELECT id, status FROM event_registrations WHERE student_id = ? AND event_id = ?",
      [studentId, eventId]
    );
    if (existing.length && existing[0].status === "registered") {
      fail("You have already registered for this event", 409);
    }

    // 5. Capacity check
    const [[{ count }]] = await connection.execute(
      "SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ? AND status = 'registered'",
      [eventId]
    );
    if (event.capacity !== null && count >= event.capacity) {
      fail("Event capacity has been reached", 409);
    }

    let regId;
    if (existing.length && existing[0].status === "cancelled") {
      // Re-activate previously cancelled registration
      await connection.execute(
        "UPDATE event_registrations SET status = 'registered', cancelled_at = NULL, registered_at = NOW() WHERE id = ?",
        [existing[0].id]
      );
      regId = existing[0].id;
    } else {
      const [result] = await connection.execute(
        "INSERT INTO event_registrations (student_id, event_id, status) VALUES (?, ?, 'registered')",
        [studentId, eventId]
      );
      regId = result.insertId;
    }

    await connection.commit();
    return { id: regId, eventId, studentId, status: "registered" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancel(studentId, registrationId) {
  const [rows] = await pool.execute(
    `SELECT r.*, e.event_date, e.start_time 
     FROM event_registrations r 
     JOIN events e ON e.id = r.event_id 
     WHERE r.id = ? AND r.student_id = ?`,
    [registrationId, studentId]
  );
  const reg = rows[0];
  if (!reg) fail("Registration not found", 404);
  if (reg.status === "cancelled") fail("Registration is already cancelled", 400);

  // FR-REG-07: Cancellation allowed up to 48 hours before event starts
  const eventStartStr = `${reg.event_date} ${reg.start_time || "00:00:00"}`;
  const eventStartTime = new Date(eventStartStr).getTime();
  const now = Date.now();
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;

  if (eventStartTime - now < fortyEightHoursMs) {
    fail("Registrations can only be cancelled at least 48 hours before the event starts", 400);
  }

  await pool.execute(
    "UPDATE event_registrations SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
    [registrationId]
  );

  return { id: registrationId, status: "cancelled" };
}

async function mine(studentId) {
  const [rows] = await pool.execute(
    `SELECT e.*, r.id AS registration_id, r.registered_at, r.status AS registration_status, r.attendance_status 
     FROM event_registrations r 
     JOIN events e ON e.id = r.event_id 
     WHERE r.student_id = ? AND r.status = 'registered'
     ORDER BY e.event_date, e.start_time`,
    [studentId]
  );
  return rows;
}

async function forEvent(eventId) {
  const [rows] = await pool.execute(
    `SELECT r.id AS registration_id, r.status AS registration_status, r.attendance_status, r.checked_in_at,
            u.id AS student_user_id, u.student_id, u.name, u.email, u.department, r.registered_at 
     FROM event_registrations r 
     JOIN users u ON u.id = r.student_id 
     WHERE r.event_id = ? AND r.status = 'registered'
     ORDER BY r.registered_at, r.id`,
    [eventId]
  );
  return rows;
}

async function recordCheckIn(eventId, studentUserId, organizerId) {
  const [registrations] = await pool.execute(
    "SELECT id, status, attendance_status FROM event_registrations WHERE event_id = ? AND student_id = ?",
    [eventId, studentUserId]
  );
  const reg = registrations[0];
  if (!reg || reg.status !== "registered") {
    fail("Student does not have an active registration for this event", 400);
  }
  if (reg.attendance_status === "present") {
    fail("Student is already checked in", 409);
  }

  await pool.execute(
    "UPDATE event_registrations SET attendance_status = 'present', checked_in_at = NOW(), checked_in_by = ? WHERE id = ?",
    [organizerId, reg.id]
  );

  return { registrationId: reg.id, attendance_status: "present" };
}

async function addFeedback(studentId, eventId, rating, comments) {
  // Check if student attended
  const [registrations] = await pool.execute(
    "SELECT attendance_status FROM event_registrations WHERE student_id = ? AND event_id = ?",
    [studentId, eventId]
  );
  if (!registrations.length || registrations[0].attendance_status !== "present") {
    fail("Only attendees who attended the event can submit feedback", 403);
  }

  const [result] = await pool.execute(
    "INSERT INTO event_feedback (event_id, student_id, rating, comments) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), comments = VALUES(comments)",
    [eventId, studentId, rating, comments || null]
  );
  return { id: result.insertId, eventId, studentId, rating, comments };
}

module.exports = { register, cancel, mine, forEvent, recordCheckIn, addFeedback };
