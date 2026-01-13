import './loadEnv.js';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import authRouter from './auth.js';
import { query } from './db.js';
import hubRouter from './routes/hub.js';
import onboardingRouter from './routes/onboarding.js';
import tasksRouter from './routes/tasks.js';
import formsRouter from './routes/forms.js';
import formsPublicRouter from './routes/formsPublic.js';
import { sendOnboardingExpiryReminders } from './services/onboardingReminders.js';
import { purgeArchivedTasks } from './services/taskCleanup.js';
import { processSubmissionJobs } from './services/formSubmissionJobs.js';
import { runDueDateAutomations } from './services/taskAutomations.js';

const app = express();
const PORT = process.env.API_SERVER_PORT || process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS_ON_START ?? (NODE_ENV === 'production' ? 'true' : 'false');
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
const CLIENT_BUILD_DIR = path.resolve(process.cwd(), 'dist');
const EMAIL_ASSETS_DIR = path.resolve(process.cwd(), 'server', 'assets', 'email');

// Crash visibility: log async crashes so Cloud Run doesn’t just surface opaque 503s.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Let Cloud Run restart the container; failing fast is better than serving a broken instance.
  process.exit(1);
});

// CSP environment configuration
const CSP_FRAME_SRC = (process.env.CSP_FRAME_SRC || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CSP_IMG_SRC = (process.env.CSP_IMG_SRC || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Base CSP directives - secure by default (no unsafe-inline/eval)
// Monaco-specific routes will get a relaxed policy applied via middleware
const baseCspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
  'script-src-elem': ["'self'", 'https://cdn.jsdelivr.net'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
  'style-src-elem': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
  // Allow blob: for local previews, data: for base64, plus any additional sources from env
  'img-src': ["'self'", 'data:', 'blob:', ...CSP_IMG_SRC],
  'connect-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
  'worker-src': ["'self'", 'blob:', 'https://cdn.jsdelivr.net'],
  'child-src': ["'self'", 'blob:'],
  'frame-src': ["'self'", ...CSP_FRAME_SRC]
};

// Relaxed CSP for Monaco Editor routes (Forms Manager)
// Monaco requires unsafe-inline and unsafe-eval to function
const monacoCspDirectives = {
  ...baseCspDirectives,
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
  'script-src-elem': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net']
};

// Helper to build CSP header string from directives object
function buildCspHeader(directives) {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

function normalizeOrigin(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.replace(/\/$/, '');
}

const allowedOrigins = (() => {
  const defaults = ['http://localhost:3000', 'http://localhost:4173'];
  const fromEnv = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const appBase = [process.env.APP_BASE_URL, process.env.CLIENT_APP_URL].filter(Boolean);
  const all = [...defaults, ...fromEnv, ...appBase].map(normalizeOrigin).filter(Boolean);
  return new Set(all);
})();

const corsOptions = {
  origin: (origin, callback) => {
    // allow non-browser clients (no Origin header)
    if (!origin) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.has(normalized)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

// Apply core middleware before any routers so bodies/cookies are available
app.use(cors(corsOptions)); // CORS first
app.use(express.json()); // body parser before routes
app.use(cookieParser()); // cookies before routes
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: baseCspDirectives
    }
  })
);

// API routes (explicit mounts to avoid leaking through other routers)
app.use('/api/auth', authRouter);
app.use('/api/hub', hubRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/tasks', tasksRouter);

// Forms Manager uses Monaco Editor which requires unsafe-inline/eval
// Apply relaxed CSP only to this route to keep other routes secure
app.use(
  '/api/forms',
  (req, res, next) => {
    res.setHeader('Content-Security-Policy', buildCspHeader(monacoCspDirectives));
    next();
  },
  formsRouter
);

app.use('/embed', formsPublicRouter);
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/email-assets', express.static(EMAIL_ASSETS_DIR));

if (NODE_ENV === 'production') {
  app.use(express.static(CLIENT_BUILD_DIR));
}

app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

if (NODE_ENV === 'production') {
  // Forms Manager page needs relaxed CSP for Monaco Editor
  app.get('/forms*', (req, res) => {
    res.setHeader('Content-Security-Policy', buildCspHeader(monacoCspDirectives));
    res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'));
  });

  // All other client routes use the secure default CSP (set by helmet)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error('[server-error]', err);
  const message = NODE_ENV === 'production' ? 'Unexpected server error' : err.message || 'Unexpected server error';
  res.status(500).json({ message });
});

async function maybeRunMigrations() {
  if (String(RUN_MIGRATIONS).toLowerCase() !== 'true') return;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const sqlPath = path.join(__dirname, 'sql', 'init.sql');
  const sql = await readFile(sqlPath, 'utf8');
  await query(sql);
  // eslint-disable-next-line no-console
  console.log('[migrations] ran init.sql');
}

// Run additional forms migration (idempotent, uses IF NOT EXISTS)
async function maybeRunFormsMigration() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const sqlPath = path.join(__dirname, 'sql', 'migrate_forms_platform.sql');
    const sql = await readFile(sqlPath, 'utf8');
    await query(sql);
    // eslint-disable-next-line no-console
    console.log('[migrations] ran migrate_forms_platform.sql');
  } catch (err) {
    if (err.code === 'ENOENT') return; // file not present; skip
    throw err;
  }
}

// Automatic service redaction after 90 days
async function redactOldServices() {
  try {
    const { rows } = await query(`
      UPDATE client_services 
      SET redacted_at = NOW()
      WHERE redacted_at IS NULL 
        AND agreed_date < NOW() - INTERVAL '90 days'
      RETURNING id
    `);
    if (rows.length > 0) {
      console.log(`[cron:redact-services] Redacted ${rows.length} service(s) older than 90 days`);
    }
  } catch (err) {
    console.error('[cron:redact-services] Error:', err.message);
  }
}

// Schedule daily at 2:00 AM
cron.schedule(
  '0 2 * * *',
  () => {
    console.log('[cron:redact-services] Running scheduled service redaction');
    redactOldServices();
  },
  {
    timezone: 'America/New_York' // Adjust to your timezone
  }
);

cron.schedule(
  '*/30 * * * *',
  async () => {
    try {
      const baseUrl = process.env.APP_BASE_URL || process.env.CLIENT_APP_URL || process.env.LOCAL_APP_BASE_URL;
      const result = await sendOnboardingExpiryReminders({ baseUrl });
      if (result?.processed) {
        console.log('[cron:onboarding-reminders] reminders sent:', result.processed);
      }
    } catch (err) {
      console.error('[cron:onboarding-reminders] failed', err);
    }
  },
  {
    timezone: 'America/New_York'
  }
);

// Purge archived task items after 30 days (daily at 2:20 AM)
cron.schedule(
  '20 2 * * *',
  async () => {
    const retentionDays = Number(process.env.TASK_ARCHIVE_RETENTION_DAYS || 30);
    const result = await purgeArchivedTasks({ retentionDays });
    if (result?.deleted) {
      console.log(`[cron:purge-archived-tasks] deleted ${result.deleted} archived task item(s)`);
    }
  },
  {
    timezone: 'America/New_York'
  }
);

// Evaluate due-date automations every hour
cron.schedule(
  '0 * * * *',
  async () => {
    try {
      const result = await runDueDateAutomations();
      if (result?.processed) {
        console.log(`[cron:task-automations] processed ${result.processed} due-date automation run(s)`);
      }
    } catch (err) {
      console.error('[cron:task-automations] failed', err?.message || err);
    }
  },
  {
    timezone: 'America/New_York'
  }
);

// Process form submission jobs (CTM, emails) every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
  try {
    const result = await processSubmissionJobs();
    if (result?.processed) {
      console.log(`[cron:form-jobs] processed ${result.processed} job(s)`);
    }
  } catch (err) {
    console.error('[cron:form-jobs] failed', err.message);
  }
});

maybeRunMigrations()
  .then(maybeRunFormsMigration)
  .catch((err) => {
    console.error('[migrations] failed', err);
    process.exit(1);
  })
  .finally(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`API server listening on http://localhost:${PORT} (${NODE_ENV})`);
    });
  });
