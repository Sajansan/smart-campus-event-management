const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validate = require('../src/utils/validation');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const integration = process.env.RUN_DB_TESTS === '1';
const testDb = `smart_campus_mvp_test_${Date.now()}_${process.pid}`;
let adminConnection, pool, server, baseUrl;
let createdDatabase = false;
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');

before(async () => {
  if (integration) {
    adminConnection = await mysql.createConnection({ ...require('../src/config/dbOptions')(), database: undefined, multipleStatements: true });
    await adminConnection.query(`CREATE DATABASE \`${testDb}\``);
    createdDatabase = true;
    const schema = fs.readFileSync(path.resolve(__dirname, '../database/schema.sql'), 'utf8').replaceAll('smart_campus_db', testDb);
    await adminConnection.query(schema);
    process.env.DB_NAME = testDb;
  }
  const app = require('../src/server');
  pool = require('../src/config/db');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (pool) await pool.end();
  if (adminConnection) {
    try { if (createdDatabase) await adminConnection.query(`DROP DATABASE \`${testDb}\``); }
    finally { await adminConnection.end(); }
  }
});

async function request(method, route, body, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

function signed(role) {
  return jwt.sign({ id: role === 'admin' ? 2 : 1, email: 'test@example.com', role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function expectStatus(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.success, status < 400);
  assert.equal(JSON.stringify(result.body).includes('stack'), false);
}

test('Health, authentication, role authorization and invalid JSON', async t => {
  const users = require('../src/models/userModel');
  t.mock.method(users, 'findById', async id => ({ id, role: id === 2 ? 'admin' : 'student', status: 'active', credential_version: 0 }));
  expectStatus(await request('GET', '/'), 200);
  expectStatus(await request('GET', '/missing'), 404);
  for (const route of ['/api/events', '/api/events/1', '/api/registrations/my', '/api/registrations/event/1']) {
    expectStatus(await request('GET', route), 401);
    expectStatus(await request('GET', route, undefined, 'invalid'), 401);
  }
  expectStatus(await request('POST', '/api/events', {}, signed('student')), 403);
  expectStatus(await request('POST', '/api/events', {}, signed('admin')), 403);
  expectStatus(await request('POST', '/api/auth/users', {}, signed('student')), 403);
  expectStatus(await request('POST', '/api/auth/users/1/invite', {}, signed('student')), 403);
  expectStatus(await request('POST', '/api/auth/staff-invitations/accept', { token: 'bad' }), 410);
  expectStatus(await request('GET', '/api/registrations/event/1', undefined, signed('student')), 403);
  expectStatus(await request('POST', '/api/registrations/1', undefined, signed('admin')), 403);
  expectStatus(await request('GET', '/api/events?all=true', undefined, signed('student')), 403);
  expectStatus(await request('GET', '/api/events/not-an-id', undefined, signed('student')), 400);
  const expired = jwt.sign({ id: 1, email: 'test@example.com', role: 'student' }, process.env.JWT_SECRET, { expiresIn: -1 });
  expectStatus(await request('GET', '/api/events', undefined, expired), 401);
  const response = await fetch(baseUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});

test('Input validation rejects impossible dates, capacity and oversized bcrypt passwords', () => {
  const event = { title: 'Workshop', eventDate: '2099-10-20' };
  for (const invalid of [{ eventDate: '2099-02-30' }, { capacity: -1 }, { capacity: 1.5 }, { startTime: '25:00' }, { startTime: '12:00', endTime: '11:00' }, { registrationDeadline: '2099-10-21 12:00:00' }]) {
    assert.throws(() => validate.event({ ...event, ...invalid }), { status: 400 });
  }
  assert.throws(() => validate.password('a'.repeat(73)), { status: 400 });
  assert.throws(() => validate.email('invalid'), { status: 400 });
  assert.equal(validate.event({ ...event, capacity: 0 }).capacity, 0);
});

test('Real MySQL: existing published events, registration rules and cascade deletion', { skip: !integration }, async () => {
  // Admin is manually provisioned in the DB; public signup is only for students.
  await pool.execute("INSERT INTO users (student_id, name, email, password, role) VALUES (NULL, ?, ?, ?, 'admin')", ['Test Admin', 'admin@example.com', await bcrypt.hash('admin-password', 12)]);
  const signup = { studentId: 'TEST001', name: 'John', email: 'john@example.com', password: 'password123', role: 'admin' };
  const registered = await request('POST', '/api/auth/register', signup);
  expectStatus(registered, 201);
  assert.equal(registered.body.data.role, 'student');
  assert.equal(registered.body.data.password, undefined);
  expectStatus(await request('POST', '/api/auth/register', signup), 409);
  expectStatus(await request('POST', '/api/auth/register', { ...signup, email: 'another@example.com' }), 409);
  const [[stored]] = await pool.execute('SELECT password FROM users WHERE email = ?', [signup.email]);
  assert.notEqual(stored.password, signup.password);
  assert.equal(await bcrypt.compare(signup.password, stored.password), true);
  const login = await request('POST', '/api/auth/login', signup);
  expectStatus(login, 200);
  assert.equal(login.body.user.password, undefined);
  const student = login.body.token;
  expectStatus(await request('POST', '/api/auth/login', { email: signup.email, password: 'wrong' }), 401);
  const adminLogin = await request('POST', '/api/auth/login', { email: 'admin@example.com', password: 'admin-password' });
  expectStatus(adminLogin, 200);
  const admin = adminLogin.body.token;
  const payload = jwt.verify(admin, process.env.JWT_SECRET);
  assert.equal(payload.role, 'admin');
  const event = { title: 'AI Workshop', description: 'Introduction', category: 'Workshop', location: 'Hall', eventDate: '2099-10-20', startTime: '09:00:00', endTime: '12:00:00', registrationDeadline: '2099-10-18 23:59:59', capacity: 100, created_by: 999999 };
  async function legacyEvent(input) {
    const [result] = await pool.execute(
      `INSERT INTO events (title, description, category, location, event_date, start_time, end_time, registration_deadline, capacity, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.title, input.description, input.category, input.location, input.eventDate, input.startTime, input.endTime,
        input.registrationDeadline, input.capacity, payload.id]
    );
    return result.insertId;
  }
  const id = await legacyEvent(event);
  const list = await request('GET', '/api/events?search=AI&category=Workshop&date=2099-10-20', undefined, student);
  expectStatus(list, 200);
  assert.equal(list.body.data.length, 1);
  expectStatus(await request('GET', `/api/events/${id}`, undefined, student), 200);
  const registration = await request('POST', `/api/registrations/${id}`, { studentId: payload.id }, student);
  expectStatus(registration, 201);
  assert.equal(registration.body.data.studentId, login.body.user.id);
  expectStatus(await request('POST', `/api/registrations/${id}`, undefined, student), 409);
  await assert.rejects(pool.execute('INSERT INTO event_registrations (student_id, event_id) VALUES (?, ?)', [login.body.user.id, id]), { code: 'ER_DUP_ENTRY' });
  await assert.rejects(pool.execute('INSERT INTO event_registrations (student_id, event_id) VALUES (?, ?)', [login.body.user.id, 2147483647]), { code: 'ER_NO_REFERENCED_ROW_2' });
  await assert.rejects(pool.execute('INSERT INTO event_registrations (student_id, event_id) VALUES (?, ?)', [2147483647, id]), { code: 'ER_NO_REFERENCED_ROW_2' });
  await assert.rejects(pool.execute("UPDATE users SET role = 'superadmin' WHERE id = ?", [login.body.user.id]), { code: 'WARN_DATA_TRUNCATED' });
  const mine = await request('GET', '/api/registrations/my', undefined, student);
  expectStatus(mine, 200);
  assert.equal(mine.body.data[0].id, id);
  assert.ok(mine.body.data[0].registered_at);
  const attendees = await request('GET', `/api/registrations/event/${id}`, undefined, admin);
  expectStatus(attendees, 200);
  assert.equal(attendees.body.data[0].student_id, signup.studentId);
  assert.equal(attendees.body.data[0].password, undefined);
  const updated = await request('PUT', `/api/events/${id}`, { title: 'Updated', capacity: 120 }, admin);
  expectStatus(updated, 200);
  assert.equal(updated.body.data.title, 'Updated');
  assert.equal(updated.body.data.event_date, event.eventDate);

  for (const patch of [{ eventDate: '2000-01-01', registrationDeadline: null }, { registrationDeadline: '2000-01-01 00:00:00' }, { capacity: 0 }]) {
    const eventId = await legacyEvent({ ...event, ...patch });
    expectStatus(await request('POST', `/api/registrations/${eventId}`, undefined, student), 409);
  }
  // Two concurrent requests compete for one seat; exactly one must succeed.
  await request('POST', '/api/auth/register', { ...signup, studentId: 'TEST002', email: 'second@example.com' });
  const second = (await request('POST', '/api/auth/login', { email: 'second@example.com', password: signup.password })).body.token;
  const oneSeat = await legacyEvent({ ...event, capacity: 1 });
  const results = await Promise.all([request('POST', `/api/registrations/${oneSeat}`, undefined, student), request('POST', `/api/registrations/${oneSeat}`, undefined, second)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const winner = results[0].status === 201 ? student : second;
  const cancellation = await request('PATCH', `/api/registrations/${results.find(result => result.status === 201).body.data.id}/cancel`, undefined, winner);
  expectStatus(cancellation, 200);
  expectStatus(await request('POST', `/api/registrations/${oneSeat}`, undefined, winner === student ? second : student), 201);
  const [[nearStart]] = await pool.query(
    "SELECT DATE_FORMAT(NOW() + INTERVAL 47 HOUR, '%Y-%m-%d') AS date, DATE_FORMAT(NOW() + INTERVAL 47 HOUR, '%H:%i:%s') AS time"
  );
  const soon = await legacyEvent({ ...event, eventDate: nearStart.date, startTime: nearStart.time, endTime: null, registrationDeadline: null });
  const bookedSoon = await request('POST', `/api/registrations/${soon}`, undefined, student);
  expectStatus(await request('PATCH', `/api/registrations/${bookedSoon.body.data.id}/cancel`, undefined, student), 400);
  const all = await request('GET', '/api/events?all=true', undefined, admin);
  expectStatus(all, 200);
  assert.ok(all.body.data.some(e => e.event_date === '2000-01-01'));
  expectStatus(await request('GET', '/api/events/2147483647', undefined, student), 404);
  expectStatus(await request('POST', '/api/registrations/2147483647', undefined, student), 404);
  expectStatus(await request('DELETE', `/api/events/${id}`, undefined, admin), 200);
  expectStatus(await request('GET', `/api/events/${id}`, undefined, student), 404);
  const [[{ count }]] = await pool.execute('SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ?', [id]);
  assert.equal(count, 0);
  assert.equal((await request('GET', '/api/registrations/my', undefined, student)).body.data.some(e => e.id === id), false);
  expectStatus(await request('DELETE', `/api/events/${id}`, undefined, admin), 404);
});

test('Real MySQL: staff invitations, departmental reviews, publication and student registration', { skip: !integration }, async t => {
  const delivered = new Map();
  let rejectNextEmail = false;
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url !== 'https://api.resend.com/emails') return originalFetch(url, options);
    const { from, to: [recipient], text } = JSON.parse(options.body);
    assert.equal(from, 'Test Campus <invites@example.test>');
    assert.ok(options.headers['Idempotency-Key']);
    if (rejectNextEmail) {
      rejectNextEmail = false;
      return Response.json({ message: 'You can only send testing emails to your own email address (private@example.com).' }, { status: 403 });
    }
    const link = text.match(/https:\/\/campus\.example\.test\/#staff-invite=[A-Za-z0-9_-]+/)[0];
    delivered.set(recipient, new URLSearchParams(new URL(link).hash.slice(1)).get('staff-invite'));
    return Response.json({ id: 'test-email' });
  });
  const inviteConfig = { RESEND_API_KEY: 'test-key', STAFF_INVITE_FROM: 'Test Campus <invites@example.test>', APP_FRONTEND_URL: 'https://campus.example.test' };
  const oldConfig = Object.fromEntries(Object.keys(inviteConfig).map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(oldConfig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, inviteConfig);

  const admin = (await request('POST', '/api/auth/login', { email: 'admin@example.com', password: 'admin-password' })).body.token;
  const studentSignup = { name: 'Campus Student', email: 'workflow-student@example.com', studentId: 'WORKFLOW001', password: 'student-password', role: 'coordinator', department: 'Computing' };
  const signup = await request('POST', '/api/auth/register', studentSignup);
  expectStatus(signup, 201);
  assert.equal(signup.body.data.role, 'student');
  const student = (await request('POST', '/api/auth/login', studentSignup)).body.token;
  const password = 'staff-private-password';
  const accept = token => request('POST', '/api/auth/staff-invitations/accept', { token, password });

  async function provision(role, department, email) {
    const created = await request('POST', '/api/auth/users', { name: email.split('@')[0], email, department, role }, admin);
    expectStatus(created, 201);
    const account = created.body.data;
    assert.equal(account.invitationStatus, 'sent');
    assert.equal(account.staffVerified, false);
    assert.equal(created.body.data.temporaryPassword, undefined);
    const credentials = { email, password };
    expectStatus(await request('POST', '/api/auth/login', credentials), 401);
    const originalToken = delivered.get(email);
    const [[stored]] = await pool.execute('SELECT HEX(token_hash) AS tokenHash FROM staff_invitations WHERE user_id = ?', [account.id]);
    assert.equal(stored.tokenHash.toLowerCase(), crypto.createHash('sha256').update(originalToken).digest('hex'));
    expectStatus(await request('POST', `/api/auth/users/${account.id}/invite`, undefined, admin), 200);
    expectStatus(await accept(originalToken), 410);
    const refreshed = delivered.get(email);
    const attempts = await Promise.all([accept(refreshed), accept(refreshed)]);
    assert.deepEqual(attempts.map(result => result.status).sort(), [200, 410]);
    assert.equal(attempts.find(result => result.status === 200).body.token, undefined);
    const login = await request('POST', '/api/auth/login', credentials);
    expectStatus(login, 200);
    return login.body;
  }

  rejectNextEmail = true;
  const failed = await request('POST', '/api/auth/users', { name: 'Retry Staff', email: 'retry@example.com', department: 'Computing', role: 'organizer' }, admin);
  expectStatus(failed, 201);
  assert.equal(failed.body.data.invitationStatus, 'failed');
  assert.match(failed.body.message, /exact address on your Resend account/);
  assert.doesNotMatch(failed.body.message, /private@example\.com/);
  const retryId = failed.body.data.id;
  expectStatus(await request('POST', `/api/auth/users/${retryId}/invite`, undefined, admin), 200);
  await pool.execute("UPDATE staff_invitations SET expires_at = UTC_TIMESTAMP() WHERE user_id = ?", [retryId]);
  expectStatus(await accept(delivered.get('retry@example.com')), 410);
  expectStatus(await request('POST', `/api/auth/users/${retryId}/invite`, undefined, admin), 200);
  const revoked = delivered.get('retry@example.com');
  for (const status of ['suspended', 'active']) {
    expectStatus(await request('PATCH', `/api/auth/users/${retryId}`, { role: 'organizer', department: 'Computing', status }, admin), 200);
  }
  expectStatus(await accept(revoked), 410);

  const organizer = await provision('organizer', 'Computing', 'organizer@example.com');
  const coordinator = await provision('coordinator', 'computing', 'reviewer@example.com');
  const other = await provision('coordinator', 'Business', 'other-reviewer@example.com');
  const event = { title: 'Python Workshop', location: 'Computer Lab', eventDate: '2099-10-23', startTime: '09:00', endTime: '11:00', capacity: 30 };
  const draft = await request('POST', '/api/events', { ...event, department: 'Business', status: 'published' }, organizer.token);
  expectStatus(draft, 201);
  assert.equal(draft.body.data.status, 'draft');
  assert.equal(draft.body.data.department, 'Computing');
  const route = `/api/events/${draft.body.data.id}`;
  expectStatus(await request('GET', route, undefined, student), 404);
  expectStatus(await request('POST', `/api/registrations/${draft.body.data.id}`, undefined, student), 404);
  expectStatus(await request('GET', route, undefined, coordinator.token), 404);
  expectStatus(await request('PATCH', route + '/submit', undefined, organizer.token), 200);
  const otherQueue = await request('GET', '/api/events?department=Computing', undefined, other.token);
  assert.equal(otherQueue.body.data.length, 0);
  expectStatus(await request('GET', route, undefined, other.token), 404);
  const review = { decision: 'approved', reason: 'Schedule confirmed' };
  expectStatus(await request('PATCH', route + '/review', review, other.token), 403);
  expectStatus(await request('PATCH', route + '/review', review, admin), 403);
  expectStatus(await request('PUT', route, { title: 'Changed after submission' }, organizer.token), 409);
  expectStatus(await request('PATCH', route + '/review', { decision: 'approved' }, coordinator.token), 400);
  expectStatus(await request('PATCH', route + '/review', { decision: 'revision_requested', reason: 'Clarify the title' }, coordinator.token), 200);
  expectStatus(await request('PUT', route, { title: 'Python for Beginners' }, organizer.token), 200);
  expectStatus(await request('PATCH', route + '/submit', undefined, organizer.token), 200);

  const overlap = await request('POST', '/api/events', { ...event, title: 'Overlapping workshop' }, organizer.token);
  const overlapRoute = `/api/events/${overlap.body.data.id}`;
  expectStatus(await request('PATCH', overlapRoute + '/submit', undefined, organizer.token), 200);
  const decisions = await Promise.all([route, overlapRoute].map(url => request('PATCH', url + '/review', review, coordinator.token)));
  assert.deepEqual(decisions.map(result => result.status).sort(), [200, 409]);
  const published = decisions.find(result => result.status === 200).body.data;
  const visible = await request('GET', `/api/events/${published.id}`, undefined, student);
  expectStatus(visible, 200);
  assert.equal(visible.body.data.rejection_reason, undefined);
  expectStatus(await request('POST', `/api/registrations/${published.id}`, undefined, student), 201);
  const roster = await request('GET', `/api/registrations/event/${published.id}`, undefined, organizer.token);
  expectStatus(roster, 200);
  assert.equal(roster.body.data[0].student_id, studentSignup.studentId);
  const checkInRoute = `/api/registrations/event/${published.id}/check-in`;
  const checkInBody = { studentUserId: signup.body.data.id };
  const checkIns = await Promise.all([organizer.token, admin].map(token => request('POST', checkInRoute, checkInBody, token)));
  assert.deepEqual(checkIns.map(result => result.status).sort(), [200, 409]);
  expectStatus(await request('PATCH', `/api/auth/users/${organizer.user.id}`, { role: 'organizer', department: 'Computing', status: 'suspended' }, admin), 200);
  expectStatus(await request('GET', '/api/events', undefined, organizer.token), 401);
});
