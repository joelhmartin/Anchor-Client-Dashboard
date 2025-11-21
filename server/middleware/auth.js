import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const COOKIE_NAME = 'session';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Login required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query('SELECT id, first_name, last_name, email, role, created_at, avatar_url FROM users WHERE id = $1 LIMIT 1', [
      payload.sub
    ]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Session invalid' });
    req.user = user;
    req.portalUserId = user.id;
    req.actingClient = null;
    if ((user.role === 'admin' || user.role === 'editor') && req.headers['x-acting-user']) {
      const actingId = String(req.headers['x-acting-user']);
      if (actingId && actingId !== user.id) {
        const { rows: actingRows } = await query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [actingId]);
        const target = actingRows[0];
        if (target && target.role === 'client') {
          req.portalUserId = target.id;
          req.actingClient = target;
        }
      }
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Session expired or invalid' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Login required' });
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
}
