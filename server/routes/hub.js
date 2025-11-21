import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import bcrypt from 'bcryptjs';

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
  buildRequestColumnValues,
  createRequestItem,
  listItemsByGroups
} from '../services/monday.js';
import { DEFAULT_AI_PROMPT, pullCallsFromCtm, buildCallsFromCache } from '../services/ctm.js';

const router = express.Router();

function logEvent(scope, message, payload = {}) {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] [${scope}] ${message}${Object.keys(payload).length ? ` :: ${JSON.stringify(payload)}` : ''}`);
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

function publicUrl(filePath) {
  const rel = path.relative(uploadRoot, filePath);
  return `/uploads/${rel}`.replace(/\\/g, '/');
}

router.use(requireAuth);

router.get('/profile', async (req, res) => {
  res.json({ user: req.user });
});

router.put('/profile', async (req, res) => {
  const { first_name, last_name, email, password, new_password } = req.body || {};
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
  if (!updates.length && !new_password) {
    return res.status(400).json({ message: 'No changes provided' });
  }
  try {
    if (new_password) {
      if (!password) return res.status(400).json({ message: 'Current password required' });
      const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const hash = rows[0]?.password_hash;
      const valid = hash && (await bcrypt.compare(password, hash));
      if (!valid) return res.status(400).json({ message: 'Current password incorrect' });
      updates.push('password_hash = $' + (params.length + 1));
      params.push(await bcrypt.hash(new_password, 12));
    }
    if (updates.length) {
      params.push(req.user.id);
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }
    const refreshed = await query('SELECT id, first_name, last_name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    res.json({ user: refreshed.rows[0] });
  } catch (err) {
    console.error('[profile]', err);
    res.status(500).json({ message: 'Unable to update profile' });
  }
});

router.post('/profile/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = publicUrl(req.file.path);
  await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, req.user.id]);
  res.json({ avatar_url: url });
});

router.get('/brand', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const { rows } = await query('SELECT * FROM brand_assets WHERE user_id = $1 LIMIT 1', [targetUserId]);
  const brand =
    rows[0] || {
      logos: [],
      style_guides: [],
      brand_notes: '',
      website_admin_email: '',
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
      ga_emails: req.body.ga_emails || existing.ga_emails || '',
      meta_bm_email: req.body.meta_bm_email || existing.meta_bm_email || '',
      social_links: req.body.social_links ? JSON.parse(req.body.social_links) : existing.social_links || {},
      pricing_list_url: req.body.pricing_list_url || existing.pricing_list_url || '',
      promo_calendar_url: req.body.promo_calendar_url || existing.promo_calendar_url || ''
    };

    if (rows[0]) {
      await query(
        `UPDATE brand_assets
         SET logos=$1, style_guides=$2, brand_notes=$3, website_admin_email=$4, ga_emails=$5, meta_bm_email=$6,
             social_links=$7, pricing_list_url=$8, promo_calendar_url=$9, updated_at=NOW()
         WHERE user_id=$10`,
        [
          JSON.stringify(payload.logos),
          JSON.stringify(payload.style_guides),
          payload.brand_notes,
          payload.website_admin_email,
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
        `INSERT INTO brand_assets (user_id, logos, style_guides, brand_notes, website_admin_email, ga_emails, meta_bm_email, social_links, pricing_list_url, promo_calendar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          target,
          JSON.stringify(payload.logos),
          JSON.stringify(payload.style_guides),
          payload.brand_notes,
          payload.website_admin_email,
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
        logos,
        style_guides: styleGuides,
        brand_notes: req.body.brand_notes || existing.brand_notes || '',
        website_admin_email: req.body.website_admin_email || existing.website_admin_email || '',
        ga_emails: req.body.ga_emails || existing.ga_emails || '',
        meta_bm_email: req.body.meta_bm_email || existing.meta_bm_email || '',
        social_links: req.body.social_links ? JSON.parse(req.body.social_links) : existing.social_links || {},
        pricing_list_url: req.body.pricing_list_url || existing.pricing_list_url || '',
        promo_calendar_url: req.body.promo_calendar_url || existing.promo_calendar_url || ''
      };

      if (rows[0]) {
        await query(
          `UPDATE brand_assets
           SET logos=$1, style_guides=$2, brand_notes=$3, website_admin_email=$4, ga_emails=$5, meta_bm_email=$6,
               social_links=$7, pricing_list_url=$8, promo_calendar_url=$9, updated_at=NOW()
           WHERE user_id=$10`,
          [
            JSON.stringify(payload.logos),
            JSON.stringify(payload.style_guides),
            payload.brand_notes,
            payload.website_admin_email,
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
          `INSERT INTO brand_assets (user_id, logos, style_guides, brand_notes, website_admin_email, ga_emails, meta_bm_email, social_links, pricing_list_url, promo_calendar_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            targetUserId,
            JSON.stringify(payload.logos),
            JSON.stringify(payload.style_guides),
            payload.brand_notes,
            payload.website_admin_email,
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
  await query('UPDATE documents SET review_status=$1, viewed_at=NOW() WHERE id=$2 AND user_id=$3', [
    'viewed',
    req.params.id,
    targetUserId
  ]);
  res.json({ message: 'Marked viewed' });
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
    ctm_api_secret
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
    clientId
  ];
  if (exists.rows.length) {
    await query(
      `UPDATE client_profiles
         SET looker_url=$1,monday_board_id=$2,monday_group_id=$3,monday_active_group_id=$4,monday_completed_group_id=$5,
             client_identifier_value=$6, account_manager_person_id=$7, ai_prompt=$8, ctm_account_number=$9, ctm_api_key=$10, ctm_api_secret=$11, updated_at=NOW()
       WHERE user_id=$12`,
      params
    );
  } else {
    await query(
      `INSERT INTO client_profiles (looker_url,monday_board_id,monday_group_id,monday_active_group_id,monday_completed_group_id,client_identifier_value,account_manager_person_id,ai_prompt,ctm_account_number,ctm_api_key,ctm_api_secret,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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

router.post('/requests', async (req, res) => {
  const { title, description, due_date, rush, person_override } = req.body || {};
  try {
    const settings = await getMondaySettings({ includeToken: true });
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
      rush: !!rush,
      hasBoard: !!profile.monday_board_id,
      hasGroup: !!profile.monday_group_id
    });

    let mondayItem = null;
    if (settings.monday_token && profile.monday_board_id && profile.monday_group_id) {
      const columnValues = buildRequestColumnValues({
        settings,
        profile,
        form: { due_date, rush, person_override }
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
    } else {
      logEvent('requests:create', 'skipping monday submission (missing config)', {
        user: targetUserId,
        hasToken: !!settings.monday_token,
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
        due_date || null,
        !!rush,
        person_override || null,
        mondayItem ? 'submitted' : 'pending',
        mondayItem?.id || null,
        profile.monday_board_id || null
      ]
    );
    logEvent('requests:create', 'request stored', { user: targetUserId, requestId: rows[0]?.id, mondayItemId: mondayItem?.id || null });
    res.json({ request: rows[0], monday_item: mondayItem });
  } catch (err) {
    console.error('[requests:create]', err);
    logEvent('requests:create', 'failed', { message: err.message, stack: err.stack });
    res.status(500).json({ message: err.message || 'Unable to submit request' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const settings = await getMondaySettings({ includeToken: true });
    const targetUserId = req.portalUserId || req.user.id;
    const profile = (await query(`SELECT * FROM client_profiles WHERE user_id = $1`, [targetUserId])).rows[0] || {};
    const local = (await query('SELECT * FROM requests WHERE user_id=$1 ORDER BY created_at DESC', [targetUserId])).rows;

    if (settings.monday_token && profile.monday_board_id) {
      const groupIds = [profile.monday_active_group_id, profile.monday_completed_group_id].filter(Boolean);
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
      return res.json({
        requests: local,
        tasks,
        group_meta: {
          active_group_id: profile.monday_active_group_id || null,
          completed_group_id: profile.monday_completed_group_id || null
        }
      });
    }

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
    res.status(500).json({ message: 'Unable to fetch requests' });
  }
});

router.get('/calls', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  const cached = await query('SELECT * FROM call_logs WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST', [targetUserId]);
  const cachedCalls = buildCallsFromCache(cached.rows);

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
    const message = 'CallTrackingMetrics credentials not configured for this client.';
    if (cachedCalls.length) {
      return res.status(400).json({ calls: cachedCalls, stale: true, message });
    }
    return res.status(400).json({ message });
  }

  try {
    const freshCalls = await pullCallsFromCtm({
      credentials,
      prompt: profile.ai_prompt || DEFAULT_AI_PROMPT,
      existingRows: cached.rows
    });

    if (freshCalls.length) {
      await Promise.all(
        freshCalls.map(({ call, meta }) => {
          const startedAt = call.started_at ? new Date(call.started_at) : null;
          return query(
            `INSERT INTO call_logs (user_id, call_id, direction, from_number, to_number, started_at, duration_sec, meta)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (call_id) DO UPDATE SET
               direction=EXCLUDED.direction,
               from_number=EXCLUDED.from_number,
               to_number=EXCLUDED.to_number,
               started_at=EXCLUDED.started_at,
               duration_sec=EXCLUDED.duration_sec,
               meta=EXCLUDED.meta`,
            [
              targetUserId,
              call.id,
              call.direction || null,
              call.caller_number || null,
              call.to_number || null,
              startedAt,
              call.duration_sec || null,
              JSON.stringify(meta || {})
            ]
          );
        })
      );
    }

    const refreshed = await query('SELECT * FROM call_logs WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST', [targetUserId]);
    return res.json({ calls: buildCallsFromCache(refreshed.rows) });
  } catch (err) {
    console.error('[calls:list]', err);
    const message = err?.message || 'Unable to fetch latest calls. Showing cached data.';
    if (cachedCalls.length) {
      return res.status(502).json({ calls: cachedCalls, stale: true, message });
    }
    return res.status(502).json({ message });
  }
});

router.post('/calls/:id/score', async (req, res) => {
  const score = Number(req.body.score);
  const targetUserId = req.portalUserId || req.user.id;
  await query('UPDATE call_logs SET score=$1 WHERE call_id=$2 AND user_id=$3', [score, req.params.id, targetUserId]);
  res.json({ message: 'Score saved' });
});

router.delete('/calls/:id/score', async (req, res) => {
  const targetUserId = req.portalUserId || req.user.id;
  await query('UPDATE call_logs SET score=NULL WHERE call_id=$1 AND user_id=$2', [req.params.id, targetUserId]);
  res.json({ message: 'Score cleared' });
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
    'monday_token',
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
  await saveMondaySettings(incoming);
  const sanitized = await getMondaySettings();
  res.json({ settings: sanitized });
});

router.get('/monday/boards', isAdminOrEditor, async (req, res) => {
  try {
    const settings = await getMondaySettings({ includeToken: true });
    const boards = await listBoards(settings);
    res.json({ success: true, boards });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Unable to load boards' });
  }
});

router.get('/monday/boards/:boardId/groups', isAdminOrEditor, async (req, res) => {
  try {
    const settings = await getMondaySettings({ includeToken: true });
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
    const settings = await getMondaySettings({ includeToken: true });
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
    const settings = await getMondaySettings({ includeToken: true });
    const people = await listPeople(settings);
    const shaped = Array.isArray(people)
      ? people.filter((p) => p && p.id && p.name).map((p) => ({ id: String(p.id), name: p.name, email: p.email }))
      : [];
    res.json({ success: true, people: shaped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Unable to load people' });
  }
});

export default router;
