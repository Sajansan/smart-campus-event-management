const pool = require("../config/db");
const { fail } = require("../utils/validation");

async function register(studentId, eventId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Serialize registrations for this event so concurrent requests cannot exceed capacity.
    const [events] = await connection.execute("SELECT *, (event_date > CURDATE() OR (event_date = CURDATE() AND (start_time IS NULL OR start_time > CURTIME()))) AS upcoming, (registration_deadline IS NULL OR registration_deadline > NOW()) AS deadline_open FROM events WHERE id = ? FOR UPDATE", [eventId]);
    const event = events[0];
    if (!event) fail("Event not found", 404);
    if (!event.upcoming) fail("This event has already started or passed", 409);
    if (!event.deadline_open) fail("Registration deadline has passed", 409);
    const [existing] = await connection.execute("SELECT id FROM event_registrations WHERE student_id = ? AND event_id = ?", [studentId, eventId]);
    if (existing.length) fail("You have already registered for this event", 409);
    const [[{ count }]] = await connection.execute("SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ?", [eventId]);
    if (event.capacity !== null && count >= event.capacity) fail("Event capacity has been reached", 409);
    const [result] = await connection.execute("INSERT INTO event_registrations (student_id, event_id) VALUES (?, ?)", [studentId, eventId]);
    await connection.commit();
    return { id: result.insertId, eventId, studentId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function mine(studentId) {
  const [rows] = await pool.execute("SELECT e.*, r.id AS registration_id, r.registered_at FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.student_id = ? ORDER BY e.event_date, e.start_time", [studentId]);
  return rows;
}

async function forEvent(eventId) {
  const [rows] = await pool.execute("SELECT r.id AS registration_id, u.id AS student_user_id, u.student_id, u.name, u.email, r.registered_at FROM event_registrations r JOIN users u ON u.id = r.student_id WHERE r.event_id = ? ORDER BY r.registered_at, r.id", [eventId]);
  return rows;
}

module.exports = { register, mine, forEvent };
