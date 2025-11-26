import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { query } from './db.js';
import { isAdminOrEditor } from './middleware/roles.js';

const router = Router();

router.use(cookieParser());

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.string().default('client'),
  avatar_url: z.string().optional().nullable(),
  created_at: z.preprocess((val) => (val instanceof Date ? val.toISOString() : val), z.string())
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

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
const IMPERSONATOR_COOKIE = 'impersonator';

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

async function findUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
  return rows[0] ? userSchema.parse(rows[0]) : null;
}

async function findUserById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
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
