import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { query } from './db.js';
import { isAdminOrEditor } from './middleware/roles.js';
import { isMailgunConfigured, sendMailgunMessage } from './services/mailgun.js';

const router = Router();

router.use(cookieParser());

const dateToString = (val) => (val instanceof Date ? val.toISOString() : val);

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.string().default('client'),
  avatar_url: z.string().optional().nullable(),
  onboarding_completed_at: z.preprocess(dateToString, z.string().optional().nullable()),
  created_at: z.preprocess(dateToString, z.string())
});

const nameSchema = z
  .string()
  .min(1, 'Required')
  .max(60, 'Too long')
  .regex(/^[^<>]+$/, 'Invalid characters');

const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

const passwordResetSchema = z.object({
  token: z.string().min(10, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
const IMPERSONATOR_COOKIE = 'impersonator';
const PASSWORD_RESET_TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || '60', 10);

function normalizeBase(value) {
  if (!value) return null;
  let base = String(value).trim();
  if (!/^https?:\/\//i.test(base)) {
    const isLocal = base.startsWith('localhost') || base.startsWith('127.0.0.1');
    base = `${isLocal ? 'http' : 'https'}://${base}`;
  }
  return base.replace(/\/$/, '');
}

function resolveAppBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const isLocalHost = host && (host.includes('localhost') || host.includes('127.0.0.1'));

  // Prefer explicit local override when running locally
  const localOverride = normalizeBase(process.env.LOCAL_APP_BASE_URL);
  if (isLocalHost && localOverride) return localOverride;

  // In development with localhost, default to port 3000 unless overridden
  if (isLocalHost && process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  // Fall back to configured base URL (single source of truth)
  const fromEnv = normalizeBase(process.env.APP_BASE_URL || process.env.CLIENT_APP_URL);
  if (fromEnv) return fromEnv;

  if (host) return normalizeBase(`${proto}://${host}`);

  return 'http://localhost:3000';
}

function signToken(userId) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'lax' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  });
}

function setImpersonatorCookie(res, userId) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(IMPERSONATOR_COOKIE, userId || '', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'lax' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.clearCookie(IMPERSONATOR_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function pruneExpiredResetTokens(userId) {
  if (userId) {
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND (used_at IS NOT NULL OR expires_at < NOW())', [userId]);
    return;
  }
  await query('DELETE FROM password_reset_tokens WHERE expires_at < NOW()');
}

async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await pruneExpiredResetTokens(userId);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
}

async function findValidResetToken(token) {
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT id, user_id
     FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function markResetTokenUsed(record) {
  if (!record?.id || !record?.user_id) return;
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [record.id]);
  await pruneExpiredResetTokens(record.user_id);
}

async function sendPasswordResetEmail(user, token, baseUrl) {
  const resetUrl = `${baseUrl}/pages/forgot-password?token=${token}`;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'there';

  if (!isMailgunConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(`[password-reset] Mail provider not configured. Reset URL: ${resetUrl}`);
    return { delivered: false, resetUrl };
  }

  await sendMailgunMessage({
    to: [user.email],
    subject: 'Reset your Anchor password',
    text: `Hi ${name},

We received a request to reset your Anchor password. Use the link below to set a new password:
${resetUrl}

If you did not request this, you can safely ignore this email.`,
    html: `<p>Hi ${name},</p>
<p>We received a request to reset your Anchor password. Use the link below to set a new password:</p>
<p><a href="${resetUrl}" target="_blank" rel="noopener">Reset your password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>`
  });

  return { delivered: true, resetUrl };
}

async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT u.*, cp.onboarding_completed_at
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.email = $1
     LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows[0] ? userSchema.parse(rows[0]) : null;
}

async function findUserById(id) {
  const { rows } = await query(
    `SELECT u.*, cp.onboarding_completed_at
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] ? userSchema.parse(rows[0]) : null;
}

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Session invalid' });

    res.json({ user, impersonator: req.cookies?.[IMPERSONATOR_COOKIE] || null });
  } catch (err) {
    res.status(401).json({ message: 'Session expired or invalid' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const payload = registerSchema.parse(req.body);
    const existing = await findUserByEmail(payload.email);
    if (existing) return res.status(409).json({ message: 'Email already in use' });

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const { rows } = await query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, role, created_at`,
      [payload.firstName.trim(), payload.lastName.trim(), payload.email.toLowerCase(), passwordHash, 'client']
    );

    const user = userSchema.parse(rows[0]);
    const token = signToken(user.id);
    setAuthCookie(res, token);
    setImpersonatorCookie(res, '');
    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    }
    console.error('[register]', err);
    res.status(500).json({ message: 'Unable to register right now' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await findUserByEmail(payload.email);
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const passwordRow = await query('SELECT password_hash FROM users WHERE id = $1 LIMIT 1', [user.id]);
    const passwordHash = passwordRow.rows[0]?.password_hash;
    const isValid = passwordHash && (await bcrypt.compare(payload.password, passwordHash));
    if (!isValid) return res.status(401).json({ message: 'Invalid email or password' });

    const token = signToken(user.id);
    setAuthCookie(res, token);
    setImpersonatorCookie(res, '');
    res.json({ user, impersonator: null });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    }
    console.error('[login]', err);
    res.status(500).json({ message: 'Unable to login right now' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = passwordResetRequestSchema.parse(req.body);
    const user = await findUserByEmail(email);
    const appBaseUrl = resolveAppBaseUrl(req);
    const genericResponse = {
      message: 'If an account exists with that email, we sent password reset instructions.'
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const { token } = await createPasswordResetToken(user.id);
    const { resetUrl } = await sendPasswordResetEmail(user, token, appBaseUrl);
    const responsePayload = { ...genericResponse };

    if (!isMailgunConfigured() && process.env.NODE_ENV !== 'production') {
      responsePayload.resetUrl = resetUrl;
      responsePayload.token = token;
    }

    res.json(responsePayload);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    }
    console.error('[forgot-password]', err);
    res.status(500).json({ message: 'Unable to process password reset right now' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = passwordResetSchema.parse(req.body);
    const record = await findValidResetToken(token);
    if (!record) return res.status(400).json({ message: 'Reset link is invalid or expired' });

    const user = await findUserById(record.user_id);
    if (!user) {
      await markResetTokenUsed(record);
      return res.status(404).json({ message: 'User for this reset link could not be found' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, record.user_id]);
    await markResetTokenUsed(record);

    const tokenJwt = signToken(user.id);
    setAuthCookie(res, tokenJwt);
    setImpersonatorCookie(res, '');

    res.json({ message: 'Password updated successfully', user });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.issues[0]?.message || 'Invalid payload' });
    }
    console.error('[reset-password]', err);
    res.status(500).json({ message: 'Unable to reset password right now' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(204).send();
});

router.post('/impersonate', isAdminOrEditor, async (req, res) => {
  try {
    const targetId = req.body?.user_id;
    if (!targetId) return res.status(400).json({ message: 'Missing user_id' });
    const target = await findUserById(targetId);
    if (!target) return res.status(404).json({ message: 'User not found' });
    const token = signToken(target.id);
    setAuthCookie(res, token);
    setImpersonatorCookie(res, req.user?.id || '');
    res.json({ user: target, impersonator: req.user?.id || null });
  } catch (err) {
    console.error('[impersonate]', err);
    res.status(500).json({ message: 'Unable to impersonate' });
  }
});

export default router;
