const pool = require("../config/db");

async function list({ search, category, date, status, department, createdBy }, userRole = "student", userId = null, includePast = false) {
  const conditions = [];
  const values = [];

  // Visibility rules based on role
  if (userRole === "student") {
    conditions.push("status = 'published'");
    if (!includePast) {
      conditions.push("event_date >= CURDATE()");
      conditions.push("(event_date > CURDATE() OR start_time IS NULL OR start_time > CURTIME())");
    }
  } else if (userRole === "organizer") {
    if (createdBy) {
      conditions.push("created_by = ?");
      values.push(createdBy);
    } else {
      // Show published events or own events
      conditions.push("(status = 'published' OR created_by = ?)");
      values.push(userId);
    }
  } else if (userRole === "coordinator") {
    if (department) {
      conditions.push("department = ?");
      values.push(department);
    }
    if (status) {
      conditions.push("status = ?");
      values.push(status);
    }
  } else if (userRole === "admin") {
    if (status) {
      conditions.push("status = ?");
      values.push(status);
    }
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

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.execute(`SELECT * FROM events ${whereClause} ORDER BY event_date, start_time, id`, values);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM events WHERE id = ?", [id]);
  return rows[0];
}

async function checkVenueConflict(location, eventDate, startTime, endTime, excludeEventId = null) {
  if (!location || !eventDate || !startTime || !endTime) return null;
  let sql = `
    SELECT id, title, location, event_date, start_time, end_time 
    FROM events 
    WHERE location = ? 
      AND event_date = ? 
      AND status IN ('approved', 'published')
      AND (start_time < ? AND end_time > ?)
  `;
  const params = [location, eventDate, endTime, startTime];
  if (excludeEventId) {
    sql += " AND id != ?";
    params.push(excludeEventId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function create(event, userId, initialStatus = "draft") {
  const [result] = await pool.execute(
    `INSERT INTO events 
      (title, description, category, location, department, target_year, event_date, start_time, end_time, registration_deadline, capacity, status, created_by) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.title,
      event.description,
      event.category,
      event.location,
      event.department || null,
      event.targetYear || null,
      event.eventDate,
      event.startTime,
      event.endTime,
      event.registrationDeadline,
      event.capacity,
      initialStatus,
      userId
    ]
  );
  return findById(result.insertId);
}

async function update(id, event) {
  const [result] = await pool.execute(
    `UPDATE events 
     SET title = ?, description = ?, category = ?, location = ?, department = ?, target_year = ?, event_date = ?, start_time = ?, end_time = ?, registration_deadline = ?, capacity = ? 
     WHERE id = ?`,
    [
      event.title,
      event.description,
      event.category,
      event.location,
      event.department || null,
      event.targetYear || null,
      event.eventDate,
      event.startTime,
      event.endTime,
      event.registrationDeadline,
      event.capacity,
      id
    ]
  );
  return result.affectedRows ? findById(id) : null;
}

async function updateStatus(id, { status, approvedBy = null, rejectionReason = null }) {
  const [result] = await pool.execute(
    `UPDATE events 
     SET status = ?, 
         approved_by = COALESCE(?, approved_by), 
         rejection_reason = ?, 
         approved_at = CASE WHEN ? IN ('approved', 'published') THEN NOW() ELSE approved_at END
     WHERE id = ?`,
    [status, approvedBy, rejectionReason, status, id]
  );
  return result.affectedRows ? findById(id) : null;
}

async function remove(id) {
  const [result] = await pool.execute("DELETE FROM events WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = { list, findById, checkVenueConflict, create, update, updateStatus, remove };
