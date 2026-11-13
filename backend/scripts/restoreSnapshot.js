const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/db');

async function restore() {
  try {
    const snapshotPath = path.resolve(__dirname, '../.local/pre-aiven-snapshot.json');
    if (!fs.existsSync(snapshotPath)) {
      console.log('No snapshot file found at', snapshotPath);
      return;
    }
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    for (const table of ['users', 'events', 'event_registrations']) {
      const rows = snapshot[table] || [];
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const colNames = cols.map(c => '`' + c + '`').join(', ');
        const sql = `INSERT INTO \`${table}\` (${colNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE id=id`;
        await pool.execute(sql, Object.values(row));
      }
      console.log(`Table ${table}: restored ${rows.length} rows.`);
    }
    console.log('Restore complete!');
  } catch (err) {
    console.error('Restore error:', err);
  } finally {
    await pool.end();
  }
}

restore();

