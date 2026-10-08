// Copies a consistent local snapshot to an empty cloud database. Never overwrites rows.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const options = require('../src/config/dbOptions');
const root = path.resolve(__dirname, '..');
const tables = ['users', 'events', 'event_registrations'];

async function main() {
  const local = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
  const cloud = dotenv.parse(fs.readFileSync(path.join(root, '.env.aiven')));
  cloud.DB_SSL_CA ||= 'certs/ca.pem';
  assert.equal(cloud.DB_NAME, 'smart_campus_db');
  assert.notEqual(local.DB_HOST, cloud.DB_HOST, 'The source must be the local database.');
  let source, target;
  try {
    source = await mysql.createConnection(options(local));
    target = await mysql.createConnection({ ...options(cloud), database: undefined, multipleStatements: true });
    const [existing] = await target.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [cloud.DB_NAME]);
    assert.equal(existing.length, 0, 'Cloud database already has tables. Migration stopped to protect existing data.');
    await source.query("SET time_zone = '+00:00'");
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const snapshot = {};
    for (const table of tables) snapshot[table] = (await source.query(`SELECT * FROM \`${table}\` ORDER BY id`))[0];
    await source.commit();
    fs.mkdirSync(path.join(root, '.local'), { recursive: true });
    fs.writeFileSync(path.join(root, '.local', 'pre-aiven-snapshot.json'), JSON.stringify(snapshot, null, 2), { flag: 'wx' });
    await target.query(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8'));
    await target.query("SET time_zone = '+00:00'");
    await target.beginTransaction();
    for (const table of tables) {
      for (const row of snapshot[table]) {
        const columns = Object.keys(row);
        await target.execute(`INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, Object.values(row));
      }
      const [copied] = await target.query(`SELECT * FROM \`${table}\` ORDER BY id`);
      assert.deepEqual(copied, snapshot[table], `Data verification failed for ${table}`);
      console.log(`${table}: ${copied.length} rows copied and verified`);
    }
    await target.commit();
    fs.copyFileSync(path.join(root, '.env'), path.join(root, '.env.local-backup'), fs.constants.COPYFILE_EXCL);
    // Retain JWT and application settings while switching only the DB connection.
    let active = fs.readFileSync(path.join(root, '.env'), 'utf8');
    for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_SSL_CA']) {
      const line = `${key}=${JSON.stringify(cloud[key])}`;
      const pattern = new RegExp(`^${key}=.*$`, 'm');
      active = pattern.test(active) ? active.replace(pattern, () => line) : `${active.trimEnd()}\n${line}\n`;
    }
    fs.writeFileSync(path.join(root, '.env'), active);
    console.log('Migration complete. Backend .env now selects Aiven; local MySQL and its settings are preserved.');
  } catch (error) {
    if (target) await target.rollback().catch(() => {});
    console.error('Migration failed:', error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (source) await source.end();
    if (target) await target.end();
  }
}
main();
