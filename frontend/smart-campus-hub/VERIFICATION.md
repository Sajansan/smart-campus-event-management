# Frontend verification

Verified locally on 8 October 2026 with Vite on port 5173, Express on port 5000, and MySQL `smart_campus_db`.

The story is student/admin browser interaction -> Vite API proxy -> Express role-protected endpoints -> MySQL -> rendered response.

| Flow | Evidence |
| --- | --- |
| Shared sign-in | Demo student signed in as `student`; manually provisioned demo admin signed in as `admin`. Correct navigation and workspace appeared. |
| Student signup | Phone form created a temporary student and signed in automatically. SQL confirmed role `student` and the submitted student ID. |
| Event discovery | Three original MySQL demo events rendered with dates, times, and locations. Search and category/date filters changed the displayed results and count. |
| Details | Event details fetched from `/api/events/:id`; native modal showed location, date, time, capacity, and deadline. |
| Registration | UI confirmation changed to “You’re on the list”; My events included the new registration; SQL confirmed persistence. |
| Admin registration list | AI Workshop showed John Perera and Nimal Silva with student IDs and registration dates. |
| Admin creation | Form POST created a temporary event; it appeared in the management table; SQL confirmed ownership and fields. |
| Admin update | Invalid end time showed the backend validation message. A corrected update changed location to Studio B in both UI and MySQL. |
| Deletion | UI confirmation and “Keep event” were tested. The temporary event was then deleted through the authenticated backend API: DELETE 200, subsequent GET 404. |
| Empty states | New student with zero registrations and unmatched search displayed useful empty states and working recovery buttons. |
| Session | Reload retained the signed-in session; sign-out returned to the auth screen. Code handles protected API 401 by clearing the session and reopening sign-in. |
| Responsive | Checked 320, 390, 768, 1024, and 1440 px widths. No horizontal page overflow. Mobile navigation hides offscreen content from accessibility; background is inert while navigation is open. Admin table scrolls within its container. |
| Accessibility | Labeled inputs; keyboard-visible focus; native dialog focus trap/escape; live error/success messages; readable contrast; reduced-motion support; mobile inputs avoid focus zoom. |
| Browser errors | No error/warning console entries were observed during verification. |
| Build | TypeScript and production Vite build passed. |
| Lint | ESLint passed. |

Temporary QA account/event/registration were removed. Original demo data remains: one admin, three students, three events, six registrations. Existing admin provisioning and database schema were preserved. Screenshots in `docs/` capture the desktop and phone student experience.

Use the accounts mapped in `backend/ADMIN_SETUP.md`; local passwords are in the ignored `backend/.env.demo.local`. They are not in frontend source, screenshots, or build output.

## Purple theme and dark mode

Replaced the green palette with purple and lavender across the application. Verified the light/dark toggle, persistence across reload, and matching event detail, admin form/table, and sign-in colors. Reviewed desktop and mobile appearance with no page overflow. The device theme is used before any explicit local preference is saved. Browser theme-color and native form color-scheme follow the selected theme.
