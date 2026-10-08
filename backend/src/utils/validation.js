function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647) {
    fail("Invalid ID");
  }
  return Number(value);
}

function text(value, label, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || (required && !value.trim()) || value.trim().length > max) {
    fail(`${label} ${required ? "is required and " : ""}must be text with at most ${max} characters`);
  }
  return value.trim() || null;
}

function email(value) {
  const result = text(value, "Email", 150, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail("Valid email is required");
  return result;
}

function password(value) {
  if (typeof value !== "string" || value.length < 6 || Buffer.byteLength(value, "utf8") > 72) {
    fail("Password must have at least 6 characters and at most 72 UTF-8 bytes");
  }
  return value;
}

function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("Event date must be YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1000) {
    fail("Invalid event date");
  }
  return value;
}

function time(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) fail("Time must be HH:mm or HH:mm:ss");
  return value.length === 5 ? `${value}:00` : value;
}

function event(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("JSON object is required");
  const result = {
    title: text(body.title, "Title", 150, true),
    description: text(body.description, "Description", 16000),
    category: text(body.category, "Category", 100),
    location: text(body.location, "Location", 150),
    eventDate: date(body.eventDate),
    startTime: time(body.startTime),
    endTime: time(body.endTime),
    registrationDeadline: null,
    capacity: body.capacity ?? null,
  };
  if (result.startTime && result.endTime && result.endTime <= result.startTime) fail("End time must be after start time");
  if (body.registrationDeadline != null && body.registrationDeadline !== "") {
    if (typeof body.registrationDeadline !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(body.registrationDeadline)) {
      fail("Registration deadline must be YYYY-MM-DD HH:mm:ss");
    }
    date(body.registrationDeadline.slice(0, 10));
    time(body.registrationDeadline.slice(11));
    result.registrationDeadline = body.registrationDeadline.replace("T", " ");
    if (result.registrationDeadline > `${result.eventDate} ${result.startTime || "23:59:59"}`) fail("Registration deadline must not be after the event starts");
  }
  if (result.capacity !== null && (!Number.isInteger(result.capacity) || result.capacity < 0 || result.capacity > 2147483647)) {
    fail("Capacity must be a non-negative integer or null");
  }
  return result;
}

module.exports = { fail, id, text, email, password, date, event };
