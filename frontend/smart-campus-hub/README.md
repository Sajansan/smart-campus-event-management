# DBIT Campus Life

React + TypeScript frontend for the Smart Campus Event Management MVP. Its purple editorial design, custom event posters, and responsive student/admin workspaces connect to the existing Express + MySQL backend.

## Local development

The frontend uses the deployed Railway backend by default:
`https://smart-campus-event-management-production-1133.up.railway.app/api`.
Run `npm ci` and `npm run dev` from this folder to test against it.
Development always uses relative `/api` requests through Vite's Railway proxy,
avoiding browser CORS issues and ignoring `VITE_API_URL` during `npm run dev`.
For a deployed frontend, set backend `CLIENT_ORIGIN` in Railway to that frontend's origin.

To use a local backend instead, change the proxy target in `vite.config.ts` to
`http://127.0.0.1:5000` and restart Vite. Start MySQL and the backend first:

```powershell
npm --prefix backend run dev
```

In a second terminal, from this folder:

```powershell
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the configured backend, keeping database credentials and JWT secrets entirely in the backend. If port 5173 is already serving this project, reuse that server.

For separate hosting, set `VITE_API_URL` to the backend API URL (including `/api`) in an ignored `.env.local`, configure backend `CLIENT_ORIGIN` to the frontend origin, and rebuild. Never put DB credentials or JWT secrets in frontend environment variables. See `.env.example`.

## Student experience

- Create a student account and sign in.
- Discover upcoming events with search, category, and date filters.
- Open event details, register, and see confirmed events in My events.
- Sign out; expired sessions return to sign-in.

## Admin experience

Use an account provisioned directly in MySQL, as documented in `backend/ADMIN_SETUP.md`. There is no admin signup in the frontend.

- Sign in through the shared sign-in screen.
- Create and update events; handle validation errors inline.
- View all events and each event's student registration list.
- Delete an event after an explicit confirmation dialog.

Demo emails and password-key mappings are in `backend/ADMIN_SETUP.md`; the passwords stay in the ignored `backend/.env.demo.local`. No demo credentials are bundled in the frontend.

## Checks

```powershell
npm run build
npm run lint
```

See `VERIFICATION.md` for the browser-to-MySQL verification and responsive sizes. Sessions use sessionStorage for this tab and are cleared on logout/expiration. Dates/deadlines display in Sri Lanka campus time. Keyboard focus, native modal focus trapping, reduced motion, loading, failure, and empty states are included. No attendance, reports, notifications, payments, or password-reset functionality was added.

## Appearance

Use the moon/sun button on the sign-in screen or workspace header to switch between purple light and dark modes. The first visit follows the system theme; an explicit choice is saved locally and applied before the page renders on future visits. The preference also survives sign-out and account changes. No account or database setting is changed.
