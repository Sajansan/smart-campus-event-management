const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');

const baseUrl = process.env.DEMO_API_URL || 'http://127.0.0.1:5000';
const credentialsPath = path.resolve(__dirname, '../.env.demo.local');
const results = [];

async function request(method, route, body, token, expected = 200) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${data.message}`);
  assert.equal(data.success, expected < 400);
  // Inspect field names rather than printing API data or tokens.
  function safe(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['password', 'stack', 'JWT_SECRET', 'DB_PASSWORD'].includes(key), `Sensitive field returned: ${key}`);
      safe(child);
    }
  }
  safe(data);
  results.push(`${method} ${route}: ${expected}`);
  return data;
}

async function login(email, password, role) {
  const data = await request('POST', '/api/auth/login', { email, password });
  assert.equal(data.user.role, role);
  return data;
}

async function main() {
  let disposableEventId;
  let adminToken;
  try {
    if (process.env.DB_NAME !== 'smart_campus_db') throw new Error('Demo data is only supported in smart_campus_db.');
    await request('GET', '/');
    if (!fs.existsSync(credentialsPath)) {
      const generated = ['DEMO_ADMIN_PASSWORD', 'DEMO_JOHN_PASSWORD', 'DEMO_NIMAL_PASSWORD', 'DEMO_AMAYA_PASSWORD']
        .map(key => `${key}=${crypto.randomBytes(18).toString('base64url')}`).join('\n');
      fs.writeFileSync(credentialsPath, '# Local demo credentials. Do not commit or share this file.\n' + generated + '\n', { flag: 'wx' });
    }
    const credentials = dotenv.parse(fs.readFileSync(credentialsPath));
    const adminEmail = 'admin.demo@dbit.example';
    const [[existingAdmin]] = await pool.execute('SELECT id, role FROM users WHERE email = ?', [adminEmail]);
    if (!existingAdmin) {
      const hash = await bcrypt.hash(credentials.DEMO_ADMIN_PASSWORD, 12);
      // Manual database provisioning: no signup request is used for the admin.
      await pool.execute("INSERT INTO users (student_id, name, email, password, role) VALUES (NULL, ?, ?, ?, 'admin')", ['DBIT Demo Admin', adminEmail, hash]);
    } else assert.equal(existingAdmin.role, 'admin', 'Existing demo email is not an admin.');
    const adminLogin = await login(adminEmail, credentials.DEMO_ADMIN_PASSWORD, 'admin');
    adminToken = adminLogin.token;
    const adminId = adminLogin.user.id;
    const students = [
      { studentId: 'DEMO-DBIT001', name: 'John Perera', email: 'john.demo@dbit.example', password: credentials.DEMO_JOHN_PASSWORD },
      { studentId: 'DEMO-DBIT002', name: 'Nimal Silva', email: 'nimal.demo@dbit.example', password: credentials.DEMO_NIMAL_PASSWORD },
      { studentId: 'DEMO-DBIT003', name: 'Amaya Fernando', email: 'amaya.demo@dbit.example', password: credentials.DEMO_AMAYA_PASSWORD },
    ];
    for (const student of students) {
      const [[existing]] = await pool.execute('SELECT id FROM users WHERE email = ?', [student.email]);
      if (!existing) {
        // A forged role is intentionally submitted; registration must still assign student.
        const created = await request('POST', '/api/auth/register', { ...student, role: 'admin' }, undefined, 201);
        assert.equal(created.data.role, 'student');
      }
      const signedIn = await login(student.email, student.password, 'student');
      student.id = signedIn.user.id;
      student.token = signedIn.token;
      const [[stored]] = await pool.execute('SELECT student_id, password, role FROM users WHERE id = ?', [student.id]);
      assert.equal(stored.student_id, student.studentId);
      assert.equal(stored.role, 'student');
      assert.notEqual(stored.password, student.password);
      assert.equal(await bcrypt.compare(student.password, stored.password), true);
    }
    const [[dates]] = await pool.query("SELECT DATE_FORMAT(CURDATE() + INTERVAL 14 DAY, '%Y-%m-%d') AS first, DATE_FORMAT(CURDATE() + INTERVAL 21 DAY, '%Y-%m-%d') AS second, DATE_FORMAT(CURDATE() + INTERVAL 28 DAY, '%Y-%m-%d') AS third, DATE_FORMAT(CURDATE() + INTERVAL 10 DAY, '%Y-%m-%d 23:59:59') AS deadline");
    const eventDetails = [
      { title: 'DBIT Demo - AI Workshop', description: 'An introductory AI workshop for DBIT students.', category: 'Workshop', location: 'DBIT Computer Lab', eventDate: dates.first, startTime: '09:00:00', endTime: '12:00:00', registrationDeadline: dates.deadline, capacity: 50 },
      { title: 'DBIT Demo - Sports Day', description: 'Team sports and activities for campus students.', category: 'Sports', location: 'DBIT Sports Ground', eventDate: dates.second, startTime: '08:30:00', endTime: '16:00:00', registrationDeadline: dates.deadline, capacity: 100 },
      { title: 'DBIT Demo - Career Guidance', description: 'CV preparation and interview practice.', category: 'Seminar', location: 'DBIT Main Hall', eventDate: dates.third, startTime: '10:00:00', endTime: '13:00:00', registrationDeadline: dates.deadline, capacity: 80 },
    ];
    const events = [];
    for (const details of eventDetails) {
      const [[existing]] = await pool.execute('SELECT id FROM events WHERE created_by = ? AND title = ? ORDER BY id LIMIT 1', [adminId, details.title]);
      const event = existing ? (await request('GET', `/api/events/${existing.id}`, undefined, adminToken)).data : (await request('POST', '/api/events', details, adminToken, 201)).data;
      assert.equal(event.created_by, adminId);
      events.push(event);
    }
    const pairs = [[0, 0], [0, 2], [1, 0], [1, 1], [2, 1], [2, 2]];
    for (const [studentIndex, eventIndex] of pairs) {
      const student = students[studentIndex];
      const event = events[eventIndex];
      const [[existing]] = await pool.execute('SELECT id FROM event_registrations WHERE student_id = ? AND event_id = ?', [student.id, event.id]);
      if (!existing) await request('POST', `/api/registrations/${event.id}`, { studentId: adminId }, student.token, 201);
    }
    for (const student of students) {
      const registrations = (await request('GET', '/api/registrations/my', undefined, student.token)).data;
      for (const [studentIndex, eventIndex] of pairs.filter(([index]) => students[index].id === student.id)) {
        assert.ok(registrations.some(event => event.id === events[eventIndex].id));
      }
    }
    for (let index = 0; index < events.length; index++) {
      const rows = (await request('GET', `/api/registrations/event/${events[index].id}`, undefined, adminToken)).data;
      for (const [studentIndex] of pairs.filter(([, eventIndex]) => eventIndex === index)) assert.ok(rows.some(row => row.student_user_id === students[studentIndex].id));
    }
    const studentToken = students[0].token;
    const filtered = (await request('GET', '/api/events?search=DBIT%20Demo&category=Workshop', undefined, studentToken)).data;
    assert.ok(filtered.some(event => event.id === events[0].id));
    await request('POST', `/api/registrations/${events[0].id}`, undefined, studentToken, 409);
    await request('POST', '/api/auth/register', students[0], undefined, 409);
    await request('POST', '/api/auth/login', { email: adminEmail, password: 'deliberately-wrong' }, undefined, 401);
    await request('GET', '/api/events', undefined, undefined, 401);
    await request('POST', '/api/events', eventDetails[0], studentToken, 403);
    await request('PUT', `/api/events/${events[0].id}`, { title: 'Forbidden' }, studentToken, 403);
    await request('DELETE', `/api/events/${events[0].id}`, undefined, studentToken, 403);
    await request('GET', `/api/registrations/event/${events[0].id}`, undefined, studentToken, 403);
    await request('GET', '/api/registrations/my', undefined, adminToken, 403);
    await request('POST', `/api/registrations/${events[0].id}`, undefined, adminToken, 403);
    // Exercise update/delete using a new disposable event; preserve all demo events.
    const disposable = await request('POST', '/api/events', { ...eventDetails[0], title: 'Disposable DB verification event' }, adminToken, 201);
    disposableEventId = disposable.data.id;
    await request('POST', `/api/registrations/${disposableEventId}`, undefined, studentToken, 201);
    const updated = await request('PUT', `/api/events/${disposableEventId}`, { location: 'Updated Test Hall' }, adminToken);
    assert.equal(updated.data.location, 'Updated Test Hall');
    await request('DELETE', `/api/events/${disposableEventId}`, undefined, adminToken);
    const [[{ count }]] = await pool.execute('SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ?', [disposableEventId]);
    assert.equal(count, 0);
    await request('GET', `/api/events/${disposableEventId}`, undefined, studentToken, 404);
    disposableEventId = null;
    const report = ['# Demo data and database verification', '', 'Admin was provisioned directly with SQL and a bcrypt hash. Students were created through the public API; attempted admin signup still produced a student. No admin registration endpoint exists.', '', 'Demo login passwords are in the ignored `.env.demo.local` file; they are never printed or stored in source code.', '', '| Role | Name | Email | User ID | Student ID |', '| --- | --- | --- | --- | --- |', `| Admin | DBIT Demo Admin | ${adminEmail} | ${adminId} | NULL |`, ...students.map(s => `| Student | ${s.name} | ${s.email} | ${s.id} | ${s.studentId} |`), '', '| Event ID | Title | Date | Capacity | Demo registrations |', '| --- | --- | --- | --- | --- |', ...events.map((e, i) => `| ${e.id} | ${e.title} | ${e.event_date} | ${e.capacity} | ${pairs.filter(([, index]) => index === i).length} |`), '', 'Verified on the running backend connected to `smart_campus_db`:', '', ...results.map(r => `- ${r}`), '', 'The three demo events and six registrations remain for review. The disposable update/delete test event was removed. Run `npm run db:demo` again to verify; existing demo accounts, passwords, and events are preserved.', ''];
    fs.writeFileSync(path.resolve(__dirname, '../DEMO_DATA.md'), report.join('\n'));
    console.log('Demo data ready: 1 manually provisioned admin, 3 students, 3 events, 6 registrations.');
    console.log(`Passed ${results.length} live API checks. Credentials: backend/.env.demo.local. Details: backend/DEMO_DATA.md.`);
  } catch (error) {
    console.error(error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (disposableEventId && adminToken) {
      try { await request('DELETE', `/api/events/${disposableEventId}`, undefined, adminToken); }
      catch { console.error('Disposable test event cleanup failed. Event ID:', disposableEventId); }
    }
    await pool.end();
  }
}
main();
