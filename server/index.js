import "dotenv/config";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 4000);
const sessionCookieName = "workouthub_session";
const csrfCookieName = "workouthub_csrf";
const sessionDurationDays = 14;
const bcryptRounds = 12;

const defaultSessionPlans = [
  {
    id: "plan-chest-arms",
    name: "Chest and Arms",
    focus: "Upper body",
    schedule: "3 days / week",
    notes: "Pressing, curls, triceps, and a short finisher.",
    exercises: [
      {
        id: "exercise-bench",
        name: "Bench Press",
        category: "Chest",
        sets: 4,
        reps: 8,
        weight: 135,
        time: 0,
        notes: "Leave 1-2 reps in reserve.",
      },
      {
        id: "exercise-incline-db",
        name: "Incline Dumbbell Press",
        category: "Chest",
        sets: 3,
        reps: 10,
        weight: 45,
        time: 0,
        notes: "",
      },
      {
        id: "exercise-curl",
        name: "Dumbbell Curl",
        category: "Arms",
        sets: 3,
        reps: 12,
        weight: 25,
        time: 0,
        notes: "",
      },
      {
        id: "exercise-triceps",
        name: "Cable Triceps Pressdown",
        category: "Arms",
        sets: 3,
        reps: 12,
        weight: 40,
        time: 0,
        notes: "",
      },
    ],
  },
  {
    id: "plan-legs-core",
    name: "Legs and Core",
    focus: "Lower body",
    schedule: "2 days / week",
    notes: "Squat pattern, hinge pattern, and trunk work.",
    exercises: [
      {
        id: "exercise-squat",
        name: "Back Squat",
        category: "Legs",
        sets: 5,
        reps: 5,
        weight: 135,
        time: 0,
        notes: "Controlled depth.",
      },
      {
        id: "exercise-rdl",
        name: "Romanian Deadlift",
        category: "Legs",
        sets: 3,
        reps: 8,
        weight: 115,
        time: 0,
        notes: "",
      },
      {
        id: "exercise-plank",
        name: "Front Plank",
        category: "Core",
        sets: 3,
        reps: 1,
        weight: 0,
        time: 60,
        notes: "Brace and breathe.",
      },
    ],
  },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const databaseUrl = requireEnv("DATABASE_URL");
const sessionSecret = requireEnv("SESSION_SECRET");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
});

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function toPublicUser(user) {
  return {
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function generateTemporaryPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const randomValues = crypto.randomBytes(length);
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_data (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      session_plans JSONB NOT NULL DEFAULT '[]'::jsonb,
      active_workout JSONB,
      workout_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      csrf_token_hash TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE auth_sessions
      ADD COLUMN IF NOT EXISTS csrf_token_hash TEXT;

    CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);
  `);

  await ensureAdminUser();
}

async function ensureAdminUser() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME || "admin");
  const displayName = process.env.ADMIN_DISPLAY_NAME || "Admin";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const existing = await query("SELECT id FROM users WHERE username = $1", [username]);

  if (existing.rowCount && adminPassword && process.env.ADMIN_PASSWORD_ROTATE === "true") {
    const passwordHash = await bcrypt.hash(adminPassword, bcryptRounds);
    await query(
      "UPDATE users SET password_hash = $1, display_name = $2, role = 'admin' WHERE username = $3",
      [passwordHash, displayName, username],
    );
    return;
  }

  if (existing.rowCount) return;

  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD is required to bootstrap the first admin user");
  }

  const passwordHash = await bcrypt.hash(adminPassword, bcryptRounds);
  const userId = crypto.randomUUID();

  await query(
    `INSERT INTO users (id, username, display_name, role, password_hash)
     VALUES ($1, $2, $3, 'admin', $4)`,
    [userId, username, displayName, passwordHash],
  );
  await ensureUserData(userId);
}

async function ensureUserData(userId) {
  await query(
    `INSERT INTO user_data (user_id, session_plans, active_workout, workout_logs)
     VALUES ($1, $2::jsonb, NULL, '[]'::jsonb)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, JSON.stringify(defaultSessionPlans)],
  );
}

async function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const csrfToken = generateToken();
  const csrfTokenHash = hashToken(csrfToken);
  const expiresAt = addDays(new Date(), sessionDurationDays);

  await query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, csrf_token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), userId, tokenHash, csrfTokenHash, expiresAt.toISOString()],
  );

  return {
    token,
    csrfToken,
    expiresAt,
  };
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    signed: true,
    expires: expiresAt,
    path: "/",
  });
}

function setCsrfCookie(res, token, expiresAt) {
  res.cookie(csrfCookieName, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    signed: true,
    path: "/",
  });
  res.clearCookie(csrfCookieName, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
}

async function refreshCsrfTokenIfNeeded(req, res, row) {
  const cookieToken = req.cookies[csrfCookieName];
  const cookieTokenHash = cookieToken ? hashToken(cookieToken) : null;

  if (cookieTokenHash && cookieTokenHash === row.csrf_token_hash) {
    return row.csrf_token_hash;
  }

  const csrfToken = generateToken();
  const csrfTokenHash = hashToken(csrfToken);
  await query("UPDATE auth_sessions SET csrf_token_hash = $1 WHERE id = $2", [
    csrfTokenHash,
    row.session_id,
  ]);
  setCsrfCookie(res, csrfToken, new Date(row.expires_at));
  return csrfTokenHash;
}

async function requireAuth(req, res, next) {
  try {
    const token = req.signedCookies[sessionCookieName];

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const tokenHash = hashToken(token);
    const result = await query(
      `SELECT
        auth_sessions.id AS session_id,
        auth_sessions.csrf_token_hash,
        auth_sessions.expires_at,
        users.id,
        users.username,
        users.display_name,
        users.role
       FROM auth_sessions
       JOIN users ON users.id = auth_sessions.user_id
       WHERE auth_sessions.token_hash = $1`,
      [tokenHash],
    );

    if (!result.rowCount) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Authentication required" });
    }

    const row = result.rows[0];

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await query("DELETE FROM auth_sessions WHERE id = $1", [row.session_id]);
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }

    req.sessionId = row.session_id;
    req.csrfTokenHash = await refreshCsrfTokenIfNeeded(req, res, row);
    req.user = {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireCsrf(req, res, next) {
  const submittedToken = req.get("x-csrf-token");

  if (!submittedToken || hashToken(submittedToken) !== req.csrfTokenHash) {
    return res.status(403).json({ error: "Security token expired. Refresh and try again." });
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  return next();
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (password.length > 128) {
    return "Password must be 128 characters or fewer.";
  }

  return null;
}

function validateJsonArray(value, name) {
  if (!Array.isArray(value)) {
    const error = new Error(`${name} must be an array`);
    error.status = 400;
    throw error;
  }
}

const app = express();

if (isProduction) {
  app.set("trust proxy", 1);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in a few minutes." },
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser(sessionSecret));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const result = await query("SELECT * FROM users WHERE username = $1", [username]);

    if (!result.rowCount) {
      return res.status(401).json({ error: "Username or password is incorrect." });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Username or password is incorrect." });
    }

    await ensureUserData(user.id);
    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    setCsrfCookie(res, session.csrfToken, session.expiresAt);
    return res.json({ user: toPublicUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/logout", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    await query("DELETE FROM auth_sessions WHERE id = $1", [req.sessionId]);
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

app.get("/api/data", requireAuth, async (req, res, next) => {
  try {
    await ensureUserData(req.user.id);
    const result = await query("SELECT * FROM user_data WHERE user_id = $1", [req.user.id]);
    const data = result.rows[0];

    return res.json({
      sessionPlans: data.session_plans,
      activeWorkout: data.active_workout,
      workoutLogs: data.workout_logs,
    });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/data/active-workout", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const activeWorkout = req.body?.activeWorkout ?? null;
    await ensureUserData(req.user.id);
    await query(
      `UPDATE user_data
       SET active_workout = $2::jsonb, updated_at = now()
       WHERE user_id = $1`,
      [req.user.id, activeWorkout === null ? null : JSON.stringify(activeWorkout)],
    );
    return res.json({ activeWorkout });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/data/session-plans", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const sessionPlans = req.body?.sessionPlans;
    validateJsonArray(sessionPlans, "sessionPlans");
    await ensureUserData(req.user.id);
    await query(
      `UPDATE user_data
       SET session_plans = $2::jsonb, updated_at = now()
       WHERE user_id = $1`,
      [req.user.id, JSON.stringify(sessionPlans)],
    );
    return res.json({ sessionPlans });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/data/workout-logs", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const workoutLogs = req.body?.workoutLogs;
    validateJsonArray(workoutLogs, "workoutLogs");
    await ensureUserData(req.user.id);
    await query(
      `UPDATE user_data
       SET workout_logs = $2::jsonb, updated_at = now()
       WHERE user_id = $1`,
      [req.user.id, JSON.stringify(workoutLogs)],
    );
    return res.json({ workoutLogs });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT username, display_name AS "displayName", role, created_at AS "createdAt"
       FROM users
       ORDER BY role = 'admin' DESC, created_at ASC`,
    );
    return res.json({ users: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/users", requireAuth, requireCsrf, requireAdmin, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const displayName = String(req.body?.displayName || username).trim();
    const password = String(req.body?.password || "");
    const passwordError = validatePassword(password);

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    const userId = crypto.randomUUID();

    try {
      const result = await query(
        `INSERT INTO users (id, username, display_name, role, password_hash)
         VALUES ($1, $2, $3, 'user', $4)
         RETURNING username, display_name AS "displayName", role, created_at AS "createdAt"`,
        [userId, username, displayName || username, passwordHash],
      );
      await ensureUserData(userId);
      return res.status(201).json({ user: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "That username already exists." });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/api/admin/users/:username/reset-password",
  requireAuth,
  requireCsrf,
  requireAdmin,
  async (req, res, next) => {
    try {
      const username = normalizeUsername(req.params.username);
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, bcryptRounds);
      const result = await query(
        `UPDATE users
         SET password_hash = $1
         WHERE username = $2
         RETURNING username, display_name AS "displayName", role`,
        [passwordHash, username],
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "User not found." });
      }

      await query(
        `DELETE FROM auth_sessions
         WHERE user_id = (SELECT id FROM users WHERE username = $1)`,
        [username],
      );

      return res.json({
        user: result.rows[0],
        temporaryPassword,
      });
    } catch (error) {
      return next(error);
    }
  },
);

app.post("/api/account/password", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");
    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "The new passwords do not match." });
    }

    const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      req.user.id,
    ]);
    await query("DELETE FROM auth_sessions WHERE user_id = $1 AND id <> $2", [
      req.user.id,
      req.sessionId,
    ]);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

if (isProduction) {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
  }

  return res.status(status).json({
    error: status >= 500 ? "Something went wrong." : error.message,
  });
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`WorkoutHub server listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start WorkoutHub server");
    console.error(error);
    process.exit(1);
  });
