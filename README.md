# Smart Campus Event Management System

A web application planned for Don Bosco Info Tech (DBIT), developed by OUSL Group 66 for EEI4189.

## Current starting stage

Both applications live in this repository and use separate npm packages and lockfiles.

```text
backend/
  .env.example
  package.json
  package-lock.json
  src/
    server.js
    config/database.js
    scripts/check-db.js
frontend/smart-campus-hub/
  package.json
  package-lock.json
  index.html
  vite.config.ts
  eslint.config.js
  tsconfig*.json
  src/
    main.tsx
    App.tsx
    App.css
    index.css
```

The frontend is a minimal placeholder. The backend exposes only its existing API status response. Business features, database models, tables, and migrations are not implemented yet.

## Proposal requirements

- Student and Administrator roles; student registration/login using DBIT student ID.
- Upcoming event discovery with search and filters by date, category, and faculty.
- Administrator event creation, editing, deletion, and registration lists.
- Student event registration, status, and confirmation emails.
- Automated email reminders 24 hours before events; the feature overview also mentions SMS and deadline notifications.
- Administrator attendance marking, real-time tracking, and student attendance records.
- Post-attendance star ratings and comments; administrator feedback reports.
- Responsive mobile/tablet/desktop UI, password hashing with bcrypt, and targets of a 3-second event listing load, 99% semester availability, and at least 500 concurrent users. These targets require later verification.

## Technology plan

- Frontend: React, HTML/CSS, and Bootstrap or Tailwind CSS. The existing starter also uses TypeScript and Vite. A CSS framework has not been selected or installed yet.
- Backend: Node.js, Express REST API, JWT, and bcrypt.
- Database: MySQL, mysql2 driver, and Sequelize ORM.
- Design and development: Figma, Draw.io, VS Code, Git/GitHub, Postman, and XAMPP/WAMP for a local database service.
- Email/SMS providers and reminder scheduling will be chosen during feature development.

## Local setup

Use Node.js 22.22 or a compatible newer release (22.22 is the version used for these checks), npm, and MySQL. Run commands from the repository root unless specified otherwise.

### Backend

```powershell
cd backend
npm ci
Copy-Item .env.example .env
npm run dev
```

For subsequent starts, keep your existing `.env`; edit its local settings rather than copying over it. The default API URL is `http://localhost:5000`.

Existing API contract: `GET /` returns HTTP 200 with:

```json
{ "message": "Smart Campus Event Management API is running" }
```

`CLIENT_ORIGIN` defaults to `http://localhost:5173`. Change it if the frontend uses a different origin. `npm start` starts the API without nodemon. The starter API runs without a database connection.

### Frontend (second terminal)

```powershell
cd frontend/smart-campus-hub
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

### Database preparation

Start your local MySQL service and create an empty `smart_campus_events` database. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in `backend/.env` to match your local service.

```powershell
cd backend
npm run db:check
```

This command authenticates and closes the connection; it does not create or modify tables. Database connectivity is only confirmed when this command succeeds against your configured MySQL instance. Replace the JWT placeholder with a strong random secret before implementing authentication.

### Validation

```powershell
npm --prefix backend run check
npm --prefix frontend/smart-campus-hub run lint
npm --prefix frontend/smart-campus-hub run build
```

## Git hygiene

The root `.gitignore` excludes dependency folders, generated builds, caches, logs, local environment files, and editor files throughout the repository. `.env.example` files and npm lockfiles stay visible to Git and should be committed. Each teammate installs dependencies with `npm ci`.

Source/configuration changes will remain visible in VS Code until you commit them. Do not commit `node_modules`, `dist`, or `.env`. No business features or deployment are included in this starting stage.
