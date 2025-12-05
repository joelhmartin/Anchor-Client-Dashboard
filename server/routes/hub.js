import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
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
  fetchPhoneInteractionSources
} from '../services/ctm.js';
import { generateAiResponse } from '../services/ai.js';
import { sendMailgunMessage, isMailgunConfigured } from '../services/mailgun.js';
import {
  createNotification,
  createNotificationsForAdmins,
  fetchUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyAdminsByEmail
} from '../services/notifications.js';

const router = express.Router();
const APP_BASE_URL =
  (process.env.APP_BASE_URL ||
    (process.env.NODE_ENV === 'production' ? process.env.CLIENT_APP_URL : process.env.VITE_APP_BASE_NAME) ||
    'http://localhost:3000').replace(/\/$/, '');
const ONBOARDING_TOKEN_TTL_HOURS = parseInt(process.env.ONBOARDING_TOKEN_TTL_HOURS || '72', 10);
const JOURNEY_TEMPLATE_KEY_PREFIX = 'journey_template';
const JOURNEY_STATUS_OPTIONS = ['pending', 'in_progress', 'active_client', 'won', 'lost', 'archived'];

const DEFAULT_JOURNEY_TEMPLATE = [
  {
    id: 'week-2-follow-up',
    label: 'Week 2 Call + Text/Email',
    channel: 'call,text,email',
    offset_weeks: 2,
    message:
      'First follow-up after consult. Encourage the exam, highlight diagnosis, treatment plan, and financing options.',
    tone: 'supportive'
  },
  {
    id: 'week-4-follow-up',
    label: 'Week 4 Call + Text/Email',
    channel: 'call,text,email',
    offset_weeks: 4,
    message: 'Second follow-up. Remind them the exam is 2 hours, $450, includes full diagnosis & plan.',
    tone: 'educational'
  },
  {
    id: 'week-6-follow-up',
    label: 'Week 6 Call + Text/Email',
    channel: 'call,text,email',
    offset_weeks: 6,
    message: 'Third follow-up. Offer clarity on treatment, emphasize payment flexibility.',
    tone: 'encouraging'
  },
  {
    id: 'week-8-follow-up',
    label: 'Week 8 Call + Text/Email',
    channel: 'call,text,email',
    offset_weeks: 8,
    message: 'Fourth follow-up. Reinforce importance of exam to understand symptoms.',
    tone: 'empathetic'
  },
  {
    id: 'week-10-follow-up',
    label: 'Week 10 Call + Text/Email',
    channel: 'call,text,email',
    offset_weeks: 10,
    message: 'Fifth follow-up. Keep the door open, invite questions about timing or financing.',
    tone: 'reassuring'
  },
  {
    id: 'week-12-follow-up',
    label: 'Week 12 Final Follow-Up',
    channel: 'call,text,email',
    offset_weeks: 12,
    message: 'Final touchpoint inviting them to schedule when ready, remind of value of exam.',
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
      const dueAt = offsetWeeks
        ? new Date(now + offsetWeeks * 7 * 24 * 60 * 60 * 1000)
        : null;
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
  const conditions = ['owner_user_id = $1'];
  const showArchivedOnly = filters.archived === true;
  const includeArchived = filters.includeArchived === true;
  if (filters.id) {
    params.push(filters.id);
    conditions.push(`id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (showArchivedOnly) {
    conditions.push('archived_at IS NOT NULL');
  } else if (!includeArchived) {
    conditions.push('archived_at IS NULL');
  }
  const sql = `SELECT *
               FROM client_journeys
               ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
               ORDER BY created_at DESC`;
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
    const authorName =
      [note.first_name, note.last_name].filter(Boolean).join(' ').trim() ||
      note.email ||
      'Unknown';
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
    notes: noteMap.get(row.id) || []
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

router.use(requireAuth);

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
    client.display_name ||
    [client.first_name, client.last_name].filter(Boolean).join(' ').trim() ||
    client.email ||
    'Client';

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
          const { rows: accountManagers } = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [
            managerEmail
          ]);
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
        managerName =
          [adminRows[0].first_name, adminRows[0].last_name].filter(Boolean).join(' ').trim() || 'Admin Team';
      }
    }
  }

  if (!managerEmail && !notificationUserId) return { client, clientName };

  return { client, clientName, managerEmail, managerName, notificationUserId };
}

async function notifyAccountManagerOfBlogPost(userId, blogPost) {
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
  const emailHtml = `<p>Hi ${managerName || 'there'},</p>
<p><strong>${clientName}</strong> just created a new blog post titled <strong>${blogTitle}</strong> (status: ${statusLabel}).</p>
<p><a href="${APP_BASE_URL}/admin" target="_blank" rel="noopener">Open the admin hub</a> to review it.</p>
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
    await sendMailgunMessage({
      to: managerEmail,
      subject: `${clientName} just created a new blog post`,
      text: emailText,
      html: emailHtml
    });
  }
}

router.get('/profile', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const { rows } = await query(
    `SELECT u.*, cp.monthly_revenue_goal 
     FROM users u 
     LEFT JOIN client_profiles cp ON cp.user_id = u.id 
     WHERE u.id = $1`,
    [userId]
  );
  res.json({ user: rows[0] || req.user });
});

router.put('/profile', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  const isSelfUpdate = req.user.id === userId;
  const canOverridePassword = !isSelfUpdate && req.user.role === 'admin';
  const { first_name, last_name, email, password, new_password, monthly_revenue_goal } = req.body || {};
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
  if (!updates.length && !new_password && monthly_revenue_goal === undefined) {
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
    
    // Update monthly_revenue_goal in client_profiles
    if (monthly_revenue_goal !== undefined) {
      const profileExists = await query('SELECT user_id FROM client_profiles WHERE user_id = $1', [userId]);
      if (profileExists.rows.length) {
        await query('UPDATE client_profiles SET monthly_revenue_goal = $1 WHERE user_id = $2', [monthly_revenue_goal || null, userId]);
      } else {
        await query('INSERT INTO client_profiles (user_id, monthly_revenue_goal) VALUES ($1, $2)', [userId, monthly_revenue_goal || null]);
      }
    }
    
    const refreshed = await query(
      `SELECT u.*, cp.monthly_revenue_goal 
       FROM users u 
       LEFT JOIN client_profiles cp ON cp.user_id = u.id 
       WHERE u.id = $1`,
      [userId]
    );
    res.json({ user: refreshed.rows[0] });
  } catch (err) {
    console.error('[profile]', err);
    res.status(500).json({ message: 'Unable to update profile' });
  }
});

router.post('/profile/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = publicUrl(req.file.path);
  const targetUserId = req.portalUserId || req.user.id;
  await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, targetUserId]);
  res.json({ avatar_url: url });
});

router.get('/brand', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [targetUserId]);
  const brand =
    rows[0] || {
      business_name: '',
      business_description: '',
      logos: [],
      style_guides: [],
      brand_notes: '',
      website_admin_email: '',
      website_url: '',
      ga_emails: '',
      meta_bm_email: '',
      social_links: {},
      pricing_list_url: '',
      promo_calendar_url: ''
    };
  res.json({ brand });
});

router.get('/brand/admin/:userId', isAdminOrEditor, async (req, res) => {
  const target = req.params.userId;
  const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [target]);
  const brand =
    rows[0] || {
      logos: [],
      style_guides: [],
      brand_notes: '',
      website_admin_email: '',
      website_url: '',
      ga_emails: '',
      meta_bm_email: '',
      social_links: {},
      pricing_list_url: '',
      promo_calendar_url: ''
    };
  res.json({ brand });
});

router.put('/brand/admin/:userId', uploadBrand.none(), isAdminOrEditor, async (req, res) => {
  const target = req.params.userId;
  try {
    const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [target]);
    const existing = rows[0] || {
      logos: [],
      style_guides: [],
      social_links: {}
    };

    const payload = {
      logos: existing.logos || [],
      style_guides: existing.style_guides || [],
      brand_notes: req.body.brand_notes || existing.brand_notes || '',
      website_admin_email: req.body.website_admin_email || existing.website_admin_email || '',
      website_url: req.body.website_url || existing.website_url || '',
      ga_emails: req.body.ga_emails || existing.ga_emails || '',
      meta_bm_email: req.body.meta_bm_email || existing.meta_bm_email || '',
      social_links: req.body.social_links ? JSON.parse(req.body.social_links) : existing.social_links || {},
      pricing_list_url: req.body.pricing_list_url || existing.pricing_list_url || '',
      promo_calendar_url: req.body.promo_calendar_url || existing.promo_calendar_url || ''
    };

    if (rows[0]) {
      await query(
        `UPDATE brand_assets
         SET logos=$1, style_guides=$2, brand_notes=$3, website_admin_email=$4, website_url=$5, ga_emails=$6, meta_bm_email=$7,
             social_links=$8, pricing_list_url=$9, promo_calendar_url=$10, updated_at=NOW()
         WHERE user_id=$11`,
        [
          JSON.stringify(payload.logos),
          JSON.stringify(payload.style_guides),
          payload.brand_notes,
          payload.website_admin_email,
          payload.website_url,
          payload.ga_emails,
          payload.meta_bm_email,
          JSON.stringify(payload.social_links),
          payload.pricing_list_url,
          payload.promo_calendar_url,
          target
        ]
      );
    } else {
      await query(
        `INSERT INTO brand_assets (user_id, logos, style_guides, brand_notes, website_admin_email, website_url, ga_emails, meta_bm_email, social_links, pricing_list_url, promo_calendar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          target,
          JSON.stringify(payload.logos),
          JSON.stringify(payload.style_guides),
          payload.brand_notes,
          payload.website_admin_email,
          payload.website_url,
          payload.ga_emails,
          payload.meta_bm_email,
          JSON.stringify(payload.social_links),
          payload.pricing_list_url,
          payload.promo_calendar_url
        ]
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
        style_guides: [],
        social_links: {}
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
        website_admin_email: req.body.website_admin_email || existing.website_admin_email || '',
        website_url: req.body.website_url || existing.website_url || '',
        ga_emails: req.body.ga_emails || existing.ga_emails || '',
        meta_bm_email: req.body.meta_bm_email || existing.meta_bm_email || '',
        social_links: req.body.social_links ? JSON.parse(req.body.social_links) : existing.social_links || {},
        pricing_list_url: req.body.pricing_list_url || existing.pricing_list_url || '',
        promo_calendar_url: req.body.promo_calendar_url || existing.promo_calendar_url || ''
      };

      if (rows[0]) {
        await query(
          `UPDATE brand_assets
           SET business_name=$1, business_description=$2, logos=$3, style_guides=$4, brand_notes=$5, 
               website_admin_email=$6, website_url=$7, ga_emails=$8, meta_bm_email=$9, social_links=$10, 
               pricing_list_url=$11, promo_calendar_url=$12, updated_at=NOW()
           WHERE user_id=$13`,
          [
            payload.business_name,
            payload.business_description,
            JSON.stringify(payload.logos),
            JSON.stringify(payload.style_guides),
            payload.brand_notes,
            payload.website_admin_email,
            payload.website_url,
            payload.ga_emails,
            payload.meta_bm_email,
            JSON.stringify(payload.social_links),
            payload.pricing_list_url,
            payload.promo_calendar_url,
            targetUserId
          ]
        );
      } else {
        await query(
          `INSERT INTO brand_assets (user_id, business_name, business_description, logos, style_guides, brand_notes, website_admin_email, website_url, ga_emails, meta_bm_email, social_links, pricing_list_url, promo_calendar_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            targetUserId,
            payload.business_name,
            payload.business_description,
            JSON.stringify(payload.logos),
            JSON.stringify(payload.style_guides),
            payload.brand_notes,
            payload.website_admin_email,
            payload.website_url,
            payload.ga_emails,
            payload.meta_bm_email,
            JSON.stringify(payload.social_links),
            payload.pricing_list_url,
            payload.promo_calendar_url
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
  const adminLink = `${APP_BASE_URL}/client-hub`;

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
  await query(
    'UPDATE documents SET review_status=$1, review_requested_at=$2 WHERE id=$3 AND user_id=$4 AND type != $5',
    [status, status === 'pending' ? new Date() : null, doc_id, user_id, 'default']
  );

  if (status === 'pending') {
    const [{ rows: docRows }, { rows: userRows }] = await Promise.all([
      query('SELECT label, name FROM documents WHERE id = $1', [doc_id]),
      query('SELECT email, first_name FROM users WHERE id = $1', [user_id])
    ]);
    const docInfo = docRows[0] || {};
    const clientInfo = userRows[0] || {};
    const docLabel = docInfo.label || docInfo.name || 'Document';
    const portalLink = `${APP_BASE_URL}/portal?tab=documents`;
    await createNotification({
      userId: user_id,
      title: 'Document ready for review',
      body: `${docLabel} was flagged for your review by the admin team.`,
      linkUrl: '/portal?tab=documents',
      meta: { document_id: doc_id, action: 'review_requested' }
    });
    if (isMailgunConfigured() && clientInfo.email) {
      await sendMailgunMessage({
        to: clientInfo.email,
        subject: 'A document needs your review',
        text: `Hi ${clientInfo.first_name || ''},\n\n"${docLabel}" has been flagged for your review. Visit your client portal to respond: ${portalLink}`,
        html: `<p>Hi ${clientInfo.first_name || 'there'},</p><p><strong>${docLabel}</strong> has been flagged for your review. Visit your client portal to respond.</p><p><a href="${portalLink}" target="_blank" rel="noopener">Open Client Portal</a></p>`
      });
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

router.post('/clients/:id/onboarding-email', isAdminOrEditor, async (req, res) => {
  if (!isMailgunConfigured()) {
    return res.status(400).json({ message: 'Mailgun is not configured' });
  }
  const clientId = req.params.id;
  const { rows } = await query('SELECT id, email, first_name, last_name FROM users WHERE id = $1', [clientId]);
  if (!rows.length) return res.status(404).json({ message: 'Client not found' });
  const clientUser = rows[0];
  const token = uuidv4();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ONBOARDING_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await query('DELETE FROM client_onboarding_tokens WHERE user_id = $1', [clientId]);
  await query(
    `INSERT INTO client_onboarding_tokens (user_id, token_hash, expires_at, metadata)
     VALUES ($1,$2,$3,$4)`,
    [clientId, tokenHash, expiresAt, JSON.stringify({ created_by: req.user.id })]
  );

  const onboardingUrl = `${APP_BASE_URL}/onboarding/${token}`;
  const subject = 'Anchor Client Onboarding';
  const greeting = clientUser.first_name
    ? `Hi ${clientUser.first_name},`
    : 'Hi there,';
  const text = `${greeting}

We created your Anchor account. Click the link below to finish onboarding, set your password, confirm services, and share brand details.

${onboardingUrl}

If you were not expecting this email, ignore it.`;
  const html = `<p>${greeting}</p>
<p>We created your Anchor account. Use the button below to finish onboarding, set your password, confirm services, and share brand details.</p>
<p><a href="${onboardingUrl}" style="background:#0f6efd;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;display:inline-block;">Complete Onboarding</a></p>
<p>If you were not expecting this email, you can safely ignore it.</p>`;

  await sendMailgunMessage({
    to: clientUser.email,
    subject,
    text,
    html
  });
  logEvent('mailgun:onboarding', 'Onboarding email queued', { clientId, email: clientUser.email });
  res.json({ message: 'Onboarding email sent' });
});

router.get('/notifications', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
  try {
    const { notifications, unread } = await fetchUserNotifications(userId, Number(req.query.limit) || 25);
    res.json({ notifications, unread });
  } catch (err) {
    console.error('[notifications:list]', err);
    res.status(500).json({ message: 'Unable to load notifications' });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  const userId = req.portalUserId || req.user.id;
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
  const userId = req.portalUserId || req.user.id;
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
    const response = await sendMailgunMessage({
      to,
      subject: resolvedSubject,
      text: bodyText,
      html
    });
    logEvent('mailgun:test', 'Mailgun test email sent', { id: response.id, message: response.message });
    res.json({ id: response.id, message: response.message });
  } catch (err) {
    logEvent('mailgun:test', 'Failed to send test email', { error: err.message });
    res.status(500).json({ message: err.message || 'Unable to send email' });
  }
});

router.get('/clients', isAdminOrEditor, async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, cp.*,
            COALESCE(cp.ai_prompt, $1) as ai_prompt
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'client'
     ORDER BY u.created_at DESC`,
    [DEFAULT_AI_PROMPT]
  );
  res.json({ clients: rows });
});

router.post('/clients', isAdminOrEditor, async (req, res) => {
  try {
    const { email, name, role } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const newRole = role === 'editor' ? (req.user.role === 'admin' ? 'editor' : 'client') : 'client';
    const existing = await query('SELECT id, email, first_name, last_name FROM users WHERE email = $1 LIMIT 1', [email]);
    const [first, ...rest] = (name || '').trim().split(' ').filter(Boolean);
    const last = rest.join(' ');
    if (existing.rows.length) {
      const updated = await query(
        'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 RETURNING id, first_name, last_name, email, role',
        [first || existing.rows[0].first_name, last || existing.rows[0].last_name, existing.rows[0].id]
      );
      res.json({ client: updated.rows[0], created: false });
    } else {
      const password = uuidv4();
      const hash = await bcrypt.hash(password, 12);
      const inserted = await query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, first_name, last_name, email, role`,
        [first || email.split('@')[0], last || '', email.toLowerCase(), hash, newRole]
      );
      // ensure profile row
      await query('INSERT INTO client_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [inserted.rows[0].id]);
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
  const clientId = req.params.id;
  const {
    display_name,
    user_email,
    role,
    client_type,
    client_subtype,
    looker_url,
    monday_board_id,
    monday_group_id,
    monday_active_group_id,
    monday_completed_group_id,
    client_identifier_value,
    account_manager_person_id,
    ai_prompt,
    ctm_account_number,
    ctm_api_key,
    ctm_api_secret,
    auto_star_enabled
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
  if (role && req.user.role === 'admin') {
    const nextRole = ['client', 'editor', 'admin'].includes(role) ? role : 'client';
    await query('UPDATE users SET role=$1 WHERE id=$2', [nextRole, clientId]);
  }
  const exists = await query('SELECT user_id FROM client_profiles WHERE user_id = $1', [clientId]);
  const params = [
    looker_url || null,
    monday_board_id || null,
    monday_group_id || null,
    monday_active_group_id || null,
    monday_completed_group_id || null,
    client_identifier_value || null,
    account_manager_person_id || null,
    ai_prompt || null,
    ctm_account_number || null,
    ctm_api_key || null,
    ctm_api_secret || null,
    auto_star_enabled !== undefined ? auto_star_enabled : false,
    client_type || null,
    client_subtype || null,
    clientId
  ];
  if (exists.rows.length) {
    await query(
      `UPDATE client_profiles
         SET looker_url=$1,monday_board_id=$2,monday_group_id=$3,monday_active_group_id=$4,monday_completed_group_id=$5,
             client_identifier_value=$6, account_manager_person_id=$7, ai_prompt=$8, ctm_account_number=$9, ctm_api_key=$10, ctm_api_secret=$11,
             auto_star_enabled=$12, client_type=$13, client_subtype=$14, updated_at=NOW()
       WHERE user_id=$15`,
      params
    );
  } else {
    await query(
      `INSERT INTO client_profiles (looker_url,monday_board_id,monday_group_id,monday_active_group_id,monday_completed_group_id,client_identifier_value,account_manager_person_id,ai_prompt,ctm_account_number,ctm_api_key,ctm_api_secret,auto_star_enabled,client_type,client_subtype,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      params
    );
  }
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, cp.*
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.id=$1`,
    [clientId]
  );
  res.json({ client: rows[0] });
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
      const inserted = await query(
        'INSERT INTO services (user_id, name, description, base_price) VALUES ($1,$2,$3,$4) RETURNING *',
        [targetClientId, name, '', 0]
      );
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
    const profile = (
      await query(
        `SELECT * FROM client_profiles WHERE user_id = $1`,
        [targetUserId]
      )
    ).rows[0] || {};

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
          const statusLabel = isRush
            ? settings.monday_rush_status_label || 'Rush Job'
            : settings.monday_status_label || 'Assigned';
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
    logEvent('requests:create', 'request stored', { user: targetUserId, requestId: savedRequest?.id, mondayItemId: mondayItem?.id || null });

    if (isRush) {
      try {
        const contact = await resolveAccountManagerContact(targetUserId, { settings });
        if (contact && (contact.managerEmail || contact.notificationUserId)) {
          const mondayBaseUrl = (settings?.monday_account_url || 'https://app.monday.com').replace(/\/$/, '');
          const mondayLink =
            mondayItem?.id && profile.monday_board_id
              ? `${mondayBaseUrl}/boards/${profile.monday_board_id}/pulses/${mondayItem.id}`
              : null;
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
            await sendMailgunMessage({
              to: contact.managerEmail,
              subject: 'Rush Job Requested',
              text: textLines.join('\n'),
              html: htmlSections.join('')
            });
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
        columnIds: [
          settings.monday_status_column_id,
          settings.monday_due_date_column_id,
          settings.monday_client_files_column_id
        ].filter(Boolean)
      });
      
      logEvent('requests:list', 'Monday groups fetched', {
        user: targetUserId,
        groupCount: groups.length,
        groupIds: groups.map(g => ({ id: g.id, title: g.title, itemCount: g.items?.length || 0 }))
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

router.get('/calls', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const cached = await query('SELECT * FROM call_logs WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST', [targetUserId]);
  let cachedCalls = buildCallsFromCache(cached.rows);
  cachedCalls = await attachJourneyMetaToCalls(targetUserId, cachedCalls);

  const respondWithCache = (extra = {}) => res.json({ calls: cachedCalls, ...extra });

  const profileRes = await query(
    'SELECT ctm_account_number, ctm_api_key, ctm_api_secret, ai_prompt FROM client_profiles WHERE user_id=$1 LIMIT 1',
    [targetUserId]
  );
  const profile = profileRes.rows[0] || {};
  const credentials = {
    accountId: profile.ctm_account_number,
    apiKey: profile.ctm_api_key,
    apiSecret: profile.ctm_api_secret
  };

  if (!credentials.accountId || !credentials.apiKey || !credentials.apiSecret) {
    logEvent('calls:list', 'CTM credentials missing for client', {
      userId: targetUserId,
      hasAccount: !!credentials.accountId,
      hasKey: !!credentials.apiKey,
      hasSecret: !!credentials.apiSecret
    });
    return respondWithCache({ message: 'CallTrackingMetrics credentials not configured for this client.' });
  }

  try {
    logEvent('calls:list', 'Pulling calls from CTM', {
      userId: targetUserId,
      promptLength: (profile.ai_prompt || DEFAULT_AI_PROMPT)?.length || 0
    });
    const freshCalls = await pullCallsFromCtm({
      credentials,
      prompt: profile.ai_prompt || DEFAULT_AI_PROMPT,
      existingRows: cached.rows,
      autoStarEnabled: profile.auto_star_enabled || false
    });

    if (freshCalls.length) {
      // Save calls to database
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
        logEvent('calls:auto-star', `Auto-starring ${autoStarredCalls.length} call(s)`, { userId: targetUserId });
        await Promise.all(
          autoStarredCalls.map(async ({ call }) => {
            try {
              await postSaleToCTM(credentials, call.id, {
                score: call.score,
                conversion: 1,
                value: 0
              });
            } catch (err) {
              console.error('[calls:auto-star] Failed to post score to CTM', { callId: call.id, error: err.message });
            }
          })
        );
      }
    }

    const refreshed = await query('SELECT * FROM call_logs WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST', [targetUserId]);
    let shaped = buildCallsFromCache(refreshed.rows);
    shaped = await attachJourneyMetaToCalls(targetUserId, shaped);
    return res.json({ calls: shaped });
  } catch (err) {
    console.error('[calls:list]', err);
    return respondWithCache({ stale: true, message: 'Unable to fetch latest calls. Showing cached data.' });
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
    const profileRes = await query(
      'SELECT ctm_account_number, ctm_api_key, ctm_api_secret FROM client_profiles WHERE user_id=$1 LIMIT 1',
      [targetUserId]
    );
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
    const profileRes = await query(
      'SELECT ctm_account_number, ctm_api_key, ctm_api_secret FROM client_profiles WHERE user_id=$1 LIMIT 1',
      [targetUserId]
    );
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

router.post('/calls/reset-cache', requireAdmin, async (_req, res) => {
  res.json({ message: 'Call cache reset (noop stub)' });
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
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
    notes_summary
  } = req.body || {};

  if (!client_name && !client_phone && !client_email && !lead_call_id) {
    return res.status(400).json({ message: 'Client name or contact info is required' });
  }

  const normalizedSymptoms = sanitizeSymptomList(symptoms);
  const symptomsJsonPayload = JSON.stringify(normalizedSymptoms);
  const desiredStatus = JOURNEY_STATUS_OPTIONS.includes(status) ? status : 'pending';
  const nextActionAt = parseDateValue(next_action_at);

  const findExisting = async (callKey) => {
    if (callKey) {
      const { rows } = await query(
        'SELECT id FROM client_journeys WHERE owner_user_id = $1 AND lead_call_key = $2 LIMIT 1',
        [ownerId, callKey]
      );
      if (rows.length) return rows[0].id;
    }
    if (active_client_id) {
      const { rows } = await query(
        'SELECT id FROM client_journeys WHERE owner_user_id = $1 AND active_client_id = $2 LIMIT 1',
        [ownerId, active_client_id]
      );
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
             updated_at = NOW()
         WHERE id = $10 AND owner_user_id = $11`,
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
           notes_summary
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11)
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
          notes_summary || null
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
    desiredStatus && JOURNEY_STATUS_OPTIONS.includes(desiredStatus) && desiredStatus !== 'archived'
      ? desiredStatus
      : null;
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
  const { rows } = await query('SELECT id FROM client_journeys WHERE id = $1 AND owner_user_id = $2 LIMIT 1', [
    journeyId,
    ownerId
  ]);
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
    await query('INSERT INTO client_journey_notes (journey_id, author_id, body) VALUES ($1,$2,$3)', [
      id,
      authorId,
      body.trim()
    ]);
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
    const { rows } = await query(
      'INSERT INTO services (user_id, name, description, base_price) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, name, description || null, base_price || null]
    );
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
      const existingClient = await query(
        'SELECT id, source FROM active_clients WHERE owner_user_id = $1 AND client_phone = $2',
        [userId, clientPhone]
      );
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
    const { rows } = await query(`
      UPDATE client_services 
      SET redacted_at = NOW()
      WHERE redacted_at IS NULL 
        AND agreed_date < NOW() - INTERVAL '90 days'
        AND active_client_id IN (
          SELECT id FROM active_clients WHERE owner_user_id = $1
        )
      RETURNING id
    `, [userId]);
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
    const { rows } = await query(
      'SELECT * FROM blog_posts WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
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
    const { rows } = await query(
      'SELECT * FROM blog_posts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
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
      await notifyAccountManagerOfBlogPost(userId, newPost);
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
    
    const { rows } = await query(
      `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );
    
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
    const { rowCount } = await query(
      'DELETE FROM blog_posts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
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
    const brandResult = await query('SELECT business_name, business_description, website_url FROM brand_assets WHERE user_id = $1 LIMIT 1', [userId]);
    const servicesResult = await query('SELECT COALESCE(name, \'\') AS name, COALESCE(description, \'\') AS description FROM services WHERE user_id = $1 AND active = true', [userId]);
    
    const businessName = brandResult.rows[0]?.business_name?.trim() || 'Your Business';
    const businessDescription = brandResult.rows[0]?.business_description?.trim() || 'A growing service provider.';
    const websiteUrl = brandResult.rows[0]?.website_url?.trim() || 'https://example.com';
    const servicesList = servicesResult.rows
      .map((s) => s.name ? `${s.name}${s.description ? ` - ${s.description}` : ''}` : '')
      .filter(Boolean);
    const servicesText = servicesList.length ? servicesList.map((line, idx) => `${idx + 1}. ${line}`).join('\n') : 'No services have been configured yet.';
    
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
    
    const ideas = responseText.split('\n').map((line) => line.replace(/^\d+[\).\s-]+/, '').trim()).filter(Boolean);
    
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
    const brandResult = await query('SELECT business_name, business_description, website_url FROM brand_assets WHERE user_id = $1 LIMIT 1', [userId]);
    const servicesResult = await query('SELECT COALESCE(name, \'\') AS name, COALESCE(description, \'\') AS description FROM services WHERE user_id = $1 AND active = true', [userId]);
    
    const businessName = brandResult.rows[0]?.business_name?.trim() || 'Your Business';
    const businessDescription = brandResult.rows[0]?.business_description?.trim() || 'A growing service provider.';
    const websiteUrl = brandResult.rows[0]?.website_url?.trim() || 'https://example.com';
    const servicesList = servicesResult.rows
      .map((s) => s.name ? `${s.name}${s.description ? ` - ${s.description}` : ''}` : '')
      .filter(Boolean);
    const servicesText = servicesList.length ? servicesList.map((line, idx) => `${idx + 1}. ${line}`).join('\n') : 'No services have been configured yet.';
    
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
7. Add relevant internal linking opportunities (use placeholder URLs like #service-name)
8. Make it engaging and valuable to readers

Write the complete blog post content in HTML:`;
    
    logEvent('blog:ai:draft', 'Prompt built', { userId, prompt });
    const content = await generateAiResponse({
      prompt,
      systemPrompt: 'You are an expert marketing copywriter who produces long-form, SEO optimized HTML blog posts.',
      temperature: 0.55,
      maxTokens: 1500
    });
    
    logEvent('blog:ai:draft', 'Generated blog draft', { userId, title });
    res.json({ content });
  } catch (err) {
    logEvent('blog:ai:draft', 'Error generating draft', { error: err.message, userId });
    res.status(500).json({ message: 'Unable to generate blog draft' });
  }
});

export default router;
