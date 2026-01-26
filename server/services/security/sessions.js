/**
 * Session Management Service
 *
 * Higher-level session operations building on the token service.
 * Handles the full session lifecycle including device tracking.
 */

import { query } from '../../db.js';
import { getEffectiveRole } from '../../utils/roles.js';
import {
  signAccessToken,
  createSession,
  refreshSession,
  revokeSession,
  revokeAllUserSessions,
  getUserActiveSessions,
  getSession,
  touchSession
} from './tokens.js';
import { logSecurityEvent } from './audit.js';

/**
 * Create a new authenticated session for a user
 * Returns access token, refresh token, and session metadata
 */
export async function createAuthenticatedSession(user, deviceInfo, options = {}) {
  const { trustDevice = false, ipAddress, userAgent, mfaVerified = false } = options;

  // Get effective role for RBAC
  const effectiveRole = await getEffectiveRole(user.role);

  // Create the session record with refresh token
  const session = await createSession({
    userId: user.id,
    deviceId: deviceInfo.deviceId,
    deviceFingerprint: deviceInfo.fingerprint,
    deviceName: deviceInfo.deviceName,
    ipAddress,
    userAgent,
    countryCode: deviceInfo.countryCode,
    city: deviceInfo.city,
    isTrusted: trustDevice
  });

  // Sign access token
  const accessToken = signAccessToken({
    userId: user.id,
    sessionId: session.sessionId,
    role: user.role,
    effectiveRole
  });

  // Update user's last login
  await query(
    `UPDATE users SET last_login_at = NOW(), login_count = login_count + 1, failed_login_count = 0 WHERE id = $1`,
    [user.id]
  );

  // Log the session creation
  await logSecurityEvent({
    userId: user.id,
    sessionId: session.sessionId,
    eventType: 'session_created',
    eventCategory: 'session',
    ipAddress,
    userAgent,
    deviceId: deviceInfo.deviceId,
    countryCode: deviceInfo.countryCode,
    success: true,
    details: {
      deviceName: deviceInfo.deviceName,
      mfaVerified,
      trustDevice
    }
  });

  return {
    accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    expiresIn: 900, // 15 minutes in seconds
    refreshExpiresAt: session.refreshExpiry,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      effectiveRole,
      avatar_url: user.avatar_url
    }
  };
}

/**
 * Refresh an existing session
 * Rotates the refresh token and issues a new access token
 */
export async function refreshAuthenticatedSession(refreshToken, context = {}) {
  const { ipAddress, userAgent } = context;

  const result = await refreshSession(refreshToken, { ipAddress, userAgent });

  if (result.error) {
    // Log failed refresh attempt
    await logSecurityEvent({
      eventType: 'session_refresh_failed',
      eventCategory: 'session',
      ipAddress,
      userAgent,
      success: false,
      failureReason: result.error,
      details: { reason: result.reason }
    });

    return { error: result.error, reason: result.reason };
  }

  const { session, newRefreshToken, refreshExpiry } = result;

  // Get effective role
  const effectiveRole = await getEffectiveRole(session.role);

  // Sign new access token
  const accessToken = signAccessToken({
    userId: session.userId,
    sessionId: session.id,
    role: session.role,
    effectiveRole
  });

  // Touch the session
  await touchSession(session.id);

  return {
    error: null,
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900,
    refreshExpiresAt: refreshExpiry,
    user: {
      id: session.userId,
      email: session.email,
      first_name: session.first_name,
      last_name: session.last_name,
      role: session.role,
      effectiveRole,
      avatar_url: session.avatar_url
    }
  };
}

/**
 * End a session (logout)
 */
export async function endSession(sessionId, userId, context = {}) {
  const { ipAddress, userAgent } = context;

  const success = await revokeSession(sessionId, 'logout');

  await logSecurityEvent({
    userId,
    sessionId,
    eventType: 'session_ended',
    eventCategory: 'session',
    ipAddress,
    userAgent,
    success,
    details: { reason: 'user_logout' }
  });

  return success;
}

/**
 * End all sessions for a user (logout everywhere)
 */
export async function endAllSessions(userId, context = {}, exceptSessionId = null) {
  const { ipAddress, userAgent, reason = 'user_logout_all' } = context;

  const count = await revokeAllUserSessions(userId, reason, exceptSessionId);

  await logSecurityEvent({
    userId,
    eventType: 'all_sessions_ended',
    eventCategory: 'session',
    ipAddress,
    userAgent,
    success: true,
    details: { reason, sessionsRevoked: count, exceptCurrentSession: !!exceptSessionId }
  });

  return count;
}

/**
 * Get all active sessions for display to user
 */
export async function listUserSessions(userId, currentSessionId = null) {
  const sessions = await getUserActiveSessions(userId);

  return sessions.map((s) => ({
    id: s.id,
    deviceName: s.device_name || 'Unknown Device',
    ipAddress: s.ip_address,
    location: [s.city, s.country_code].filter(Boolean).join(', ') || 'Unknown',
    lastActivity: s.last_activity_at,
    createdAt: s.created_at,
    isTrusted: s.is_trusted,
    isCurrent: s.id === currentSessionId
  }));
}

/**
 * Revoke a specific session by ID (for session management UI)
 */
export async function revokeUserSession(userId, sessionId, context = {}) {
  const { ipAddress, userAgent, adminUserId } = context;

  // Verify the session belongs to the user (unless admin)
  const session = await getSession(sessionId);
  if (!session) {
    return { error: 'session_not_found' };
  }

  if (session.user_id !== userId && !adminUserId) {
    return { error: 'forbidden' };
  }

  const success = await revokeSession(sessionId, adminUserId ? 'admin_revoke' : 'user_revoke');

  await logSecurityEvent({
    userId: session.user_id,
    sessionId,
    eventType: 'session_revoked',
    eventCategory: 'session',
    ipAddress,
    userAgent,
    success,
    details: {
      revokedBy: adminUserId || userId,
      isAdminAction: !!adminUserId
    }
  });

  return { error: null, success };
}

/**
 * Validate that a session is still active
 * Called by auth middleware on each request
 */
export async function validateSession(sessionId) {
  const session = await getSession(sessionId);

  if (!session) {
    return { valid: false, reason: 'not_found' };
  }

  if (session.revoked_at) {
    return { valid: false, reason: 'revoked', revokedReason: session.revoked_reason };
  }

  if (new Date(session.refresh_expiry_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  if (new Date(session.absolute_expiry_at) < new Date()) {
    return { valid: false, reason: 'absolute_expiry' };
  }

  return {
    valid: true,
    session: {
      id: session.id,
      userId: session.user_id,
      deviceId: session.device_id,
      isTrusted: session.is_trusted
    }
  };
}

/**
 * Check if user needs to re-authenticate
 * Based on session age and security settings
 */
export async function needsReauthentication(sessionId, sensitiveAction = false) {
  const session = await getSession(sessionId);
  if (!session) return true;

  // For sensitive actions, require recent authentication (last 5 minutes)
  if (sensitiveAction) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(session.last_activity_at) < fiveMinutesAgo;
  }

  return false;
}

/**
 * Handle password change - revoke all other sessions
 */
export async function onPasswordChange(userId, currentSessionId, context = {}) {
  const count = await endAllSessions(
    userId,
    { ...context, reason: 'password_change' },
    currentSessionId // Keep current session
  );

  // Update password changed timestamp
  await query(`UPDATE users SET password_changed_at = NOW() WHERE id = $1`, [userId]);

  return count;
}

/**
 * Handle MFA settings change - optionally revoke sessions
 */
export async function onMfaChange(userId, context = {}) {
  await logSecurityEvent({
    userId,
    eventType: 'mfa_settings_changed',
    eventCategory: 'mfa',
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    success: true,
    details: context.details || {}
  });

  // Optionally revoke all sessions on MFA change for high-security environments
  if (process.env.REVOKE_SESSIONS_ON_MFA_CHANGE === 'true') {
    return await endAllSessions(userId, { ...context, reason: 'mfa_change' });
  }

  return 0;
}

