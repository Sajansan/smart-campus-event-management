# Smart Campus backend

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

For an existing campus database, run `npm run db:migrate:workflow` before starting the updated API. Run it with an account that can alter and create tables. It preserves existing users, events and registrations. Event dates, times and deadlines use Sri Lanka time (`+05:30`).

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

## Staff and approval workflow

### Enable email invitations

1. In Resend, create a **Sending access** API key. For a local inbox test, use `onboarding@resend.dev` and invite your Resend account's own email address. For real invitations, add a sending domain in Resend and publish the DNS records it provides. Use an address on the verified domain as the sender. Disable click tracking on the sending domain for account links.
2. Add the settings below to the existing, ignored `backend/.env`. For deployment, add the same variables to the Railway API service. Use the verified sender and the public Vercel frontend URL in production.

   ```dotenv
   RESEND_API_KEY=your_sending_key
   STAFF_INVITE_FROM="DBIT Campus <onboarding@resend.dev>"
   APP_FRONTEND_URL=http://127.0.0.1:5173
   ```

3. Run `npm --prefix backend run db:migrate:workflow` from the project root to create the invitation table. Restart the local API. For production, run the migration against the deployment database and deploy both the updated API and frontend.
4. Sign in as Administrator and open **Staff access → Add staff member**. Create an Event Organizer and a Department Coordinator for the same department. Each invitee follows the emailed link, sets their password, and then signs in normally. Choose **Resend invite** if a link expires or email submission fails. Staff who already have a password can continue signing in. For incomplete accounts created before email invitations, use **Send invite** on the staff row.

The organizer saves and submits a draft. The coordinator reviews it in **Review queue** and records a reason when approving, rejecting or requesting changes. Approval publishes the event immediately. Departmental events accept registrations from students in that department. The organizer can view the roster for their published event.

## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| GET | `/` | Public |
| POST | `/api/auth/register` | Public, creates student |
| POST | `/api/auth/login` | Public, all roles |
| GET / POST | `/api/auth/users` | Admin, list staff accounts or create a pending account and send an invitation |
| PATCH | `/api/auth/users/:id` | Admin, update staff assignment or access |
| POST | `/api/auth/users/:id/invite` | Admin, send a replacement invitation or a password reset link |
| POST | `/api/auth/staff-invitations/accept` | Staff with a valid one-time token |
| POST | `/api/auth/password/setup` | Staff using a previously issued temporary password |
| GET | `/api/events` | Authenticated, filtered by role and department |
| GET | `/api/events?all=true` | Admin, includes past events |
| GET | `/api/events/:id` | Authenticated, filtered by role and department |
| POST | `/api/events` | Organizer, creates a draft for their department |
| PUT | `/api/events/:id` | Organizer for own editable proposals, admin for legacy published events |
| DELETE | `/api/events/:id` | Organizer for own editable proposals, admin for any event |
| PATCH | `/api/events/:id/submit` | Organizer, submits own draft or returned proposal |
| PATCH | `/api/events/:id/review` | Coordinator, decides on pending proposals in their department |
| POST | `/api/registrations/:eventId` | Student |
| GET | `/api/registrations/my` | Student |
| GET | `/api/registrations/event/:eventId` | Admin, or organizer for their own event |

Protected requests use `Authorization: Bearer TOKEN`. Lists support `search`, `category`, and `date=YYYY-MM-DD`. Event responses use SQL field names such as `event_date`; input uses camelCase such as `eventDate`. PUT accepts partial event updates. IDs and creators come from the route/JWT, not submitted ownership fields.

Responses include `success` and resource responses include `data`. Login and legacy password setup return `token` and safe `user` fields. The emailed link expires after 24 hours and is consumed when staff save their password. The Admin's staff list shows whether Resend accepted the send request. Actual delivery can be checked in the Resend dashboard.

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

Integration tests require permission to create/drop a temporary database, named `smart_campus_mvp_test_*`. They cover the staff approval workflow and compatibility with existing published events.

## Demo data

The running local database contains a manually provisioned admin, three students, three events, and six registrations. [DEMO_DATA.md](DEMO_DATA.md) records the live API checks and IDs. Login passwords are in the ignored `.env.demo.local`; [ADMIN_SETUP.md](ADMIN_SETUP.md) maps each email to its password key. With the backend running, `npm run db:demo` reuses this data and verifies both roles without resetting existing passwords/events.

## Shared Aiven database

The active `backend/.env` now points to Aiven. The migration copied and compared all fields in 5 users, 4 events, and 7 registrations, preserving IDs, password hashes, roles and timestamps. The full MySQL integration suite passed on Aiven in an isolated temporary database, which was removed afterward.

On your home PC, privately copy the active `backend/.env` and `backend/certs/ca.pem` into the same locations, then start the backend normally. Both PCs use the same data immediately. Keep environment files out of Git; application and schema changes can still be pushed and pulled. `DB_SSL_CA=certs/ca.pem` enables certificate and hostname verification. Database sessions use Sri Lanka time for event deadlines.

Your original local MySQL database remains available. Its settings are saved in `.env.local-backup`; a migration snapshot is in `.local/pre-aiven-snapshot.json`. These files are ignored by Git. `scripts/migrateToAiven.js` is a one-time migration and refuses to import into an existing cloud schema.

Confirm the Aiven service plan is **Free** in Service settings; the trial banner does not identify the selected plan.
