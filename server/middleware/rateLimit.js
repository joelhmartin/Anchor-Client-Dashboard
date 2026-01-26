/**
 * Rate Limiting Middleware
 *
 * Express middleware for protecting routes against brute force attacks.
 */

import { checkRateLimit, recordAttempt, isUserLocked } from '../services/security/rateLimit.js';

/**
 * Get client IP address from request
 * Handles proxied requests (Cloud Run, load balancers)
 */
export function getClientIp(req) {
  // Cloud Run and most proxies set x-forwarded-for
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Can be comma-separated list, take the first (original client)
    return forwarded.split(',')[0].trim();
  }

  // Fallback
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Create rate limiting middleware for login attempts
 */
export function loginRateLimiter() {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const email = req.body?.email?.toLowerCase();

    // Check IP-based rate limit
    const ipCheck = await checkRateLimit('login_ip', ip);
    if (!ipCheck.allowed) {
      return res.status(429).json({
        message: 'Too many login attempts. Please try again later.',
        retryAfter: ipCheck.retryAfter,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // If email provided, check user-based rate limit
    if (email) {
      const userCheck = await checkRateLimit('login_user', email);
      if (!userCheck.allowed) {
        return res.status(429).json({
          message: 'Too many login attempts for this account. Please try again later.',
          retryAfter: userCheck.retryAfter,
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
    }

    // Attach rate limit info to request for use after authentication
    req.rateLimit = { ip, email };

    next();
  };
}

/**
 * Record a failed login attempt (call after authentication failure)
 */
export async function recordFailedLoginAttempt(req) {
  const { ip, email } = req.rateLimit || {};

  if (ip) {
    await recordAttempt('login_ip', ip);
  }
  if (email) {
    await recordAttempt('login_user', email);
  }
}

/**
 * Create rate limiting middleware for password reset requests
 */
export function passwordResetRateLimiter() {
  return async (req, res, next) => {
    const ip = getClientIp(req);

    const check = await checkRateLimit('password_reset_ip', ip);
    if (!check.allowed) {
      return res.status(429).json({
        message: 'Too many password reset requests. Please try again later.',
        retryAfter: check.retryAfter,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    req.rateLimit = { ip };
    next();
  };
}

/**
 * Record a password reset attempt
 */
export async function recordPasswordResetAttempt(req) {
  const { ip } = req.rateLimit || {};
  if (ip) {
    await recordAttempt('password_reset_ip', ip);
  }
}

/**
 * Create rate limiting middleware for MFA attempts
 */
export function mfaRateLimiter() {
  return async (req, res, next) => {
    // MFA rate limiting is per-user, extracted from the challenge or session
    const userId = req.body?.userId || req.mfaUserId;

    if (userId) {
      const check = await checkRateLimit('mfa_user', userId);
      if (!check.allowed) {
        return res.status(429).json({
          message: 'Too many verification attempts. Please request a new code.',
          retryAfter: check.retryAfter,
          code: 'MFA_RATE_LIMIT_EXCEEDED'
        });
      }
    }

    next();
  };
}

/**
 * Middleware to check if user account is locked
 */
export function checkAccountLock() {
  return async (req, res, next) => {
    const userId = req.body?.userId || req.user?.id;

    if (!userId) {
      return next();
    }

    const lockStatus = await isUserLocked(userId);
    if (lockStatus.locked) {
      return res.status(423).json({
        message: 'Account temporarily locked due to too many failed attempts.',
        retryAfter: lockStatus.retryAfter,
        lockedUntil: lockStatus.until,
        code: 'ACCOUNT_LOCKED'
      });
    }

    next();
  };
}

/**
 * Generic rate limiter factory
 * Creates a rate limiter for any endpoint type
 */
export function createRateLimiter(limitType, identifierFn) {
  return async (req, res, next) => {
    const identifier = identifierFn(req);

    if (!identifier) {
      return next();
    }

    const check = await checkRateLimit(limitType, identifier);
    if (!check.allowed) {
      return res.status(429).json({
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: check.retryAfter,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    req.rateLimit = { ...req.rateLimit, [limitType]: identifier };
    next();
  };
}

/**
 * Middleware to add rate limit headers to response
 */
export function addRateLimitHeaders(limitType, maxRequests, windowSeconds) {
  return (req, res, next) => {
    // Add standard rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Window', windowSeconds);

    // Remaining and reset would need to be set dynamically based on actual usage
    // This is a simplified version

    next();
  };
}

