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
    adminConnection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true });
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
  return jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function expectStatus(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.success, status < 400);
  assert.equal(JSON.stringify(result.body).includes('stack'), false);
}

test('Health, authentication, role authorization and invalid JSON', async () => {
  expectStatus(await request('GET', '/'), 200);
  expectStatus(await request('GET', '/missing'), 404);
  for (const route of ['/api/events', '/api/events/1', '/api/registrations/my', '/api/registrations/event/1']) {
    expectStatus(await request('GET', route), 401);
    expectStatus(await request('GET', route, undefined, 'invalid'), 401);
  }
  expectStatus(await request('POST', '/api/events', {}, signed('student')), 403);
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

test('Real MySQL: all 11 MVP flows, duplicate/deadline/capacity rules and cascade deletion', { skip: !integration }, async () => {
  const users = require('../src/models/userModel');
  await users.create({ name: 'Test Admin', email: 'admin@example.com', password: await bcrypt.hash('admin-password', 12), role: 'admin' });
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
  const created = await request('POST', '/api/events', event, admin);
  expectStatus(created, 201);
  const id = created.body.data.id;
  assert.equal(created.body.data.created_by, payload.id);
  const list = await request('GET', '/api/events?search=AI&category=Workshop&date=2099-10-20', undefined, student);
  expectStatus(list, 200);
  assert.equal(list.body.data.length, 1);
  expectStatus(await request('GET', `/api/events/${id}`, undefined, student), 200);
  const registration = await request('POST', `/api/registrations/${id}`, { studentId: payload.id }, student);
  expectStatus(registration, 201);
  assert.equal(registration.body.data.studentId, login.body.user.id);
  expectStatus(await request('POST', `/api/registrations/${id}`, undefined, student), 409);
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
    const result = await request('POST', '/api/events', { ...event, ...patch }, admin);
    expectStatus(result, 201);
    expectStatus(await request('POST', `/api/registrations/${result.body.data.id}`, undefined, student), 409);
  }
  // Two concurrent requests compete for one seat; exactly one must succeed.
  await request('POST', '/api/auth/register', { ...signup, studentId: 'TEST002', email: 'second@example.com' });
  const second = (await request('POST', '/api/auth/login', { email: 'second@example.com', password: signup.password })).body.token;
  const oneSeat = await request('POST', '/api/events', { ...event, capacity: 1 }, admin);
  const results = await Promise.all([request('POST', `/api/registrations/${oneSeat.body.data.id}`, undefined, student), request('POST', `/api/registrations/${oneSeat.body.data.id}`, undefined, second)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
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
