const pool = require("../config/db");
const { fail } = require("../utils/validation");

function sameDepartment(user, event) {
  return Boolean(user.department && event.department && user.department.toLowerCase() === event.department.toLowerCase());
}

function ownsProposal(user, event) {
  return event.created_by === user.id && sameDepartment(user, event);
}

async function list({ search, category, date, status, mine }, user, includePast) {
  const conditions = [];
  const values = [];

  if (user.role === "coordinator") {
    conditions.push("BINARY LOWER(department) = BINARY LOWER(?) AND status <> 'draft'");
    values.push(user.department);
  } else if (user.role === "organizer") {
    const owned = "created_by = ? AND BINARY LOWER(department) = BINARY LOWER(?)";
    conditions.push(mine ? owned : `(status = 'published' OR (${owned}))`);
    values.push(user.id, user.department);
  } else if (user.role === "student") {
    conditions.push("status = 'published'");
  }

  if (user.role === "student" || (!includePast && user.role === "admin")) {
    conditions.push("event_date >= CURDATE()", "(event_date > CURDATE() OR start_time IS NULL OR start_time > CURTIME())");
  }
  if (status && user.role !== "student") {
    conditions.push("status = ?");
    values.push(status);
  }
  if (search) {
    conditions.push("(title LIKE ? OR description LIKE ?)");
    values.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    conditions.push("category = ?");
    values.push(category);
  }
  if (date) {
    conditions.push("event_date = ?");
    values.push(date);
  }

  // Student discovery never exposes internal review notes or reviewer identities.
  const fields = user.role === "student"
    ? "id, title, description, category, location, department, target_year, event_date, start_time, end_time, registration_deadline, capacity, status"
    : "*";
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.execute(`SELECT ${fields} FROM events ${where} ORDER BY event_date, start_time, id`, values);
  return user.role === "organizer" ? rows.map(event => ownsProposal(user, event) ? event : publicEvent(event)) : rows;
}

function publicEvent(event) {
  const { approved_by, approved_at, rejection_reason, ...visible } = event;
  return visible;
}

async function findById(id, connection = pool) {
  const [rows] = await connection.execute("SELECT * FROM events WHERE id = ?", [id]);
  return rows[0];
}

async function withScheduleLock(work) {
  const connection = await pool.getConnection();
  const lock = "SHA2(CONCAT(DATABASE(), ':campus-event-schedule'), 256)";
  let locked = false;
  try {
    const [[result]] = await connection.query(`SELECT GET_LOCK(${lock}, 5) AS acquired`);
    if (result.acquired !== 1) fail("The event schedule is busy. Try again.", 409);
    locked = true;
    return await work(connection);
  } finally {
    try {
      if (locked) await connection.query(`SELECT RELEASE_LOCK(${lock})`);
    } catch {
      connection.destroy();
    } finally {
      connection.release();
    }
  }
}

async function checkVenueConflict(location, eventDate, startTime, endTime, excludeId = null, connection = pool) {
  if (!location || !eventDate || !startTime || !endTime) return null;
  const [rows] = await connection.execute(
    `SELECT id, title, location, event_date, start_time, end_time FROM events
     WHERE location = ? AND event_date = ? AND status IN ('approved', 'published')
       AND COALESCE(start_time, '00:00:00') < ? AND COALESCE(end_time, '24:00:00') > ?
       AND (? IS NULL OR id <> ?) LIMIT 1`,
    [location, eventDate, endTime, startTime, excludeId, excludeId]
  );
  return rows[0] ?? null;
}

function values(event) {
  return [event.title, event.description, event.category, event.location, event.department, event.targetYear,
    event.eventDate, event.startTime, event.endTime, event.registrationDeadline, event.capacity];
}

async function create(event, userId) {
  const [result] = await pool.execute(
    `INSERT INTO events (title, description, category, location, department, target_year, event_date,
      start_time, end_time, registration_deadline, capacity, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [...values(event), userId]
  );
  return findById(result.insertId);
}

async function update(id, event, connection) {
  await connection.execute(
    `UPDATE events SET title = ?, description = ?, category = ?, location = ?, department = ?, target_year = ?,
      event_date = ?, start_time = ?, end_time = ?, registration_deadline = ?, capacity = ? WHERE id = ?`,
    [...values(event), id]
  );
  return findById(id, connection);
}

async function updateStatus(id, status, reviewer, reason, connection) {
  await connection.execute(
    `UPDATE events SET status = ?, approved_by = ?, rejection_reason = ?,
      approved_at = CASE WHEN ? = 'published' THEN NOW() ELSE NULL END WHERE id = ?`,
    [status, reviewer, reason, status, id]
  );
  return findById(id, connection);
}

async function remove(id, connection) {
  await connection.execute("DELETE FROM events WHERE id = ?", [id]);
}

module.exports = { list, findById, withScheduleLock, checkVenueConflict, create, update, updateStatus, remove, sameDepartment, ownsProposal, publicEvent };
