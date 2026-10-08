# Demo data and database verification

Admin was provisioned directly with SQL and a bcrypt hash. Students were created through the public API; attempted admin signup still produced a student. No admin registration endpoint exists.

Demo login passwords are in the ignored `.env.demo.local` file; they are never printed or stored in source code.

| Role | Name | Email | User ID | Student ID |
| --- | --- | --- | --- | --- |
| Admin | DBIT Demo Admin | admin.demo@dbit.example | 1 | NULL |
| Student | John Perera | john.demo@dbit.example | 2 | DEMO-DBIT001 |
| Student | Nimal Silva | nimal.demo@dbit.example | 3 | DEMO-DBIT002 |
| Student | Amaya Fernando | amaya.demo@dbit.example | 4 | DEMO-DBIT003 |

| Event ID | Title | Date | Capacity | Demo registrations |
| --- | --- | --- | --- | --- |
| 1 | DBIT Demo - AI Workshop | 2026-10-22 | 50 | 2 |
| 2 | DBIT Demo - Sports Day | 2026-10-29 | 100 | 2 |
| 3 | DBIT Demo - Career Guidance | 2026-11-05 | 80 | 2 |

Verified on the running backend connected to `smart_campus_db`:

- GET /: 200
- POST /api/auth/login: 200
- POST /api/auth/login: 200
- POST /api/auth/login: 200
- POST /api/auth/login: 200
- GET /api/events/1: 200
- GET /api/events/2: 200
- GET /api/events/3: 200
- GET /api/registrations/my: 200
- GET /api/registrations/my: 200
- GET /api/registrations/my: 200
- GET /api/registrations/event/1: 200
- GET /api/registrations/event/2: 200
- GET /api/registrations/event/3: 200
- GET /api/events?search=DBIT%20Demo&category=Workshop: 200
- POST /api/registrations/1: 409
- POST /api/auth/register: 409
- POST /api/auth/login: 401
- GET /api/events: 401
- POST /api/events: 403
- PUT /api/events/1: 403
- DELETE /api/events/1: 403
- GET /api/registrations/event/1: 403
- GET /api/registrations/my: 403
- POST /api/registrations/1: 403
- POST /api/events: 201
- POST /api/registrations/5: 201
- PUT /api/events/5: 200
- DELETE /api/events/5: 200
- GET /api/events/5: 404

The three demo events and six registrations remain for review. The disposable update/delete test event was removed. Run `npm run db:demo` again to verify; existing demo accounts, passwords, and events are preserved.
