const pool = require("../config/db");

async function list({ search, category, date }, includePast = false) {
  const conditions = includePast ? [] : ["event_date >= CURDATE()", "(event_date > CURDATE() OR start_time IS NULL OR start_time > CURTIME())"];
  const values = [];
  if (search) { conditions.push("(title LIKE ? OR description LIKE ?)"); values.push(`%${search}%`, `%${search}%`); }
  if (category) { conditions.push("category = ?"); values.push(category); }
  if (date) { conditions.push("event_date = ?"); values.push(date); }
  const [rows] = await pool.execute(`SELECT * FROM events ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY event_date, start_time, id`, values);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM events WHERE id = ?", [id]);
  return rows[0];
}

function values(event) {
  return [event.title, event.description, event.category, event.location, event.eventDate, event.startTime, event.endTime, event.registrationDeadline, event.capacity];
}

async function create(event, adminId) {
  const [result] = await pool.execute("INSERT INTO events (title, description, category, location, event_date, start_time, end_time, registration_deadline, capacity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [...values(event), adminId]);
  return findById(result.insertId);
}

async function update(id, event) {
  const [result] = await pool.execute("UPDATE events SET title = ?, description = ?, category = ?, location = ?, event_date = ?, start_time = ?, end_time = ?, registration_deadline = ?, capacity = ? WHERE id = ?", [...values(event), id]);
  return result.affectedRows ? findById(id) : null;
}

async function remove(id) {
  const [result] = await pool.execute("DELETE FROM events WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = { list, findById, create, update, remove };
