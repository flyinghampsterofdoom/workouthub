# WorkoutHub

WorkoutHub is a web-based workout planner and logging tool built with React and Vite.

## Current Features

- Server-backed login with admin-created users
- Per-user workout plans, active workout state, and workout history stored in Postgres
- Admin panel for creating users and resetting passwords
- Self-service password reset for signed-in users
- Password hashing with bcrypt
- Signed httpOnly session cookies with CSRF protection
- Session plan builder with draggable exercise cards
- Focused workout screen with responsive exercise tiles
- Set-by-set completion tracking
- Volume, set, rep, time, and duration metrics
- Calendar-based workout history

## Local Development

Create a local Postgres database, then copy the example environment file:

```bash
cp .env.example .env
npm ci
npm run dev
```

Required environment variables:

- `DATABASE_URL`: Postgres connection string
- `SESSION_SECRET`: long random string used to sign session cookies
- `ADMIN_PASSWORD`: first admin password used when the admin account is created

The dev command starts the API server on port `4000` and Vite on:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

The production build is written to `dist/`. In production, the Express server serves that build and the API from the same origin.

## Render Deployment

This repo includes `render.yaml` for a Render Blueprint with:

- One Node web service
- One managed Postgres database
- A generated `SESSION_SECRET`
- `DATABASE_URL` wired from the database

Set `ADMIN_PASSWORD` in Render before the first deploy. The password is only used to bootstrap the first admin account and is not shown in the site.

## Security Notes

WorkoutHub no longer stores authentication or workout data in browser `localStorage`. User accounts, password hashes, sessions, workout plans, active workouts, and workout history are persisted server-side.

The admin reset flow returns a temporary password once. User password changes do not require the old password, matching the current product requirement.
