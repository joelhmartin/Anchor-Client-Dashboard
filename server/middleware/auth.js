/**
 * Authentication Middleware
 *
 * Validates access tokens and enforces role-based access control.
 * Works with short-lived JWT access tokens (15 min).
 */

import { query } from '../db.js';
import { getEffectiveRole } from '../utils/roles.js';
import { verifyAccessToken, validateSession, touchSession } from '../services/security/index.js';

/**
 * Require authentication via Bearer token
 *
 * Validates the access token and attaches user info to request.
 * For backward compatibility, also supports legacy cookie-based auth during migration.
 */
export async function requireAuth(req, res, next) {
  try {
    let payload = null;

    // Check Authorization header (preferred for API calls)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const accessToken = authHeader.substring(7);
      payload = verifyAccessToken(accessToken);
    }

    // Fallback: Check session cookie (for browser navigation, e.g., OAuth redirects)
    if (!payload && req.cookies?.session) {
      payload = verifyAccessToken(req.cookies.session);
    }

    // Token not found or invalid
    if (!payload) {
      return res.status(401).json({
        message: 'Authentication required',
        code: 'TOKEN_EXPIRED_OR_INVALID'
      });
    }

    // Validate session is still active (not revoked)
    const sessionCheck = await validateSession(payload.sessionId);
    if (!sessionCheck.valid) {
      return res.status(401).json({
        message: 'Session expired or revoked',
        code: 'SESSION_INVALID',
        reason: sessionCheck.reason
      });
    }

    // Get user details
    const { rows } = await query(
      `SELECT id, first_name, last_name, email, role, created_at, avatar_url
       FROM users WHERE id = $1 LIMIT 1`,
      [payload.userId]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get effective role
    const effectiveRole = await getEffectiveRole(user.role);

    // Attach to request
    req.user = {
      ...user,
      effective_role: effectiveRole
    };
    req.sessionId = payload.sessionId;
    req.portalUserId = user.id;
    req.actingClient = null;

    // Handle "act as client" for admins viewing client data
    if ((effectiveRole === 'superadmin' || effectiveRole === 'admin') && req.headers['x-acting-user']) {
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

    // Touch session to track activity (async, don't wait)
    touchSession(payload.sessionId).catch(() => {});

    next();
  } catch (err) {
    console.error('[requireAuth]', err);
    return res.status(401).json({
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Require superadmin role
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Login required', code: 'NOT_AUTHENTICATED' });
  }
  if (req.user.effective_role !== 'superadmin') {
    return res.status(403).json({ message: 'Superadmin only', code: 'FORBIDDEN' });
  }
  next();
}

/**
 * Require any of the specified roles
 */
export function requireAnyRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Login required', code: 'NOT_AUTHENTICATED' });
    }
    const userRole = req.user.effective_role || req.user.role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${roles.join(', ')}`,
        code: 'FORBIDDEN'
      });
    }
    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for routes that work differently for authenticated vs anonymous users
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      // No token provided - continue without user
      req.user = null;
      return next();
    }

    const accessToken = authHeader.substring(7);
    const payload = verifyAccessToken(accessToken);

    if (!payload) {
      // Invalid token - continue without user
      req.user = null;
      return next();
    }

    // Validate session
    const sessionCheck = await validateSession(payload.sessionId);
    if (!sessionCheck.valid) {
      req.user = null;
      return next();
    }

    // Get user
    const { rows } = await query(
      `SELECT id, first_name, last_name, email, role, created_at, avatar_url
       FROM users WHERE id = $1 LIMIT 1`,
      [payload.userId]
    );

    if (rows.length === 0) {
      req.user = null;
      return next();
    }

    const effectiveRole = await getEffectiveRole(rows[0].role);
    req.user = { ...rows[0], effective_role: effectiveRole };
    req.sessionId = payload.sessionId;
    req.portalUserId = rows[0].id;

    next();
  } catch (err) {
    // On error, continue without user
    req.user = null;
    next();
  }
}

/**
 * Require step-up authentication for sensitive actions
 * Checks that the session was recently authenticated (within 5 minutes)
 */
export async function requireRecentAuth(req, res, next) {
  if (!req.user || !req.sessionId) {
    return res.status(401).json({
      message: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
  }

  // Get session last activity
  const { rows } = await query(`SELECT last_activity_at FROM user_sessions WHERE id = $1`, [req.sessionId]);

  if (rows.length === 0) {
    return res.status(401).json({
      message: 'Session not found',
      code: 'SESSION_NOT_FOUND'
    });
  }

  const lastActivity = new Date(rows[0].last_activity_at);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  if (lastActivity < fiveMinutesAgo) {
    return res.status(403).json({
      message: 'Please re-authenticate to perform this action',
      code: 'REAUTHENTICATION_REQUIRED'
    });
  }

  next();
}

/**
 * Rate-aware middleware that checks if user is being rate limited
 * For use on sensitive endpoints
 */
export function checkUserRateLimit(limitType) {
  return async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const { checkRateLimit } = await import('../services/security/rateLimit.js');
    const check = await checkRateLimit(limitType, req.user.id);

    if (!check.allowed) {
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
        retryAfter: check.retryAfter,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    next();
  };
}
