import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import fsPromises from 'fs/promises';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { isAdmin, isAdminOrEditor } from '../middleware/roles.js';
import {
  getMondaySettings,
  saveMondaySettings,
  listBoards,
  listGroups,
  listColumns,
  listPeople,
  findPersonById,
  buildRequestColumnValues,
  createRequestItem,
  listItemsByGroups,
  createItemUpdate,
  changeColumnValue,
  uploadFileToColumn
} from '../services/monday.js';
import {
  DEFAULT_AI_PROMPT,
  pullCallsFromCtm,
  buildCallsFromCache,
  postSaleToCTM,
  classifyContent,
  getCategoryFromRating,
  fetchPhoneInteractionSources,
  enrichCallerType,
  normalizePhoneNumber,
  getClientJourneys
} from '../services/ctm.js';
import { generateAiResponse } from '../services/ai.js';
import { generateImagenImage } from '../services/imagen.js';
import {
  sendMailgunMessage,
  sendMailgunMessageWithLogging,
  isMailgunConfigured,
  fetchEmailLogs,
  fetchEmailLogById,
  getEmailStats
} from '../services/mailgun.js';
import {
  createNotification,
  createNotificationsForAdmins,
  fetchUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyAdminsByEmail
} from '../services/notifications.js';
import {
  createOauthState,
  createCodeVerifier,
  createCodeChallenge,
  // Google
  getGoogleBusinessOAuthConfig,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  fetchGoogleBusinessAccounts,
  fetchGoogleBusinessLocations,
  refreshGoogleAccessToken,
  // Facebook/Instagram
  getFacebookOAuthConfig,
  buildFacebookAuthUrl,
  exchangeFacebookCodeForTokens,
  fetchFacebookProfile,
  fetchFacebookPages,
  fetchInstagramAccounts,
  refreshFacebookAccessToken,
  // TikTok
  getTikTokOAuthConfig,
  buildTikTokAuthUrl,
  exchangeTikTokCodeForTokens,
  fetchTikTokProfile,
  fetchTikTokAccountInfo,
  refreshTikTokAccessToken,
  // WordPress
  getWordPressOAuthConfig,
  buildWordPressAuthUrl,
  exchangeWordPressCodeForTokens,
  fetchWordPressProfile,
  fetchWordPressSites,
  refreshWordPressAccessToken,
  // Shared
  setOAuthCookies,
  getOAuthCookies,
  clearOAuthCookies,
  saveOAuthConnection,
  refreshAccessToken
} from '../services/oauthIntegration.js';

const router = express.Router();

function normalizeBase(value) {
  if (!value) return null;
  let base = String(value).trim();
  if (!/^https?:\/\//i.test(base)) {
    const isLocal = base.startsWith('localhost') || base.startsWith('127.0.0.1');
    base = `${isLocal ? 'http' : 'https'}://${base}`;
  }
  return base.replace(/\/$/, '');
}

function resolveBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const isLocalHost = host && (host.includes('localhost') || host.includes('127.0.0.1'));

  const localOverride = normalizeBase(process.env.LOCAL_APP_BASE_URL);
  if (isLocalHost && localOverride) return localOverride;

  if (isLocalHost && process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  const fromEnv = normalizeBase(
    process.env.APP_BASE_URL ||
      process.env.CLIENT_APP_URL ||
      process.env.APP_URL ||
      process.env.PUBLIC_URL ||
      process.env.VITE_APP_BASE_NAME
  );
  if (fromEnv) return fromEnv;

  if (host) return normalizeBase(`${proto}://${host}`);

  return 'http://localhost:3000';
}
const ONBOARDING_TOKEN_TTL_HOURS = parseInt(process.env.ONBOARDING_TOKEN_TTL_HOURS || '72', 10);
const JOURNEY_TEMPLATE_KEY_PREFIX = 'journey_template';
const JOURNEY_STATUS_OPTIONS = ['pending', 'in_progress', 'active_client', 'won', 'lost', 'archived'];
const CLIENT_PACKAGE_OPTIONS = ['Essentials', 'Growth', 'Accelerate', 'Custom'];

const DEFAULT_JOURNEY_TEMPLATE = [
  {
    id: 'week-0-first-touch',
    label: 'Initial Outreach (Same Day)',
    channel: 'call,text,email',
    offset_weeks: 0,
    message:
      'Introduce yourself, confirm what they’re looking for, and propose next steps. Aim to schedule a short discovery call or request the key details needed to qualify.',
    tone: 'friendly'
  },
  {
    id: 'week-1-qualify',
    label: 'Week 1 Follow-Up (Qualify + Confirm Fit)',
    channel: 'call,text,email',
    offset_weeks: 1,
    message:
      'Confirm timeline, budget (if relevant), decision makers, and primary goals. Share a quick summary of how you can help and the easiest next action to move forward.',
    tone: 'professional'
  },
  {
    id: 'week-2-value',
    label: 'Week 2 Follow-Up (Share Value + Proof)',
    channel: 'email,text,call',
    offset_weeks: 2,
    message:
      'Share a relevant example/case study, a short checklist, or a quick win recommendation. Ask a single clear question to keep momentum and propose a meeting time.',
    tone: 'helpful'
  },
  {
    id: 'week-4-proposal',
    label: 'Week 4 Follow-Up (Proposal / Next Steps)',
    channel: 'email,call',
    offset_weeks: 4,
    message:
      'Offer a straightforward plan: scope, timeline, and what you need from them to start. If they’re not ready, ask when to follow up and what’s blocking progress.',
    tone: 'direct'
  },
  {
    id: 'week-6-nurture',
    label: 'Week 6 Follow-Up (Nurture)',
    channel: 'email,text',
    offset_weeks: 6,
    message:
      'Send a light touch: a helpful resource, an update, or a reminder. Keep the message short and easy to reply to (yes/no or a single option).',
    tone: 'low_pressure'
  },
  {
    id: 'week-8-close-loop',
    label: 'Week 8 Close the Loop',
    channel: 'email,call',
    offset_weeks: 8,
    message:
      'Close the loop respectfully. Ask if they want to: (1) move forward, (2) pause until a specific date, or (3) close out for now. Make it easy for them to choose.',
    tone: 'open'
  }
];

function sanitizeSymptomList(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sanitizeJourneySteps(rawSteps = []) {
  if (!Array.isArray(rawSteps)) return [];
  return rawSteps
    .map((step, index) => {
      const label = String(step?.label || '').trim();
      if (!label) return null;
      const offsetWeeksRaw = Number(step?.offset_weeks);
      const offsetWeeks = Number.isFinite(offsetWeeksRaw) ? offsetWeeksRaw : 0;
      const channel = String(step?.channel || '').trim();
      const message = String(step?.message || '').trim();
      return {
        id: step?.id || `journey-step-${index + 1}`,
        label,
        channel,
        message,
        offset_weeks: offsetWeeks,
        tone: step?.tone ? String(step.tone) : undefined
      };
    })
    .filter(Boolean);
}

async function getJourneyTemplate(ownerId) {
  const key = `${JOURNEY_TEMPLATE_KEY_PREFIX}:${ownerId}`;
  const { rows } = await query('SELECT value FROM app_settings WHERE key=$1', [key]);
  const raw = rows[0]?.value;
  if (Array.isArray(raw)) {
    return sanitizeJourneySteps(raw);
  }
  if (raw && Array.isArray(raw.steps)) {
    return sanitizeJourneySteps(raw.steps);
  }
  return DEFAULT_JOURNEY_TEMPLATE;
}

async function saveJourneyTemplate(ownerId, steps) {
  const key = `${JOURNEY_TEMPLATE_KEY_PREFIX}:${ownerId}`;
  const nextSteps = sanitizeJourneySteps(steps);
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, { steps: nextSteps }]
  );
  return nextSteps;
}

async function seedJourneySteps(journeyId, ownerId) {
  await ensureJourneyTables();
  const templateSteps = await getJourneyTemplate(ownerId);
  if (!templateSteps.length) return;
  const now = Date.now();
  await Promise.all(
    templateSteps.map((step, index) => {
      const offsetWeeks = Number.isFinite(step.offset_weeks) ? step.offset_weeks : 0;
      const dueAt = offsetWeeks ? new Date(now + offsetWeeks * 7 * 24 * 60 * 60 * 1000) : null;
      return query(
        `INSERT INTO client_journey_steps (journey_id, position, label, channel, message, offset_weeks, due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [journeyId, index, step.label, step.channel || null, step.message || null, offsetWeeks, dueAt]
      );
    })
  );
}

async function fetchJourneysForOwner(ownerId, filters = {}) {
  await ensureJourneyTables();
  const params = [ownerId];
  const conditions = ['cj.owner_user_id = $1'];
  const showArchivedOnly = filters.archived === true;
  const includeArchived = filters.includeArchived === true;
  if (filters.id) {
    params.push(filters.id);
    conditions.push(`cj.id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`cj.status = $${params.length}`);
  }
  if (filters.active_client_id) {
    params.push(filters.active_client_id);
    conditions.push(`cj.active_client_id = $${params.length}`);
  }
  if (showArchivedOnly) {
    conditions.push('cj.archived_at IS NOT NULL');
  } else if (!includeArchived) {
    conditions.push('cj.archived_at IS NULL');
  }
  const sql = `SELECT cj.*, 
                      s.name as service_name, 
                      s.description as service_description,
                      pj.client_name as parent_journey_name
               FROM client_journeys cj
               LEFT JOIN services s ON cj.service_id = s.id
               LEFT JOIN client_journeys pj ON cj.parent_journey_id = pj.id
               ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
               ORDER BY cj.created_at DESC`;
  const { rows } = await query(sql, params);
  if (!rows.length) {
    return filters.id ? null : [];
  }
  const journeyIds = rows.map((row) => row.id);
  const stepsRes = await query(
    `SELECT id, journey_id, position, label, channel, message, offset_weeks, due_at, completed_at, notes, created_at
     FROM client_journey_steps
     WHERE journey_id = ANY($1::uuid[])
     ORDER BY position ASC, created_at ASC`,
    [journeyIds]
  );
  const notesRes = await query(
    `SELECT cjn.id,
            cjn.journey_id,
            cjn.author_id,
            cjn.body,
            cjn.created_at,
            u.first_name,
            u.last_name,
            u.email
     FROM client_journey_notes cjn
     LEFT JOIN users u ON u.id = cjn.author_id
     WHERE cjn.journey_id = ANY($1::uuid[])
     ORDER BY cjn.created_at DESC`,
    [journeyIds]
  );
  const stepMap = new Map();
  stepsRes.rows.forEach((step) => {
    if (!stepMap.has(step.journey_id)) stepMap.set(step.journey_id, []);
    stepMap.get(step.journey_id).push({
      id: step.id,
      position: step.position,
      label: step.label,
      channel: step.channel,
      message: step.message,
      offset_weeks: step.offset_weeks,
      due_at: step.due_at,
      completed_at: step.completed_at,
      notes: step.notes
    });
  });
  const noteMap = new Map();
  notesRes.rows.forEach((note) => {
    if (!noteMap.has(note.journey_id)) noteMap.set(note.journey_id, []);
    const authorName = [note.first_name, note.last_name].filter(Boolean).join(' ').trim() || note.email || 'Unknown';
    noteMap.get(note.journey_id).push({
      id: note.id,
      author_id: note.author_id,
      author_name: authorName,
      body: note.body,
      created_at: note.created_at
    });
  });
  const shaped = rows.map((row) => ({
    ...row,
    symptoms: Array.isArray(row.symptoms) ? row.symptoms : [],
    steps: stepMap.get(row.id) || [],
    notes: noteMap.get(row.id) || [],
    service: row.service_id
      ? {
          id: row.service_id,
          name: row.service_name,
          description: row.service_description
        }
      : null,
    parent_journey: row.parent_journey_id
      ? {
          id: row.parent_journey_id,
          client_name: row.parent_journey_name
        }
      : null
  }));
  return filters.id ? shaped[0] || null : shaped;
}

async function fetchJourneyForOwner(ownerId, journeyId) {
  return fetchJourneysForOwner(ownerId, { id: journeyId, includeArchived: true });
}

async function attachJourneyMetaToCalls(ownerId, calls = []) {
  await ensureJourneyTables();
  if (!calls?.length) return calls;
  const { rows } = await query(
    `SELECT id, lead_call_key, symptoms, status, paused, next_action_at
     FROM client_journeys
     WHERE owner_user_id = $1
       AND lead_call_key IS NOT NULL
       AND archived_at IS NULL`,
    [ownerId]
  );
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.lead_call_key, {
      id: row.id,
      status: row.status,
      paused: row.paused,
      next_action_at: row.next_action_at,
      symptoms: Array.isArray(row.symptoms) ? row.symptoms : []
    });
  });
  return calls.map((call) => {
    const journey = map.get(call.id);
    if (!journey) return call;
    return { ...call, journey };
  });
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveLeadCallLink(ownerId, callIdentifier) {
  const key = typeof callIdentifier === 'string' ? callIdentifier.trim() : '';
  if (!key) {
    return { leadCallKey: null, leadCallUuid: null };
  }
  const { rows } = await query('SELECT id FROM call_logs WHERE user_id = $1 AND call_id = $2 LIMIT 1', [ownerId, key]);
  return {
    leadCallKey: key,
    leadCallUuid: rows[0]?.id || null
  };
}

let hasEnsuredJourneyTables = false;
async function ensureJourneyTables() {
  if (hasEnsuredJourneyTables) return;
  const { rows } = await query(`SELECT to_regclass('public.client_journeys') AS table_name`);
  if (!rows[0]?.table_name) {
    await query(`
      CREATE TABLE IF NOT EXISTS client_journeys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lead_call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
        lead_call_key TEXT REFERENCES call_logs(call_id) ON DELETE SET NULL,
        active_client_id UUID REFERENCES active_clients(id) ON DELETE SET NULL,
        client_name TEXT,
        client_phone TEXT,
        client_email TEXT,
        symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
        symptoms_redacted BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'pending',
        paused BOOLEAN NOT NULL DEFAULT FALSE,
        next_action_at TIMESTAMPTZ,
        notes_summary TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        archived_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_client_journeys_owner ON client_journeys(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_client_journeys_status ON client_journeys(status);
      CREATE INDEX IF NOT EXISTS idx_client_journeys_lead_call_key ON client_journeys(lead_call_key);
      CREATE TABLE IF NOT EXISTS client_journey_steps (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        journey_id UUID NOT NULL REFERENCES client_journeys(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        label TEXT NOT NULL,
        channel TEXT,
        message TEXT,
        offset_weeks INTEGER DEFAULT 0,
        due_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_client_journey_steps_journey ON client_journey_steps(journey_id);
      CREATE TABLE IF NOT EXISTS client_journey_notes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        journey_id UUID NOT NULL REFERENCES client_journeys(id) ON DELETE CASCADE,
        author_id UUID REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_client_journey_notes_journey ON client_journey_notes(journey_id);
    `);
  } else {
    await query(`
      ALTER TABLE client_journeys
        ADD COLUMN IF NOT EXISTS lead_call_key TEXT,
        ADD COLUMN IF NOT EXISTS symptoms_redacted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_client_journeys_lead_call_key ON client_journeys(lead_call_key);
      UPDATE client_journeys cj
      SET lead_call_key = cl.call_id
      FROM call_logs cl
      WHERE cj.lead_call_key IS NULL AND cj.lead_call_id = cl.id;
    `);
  }
  hasEnsuredJourneyTables = true;
}

let hasEnsuredActiveClientArchive = false;
async function ensureActiveClientArchiveColumn() {
  if (hasEnsuredActiveClientArchive) return;
  await query(`ALTER TABLE active_clients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  hasEnsuredActiveClientArchive = true;
}

function logEvent(scope, message, payload = {}) {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] [${scope}] ${message}${Object.keys(payload).length ? ` :: ${JSON.stringify(payload)}` : ''}`);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
const brandDir = path.join(uploadRoot, 'brand');
const docsDir = path.join(uploadRoot, 'docs');
const avatarDir = path.join(uploadRoot, 'avatars');

[uploadRoot, brandDir, docsDir, avatarDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = (dest) =>
  multer.diskStorage({
    destination: dest,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  });

const uploadBrand = multer({ storage: storage(brandDir) });
const uploadDocs = multer({ storage: storage(docsDir) });
const uploadAvatar = multer({ storage: storage(avatarDir) });
const uploadRequestAttachment = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function publicUrl(filePath) {
  const rel = path.relative(uploadRoot, filePath);
  return `/uploads/${rel}`.replace(/\\/g, '/');
}

// Avatar GET endpoint is PUBLIC (before requireAuth) so avatars load during onboarding
// and in any context where the image needs to be displayed. Avatars are not sensitive data.
router.get('/users/:id/avatar', async (req, res) => {
  try {
    const targetUserId = String(req.params.id || '').trim();
    if (!targetUserId) return res.status(400).send('Missing user id');

    const { rows } = await query('SELECT content_type, bytes FROM user_avatars WHERE user_id = $1 LIMIT 1', [targetUserId]);
    if (!rows.length) return res.status(404).send('Not found');

    const row = rows[0];
    res.setHeader('Content-Type', row.content_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Public cache since avatars are public
    res.send(row.bytes);
  } catch (err) {
    console.error('[hub:avatar:get]', err);
    res.status(500).send('Failed to load avatar');
  }
});

// ============================================================================
// OAuth Callbacks (Public - No Auth Required)
// These routes receive redirects from OAuth providers after user authorization
// They must be defined BEFORE router.use(requireAuth)
// ============================================================================

/**
 * GET /hub/oauth/google/callback
 * Handle Google OAuth callback from Google after user authorization
 */
router.get('/oauth/google/callback', async (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const adminHubUrl = `${baseUrl}/client-hub`;
  
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.log(`[oauth:google:callback] OAuth error: ${error}`);
      clearOAuthCookies(res, 'google');
      return res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      console.log('[oauth:google:callback] Missing code or state');
      clearOAuthCookies(res, 'google');
      return res.redirect(`${adminHubUrl}?oauth=error&message=missing_code`);
    }

    const cookies = getOAuthCookies(req, 'google');
    
    if (!cookies.state || cookies.state !== state) {
      console.log('[oauth:google:callback] State mismatch');
      clearOAuthCookies(res, 'google');
      return res.redirect(`${adminHubUrl}?oauth=error&message=state_mismatch`);
    }

    if (!cookies.verifier || !cookies.clientId) {
      console.log('[oauth:google:callback] Missing verifier or clientId in cookies');
      clearOAuthCookies(res, 'google');
      return res.redirect(`${adminHubUrl}?oauth=error&message=session_expired`);
    }

    const clientId = cookies.clientId;
    clearOAuthCookies(res, 'google');

    const redirectUri = `${baseUrl}/api/hub/oauth/google/callback`;
    const config = getGoogleBusinessOAuthConfig(redirectUri);
    
    console.log('[oauth:google:callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(config, code, cookies.verifier);
    
    console.log('[oauth:google:callback] Fetching Google profile...');
    const profile = await fetchGoogleProfile(tokens.access_token);
    
    console.log(`[oauth:google:callback] Profile: ${profile.email}`);
    
    const connection = await saveOAuthConnection(clientId, 'google', tokens, profile);
    console.log(`[oauth:google:callback] Saved connection ${connection.id} for client ${clientId}`);

    res.redirect(`${adminHubUrl}?oauth=success&provider=google&clientId=${clientId}`);
  } catch (err) {
    console.error('[oauth:google:callback]', err);
    clearOAuthCookies(res, 'google');
    res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /hub/oauth/facebook/callback
 * Handle Facebook OAuth callback
 */
router.get('/oauth/facebook/callback', async (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const adminHubUrl = `${baseUrl}/client-hub`;
  
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.log(`[oauth:facebook:callback] OAuth error: ${error} - ${error_description}`);
      clearOAuthCookies(res, 'facebook');
      return res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(error_description || error)}`);
    }

    if (!code || !state) {
      console.log('[oauth:facebook:callback] Missing code or state');
      clearOAuthCookies(res, 'facebook');
      return res.redirect(`${adminHubUrl}?oauth=error&message=missing_code`);
    }

    const cookies = getOAuthCookies(req, 'facebook');
    
    if (!cookies.state || cookies.state !== state) {
      console.log('[oauth:facebook:callback] State mismatch');
      clearOAuthCookies(res, 'facebook');
      return res.redirect(`${adminHubUrl}?oauth=error&message=state_mismatch`);
    }

    if (!cookies.clientId) {
      console.log('[oauth:facebook:callback] Missing clientId in cookies');
      clearOAuthCookies(res, 'facebook');
      return res.redirect(`${adminHubUrl}?oauth=error&message=session_expired`);
    }

    const clientId = cookies.clientId;
    clearOAuthCookies(res, 'facebook');

    const redirectUri = `${baseUrl}/api/hub/oauth/facebook/callback`;
    const config = getFacebookOAuthConfig(redirectUri);
    
    console.log('[oauth:facebook:callback] Exchanging code for tokens...');
    const tokens = await exchangeFacebookCodeForTokens(config, code);
    
    console.log('[oauth:facebook:callback] Fetching Facebook profile...');
    const profile = await fetchFacebookProfile(tokens.access_token);
    
    console.log(`[oauth:facebook:callback] Profile: ${profile.name} (${profile.id})`);
    
    const connection = await saveOAuthConnection(clientId, 'facebook', tokens, profile);
    console.log(`[oauth:facebook:callback] Saved connection ${connection.id} for client ${clientId}`);

    res.redirect(`${adminHubUrl}?oauth=success&provider=facebook&clientId=${clientId}`);
  } catch (err) {
    console.error('[oauth:facebook:callback]', err);
    clearOAuthCookies(res, 'facebook');
    res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /hub/oauth/tiktok/callback
 * Handle TikTok OAuth callback
 */
router.get('/oauth/tiktok/callback', async (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const adminHubUrl = `${baseUrl}/client-hub`;
  
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.log(`[oauth:tiktok:callback] OAuth error: ${error} - ${error_description}`);
      clearOAuthCookies(res, 'tiktok');
      return res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(error_description || error)}`);
    }

    if (!code || !state) {
      console.log('[oauth:tiktok:callback] Missing code or state');
      clearOAuthCookies(res, 'tiktok');
      return res.redirect(`${adminHubUrl}?oauth=error&message=missing_code`);
    }

    const cookies = getOAuthCookies(req, 'tiktok');
    
    if (!cookies.state || cookies.state !== state) {
      console.log('[oauth:tiktok:callback] State mismatch');
      clearOAuthCookies(res, 'tiktok');
      return res.redirect(`${adminHubUrl}?oauth=error&message=state_mismatch`);
    }

    if (!cookies.verifier || !cookies.clientId) {
      console.log('[oauth:tiktok:callback] Missing verifier or clientId in cookies');
      clearOAuthCookies(res, 'tiktok');
      return res.redirect(`${adminHubUrl}?oauth=error&message=session_expired`);
    }

    const clientId = cookies.clientId;
    clearOAuthCookies(res, 'tiktok');

    const redirectUri = `${baseUrl}/api/hub/oauth/tiktok/callback`;
    const config = getTikTokOAuthConfig(redirectUri);
    
    console.log('[oauth:tiktok:callback] Exchanging code for tokens...');
    const tokens = await exchangeTikTokCodeForTokens(config, code, cookies.verifier);
    
    console.log('[oauth:tiktok:callback] Fetching TikTok profile...');
    const profile = await fetchTikTokProfile(tokens.access_token);
    
    console.log(`[oauth:tiktok:callback] Profile: ${profile.name} (${profile.id})`);
    
    const connection = await saveOAuthConnection(clientId, 'tiktok', tokens, profile);
    console.log(`[oauth:tiktok:callback] Saved connection ${connection.id} for client ${clientId}`);

    res.redirect(`${adminHubUrl}?oauth=success&provider=tiktok&clientId=${clientId}`);
  } catch (err) {
    console.error('[oauth:tiktok:callback]', err);
    clearOAuthCookies(res, 'tiktok');
    res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /hub/oauth/wordpress/callback
 * Handle WordPress OAuth callback
 */
router.get('/oauth/wordpress/callback', async (req, res) => {
  const baseUrl = resolveBaseUrl(req);
  const adminHubUrl = `${baseUrl}/client-hub`;
  
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.log(`[oauth:wordpress:callback] OAuth error: ${error} - ${error_description}`);
      clearOAuthCookies(res, 'wordpress');
      return res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(error_description || error)}`);
    }

    if (!code || !state) {
      console.log('[oauth:wordpress:callback] Missing code or state');
      clearOAuthCookies(res, 'wordpress');
      return res.redirect(`${adminHubUrl}?oauth=error&message=missing_code`);
    }

    const cookies = getOAuthCookies(req, 'wordpress');
    
    if (!cookies.state || cookies.state !== state) {
      console.log('[oauth:wordpress:callback] State mismatch');
      clearOAuthCookies(res, 'wordpress');
      return res.redirect(`${adminHubUrl}?oauth=error&message=state_mismatch`);
    }

    if (!cookies.clientId) {
      console.log('[oauth:wordpress:callback] Missing clientId in cookies');
      clearOAuthCookies(res, 'wordpress');
      return res.redirect(`${adminHubUrl}?oauth=error&message=session_expired`);
    }

    const clientId = cookies.clientId;
    clearOAuthCookies(res, 'wordpress');

    const redirectUri = `${baseUrl}/api/hub/oauth/wordpress/callback`;
    const config = getWordPressOAuthConfig(redirectUri);
    
    console.log('[oauth:wordpress:callback] Exchanging code for tokens...');
    const tokens = await exchangeWordPressCodeForTokens(config, code);
    
    console.log('[oauth:wordpress:callback] Fetching WordPress profile...');
    const profile = await fetchWordPressProfile(tokens.access_token, tokens);
    
    console.log(`[oauth:wordpress:callback] Profile: ${profile.name} (${profile.id})`);
    
    const connection = await saveOAuthConnection(clientId, 'wordpress', tokens, profile);
    console.log(`[oauth:wordpress:callback] Saved connection ${connection.id} for client ${clientId}`);

    res.redirect(`${adminHubUrl}?oauth=success&provider=wordpress&clientId=${clientId}`);
  } catch (err) {
    console.error('[oauth:wordpress:callback]', err);
    clearOAuthCookies(res, 'wordpress');
    res.redirect(`${adminHubUrl}?oauth=error&message=${encodeURIComponent(err.message)}`);
  }
});

// All routes below require authentication
router.use(requireAuth);

async function upsertUserAvatarFromUpload({ userId, file }) {
  if (!userId) throw new Error('Missing userId');
  if (!file?.path) throw new Error('Missing uploaded file path');
  const bytes = await fsPromises.readFile(file.path);
  const contentType = String(file.mimetype || 'image/jpeg');
  await query(
    `INSERT INTO user_avatars (user_id, content_type, bytes, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, bytes = EXCLUDED.bytes, updated_at = NOW()`,
    [userId, contentType, bytes]
  );
  // Best effort cleanup of ephemeral disk file.
  await fsPromises.unlink(file.path).catch(() => {});
  // Store a stable URL; include cache-busting version.
  const url = `/api/hub/users/${userId}/avatar?v=${Date.now()}`;
  await query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [url, userId]);
  return url;
}

async function resolveAccountManagerContact(userId, options = {}) {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.display_name,
            cp.account_manager_person_id
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  const client = rows[0];
  if (!client) return null;
  const clientName =
    client.display_name || [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || client.email || 'Client';

  let managerEmail = null;
  let managerName = null;
  let notificationUserId = null;

  if (client.account_manager_person_id) {
    try {
      const settings = options.settings || (await getMondaySettings());
      const person = await findPersonById(client.account_manager_person_id, settings);
      if (person) {
        managerEmail = person.email || null;
        managerName = person.name || null;
        if (managerEmail) {
          const { rows: accountManagers } = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [managerEmail]);
          if (accountManagers.length) {
            notificationUserId = accountManagers[0].id;
          }
        }
      }
    } catch (err) {
      console.error('[account-manager:lookup]', err.message || err);
    }
  }

  if (!managerEmail || !notificationUserId) {
    const { rows: adminRows } = await query(
      "SELECT id, email, first_name, last_name FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
    );
    if (adminRows.length) {
      if (!managerEmail) managerEmail = adminRows[0].email;
      if (!notificationUserId) notificationUserId = adminRows[0].id;
      if (!managerName) {
        managerName = [adminRows[0].first_name, adminRows[0].last_name].filter(Boolean).join(' ').trim() || 'Admin Team';
      }
    }
  }

  if (!managerEmail && !notificationUserId) return { client, clientName };

  return { client, clientName, managerEmail, managerName, notificationUserId };
}

async function notifyAccountManagerOfBlogPost(userId, blogPost, baseUrl) {
  if (!userId || !blogPost) return;
  const contact = await resolveAccountManagerContact(userId);
  if (!contact) return;
  const { clientName, managerEmail, managerName, notificationUserId, client } = contact;
  if (!managerEmail && !notificationUserId) return;

  const blogTitle = blogPost.title || 'Untitled Blog Post';
  const statusLabel = blogPost.status || 'draft';
  const emailText = `Hi ${managerName || 'there'},

${clientName} just created a new blog post titled "${blogTitle}" (status: ${statusLabel}).

You can review it inside the Anchor admin hub.

- Anchor Dashboard`;
  const resolvedBaseUrl = baseUrl || 'http://localhost:3000';
  const emailHtml = `<p>Hi ${managerName || 'there'},</p>
<p><strong>${clientName}</strong> just created a new blog post titled <strong>${blogTitle}</strong> (status: ${statusLabel}).</p>
<p><a href="${resolvedBaseUrl}/admin" target="_blank" rel="noopener">Open the admin hub</a> to review it.</p>
<p>- Anchor Dashboard</p>`;

  if (notificationUserId) {
    await createNotification({
      userId: notificationUserId,
      title: 'New client blog post',
      body: `${clientName} created "${blogTitle}" (${statusLabel}).`,
      linkUrl: '/admin',
      meta: { blog_post_id: blogPost.id, client_id: client.id, status: statusLabel }
    });
  }

  if (managerEmail && isMailgunConfigured()) {
    await sendMailgunMessageWithLogging(
      {
        to: managerEmail,
        subject: `${clientName} just created a new blog post`,
        text: emailText,
        html: emailHtml
      },
      {
        emailType: 'blog_notification',
        clientId: client.id,
        metadata: { blog_post_id: blogPost.id, status: statusLabel }
      }
    );
  }
}

function serializeHubProfileUser(row, { includeClientProfile }) {
  if (!row) return null;

  const user = {
    id: row.id,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email ?? null,
    role: row.role ?? null,
    avatar_url: row.avatar_url ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };

  // Only expose client/onboarding-specific fields for client accounts.
  if (includeClientProfile) {
    user.monthly_revenue_goal = row.monthly_revenue_goal ?? null;
    user.client_type = row.client_type ?? null;
    user.client_subtype = row.client_subtype ?? null;
    user.client_package = row.client_package ?? null;

    user.website_access_provided = row.website_access_provided ?? false;
    user.website_access_understood = row.website_access_understood ?? false;
    user.ga4_access_provided = row.ga4_access_provided ?? false;
    user.ga4_access_understood = row.ga4_access_understood ?? false;
    user.google_ads_access_provided = row.google_ads_access_provided ?? false;
    user.google_ads_access_understood = row.google_ads_access_understood ?? false;
    user.meta_access_provided = row.meta_access_provided ?? false;
    user.meta_access_understood = row.meta_access_understood ?? false;
    user.website_forms_details_provided = row.website_forms_details_provided ?? false;
    user.website_forms_details_understood = row.website_forms_details_understood ?? false;
    user.website_forms_uses_third_party = row.website_forms_uses_third_party ?? false;
    user.website_forms_uses_hipaa = row.website_forms_uses_hipaa ?? false;
    user.website_forms_connected_crm = row.website_forms_connected_crm ?? false;
    user.website_forms_custom = row.website_forms_custom ?? false;
    user.website_forms_notes = row.website_forms_notes ?? '';
  }

  return user;
}

router.get('/profile', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { rows } = await query(
    `SELECT u.*, cp.monthly_revenue_goal, cp.client_type, cp.client_subtype, cp.client_package,
            cp.website_access_provided, cp.website_access_understood,
            cp.ga4_access_provided, cp.ga4_access_understood,
            cp.google_ads_access_provided, cp.google_ads_access_understood,
            cp.meta_access_provided, cp.meta_access_understood,
            cp.website_forms_details_provided, cp.website_forms_details_understood,
            cp.website_forms_uses_third_party, cp.website_forms_uses_hipaa, cp.website_forms_connected_crm, cp.website_forms_custom,
            cp.website_forms_notes
     FROM users u 
     LEFT JOIN client_profiles cp ON cp.user_id = u.id 
     WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0] || null;
  const fallback = req.user || null;
  const portalRole = row?.role || (fallback && (req.portalUserId === req.user.id ? req.user.role : null)) || null;
  const includeClientProfile = portalRole === 'client';

  res.json({ user: serializeHubProfileUser(row || fallback, { includeClientProfile }) });
});

router.put('/profile', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const isSelfUpdate = req.user.id === userId;
  const canOverridePassword = !isSelfUpdate && req.user.role === 'admin';
  const {
    first_name,
    last_name,
    email,
    password,
    new_password,
    monthly_revenue_goal,
    website_access_provided,
    website_access_understood,
    ga4_access_provided,
    ga4_access_understood,
    google_ads_access_provided,
    google_ads_access_understood,
    meta_access_provided,
    meta_access_understood,
    website_forms_details_provided,
    website_forms_details_understood,
    website_forms_uses_third_party,
    website_forms_uses_hipaa,
    website_forms_connected_crm,
    website_forms_custom,
    website_forms_notes
  } = req.body || {};
  const updates = [];
  const params = [];
  if (first_name) {
    updates.push('first_name = $' + (params.length + 1));
    params.push(first_name);
  }
  if (last_name) {
    updates.push('last_name = $' + (params.length + 1));
    params.push(last_name);
  }
  if (email) {
    updates.push('email = $' + (params.length + 1));
    params.push(email);
  }
  const hasClientProfileUpdate =
    monthly_revenue_goal !== undefined ||
    website_access_provided !== undefined ||
    website_access_understood !== undefined ||
    ga4_access_provided !== undefined ||
    ga4_access_understood !== undefined ||
    google_ads_access_provided !== undefined ||
    google_ads_access_understood !== undefined ||
    meta_access_provided !== undefined ||
    meta_access_understood !== undefined ||
    website_forms_details_provided !== undefined ||
    website_forms_details_understood !== undefined ||
    website_forms_uses_third_party !== undefined ||
    website_forms_uses_hipaa !== undefined ||
    website_forms_connected_crm !== undefined ||
    website_forms_custom !== undefined ||
    website_forms_notes !== undefined;

  // Never allow staff accounts (superadmin/admin/team) to view/update client-only profile fields on themselves.
  // Client profile fields are only valid for actual client accounts (or when acting as a client).
  const isPortalClient = Boolean(req.actingClient) || req.user.role === 'client';
  if (hasClientProfileUpdate && !isPortalClient) {
    return res.status(403).json({ message: 'Client profile fields can only be updated for client accounts.' });
  }

  if (!updates.length && !new_password && !hasClientProfileUpdate) {
    return res.status(400).json({ message: 'No changes provided' });
  }
  try {
    if (new_password) {
      if (!canOverridePassword) {
        if (!password) return res.status(400).json({ message: 'Current password required' });
        const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        const hash = rows[0]?.password_hash;
        const valid = hash && (await bcrypt.compare(password, hash));
        if (!valid) return res.status(400).json({ message: 'Current password incorrect' });
      }
      updates.push('password_hash = $' + (params.length + 1));
      params.push(await bcrypt.hash(new_password, 12));
    }
    if (updates.length) {
      params.push(userId);
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }

    // Update client_profiles fields (monthly goal + onboarding access confirmations)
    if (hasClientProfileUpdate) {
      await query(
        `INSERT INTO client_profiles (
           user_id,
           monthly_revenue_goal,
           website_access_provided,
           website_access_understood,
           ga4_access_provided,
           ga4_access_understood,
           google_ads_access_provided,
           google_ads_access_understood,
           meta_access_provided,
           meta_access_understood,
           website_forms_details_provided,
           website_forms_details_understood,
           website_forms_uses_third_party,
           website_forms_uses_hipaa,
           website_forms_connected_crm,
           website_forms_custom,
           website_forms_notes
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (user_id) DO UPDATE SET
           monthly_revenue_goal = COALESCE(EXCLUDED.monthly_revenue_goal, client_profiles.monthly_revenue_goal),
           website_access_provided = COALESCE(EXCLUDED.website_access_provided, client_profiles.website_access_provided),
           website_access_understood = COALESCE(EXCLUDED.website_access_understood, client_profiles.website_access_understood),
           ga4_access_provided = COALESCE(EXCLUDED.ga4_access_provided, client_profiles.ga4_access_provided),
           ga4_access_understood = COALESCE(EXCLUDED.ga4_access_understood, client_profiles.ga4_access_understood),
           google_ads_access_provided = COALESCE(EXCLUDED.google_ads_access_provided, client_profiles.google_ads_access_provided),
           google_ads_access_understood = COALESCE(EXCLUDED.google_ads_access_understood, client_profiles.google_ads_access_understood),
           meta_access_provided = COALESCE(EXCLUDED.meta_access_provided, client_profiles.meta_access_provided),
           meta_access_understood = COALESCE(EXCLUDED.meta_access_understood, client_profiles.meta_access_understood),
           website_forms_details_provided = COALESCE(EXCLUDED.website_forms_details_provided, client_profiles.website_forms_details_provided),
           website_forms_details_understood = COALESCE(EXCLUDED.website_forms_details_understood, client_profiles.website_forms_details_understood),
           website_forms_uses_third_party = COALESCE(EXCLUDED.website_forms_uses_third_party, client_profiles.website_forms_uses_third_party),
           website_forms_uses_hipaa = COALESCE(EXCLUDED.website_forms_uses_hipaa, client_profiles.website_forms_uses_hipaa),
           website_forms_connected_crm = COALESCE(EXCLUDED.website_forms_connected_crm, client_profiles.website_forms_connected_crm),
           website_forms_custom = COALESCE(EXCLUDED.website_forms_custom, client_profiles.website_forms_custom),
           website_forms_notes = COALESCE(EXCLUDED.website_forms_notes, client_profiles.website_forms_notes),
           updated_at = NOW()`,
        [
          userId,
          monthly_revenue_goal === undefined ? null : monthly_revenue_goal || null,
          website_access_provided === undefined ? null : Boolean(website_access_provided),
          website_access_understood === undefined ? null : Boolean(website_access_understood),
          ga4_access_provided === undefined ? null : Boolean(ga4_access_provided),
          ga4_access_understood === undefined ? null : Boolean(ga4_access_understood),
          google_ads_access_provided === undefined ? null : Boolean(google_ads_access_provided),
          google_ads_access_understood === undefined ? null : Boolean(google_ads_access_understood),
          meta_access_provided === undefined ? null : Boolean(meta_access_provided),
          meta_access_understood === undefined ? null : Boolean(meta_access_understood),
          website_forms_details_provided === undefined ? null : Boolean(website_forms_details_provided),
          website_forms_details_understood === undefined ? null : Boolean(website_forms_details_understood),
          website_forms_uses_third_party === undefined ? null : Boolean(website_forms_uses_third_party),
          website_forms_uses_hipaa === undefined ? null : Boolean(website_forms_uses_hipaa),
          website_forms_connected_crm === undefined ? null : Boolean(website_forms_connected_crm),
          website_forms_custom === undefined ? null : Boolean(website_forms_custom),
          website_forms_notes === undefined ? null : String(website_forms_notes || '')
        ]
      );
    }

    const refreshed = await query(
      `SELECT u.*, cp.monthly_revenue_goal, cp.client_type, cp.client_subtype, cp.client_package,
              cp.website_access_provided, cp.website_access_understood,
              cp.ga4_access_provided, cp.ga4_access_understood,
              cp.google_ads_access_provided, cp.google_ads_access_understood,
              cp.meta_access_provided, cp.meta_access_understood,
              cp.website_forms_details_provided, cp.website_forms_details_understood,
              cp.website_forms_uses_third_party, cp.website_forms_uses_hipaa, cp.website_forms_connected_crm, cp.website_forms_custom,
              cp.website_forms_notes
       FROM users u 
       LEFT JOIN client_profiles cp ON cp.user_id = u.id 
       WHERE u.id = $1`,
      [userId]
    );
    const row = refreshed.rows[0] || null;
    const includeClientProfile = (row?.role || (isPortalClient ? 'client' : null)) === 'client';
    res.json({ user: serializeHubProfileUser(row, { includeClientProfile }) });
  } catch (err) {
    console.error('[profile:update]', err.message || err, err.stack);
    res.status(500).json({ message: err.message || 'Unable to update profile' });
  }
});

router.post('/profile/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const targetUserId = req.portalUserId || req.user.id;
  try {
    const url = await upsertUserAvatarFromUpload({ userId: targetUserId, file: req.file });
    res.json({ avatar_url: url });
  } catch (err) {
    console.error('[hub:profile:avatar]', err);
    res.status(500).json({ message: 'Unable to upload avatar' });
  }
});

router.get('/brand', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [targetUserId]);
  const brand = rows[0] || {
    business_name: '',
    business_description: '',
    logos: [],
    style_guides: [],
    brand_notes: '',
    website_url: ''
  };
  res.json({ brand });
});

router.get('/brand/admin/:userId', isAdminOrEditor, async (req, res) => {
  const target = req.params.userId;
  const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [target]);
  const brand = rows[0] || {
    logos: [],
    style_guides: [],
    brand_notes: '',
    website_url: ''
  };
  res.json({ brand });
});

router.put('/brand/admin/:userId', uploadBrand.none(), isAdminOrEditor, async (req, res) => {
  const target = req.params.userId;
  try {
    const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [target]);
    const existing = rows[0] || {
      logos: [],
      style_guides: []
    };

    const payload = {
      logos: existing.logos || [],
      style_guides: existing.style_guides || [],
      brand_notes: req.body.brand_notes || existing.brand_notes || '',
      website_url: req.body.website_url || existing.website_url || ''
    };

    if (rows[0]) {
      await query(
        `UPDATE brand_assets
         SET logos=$1, style_guides=$2, brand_notes=$3, website_url=$4, updated_at=NOW()
         WHERE user_id=$5`,
        [JSON.stringify(payload.logos), JSON.stringify(payload.style_guides), payload.brand_notes, payload.website_url, target]
      );
    } else {
      await query(
        `INSERT INTO brand_assets (user_id, logos, style_guides, brand_notes, website_url)
         VALUES ($1,$2,$3,$4,$5)`,
        [target, JSON.stringify(payload.logos), JSON.stringify(payload.style_guides), payload.brand_notes, payload.website_url]
      );
    }

    res.json({ brand: payload });
  } catch (err) {
    console.error('[brand admin]', err);
    res.status(500).json({ message: 'Unable to save brand profile' });
  }
});
router.put(
  '/brand',
  uploadBrand.fields([
    { name: 'logos', maxCount: 10 },
    { name: 'style_guide', maxCount: 10 }
  ]),
  async (req, res) => {
    try {
      const targetUserId = req.portalUserId || req.user.id;
      const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [targetUserId]);
      const existing = rows[0] || {
        logos: [],
        style_guides: []
      };
      const logos = Array.isArray(existing.logos) ? [...existing.logos] : [];
      const styleGuides = Array.isArray(existing.style_guides) ? [...existing.style_guides] : [];

      (req.files?.logos || []).forEach((file) => {
        logos.push({
          id: uuidv4(),
          name: file.originalname,
          url: publicUrl(file.path)
        });
      });
      (req.files?.style_guide || []).forEach((file) => {
        styleGuides.push({
          id: uuidv4(),
          name: file.originalname,
          url: publicUrl(file.path)
        });
      });

      const deletions = req.body.deletions ? JSON.parse(req.body.deletions) : [];
      deletions.forEach((id) => {
        const remove = (arr) => arr.filter((f) => f.id !== id);
        const before = logos.length;
        const beforeSG = styleGuides.length;
        logos.splice(0, logos.length, ...remove(logos));
        styleGuides.splice(0, styleGuides.length, ...remove(styleGuides));
        if (logos.length !== before || styleGuides.length !== beforeSG) {
          // best effort cleanup of files
        }
      });

      const payload = {
        business_name: req.body.business_name || existing.business_name || '',
        business_description: req.body.business_description || existing.business_description || '',
        logos,
        style_guides: styleGuides,
        brand_notes: req.body.brand_notes || existing.brand_notes || '',
        website_url: req.body.website_url || existing.website_url || ''
      };

      if (rows[0]) {
        await query(
          `UPDATE brand_assets
           SET business_name=$1, business_description=$2, logos=$3, style_guides=$4, brand_notes=$5, website_url=$6, updated_at=NOW()
           WHERE user_id=$7`,
          [
            payload.business_name,
            payload.business_description,
            JSON.stringify(payload.logos),
            JSON.stringify(payload.style_guides),
            payload.brand_notes,
            payload.website_url,
            targetUserId
          ]
        );
      } else {
        await query(
          `INSERT INTO brand_assets (user_id, business_name, business_description, logos, style_guides, brand_notes, website_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            targetUserId,
            payload.business_name,
            payload.business_description,
            JSON.stringify(payload.logos),
            JSON.stringify(payload.style_guides),
            payload.brand_notes,
            payload.website_url
          ]
        );
      }

      res.json({ brand: payload });
    } catch (err) {
      console.error('[brand]', err);
      res.status(500).json({ message: 'Unable to save brand profile' });
    }
  }
);

router.get('/docs', async (req, res) => {
  const defaultDocs = process.env.DEFAULT_DOCS ? JSON.parse(process.env.DEFAULT_DOCS) : [];
  const targetUserId = req.portalUserId || req.user.id;
  const { rows } = await query('SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC', [targetUserId]);
  const docs = [
    ...defaultDocs.map((d) => ({ ...d, type: 'default', origin: 'default', review_status: 'none' })),
    ...rows.map((r) => ({
      id: r.id,
      label: r.label || r.name,
      name: r.name,
      url: r.url,
      type: r.type || 'client',
      origin: r.origin || 'client',
      review_status: r.review_status || 'none',
      review_requested_at: r.review_requested_at,
      viewed_at: r.viewed_at
    }))
  ];
  res.json({ docs });
});

router.get('/docs/admin/:userId', isAdminOrEditor, async (req, res) => {
  const targetUser = req.params.userId;
  const defaultDocs = process.env.DEFAULT_DOCS ? JSON.parse(process.env.DEFAULT_DOCS) : [];
  const { rows } = await query('SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC', [targetUser]);
  const docs = [
    ...defaultDocs.map((d) => ({ ...d, type: 'default', origin: 'default', review_status: 'none' })),
    ...rows.map((r) => ({
      id: r.id,
      label: r.label || r.name,
      name: r.name,
      url: r.url,
      type: r.type || 'client',
      origin: r.origin || 'client',
      review_status: r.review_status || 'none',
      review_requested_at: r.review_requested_at,
      viewed_at: r.viewed_at
    }))
  ];
  res.json({ docs });
});
router.post('/docs', uploadDocs.array('client_doc', 10), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });
  const targetUserId = req.portalUserId || req.user.id;
  const inserted = [];
  for (const file of req.files) {
    const url = publicUrl(file.path);
    const { rows } = await query(
      `INSERT INTO documents (user_id, label, name, url, origin, type, review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, label, name, url, origin, type, review_status, review_requested_at, viewed_at`,
      [targetUserId, file.originalname, file.originalname, url, 'client', 'client', 'none']
    );
    inserted.push(rows[0]);
  }
  res.json({ message: 'Uploaded', docs: inserted });
});

router.delete('/docs/:id', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  await query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, targetUserId]);
  res.json({ message: 'Deleted' });
});

router.post('/docs/:id/viewed', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const docId = req.params.id;
  const { rowCount } = await query('UPDATE documents SET review_status=$1, viewed_at=NOW() WHERE id=$2 AND user_id=$3', [
    'viewed',
    docId,
    targetUserId
  ]);
  if (!rowCount) return res.status(404).json({ message: 'Document not found' });

  const { rows: docRows } = await query(
    `SELECT d.label, d.name, u.first_name, u.last_name, u.email
     FROM documents d
     LEFT JOIN users u ON d.user_id = u.id
     WHERE d.id = $1`,
    [docId]
  );
  const docInfo = docRows[0];
  const docLabel = docInfo?.label || docInfo?.name || 'Document';
  const clientName = [docInfo?.first_name, docInfo?.last_name].filter(Boolean).join(' ').trim() || docInfo?.email || 'Client';
  const baseUrl = resolveBaseUrl(req);
  const adminLink = `${baseUrl}/client-hub`;

  await createNotificationsForAdmins({
    title: 'Client reviewed a document',
    body: `${clientName} viewed ${docLabel}.`,
    linkUrl: '/client-hub',
    meta: { document_id: docId, client_id: targetUserId }
  });

  await notifyAdminsByEmail({
    subject: `${clientName} reviewed ${docLabel}`,
    text: `${clientName} just viewed "${docLabel}".\n\nOpen the Admin Hub: ${adminLink}`,
    html: `<p>${clientName} just viewed <strong>${docLabel}</strong>.</p><p><a href="${adminLink}" target="_blank" rel="noopener">Open the Admin Hub</a></p>`
  });

  res.json({ message: 'Document marked as viewed' });
});

router.post('/docs/admin/upload', isAdminOrEditor, uploadDocs.array('client_doc', 10), async (req, res) => {
  const targetUser = req.body.user_id;
  if (!targetUser) return res.status(400).json({ message: 'Missing client ID' });
  const forReview = req.body.for_review === 'true' || req.body.for_review === true;
  const labelInput = req.body.doc_label || '';
  const added = [];
  for (const file of req.files || []) {
    const url = publicUrl(file.path);
    const label = labelInput || file.originalname;
    const reviewStatus = forReview ? 'pending' : 'none';
    const { rows } = await query(
      `INSERT INTO documents (user_id, label, name, url, origin, type, review_status, review_requested_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [targetUser, label, file.originalname, url, 'admin', 'client', reviewStatus, forReview ? new Date() : null, req.user.id]
    );
    added.push(rows[0]);
  }
  res.json({ message: 'Uploaded', docs: added });
});

router.post('/docs/admin/review', requireAdmin, async (req, res) => {
  const { user_id, doc_id, review_action } = req.body;
  if (!user_id || !doc_id) return res.status(400).json({ message: 'Missing client or document' });
  const status = review_action === 'pending' ? 'pending' : 'none';
  await query('UPDATE documents SET review_status=$1, review_requested_at=$2 WHERE id=$3 AND user_id=$4 AND type != $5', [
    status,
    status === 'pending' ? new Date() : null,
    doc_id,
    user_id,
    'default'
  ]);

  if (status === 'pending') {
    const [{ rows: docRows }, { rows: userRows }] = await Promise.all([
      query('SELECT label, name FROM documents WHERE id = $1', [doc_id]),
      query('SELECT email, first_name FROM users WHERE id = $1', [user_id])
    ]);
    const docInfo = docRows[0] || {};
    const clientInfo = userRows[0] || {};
    const docLabel = docInfo.label || docInfo.name || 'Document';
    const portalLink = `${resolveBaseUrl(req)}/portal?tab=documents`;
    await createNotification({
      userId: user_id,
      title: 'Document ready for review',
      body: `${docLabel} was flagged for your review by the admin team.`,
      linkUrl: '/portal?tab=documents',
      meta: { document_id: doc_id, action: 'review_requested' }
    });
    if (isMailgunConfigured() && clientInfo.email) {
      await sendMailgunMessageWithLogging(
        {
          to: clientInfo.email,
          subject: 'A document needs your review',
          text: `Hi ${clientInfo.first_name || ''},\n\n"${docLabel}" has been flagged for your review. Visit your client portal to respond: ${portalLink}`,
          html: `<p>Hi ${clientInfo.first_name || 'there'},</p><p><strong>${docLabel}</strong> has been flagged for your review. Visit your client portal to respond.</p><p><a href="${portalLink}" target="_blank" rel="noopener">Open Client Portal</a></p>`
        },
        {
          emailType: 'document_review',
          recipientName: clientInfo.first_name,
          triggeredById: req.user?.id,
          clientId: user_id,
          metadata: { document_id: doc_id }
        }
      );
    }
  }

  res.json({ message: status === 'pending' ? 'Client notified for review' : 'Review cleared' });
});

router.delete('/docs/admin/:docId', isAdminOrEditor, async (req, res) => {
  const docId = req.params.docId;
  const targetUser = req.body?.user_id;
  if (!targetUser) return res.status(400).json({ message: 'Missing client ID' });
  const result = await query('DELETE FROM documents WHERE id=$1 AND user_id=$2 AND type != $3', [docId, targetUser, 'default']);
  if (!result.rowCount) {
    return res.status(404).json({ message: 'Document not found' });
  }
  res.json({ message: 'Deleted' });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED DOCUMENTS (admin-managed, visible to all clients under "Helpful Documents")
// ─────────────────────────────────────────────────────────────────────────────

// Client-facing: fetch shared docs
router.get('/shared-docs', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, label, name, url, description, sort_order, created_at FROM shared_documents ORDER BY sort_order ASC, created_at DESC'
    );
    res.json({ shared_docs: rows });
  } catch (err) {
    console.error('[hub:shared-docs:get]', err);
    res.status(500).json({ message: 'Failed to load shared documents' });
  }
});

// Admin: list shared docs with creator info
router.get('/shared-docs/admin', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT sd.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name, u.email AS creator_email
      FROM shared_documents sd
      LEFT JOIN users u ON sd.created_by = u.id
      ORDER BY sd.sort_order ASC, sd.created_at DESC
    `);
    res.json({ shared_docs: rows });
  } catch (err) {
    console.error('[hub:shared-docs:admin:get]', err);
    res.status(500).json({ message: 'Failed to load shared documents' });
  }
});

// Admin: upload new shared document(s)
router.post('/shared-docs/admin', requireAdmin, uploadDocs.array('shared_doc', 10), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No file uploaded' });
    const labels = req.body.labels ? (Array.isArray(req.body.labels) ? req.body.labels : [req.body.labels]) : [];
    const descriptions = req.body.descriptions
      ? Array.isArray(req.body.descriptions)
        ? req.body.descriptions
        : [req.body.descriptions]
      : [];
    const uploaded = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const url = publicUrl(file.path);
      const label = labels[i] || file.originalname;
      const description = descriptions[i] || null;
      const { rows } = await query(
        `INSERT INTO shared_documents (label, name, url, description, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [label, file.originalname, url, description, req.user.id]
      );
      uploaded.push(rows[0]);
    }
    res.json({ message: 'Uploaded', shared_docs: uploaded });
  } catch (err) {
    console.error('[hub:shared-docs:admin:post]', err);
    res.status(500).json({ message: 'Failed to upload shared document' });
  }
});

// Admin: update shared document details (label, description, sort_order)
router.put('/shared-docs/admin/:id', requireAdmin, async (req, res) => {
  try {
    const { label, description, sort_order } = req.body;
    const { rows } = await query(
      `UPDATE shared_documents SET label = COALESCE($1, label), description = $2, sort_order = COALESCE($3, sort_order), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [label, description, sort_order, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Document not found' });
    res.json({ shared_doc: rows[0] });
  } catch (err) {
    console.error('[hub:shared-docs:admin:put]', err);
    res.status(500).json({ message: 'Failed to update shared document' });
  }
});

// Admin: delete shared document
router.delete('/shared-docs/admin/:id', requireAdmin, async (req, res) => {
  try {
    const result = await query('DELETE FROM shared_documents WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Document not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[hub:shared-docs:admin:delete]', err);
    res.status(500).json({ message: 'Failed to delete shared document' });
  }
});

// Admin: reorder shared documents
router.post('/shared-docs/admin/reorder', requireAdmin, async (req, res) => {
  try {
    const { order } = req.body; // array of { id, sort_order }
    if (!Array.isArray(order)) return res.status(400).json({ message: 'Invalid order array' });
    for (const item of order) {
      if (item.id && typeof item.sort_order === 'number') {
        await query('UPDATE shared_documents SET sort_order = $1, updated_at = NOW() WHERE id = $2', [item.sort_order, item.id]);
      }
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    console.error('[hub:shared-docs:admin:reorder]', err);
    res.status(500).json({ message: 'Failed to reorder documents' });
  }
});

router.post('/clients/:id/onboarding-email', isAdminOrEditor, async (req, res) => {
  if (!isMailgunConfigured()) {
    return res.status(400).json({ message: 'Mailgun is not configured' });
  }
  const clientId = req.params.id;
  const { rows } = await query('SELECT id, email, first_name, last_name, role FROM users WHERE id = $1', [clientId]);
  if (!rows.length) return res.status(404).json({ message: 'Client not found' });
  const clientUser = rows[0];
  if (clientUser.role !== 'client') {
    return res.status(400).json({ message: 'Onboarding emails are only for client accounts.' });
  }

  // If onboarding is already completed, don't keep issuing links.
  const { rows: profileRows } = await query('SELECT onboarding_completed_at FROM client_profiles WHERE user_id = $1 LIMIT 1', [clientId]);
  if (profileRows[0]?.onboarding_completed_at) {
    return res.status(400).json({ message: 'Client onboarding is already completed.' });
  }

  const token = uuidv4();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ONBOARDING_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  // Revoke any previously-issued (still valid) links so only the newest link works.
  // Also mark all old tokens as "reminder handled" to prevent expiry notifications for superseded links.
  await query(
    `UPDATE client_onboarding_tokens 
     SET revoked_at = COALESCE(revoked_at, NOW()),
         reminder_sent_at = COALESCE(reminder_sent_at, NOW())
     WHERE user_id = $1 AND consumed_at IS NULL`,
    [clientId]
  );
  await query(
    `INSERT INTO client_onboarding_tokens (user_id, token_hash, expires_at, metadata)
     VALUES ($1,$2,$3,$4)`,
    [clientId, tokenHash, expiresAt, JSON.stringify({ created_by: req.user.id })]
  );

  const baseUrl = resolveBaseUrl(req);
  const onboardingUrl = `${baseUrl}/onboarding/${token}`;
  const subject = 'Anchor Client Onboarding';
  const greeting = clientUser.first_name ? `Hi ${clientUser.first_name},` : 'Hi there,';
  const text = `${greeting}

We created your Anchor account. Click the link below to finish onboarding, set your password, confirm services, and share brand details.

${onboardingUrl}

If you were not expecting this email, ignore it.`;
  const html = `<p>${greeting}</p>
<p>We created your Anchor account. Use the button below to finish onboarding, set your password, confirm services, and share brand details.</p>
<p><a href="${onboardingUrl}" style="background:#0f6efd;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;display:inline-block;">Complete Onboarding</a></p>
<p>If you were not expecting this email, you can safely ignore it.</p>`;

  await sendMailgunMessageWithLogging(
    {
      to: clientUser.email,
      subject,
      text,
      html
    },
    {
      emailType: 'onboarding_invite',
      recipientName: clientUser.first_name,
      triggeredById: req.user?.id,
      clientId,
      metadata: { onboarding_url: onboardingUrl }
    }
  );
  logEvent('mailgun:onboarding', 'Onboarding email queued', { clientId, email: clientUser.email });
  res.json({ message: 'Onboarding email sent' });
});

// Get or generate onboarding link without sending email (for manual sharing)
router.get('/clients/:id/onboarding-link', isAdminOrEditor, async (req, res) => {
  const clientId = req.params.id;
  const { rows } = await query('SELECT id, email, first_name, last_name, role FROM users WHERE id = $1', [clientId]);
  if (!rows.length) return res.status(404).json({ message: 'Client not found' });
  const clientUser = rows[0];
  if (clientUser.role !== 'client') {
    return res.status(400).json({ message: 'Onboarding links are only for client accounts.' });
  }

  // If onboarding is already completed, don't issue links.
  const { rows: profileRows } = await query('SELECT onboarding_completed_at FROM client_profiles WHERE user_id = $1 LIMIT 1', [clientId]);
  if (profileRows[0]?.onboarding_completed_at) {
    return res.status(400).json({ message: 'Client onboarding is already completed.' });
  }

  const token = uuidv4();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ONBOARDING_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  // Revoke any previously-issued (still valid) links so only the newest link works.
  // Also mark all old tokens as "reminder handled" to prevent expiry notifications for superseded links.
  await query(
    `UPDATE client_onboarding_tokens 
     SET revoked_at = COALESCE(revoked_at, NOW()),
         reminder_sent_at = COALESCE(reminder_sent_at, NOW())
     WHERE user_id = $1 AND consumed_at IS NULL`,
    [clientId]
  );
  await query(
    `INSERT INTO client_onboarding_tokens (user_id, token_hash, expires_at, metadata)
     VALUES ($1,$2,$3,$4)`,
    [clientId, tokenHash, expiresAt, JSON.stringify({ created_by: req.user.id, source: 'manual_copy' })]
  );

  const baseUrl = resolveBaseUrl(req);
  const onboardingUrl = `${baseUrl}/onboarding/${token}`;

  logEvent('onboarding:link-generated', 'Onboarding link generated for manual sharing', { clientId, email: clientUser.email });
  res.json({
    url: onboardingUrl,
    expiresAt: expiresAt.toISOString(),
    message: 'Onboarding link generated. Previous links have been revoked.'
  });
});

router.get('/notifications', async (req, res) => {
  const effRole = req.user?.effective_role || req.user?.role;
  const isStaffRole = effRole === 'superadmin' || effRole === 'admin' || effRole === 'team';
  // Staff should always see their own notifications (even if a portal/impersonation context exists).
  const userId = isStaffRole ? req.user.id : req.portalUserId || req.user.id;
  try {
    const { notifications, unread } = await fetchUserNotifications(userId, Number(req.query.limit) || 25);
    res.json({ notifications, unread });
  } catch (err) {
    console.error('[notifications:list]', err);
    res.status(500).json({ message: 'Unable to load notifications' });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  const effRole = req.user?.effective_role || req.user?.role;
  const isStaffRole = effRole === 'superadmin' || effRole === 'admin' || effRole === 'team';
  const userId = isStaffRole ? req.user.id : req.portalUserId || req.user.id;
  const notificationId = req.params.id;
  try {
    await markNotificationRead(userId, notificationId);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('[notifications:read]', err);
    res.status(500).json({ message: 'Unable to mark notification as read' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  const effRole = req.user?.effective_role || req.user?.role;
  const isStaffRole = effRole === 'superadmin' || effRole === 'admin' || effRole === 'team';
  const userId = isStaffRole ? req.user.id : req.portalUserId || req.user.id;
  try {
    await markAllNotificationsRead(userId);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[notifications:read-all]', err);
    res.status(500).json({ message: 'Unable to mark notifications as read' });
  }
});

router.post('/email/test', isAdminOrEditor, async (req, res) => {
  if (!isMailgunConfigured()) {
    return res.status(400).json({ message: 'Mailgun credentials are not configured' });
  }
  const { to, subject, text, html } = req.body || {};
  if (!to) return res.status(400).json({ message: 'Recipient is required' });
  const resolvedSubject = subject || 'Anchor Mailgun Test';
  const bodyText = text || 'Test email sent via Mailgun sandbox.';

  try {
    const response = await sendMailgunMessageWithLogging(
      {
        to,
        subject: resolvedSubject,
        text: bodyText,
        html
      },
      {
        emailType: 'test',
        triggeredById: req.user?.id,
        metadata: { source: 'admin_test' }
      }
    );
    logEvent('mailgun:test', 'Mailgun test email sent', { id: response.id, message: response.message });
    res.json({ id: response.id, message: response.message });
  } catch (err) {
    logEvent('mailgun:test', 'Failed to send test email', { error: err.message });
    res.status(500).json({ message: err.message || 'Unable to send email' });
  }
});

// Email Logs - Admin endpoints
router.get('/email-logs', isAdminOrEditor, async (req, res) => {
  try {
    const { page, limit, email_type, status, search, date_from, date_to } = req.query;
    const result = await fetchEmailLogs({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
      emailType: email_type,
      status,
      search,
      dateFrom: date_from,
      dateTo: date_to
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch email logs' });
  }
});

router.get('/email-logs/stats', isAdminOrEditor, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const stats = await getEmailStats(days);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch email stats' });
  }
});

router.get('/email-logs/:id', isAdminOrEditor, async (req, res) => {
  try {
    const log = await fetchEmailLogById(req.params.id);
    if (!log) {
      return res.status(404).json({ message: 'Email log not found' });
    }
    res.json(log);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch email log' });
  }
});

router.get('/clients', isAdminOrEditor, async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, cp.*,
            COALESCE(cp.ai_prompt, $1) as ai_prompt
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.role IN ('client', 'editor', 'admin', 'team')
     ORDER BY u.created_at DESC`,
    [DEFAULT_AI_PROMPT]
  );
  res.json({ clients: rows });
});

router.post('/clients', isAdminOrEditor, async (req, res) => {
  try {
    const { email, name, role, client_package } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const allowedRoles = ['client', 'admin', 'team'];
    const requestedRole = allowedRoles.includes(role) ? role : 'client';
    const newRole = requestedRole;
    const normalizedPackage = CLIENT_PACKAGE_OPTIONS.includes(client_package) ? client_package : null;
    const existing = await query('SELECT id, email, first_name, last_name FROM users WHERE email = $1 LIMIT 1', [email]);
    const [first, ...rest] = (name || '').trim().split(' ').filter(Boolean);
    const last = rest.join(' ');
    if (existing.rows.length) {
      return res.status(409).json({
        message: 'Email already in use',
        existing_user_id: existing.rows[0].id
      });
    } else {
      const password = uuidv4();
      const hash = await bcrypt.hash(password, 12);
      const inserted = await query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, first_name, last_name, email, role`,
        [first || email.split('@')[0], last || '', email.toLowerCase(), hash, newRole]
      );
      // ensure profile row (+ allow setting package at create-time for clients)
      await query(
        `INSERT INTO client_profiles (user_id, client_package)
         VALUES ($1, $2)
         ON CONFLICT (user_id)
         DO UPDATE SET client_package = COALESCE(EXCLUDED.client_package, client_profiles.client_package), updated_at = NOW()`,
        [inserted.rows[0].id, newRole === 'client' ? normalizedPackage : null]
      );
      res.status(201).json({ client: inserted.rows[0], created: true });
    }
  } catch (err) {
    console.error('[clients:create]', err);
    res.status(500).json({ message: 'Unable to save client' });
  }
});

router.get('/clients/:id', isAdminOrEditor, async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, cp.*,
            COALESCE(cp.ai_prompt, $2) as ai_prompt
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = $1`,
    [req.params.id, DEFAULT_AI_PROMPT]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Client not found' });
  res.json({ client: rows[0] });
});

router.put('/clients/:id', isAdminOrEditor, async (req, res) => {
  try {
    const clientId = req.params.id;
    const {
      display_name,
      user_email,
      role,
      client_type,
      client_subtype,
      client_package,
      looker_url,
      monday_board_id,
      monday_group_id,
      monday_active_group_id,
      monday_completed_group_id,
      client_identifier_value,
      task_workspace_id,
      board_prefix,
      account_manager_person_id,
      ai_prompt,
      ctm_account_number,
      ctm_api_key,
      ctm_api_secret,
      auto_star_enabled,
      requires_website_access,
      requires_ga4_access,
      requires_google_ads_access,
      requires_meta_access,
      requires_forms_step,
      website_access_provided,
      website_access_understood,
      ga4_access_provided,
      ga4_access_understood,
      google_ads_access_provided,
      google_ads_access_understood,
      meta_access_provided,
      meta_access_understood,
      website_forms_details_provided,
      website_forms_details_understood,
      website_forms_uses_third_party,
      website_forms_uses_hipaa,
      website_forms_connected_crm,
      website_forms_custom,
      website_forms_notes
    } = req.body;
    if (display_name) {
      const parts = display_name.trim().split(' ').filter(Boolean);
      const first = parts.shift() || '';
      const last = parts.join(' ');
      await query('UPDATE users SET first_name=$1, last_name=$2 WHERE id=$3', [first || display_name.trim(), last, clientId]);
    }
    if (user_email) {
      await query('UPDATE users SET email=$1 WHERE id=$2', [user_email, clientId]);
    }
    if (role && (req.user.effective_role || req.user.role) === 'superadmin') {
      const nextRole = ['client', 'editor', 'admin', 'team'].includes(role) ? role : 'client';
      await query('UPDATE users SET role=$1 WHERE id=$2', [nextRole, clientId]);
    }
    const exists = await query('SELECT user_id FROM client_profiles WHERE user_id = $1', [clientId]);
    const normalizedPackage = CLIENT_PACKAGE_OPTIONS.includes(client_package) ? client_package : null;
    const params = [
      looker_url || null,
      monday_board_id || null,
      monday_group_id || null,
      monday_active_group_id || null,
      monday_completed_group_id || null,
      client_identifier_value || null,
      task_workspace_id || null,
      board_prefix || null,
      account_manager_person_id || null,
      ai_prompt || null,
      ctm_account_number || null,
      ctm_api_key || null,
      ctm_api_secret || null,
      auto_star_enabled !== undefined ? auto_star_enabled : false,
      client_type || null,
      client_subtype || null,
      normalizedPackage,
      requires_website_access === undefined ? null : Boolean(requires_website_access),
      requires_ga4_access === undefined ? null : Boolean(requires_ga4_access),
      requires_google_ads_access === undefined ? null : Boolean(requires_google_ads_access),
      requires_meta_access === undefined ? null : Boolean(requires_meta_access),
      requires_forms_step === undefined ? null : Boolean(requires_forms_step),
      website_access_provided === undefined ? null : Boolean(website_access_provided),
      website_access_understood === undefined ? null : Boolean(website_access_understood),
      ga4_access_provided === undefined ? null : Boolean(ga4_access_provided),
      ga4_access_understood === undefined ? null : Boolean(ga4_access_understood),
      google_ads_access_provided === undefined ? null : Boolean(google_ads_access_provided),
      google_ads_access_understood === undefined ? null : Boolean(google_ads_access_understood),
      meta_access_provided === undefined ? null : Boolean(meta_access_provided),
      meta_access_understood === undefined ? null : Boolean(meta_access_understood),
      website_forms_details_provided === undefined ? null : Boolean(website_forms_details_provided),
      website_forms_details_understood === undefined ? null : Boolean(website_forms_details_understood),
      website_forms_uses_third_party === undefined ? null : Boolean(website_forms_uses_third_party),
      website_forms_uses_hipaa === undefined ? null : Boolean(website_forms_uses_hipaa),
      website_forms_connected_crm === undefined ? null : Boolean(website_forms_connected_crm),
      website_forms_custom === undefined ? null : Boolean(website_forms_custom),
      website_forms_notes === undefined ? null : String(website_forms_notes || ''),
      clientId
    ];
    if (exists.rows.length) {
      await query(
        `UPDATE client_profiles
           SET looker_url=$1,monday_board_id=$2,monday_group_id=$3,monday_active_group_id=$4,monday_completed_group_id=$5,
               client_identifier_value=$6, task_workspace_id=$7, board_prefix=$8,
               account_manager_person_id=$9, ai_prompt=$10, ctm_account_number=$11, ctm_api_key=$12, ctm_api_secret=$13,
               auto_star_enabled=$14, client_type=$15, client_subtype=$16, client_package=$17,
               requires_website_access=COALESCE($18, requires_website_access),
               requires_ga4_access=COALESCE($19, requires_ga4_access),
               requires_google_ads_access=COALESCE($20, requires_google_ads_access),
               requires_meta_access=COALESCE($21, requires_meta_access),
               requires_forms_step=COALESCE($22, requires_forms_step),
               website_access_provided=COALESCE($23, website_access_provided),
               website_access_understood=COALESCE($24, website_access_understood),
               ga4_access_provided=COALESCE($25, ga4_access_provided),
               ga4_access_understood=COALESCE($26, ga4_access_understood),
               google_ads_access_provided=COALESCE($27, google_ads_access_provided),
               google_ads_access_understood=COALESCE($28, google_ads_access_understood),
               meta_access_provided=COALESCE($29, meta_access_provided),
               meta_access_understood=COALESCE($30, meta_access_understood),
               website_forms_details_provided=COALESCE($31, website_forms_details_provided),
               website_forms_details_understood=COALESCE($32, website_forms_details_understood),
               website_forms_uses_third_party=COALESCE($33, website_forms_uses_third_party),
               website_forms_uses_hipaa=COALESCE($34, website_forms_uses_hipaa),
               website_forms_connected_crm=COALESCE($35, website_forms_connected_crm),
               website_forms_custom=COALESCE($36, website_forms_custom),
               website_forms_notes=COALESCE($37, website_forms_notes),
               updated_at=NOW()
         WHERE user_id=$38`,
        params
      );
    } else {
      await query(
        `INSERT INTO client_profiles (
           looker_url,monday_board_id,monday_group_id,monday_active_group_id,monday_completed_group_id,
           client_identifier_value,task_workspace_id,board_prefix,
           account_manager_person_id,ai_prompt,ctm_account_number,ctm_api_key,ctm_api_secret,auto_star_enabled,
           client_type,client_subtype,client_package,
           requires_website_access,requires_ga4_access,requires_google_ads_access,requires_meta_access,requires_forms_step,
           website_access_provided,website_access_understood,
           ga4_access_provided,ga4_access_understood,
           google_ads_access_provided,google_ads_access_understood,
           meta_access_provided,meta_access_understood,
           website_forms_details_provided,website_forms_details_understood,
           website_forms_uses_third_party,website_forms_uses_hipaa,website_forms_connected_crm,website_forms_custom,
           website_forms_notes,
           user_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)`,
        params
      );
    }

    // If this is a client account and we have a task workspace + identifier, provision (or update) their internal task board.
    try {
      const { rows: userRoleRows } = await query('SELECT role FROM users WHERE id = $1 LIMIT 1', [clientId]);
      const targetRole = userRoleRows[0]?.role;
      if (targetRole === 'client' && task_workspace_id && client_identifier_value) {
        const name = String(client_identifier_value || '').trim();
        const prefix = String(board_prefix || '').trim();

        const { rows: wsRows } = await query('SELECT id FROM task_workspaces WHERE id = $1 LIMIT 1', [task_workspace_id]);
        if (!wsRows.length) {
          return res.status(400).json({ message: 'Selected task workspace is invalid' });
        }

        const { rows: profileRows } = await query('SELECT task_board_id FROM client_profiles WHERE user_id = $1 LIMIT 1', [clientId]);
        const existingBoardId = profileRows[0]?.task_board_id;

        if (existingBoardId) {
          // Keep board name/prefix in sync with latest onboarding values.
          await query('UPDATE task_boards SET name = $1, board_prefix = $2 WHERE id = $3', [name, prefix || null, existingBoardId]);
          await query('UPDATE client_profiles SET board_prefix = $1, task_workspace_id = $2, updated_at = NOW() WHERE user_id = $3', [
            prefix || null,
            task_workspace_id,
            clientId
          ]);
        } else {
          const { rows: boardRows } = await query(
            `INSERT INTO task_boards (workspace_id, name, description, created_by, board_prefix)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [task_workspace_id, name, `Client board: ${name}`, req.user.id, prefix || null]
          );
          const newBoardId = boardRows[0]?.id;
          if (newBoardId) {
            // Create a default group so items can be added immediately.
            await query(`INSERT INTO task_groups (board_id, name, order_index) VALUES ($1,$2,$3)`, [newBoardId, 'Main', 0]);
            await query(
              `UPDATE client_profiles
                 SET task_board_id = $1, task_workspace_id = $2, board_prefix = $3, updated_at = NOW()
               WHERE user_id = $4`,
              [newBoardId, task_workspace_id, prefix || null, clientId]
            );
          }
        }
      }
    } catch (err) {
      console.error('[clients:task-board:provision]', err);
      // Do not fail the whole client update if board provisioning fails.
    }

    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, cp.*
       FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.id=$1`,
      [clientId]
    );
    res.json({ client: rows[0] });
  } catch (err) {
    console.error('[clients:update]', err);
    const msg =
      err?.code === '42703'
        ? `Database schema is out of date: ${err.message}. Run migrations (init.sql) to add missing columns.`
        : err?.message || 'Unable to update client';
    res.status(500).json({ message: msg, code: err?.code || null });
  }
});

router.delete('/clients/:id', isAdminOrEditor, async (req, res) => {
  try {
    const effRole = req.user.effective_role || req.user.role;
    if (effRole !== 'superadmin' && effRole !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete users.' });
    }
    const clientId = req.params.id;
    const deleteBoard = req.query.delete_board === 'true';

    if (clientId === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    const { rows } = await query('SELECT id, email, role FROM users WHERE id = $1 LIMIT 1', [clientId]);
    if (!rows.length) return res.status(404).json({ message: 'Client not found' });
    const targetUser = rows[0];

    // Admins can delete admins/team/clients. Only superadmins can delete superadmins.
    if (targetUser.role === 'superadmin' && effRole !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmins can delete superadmin accounts.' });
    }

    const allowedTargetRoles = new Set(['client', 'admin', 'team', 'superadmin']);
    if (!allowedTargetRoles.has(targetUser.role)) {
      return res.status(400).json({ message: 'This user role cannot be deleted via the admin hub.' });
    }

    // Check if client has an associated task board
    const { rows: profileRows } = await query('SELECT task_board_id FROM client_profiles WHERE user_id = $1', [clientId]);
    const taskBoardId = profileRows[0]?.task_board_id;

    // Delete the associated task board if requested
    if (deleteBoard && taskBoardId) {
      await query('DELETE FROM task_boards WHERE id = $1', [taskBoardId]);
      logEvent('clients:delete', 'Associated task board deleted', { clientId, boardId: taskBoardId, deletedBy: req.user.id });
    }

    await query('DELETE FROM users WHERE id = $1', [clientId]);
    logEvent('clients:delete', 'User deleted', {
      clientId,
      deletedBy: req.user.id,
      targetRole: targetUser.role,
      boardDeleted: deleteBoard && !!taskBoardId
    });
    res.json({ message: 'User deleted', targetRole: targetUser.role, boardDeleted: deleteBoard && !!taskBoardId });
  } catch (err) {
    console.error('[clients:delete]', err);
    res.status(500).json({ message: 'Unable to delete client' });
  }
});

// Activate a client account (allows them to log in after onboarding completion)
router.post('/clients/:id/activate', isAdminOrEditor, async (req, res) => {
  const clientId = req.params.id;
  try {
    const { rows: userRows } = await query('SELECT id, email, first_name, role FROM users WHERE id = $1 LIMIT 1', [clientId]);
    if (!userRows.length) return res.status(404).json({ message: 'Client not found' });

    const user = userRows[0];
    if (user.role !== 'client') {
      return res.status(400).json({ message: 'Only client accounts can be activated' });
    }

    // Check if already activated
    const { rows: profileRows } = await query('SELECT activated_at, onboarding_completed_at FROM client_profiles WHERE user_id = $1', [
      clientId
    ]);
    if (profileRows[0]?.activated_at) {
      return res.status(400).json({ message: 'Account is already activated' });
    }

    // Set activated_at timestamp
    await query(
      `INSERT INTO client_profiles (user_id, activated_at)
       VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET activated_at = NOW(), updated_at = NOW()`,
      [clientId]
    );

    logEvent('clients:activate', 'Client account activated', { clientId, activatedBy: req.user.id });

    // Optionally send activation email to client
    if (isMailgunConfigured() && user.email) {
      const appBaseUrl = resolveAppBaseUrl(req);
      const loginUrl = `${appBaseUrl}/pages/login`;
      try {
        await sendMailgunMessageWithLogging(
          {
            to: [user.email],
            subject: 'Your Anchor Dashboard is Ready!',
            text: `Hello${user.first_name ? ` ${user.first_name}` : ''},\n\nGreat news! Your Anchor dashboard is now ready. You can log in and start exploring.\n\nLog in here: ${loginUrl}\n\nIf you have any questions, please reach out to your account manager.\n\n— Anchor`,
            html: `<p>Hello${user.first_name ? ` ${user.first_name}` : ''},</p>
<p>Great news! Your Anchor dashboard is now ready. You can log in and start exploring.</p>
<p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#667eea;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Log In to Your Dashboard</a></p>
<p>If you have any questions, please reach out to your account manager.</p>
<p>— Anchor</p>`
          },
          {
            emailType: 'account_activated',
            recipientName: user.first_name,
            triggeredById: req.user?.id,
            clientId: user.id,
            metadata: { login_url: loginUrl }
          }
        );
      } catch (emailErr) {
        console.error('[clients:activate:email]', emailErr);
        // Don't fail the activation if email fails
      }
    }

    // Return updated client data
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, cp.*
       FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.id=$1`,
      [clientId]
    );
    res.json({ client: rows[0], message: 'Account activated successfully' });
  } catch (err) {
    console.error('[clients:activate]', err);
    res.status(500).json({ message: 'Unable to activate account' });
  }
});

router.post('/clients/:id/service-presets', isAdminOrEditor, async (req, res) => {
  const targetClientId = req.params.id;
  const { services } = req.body || {};
  if (!Array.isArray(services)) {
    return res.status(400).json({ message: 'Services must be provided as an array' });
  }
  const normalized = [...new Set(services.map((name) => String(name || '').trim()).filter(Boolean))];
  if (!normalized.length) {
    return res.status(400).json({ message: 'At least one service is required' });
  }
  try {
    const userCheck = await query('SELECT id FROM users WHERE id = $1 LIMIT 1', [targetClientId]);
    if (!userCheck.rows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }
    const existingServices = await query('SELECT LOWER(name) AS name FROM services WHERE user_id = $1', [targetClientId]);
    const existingSet = new Set(existingServices.rows.map((row) => row.name));
    const toInsert = normalized.filter((name) => !existingSet.has(name.toLowerCase()));
    const created = [];
    for (const name of toInsert) {
      const inserted = await query('INSERT INTO services (user_id, name, description, base_price) VALUES ($1,$2,$3,$4) RETURNING *', [
        targetClientId,
        name,
        '',
        0
      ]);
      created.push(inserted.rows[0]);
      logEvent('clients:service-presets', 'Preset service added', { clientId: targetClientId, serviceName: name });
    }
    res.json({ created, skipped: normalized.length - created.length });
  } catch (err) {
    logEvent('clients:service-presets', 'Error applying services', { error: err.message, clientId: targetClientId });
    res.status(500).json({ message: 'Unable to apply preset services' });
  }
});

router.get('/admin/clients/:id/services', isAdminOrEditor, async (req, res) => {
  const targetClientId = req.params.id;
  try {
    const { rows: userRows } = await query('SELECT id FROM users WHERE id = $1 LIMIT 1', [targetClientId]);
    if (!userRows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }
    const { rows } = await query('SELECT * FROM services WHERE user_id = $1 ORDER BY name ASC', [targetClientId]);
    res.json({ services: rows });
  } catch (err) {
    logEvent('clients:services:list', 'Error fetching client services', { clientId: targetClientId, error: err.message });
    res.status(500).json({ message: 'Unable to fetch client services' });
  }
});

router.put('/admin/clients/:id/services', isAdminOrEditor, async (req, res) => {
  const targetClientId = req.params.id;
  const { services } = req.body || {};
  if (!Array.isArray(services)) {
    return res.status(400).json({ message: 'Services payload must be an array' });
  }

  const formatName = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    return trimmed
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const sanitized = [];
  const seen = new Set();
  for (const rawService of services) {
    const name = formatName(rawService?.name);
    if (!name) continue;
    const description = rawService?.description ? String(rawService.description).trim() : '';
    const price =
      rawService?.base_price === '' || rawService?.base_price === null || rawService?.base_price === undefined
        ? null
        : Number.parseFloat(rawService.base_price);
    const safePrice = Number.isFinite(price) ? price : null;
    const id = rawService?.id || null;
    const key = id || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push({
      id,
      name,
      description,
      base_price: safePrice,
      active: rawService?.active === false ? false : true
    });
  }

  try {
    const { rows: userRows } = await query('SELECT id FROM users WHERE id = $1 LIMIT 1', [targetClientId]);
    if (!userRows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }
    const { rows: existingRows } = await query('SELECT id FROM services WHERE user_id = $1', [targetClientId]);
    const existingIds = new Set(existingRows.map((row) => row.id));
    const processedIds = new Set();

    await query('BEGIN');
    for (const service of sanitized) {
      if (service.id && existingIds.has(service.id)) {
        await query(
          `UPDATE services 
             SET name = $1,
                 description = $2,
                 base_price = $3,
                 active = $4,
                 updated_at = NOW()
           WHERE id = $5 AND user_id = $6`,
          [service.name, service.description || null, service.base_price, service.active !== false, service.id, targetClientId]
        );
        processedIds.add(service.id);
      } else {
        const { rows } = await query(
          `INSERT INTO services (user_id, name, description, base_price, active)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [targetClientId, service.name, service.description || null, service.base_price, service.active !== false]
        );
        processedIds.add(rows[0].id);
      }
    }

    const idsToDeactivate = existingRows.filter((row) => !processedIds.has(row.id)).map((row) => row.id);
    if (idsToDeactivate.length) {
      await query(
        `UPDATE services 
           SET active = FALSE,
               updated_at = NOW()
         WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [targetClientId, idsToDeactivate]
      );
    }
    await query('COMMIT');
    const refreshed = await query('SELECT * FROM services WHERE user_id = $1 ORDER BY name ASC', [targetClientId]);
    logEvent('clients:services:update', 'Client services updated', {
      clientId: targetClientId,
      updated: sanitized.length,
      deactivated: idsToDeactivate.length
    });
    res.json({ services: refreshed.rows });
  } catch (err) {
    try {
      await query('ROLLBACK');
    } catch (rollbackErr) {
      logEvent('clients:services:update', 'Rollback failed', { clientId: targetClientId, error: rollbackErr.message });
    }
    logEvent('clients:services:update', 'Error updating client services', { clientId: targetClientId, error: err.message });
    res.status(500).json({ message: 'Unable to update client services' });
  }
});

router.post('/requests', uploadRequestAttachment.single('attachment'), async (req, res) => {
  const { title, description, due_date, rush, person_override } = req.body || {};
  const isRush = rush === true || rush === 'true';
  const dueDate = due_date ? String(due_date).trim() : null;
  const attachment = req.file;
  try {
    const settings = await getMondaySettings();
    const targetUserId = req.portalUserId || req.user.id;
    const profile = (await query(`SELECT * FROM client_profiles WHERE user_id = $1`, [targetUserId])).rows[0] || {};

    logEvent('requests:create', 'incoming submission', {
      user: targetUserId,
      title,
      due_date,
      rush: !!isRush,
      hasBoard: !!profile.monday_board_id,
      hasGroup: !!profile.monday_group_id
    });

    let mondayItem = null;
    const hasMondayToken = process.env.MONDAY_API_TOKEN || settings.monday_token;
    if (hasMondayToken && profile.monday_board_id && profile.monday_group_id) {
      const columnValues = buildRequestColumnValues({
        settings,
        profile,
        form: { due_date: dueDate, rush: isRush, person_override }
      });
      mondayItem = await createRequestItem({
        boardId: profile.monday_board_id,
        groupId: profile.monday_group_id,
        name: title || 'Request',
        columnValues,
        settings
      });
      logEvent('requests:create', 'monday item created', {
        user: targetUserId,
        boardId: profile.monday_board_id,
        groupId: profile.monday_group_id,
        mondayItemId: mondayItem?.id || null
      });

      if (mondayItem?.id) {
        const updateSections = [];
        if (description) updateSections.push(description);
        if (dueDate) updateSections.push(`Requested due date: ${dueDate}`);
        if (isRush) updateSections.push('Priority: Rush Job');
        if (updateSections.length) {
          try {
            await createItemUpdate({
              itemId: mondayItem.id,
              body: updateSections.join('\n\n'),
              settings
            });
          } catch (updateErr) {
            logEvent('requests:create', 'failed to create monday update', {
              error: updateErr.message,
              itemId: mondayItem.id
            });
          }
        }

        if (settings.monday_status_column_id) {
          const statusLabel = isRush ? settings.monday_rush_status_label || 'Rush Job' : settings.monday_status_label || 'Assigned';
          try {
            await changeColumnValue({
              boardId: profile.monday_board_id,
              itemId: mondayItem.id,
              columnId: settings.monday_status_column_id,
              value: { label: statusLabel },
              settings
            });
          } catch (statusErr) {
            logEvent('requests:create', 'failed to set monday status', {
              error: statusErr.message,
              itemId: mondayItem.id
            });
          }
        }

        if (settings.monday_due_date_column_id && dueDate) {
          try {
            await changeColumnValue({
              boardId: profile.monday_board_id,
              itemId: mondayItem.id,
              columnId: settings.monday_due_date_column_id,
              value: { date: dueDate },
              settings
            });
          } catch (dueErr) {
            logEvent('requests:create', 'failed to set monday due date', {
              error: dueErr.message,
              itemId: mondayItem.id
            });
          }
        }

        if (attachment && settings.monday_client_files_column_id) {
          try {
            await uploadFileToColumn({
              itemId: mondayItem.id,
              columnId: settings.monday_client_files_column_id,
              fileBuffer: attachment.buffer,
              fileName: attachment.originalname,
              mimeType: attachment.mimetype,
              settings
            });
          } catch (fileErr) {
            logEvent('requests:create', 'failed to upload monday file', {
              error: fileErr.message,
              itemId: mondayItem.id
            });
          }
        }
      }
    } else {
      logEvent('requests:create', 'skipping monday submission (missing config)', {
        user: targetUserId,
        hasToken: !!(process.env.MONDAY_API_TOKEN || settings.monday_token),
        boardId: profile.monday_board_id || null,
        groupId: profile.monday_group_id || null
      });
    }

    const { rows } = await query(
      `INSERT INTO requests (user_id, title, description, due_date, rush, person_override, status, monday_item_id, monday_board_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        targetUserId,
        title || '',
        description || '',
        dueDate || null,
        !!isRush,
        person_override || null,
        mondayItem ? 'submitted' : 'pending',
        mondayItem?.id || null,
        profile.monday_board_id || null
      ]
    );
    const savedRequest = rows[0];
    logEvent('requests:create', 'request stored', {
      user: targetUserId,
      requestId: savedRequest?.id,
      mondayItemId: mondayItem?.id || null
    });

    if (isRush) {
      try {
        const contact = await resolveAccountManagerContact(targetUserId, { settings });
        if (contact && (contact.managerEmail || contact.notificationUserId)) {
          const mondayBaseUrl = (settings?.monday_account_url || 'https://app.monday.com').replace(/\/$/, '');
          const mondayLink =
            mondayItem?.id && profile.monday_board_id ? `${mondayBaseUrl}/boards/${profile.monday_board_id}/pulses/${mondayItem.id}` : null;
          const requestTitle = title || 'Untitled Request';
          const dueLabel = dueDate || 'Not provided';
          const descriptionText = description?.trim() ? description.trim() : 'No description provided.';
          const textLines = [
            `${contact.clientName} submitted a rush job request.`,
            `Title: ${requestTitle}`,
            `Due Date: ${dueLabel}`,
            `Description: ${descriptionText}`
          ];
          if (mondayLink) textLines.push(`Monday item: ${mondayLink}`);

          const htmlSections = [
            `<p><strong>${escapeHtml(contact.clientName)}</strong> submitted a rush job request.</p>`,
            `<p><strong>Title:</strong> ${escapeHtml(requestTitle)}<br /><strong>Due Date:</strong> ${escapeHtml(dueLabel)}</p>`,
            `<p><strong>Description:</strong><br />${escapeHtml(descriptionText).replace(/\n/g, '<br />')}</p>`
          ];
          if (mondayLink) {
            htmlSections.push(`<p><a href="${mondayLink}" target="_blank" rel="noopener">Open Monday.com item</a></p>`);
          }

          if (contact.managerEmail && isMailgunConfigured()) {
            await sendMailgunMessageWithLogging(
              {
                to: contact.managerEmail,
                subject: 'Rush Job Requested',
                text: textLines.join('\n'),
                html: htmlSections.join('')
              },
              {
                emailType: 'rush_job',
                triggeredById: targetUserId,
                clientId: targetUserId,
                metadata: { request_id: requestId, monday_link: mondayLink }
              }
            );
          }

          if (contact.notificationUserId) {
            await createNotification({
              userId: contact.notificationUserId,
              title: 'Rush job requested',
              body: `${contact.clientName} submitted "${requestTitle}".`,
              linkUrl: mondayLink || '/admin',
              meta: {
                request_id: savedRequest?.id,
                monday_item_id: mondayItem?.id || null,
                rush: true
              }
            });
          }
        }
      } catch (notifyErr) {
        logEvent('requests:create', 'rush notification failed', { error: notifyErr.message });
      }
    }

    res.json({ request: savedRequest, monday_item: mondayItem });
  } catch (err) {
    console.error('[requests:create]', err);
    logEvent('requests:create', 'failed', { message: err.message, stack: err.stack });
    res.status(500).json({ message: err.message || 'Unable to submit request' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const settings = await getMondaySettings();
    const targetUserId = req.portalUserId || req.user.id;
    const profile = (await query(`SELECT * FROM client_profiles WHERE user_id = $1`, [targetUserId])).rows[0] || {};
    const local = (await query('SELECT * FROM requests WHERE user_id=$1 ORDER BY created_at DESC', [targetUserId])).rows;

    const hasMondayToken = process.env.MONDAY_API_TOKEN || settings.monday_token;

    logEvent('requests:list', 'Fetching tasks', {
      user: targetUserId,
      hasMondayToken: !!hasMondayToken,
      boardId: profile.monday_board_id || null,
      activeGroupId: profile.monday_active_group_id || null,
      completedGroupId: profile.monday_completed_group_id || null
    });

    if (hasMondayToken && profile.monday_board_id) {
      const groupIds = [profile.monday_active_group_id, profile.monday_completed_group_id].filter(Boolean);

      if (groupIds.length === 0) {
        logEvent('requests:list', 'No group IDs configured', { user: targetUserId, boardId: profile.monday_board_id });
      }

      const groups = await listItemsByGroups({
        boardId: profile.monday_board_id,
        groupIds,
        settings,
        columnIds: [settings.monday_status_column_id, settings.monday_due_date_column_id, settings.monday_client_files_column_id].filter(
          Boolean
        )
      });

      logEvent('requests:list', 'Monday groups fetched', {
        user: targetUserId,
        groupCount: groups.length,
        groupIds: groups.map((g) => ({ id: g.id, title: g.title, itemCount: g.items?.length || 0 }))
      });

      const tasks = [];
      groups.forEach((g) => {
        (g.items || []).forEach((item) => {
          const cols = item.column_values || [];
          const col = (id) => cols.find((c) => c.id === id);
          const due = settings.monday_due_date_column_id ? col(settings.monday_due_date_column_id) : null;
          const status = settings.monday_status_column_id ? col(settings.monday_status_column_id) : null;
          const filesCol = settings.monday_client_files_column_id ? col(settings.monday_client_files_column_id) : null;
          tasks.push({
            id: item.id,
            name: item.name,
            group: g.title,
            group_id: g.id,
            status: status?.text || '',
            due_date: due?.text || '',
            files: filesCol?.value ? JSON.parse(filesCol.value || '[]')?.files || [] : []
          });
        });
      });

      logEvent('requests:list', 'Tasks processed', {
        user: targetUserId,
        totalTasks: tasks.length,
        byGroup: tasks.reduce((acc, t) => {
          acc[t.group_id] = (acc[t.group_id] || 0) + 1;
          return acc;
        }, {})
      });

      return res.json({
        requests: local,
        tasks,
        group_meta: {
          active_group_id: profile.monday_active_group_id || null,
          completed_group_id: profile.monday_completed_group_id || null
        }
      });
    }

    logEvent('requests:list', 'Monday integration not configured', {
      user: targetUserId,
      reason: !hasMondayToken ? 'No Monday token' : 'No board ID configured'
    });

    res.json({
      requests: local,
      tasks: [],
      group_meta: {
        active_group_id: profile.monday_active_group_id || null,
        completed_group_id: profile.monday_completed_group_id || null
      }
    });
  } catch (err) {
    console.error('[requests:list]', err);
    logEvent('requests:list', 'Error fetching requests', { error: err.message, stack: err.stack });
    res.status(500).json({ message: 'Unable to fetch requests' });
  }
});

// GET /calls - Returns cached calls immediately. Use ?sync=true or POST /calls/sync to fetch from CTM.
router.get('/calls', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const shouldSync = req.query.sync === 'true';

  // Search, filter, and pagination params
  const search = req.query.search?.trim() || '';
  const callerType = req.query.caller_type || '';
  const category = req.query.category || '';
  const dateFrom = req.query.date_from || '';
  const dateTo = req.query.date_to || '';
  const sortBy = req.query.sort_by || 'started_at';
  const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  // Build dynamic query with filters
  const conditions = ['(owner_user_id = $1 OR user_id = $1)'];
  const params = [targetUserId];
  let paramIndex = 2;

  if (search) {
    conditions.push(`(
      from_number ILIKE $${paramIndex} OR
      meta->>'caller_name' ILIKE $${paramIndex} OR
      meta->>'classification_summary' ILIKE $${paramIndex} OR
      meta->>'source' ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (callerType && ['new', 'repeat', 'returning_customer'].includes(callerType)) {
    conditions.push(`caller_type = $${paramIndex}`);
    params.push(callerType);
    paramIndex++;
  }

  if (category) {
    conditions.push(`meta->>'category' = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (dateFrom) {
    conditions.push(`started_at >= $${paramIndex}`);
    params.push(new Date(dateFrom));
    paramIndex++;
  }

  if (dateTo) {
    conditions.push(`started_at <= $${paramIndex}`);
    params.push(new Date(dateTo));
    paramIndex++;
  }

  // Allowed sort columns to prevent SQL injection
  const allowedSortColumns = ['started_at', 'score', 'duration_sec', 'from_number'];
  const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : 'started_at';

  // Count total for pagination metadata
  const countQuery = `SELECT COUNT(*) as total FROM call_logs WHERE ${conditions.join(' AND ')}`;
  const countResult = await query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || 0, 10);

  // Main query with pagination
  const mainQuery = `
    SELECT * FROM call_logs 
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${safeSort} ${sortOrder} NULLS LAST
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(limit, offset);

  const cached = await query(mainQuery, params);
  const cachedRows = cached.rows;
  let cachedCalls = buildCallsFromCache(cachedRows);
  cachedCalls = await attachJourneyMetaToCalls(targetUserId, cachedCalls);

  // Pagination metadata
  const pagination = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total
  };

  // If sync not requested, return cache immediately
  if (!shouldSync) {
    return res.json({ calls: cachedCalls, cached: true, pagination });
  }

  // Sync requested - fetch from CTM with incremental sync
  const profileRes = await query(
    'SELECT ctm_account_number, ctm_api_key, ctm_api_secret, ai_prompt, auto_star_enabled, ctm_sync_cursor FROM client_profiles WHERE user_id=$1 LIMIT 1',
    [targetUserId]
  );
  const profile = profileRes.rows[0] || {};
  const credentials = {
    accountId: profile.ctm_account_number,
    apiKey: profile.ctm_api_key,
    apiSecret: profile.ctm_api_secret
  };

  if (!credentials.accountId || !credentials.apiKey || !credentials.apiSecret) {
    logEvent('calls:list', 'CTM credentials missing for client', { userId: targetUserId });
    return res.json({ calls: cachedCalls, cached: true, message: 'CTM credentials not configured.' });
  }

  try {
    logEvent('calls:sync', 'Syncing calls from CTM', { userId: targetUserId, cursor: profile.ctm_sync_cursor });

    const { results: freshCalls, syncMeta } = await pullCallsFromCtm({
      credentials,
      prompt: profile.ai_prompt || DEFAULT_AI_PROMPT,
      existingRows: cachedRows,
      autoStarEnabled: profile.auto_star_enabled || false,
      syncRatings: true,
      sinceTimestamp: profile.ctm_sync_cursor || null
    });

    if (freshCalls.length) {
      // Save new/updated calls to database with caller enrichment
      await Promise.all(
        freshCalls.map(async ({ call, meta }) => {
          const startedAt = call.started_at ? new Date(call.started_at) : null;

          // Enrich caller type
          const enrichment = await enrichCallerType(query, targetUserId, call.caller_number, call.id);

          return query(
            `INSERT INTO call_logs (owner_user_id, user_id, call_id, direction, from_number, to_number, started_at, duration_sec, score, meta, caller_type, active_client_id, call_sequence)
             VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (call_id) DO UPDATE SET
               direction=EXCLUDED.direction,
               from_number=EXCLUDED.from_number,
               to_number=EXCLUDED.to_number,
               started_at=EXCLUDED.started_at,
               duration_sec=EXCLUDED.duration_sec,
               score=EXCLUDED.score,
               meta=EXCLUDED.meta,
               caller_type=EXCLUDED.caller_type,
               active_client_id=EXCLUDED.active_client_id,
               call_sequence=EXCLUDED.call_sequence`,
            [
              targetUserId,
              call.id,
              call.direction || null,
              call.caller_number || null,
              call.to_number || null,
              startedAt,
              call.duration_sec || null,
              call.score || 0,
              JSON.stringify({ ...meta, ...enrichment }),
              enrichment.callerType || 'new',
              enrichment.activeClientId || null,
              enrichment.callSequence || 1
            ]
          );
        })
      );

      // Update sync cursor
      if (syncMeta.latestTimestamp) {
        await query('UPDATE client_profiles SET ctm_sync_cursor=$1 WHERE user_id=$2', [new Date(syncMeta.latestTimestamp), targetUserId]);
      }

      // Post auto-starred scores back to CTM
      const autoStarredCalls = freshCalls.filter(({ shouldPostScore }) => shouldPostScore);
      if (autoStarredCalls.length > 0) {
        logEvent('calls:auto-star', `Auto-starring ${autoStarredCalls.length} call(s)`, { userId: targetUserId });
        await Promise.all(
          autoStarredCalls.map(async ({ call }) => {
            try {
              await postSaleToCTM(credentials, call.id, { score: call.score, conversion: 1, value: 0 });
            } catch (err) {
              console.error('[calls:auto-star] Failed to post score to CTM', { callId: call.id, error: err.message });
            }
          })
        );
      }

      // Send notifications for voicemails needing attention
      const attentionCalls = freshCalls.filter((item) => item.notifyNeedsAttention);
      if (attentionCalls.length) {
        await Promise.all(
          attentionCalls.map(({ call }) =>
            createNotification({
              userId: targetUserId,
              title: 'Voicemail needs attention',
              body: `${call.caller_name || call.caller_number || 'A caller'} left a voicemail. Summary: ${
                call.classification_summary || 'Review the voicemail details.'
              }`,
              linkUrl: '/portal?tab=leads',
              meta: { call_id: call.id, caller_name: call.caller_name, caller_number: call.caller_number, category: call.category }
            })
          )
        );
      }
    }

    // Return refreshed data from database (re-run with same filters/pagination)
    const refreshedCount = await query(countQuery, params.slice(0, paramIndex - 2));
    const refreshedTotal = parseInt(refreshedCount.rows[0]?.total || 0, 10);
    const refreshed = await query(mainQuery, params);
    let shaped = buildCallsFromCache(refreshed.rows);
    shaped = await attachJourneyMetaToCalls(targetUserId, shaped);

    const refreshedPagination = {
      page,
      limit,
      total: refreshedTotal,
      totalPages: Math.ceil(refreshedTotal / limit),
      hasMore: page * limit < refreshedTotal
    };

    return res.json({
      calls: shaped,
      synced: true,
      newCalls: freshCalls.length,
      pagination: refreshedPagination,
      syncMeta: {
        pagesProcessed: syncMeta.pagesProcessed,
        totalFetched: syncMeta.totalFetched
      }
    });
  } catch (err) {
    console.error('[calls:sync]', err);
    return res.json({ calls: cachedCalls, cached: true, stale: true, pagination, message: 'Sync failed. Showing cached data.' });
  }
});

// POST /calls/sync - Explicitly sync with CTM (for background refresh)
router.post('/calls/sync', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const fullSync = req.body.fullSync === true;

  const profileRes = await query(
    'SELECT ctm_account_number, ctm_api_key, ctm_api_secret, ai_prompt, auto_star_enabled, ctm_sync_cursor FROM client_profiles WHERE user_id=$1 LIMIT 1',
    [targetUserId]
  );
  const profile = profileRes.rows[0] || {};
  const credentials = {
    accountId: profile.ctm_account_number,
    apiKey: profile.ctm_api_key,
    apiSecret: profile.ctm_api_secret
  };

  if (!credentials.accountId || !credentials.apiKey || !credentials.apiSecret) {
    return res.status(400).json({ message: 'CTM credentials not configured.' });
  }

  const cached = await query('SELECT * FROM call_logs WHERE owner_user_id=$1 OR user_id=$1 ORDER BY started_at DESC NULLS LAST', [
    targetUserId
  ]);

  try {
    logEvent('calls:sync', fullSync ? 'Full sync with CTM' : 'Incremental sync with CTM', {
      userId: targetUserId,
      cursor: profile.ctm_sync_cursor
    });

    const { results: freshCalls, syncMeta } = await pullCallsFromCtm({
      credentials,
      prompt: profile.ai_prompt || DEFAULT_AI_PROMPT,
      existingRows: cached.rows,
      autoStarEnabled: profile.auto_star_enabled || false,
      syncRatings: true,
      sinceTimestamp: fullSync ? null : profile.ctm_sync_cursor || null,
      fullSync
    });

    let updatedCount = 0;
    let newCount = 0;

    if (freshCalls.length) {
      await Promise.all(
        freshCalls.map(async ({ call, meta, isRatingUpdate }) => {
          const startedAt = call.started_at ? new Date(call.started_at) : null;

          // Enrich caller type
          const enrichment = await enrichCallerType(query, targetUserId, call.caller_number, call.id);

          const result = await query(
            `INSERT INTO call_logs (owner_user_id, user_id, call_id, direction, from_number, to_number, started_at, duration_sec, score, meta, caller_type, active_client_id, call_sequence)
             VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (call_id) DO UPDATE SET
               direction=EXCLUDED.direction,
               from_number=EXCLUDED.from_number,
               to_number=EXCLUDED.to_number,
               started_at=EXCLUDED.started_at,
               duration_sec=EXCLUDED.duration_sec,
               score=EXCLUDED.score,
               meta=EXCLUDED.meta,
               caller_type=EXCLUDED.caller_type,
               active_client_id=EXCLUDED.active_client_id,
               call_sequence=EXCLUDED.call_sequence
             RETURNING (xmax = 0) AS inserted`,
            [
              targetUserId,
              call.id,
              call.direction || null,
              call.caller_number || null,
              call.to_number || null,
              startedAt,
              call.duration_sec || null,
              call.score || 0,
              JSON.stringify({ ...meta, ...enrichment }),
              enrichment.callerType || 'new',
              enrichment.activeClientId || null,
              enrichment.callSequence || 1
            ]
          );
          if (result.rows[0]?.inserted) newCount++;
          else updatedCount++;
        })
      );

      // Update sync cursor
      if (syncMeta.latestTimestamp) {
        await query('UPDATE client_profiles SET ctm_sync_cursor=$1 WHERE user_id=$2', [new Date(syncMeta.latestTimestamp), targetUserId]);
      }

      // Auto-star new calls
      const autoStarredCalls = freshCalls.filter(({ shouldPostScore }) => shouldPostScore);
      if (autoStarredCalls.length > 0) {
        await Promise.all(
          autoStarredCalls.map(async ({ call }) => {
            try {
              await postSaleToCTM(credentials, call.id, { score: call.score, conversion: 1, value: 0 });
            } catch (err) {
              console.error('[calls:auto-star]', err.message);
            }
          })
        );
      }
    }

    // Return updated data
    const refreshed = await query('SELECT * FROM call_logs WHERE owner_user_id=$1 OR user_id=$1 ORDER BY started_at DESC NULLS LAST', [
      targetUserId
    ]);
    let shaped = buildCallsFromCache(refreshed.rows);
    shaped = await attachJourneyMetaToCalls(targetUserId, shaped);

    return res.json({
      calls: shaped,
      synced: true,
      newCalls: newCount,
      updatedCalls: updatedCount,
      syncMeta: {
        pagesProcessed: syncMeta.pagesProcessed,
        totalFetched: syncMeta.totalFetched,
        fullSync
      },
      message: newCount || updatedCount ? `Synced ${newCount} new, ${updatedCount} updated` : 'Already up to date'
    });
  } catch (err) {
    console.error('[calls:sync]', err);
    return res.status(500).json({ message: 'Sync failed: ' + (err.message || 'Unknown error') });
  }
});

// POST /calls/full-sync - Force full historical sync (admin-only for initial setup)
router.post('/calls/full-sync', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;

  // Only allow admins/super-admins or the user themselves
  if (!req.user.role || !['admin', 'super_admin'].includes(req.user.role)) {
    if (req.portalUserId && req.portalUserId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized: Full sync requires admin privileges.' });
    }
  }

  const profileRes = await query(
    'SELECT ctm_account_number, ctm_api_key, ctm_api_secret, ai_prompt, auto_star_enabled FROM client_profiles WHERE user_id=$1 LIMIT 1',
    [targetUserId]
  );
  const profile = profileRes.rows[0] || {};
  const credentials = {
    accountId: profile.ctm_account_number,
    apiKey: profile.ctm_api_key,
    apiSecret: profile.ctm_api_secret
  };

  if (!credentials.accountId || !credentials.apiKey || !credentials.apiSecret) {
    return res.status(400).json({ message: 'CTM credentials not configured.' });
  }

  // Reset sync cursor for full re-sync
  await query('UPDATE client_profiles SET ctm_sync_cursor=NULL WHERE user_id=$1', [targetUserId]);

  const cached = await query('SELECT * FROM call_logs WHERE owner_user_id=$1 OR user_id=$1 ORDER BY started_at DESC NULLS LAST', [
    targetUserId
  ]);

  try {
    logEvent('calls:full-sync', 'Starting full historical sync with CTM', { userId: targetUserId });

    const { results: freshCalls, syncMeta } = await pullCallsFromCtm({
      credentials,
      prompt: profile.ai_prompt || DEFAULT_AI_PROMPT,
      existingRows: cached.rows,
      autoStarEnabled: profile.auto_star_enabled || false,
      syncRatings: true,
      fullSync: true
    });

    let updatedCount = 0;
    let newCount = 0;

    if (freshCalls.length) {
      await Promise.all(
        freshCalls.map(async ({ call, meta }) => {
          const startedAt = call.started_at ? new Date(call.started_at) : null;

          // Enrich caller type
          const enrichment = await enrichCallerType(query, targetUserId, call.caller_number, call.id);

          const result = await query(
            `INSERT INTO call_logs (owner_user_id, user_id, call_id, direction, from_number, to_number, started_at, duration_sec, score, meta, caller_type, active_client_id, call_sequence)
             VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (call_id) DO UPDATE SET
               direction=EXCLUDED.direction,
               from_number=EXCLUDED.from_number,
               to_number=EXCLUDED.to_number,
               started_at=EXCLUDED.started_at,
               duration_sec=EXCLUDED.duration_sec,
               score=EXCLUDED.score,
               meta=EXCLUDED.meta,
               caller_type=EXCLUDED.caller_type,
               active_client_id=EXCLUDED.active_client_id,
               call_sequence=EXCLUDED.call_sequence
             RETURNING (xmax = 0) AS inserted`,
            [
              targetUserId,
              call.id,
              call.direction || null,
              call.caller_number || null,
              call.to_number || null,
              startedAt,
              call.duration_sec || null,
              call.score || 0,
              JSON.stringify({ ...meta, ...enrichment }),
              enrichment.callerType || 'new',
              enrichment.activeClientId || null,
              enrichment.callSequence || 1
            ]
          );
          if (result.rows[0]?.inserted) newCount++;
          else updatedCount++;
        })
      );

      // Update sync cursor
      if (syncMeta.latestTimestamp) {
        await query('UPDATE client_profiles SET ctm_sync_cursor=$1 WHERE user_id=$2', [new Date(syncMeta.latestTimestamp), targetUserId]);
      }
    }

    logEvent('calls:full-sync', 'Full sync completed', {
      userId: targetUserId,
      newCalls: newCount,
      updatedCalls: updatedCount,
      pagesProcessed: syncMeta.pagesProcessed
    });

    return res.json({
      success: true,
      newCalls: newCount,
      updatedCalls: updatedCount,
      syncMeta: {
        pagesProcessed: syncMeta.pagesProcessed,
        totalFetched: syncMeta.totalFetched,
        startDate: syncMeta.startDate,
        endDate: syncMeta.endDate
      },
      message: `Full sync complete: ${newCount} new, ${updatedCount} updated calls`
    });
  } catch (err) {
    console.error('[calls:full-sync]', err);
    return res.status(500).json({ message: 'Full sync failed: ' + (err.message || 'Unknown error') });
  }
});

router.post('/calls/:id/score', async (req, res) => {
  const score = Number(req.body.score);
  const targetUserId = req.portalUserId || req.user.id;
  const callId = req.params.id;

  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ message: 'Invalid score. Must be between 1 and 5.' });
  }

  try {
    // Save score locally
    await query('UPDATE call_logs SET score=$1 WHERE call_id=$2 AND user_id=$3', [score, callId, targetUserId]);
    logEvent('calls:score', 'Score saved locally', { user: targetUserId, callId, score });

    // Get CTM credentials to post back to CallTrackingMetrics
    const profileRes = await query('SELECT ctm_account_number, ctm_api_key, ctm_api_secret FROM client_profiles WHERE user_id=$1 LIMIT 1', [
      targetUserId
    ]);
    const profile = profileRes.rows[0] || {};
    const credentials = {
      accountId: profile.ctm_account_number,
      apiKey: profile.ctm_api_key,
      apiSecret: profile.ctm_api_secret
    };

    // Post score to CTM if credentials are configured
    if (credentials.accountId && credentials.apiKey && credentials.apiSecret) {
      try {
        const ctmResponse = await postSaleToCTM(credentials, callId, {
          score,
          conversion: 1,
          value: 0
        });
        logEvent('calls:score', 'Score posted to CTM', { user: targetUserId, callId, score, ctmResponse });
        res.json({ message: 'Score saved and synced to CallTrackingMetrics', rating: score });
      } catch (ctmErr) {
        logEvent('calls:score', 'CTM sync failed', { user: targetUserId, callId, error: ctmErr.message });
        // Don't fail the request if CTM sync fails - score is still saved locally
        res.json({
          message: 'Score saved locally. Warning: Could not sync to CallTrackingMetrics.',
          rating: score,
          warning: ctmErr.message
        });
      }
    } else {
      logEvent('calls:score', 'CTM credentials not configured', { user: targetUserId, callId });
      res.json({ message: 'Score saved (CallTrackingMetrics not configured)', rating: score });
    }
  } catch (err) {
    console.error('[calls:score]', err);
    logEvent('calls:score', 'Failed to save score', { user: targetUserId, callId, error: err.message });
    res.status(500).json({ message: 'Unable to save score' });
  }
});

router.delete('/calls/:id/score', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const callId = req.params.id;

  try {
    // Clear score locally
    await query('UPDATE call_logs SET score=NULL WHERE call_id=$1 AND user_id=$2', [callId, targetUserId]);
    logEvent('calls:score', 'Score cleared locally', { user: targetUserId, callId });

    // Get CTM credentials to clear score in CallTrackingMetrics
    const profileRes = await query('SELECT ctm_account_number, ctm_api_key, ctm_api_secret FROM client_profiles WHERE user_id=$1 LIMIT 1', [
      targetUserId
    ]);
    const profile = profileRes.rows[0] || {};
    const credentials = {
      accountId: profile.ctm_account_number,
      apiKey: profile.ctm_api_key,
      apiSecret: profile.ctm_api_secret
    };

    // Clear score in CTM if credentials are configured
    if (credentials.accountId && credentials.apiKey && credentials.apiSecret) {
      try {
        const ctmResponse = await postSaleToCTM(credentials, callId, {
          score: 0,
          conversion: 0,
          value: 0
        });
        logEvent('calls:score', 'Score cleared in CTM', { user: targetUserId, callId, ctmResponse });
        res.json({ message: 'Score cleared and synced to CallTrackingMetrics' });
      } catch (ctmErr) {
        logEvent('calls:score', 'CTM clear failed', { user: targetUserId, callId, error: ctmErr.message });
        // Don't fail the request if CTM sync fails - score is still cleared locally
        res.json({
          message: 'Score cleared locally. Warning: Could not sync to CallTrackingMetrics.',
          warning: ctmErr.message
        });
      }
    } else {
      logEvent('calls:score', 'CTM credentials not configured for clear', { user: targetUserId, callId });
      res.json({ message: 'Score cleared (CallTrackingMetrics not configured)' });
    }
  } catch (err) {
    console.error('[calls:score:clear]', err);
    logEvent('calls:score', 'Failed to clear score', { user: targetUserId, callId, error: err.message });
    res.status(500).json({ message: 'Unable to clear score' });
  }
});

// POST /clients/:id/reclassify-leads - Re-run AI classification against cached call transcripts/messages
// Admin/editor only. Does NOT pull CTM again; only updates call_logs.meta.
router.post('/clients/:id/reclassify-leads', isAdminOrEditor, async (req, res) => {
  const clientId = req.params.id;
  const { limit = 200, force = true } = req.body || {};

  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 200));
  const forceAll = force === true;

  try {
    const profileRes = await query('SELECT ai_prompt FROM client_profiles WHERE user_id=$1 LIMIT 1', [clientId]);
    const prompt = profileRes.rows[0]?.ai_prompt || DEFAULT_AI_PROMPT;

    // Pull the most recent calls for this client.
    const { rows } = await query(
      `SELECT call_id, score, meta
       FROM call_logs
       WHERE (owner_user_id=$1 OR user_id=$1)
       ORDER BY started_at DESC NULLS LAST
       LIMIT $2`,
      [clientId, safeLimit]
    );

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      const callId = row.call_id;
      const meta = row.meta || {};

      const hasExisting =
        Boolean(meta?.category) && typeof meta?.classification_summary === 'string' && meta.classification_summary.trim().length > 0;
      if (!forceAll && hasExisting) {
        skipped += 1;
        continue;
      }

      const transcript = meta?.transcript || meta?.transcription_text || meta?.transcription?.text || meta?.transcript_text || '';
      const message = meta?.message || meta?.notes || '';

      // If we have no content, skip rather than writing empty summaries.
      if (!String(transcript || message).trim()) {
        skipped += 1;
        continue;
      }

      try {
        const ai = await classifyContent(prompt, transcript, message);

        // Preserve CTM score-derived category if there is a rating
        const score = Number(row.score || 0);
        const ratingCategory = score > 0 ? getCategoryFromRating(score) : null;
        const finalCategory = ratingCategory || ai.category || ai.classification || 'unreviewed';

        const nextMeta = {
          ...meta,
          category: finalCategory,
          classification: ai.classification || meta.classification,
          classification_summary: ai.summary || meta.classification_summary,
          reclassified_at: new Date().toISOString()
        };

        await query(
          `UPDATE call_logs
           SET meta=$1::jsonb
           WHERE call_id=$2 AND (owner_user_id=$3 OR user_id=$3)`,
          [JSON.stringify(nextMeta), callId, clientId]
        );
        updated += 1;
      } catch (err) {
        errors += 1;
        console.error('[calls:reclassify] error', { callId, err: err.message });
      }
    }

    res.json({
      message: 'Reclassification completed',
      updated,
      skipped,
      errors,
      scanned: rows.length,
      limit: safeLimit,
      forced: forceAll
    });
  } catch (err) {
    console.error('[calls:reclassify]', err);
    res.status(500).json({ message: 'Reclassification failed: ' + (err.message || 'Unknown error') });
  }
});

router.post('/calls/reset-cache', requireAdmin, async (_req, res) => {
  res.json({ message: 'Call cache reset (noop stub)' });
});

// POST /calls/:id/link-client - Link a call to an existing active client
router.post('/calls/:id/link-client', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const callId = req.params.id;
  const { activeClientId } = req.body;

  if (!activeClientId) {
    return res.status(400).json({ message: 'activeClientId is required' });
  }

  try {
    // Verify the active client exists and belongs to the user
    const clientRes = await query('SELECT id, client_name FROM active_clients WHERE id=$1 AND owner_user_id=$2', [
      activeClientId,
      targetUserId
    ]);

    if (!clientRes.rows.length) {
      return res.status(404).json({ message: 'Active client not found' });
    }

    const client = clientRes.rows[0];

    // Update the call log with the active client link
    await query(
      `UPDATE call_logs 
       SET active_client_id=$1, caller_type='returning_customer', 
           meta = meta || $2::jsonb
       WHERE call_id=$3 AND (owner_user_id=$4 OR user_id=$4)`,
      [activeClientId, JSON.stringify({ activeClient: { id: client.id, client_name: client.client_name } }), callId, targetUserId]
    );

    logEvent('calls:link-client', 'Call linked to active client', { callId, activeClientId, userId: targetUserId });

    res.json({
      message: `Call linked to ${client.client_name}`,
      activeClient: client
    });
  } catch (err) {
    console.error('[calls:link-client]', err);
    res.status(500).json({ message: 'Failed to link call to client' });
  }
});

// DELETE /calls/:id/link-client - Unlink a call from active client
router.delete('/calls/:id/link-client', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const callId = req.params.id;

  try {
    // Re-enrich caller type (might still be a repeat caller)
    const callRes = await query('SELECT from_number FROM call_logs WHERE call_id=$1 AND (owner_user_id=$2 OR user_id=$2)', [
      callId,
      targetUserId
    ]);

    if (!callRes.rows.length) {
      return res.status(404).json({ message: 'Call not found' });
    }

    const phoneNumber = callRes.rows[0].from_number;
    const enrichment = await enrichCallerType(query, targetUserId, phoneNumber, callId);

    // If they were linked to a client but now unlinked, check if still a repeat caller
    const newCallerType = enrichment.callSequence > 1 ? 'repeat' : 'new';

    await query(
      `UPDATE call_logs 
       SET active_client_id=NULL, caller_type=$1,
           meta = meta - 'activeClient'
       WHERE call_id=$2 AND (owner_user_id=$3 OR user_id=$3)`,
      [newCallerType, callId, targetUserId]
    );

    logEvent('calls:unlink-client', 'Call unlinked from active client', { callId, userId: targetUserId });

    res.json({ message: 'Call unlinked from client', callerType: newCallerType });
  } catch (err) {
    console.error('[calls:unlink-client]', err);
    res.status(500).json({ message: 'Failed to unlink call from client' });
  }
});

// GET /calls/:id/history - Get call history for a phone number
router.get('/calls/:id/history', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const callId = req.params.id;

  try {
    // Get the call to find the phone number
    const callRes = await query('SELECT from_number FROM call_logs WHERE call_id=$1 AND (owner_user_id=$2 OR user_id=$2)', [
      callId,
      targetUserId
    ]);

    if (!callRes.rows.length) {
      return res.status(404).json({ message: 'Call not found' });
    }

    const phoneNumber = callRes.rows[0].from_number;
    if (!phoneNumber) {
      return res.json({ calls: [], message: 'No phone number recorded' });
    }

    // Get all calls from this phone number
    const normalized = normalizePhoneNumber(phoneNumber);
    const historyRes = await query(
      `SELECT call_id, started_at, duration_sec, score, caller_type, 
              meta->>'classification' as classification,
              meta->>'classification_summary' as summary,
              meta->>'category' as category
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1)
         AND from_number IS NOT NULL 
         AND REGEXP_REPLACE(from_number, '[^0-9]', '', 'g') = REGEXP_REPLACE($2, '[^0-9]', '', 'g')
       ORDER BY started_at DESC
       LIMIT 50`,
      [targetUserId, normalized]
    );

    res.json({
      calls: historyRes.rows,
      phoneNumber,
      totalCalls: historyRes.rows.length
    });
  } catch (err) {
    console.error('[calls:history]', err);
    res.status(500).json({ message: 'Failed to fetch call history' });
  }
});

// GET /calls/:id/detail - Full lead detail with all related data
router.get('/calls/:id/detail', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const callId = req.params.id;

  try {
    // Get the full call record
    const callRes = await query(`SELECT * FROM call_logs WHERE call_id=$1 AND (owner_user_id=$2 OR user_id=$2)`, [callId, targetUserId]);

    if (!callRes.rows.length) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const row = callRes.rows[0];
    const call = buildCallsFromCache([row])[0];

    // Get call history for this phone number
    let callHistory = [];
    if (row.from_number) {
      const normalized = normalizePhoneNumber(row.from_number);
      const historyRes = await query(
        `SELECT call_id, started_at, duration_sec, score, caller_type,
                meta->>'category' as category,
                meta->>'classification_summary' as summary
         FROM call_logs 
         WHERE (owner_user_id=$1 OR user_id=$1)
           AND from_number IS NOT NULL 
           AND REGEXP_REPLACE(from_number, '[^0-9]', '', 'g') = REGEXP_REPLACE($2, '[^0-9]', '', 'g')
           AND call_id != $3
         ORDER BY started_at DESC
         LIMIT 20`,
        [targetUserId, normalized, callId]
      );
      callHistory = historyRes.rows;
    }

    // Get associated journey if any
    let journey = null;
    const journeyRes = await query(
      `SELECT cj.*, s.name as service_name
       FROM client_journeys cj
       LEFT JOIN services s ON cj.service_id = s.id
       WHERE cj.owner_user_id = $1 AND cj.lead_call_key = $2
       LIMIT 1`,
      [targetUserId, callId]
    );
    if (journeyRes.rows.length) {
      journey = journeyRes.rows[0];
      // Get journey steps
      const stepsRes = await query(`SELECT * FROM client_journey_steps WHERE journey_id = $1 ORDER BY position ASC`, [journey.id]);
      journey.steps = stepsRes.rows;
    }

    // Get linked active client if any
    let activeClient = null;
    if (row.active_client_id) {
      const clientRes = await query(
        `SELECT ac.*, 
                (SELECT json_agg(cs.*) FROM client_services cs WHERE cs.active_client_id = ac.id) as services
         FROM active_clients ac
         WHERE ac.id = $1`,
        [row.active_client_id]
      );
      if (clientRes.rows.length) {
        activeClient = clientRes.rows[0];
      }
    }

    res.json({
      lead: call,
      callHistory,
      journey,
      activeClient
    });
  } catch (err) {
    console.error('[calls:detail]', err);
    res.status(500).json({ message: 'Failed to fetch lead detail' });
  }
});

// GET /calls/stats - Lead statistics for dashboard
router.get('/calls/stats', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Total leads in period
    const totalRes = await query(
      `SELECT COUNT(*) as total FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= $2`,
      [targetUserId, startDate]
    );

    // Leads by category
    const categoryRes = await query(
      `SELECT meta->>'category' as category, COUNT(*) as count
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= $2
       GROUP BY meta->>'category'
       ORDER BY count DESC`,
      [targetUserId, startDate]
    );

    // Leads by caller type
    const callerTypeRes = await query(
      `SELECT caller_type, COUNT(*) as count
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= $2
       GROUP BY caller_type`,
      [targetUserId, startDate]
    );

    // Leads by source
    const sourceRes = await query(
      `SELECT meta->>'source' as source, COUNT(*) as count
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= $2
       GROUP BY meta->>'source'
       ORDER BY count DESC
       LIMIT 10`,
      [targetUserId, startDate]
    );

    // Conversion rate (leads with active_client_id / total)
    const convertedRes = await query(
      `SELECT COUNT(*) as converted FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= $2 AND active_client_id IS NOT NULL`,
      [targetUserId, startDate]
    );

    // Daily volume (last 14 days)
    const volumeRes = await query(
      `SELECT DATE(started_at) as date, COUNT(*) as count
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= NOW() - INTERVAL '14 days'
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [targetUserId]
    );

    // Average rating
    const ratingRes = await query(
      `SELECT AVG(score) as avg_rating, COUNT(*) as rated_count
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) AND started_at >= $2 AND score > 0`,
      [targetUserId, startDate]
    );

    // Needs attention count
    const attentionRes = await query(
      `SELECT COUNT(*) as count FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1) 
         AND started_at >= $2 
         AND meta->>'category' = 'needs_attention'`,
      [targetUserId, startDate]
    );

    const total = parseInt(totalRes.rows[0]?.total || 0, 10);
    const converted = parseInt(convertedRes.rows[0]?.converted || 0, 10);

    res.json({
      period: { days, startDate: startDate.toISOString() },
      total,
      converted,
      conversionRate: total > 0 ? ((converted / total) * 100).toFixed(1) : 0,
      needsAttention: parseInt(attentionRes.rows[0]?.count || 0, 10),
      averageRating: parseFloat(ratingRes.rows[0]?.avg_rating || 0).toFixed(1),
      ratedCount: parseInt(ratingRes.rows[0]?.rated_count || 0, 10),
      byCategory: categoryRes.rows.reduce((acc, row) => {
        acc[row.category || 'unreviewed'] = parseInt(row.count, 10);
        return acc;
      }, {}),
      byCallerType: callerTypeRes.rows.reduce((acc, row) => {
        acc[row.caller_type || 'new'] = parseInt(row.count, 10);
        return acc;
      }, {}),
      bySource: sourceRes.rows.map((row) => ({
        source: row.source || 'Unknown',
        count: parseInt(row.count, 10)
      })),
      dailyVolume: volumeRes.rows.map((row) => ({
        date: row.date,
        count: parseInt(row.count, 10)
      }))
    });
  } catch (err) {
    console.error('[calls:stats]', err);
    res.status(500).json({ message: 'Failed to fetch lead statistics' });
  }
});

// GET /calls/export - Export leads to CSV
router.get('/calls/export', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;

  try {
    const callsRes = await query(
      `SELECT 
        call_id,
        from_number,
        to_number,
        direction,
        started_at,
        duration_sec,
        score,
        caller_type,
        meta->>'caller_name' as caller_name,
        meta->>'source' as source,
        meta->>'category' as category,
        meta->>'classification' as classification,
        meta->>'classification_summary' as summary,
        meta->>'region' as region
       FROM call_logs 
       WHERE (owner_user_id=$1 OR user_id=$1)
       ORDER BY started_at DESC`,
      [targetUserId]
    );

    // Build CSV
    const headers = [
      'Call ID',
      'Caller Name',
      'Phone',
      'Direction',
      'Date',
      'Duration (sec)',
      'Rating',
      'Type',
      'Source',
      'Category',
      'Classification',
      'Summary',
      'Region'
    ];
    const rows = callsRes.rows.map((row) => [
      row.call_id,
      row.caller_name || '',
      row.from_number || '',
      row.direction || '',
      row.started_at ? new Date(row.started_at).toISOString() : '',
      row.duration_sec || 0,
      row.score || '',
      row.caller_type || 'new',
      row.source || '',
      row.category || 'unreviewed',
      row.classification || '',
      (row.summary || '').replace(/"/g, '""'),
      row.region || ''
    ]);

    const escapeCsv = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[calls:export]', err);
    res.status(500).json({ message: 'Failed to export leads' });
  }
});

// =====================
// PIPELINE STAGES
// =====================

// GET /pipeline-stages - List all pipeline stages
router.get('/pipeline-stages', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  try {
    const result = await query('SELECT * FROM lead_pipeline_stages WHERE owner_user_id = $1 ORDER BY position ASC', [targetUserId]);

    // If no stages exist, create default ones
    if (result.rows.length === 0) {
      const defaultStages = [
        { name: 'New Lead', color: '#6366f1', position: 0 },
        { name: 'Contacted', color: '#3b82f6', position: 1 },
        { name: 'Qualified', color: '#10b981', position: 2 },
        { name: 'Proposal Sent', color: '#f59e0b', position: 3 },
        { name: 'Won', color: '#22c55e', position: 4, is_won_stage: true },
        { name: 'Lost', color: '#ef4444', position: 5, is_lost_stage: true }
      ];

      for (const stage of defaultStages) {
        await query(
          `INSERT INTO lead_pipeline_stages (owner_user_id, name, color, position, is_won_stage, is_lost_stage)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [targetUserId, stage.name, stage.color, stage.position, stage.is_won_stage || false, stage.is_lost_stage || false]
        );
      }

      const newResult = await query('SELECT * FROM lead_pipeline_stages WHERE owner_user_id = $1 ORDER BY position ASC', [targetUserId]);
      return res.json({ stages: newResult.rows });
    }

    res.json({ stages: result.rows });
  } catch (err) {
    console.error('[pipeline-stages:list]', err);
    res.status(500).json({ message: 'Failed to fetch pipeline stages' });
  }
});

// POST /pipeline-stages - Create a new pipeline stage
router.post('/pipeline-stages', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { name, color, position, is_won_stage, is_lost_stage } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Stage name is required' });
  }

  try {
    // Get max position if not provided
    let pos = position;
    if (pos === undefined || pos === null) {
      const maxRes = await query('SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM lead_pipeline_stages WHERE owner_user_id = $1', [
        targetUserId
      ]);
      pos = maxRes.rows[0]?.next_pos || 0;
    }

    const result = await query(
      `INSERT INTO lead_pipeline_stages (owner_user_id, name, color, position, is_won_stage, is_lost_stage)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [targetUserId, name.trim(), color || '#6366f1', pos, is_won_stage || false, is_lost_stage || false]
    );

    res.json({ stage: result.rows[0] });
  } catch (err) {
    console.error('[pipeline-stages:create]', err);
    res.status(500).json({ message: 'Failed to create pipeline stage' });
  }
});

// PUT /pipeline-stages/:id - Update a pipeline stage
router.put('/pipeline-stages/:id', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id } = req.params;
  const { name, color, position, is_won_stage, is_lost_stage } = req.body;

  try {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }
    if (color !== undefined) {
      fields.push(`color = $${paramIndex++}`);
      params.push(color);
    }
    if (position !== undefined) {
      fields.push(`position = $${paramIndex++}`);
      params.push(position);
    }
    if (is_won_stage !== undefined) {
      fields.push(`is_won_stage = $${paramIndex++}`);
      params.push(is_won_stage);
    }
    if (is_lost_stage !== undefined) {
      fields.push(`is_lost_stage = $${paramIndex++}`);
      params.push(is_lost_stage);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    params.push(id, targetUserId);

    const result = await query(
      `UPDATE lead_pipeline_stages SET ${fields.join(', ')} 
       WHERE id = $${paramIndex} AND owner_user_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Pipeline stage not found' });
    }

    res.json({ stage: result.rows[0] });
  } catch (err) {
    console.error('[pipeline-stages:update]', err);
    res.status(500).json({ message: 'Failed to update pipeline stage' });
  }
});

// DELETE /pipeline-stages/:id - Delete a pipeline stage
router.delete('/pipeline-stages/:id', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id } = req.params;

  try {
    // Clear stage from any calls using it
    await query('UPDATE call_logs SET pipeline_stage_id = NULL WHERE pipeline_stage_id = $1', [id]);

    const result = await query('DELETE FROM lead_pipeline_stages WHERE id = $1 AND owner_user_id = $2 RETURNING id', [id, targetUserId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Pipeline stage not found' });
    }

    res.json({ message: 'Pipeline stage deleted' });
  } catch (err) {
    console.error('[pipeline-stages:delete]', err);
    res.status(500).json({ message: 'Failed to delete pipeline stage' });
  }
});

// PUT /calls/:id/stage - Move a lead to a pipeline stage
router.put('/calls/:id/stage', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id: callId } = req.params;
  const { stage_id } = req.body;

  try {
    // Verify stage belongs to user if provided
    if (stage_id) {
      const stageRes = await query('SELECT id FROM lead_pipeline_stages WHERE id = $1 AND owner_user_id = $2', [stage_id, targetUserId]);
      if (!stageRes.rows.length) {
        return res.status(404).json({ message: 'Pipeline stage not found' });
      }
    }

    const result = await query(
      `UPDATE call_logs SET pipeline_stage_id = $1 
       WHERE call_id = $2 AND (owner_user_id = $3 OR user_id = $3)
       RETURNING call_id`,
      [stage_id || null, callId, targetUserId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    res.json({ message: 'Lead moved to stage', callId, stageId: stage_id });
  } catch (err) {
    console.error('[calls:stage]', err);
    res.status(500).json({ message: 'Failed to update lead stage' });
  }
});

// =====================
// LEAD NOTES (Communication Log)
// =====================

// GET /leads/:callId/notes - Get all notes for a lead
router.get('/leads/:callId/notes', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { callId } = req.params;

  try {
    const result = await query(
      `SELECT ln.*, u.first_name, u.last_name, u.email as author_email
       FROM lead_notes ln
       LEFT JOIN users u ON ln.author_id = u.id
       WHERE ln.owner_user_id = $1 AND ln.call_id = $2
       ORDER BY ln.created_at DESC`,
      [targetUserId, callId]
    );

    const notes = result.rows.map((row) => ({
      ...row,
      author_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.author_email || 'Unknown'
    }));

    res.json({ notes });
  } catch (err) {
    console.error('[lead-notes:list]', err);
    res.status(500).json({ message: 'Failed to fetch lead notes' });
  }
});

// POST /leads/:callId/notes - Add a note to a lead
router.post('/leads/:callId/notes', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const authorId = req.user.id;
  const { callId } = req.params;
  const { body, note_type, metadata } = req.body;

  if (!body?.trim()) {
    return res.status(400).json({ message: 'Note body is required' });
  }

  try {
    // Verify the lead exists for this user
    const callRes = await query('SELECT call_id FROM call_logs WHERE call_id = $1 AND (owner_user_id = $2 OR user_id = $2)', [
      callId,
      targetUserId
    ]);

    if (!callRes.rows.length) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const result = await query(
      `INSERT INTO lead_notes (owner_user_id, call_id, author_id, note_type, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [targetUserId, callId, authorId, note_type || 'note', body.trim(), metadata || {}]
    );

    // Get author info
    const userRes = await query('SELECT first_name, last_name, email FROM users WHERE id = $1', [authorId]);
    const user = userRes.rows[0] || {};

    res.json({
      note: {
        ...result.rows[0],
        author_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Unknown'
      }
    });
  } catch (err) {
    console.error('[lead-notes:create]', err);
    res.status(500).json({ message: 'Failed to add note' });
  }
});

// DELETE /leads/:callId/notes/:noteId - Delete a note
router.delete('/leads/:callId/notes/:noteId', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { callId, noteId } = req.params;

  try {
    const result = await query('DELETE FROM lead_notes WHERE id = $1 AND call_id = $2 AND owner_user_id = $3 RETURNING id', [
      noteId,
      callId,
      targetUserId
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('[lead-notes:delete]', err);
    res.status(500).json({ message: 'Failed to delete note' });
  }
});

// =====================
// LEAD TAGS
// =====================

// GET /lead-tags - Get all tags for this user
router.get('/lead-tags', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  try {
    const result = await query('SELECT * FROM lead_tags WHERE owner_user_id = $1 ORDER BY name ASC', [targetUserId]);
    res.json({ tags: result.rows });
  } catch (err) {
    console.error('[lead-tags:list]', err);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

// POST /lead-tags - Create a new tag
router.post('/lead-tags', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { name, color } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Tag name is required' });
  }

  try {
    const result = await query(
      `INSERT INTO lead_tags (owner_user_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_user_id, name) DO UPDATE SET color = EXCLUDED.color
       RETURNING *`,
      [targetUserId, name.trim(), color || '#6366f1']
    );
    res.json({ tag: result.rows[0] });
  } catch (err) {
    console.error('[lead-tags:create]', err);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

// DELETE /lead-tags/:id - Delete a tag
router.delete('/lead-tags/:id', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id } = req.params;

  try {
    await query('DELETE FROM lead_tags WHERE id = $1 AND owner_user_id = $2', [id, targetUserId]);
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('[lead-tags:delete]', err);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
});

// GET /calls/:id/tags - Get tags for a specific call
router.get('/calls/:id/tags', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id: callId } = req.params;

  try {
    const result = await query(
      `SELECT lt.* FROM lead_tags lt
       JOIN call_log_tags clt ON lt.id = clt.tag_id
       WHERE clt.call_id = $1 AND lt.owner_user_id = $2
       ORDER BY lt.name ASC`,
      [callId, targetUserId]
    );
    res.json({ tags: result.rows });
  } catch (err) {
    console.error('[call-tags:list]', err);
    res.status(500).json({ message: 'Failed to fetch call tags' });
  }
});

// POST /calls/:id/tags - Add tag to a call
router.post('/calls/:id/tags', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id: callId } = req.params;
  const { tag_id, tag_name, tag_color } = req.body;

  try {
    let tagId = tag_id;

    // If no tag_id but tag_name provided, create or get the tag
    if (!tagId && tag_name) {
      const tagResult = await query(
        `INSERT INTO lead_tags (owner_user_id, name, color)
         VALUES ($1, $2, $3)
         ON CONFLICT (owner_user_id, name) DO UPDATE SET color = COALESCE(EXCLUDED.color, lead_tags.color)
         RETURNING *`,
        [targetUserId, tag_name.trim(), tag_color || '#6366f1']
      );
      tagId = tagResult.rows[0].id;
    }

    if (!tagId) {
      return res.status(400).json({ message: 'Tag ID or name is required' });
    }

    // Add the tag to the call
    await query(
      `INSERT INTO call_log_tags (call_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT (call_id, tag_id) DO NOTHING`,
      [callId, tagId]
    );

    // Return updated tags for this call
    const result = await query(
      `SELECT lt.* FROM lead_tags lt
       JOIN call_log_tags clt ON lt.id = clt.tag_id
       WHERE clt.call_id = $1 AND lt.owner_user_id = $2
       ORDER BY lt.name ASC`,
      [callId, targetUserId]
    );

    res.json({ tags: result.rows });
  } catch (err) {
    console.error('[call-tags:add]', err);
    res.status(500).json({ message: 'Failed to add tag' });
  }
});

// DELETE /calls/:id/tags/:tagId - Remove tag from a call
router.delete('/calls/:id/tags/:tagId', async (req, res) => {
  const { id: callId, tagId } = req.params;

  try {
    await query('DELETE FROM call_log_tags WHERE call_id = $1 AND tag_id = $2', [callId, tagId]);
    res.json({ message: 'Tag removed from call' });
  } catch (err) {
    console.error('[call-tags:remove]', err);
    res.status(500).json({ message: 'Failed to remove tag' });
  }
});

// PUT /calls/:id/category - Update call category/classification
router.put('/calls/:id/category', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id: callId } = req.params;
  const { category } = req.body;

  const validCategories = [
    'converted',
    'warm',
    'very_good',
    'applicant',
    'needs_attention',
    'unanswered',
    'not_a_fit',
    'spam',
    'neutral',
    'unreviewed'
  ];

  if (!validCategories.includes(category)) {
    return res.status(400).json({ message: 'Invalid category' });
  }

  try {
    await query(
      `UPDATE call_logs 
       SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{category}', $1::jsonb)
       WHERE call_id = $2 AND (owner_user_id = $3 OR user_id = $3)`,
      [JSON.stringify(category), callId, targetUserId]
    );

    res.json({ message: 'Category updated', category });
  } catch (err) {
    console.error('[calls:category]', err);
    res.status(500).json({ message: 'Failed to update category' });
  }
});

// =====================
// SAVED VIEWS
// =====================

// GET /lead-views - Get saved views
router.get('/lead-views', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  try {
    const result = await query('SELECT * FROM lead_saved_views WHERE owner_user_id = $1 ORDER BY created_at DESC', [targetUserId]);
    res.json({ views: result.rows });
  } catch (err) {
    console.error('[lead-views:list]', err);
    res.status(500).json({ message: 'Failed to fetch saved views' });
  }
});

// POST /lead-views - Create a saved view
router.post('/lead-views', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { name, filters, is_default } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: 'View name is required' });
  }

  try {
    // If setting as default, clear other defaults
    if (is_default) {
      await query('UPDATE lead_saved_views SET is_default = FALSE WHERE owner_user_id = $1', [targetUserId]);
    }

    const result = await query(
      `INSERT INTO lead_saved_views (owner_user_id, name, filters, is_default)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [targetUserId, name.trim(), filters || {}, is_default || false]
    );

    res.json({ view: result.rows[0] });
  } catch (err) {
    console.error('[lead-views:create]', err);
    res.status(500).json({ message: 'Failed to create saved view' });
  }
});

// DELETE /lead-views/:id - Delete a saved view
router.delete('/lead-views/:id', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { id } = req.params;

  try {
    const result = await query('DELETE FROM lead_saved_views WHERE id = $1 AND owner_user_id = $2 RETURNING id', [id, targetUserId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: 'View not found' });
    }

    res.json({ message: 'View deleted' });
  } catch (err) {
    console.error('[lead-views:delete]', err);
    res.status(500).json({ message: 'Failed to delete view' });
  }
});

router.get('/analytics', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const profile = await query('SELECT looker_url FROM client_profiles WHERE user_id=$1', [targetUserId]);
  res.json({ looker_url: profile.rows[0]?.looker_url || null });
});

router.get('/monday/settings', requireAdmin, async (_req, res) => {
  const settings = await getMondaySettings();
  res.json({ settings });
});

router.put('/monday/settings', requireAdmin, async (req, res) => {
  const allowed = [
    'monday_reference_board_id',
    'monday_client_column_id',
    'monday_person_column_id',
    'monday_person_id',
    'monday_status_column_id',
    'monday_status_label',
    'monday_rush_status_label',
    'monday_due_date_column_id',
    'monday_client_files_column_id'
  ];
  const incoming = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) incoming[k] = req.body[k];
  });
  const saved = await saveMondaySettings(incoming);
  res.json({ settings: saved });
});

router.get('/monday/boards', isAdminOrEditor, async (req, res) => {
  try {
    const settings = await getMondaySettings();
    const boards = await listBoards(settings);
    res.json({ success: true, boards });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Unable to load boards' });
  }
});

router.get('/monday/boards/:boardId/groups', isAdminOrEditor, async (req, res) => {
  try {
    const settings = await getMondaySettings();
    const groups = await listGroups(req.params.boardId, settings);
    const shaped = Array.isArray(groups)
      ? groups.filter((g) => g && g.id && g.title).map((g) => ({ id: String(g.id), title: g.title }))
      : [];
    res.json({ success: true, groups: shaped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Unable to load groups' });
  }
});

router.get('/monday/boards/:boardId/columns', isAdminOrEditor, async (req, res) => {
  try {
    const settings = await getMondaySettings();
    const columns = await listColumns(req.params.boardId, settings);
    const shaped = Array.isArray(columns)
      ? columns.filter((c) => c && c.id && c.title).map((c) => ({ id: String(c.id), title: c.title, type: c.type }))
      : [];
    res.json({ success: true, columns: shaped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Unable to load columns' });
  }
});

router.get('/monday/people', isAdminOrEditor, async (_req, res) => {
  try {
    const settings = await getMondaySettings();
    const people = await listPeople(settings);
    const shaped = Array.isArray(people)
      ? people.filter((p) => p && p.id && p.name).map((p) => ({ id: String(p.id), name: p.name, email: p.email }))
      : [];
    res.json({ success: true, people: shaped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Unable to load people' });
  }
});

// Clear all calls and reload from CTM
router.delete('/calls', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;

  try {
    // Delete all cached calls for this user
    const { rowCount } = await query('DELETE FROM call_logs WHERE user_id=$1', [targetUserId]);
    logEvent('calls:clear-all', 'All calls cleared', { user: targetUserId, deletedCount: rowCount });

    // Now fetch fresh calls from CTM (same logic as GET /calls)
    const profileRes = await query(
      'SELECT ctm_account_number, ctm_api_key, ctm_api_secret, ai_prompt, auto_star_enabled FROM client_profiles WHERE user_id=$1 LIMIT 1',
      [targetUserId]
    );
    const profile = profileRes.rows[0] || {};
    const credentials = {
      accountId: profile.ctm_account_number,
      apiKey: profile.ctm_api_key,
      apiSecret: profile.ctm_api_secret
    };

    if (!credentials.accountId || !credentials.apiKey || !credentials.apiSecret) {
      return res.json({
        message: 'All calls cleared. CallTrackingMetrics credentials not configured.',
        calls: []
      });
    }

    // Fetch fresh calls
    const freshCalls = await pullCallsFromCtm({
      credentials,
      prompt: profile.ai_prompt || DEFAULT_AI_PROMPT,
      existingRows: [], // Empty since we just cleared everything
      autoStarEnabled: profile.auto_star_enabled || false
    });

    // Save fresh calls
    if (freshCalls.length) {
      await Promise.all(
        freshCalls.map(({ call, meta }) => {
          const startedAt = call.started_at ? new Date(call.started_at) : null;
          return query(
            `INSERT INTO call_logs (user_id, call_id, direction, from_number, to_number, started_at, duration_sec, score, meta)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (call_id) DO UPDATE SET
               direction=EXCLUDED.direction,
               from_number=EXCLUDED.from_number,
               to_number=EXCLUDED.to_number,
               started_at=EXCLUDED.started_at,
               duration_sec=EXCLUDED.duration_sec,
               score=EXCLUDED.score,
               meta=EXCLUDED.meta`,
            [
              targetUserId,
              call.id,
              call.direction || null,
              call.caller_number || null,
              call.to_number || null,
              startedAt,
              call.duration_sec || null,
              call.score || 0,
              JSON.stringify(meta || {})
            ]
          );
        })
      );

      // Post auto-starred scores back to CTM
      const autoStarredCalls = freshCalls.filter(({ shouldPostScore }) => shouldPostScore);
      if (autoStarredCalls.length > 0) {
        await Promise.all(
          autoStarredCalls.map(async ({ call }) => {
            try {
              await postSaleToCTM(credentials, call.id, {
                score: call.score,
                conversion: 1,
                value: 0
              });
            } catch (err) {
              console.error('[calls:clear-reload] Failed to post score to CTM', { callId: call.id, error: err.message });
            }
          })
        );
      }
    }

    const refreshed = await query('SELECT * FROM call_logs WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST', [targetUserId]);
    logEvent('calls:clear-all', 'Calls reloaded', { user: targetUserId, newCount: refreshed.rows.length });
    let shaped = buildCallsFromCache(refreshed.rows);
    shaped = await attachJourneyMetaToCalls(targetUserId, shaped);
    res.json({
      message: `Successfully cleared and reloaded ${freshCalls.length} call(s)`,
      calls: shaped
    });
  } catch (err) {
    console.error('[calls:clear-all]', err);
    logEvent('calls:clear-all', 'Failed to clear/reload calls', { user: targetUserId, error: err.message });
    res.status(500).json({ message: 'Unable to clear and reload calls' });
  }
});

// ================================
// CLIENT JOURNEYS & SYMPTOMS
// ================================

router.get('/journey-template', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  try {
    await ensureJourneyTables();
    const template = await getJourneyTemplate(ownerId);
    res.json({ template });
  } catch (err) {
    console.error('[journeys:template:get]', err);
    res.status(500).json({ message: 'Unable to load journey template' });
  }
});

router.put('/journey-template', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  try {
    await ensureJourneyTables();
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
    const template = await saveJourneyTemplate(ownerId, steps);
    res.json({ template });
  } catch (err) {
    console.error('[journeys:template:save]', err);
    res.status(500).json({ message: 'Unable to save journey template' });
  }
});

router.get('/journeys', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  try {
    await ensureJourneyTables();
    const filters = {};
    if (req.query.archived === 'true') {
      filters.archived = true;
    }
    if (req.query.status && JOURNEY_STATUS_OPTIONS.includes(req.query.status)) {
      filters.status = req.query.status;
    }
    if (req.query.active_client_id) {
      filters.active_client_id = req.query.active_client_id;
    }
    if (req.query.include_archived === 'true') {
      filters.includeArchived = true;
    }
    const journeys = await fetchJourneysForOwner(ownerId, filters);
    res.json({ journeys });
  } catch (err) {
    console.error('[journeys:list]', err);
    res.status(500).json({ message: 'Unable to load client journeys' });
  }
});

router.get('/journeys/:id', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id } = req.params;
  try {
    await ensureJourneyTables();
    const journey = await fetchJourneyForOwner(ownerId, id);
    if (!journey) {
      return res.status(404).json({ message: 'Journey not found' });
    }
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:get]', err);
    res.status(500).json({ message: 'Unable to load journey' });
  }
});

router.post('/journeys', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const {
    lead_call_id,
    active_client_id,
    client_name,
    client_phone,
    client_email,
    symptoms = [],
    status = 'pending',
    next_action_at,
    notes_summary,
    service_id,
    parent_journey_id,
    force_new = false // If true, always create a new journey (for multi-journey support)
  } = req.body || {};

  if (!client_name && !client_phone && !client_email && !lead_call_id && !active_client_id) {
    return res.status(400).json({ message: 'Client name, contact info, or active client is required' });
  }

  const normalizedSymptoms = sanitizeSymptomList(symptoms);
  const symptomsJsonPayload = JSON.stringify(normalizedSymptoms);
  const desiredStatus = JOURNEY_STATUS_OPTIONS.includes(status) ? status : 'pending';
  const nextActionAt = parseDateValue(next_action_at);

  // If force_new is true, skip the existing journey lookup (allows multiple journeys per client)
  const findExisting = async (callKey) => {
    if (force_new) return null;

    if (callKey) {
      // Only find existing journey by call key, not by active_client_id
      // This allows multiple journeys per active client
      const { rows } = await query('SELECT id FROM client_journeys WHERE owner_user_id = $1 AND lead_call_key = $2 LIMIT 1', [
        ownerId,
        callKey
      ]);
      if (rows.length) return rows[0].id;
    }
    return null;
  };

  await ensureJourneyTables();
  const { leadCallKey, leadCallUuid } = await resolveLeadCallLink(ownerId, lead_call_id);
  const journeyId = await findExisting(leadCallKey);
  await query('BEGIN');
  try {
    let resultingId = journeyId;
    let newlyCreatedJourneyId = null;
    if (journeyId) {
      await query(
        `UPDATE client_journeys
         SET client_name = COALESCE($1, client_name),
             client_phone = COALESCE($2, client_phone),
             client_email = COALESCE($3, client_email),
             symptoms = $4,
             status = $5,
             next_action_at = COALESCE($6, next_action_at),
             notes_summary = COALESCE($7, notes_summary),
             lead_call_key = COALESCE($8, lead_call_key),
             lead_call_id = COALESCE($9, lead_call_id),
             service_id = COALESCE($10, service_id),
             updated_at = NOW()
         WHERE id = $11 AND owner_user_id = $12`,
        [
          client_name || null,
          client_phone || null,
          client_email || null,
          symptomsJsonPayload,
          desiredStatus,
          nextActionAt,
          notes_summary || null,
          leadCallKey,
          leadCallUuid,
          service_id || null,
          journeyId,
          ownerId
        ]
      );
    } else {
      const insert = await query(
        `INSERT INTO client_journeys (
           owner_user_id,
           lead_call_id,
           lead_call_key,
           active_client_id,
           client_name,
           client_phone,
           client_email,
           symptoms,
           status,
           paused,
           next_action_at,
           notes_summary,
           service_id,
           parent_journey_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13)
         RETURNING id`,
        [
          ownerId,
          leadCallUuid,
          leadCallKey,
          active_client_id || null,
          client_name || null,
          client_phone || null,
          client_email || null,
          symptomsJsonPayload,
          desiredStatus,
          nextActionAt,
          notes_summary || null,
          service_id || null,
          parent_journey_id || null
        ]
      );
      resultingId = insert.rows[0].id;
      newlyCreatedJourneyId = resultingId;
    }
    await query('COMMIT');
    let journey = await fetchJourneyForOwner(ownerId, resultingId);
    if (newlyCreatedJourneyId) {
      await seedJourneySteps(newlyCreatedJourneyId, ownerId);
      journey = await fetchJourneyForOwner(ownerId, resultingId);
    }
    res.json({ journey });
  } catch (err) {
    await query('ROLLBACK');
    console.error('[journeys:create]', err);
    res.status(500).json({ message: 'Unable to save client journey' });
  }
});

router.put('/journeys/:id', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id } = req.params;
  const fields = [];
  const params = [];
  let paramIndex = 1;

  if (req.body.client_name !== undefined) {
    fields.push(`client_name = $${paramIndex++}`);
    params.push(req.body.client_name || null);
  }
  if (req.body.client_phone !== undefined) {
    fields.push(`client_phone = $${paramIndex++}`);
    params.push(req.body.client_phone || null);
  }
  if (req.body.client_email !== undefined) {
    fields.push(`client_email = $${paramIndex++}`);
    params.push(req.body.client_email || null);
  }
  if (Array.isArray(req.body.symptoms)) {
    fields.push(`symptoms = $${paramIndex++}`);
    params.push(JSON.stringify(sanitizeSymptomList(req.body.symptoms)));
  }
  if (req.body.status) {
    if (!JOURNEY_STATUS_OPTIONS.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    fields.push(`status = $${paramIndex++}`);
    params.push(req.body.status);
  }
  if (req.body.paused !== undefined) {
    fields.push(`paused = $${paramIndex++}`);
    params.push(Boolean(req.body.paused));
  }
  if (req.body.next_action_at !== undefined) {
    fields.push(`next_action_at = $${paramIndex++}`);
    params.push(parseDateValue(req.body.next_action_at));
  }
  if (req.body.notes_summary !== undefined) {
    fields.push(`notes_summary = $${paramIndex++}`);
    params.push(req.body.notes_summary || null);
  }

  if (!fields.length) {
    return res.status(400).json({ message: 'No updates supplied' });
  }

  try {
    await ensureJourneyTables();
    params.push(id);
    params.push(ownerId);
    const result = await query(
      `UPDATE client_journeys
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND owner_user_id = $${paramIndex}
       RETURNING id`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Journey not found' });
    }
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:update]', err);
    res.status(500).json({ message: 'Unable to update journey' });
  }
});

router.post('/journeys/:id/archive', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id } = req.params;
  try {
    await ensureJourneyTables();
    const result = await query(
      `UPDATE client_journeys
       SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id`,
      [id, ownerId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Journey not found' });
    }
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:archive]', err);
    res.status(500).json({ message: 'Unable to archive journey' });
  }
});

router.post('/journeys/:id/unarchive', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id } = req.params;
  const desiredStatus = req.body?.status;
  const statusUpdate =
    desiredStatus && JOURNEY_STATUS_OPTIONS.includes(desiredStatus) && desiredStatus !== 'archived' ? desiredStatus : null;
  try {
    await ensureJourneyTables();
    const params = [id, ownerId];
    let setClause = 'archived_at = NULL, updated_at = NOW()';
    if (statusUpdate) {
      params.push(statusUpdate);
      setClause = `archived_at = NULL, status = $3, updated_at = NOW()`;
    }
    const result = await query(
      `UPDATE client_journeys
       SET ${setClause}
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Journey not found' });
    }
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:unarchive]', err);
    res.status(500).json({ message: 'Unable to restore journey' });
  }
});

async function ensureJourneyOwnership(journeyId, ownerId) {
  await ensureJourneyTables();
  const { rows } = await query('SELECT id FROM client_journeys WHERE id = $1 AND owner_user_id = $2 LIMIT 1', [journeyId, ownerId]);
  return rows.length > 0;
}

router.post('/journeys/:id/steps', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id } = req.params;
  const { label, channel, message, offset_weeks, due_at, position } = req.body || {};
  if (!label) {
    return res.status(400).json({ message: 'Label is required' });
  }
  const owns = await ensureJourneyOwnership(id, ownerId);
  if (!owns) {
    return res.status(404).json({ message: 'Journey not found' });
  }
  const offsetWeeks = Number.isFinite(Number(offset_weeks)) ? Number(offset_weeks) : 0;
  let targetPosition = Number.isFinite(Number(position)) ? Number(position) : null;
  if (targetPosition === null) {
    const posRes = await query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM client_journey_steps WHERE journey_id = $1', [id]);
    targetPosition = posRes.rows[0]?.next_pos || 0;
  }
  try {
    await ensureJourneyTables();
    await query(
      `INSERT INTO client_journey_steps (journey_id, position, label, channel, message, offset_weeks, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, targetPosition, label, channel || null, message || null, offsetWeeks, parseDateValue(due_at)]
    );
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:steps:create]', err);
    res.status(500).json({ message: 'Unable to add step' });
  }
});

router.put('/journeys/:id/steps/:stepId', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id, stepId } = req.params;
  const owns = await ensureJourneyOwnership(id, ownerId);
  if (!owns) {
    return res.status(404).json({ message: 'Journey not found' });
  }
  const fields = [];
  const params = [];
  let paramIndex = 1;
  if (req.body.label !== undefined) {
    fields.push(`label = $${paramIndex++}`);
    params.push(req.body.label || null);
  }
  if (req.body.channel !== undefined) {
    fields.push(`channel = $${paramIndex++}`);
    params.push(req.body.channel || null);
  }
  if (req.body.message !== undefined) {
    fields.push(`message = $${paramIndex++}`);
    params.push(req.body.message || null);
  }
  if (req.body.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    params.push(req.body.notes || null);
  }
  if (req.body.offset_weeks !== undefined) {
    fields.push(`offset_weeks = $${paramIndex++}`);
    params.push(Number.isFinite(Number(req.body.offset_weeks)) ? Number(req.body.offset_weeks) : 0);
  }
  if (req.body.due_at !== undefined) {
    fields.push(`due_at = $${paramIndex++}`);
    params.push(parseDateValue(req.body.due_at));
  }
  if (req.body.completed_at !== undefined) {
    fields.push(`completed_at = $${paramIndex++}`);
    params.push(parseDateValue(req.body.completed_at));
  }
  if (req.body.position !== undefined) {
    fields.push(`position = $${paramIndex++}`);
    params.push(Number.isFinite(Number(req.body.position)) ? Number(req.body.position) : 0);
  }
  if (!fields.length) {
    return res.status(400).json({ message: 'No updates supplied' });
  }
  try {
    await ensureJourneyTables();
    params.push(stepId, id);
    const result = await query(
      `UPDATE client_journey_steps
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND journey_id = $${paramIndex}
       RETURNING id`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Step not found' });
    }
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:steps:update]', err);
    res.status(500).json({ message: 'Unable to update step' });
  }
});

router.delete('/journeys/:id/steps/:stepId', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id, stepId } = req.params;
  const owns = await ensureJourneyOwnership(id, ownerId);
  if (!owns) {
    return res.status(404).json({ message: 'Journey not found' });
  }
  try {
    await ensureJourneyTables();
    const result = await query('DELETE FROM client_journey_steps WHERE id = $1 AND journey_id = $2', [stepId, id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Step not found' });
    }
    await query(
      `WITH ordered AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS new_pos
         FROM client_journey_steps
         WHERE journey_id = $1
       )
       UPDATE client_journey_steps c
       SET position = ordered.new_pos
       FROM ordered
       WHERE c.id = ordered.id`,
      [id]
    );
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:steps:delete]', err);
    res.status(500).json({ message: 'Unable to delete step' });
  }
});

router.post('/journeys/:id/notes', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const authorId = req.user.id;
  const { id } = req.params;
  const { body } = req.body || {};
  if (!body || !body.trim()) {
    return res.status(400).json({ message: 'Note body is required' });
  }
  const owns = await ensureJourneyOwnership(id, ownerId);
  if (!owns) {
    return res.status(404).json({ message: 'Journey not found' });
  }
  try {
    await ensureJourneyTables();
    await query('INSERT INTO client_journey_notes (journey_id, author_id, body) VALUES ($1,$2,$3)', [id, authorId, body.trim()]);
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:notes:create]', err);
    res.status(500).json({ message: 'Unable to add note' });
  }
});

router.post('/journeys/:id/apply-template', async (req, res) => {
  const ownerId = req.portalUserId || req.user.id;
  const { id } = req.params;
  await ensureJourneyTables();
  const owns = await ensureJourneyOwnership(id, ownerId);
  if (!owns) {
    return res.status(404).json({ message: 'Journey not found' });
  }
  const existingSteps = await query('SELECT id FROM client_journey_steps WHERE journey_id = $1 LIMIT 1', [id]);
  if (existingSteps.rows.length) {
    const journey = await fetchJourneyForOwner(ownerId, id);
    return res.json({ journey });
  }
  try {
    await seedJourneySteps(id, ownerId);
    const journey = await fetchJourneyForOwner(ownerId, id);
    res.json({ journey });
  } catch (err) {
    console.error('[journeys:apply-template]', err);
    res.status(500).json({ message: 'Unable to apply template' });
  }
});

// ================================
// SERVICES MANAGEMENT (User's Service Offerings)
// ================================

// List user's services
router.get('/services', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  try {
    const { rows } = await query('SELECT * FROM services WHERE user_id = $1 ORDER BY name ASC', [userId]);
    res.json({ services: rows });
  } catch (err) {
    logEvent('services:list', 'Error fetching services', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to fetch services' });
  }
});

// Create service for user
router.post('/services', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { name, description, base_price } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Service name is required' });
  }
  try {
    const { rows } = await query('INSERT INTO services (user_id, name, description, base_price) VALUES ($1, $2, $3, $4) RETURNING *', [
      userId,
      name,
      description || null,
      base_price || null
    ]);
    logEvent('services:create', 'Service created', { serviceId: rows[0].id, name, userId });
    res.json({ service: rows[0] });
  } catch (err) {
    logEvent('services:create', 'Error creating service', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to create service' });
  }
});

// Update user's service
router.put('/services/:id', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;
  const { name, description, base_price, active } = req.body;
  try {
    const updates = [];
    const params = [];
    if (name !== undefined) {
      updates.push('name = $' + (params.length + 1));
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = $' + (params.length + 1));
      params.push(description);
    }
    if (base_price !== undefined) {
      updates.push('base_price = $' + (params.length + 1));
      params.push(base_price);
    }
    if (active !== undefined) {
      updates.push('active = $' + (params.length + 1));
      params.push(active);
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: 'No updates provided' });
    }
    updates.push('updated_at = NOW()');
    params.push(userId);
    params.push(id);
    const { rows } = await query(
      `UPDATE services SET ${updates.join(', ')} WHERE user_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    logEvent('services:update', 'Service updated', { serviceId: id, userId });
    res.json({ service: rows[0] });
  } catch (err) {
    logEvent('services:update', 'Error updating service', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to update service' });
  }
});

// Delete user's service
router.delete('/services/:id', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;
  try {
    const { rowCount } = await query('DELETE FROM services WHERE user_id = $1 AND id = $2', [userId, id]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }
    logEvent('services:delete', 'Service deleted', { serviceId: id, userId });
    res.json({ success: true });
  } catch (err) {
    logEvent('services:delete', 'Error deleting service', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to delete service' });
  }
});

// ================================
// ACTIVE CLIENTS (User's Customers)
// ================================

// List user's active clients
router.get('/active-clients', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  try {
    await ensureJourneyTables();
    await ensureActiveClientArchiveColumn();
    const showArchived = req.query.status === 'archived';
    const archiveClause = showArchived ? 'ac.archived_at IS NOT NULL' : 'ac.archived_at IS NULL';
    const { rows } = await query(
      `
      SELECT 
        ac.*,
        journey.id AS journey_id,
        journey.status AS journey_status,
        journey.paused AS journey_paused,
        journey.symptoms AS journey_symptoms,
        journey.next_action_at AS journey_next_action_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cs.id,
              'service_id', cs.service_id,
              'service_name', s.name,
              'agreed_price', cs.agreed_price,
              'agreed_date', cs.agreed_date,
              'redacted_at', cs.redacted_at
            )
            ORDER BY cs.agreed_date DESC
          ) FILTER (WHERE cs.id IS NOT NULL),
          '[]'
        ) as services
      FROM active_clients ac
      LEFT JOIN LATERAL (
        SELECT id, status, paused, symptoms, next_action_at
        FROM client_journeys
        WHERE active_client_id = ac.id
        ORDER BY created_at DESC
        LIMIT 1
      ) journey ON true
      LEFT JOIN client_services cs ON ac.id = cs.active_client_id
      LEFT JOIN services s ON cs.service_id = s.id
      WHERE ac.owner_user_id = $1
        AND ${archiveClause}
      GROUP BY ac.id, journey.id, journey.status, journey.paused, journey.symptoms, journey.next_action_at
      ORDER BY ac.created_at DESC
    `,
      [userId]
    );
    res.json({ active_clients: rows });
  } catch (err) {
    logEvent('active-clients:list', 'Error fetching active clients', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to fetch active clients' });
  }
});

router.post('/active-clients/:id/archive', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;
  try {
    await ensureActiveClientArchiveColumn();
    const result = await query(
      `UPDATE active_clients
       SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id`,
      [id, userId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Active client not found' });
    }
    await query(
      `UPDATE client_journeys
       SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
       WHERE active_client_id = $1 AND owner_user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    logEvent('active-clients:archive', 'Error archiving client', { error: err.message, userId, id });
    res.status(500).json({ message: 'Unable to archive client' });
  }
});

router.post('/active-clients/:id/unarchive', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;
  try {
    await ensureActiveClientArchiveColumn();
    const result = await query(
      `UPDATE active_clients
       SET archived_at = NULL, updated_at = NOW()
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id`,
      [id, userId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Active client not found' });
    }
    await query(
      `UPDATE client_journeys
       SET archived_at = NULL, updated_at = NOW()
       WHERE active_client_id = $1 AND owner_user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    logEvent('active-clients:unarchive', 'Error restoring client', { error: err.message, userId, id });
    res.status(500).json({ message: 'Unable to restore client' });
  }
});

// Convert lead to active client
router.post('/clients/:leadId/agree-to-service', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const leadId = req.params.leadId;
  const { services, source, funnel_data } = req.body;
  const funnelData = funnel_data || {};

  logEvent('active-clients:agree', 'Received agree-to-service request', {
    userId,
    leadId,
    servicesCount: services?.length,
    source,
    funnelData
  });

  if (!services || !Array.isArray(services) || services.length === 0) {
    logEvent('active-clients:agree', 'Invalid services array', { userId, leadId, services });
    return res.status(400).json({ message: 'At least one service must be selected' });
  }

  try {
    await ensureJourneyTables();
    const profileRes = await query(
      'SELECT ctm_account_number, ctm_api_key, ctm_api_secret FROM client_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const profile = profileRes.rows[0] || {};
    const ctmCredentials = {
      accountId: profile.ctm_account_number,
      apiKey: profile.ctm_api_key,
      apiSecret: profile.ctm_api_secret
    };

    // Extract client info from funnel_data
    const clientName = funnelData.caller_name || 'Unknown';
    const clientPhone = funnelData.caller_number || null;
    const clientEmail = funnelData.email || null;

    // Check if already an active client with this phone
    let activeClientId;
    let existingSourceValue = null;
    if (clientPhone) {
      const existingClient = await query('SELECT id, source FROM active_clients WHERE owner_user_id = $1 AND client_phone = $2', [
        userId,
        clientPhone
      ]);
      if (existingClient.rows.length > 0) {
        activeClientId = existingClient.rows[0].id;
        existingSourceValue = existingClient.rows[0].source || null;
        logEvent('active-clients:agree', 'Existing client, adding services', { userId, activeClientId, clientPhone });
      }
    }

    if (!activeClientId) {
      // Create active client record
      const { rows } = await query(
        `INSERT INTO active_clients (user_id, owner_user_id, client_name, client_phone, client_email, source, funnel_data) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, source`,
        [userId, userId, clientName, clientPhone, clientEmail, source || null, JSON.stringify(funnelData || {})]
      );
      activeClientId = rows[0].id;
      existingSourceValue = rows[0].source || null;
      logEvent('active-clients:agree', 'Created active client', { userId, activeClientId, clientName });
    }

    // Add services to client_services
    for (const service of services) {
      const { service_id, agreed_price } = service;
      await query(
        `INSERT INTO client_services (active_client_id, service_id, agreed_price) 
         VALUES ($1, $2, $3)`,
        [activeClientId, service_id, agreed_price]
      );
    }

    logEvent('active-clients:agree', 'Services added to client', {
      userId,
      activeClientId,
      serviceCount: services.length
    });

    // Build attribution list for the client
    const attributionSources = new Set();
    const addSources = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => addSources(entry));
        return;
      }
      String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => attributionSources.add(s));
    };
    addSources(existingSourceValue);
    addSources(source);
    addSources(funnelData.source);

    if (clientPhone && ctmCredentials.accountId && ctmCredentials.apiKey && ctmCredentials.apiSecret) {
      try {
        const phoneSources = await fetchPhoneInteractionSources(ctmCredentials, clientPhone);
        addSources(phoneSources);
      } catch (err) {
        logEvent('active-clients:agree', 'Failed to load CTM attribution', {
          userId,
          phone: clientPhone,
          error: err.message
        });
      }
    }

    const attributionList = Array.from(attributionSources);
    if (attributionList.length) {
      await query('UPDATE active_clients SET source = $1 WHERE id = $2', [attributionList.join(', '), activeClientId]);
    }

    if (leadId) {
      await query(
        `UPDATE client_journeys
         SET active_client_id = $1,
             status = CASE
               WHEN status IS NULL OR status = 'pending' THEN 'active_client'
               ELSE status
             END,
             updated_at = NOW()
         WHERE owner_user_id = $2 AND lead_call_key = $3`,
        [activeClientId, userId, leadId]
      );
    }

    res.json({ success: true, active_client_id: activeClientId });
  } catch (err) {
    logEvent('active-clients:agree', 'Error converting to active client', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to process service agreement' });
  }
});

// Redact services older than 90 days (callable by users or cron)
router.post('/active-clients/redact-services', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  try {
    // Only redact services for this user's active clients
    const { rows } = await query(
      `
      UPDATE client_services 
      SET redacted_at = NOW()
      WHERE redacted_at IS NULL 
        AND agreed_date < NOW() - INTERVAL '90 days'
        AND active_client_id IN (
          SELECT id FROM active_clients WHERE owner_user_id = $1
        )
      RETURNING id
    `,
      [userId]
    );
    const { rowCount: journeyRedacted } = await query(
      `UPDATE client_journeys
       SET symptoms = '[]'::jsonb,
           symptoms_redacted = TRUE,
           updated_at = NOW()
       WHERE symptoms_redacted = FALSE
         AND created_at < NOW() - INTERVAL '90 days'
         AND owner_user_id = $1`,
      [userId]
    );
    logEvent('active-clients:redact', 'Services redacted', { count: rows.length, userId });
    res.json({ success: true, services_redacted: rows.length, journeys_redacted: journeyRedacted });
  } catch (err) {
    logEvent('active-clients:redact', 'Error redacting services', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to redact services' });
  }
});

// ================================
// BLOG POSTS
// ================================

// List user's blog posts
router.get('/blog-posts', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  try {
    const { rows } = await query('SELECT * FROM blog_posts WHERE user_id = $1 ORDER BY updated_at DESC', [userId]);
    res.json({ blog_posts: rows });
  } catch (err) {
    logEvent('blog:list', 'Error fetching blog posts', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to fetch blog posts' });
  }
});

// Get a single blog post
router.get('/blog-posts/:id', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;
  try {
    const { rows } = await query('SELECT * FROM blog_posts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Blog post not found' });
    }
    res.json({ blog_post: rows[0] });
  } catch (err) {
    logEvent('blog:get', 'Error fetching blog post', { error: err.message, userId, id });
    res.status(500).json({ message: 'Unable to fetch blog post' });
  }
});

// Create a new blog post
router.post('/blog-posts', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { title, content, status = 'draft' } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  try {
    const published_at = status === 'published' ? new Date() : null;
    const { rows } = await query(
      `INSERT INTO blog_posts (user_id, title, content, status, published_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, title, content, status, published_at]
    );
    const newPost = rows[0];
    try {
      await notifyAccountManagerOfBlogPost(userId, newPost, resolveBaseUrl(req));
    } catch (notifyErr) {
      console.error('[blog:notify]', notifyErr.message || notifyErr);
    }
    logEvent('blog:create', 'Blog post created', { userId, id: newPost.id });
    res.json({ blog_post: newPost });
  } catch (err) {
    logEvent('blog:create', 'Error creating blog post', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to create blog post' });
  }
});

// Update a blog post
router.put('/blog-posts/:id', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;
  const { title, content, status } = req.body;

  try {
    // Check if the blog post belongs to the user
    const check = await query('SELECT id FROM blog_posts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    const updates = [];
    const params = [id, userId];
    let paramIndex = 3;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(content);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);

      if (status === 'published') {
        updates.push(`published_at = COALESCE(published_at, NOW())`);
      }
    }

    updates.push('updated_at = NOW()');

    const { rows } = await query(`UPDATE blog_posts SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, params);

    logEvent('blog:update', 'Blog post updated', { userId, id });
    res.json({ blog_post: rows[0] });
  } catch (err) {
    logEvent('blog:update', 'Error updating blog post', { error: err.message, userId, id });
    res.status(500).json({ message: 'Unable to update blog post' });
  }
});

// Delete a blog post
router.delete('/blog-posts/:id', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { id } = req.params;

  try {
    const { rowCount } = await query('DELETE FROM blog_posts WHERE id = $1 AND user_id = $2', [id, userId]);

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Blog post not found' });
    }

    logEvent('blog:delete', 'Blog post deleted', { userId, id });
    res.json({ success: true });
  } catch (err) {
    logEvent('blog:delete', 'Error deleting blog post', { error: err.message, userId, id });
    res.status(500).json({ message: 'Unable to delete blog post' });
  }
});

// AI: Generate blog post ideas
router.post('/blog-posts/ai/ideas', async (req, res) => {
  const userId = req.portalUserId || req.user.id;

  try {
    // Get user's business info and services
    const brandResult = await query(
      'SELECT business_name, business_description, website_url FROM brand_assets WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const servicesResult = await query(
      "SELECT COALESCE(name, '') AS name, COALESCE(description, '') AS description FROM services WHERE user_id = $1 AND active = true",
      [userId]
    );

    const businessName = brandResult.rows[0]?.business_name?.trim() || 'Your Business';
    const businessDescription = brandResult.rows[0]?.business_description?.trim() || 'A growing service provider.';
    const websiteUrl = brandResult.rows[0]?.website_url?.trim() || 'https://example.com';
    const servicesList = servicesResult.rows
      .map((s) => (s.name ? `${s.name}${s.description ? ` - ${s.description}` : ''}` : ''))
      .filter(Boolean);
    const servicesText = servicesList.length
      ? servicesList.map((line, idx) => `${idx + 1}. ${line}`).join('\n')
      : 'No services have been configured yet.';

    const prompt = `You are an experienced marketing copywriter.
Business Name: ${businessName}
Business Description: ${businessDescription}
Website: ${websiteUrl}
Service List:
${servicesText}

Generate 10 SEO-friendly blog post title ideas that would be valuable for this exact business and its services. 
Return the titles only, one per line, without numbering or bullet characters.`;

    logEvent('blog:ai:ideas', 'Prompt built', { userId, prompt });
    const responseText = await generateAiResponse({
      prompt,
      systemPrompt: 'You are an experienced marketing copywriter who produces catchy, SEO-friendly blog titles.',
      temperature: 0.65,
      maxTokens: 400
    });

    const ideas = responseText
      .split('\n')
      .map((line) => line.replace(/^\d+[\).\s-]+/, '').trim())
      .filter(Boolean);

    logEvent('blog:ai:ideas', 'Generated blog ideas', { userId, count: ideas.length });
    res.json({ ideas });
  } catch (err) {
    logEvent('blog:ai:ideas', 'Error generating ideas', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to generate blog ideas' });
  }
});

// AI: Write a draft blog post
router.post('/blog-posts/ai/draft', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }

  try {
    // Get user's business info
    const brandResult = await query(
      'SELECT business_name, business_description, website_url FROM brand_assets WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const servicesResult = await query(
      "SELECT COALESCE(name, '') AS name, COALESCE(description, '') AS description FROM services WHERE user_id = $1 AND active = true",
      [userId]
    );

    const businessName = brandResult.rows[0]?.business_name?.trim() || 'Your Business';
    const businessDescription = brandResult.rows[0]?.business_description?.trim() || 'A growing service provider.';
    const websiteUrl = brandResult.rows[0]?.website_url?.trim() || 'https://example.com';
    const servicesList = servicesResult.rows
      .map((s) => (s.name ? `${s.name}${s.description ? ` - ${s.description}` : ''}` : ''))
      .filter(Boolean);
    const servicesText = servicesList.length
      ? servicesList.map((line, idx) => `${idx + 1}. ${line}`).join('\n')
      : 'No services have been configured yet.';

    const prompt = `Write a comprehensive, SEO-optimized blog post with the following specifications:

Title: ${title}

Business Context:
- Business Name: ${businessName}
- Business Description: ${businessDescription}
- Website: ${websiteUrl}
- Services:
${servicesText}

Requirements:
1. Write in HTML format suitable for a blog
2. Include proper heading tags (h2, h3) for structure
3. Write 800-1200 words
4. Optimize for SEO with natural keyword placement
5. Include a compelling introduction and conclusion
6. Use paragraphs (<p> tags) for readability
7. Do NOT include internal links (no placeholder URLs, no assumed sitemap). If you add links, they must be outbound and only if you are confident they are real, evergreen URLs; otherwise omit links entirely.
8. Do NOT include image placeholders (no "Image:", "Illustration:", "Insert image here", etc.). If you want to suggest imagery, add an HTML comment at the end like: <!-- Image suggestion: ... -->.
9. Make it engaging and valuable to readers

Write the complete blog post content in HTML:`;

    const maxTokens = Number.parseInt(process.env.BLOG_DRAFT_MAX_TOKENS || '4096', 10);
    logEvent('blog:ai:draft', 'Prompt built', { userId, promptLength: prompt.length, maxTokens });
    const content = await generateAiResponse({
      prompt,
      systemPrompt: 'You are an expert marketing copywriter who produces long-form, SEO optimized HTML blog posts.',
      temperature: 0.55,
      // 1500 was too small and could truncate mid-sentence; keep this configurable via env.
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096
    });

    logEvent('blog:ai:draft', 'Generated blog draft', { userId, title });
    res.json({ content });
  } catch (err) {
    logEvent('blog:ai:draft', 'Error generating draft', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to generate blog draft' });
  }
});

// ============================================================================
// OAuth Provider Management (App-level, Admin-only)
// ============================================================================

// List all OAuth providers
router.get('/oauth-providers', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM oauth_providers ORDER BY provider');
    // Don't expose client_secret in list view
    const safe = rows.map(({ client_secret, ...rest }) => ({ ...rest, has_secret: !!client_secret }));
    res.json({ providers: safe });
  } catch (err) {
    console.error('[oauth-providers:list]', err);
    res.status(500).json({ message: 'Failed to fetch OAuth providers' });
  }
});

// Get single OAuth provider (with secret for editing)
router.get('/oauth-providers/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM oauth_providers WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Provider not found' });
    res.json({ provider: rows[0] });
  } catch (err) {
    console.error('[oauth-providers:get]', err);
    res.status(500).json({ message: 'Failed to fetch OAuth provider' });
  }
});

// Create OAuth provider
router.post('/oauth-providers', requireAdmin, async (req, res) => {
  try {
    const { provider, client_id, client_secret, redirect_uri, auth_url, token_url, scopes, notes } = req.body;
    if (!provider || !client_id || !client_secret) {
      return res.status(400).json({ message: 'provider, client_id, and client_secret are required' });
    }
    const { rows } = await query(
      `INSERT INTO oauth_providers (provider, client_id, client_secret, redirect_uri, auth_url, token_url, scopes, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [provider, client_id, client_secret, redirect_uri || null, auth_url || null, token_url || null, scopes || [], notes || null]
    );
    res.json({ provider: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Provider already exists' });
    }
    console.error('[oauth-providers:create]', err);
    res.status(500).json({ message: 'Failed to create OAuth provider' });
  }
});

// Update OAuth provider
router.put('/oauth-providers/:id', requireAdmin, async (req, res) => {
  try {
    const { provider, client_id, client_secret, redirect_uri, auth_url, token_url, scopes, is_active, notes } = req.body;
    const { rows } = await query(
      `UPDATE oauth_providers 
       SET provider = COALESCE($1, provider),
           client_id = COALESCE($2, client_id),
           client_secret = COALESCE($3, client_secret),
           redirect_uri = $4,
           auth_url = $5,
           token_url = $6,
           scopes = COALESCE($7, scopes),
           is_active = COALESCE($8, is_active),
           notes = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        provider,
        client_id,
        client_secret,
        redirect_uri || null,
        auth_url || null,
        token_url || null,
        scopes,
        is_active,
        notes || null,
        req.params.id
      ]
    );
    if (!rows.length) return res.status(404).json({ message: 'Provider not found' });
    res.json({ provider: rows[0] });
  } catch (err) {
    console.error('[oauth-providers:update]', err);
    res.status(500).json({ message: 'Failed to update OAuth provider' });
  }
});

// Delete OAuth provider
router.delete('/oauth-providers/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM oauth_providers WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Provider not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[oauth-providers:delete]', err);
    res.status(500).json({ message: 'Failed to delete OAuth provider' });
  }
});

// ============================================================================
// OAuth Connections (Per-client)
// ============================================================================

// List OAuth connections for a client
router.get('/clients/:clientId/oauth-connections', isAdminOrEditor, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT oc.*, 
              (SELECT COUNT(*) FROM oauth_resources WHERE oauth_connection_id = oc.id) as resource_count
       FROM oauth_connections oc 
       WHERE oc.client_id = $1 
       ORDER BY oc.provider, oc.created_at DESC`,
      [req.params.clientId]
    );
    // Don't expose tokens in list
    const safe = rows.map(({ access_token, refresh_token, encrypted_access_token, encrypted_refresh_token, ...rest }) => ({
      ...rest,
      has_tokens: !!(access_token || encrypted_access_token)
    }));
    res.json({ connections: safe });
  } catch (err) {
    console.error('[oauth-connections:list]', err);
    res.status(500).json({ message: 'Failed to fetch OAuth connections' });
  }
});

// Create OAuth connection for a client
router.post('/clients/:clientId/oauth-connections', isAdminOrEditor, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const {
      provider,
      provider_account_id,
      provider_account_name,
      access_token,
      refresh_token,
      token_type,
      scope_granted,
      expires_at,
      external_metadata
    } = req.body;

    if (!provider || !provider_account_id) {
      return res.status(400).json({ message: 'provider and provider_account_id are required' });
    }

    const { rows } = await query(
      `INSERT INTO oauth_connections 
       (client_id, provider, provider_account_id, provider_account_name, access_token, refresh_token, 
        token_type, scope_granted, expires_at, external_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        clientId,
        provider,
        provider_account_id,
        provider_account_name || null,
        access_token || null,
        refresh_token || null,
        token_type || 'Bearer',
        scope_granted || [],
        expires_at || null,
        external_metadata || {}
      ]
    );
    res.json({ connection: rows[0] });
  } catch (err) {
    console.error('[oauth-connections:create]', err);
    res.status(500).json({ message: 'Failed to create OAuth connection' });
  }
});

// Update OAuth connection
router.put('/oauth-connections/:id', isAdminOrEditor, async (req, res) => {
  try {
    const { provider_account_name, access_token, refresh_token, scope_granted, expires_at, is_connected, last_error, external_metadata } =
      req.body;

    const { rows } = await query(
      `UPDATE oauth_connections 
       SET provider_account_name = COALESCE($1, provider_account_name),
           access_token = COALESCE($2, access_token),
           refresh_token = COALESCE($3, refresh_token),
           scope_granted = COALESCE($4, scope_granted),
           expires_at = COALESCE($5, expires_at),
           is_connected = COALESCE($6, is_connected),
           last_error = $7,
           external_metadata = COALESCE($8, external_metadata),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        provider_account_name,
        access_token,
        refresh_token,
        scope_granted,
        expires_at,
        is_connected,
        last_error || null,
        external_metadata,
        req.params.id
      ]
    );
    if (!rows.length) return res.status(404).json({ message: 'Connection not found' });
    res.json({ connection: rows[0] });
  } catch (err) {
    console.error('[oauth-connections:update]', err);
    res.status(500).json({ message: 'Failed to update OAuth connection' });
  }
});

// Revoke/disconnect OAuth connection
router.post('/oauth-connections/:id/revoke', isAdminOrEditor, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE oauth_connections 
       SET is_connected = FALSE, revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Connection not found' });
    res.json({ connection: rows[0] });
  } catch (err) {
    console.error('[oauth-connections:revoke]', err);
    res.status(500).json({ message: 'Failed to revoke OAuth connection' });
  }
});

// Delete OAuth connection
router.delete('/oauth-connections/:id', isAdminOrEditor, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM oauth_connections WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Connection not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[oauth-connections:delete]', err);
    res.status(500).json({ message: 'Failed to delete OAuth connection' });
  }
});

// ============================================================================
// OAuth Connect Flow (Google Business Profile)
// ============================================================================

/**
 * POST /hub/oauth/google/connect
 * Initiate Google Business Profile OAuth flow for a client
 * Body: { clientId } (required)
 * Returns: { authUrl } - frontend should redirect to this URL
 */
router.post('/oauth/google/connect', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    // Verify client exists
    const clientCheck = await query('SELECT id FROM users WHERE id = $1', [clientId]);
    if (!clientCheck.rows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Build redirect URI
    const baseUrl = resolveBaseUrl(req);
    const redirectUri = `${baseUrl}/api/hub/oauth/google/callback`;
    
    const config = getGoogleBusinessOAuthConfig(redirectUri);
    
    if (!config.clientId || !config.clientSecret) {
      console.error('[oauth:google:connect] Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET');
      return res.status(500).json({ message: 'Google OAuth not configured. Check server environment variables.' });
    }

    // Create OAuth state and PKCE verifier
    const state = createOauthState();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    // Store state in cookies
    setOAuthCookies(res, 'google', {
      state,
      verifier: codeVerifier,
      clientId
    });

    // Build Google auth URL
    const authUrl = buildGoogleAuthUrl(config, { state, codeChallenge });
    
    console.log(`[oauth:google:connect] Generated OAuth URL for client ${clientId}`);
    res.json({ authUrl });
  } catch (err) {
    console.error('[oauth:google:connect]', err);
    res.status(500).json({ message: 'Failed to start OAuth flow' });
  }
});

/**
 * GET /hub/oauth-connections/:id/google-accounts
 * Fetch Google Business accounts for an OAuth connection
 */
router.get('/oauth-connections/:id/google-accounts', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Get connection with token
    const { rows } = await query(
      'SELECT access_token, expires_at FROM oauth_connections WHERE id = $1 AND provider = $2',
      [connectionId, 'google']
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Google connection not found' });
    }

    let accessToken = rows[0].access_token;
    const expiresAt = rows[0].expires_at;

    // Refresh token if expired
    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log(`[oauth:google:accounts] Token expired, refreshing...`);
      accessToken = await refreshGoogleAccessToken(connectionId);
    }

    // Fetch accounts
    const accounts = await fetchGoogleBusinessAccounts(accessToken);
    res.json({ accounts });
  } catch (err) {
    console.error('[oauth:google:accounts]', err);
    res.status(500).json({ message: 'Failed to fetch Google Business accounts' });
  }
});

/**
 * GET /hub/oauth-connections/:id/google-locations
 * Fetch Google Business locations for an account
 * Query params: accountName (required, format: accounts/123456789)
 */
router.get('/oauth-connections/:id/google-locations', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.id;
    const { accountName } = req.query;

    if (!accountName) {
      return res.status(400).json({ message: 'accountName is required' });
    }
    
    // Get connection with token
    const { rows } = await query(
      'SELECT access_token, expires_at FROM oauth_connections WHERE id = $1 AND provider = $2',
      [connectionId, 'google']
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Google connection not found' });
    }

    let accessToken = rows[0].access_token;
    const expiresAt = rows[0].expires_at;

    // Refresh token if expired
    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log(`[oauth:google:locations] Token expired, refreshing...`);
      accessToken = await refreshGoogleAccessToken(connectionId);
    }

    // Fetch locations
    const locations = await fetchGoogleBusinessLocations(accessToken, accountName);
    res.json({ locations });
  } catch (err) {
    console.error('[oauth:google:locations]', err);
    res.status(500).json({ message: 'Failed to fetch Google Business locations' });
  }
});

// ============================================================================
// Facebook/Instagram OAuth Connect Flow
// ============================================================================

/**
 * GET /hub/oauth/facebook/connect
 * Initiate Facebook OAuth flow for a client (also covers Instagram)
 * Query params: clientId (required)
 */
router.post('/oauth/facebook/connect', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    const clientCheck = await query('SELECT id FROM users WHERE id = $1', [clientId]);
    if (!clientCheck.rows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const baseUrl = resolveBaseUrl(req);
    const redirectUri = `${baseUrl}/api/hub/oauth/facebook/callback`;
    
    const config = getFacebookOAuthConfig(redirectUri);
    
    if (!config.clientId || !config.clientSecret) {
      console.error('[oauth:facebook:connect] Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET');
      return res.status(500).json({ message: 'Facebook OAuth not configured. Check server environment variables.' });
    }

    const state = createOauthState();

    // Facebook doesn't use PKCE, but we still need to track state
    setOAuthCookies(res, 'facebook', {
      state,
      verifier: '', // Not used for Facebook
      clientId
    });

    const authUrl = buildFacebookAuthUrl(config, { state });
    
    console.log(`[oauth:facebook:connect] Generated OAuth URL for client ${clientId}`);
    res.json({ authUrl });
  } catch (err) {
    console.error('[oauth:facebook:connect]', err);
    res.status(500).json({ message: 'Failed to start OAuth flow' });
  }
});

/**
 * GET /hub/oauth-connections/:id/facebook-pages
 * Fetch Facebook Pages for an OAuth connection
 */
router.get('/oauth-connections/:id/facebook-pages', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    const { rows } = await query(
      'SELECT access_token, expires_at FROM oauth_connections WHERE id = $1 AND provider = $2',
      [connectionId, 'facebook']
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Facebook connection not found' });
    }

    let accessToken = rows[0].access_token;
    const expiresAt = rows[0].expires_at;

    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log(`[oauth:facebook:pages] Token expired, refreshing...`);
      accessToken = await refreshFacebookAccessToken(connectionId);
    }

    const pages = await fetchFacebookPages(accessToken);
    res.json({ pages });
  } catch (err) {
    console.error('[oauth:facebook:pages]', err);
    res.status(500).json({ message: 'Failed to fetch Facebook Pages' });
  }
});

/**
 * GET /hub/oauth-connections/:id/instagram-accounts
 * Fetch Instagram Business Accounts linked to Facebook Pages
 */
router.get('/oauth-connections/:id/instagram-accounts', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    const { rows } = await query(
      'SELECT access_token, expires_at FROM oauth_connections WHERE id = $1 AND provider = $2',
      [connectionId, 'facebook']
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Facebook connection not found' });
    }

    let accessToken = rows[0].access_token;
    const expiresAt = rows[0].expires_at;

    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log(`[oauth:instagram:accounts] Token expired, refreshing...`);
      accessToken = await refreshFacebookAccessToken(connectionId);
    }

    const accounts = await fetchInstagramAccounts(accessToken);
    res.json({ accounts });
  } catch (err) {
    console.error('[oauth:instagram:accounts]', err);
    res.status(500).json({ message: 'Failed to fetch Instagram accounts' });
  }
});

// ============================================================================
// TikTok OAuth Connect Flow
// ============================================================================

/**
 * GET /hub/oauth/tiktok/connect
 * Initiate TikTok OAuth flow for a client
 * Query params: clientId (required)
 */
router.post('/oauth/tiktok/connect', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    const clientCheck = await query('SELECT id FROM users WHERE id = $1', [clientId]);
    if (!clientCheck.rows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const baseUrl = resolveBaseUrl(req);
    const redirectUri = `${baseUrl}/api/hub/oauth/tiktok/callback`;
    
    const config = getTikTokOAuthConfig(redirectUri);
    
    if (!config.clientId || !config.clientSecret) {
      console.error('[oauth:tiktok:connect] Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET');
      return res.status(500).json({ message: 'TikTok OAuth not configured. Check server environment variables.' });
    }

    const state = createOauthState();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    setOAuthCookies(res, 'tiktok', {
      state,
      verifier: codeVerifier,
      clientId
    });

    const authUrl = buildTikTokAuthUrl(config, { state, codeChallenge });
    
    console.log(`[oauth:tiktok:connect] Generated OAuth URL for client ${clientId}`);
    res.json({ authUrl });
  } catch (err) {
    console.error('[oauth:tiktok:connect]', err);
    res.status(500).json({ message: 'Failed to start OAuth flow' });
  }
});

/**
 * GET /hub/oauth-connections/:id/tiktok-account
 * Fetch TikTok account info for an OAuth connection
 */
router.get('/oauth-connections/:id/tiktok-account', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    const { rows } = await query(
      'SELECT access_token, expires_at FROM oauth_connections WHERE id = $1 AND provider = $2',
      [connectionId, 'tiktok']
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'TikTok connection not found' });
    }

    let accessToken = rows[0].access_token;
    const expiresAt = rows[0].expires_at;

    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log(`[oauth:tiktok:account] Token expired, refreshing...`);
      accessToken = await refreshTikTokAccessToken(connectionId);
    }

    const account = await fetchTikTokAccountInfo(accessToken);
    res.json({ account });
  } catch (err) {
    console.error('[oauth:tiktok:account]', err);
    res.status(500).json({ message: 'Failed to fetch TikTok account info' });
  }
});

// ============================================================================
// WordPress OAuth Connect Flow
// ============================================================================

/**
 * GET /hub/oauth/wordpress/connect
 * Initiate WordPress OAuth flow for a client
 * Query params: clientId (required)
 */
router.post('/oauth/wordpress/connect', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    const clientCheck = await query('SELECT id FROM users WHERE id = $1', [clientId]);
    if (!clientCheck.rows.length) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const baseUrl = resolveBaseUrl(req);
    const redirectUri = `${baseUrl}/api/hub/oauth/wordpress/callback`;
    
    const config = getWordPressOAuthConfig(redirectUri);
    
    if (!config.clientId || !config.clientSecret) {
      console.error('[oauth:wordpress:connect] Missing WORDPRESS_CLIENT_ID or WORDPRESS_CLIENT_SECRET');
      return res.status(500).json({ message: 'WordPress OAuth not configured. Check server environment variables.' });
    }

    const state = createOauthState();

    // WordPress doesn't use PKCE
    setOAuthCookies(res, 'wordpress', {
      state,
      verifier: '', // Not used for WordPress
      clientId
    });

    const authUrl = buildWordPressAuthUrl(config, { state });
    
    console.log(`[oauth:wordpress:connect] Generated OAuth URL for client ${clientId}`);
    res.json({ authUrl });
  } catch (err) {
    console.error('[oauth:wordpress:connect]', err);
    res.status(500).json({ message: 'Failed to start OAuth flow' });
  }
});

/**
 * GET /hub/oauth-connections/:id/wordpress-sites
 * Fetch WordPress sites for an OAuth connection
 */
router.get('/oauth-connections/:id/wordpress-sites', requireAuth, isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    const { rows } = await query(
      'SELECT access_token, expires_at FROM oauth_connections WHERE id = $1 AND provider = $2',
      [connectionId, 'wordpress']
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'WordPress connection not found' });
    }

    let accessToken = rows[0].access_token;
    const expiresAt = rows[0].expires_at;

    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log(`[oauth:wordpress:sites] Token expired, refreshing...`);
      accessToken = await refreshWordPressAccessToken(connectionId);
    }

    const sites = await fetchWordPressSites(accessToken);
    res.json({ sites });
  } catch (err) {
    console.error('[oauth:wordpress:sites]', err);
    res.status(500).json({ message: 'Failed to fetch WordPress sites' });
  }
});

// ============================================================================
// OAuth Resources (Pages/Locations under a connection)
// ============================================================================

// List resources for a connection
router.get('/oauth-connections/:connectionId/resources', isAdminOrEditor, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM oauth_resources WHERE oauth_connection_id = $1 ORDER BY is_primary DESC, resource_name', [
      req.params.connectionId
    ]);
    res.json({ resources: rows });
  } catch (err) {
    console.error('[oauth-resources:list]', err);
    res.status(500).json({ message: 'Failed to fetch OAuth resources' });
  }
});

// List all resources for a client (across all connections)
router.get('/clients/:clientId/oauth-resources', isAdminOrEditor, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, c.provider_account_name as connection_name
       FROM oauth_resources r
       JOIN oauth_connections c ON r.oauth_connection_id = c.id
       WHERE r.client_id = $1
       ORDER BY r.provider, r.is_primary DESC, r.resource_name`,
      [req.params.clientId]
    );
    res.json({ resources: rows });
  } catch (err) {
    console.error('[oauth-resources:list-client]', err);
    res.status(500).json({ message: 'Failed to fetch OAuth resources' });
  }
});

// Create OAuth resource
router.post('/oauth-connections/:connectionId/resources', isAdminOrEditor, async (req, res) => {
  try {
    const connectionId = req.params.connectionId;

    // Get connection to inherit client_id and provider
    const connResult = await query('SELECT client_id, provider FROM oauth_connections WHERE id = $1', [connectionId]);
    if (!connResult.rows.length) return res.status(404).json({ message: 'Connection not found' });
    const { client_id, provider } = connResult.rows[0];

    const { resource_type, resource_id, resource_name, resource_username, resource_url, is_primary } = req.body;

    if (!resource_type || !resource_id || !resource_name) {
      return res.status(400).json({ message: 'resource_type, resource_id, and resource_name are required' });
    }

    // If setting as primary, unset other primaries for this connection
    if (is_primary) {
      await query('UPDATE oauth_resources SET is_primary = FALSE WHERE oauth_connection_id = $1', [connectionId]);
    }

    const { rows } = await query(
      `INSERT INTO oauth_resources 
       (client_id, oauth_connection_id, provider, resource_type, resource_id, resource_name, resource_username, resource_url, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        client_id,
        connectionId,
        provider,
        resource_type,
        resource_id,
        resource_name,
        resource_username || null,
        resource_url || null,
        is_primary || false
      ]
    );
    res.json({ resource: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Resource already exists for this connection' });
    }
    console.error('[oauth-resources:create]', err);
    res.status(500).json({ message: 'Failed to create OAuth resource' });
  }
});

// Update OAuth resource
router.put('/oauth-resources/:id', isAdminOrEditor, async (req, res) => {
  try {
    const { resource_name, resource_username, resource_url, is_primary, is_enabled } = req.body;

    // If setting as primary, unset other primaries
    if (is_primary === true) {
      const resourceResult = await query('SELECT oauth_connection_id FROM oauth_resources WHERE id = $1', [req.params.id]);
      if (resourceResult.rows.length) {
        await query('UPDATE oauth_resources SET is_primary = FALSE WHERE oauth_connection_id = $1 AND id != $2', [
          resourceResult.rows[0].oauth_connection_id,
          req.params.id
        ]);
      }
    }

    const { rows } = await query(
      `UPDATE oauth_resources 
       SET resource_name = COALESCE($1, resource_name),
           resource_username = COALESCE($2, resource_username),
           resource_url = COALESCE($3, resource_url),
           is_primary = COALESCE($4, is_primary),
           is_enabled = COALESCE($5, is_enabled),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [resource_name, resource_username, resource_url, is_primary, is_enabled, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Resource not found' });
    res.json({ resource: rows[0] });
  } catch (err) {
    console.error('[oauth-resources:update]', err);
    res.status(500).json({ message: 'Failed to update OAuth resource' });
  }
});

// Delete OAuth resource
router.delete('/oauth-resources/:id', isAdminOrEditor, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM oauth_resources WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Resource not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[oauth-resources:delete]', err);
    res.status(500).json({ message: 'Failed to delete OAuth resource' });
  }
});

// AI: Generate a hero image for a blog post (Imagen)
router.post('/blog-posts/ai/image', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { title, style = 'clean, modern, professional', aspectRatio = '16:9' } = req.body || {};

  if (!title) return res.status(400).json({ message: 'Title is required' });

  try {
    const brandResult = await query(
      'SELECT business_name, business_description, website_url FROM brand_assets WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const businessName = brandResult.rows[0]?.business_name?.trim() || 'Your Business';
    const businessDescription = brandResult.rows[0]?.business_description?.trim() || '';

    const prompt = `Create a high-quality blog hero image.

Topic: ${title}
Brand/Business: ${businessName}
Context: ${businessDescription}

Style: ${style}

Constraints:
- No text in the image.
- No logos or brand marks.
- Photorealistic or tasteful illustration is fine.
- Suitable as a website hero/banner image.`;

    const { mimeType, bytesBase64Encoded } = await generateImagenImage({
      prompt,
      aspectRatio: String(aspectRatio || '16:9'),
      sampleCount: 1
    });

    const dataUrl = `data:${mimeType};base64,${bytesBase64Encoded}`;
    res.json({ dataUrl, mimeType });
  } catch (err) {
    console.error('[blog:ai:image]', err);
    res.status(500).json({ message: err.message || 'Unable to generate image' });
  }
});

export default router;
