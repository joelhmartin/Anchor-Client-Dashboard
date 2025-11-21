import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './auth.js';
import { query } from './db.js';
import hubRouter from './routes/hub.js';

const app = express();
const PORT = process.env.API_SERVER_PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS_ON_START ?? (NODE_ENV === 'production' ? 'true' : 'false');
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:4173').split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));
app.use('/api/auth', authRouter);
app.use('/api/hub', hubRouter);

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

maybeRunMigrations()
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
