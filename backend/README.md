# Smart Campus MVP backend

JavaScript MVC API for Don Bosco Info Tech (DBIT). Requires Node.js 22+, npm, and MySQL 8+ (InnoDB).

## Setup

Run from `backend/`:

```powershell
npm install
# Only copy this for a fresh setup; preserve your existing .env otherwise.
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Edit `.env`: set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=smart_campus_db`, and use the generated value for `JWT_SECRET`. Do not commit `.env`. `CLIENT_ORIGIN` defaults to `http://localhost:5173`; `JWT_EXPIRES_IN` defaults to `1d`.

Start MySQL. With a database-creation account configured in `.env`, run `npm run db:setup`. This creates the database/tables without deleting existing data and stops if it detects incompatible existing MVP tables. Alternatively, import `database/schema.sql` in MySQL Workbench/phpMyAdmin or the MySQL CLI:

```sql
SOURCE /absolute/path/to/backend/database/schema.sql;
```

Import with a MySQL administrator account if your application user cannot create databases. Then grant that application user access (replace the placeholders with the existing MySQL account and its host):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON smart_campus_db.* TO 'YOUR_DB_USER'@'YOUR_ACCOUNT_HOST';
```

The script creates `smart_campus_db` and three tables. It does not migrate an existing schema. Keep any old `smart_campus_events` database separate. Set the MySQL server time zone to your campus time zone (Sri Lanka: `+05:30`); event dates, times and deadlines are campus-local values without UTC offsets. The API compares them using MySQL's clock.

```powershell
npm run db:check
npm run dev
```

API: `http://localhost:5000`. `npm start` runs without nodemon. Startup requires a JWT secret; `/` is a server health check, while `db:check` verifies database connectivity. Schema setup is required before business endpoints can work.

## Initial admin

For manual creation in MySQL Workbench, follow [ADMIN_SETUP.md](ADMIN_SETUP.md): generate a bcrypt hash, insert the admin row directly, and log in through the shared API. There is no public admin signup. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` temporarily in your ignored `.env`, then run:

```powershell
npm run admin:create
```

Remove the three `ADMIN_*` values afterward. The script hashes the password with bcrypt and refuses duplicate emails. Student signup always assigns `student`, regardless of a submitted role. Passwords must contain at least six characters and at most 72 UTF-8 bytes.

## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| GET | `/` | Public |
| POST | `/api/auth/register` | Public, creates student |
| POST | `/api/auth/login` | Public, both roles |
| GET | `/api/events` | Student/admin, upcoming events |
| GET | `/api/events?all=true` | Admin, includes past events |
| GET | `/api/events/:id` | Student/admin |
| POST | `/api/events` | Admin |
| PUT | `/api/events/:id` | Admin |
| DELETE | `/api/events/:id` | Admin |
| POST | `/api/registrations/:eventId` | Student |
| GET | `/api/registrations/my` | Student |
| GET | `/api/registrations/event/:eventId` | Admin |

Protected requests use `Authorization: Bearer TOKEN`. Lists support `search`, `category`, and `date=YYYY-MM-DD`. Event responses use SQL field names such as `event_date`; input uses camelCase such as `eventDate`. PUT accepts partial event updates. IDs and creators come from the route/JWT, not submitted ownership fields.

Responses contain `success` and `message`; resource responses add `data`. Login returns `token` and safe `user` fields at the top level. Errors never include SQL, credentials, passwords or stack traces. Invalid input: 400; invalid token/login: 401; wrong role: 403; missing resource: 404; duplicate/closed/full registration: 409; unexpected failure: 500.

A same-day event is upcoming until `start_time`; without a start time it stays upcoming through that date. A deadline equal to the database clock is closed. `capacity: null` means unlimited and `capacity: 0` means no seats. Registration transactions lock the event row to enforce capacity under concurrent requests. Deleting an event cascades its registrations.

## Verification

```powershell
npm run check
npm test
# Optional real MySQL end-to-end tests (uses a new temporary database):
$env:RUN_DB_TESTS = '1'
npm test
Remove-Item Env:RUN_DB_TESTS
```

Integration tests require permission to create/drop a temporary database, named `smart_campus_mvp_test_*`. They never use production tables. See [POSTMAN_TESTING.md](POSTMAN_TESTING.md) for the ordered demonstration guide. Attendance, feedback, notifications, reports and other future modules are excluded.

## Demo data

The running local database contains a manually provisioned admin, three students, three events, and six registrations. [DEMO_DATA.md](DEMO_DATA.md) records the live API checks and IDs. Login passwords are in the ignored `.env.demo.local`; [ADMIN_SETUP.md](ADMIN_SETUP.md) maps each email to its password key. With the backend running, `npm run db:demo` reuses this data and verifies both roles without resetting existing passwords/events.
