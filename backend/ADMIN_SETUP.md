# Manually create an admin in MySQL

The application has exactly two role values: `admin` and `student`. Both use `POST /api/auth/login`. Public signup always creates a student. There is no admin signup endpoint.

## Workbench flow

1. Temporarily set `ADMIN_PASSWORD` in the ignored `backend/.env` to your chosen application admin password. This is separate from the MySQL server password.
2. Run `npm run admin:hash` from `backend/`. Copy the generated bcrypt hash. This command does not create a user and never prints the original password.
3. Open MySQL Workbench and execute this SQL after replacing the name, email and hash:

```sql
USE smart_campus_db;
INSERT INTO users (student_id, name, email, password, role)
VALUES (NULL, 'Your Admin Name', 'your-admin@example.com', 'PASTE_GENERATED_BCRYPT_HASH', 'admin');
```

Do not insert the original password in the `password` column. Admin `student_id` can be NULL; students need their DBIT student ID. Emails must be unique.

4. Remove `ADMIN_PASSWORD` from `.env` after generating the hash. Log in through `POST /api/auth/login` using the email and original password. The response must include `user.role: "admin"` and a JWT. Use that JWT on admin routes.

The existing `npm run admin:create` utility is another local operator method if preferred; it directly inserts an admin in MySQL, with no public signup endpoint.

## Current demo account

The demo admin `admin.demo@dbit.example` was inserted directly with parameterized SQL and a bcrypt hash. Its student ID is NULL. Three demo students were registered through the backend. See `DEMO_DATA.md` for accounts and event IDs. Passwords are stored locally in the ignored `.env.demo.local`:

| Email | Local password key |
| --- | --- |
| admin.demo@dbit.example | DEMO_ADMIN_PASSWORD |
| john.demo@dbit.example | DEMO_JOHN_PASSWORD |
| nimal.demo@dbit.example | DEMO_NIMAL_PASSWORD |
| amaya.demo@dbit.example | DEMO_AMAYA_PASSWORD |

## View demo data in Workbench

Refresh `SCHEMAS`, then expand `smart_campus_db -> Tables`. These queries avoid showing stored password hashes:

```sql
SELECT id, student_id, name, email, role FROM smart_campus_db.users;
SELECT id, title, category, location, event_date, capacity, created_by FROM smart_campus_db.events;
SELECT r.id, u.name, u.student_id, e.title, r.registered_at
FROM smart_campus_db.event_registrations r
JOIN smart_campus_db.users u ON u.id = r.student_id
JOIN smart_campus_db.events e ON e.id = r.event_id
ORDER BY e.event_date, u.name;
```

Run `npm run db:demo` while the backend is running to verify the demo again. It reuses existing demo data and does not reset passwords or change existing events. Sample event dates are relative to MySQL's campus-local clock when first created. After those dates pass, registration tests require fresh future events; the script does not silently reschedule them.
