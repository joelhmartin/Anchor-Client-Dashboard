import { query } from '../db.js';

let cachedHasSuperadmin = null;
let lastCheckedAt = 0;
const CACHE_TTL_MS = 60_000;

async function detectHasSuperadmin() {
  const now = Date.now();
  if (cachedHasSuperadmin !== null && now - lastCheckedAt < CACHE_TTL_MS) return cachedHasSuperadmin;
  try {
    const { rows } = await query("SELECT 1 FROM users WHERE role = 'superadmin' LIMIT 1");
    cachedHasSuperadmin = rows.length > 0;
  } catch {
    // If DB isn't reachable, keep previous cached value (or default to false)
    cachedHasSuperadmin = cachedHasSuperadmin ?? false;
  } finally {
    lastCheckedAt = now;
  }
  return cachedHasSuperadmin;
}

/**
 * Normalize roles while migrating:
 * - legacy 'editor' -> 'admin'
 * - legacy 'admin' -> 'superadmin' (only when no 'superadmin' exists yet)
 * - 'superadmin' stays 'superadmin'
 * - 'admin' stays 'admin' once migration is complete (superadmin exists)
 */
export async function getEffectiveRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return 'client';
  if (value === 'editor') return 'admin';
  if (value === 'admin') {
    const hasSuper = await detectHasSuperadmin();
    return hasSuper ? 'admin' : 'superadmin';
  }
  if (value === 'superadmin') return 'superadmin';
  return value;
}

export async function isSuperadmin(role) {
  return (await getEffectiveRole(role)) === 'superadmin';
}

export async function isAdminOrHigher(role) {
  const eff = await getEffectiveRole(role);
  return eff === 'superadmin' || eff === 'admin';
}


