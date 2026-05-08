# WorkoutHub

WorkoutHub is a web-based workout planner and logging tool built with React and Vite.

## Current Features

- Login gate with admin-created local users
- Per-user workout plans, active workout state, and workout history
- Admin panel for creating users and resetting passwords
- Self-service password reset for signed-in users
- Session plan builder with draggable exercise cards
- Focused workout screen with responsive exercise tiles
- Set-by-set completion tracking
- Volume, set, rep, time, and duration metrics
- Calendar-based workout history

## Local Development

```bash
npm ci
npm run dev
```

The Vite dev server defaults to:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

The static production build is written to `dist/`.

## Render Deployment

This repo includes `render.yaml` for a Render Static Site Blueprint.

Render settings:

- Build command: `npm ci && npm run build`
- Publish directory: `./dist`
- Rewrite all routes to `/index.html`

## Important Auth/Data Note

This version is a static prototype. Authentication and user data are stored in browser `localStorage`, which means data is per browser/device and is not secure enough for a real multi-user online portal.

Before using this as a true hosted portal, add a backend API, database, server-side authentication, password hashing, and sessions.
